/**
 * effects.js — 제스처 → 효과 매핑과 효과 렌더링
 *
 * 매핑 표 (제스처 → 효과)
 *  open       손바닥에서 테마 효과가 피어오름
 *  fist       손 주변에서 에너지가 응축 (빛 덩어리 맥동)
 *  charge     펴기→오므리기: 빛이 손으로 빨려 들어감
 *  release    오므리기→펴기: 방사형 폭발 + 충격파 링
 *  pinch      핀치 지점에서 스파크
 *  point      검지 끝 궤적(빛나는 선)
 *  peace      두 손가락 끝에서 번개
 *  thumbsUp   다음 테마로 전환
 *  두 손 펴기  두 손 사이 에너지 구체 (크기 = 두 손 간격에 비례) + 손 사이 전류
 *  박수       전체 충격파 + 화면 흔들림
 *
 * 파워 슈트 모드(suitMode = true)일 때 추가/변경되는 효과
 *  open       손바닥 리펄서 충전 (청록 빛이 모이며 커짐)
 *  release    리펄서 빔 발사 (손 방향으로 길게 뻗는 광선)
 *  두 손 펴기 + 손이 화면 아래쪽  비행 모드: 손바닥에서 추진 화염 분사
 */
import { CONFIG } from './config.js';
import { THEMES } from './themes.js';
import { getSprite } from './particles.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TAU = Math.PI * 2;
const TRAIL_MS = 600;

/** 중점 변위 방식의 지그재그 번개 경로 */
function makeBolt(x0, y0, x1, y1, jag) {
  const pts = [{ x: x0, y: y0 }];
  const segs = 9;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    const off = (Math.random() - 0.5) * jag;
    pts.push({ x: x0 + dx * t + nx * off, y: y0 + dy * t + ny * off });
  }
  pts.push({ x: x1, y: y1 });
  return pts;
}

export class EffectManager {
  /** @param {import('./particles.js').ParticleSysexport class EffectManager {
  /** @param {import('./particles.js').ParticleSystem} particles */
  constructor(particles, bannerManager) {
    this.p = particles;
    this.banner = bannerManager || null;
    this.themeIndex = 0;
    this.intensity = 1;
    this.shakeEnabled = true;
    this.onThemeChange = null;

    this.acc = new Map(); // 발생량 누적기
    this.trails = new Map(); // 슬롯별 검지 궤적
    this.bolts = [];
    this.rings = [];
    this.cores = [];
    this.hexShields = [];
    this.skyBeams = [];
    this.flash = 0;
    this.shake = 0;
    this.lastThemeAt = -1e9;
    this.orbR = 0;
    this.orbPos = null;

    // 파워 슈트 관련
    this.suitMode = false;
    this.W = 1280;
    this.H = 720;
    this.beams = [];
    this.chargeT = new Map();
  }

  /** 캔버스 크기 (비행 모드 판정, 빔 길이에 사용) */
  setBounds(W, H) {
    this.W = W;
    this.H = H;
  }

  setSuitMode(on) {
    this.suitMode = !!on;
    this.chargeT.clear();
    if (on && this.banner) {
      this.banner.checkTrigger('suit_on', performance.now());
    }
  }

  /** 외부(슈트 조립 등)에서 불꽃 폭발을 일으킨다 */
  burstAt(x, y, count, size) {
    this._burst(x, y, Math.round(count * this.intensity), 200, 620, clamp(size / 110, 0.6, 2.2));
  }

  get theme() {
    return THEMES[this.themeIndex];
  }

  setTheme(i) {
    const n = THEMES.length;
    this.themeIndex = ((Math.round(i) % n) + n) % n;
    if (this.onThemeChange) this.onThemeChange(this.themeIndex);
  }

  setIntensity(v) {
    this.intensity = clamp(Number(v) || 1, 0.3, 2.5);
  }

  /** 화면 흔들림 오프셋 (px) */
  shakeOffset() {
    if (!this.shakeEnabled || this.shake <= 0.01) return { x: 0, y: 0 };
    const a = this.shake * 18;
    return { x: rand(-a, a), y: rand(-a, a) };
  }

  /* ---------------- 갱신 ---------------- */

