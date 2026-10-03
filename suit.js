/**
 * suit.js — 파워 슈트(레드·골드 장갑) 착용 연출 + 슈트 HUD
 *
 * ※ 외부 이미지/에셋 없이 캔버스 도형만으로 그린 "원본 디자인"입니다.
 *
 * 동작
 *  1) 몸(포즈) 랜드마크로 어깨·팔꿈치·손목·머리 위치를 구해 장갑 부품을 그린다.
 *  2) setOn(true) → 부품(가슴 → 어깨 → 양팔 → 헬멧)이 화면 밖에서 날아와 순서대로 조립된다.
 *  3) setOn(false) → 역순으로 분리되어 날아간다.
 *  4) 조립이 끝나면 청록색 HUD(텔레메트리, 헬멧 락온, 손 조준 링)가 켜진다.
 */
import { CONFIG } from './config.js';
import { getSprite } from './particles.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const mix = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
const add = (a, v, k = 1) => ({ x: a.x + v.x * k, y: a.y + v.y * k });
const unit = (a, b) => {
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
};
const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

// 색상 프리셋 도우미
function getSuitColors() {
  const pKey = (CONFIG.suit && CONFIG.suit.preset) || 'mark85';
  return (CONFIG.suitPresets && CONFIG.suitPresets[pKey]) || {
    redHi: '#ff5a45',
    red: '#d0202e',
    redLo: '#7d0f1c',
    goldHi: '#ffe08a',
    gold: '#e6b230',
    goldLo: '#9a6b10',
    cyan: '120,230,255',
  };
}

// 조립 타임라인(내부 시간 단위, 총 T). 실제 길이는 CONFIG.suit.assembleSec로 배속 조절
const T = 1.6;
const PARTS = {
  chest: { delay: 0.0, dur: 0.55 },
  shoulders: { delay: 0.25, dur: 0.55 },
  armA: { delay: 0.4, dur: 0.6 },
  armB: { delay: 0.5, dur: 0.6 },
  helmet: { delay: 1.0, dur: 0.6 },
};

export class SuitRenderer {
  constructor() {
    this.t = 0; // 조립 진행 시간 (0 ~ T)
    this.target = false; // 켜는 중/켜짐 = true
    this.sm = null; // 보정된 포즈 좌표
    this.g = null; // 이번 프레임 기하 정보
    this.lastPoseAt = -1e9;
    this.poseOk = false;
    this.vis = 0; // 몸이 보일 때 1 (표시 투명도)
    this.hudAlpha = 0;
    this.faceOpen = 0;
    this.faceTarget = 0;
    this.flash = 0;
    this.landed = {};
    this.landEvents = [];
    this.call = { p: 0, pos: null };
  }

  /** 부품이 하나라도 그려지는 상태인가 */
  get active() {
    return this.t > 0;
  }
  /** 조립이 모두 끝난 상태인가 */
  get online() {
    return this.target && this.t >= T - 0.001;
  }

  setOn(on) {
    this.target = !!on;
    if (on) this.landed = {};
  }
  setFaceOpen(open) {
    this.faceTarget = open ? 1 : 0;
  }
  get faceIsOpen() {
    return this.faceTarget === 1;
  }
  /** 좌우 반전 변경 등으로 좌표계가 바뀔 때 보정 이력 초기화 */
  resetTracking() {
    this.sm = null;
    this.g = null;
  }
  /** 두 주먹 호출 진행률(0~1)과 표시 위치 */
  setCall(p, pos) {
    this.call.p = p;
    this.call.pos = pos;
  }
  /** 부품이 장착된 순간의 위치 목록(불꽃 효과용)을 꺼낸다 */
  consumeLands() {
    const l = this.landEvents;
    this.landEvents = [];
    return l;
  }

  _prog(name) {
    const d = PARTS[name];
    return clamp((this.t - d.delay) / d.dur, 0, 1);
  }

  /* ---------------- 갱신 ---------------- */