  update(frame, dt, now, poseMotion) {
    this.cores.length = 0;
    this.hexShields.length = 0;
    this.skyBeams.length = 0;

    for (const ev of frame.events) this._handleEvent(ev, now);
    for (const h of frame.hands) this._handleHand(h, dt, now);
    this._handleTwo(frame.two, dt);
    this._handlePoseMotion(poseMotion, dt, now);

    if (this.banner) {
      this.banner.update(now);
    }
    this._decay(dt, now);
  }

  _handlePoseMotion(poseMotion, dt, now) {
    if (!poseMotion) return;
    if (poseMotion === 'x_shield') {
      this.hexShields.push({ x: this.W / 2, y: this.H * 0.45, r: 180, alpha: 0.8 });
    } else if (poseMotion === 'sky_strike') {
      const n = this._rate('sky', 25, dt);
      for (let i = 0; i < n; i++) {
        const rx = rand(this.W * 0.2, this.W * 0.8);
        this.skyBeams.push({ x: rx, w: rand(15, 35), alpha: rand(0.6, 0.95) });
        this._burst(rx, this.H * 0.85, 20, 200, 600, 1.2);
      }
      this.shake = Math.max(this.shake, 0.25);
    }
  }

  /** 초당 perSec개 비율로 정수 개수를 뽑는 누적기 */
  _rate(key, perSec, dt) {
    const a = (this.acc.get(key) || 0) + perSec * dt * this.intensity;
    const n = Math.floor(a);
    this.acc.set(key, a - n);
    return n;
  }

  /** 테마에 맞는 기본 파티클 1개 */
  _flame(x, y, sc) {
    const t = this.theme;
    const angle = t.gravity < 0 ? -Math.PI / 2 + rand(-0.6, 0.6) : rand(0, TAU);
    const sp = rand(30, 130) * sc;
    this.p.emit({
      x,
      y,
      vx: Math.cos(angle) * sp,
      vy: Math.sin(angle) * sp,
      life: rand(t.life[0], t.life[1]),
      size: rand(t.size[0], t.size[1]) * sc,
      rgb: pick(t.palette),
      gravity: t.gravity,
      jitter: t.jitter,
      drag: 0.97,
    });
  }