  /**
   * @param {Array|null} poseLm 포즈 랜드마크(정규화) 또는 null
   */
  update(poseLm, W, H, mirror, dt, now) {
    const speed = T / Math.max(0.5, CONFIG.suit.assembleSec);
    this.t = clamp(this.t + dt * speed * (this.target ? 1 : -1.4), 0, T);
    this.faceOpen += (this.faceTarget - this.faceOpen) * Math.min(1, dt * 6);
    const hudTarget = (CONFIG.suit.hudEnabled !== false && this.online) ? 1 : 0;
    this.hudAlpha += (hudTarget - this.hudAlpha) * Math.min(1, dt * 4);
    this.flash = Math.max(0, this.flash - dt * 2);

    if (!this.active) {
      this.sm = null;
      this.g = null;
      this.vis = 0;
      this.flash = 0;
      this.landed = {};
      return;
    }

    if (poseLm) {
      const k = clamp(CONFIG.suit.smoothing, 0.1, 1);
      const pts = poseLm.map((p) => ({
        x: (mirror ? 1 - p.x : p.x) * W,
        y: p.y * H,
        v: p.visibility === undefined ? 1 : p.visibility,
      }));
      if (!this.sm) this.sm = pts.map((p) => ({ ...p }));
      else {
        for (let i = 0; i < pts.length; i++) {
          this.sm[i].x += (pts[i].x - this.sm[i].x) * k;
          this.sm[i].y += (pts[i].y - this.sm[i].y) * k;
          this.sm[i].v = pts[i].v;
        }
      }
      this.lastPoseAt = now;
    }

    this.poseOk = !!this.sm && now - this.lastPoseAt < CONFIG.suit.lostMs && this.sm[11].v > 0.5 && this.sm[12].v > 0.5;
    this.vis += ((this.poseOk ? 1 : 0) - this.vis) * Math.min(1, dt * 6);
    this.g = this.sm ? this._geometry() : null;

    // 부품 장착 순간 감지 → 불꽃 이벤트
    if (this.g) {
      const g = this.g;
      const centers = { chest: g.chestC, shoulders: g.sm, armA: g.arms[0].E, armB: g.arms[1].E, helmet: g.hc };
      for (const name of Object.keys(PARTS)) {
        const done = this._prog(name) >= 1;
        if (done && this.target && !this.landed[name]) {
          this.landed[name] = true;
          this.landEvents.push({ x: centers[name].x, y: centers[name].y, size: g.sw * 0.5, name });
          if (name === 'helmet') this.flash = 0.8;
        } else if (!done) {
          this.landed[name] = false;
        }
      }
    }
  }

  /** 포즈 → 그리기용 기하 정보 */
  _geometry() {
    const P = this.sm;
    const S1 = P[11];
    const S2 = P[12];
    const sw = Math.max(40, dist(S1, S2)) * (CONFIG.suit.scale || 1.0);
    const sm = mid(S1, S2);
    const u = unit(S1, S2); // 어깨선 방향
    let down = { x: -u.y, y: u.x };
    if (down.y < 0) down = { x: -down.x, y: -down.y };

    const hipsOk = P[23].v > 0.4 && P[24].v > 0.4;
    const H1 = hipsOk ? P[23] : add(S1, down, sw * 1.5);
    const H2 = hipsOk ? P[24] : add(S2, down, sw * 1.5);
    const hipM = mid(H1, H2);

    const earsOk = P[7].v > 0.3 && P[8].v > 0.3;
    const pa = earsOk ? P[7] : P[2];
    const pb = earsOk ? P[8] : P[5];
    const left = pa.x < pb.x ? pa : pb;
    const right = pa.x < pb.x ? pb : pa;
    const ang = Math.atan2(right.y - left.y, right.x - left.x);
    let hw = dist(left, right) * (earsOk ? 1 : 2.2);
    hw = Math.max(hw, sw * 0.3);
    const hc0 = mid(left, right);
    const hc = { x: hc0.x + Math.sin(ang) * hw * 0.1, y: hc0.y - Math.cos(ang) * hw * 0.1 };

    const arm = (S, E, W) => ({ S, E, W, eOk: E.v > 0.3, wOk: E.v > 0.3 && W.v > 0.3 });

    return {
      sw,
      sm,
      u,
      down,
      S1,
      S2,
      H1,
      H2,
      hipM,
      neck: add(sm, down, -sw * 0.12),
      chestL: mix(S1, H1, 0.52),
      chestR: mix(S2, H2, 0.52),
      chestC: mix(sm, hipM, 0.35),
      reactor: mix(sm, hipM, 0.26),
      out: [unit(sm, S1), unit(sm, S2)],
      hc,
      hw,
      ang,
      arms: [arm(P[11], P[13], P[15]), arm(P[12], P[14], P[16])],
    };
  }

  /* ---------------- 그리기: 슈트 ---------------- */

  draw(ctx, W, H, now) {
    if (!this.active || !this.g || this.vis < 0.02) return;
    const g = this.g;
    const wrap = (name, center, offset, fn) => {
      const p = this._prog(name);
      if (p <= 0) return;
      const e = easeOutBack(p);
      ctx.save();
      ctx.globalAlpha = this.vis * Math.min(1, p * 2.2);
      ctx.translate(offset.x * (1 - e), offset.y * (1 - e));
      const s = 0.82 + 0.18 * Math.min(1, e);
      ctx.translate(center.x, center.y);
      ctx.scale(s, s);
      ctx.translate(-center.x, -center.y);
      fn();
      ctx.restore();
    };

    wrap('armA', g.arms[0].E, { x: g.out[0].x * W * 0.6, y: H * 0.1 }, () => this._drawArm(ctx, g, g.arms[0]));
    wrap('armB', g.arms[1].E, { x: g.out[1].x * W * 0.6, y: H * 0.1 }, () => this._drawArm(ctx, g, g.arms[1]));
    wrap('chest', g.chestC, { x: 0, y: H * 0.7 }, () => {
      this._drawChest(ctx, g);
      this._drawReactor(ctx, g, now);
    });
    wrap('shoulders', g.sm, { x: 0, y: -H * 0.5 }, () => {
      this._drawPauldron(ctx, g, g.S1, g.out[0]);
      this._drawPauldron(ctx, g, g.S2, g.out[1]);
    });
    wrap('helmet', g.hc, { x: 0, y: -H * 0.9 }, () => this._drawHelmet(ctx, g));
  }