  /** 방사형 폭발 */
  _burst(x, y, count, vMin, vMax, sc) {
    const t = this.theme;
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const sp = rand(vMin, vMax);
      this.p.emit({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.5, 1.2),
        size: rand(t.size[0], t.size[1]) * sc,
        rgb: pick(t.palette),
        gravity: t.gravity * 0.5,
        jitter: t.jitter * 0.5,
        drag: 0.94,
      });
    }
  }

  /** 리펄서 빔: 손 방향으로 길게 뻗는 광선 + 입자 */
  _fireBeam(ev) {
    const len = Math.max(this.W, this.H) * 1.6;
    this.beams.push({ x: ev.x, y: ev.y, dx: ev.dir.x, dy: ev.dir.y, life: 0.5, maxLife: 0.5, w: ev.size * 0.8 });
    const sc = clamp(ev.size / 110, 0.6, 2.2);
    for (let i = 0; i < 36; i++) {
      const d = rand(0, len * 0.6);
      this.p.emit({
        x: ev.x + ev.dir.x * d,
        y: ev.y + ev.dir.y * d,
        vx: rand(-90, 90),
        vy: rand(-90, 90),
        life: rand(0.25, 0.6),
        size: rand(4, 10) * sc,
        rgb: pick(['120,230,255', '255,255,255', '80,180,255']),
        drag: 0.93,
      });
    }
    this._addRing(ev.x, ev.y, ev.size * 0.3, 620, 0.5, 6);
    this.shake = Math.max(this.shake, 0.5);
    this.flash = Math.max(this.flash, 0.25);
  }

  _addRing(x, y, r0, speed, life, w) {
    this.rings.push({ x, y, r: r0, speed, life, maxLife: life, w });
  }

  _handleEvent(ev, now) {
    const t = this.theme;
    const sc = clamp((ev.size || 100) / 110, 0.6, 2.2);

    if (this.banner) {
      if (ev.type === 'clap') this.banner.checkTrigger('clap', now);
      else if (ev.type === 'heart') this.banner.checkTrigger('heart', now);
      else if (ev.gesture) this.banner.checkTrigger(ev.gesture, now);
    }

    switch (ev.type) {
      case 'enter':
        if (ev.gesture === 'thumbsUp' && now - this.lastThemeAt > CONFIG.gesture.themeCooldownMs) {
          this.lastThemeAt = now;
          this.setTheme(this.themeIndex + 1);
          this.flash = Math.max(this.flash, 0.25);
        }
        break;
      case 'heart': {
        this._burst(ev.x, ev.y, Math.round(60 * this.intensity), 150, 450, sc);
        this._addRing(ev.x, ev.y, ev.size * 0.3, 450, 0.6, 6);
        this.flash = Math.max(this.flash, 0.3);

        for (let i = 0; i < 35; i++) {
          const a = rand(0, TAU);
          const sp = rand(60, 260);
          this.p.emit({
            x: ev.x,
            y: ev.y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp - 50,
            life: rand(0.6, 1.2),
            size: rand(8, 18) * sc,
            rgb: pick(['255,90,150', '255,180,220', '255,60,130', '255,220,240']),
            drag: 0.94,
          });
        }
        break;
      }
      case 'charge': {
        const n = Math.round(50 * this.intensity);
        for (let i = 0; i < n; i++) {
          const a = rand(0, TAU);
          const r = ev.size * rand(2.2, 3.2);
          this.p.emit({
            x: ev.x + Math.cos(a) * r,
            y: ev.y + Math.sin(a) * r,
            tx: ev.x,
            ty: ev.y,
            pull: 14,
            life: rand(0.3, 0.5),
            size: rand(6, 14) * sc,
            rgb: pick(t.palette),
            drag: 0.92,
          });
        }
        break;
      }
      case 'release':
        if (this.suitMode && ev.dir) {
          this._fireBeam(ev);
          break;
        }
        this._burst(ev.x, ev.y, Math.round(90 * this.intensity), 300, 700, sc);
        this._addRing(ev.x, ev.y, ev.size * 0.4, 520, 0.6, 6);
        this.shake = Math.max(this.shake, 0.35);
        this.flash = Math.max(this.flash, 0.2);
        break;
      case 'clap':
        this._burst(ev.x, ev.y, Math.round(140 * this.intensity), 400, 1100, sc);
        this._addRing(ev.x, ev.y, 0, 1400, 0.8, 10);
        this._addRing(ev.x, ev.y, 60, 1150, 0.7, 6);
        this._addRing(ev.x, ev.y, 120, 900, 0.6, 4);
        this.shake = 1;
        this.flash = 0.55;
        break;
      default:
        break;
    }
  }

  _handleHand(h, dt, now) {
    const t = this.theme;
    const sc = clamp(h.size / 110, 0.6, 2.2);
    const c = h.center;
    if (h.gesture !== 'open') this.chargeT.set(h.slot, 0);

    switch (h.gesture) {
      case 'open': {
        if (this.suitMode) {
          // 리펄서 충전: 청록 빛이 모이며 점점 커진다
          const ct = (this.chargeT.get(h.slot) || 0) + dt;
          this.chargeT.set(h.slot, ct);
          const k = Math.min(1, ct / 0.6);
          const n = this._rate('rep' + h.slot, 60, dt);
          for (let i = 0; i < n; i++) {
            const a = rand(0, TAU);
            const r = h.size * rand(1.2, 1.8);
            this.p.emit({
              x: c.x + Math.cos(a) * r,
              y: c.y + Math.sin(a) * r,
              tx: c.x,
              ty: c.y,
              pull: 10,
              life: 0.35,
              size: rand(3, 7) * sc,
              rgb: pick(['120,230,255', '255,255,255', '80,180,255']),
              drag: 0.93,
            });
          }
          this.cores.push({ x: c.x, y: c.y, r: h.size * (0.5 + 0.5 * k), rgb: '120,230,255', alpha: 0.5 + 0.4 * k });
          this.cores.push({ x: c.x, y: c.y, r: h.size * 0.25 * k + 4, rgb: '255,255,255', alpha: 0.85 * k });
          break;
        }
        const n = this._rate('open' + h.slot, 70, dt);
        for (let i = 0; i < n; i++) {
          const a = rand(0, TAU);
          const r = Math.sqrt(Math.random()) * h.size * 0.7;
          this._flame(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, sc);
        }
        this.cores.push({ x: c.x, y: c.y, r: h.size * 0.9, rgb: t.core, alpha: 0.35 });
        break;
      }
      case 'fist': {
        const n = this._rate('fist' + h.slot, 50, dt);
        for (let i = 0; i < n; i++) {
          const a = rand(0, TAU);
          const r = h.size * rand(1.6, 2.2);
          this.p.emit({
            x: c.x + Math.cos(a) * r,
            y: c.y + Math.sin(a) * r,
            tx: c.x,
            ty: c.y,
            pull: 6,
            life: 0.5,
            size: rand(4, 9) * sc,
            rgb: pick(t.palette),
            drag: 0.95,
          });
        }
        const pulse = 0.7 + 0.15 * Math.sin(now / 90);
        this.cores.push({ x: c.x, y: c.y, r: h.size * pulse, rgb: t.core, alpha: 0.8 });
        this.cores.push({ x: c.x, y: c.y, r: h.size * pulse * 0.4, rgb: '255,255,255', alpha: 0.7 });
        break;
      }
      case 'pinch': {
        const n = this._rate('pinch' + h.slot, 40, dt);
        for (let i = 0; i < n; i++) {
          const a = rand(0, TAU);
          const sp = rand(60, 200) * sc;
          this.p.emit({
            x: h.pinch.x,
            y: h.pinch.y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            life: rand(0.25, 0.55),
            size: rand(3, 7) * sc,
            rgb: pick(t.palette),
            gravity: 200,
            drag: 0.93,
          });
        }
        this.cores.push({ x: h.pinch.x, y: h.pinch.y, r: h.size * 0.35, rgb: t.core, alpha: 0.9 });
        break;
      }
      case 'point': {
        const tip = h.tips.index;
        let arr = this.trails.get(h.slot);
        if (!arr) {
          arr = [];
          this.trails.set(h.slot, arr);
        }
        arr.push({ x: tip.x, y: tip.y, t: now });
        if (arr.length > 60) arr.shift();
        const n = this._rate('point' + h.slot, 30, dt);
        for (let i = 0; i < n; i++) this._flame(tip.x, tip.y, sc * 0.5);
        break;
      }
      case 'peace': {
        const n = this._rate('bolt' + h.slot, 14, dt);
        for (let i = 0; i < n; i++) {
          for (const tip of [h.tips.index, h.tips.middle]) {
            const base = Math.atan2(tip.y - c.y, tip.x - c.x) + rand(-0.5, 0.5);
            const len = h.size * rand(2.5, 4.5);
            this.bolts.push({
              pts: makeBolt(tip.x, tip.y, tip.x + Math.cos(base) * len, tip.y + Math.sin(base) * len, h.size * 0.7),
              life: 0.14,
              maxLife: 0.14,
              w: 2.5,
            });
            this.p.emit({
              x: tip.x,
              y: tip.y,
              vx: rand(-80, 80),
              vy: rand(-80, 80),
              life: 0.3,
              size: rand(5, 10) * sc,
              rgb: t.bolt,
              drag: 0.9,
            });
          }
        }
        break;
      }
      case 'finger_3': {
        const n = this._rate('f3' + h.slot, 45, dt);
        for (let i = 0; i < n; i++) {
          const a = rand(0, TAU);
          const r = h.size * rand(0.9, 1.4);
          this.p.emit({
            x: c.x + Math.cos(a) * r,
            y: c.y + Math.sin(a) * r,
            vx: rand(-60, 60),
            vy: rand(-60, 60),
            life: rand(0.3, 0.6),
            size: rand(5, 11) * sc,
            rgb: pick(['255,200,80', '255,230,120', '255,255,255']),
            drag: 0.94,
          });
        }
        this._addRing(c.x, c.y, h.size * 0.6, 250, 0.4, 4);
        this.cores.push({ x: c.x, y: c.y, r: h.size * 0.85, rgb: '255,190,80', alpha: 0.75 });
        break;
      }
      case 'finger_4': {
        const n = this._rate('f4' + h.slot, 40, dt);
        for (let i = 0; i < n; i++) {
          const a = rand(0, TAU);
          const r = h.size * rand(1.1, 1.6);
          this.p.emit({
            x: c.x + Math.cos(a) * r,
            y: c.y + Math.sin(a) * r,
            vx: rand(-40, 40),
            vy: rand(-40, 40),
            life: rand(0.3, 0.6),
            size: rand(4, 9) * sc,
            rgb: pick(['120,230,255', '80,180,255', '255,255,255']),
            drag: 0.95,
          });
        }
        this.hexShields.push({ x: c.x, y: c.y, r: h.size * 1.45, alpha: 0.85 });
        break;
      }
      default:
        break;
    }
  }

  _handleTwo(two, dt) {
    const t = this.theme;

    // 비행 모드: 슈트 착용 + 두 손 펴기 + 손이 화면 아래쪽 → 손바닥에서 추진 화염
    if (this.suitMode && two && two.bothOpen && two.mid.y > this.H * 0.58) {
      const sc = clamp(two.avgSize / 110, 0.6, 2.2);
      [two.a, two.b].forEach((hand, idx) => {
        const n = this._rate('thr' + idx, 140, dt);
        for (let i = 0; i < n; i++) {
          this.p.emit({
            x: hand.x + rand(-12, 12) * sc,
            y: hand.y,
            vx: rand(-60, 60),
            vy: rand(350, 800),
            life: rand(0.25, 0.5),
            size: rand(8, 18) * sc,
            rgb: pick(['120,230,255', '255,255,255', '255,180,90']),
            drag: 0.98,
          });
        }
        this.cores.push({ x: hand.x, y: hand.y + 10, r: two.avgSize * 0.9, rgb: '120,230,255', alpha: 0.7 });
      });
      this.shake = Math.max(this.shake, 0.12);
      this.orbR *= Math.max(0, 1 - dt * 8);
      return;
    }
    if (two && two.bothOpen) {
      const target = clamp(two.dist * 0.28, 24, 240);
      this.orbR += (target - this.orbR) * Math.min(1, dt * 10);
      this.orbPos = two.mid;

      this.cores.push({ x: two.mid.x, y: two.mid.y, r: this.orbR, rgb: t.core, alpha: 0.9 });
      this.cores.push({ x: two.mid.x, y: two.mid.y, r: this.orbR * 0.45, rgb: '255,255,255', alpha: 0.9 });

      // 구체 주위를 도는 입자 (구심력 pull=k, 접선속도 = r·√k 이면 원운동)
      const k = 9;
      const nOrbit = this._rate('orbit', 90, dt);
      for (let i = 0; i < nOrbit; i++) {
        const a = rand(0, TAU);
        const r = this.orbR * 0.9;
        const v = r * Math.sqrt(k);
        this.p.emit({
          x: two.mid.x + Math.cos(a) * r,
          y: two.mid.y + Math.sin(a) * r,
          vx: -Math.sin(a) * v,
          vy: Math.cos(a) * v,
          tx: two.mid.x,
          ty: two.mid.y,
          pull: k,
          life: 0.5,
          size: rand(3, 8),
          rgb: pick(t.palette),
          jitter: 40,
        });
      }

      // 두 손 사이 전류
      const nLink = this._rate('link', 10, dt);
      for (let i = 0; i < nLink; i++) {
        this.bolts.push({ pts: makeBolt(two.a.x, two.a.y, two.b.x, two.b.y, 50), life: 0.12, maxLife: 0.12, w: 2 });
      }
    } else {
      this.orbR *= Math.max(0, 1 - dt * 8);
      if (this.orbR > 2 && this.orbPos) {
        this.cores.push({ x: this.orbPos.x, y: this.orbPos.y, r: this.orbR, rgb: t.core, alpha: 0.6 });
      }
    }
  }

  _decay(dt, now) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      this.bolts[i].life -= dt;
      if (this.bolts[i].life <= 0) this.bolts.splice(i, 1);
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      this.beams[i].life -= dt;
      if (this.beams[i].life <= 0) this.beams.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.r += r.speed * dt;
      r.life -= dt;
      if (r.life <= 0) this.rings.splice(i, 1);
    }
    for (const arr of this.trails.values()) {
      while (arr.length && now - arr[0].t > TRAIL_MS) arr.shift();
    }
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }

  /* ---------------- 그리기 ---------------- */

  draw(ctx, W, H, now) {
    const t = this.theme;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 빛 덩어리
    for (const c of this.cores) {
      ctx.globalAlpha = c.alpha;
      ctx.drawImage(getSprite(c.rgb), c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
    }

    // 충격파 링
    for (const r of this.rings) {
      const a = r.life / r.maxLife;
      ctx.globalAlpha = a;
      ctx.strokeStyle = `rgb(${t.core})`;
      ctx.lineWidth = r.w * a + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, Math.max(0, r.r), 0, TAU);
      ctx.stroke();
    }

    // 검지 궤적
    for (const arr of this.trails.values()) {
      for (let i = 1; i < arr.length; i++) {
        const p0 = arr[i - 1];
        const p1 = arr[i];
        if (p1.t - p0.t > 120) continue; // 끊어진 구간은 잇지 않음
        const a = 1 - (now - p1.t) / TRAIL_MS;
        if (a <= 0) continue;
        ctx.globalAlpha = a;
        ctx.strokeStyle = `rgb(${t.core})`;
        ctx.lineWidth = 12 * a + 2;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3 * a;
        ctx.stroke();
      }
    }

    // 리펄서 빔
    for (const b of this.beams) {
      const a = b.life / b.maxLife;
      const len = Math.max(W, H) * 1.6;
      const x1 = b.x + b.dx * len;
      const y1 = b.y + b.dy * len;
      const stroke = (alpha, color, width) => {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      };
      stroke(a * 0.35, 'rgb(80,180,255)', b.w * 1.8);
      stroke(a * 0.8, 'rgb(150,235,255)', b.w * 0.75);
      stroke(a, '#ffffff', b.w * 0.28);
      ctx.globalAlpha = a;
      ctx.drawImage(getSprite('120,230,255'), b.x - b.w * 1.6, b.y - b.w * 1.6, b.w * 3.2, b.w * 3.2);
    }

    // 번개
    for (const b of this.bolts) {
      const a = b.life / b.maxLife;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.moveTo(b.pts[0].x, b.pts[0].y);
      for (let i = 1; i < b.pts.length; i++) ctx.lineTo(b.pts[i].x, b.pts[i].y);
      ctx.strokeStyle = `rgb(${t.bolt})`;
      ctx.lineWidth = b.w * 3;
      ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = b.w;
      ctx.stroke();
    }

    // X-Shield 쉴드 배리어 (육각형 그리드)
    for (const s of this.hexShields) {
      ctx.save();
      ctx.globalAlpha = s.alpha;
      ctx.strokeStyle = 'rgb(120, 230, 255)';
      ctx.lineWidth = 3;
      ctx.fillStyle = 'rgba(80, 200, 255, 0.15)';
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        const hx = s.x + Math.cos(a) * s.r;
        const hy = s.y + Math.sin(a) * s.r;
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Sky Strike 궤도 빔
    for (const sb of this.skyBeams) {
      ctx.save();
      ctx.globalAlpha = sb.alpha;
      const gr = ctx.createLinearGradient(sb.x, 0, sb.x, H);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.3, 'rgb(120, 230, 255)');
      gr.addColorStop(1, 'rgba(80, 180, 255, 0)');
      ctx.fillStyle = gr;
      ctx.fillRect(sb.x - sb.w / 2, 0, sb.w, H);
      ctx.restore();
    }

    ctx.restore();

    // 화면 섬광
    if (this.flash > 0.01) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.2, this.flash * 0.25);
      ctx.fillStyle = `rgb(${t.core})`;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillRect(-40, -40, W + 80, H + 80);
      ctx.restore();
    }

    // 커스텀 모션 배너 렌더링
    if (this.banner) {
      this.banner.draw(ctx, W, H, now);
    }
  }

  /** 모든 효과 초기화 (카메라 재시작 등) */
  reset() {
    this.acc.clear();
    this.trails.clear();
    this.bolts.length = 0;
    this.beams.length = 0;
    this.chargeT.clear();
    this.rings.length = 0;
    this.cores.length = 0;
    this.hexShields.length = 0;
    this.skyBeams.length = 0;
    this.flash = 0;
    this.shake = 0;
    this.orbR = 0;
    this.orbPos = null;
  }
}