  _drawChest(ctx, g) {
    const C = getSuitColors();
    const { S1, S2, u, down, sw, neck, chestL, chestR, H1, H2 } = g;

    const a1 = add(S1, u, sw * 0.12);
    const a2 = add(S2, u, -sw * 0.12);
    const c1 = add(chestL, u, sw * 0.12);
    const c2 = add(chestR, u, -sw * 0.12);
    const nk1 = add(neck, u, -sw * 0.22);
    const nk2 = add(neck, u, sw * 0.22);
    const b = add(mid(c1, c2), down, sw * 0.16);

    // 1. 복부 (나노 카본 아머 4단 복근 띠)
    const h1 = add(H1, u, sw * 0.2);
    const h2 = add(H2, u, -sw * 0.2);
    for (let i = 0; i < 4; i++) {
      const t0 = i / 4;
      const t1 = (i + 1) / 4;
      const l0 = mix(c1, h1, t0);
      const r0 = mix(c2, h2, t0);
      const l1 = mix(c1, h1, t1);
      const r1 = mix(c2, h2, t1);

      const gr = ctx.createLinearGradient(l0.x, l0.y, r1.x, r1.y);
      gr.addColorStop(0, C.goldHi);
      gr.addColorStop(0.3, C.gold);
      gr.addColorStop(0.7, i % 2 === 0 ? C.goldLo : '#281a05');
      gr.addColorStop(1, C.goldLo);

      ctx.beginPath();
      ctx.moveTo(l0.x, l0.y);
      ctx.lineTo(r0.x, r0.y);
      ctx.lineTo(r1.x, r1.y);
      ctx.lineTo(l1.x, l1.y);
      ctx.closePath();
      ctx.fillStyle = gr;
      ctx.fill();
      ctx.lineWidth = sw * 0.015;
      ctx.strokeStyle = '#0e0508';
      ctx.stroke();
    }

    // 2. 메인 가슴 플레이트 (아이언맨 흉갑 입체 음영)
    const grChest = ctx.createLinearGradient(g.sm.x - sw * 0.4, g.sm.y, g.hipM.x + sw * 0.4, g.hipM.y);
    grChest.addColorStop(0, C.redHi);
    grChest.addColorStop(0.25, C.red);
    grChest.addColorStop(0.65, C.redLo);
    grChest.addColorStop(1, '#20050c');

    ctx.beginPath();
    ctx.moveTo(a1.x, a1.y);
    ctx.lineTo(nk1.x, nk1.y);
    ctx.lineTo(nk2.x, nk2.y);
    ctx.lineTo(a2.x, a2.y);
    ctx.lineTo(c2.x, c2.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c1.x, c1.y);
    ctx.closePath();
    ctx.fillStyle = grChest;
    ctx.fill();

    // 메탈릭 골드 입체 외곽선 (쇄골 테두리)
    ctx.lineJoin = 'miter';
    ctx.lineWidth = sw * 0.038;
    ctx.strokeStyle = C.gold;
    ctx.stroke();

    ctx.lineWidth = sw * 0.012;
    ctx.strokeStyle = C.goldHi;
    ctx.stroke();

    // 쇄골 골드 덮개 플레이트
    const collarL = mix(S1, nk1, 0.5);
    const collarR = mix(S2, nk2, 0.5);
    ctx.beginPath();
    ctx.moveTo(S1.x, S1.y);
    ctx.lineTo(collarL.x, collarL.y);
    ctx.lineTo(g.chestC.x, g.chestC.y - sw * 0.1);
    ctx.lineTo(collarR.x, collarR.y);
    ctx.lineTo(S2.x, S2.y);
    ctx.lineWidth = sw * 0.025;
    ctx.strokeStyle = C.goldHi;
    ctx.stroke();

    // 가슴 패널 홈
    const nm = mid(nk1, nk2);
    ctx.beginPath();
    ctx.moveTo(nm.x, nm.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineWidth = sw * 0.018;
    ctx.strokeStyle = C.goldLo;
    ctx.stroke();
  }

  _drawReactor(ctx, g, now) {
    const C = getSuitColors();
    const R = g.reactor;
    const r = g.sw * 0.095;
    const cyan = C.cyan || '120,230,255';
    const pulse = 0.85 + 0.15 * Math.sin(now / 220);

    // 베젤 배경
    ctx.beginPath();
    ctx.arc(R.x, R.y, r * 1.75, 0, TAU);
    ctx.fillStyle = '#0a0d16';
    ctx.fill();

    // 골드 링
    ctx.lineWidth = r * 0.28;
    ctx.strokeStyle = C.gold;
    ctx.stroke();
    ctx.lineWidth = r * 0.08;
    ctx.strokeStyle = C.goldHi;
    ctx.stroke();

    // 회전하는 톱니 터빈
    const rot = now / 1200;
    ctx.save();
    ctx.translate(R.x, R.y);
    ctx.rotate(rot);
    ctx.lineWidth = r * 0.12;
    ctx.strokeStyle = C.goldHi;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15);
      ctx.lineTo(Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.5);
      ctx.stroke();
    }
    ctx.restore();

    // 아크 코어 발광
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= 0.95 * pulse;
    ctx.drawImage(getSprite(cyan), R.x - r * 3.5, R.y - r * 3.5, r * 7, r * 7);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(R.x, R.y, r * 0.72, 0, TAU);
    ctx.fillStyle = '#f2ffff';
    ctx.fill();
  }

  _drawPauldron(ctx, g, S, out) {
    const C = getSuitColors();
    const r = g.sw * 0.24;
    const c = { x: S.x + out.x * g.sw * 0.04, y: S.y + out.y * g.sw * 0.04 - g.sw * 0.02 };

    const gr = ctx.createRadialGradient(c.x - r * 0.35, c.y - r * 0.4, r * 0.08, c.x, c.y, r);
    gr.addColorStop(0, C.redHi);
    gr.addColorStop(0.55, C.red);
    gr.addColorStop(1, C.redLo);

    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, TAU);
    ctx.fillStyle = gr;
    ctx.fill();

    ctx.lineWidth = r * 0.16;
    ctx.strokeStyle = C.gold;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(c.x, c.y, r * 0.62, 0, TAU);
    ctx.lineWidth = r * 0.07;
    ctx.strokeStyle = C.goldHi;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(c.x, c.y, r * 0.16, 0, TAU);
    ctx.fillStyle = C.goldHi;
    ctx.fill();
  }

  /** 두 점 사이를 장갑 캡슐로 그린다 */
  _capsule(ctx, a, b, w) {
    const C = getSuitColors();
    const d = unit(a, b);
    const n = { x: -d.y, y: d.x };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const line = (off, lw, style) => {
      ctx.beginPath();
      ctx.moveTo(a.x + n.x * off, a.y + n.y * off);
      ctx.lineTo(b.x + n.x * off, b.y + n.y * off);
      ctx.lineWidth = lw;
      ctx.strokeStyle = style;
      ctx.stroke();
    };

    line(0, w * 1.25, C.gold);
    line(0, w, C.red);
    line(w * 0.25, w * 0.3, 'rgba(0,0,0,0.5)'); // 그림자 면
    line(-w * 0.22, w * 0.22, C.redHi); // 하이라이트

    const m = mid(a, b);
    ctx.beginPath();
    ctx.moveTo(m.x + n.x * w * 0.55, m.y + n.y * w * 0.55);
    ctx.lineTo(m.x - n.x * w * 0.55, m.y - n.y * w * 0.55);
    ctx.lineWidth = w * 0.12;
    ctx.strokeStyle = C.goldHi;
    ctx.stroke();
  }

  _drawArm(ctx, g, arm) {
    const C = getSuitColors();
    if (!arm.eOk) return;
    const w1 = g.sw * 0.24;
    const w2 = g.sw * 0.2;
    this._capsule(ctx, arm.S, arm.E, w1);
    if (arm.wOk) this._capsule(ctx, arm.E, arm.W, w2);

    // 팔꿈치 관절
    ctx.beginPath();
    ctx.arc(arm.E.x, arm.E.y, w2 * 0.68, 0, TAU);
    ctx.fillStyle = C.gold;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(arm.E.x, arm.E.y, w2 * 0.36, 0, TAU);
    ctx.fillStyle = C.redLo;
    ctx.fill();

    // 손목 건틀릿
    if (arm.wOk) {
      ctx.beginPath();
      ctx.arc(arm.W.x, arm.W.y, w2 * 0.85, 0, TAU);
      ctx.fillStyle = C.gold;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(arm.W.x, arm.W.y, w2 * 0.55, 0, TAU);
      ctx.fillStyle = C.red;
      ctx.fill();

      // 리펄서 손바닥 발광 포트
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(getSprite(C.cyan || '120,230,255'), arm.W.x - w2 * 0.8, arm.W.y - w2 * 0.8, w2 * 1.6, w2 * 1.6);
      ctx.restore();
    }
  }

  _drawHelmet(ctx, g) {
    const C = getSuitColors();
    const u = g.hw;
    const open = this.faceOpen;
    const cyan = C.cyan || '120,230,255';

    ctx.save();
    ctx.translate(g.hc.x, g.hc.y);
    ctx.rotate(g.ang);

    // 1. 헬멧 외곽 돔 및 턱 캡 (아이언맨 붉은 헬멧 쉘)
    const yb = lerp(0.95, -0.15, open) * u;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-u * 1.35, -u * 1.45, u * 2.7, u * 1.45 + yb);
    ctx.clip();

    const grDome = ctx.createLinearGradient(-u * 0.8, -u, u * 0.8, u * 0.8);
    grDome.addColorStop(0, C.redHi);
    grDome.addColorStop(0.45, C.red);
    grDome.addColorStop(0.85, C.redLo);
    grDome.addColorStop(1, '#1a040b');

    ctx.beginPath();
    ctx.ellipse(0, 0, u * 0.78, u * 0.95, 0, 0, TAU);
    ctx.fillStyle = grDome;
    ctx.fill();

    ctx.lineWidth = u * 0.055;
    ctx.strokeStyle = C.gold;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -u * 0.95);
    ctx.lineTo(0, -u * 0.28);
    ctx.lineWidth = u * 0.075;
    ctx.strokeStyle = C.goldHi;
    ctx.stroke();

    // 귀 분절 캡
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(sx * u * 0.76, u * 0.05, u * 0.14, 0, TAU);
      ctx.fillStyle = C.gold;
      ctx.fill();
      ctx.lineWidth = u * 0.03;
      ctx.strokeStyle = C.goldHi;
      ctx.stroke();
    }
    ctx.restore();

    // 2. 내부 기계 뺨 플레이트 (페이스플레이트 오픈 시 노출)
    if (open > 0.05) {
      ctx.save();
      ctx.fillStyle = '#161922';
      ctx.strokeStyle = C.goldLo;
      ctx.lineWidth = u * 0.03;
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.rect(sx * u * 0.15 - u * 0.2, u * 0.1, u * 0.4, u * 0.5);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // 3. 아이언맨 골드 페이스플레이트 (눈썹 및 턱선 음영)
    ctx.save();
    ctx.translate(0, -open * u * 0.98);
    ctx.globalAlpha *= 1 - 0.18 * open;

    const pgFace = ctx.createLinearGradient(0, -u * 0.6, 0, u * 0.95);
    pgFace.addColorStop(0, C.goldHi);
    pgFace.addColorStop(0.4, C.gold);
    pgFace.addColorStop(0.8, C.goldLo);
    pgFace.addColorStop(1, '#4a3306');

    // 페이스플레이트 윤곽
    ctx.beginPath();
    ctx.moveTo(-u * 0.58, -u * 0.42);
    ctx.quadraticCurveTo(0, -u * 0.62, u * 0.58, -u * 0.42);
    ctx.lineTo(u * 0.52, u * 0.15);
    ctx.lineTo(u * 0.38, u * 0.55);
    ctx.quadraticCurveTo(u * 0.25, u * 0.88, 0, u * 0.95);
    ctx.quadraticCurveTo(-u * 0.25, u * 0.88, -u * 0.38, u * 0.55);
    ctx.lineTo(-u * 0.52, u * 0.15);
    ctx.closePath();
    ctx.fillStyle = pgFace;
    ctx.fill();

    ctx.lineWidth = u * 0.04;
    ctx.strokeStyle = C.goldHi;
    ctx.stroke();

    // 이마 다이아몬드 젬
    ctx.beginPath();
    ctx.moveTo(0, -u * 0.58);
    ctx.lineTo(u * 0.08, -u * 0.48);
    ctx.lineTo(0, -u * 0.38);
    ctx.lineTo(-u * 0.08, -u * 0.48);
    ctx.closePath();
    ctx.fillStyle = C.goldHi;
    ctx.fill();

    // 4. 아이언맨 눈 슬릿 (광채 발광)
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * u * 0.44, -u * 0.08);
      ctx.lineTo(sx * u * 0.12, u * 0.02);
      ctx.lineTo(sx * u * 0.14, u * 0.12);
      ctx.lineTo(sx * u * 0.46, u * 0.02);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const sx of [-1, 1]) {
      ctx.drawImage(getSprite(cyan), sx * u * 0.28 - u * 0.35, u * 0.02 - u * 0.35, u * 0.7, u * 0.7);
    }
    ctx.restore();

    // 입 부위 슬릿
    ctx.strokeStyle = C.redLo;
    ctx.lineWidth = u * 0.03;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * u * 0.08, u * 0.56);
      ctx.lineTo(i * u * 0.08, u * 0.72);
      ctx.stroke();
    }

    ctx.restore();
    ctx.restore();
  }

  /* ---------------- 그리기: HUD ---------------- */

  /** 두 주먹 호출 진행 링 + 화면 섬광 (슈트 상태와 무관하게 항상 호출) */
  drawOverlay(ctx, W, H, now) {
    if (this.call.p > 0.02 && this.call.pos) {
      const { x, y } = this.call.pos;
      const r = W * 0.06;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(4, W / 220);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${CYAN},0.95)`;
      ctx.beginPath();
      ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * this.call.p);
      ctx.stroke();
      ctx.fillStyle = `rgba(${CYAN},0.95)`;
      ctx.font = `700 ${W / 60}px "Consolas","Courier New",monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(this.target ? 'SUIT OFF' : 'SUIT UP', x, y - r * 1.4);
      ctx.restore();
    }
    if (this.flash > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(0.2, this.flash * 0.25);
      ctx.fillStyle = `rgb(${CYAN})`;
      ctx.fillRect(-40, -40, W + 80, H + 80);
      ctx.restore();
    }
  }

  /** 슈트 HUD (조립 완료 후 페이드 인) */
  drawHud(ctx, W, H, now, hands) {
    const a = this.hudAlpha;
    if (a < 0.02) return;
    ctx.save();
    ctx.globalAlpha = a;
    const lw = Math.max(2, W / 640);
    const fs = W / 56;
    ctx.lineWidth = lw;
    ctx.strokeStyle = `rgba(${CYAN},0.85)`;
    ctx.fillStyle = `rgba(${CYAN},0.95)`;
    ctx.font = `700 ${fs}px "Consolas","Courier New",monospace`;

    // 화면 모서리 브래킷
    const m = W * 0.03;
    const L = W * 0.05;
    for (const [cx, cy, sx, sy] of [
      [m, m, 1, 1],
      [W - m, m, -1, 1],
      [m, H - m, 1, -1],
      [W - m, H - m, -1, -1],
    ]) {
      ctx.beginPath();
      ctx.moveTo(cx, cy + sy * L);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + sx * L, cy);
      ctx.stroke();
    }

    // 상단 중앙 문구
    ctx.textAlign = 'center';
    ctx.fillText('POWER ARMOR  ONLINE', W / 2, m + fs);

    // 좌측 텔레메트리 막대
    ctx.textAlign = 'left';
    const rows = [
      ['ARMOR', 1.0],
      ['POWER', 0.82 + 0.06 * Math.sin(now / 900)],
      ['REPULSOR', 0.9 + 0.08 * Math.sin(now / 500 + 1)],
      ['THRUST', 0.7 + 0.1 * Math.sin(now / 700 + 2)],
      ['SYNC', 0.95 + 0.04 * Math.sin(now / 300 + 3)],
    ];
    const bx = m + 4;
    let by = m * 2 + fs * 2;
    const bw = W * 0.12;
    for (const [label, v] of rows) {
      ctx.fillText(label, bx, by);
      ctx.strokeRect(bx, by + fs * 0.3, bw, fs * 0.35);
      ctx.fillRect(bx, by + fs * 0.3, bw * clamp(v, 0, 1), fs * 0.35);
      by += fs * 1.8;
    }

    // 헬멧 락온 링
    if (this.g && this.vis > 0.3) {
      const { hc, hw } = this.g;
      this._ring(ctx, hc.x, hc.y, hw * 1.25, now / 900, 14);
    }

    // 손 조준 링
    ctx.font = `700 ${fs * 0.8}px "Consolas","Courier New",monospace`;
    for (const h of hands || []) {
      const r = h.size * 1.15;
      this._ring(ctx, h.center.x, h.center.y, r, -now / 700, 10);
      ctx.beginPath();
      ctx.moveTo(h.center.x - r * 1.3, h.center.y);
      ctx.lineTo(h.center.x - r * 0.85, h.center.y);
      ctx.moveTo(h.center.x + r * 0.85, h.center.y);
      ctx.lineTo(h.center.x + r * 1.3, h.center.y);
      ctx.moveTo(h.center.x, h.center.y - r * 1.3);
      ctx.lineTo(h.center.x, h.center.y - r * 0.85);
      ctx.moveTo(h.center.x, h.center.y + r * 0.85);
      ctx.lineTo(h.center.x, h.center.y + r * 1.3);
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillText(h.gesture === 'open' ? 'REPULSOR' : 'STANDBY', h.center.x + r * 1.05, h.center.y - r * 0.9);
    }
    ctx.restore();
  }

  /** 회전하는 점선 링 */
  _ring(ctx, x, y, r, rot, segs) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    const gap = 0.35;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * TAU;
      const a1 = a0 + (TAU / segs) * (1 - gap);
      ctx.beginPath();
      ctx.arc(0, 0, r, a0, a1);
      ctx.stroke();
    }
    ctx.restore();
  }
}
