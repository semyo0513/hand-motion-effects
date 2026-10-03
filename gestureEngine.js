/**
 * gestureEngine.js — 랜드마크 → 제스처 판정, 상태 전이/두 손 이벤트 생성
 *
 * 입력 : HandTracker 결과(정규화 좌표) + 캔버스 크기
 * 출력 : { hands[], two, events[] }  (모든 좌표는 캔버스 픽셀 기준)
 *
 * 제스처 이름: open | fist | pinch | point | peace | thumbsUp | none
 * 이벤트     : enter(동작 확정) | charge(펴기→오므리기) | release(오므리기→펴기, dir=손 방향) | clap(박수)
 * 두 손      : two.bothOpen(두 손 펴기) / two.bothFist(두 주먹) / two.dist(간격)
 */
import { CONFIG } from './config.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// [손가락 끝, PIP] — 검지, 중지, 약지, 새끼
const FINGER_JOINTS = [
  [8, 6],
  [12, 10],
  [16, 14],
  [20, 18],
];

/** 손바닥 중심: 손목 + 각 손가락 MCP 평균 */
function palmCenter(pts) {
  const ids = [0, 5, 9, 13, 17];
  let x = 0;
  let y = 0;
  for (const i of ids) {
    x += pts[i].x;
    y += pts[i].y;
  }
  return { x: x / ids.length, y: y / ids.length };
}

export class GestureEngine {
  constructor() {
    this.stableFrames = CONFIG.gesture.stableFrames;
    this.slots = [this._newSlot(), this._newSlot()];
    this.palmHist = [];
    this.lastClapAt = -1e9;
    this.lastHeartAt = -1e9;
  }

  /** 인식 안정도(디바운스 프레임 수) 설정 — 1~8로 제한 */
  setStableFrames(n) {
    const v = Math.round(Number(n));
    this.stableFrames = Number.isFinite(v) ? Math.min(8, Math.max(1, v)) : CONFIG.gesture.stableFrames;
  }

  _newSlot() {
    return {
      active: false,
      last: null,
      lastSeen: 0,
      stable: 'none',
      cand: 'none',
      candCount: 0,
      lastOpenAt: -1e9,
      lastFistAt: -1e9,
    };
  }

  /** 정규화 좌표 → 캔버스 픽셀 좌표 (거울 모드면 x 반전) */
  _toPixels(lm, W, H, mirror) {
    return lm.map((p) => ({ x: (mirror ? 1 - p.x : p.x) * W, y: p.y * H }));
  }

  /** 한 손의 순간 제스처 판정 및 손가락 개수 계산 */
  _classify(pts, size) {
    const w = pts[0];
    const margin = CONFIG.gesture.fingerMargin || 1.05;
    const [i, m, r, p] = FINGER_JOINTS.map(([tip, pip]) => dist(pts[tip], w) > dist(pts[pip], w) * margin);
    const thumb = dist(pts[4], pts[17]) > size * 0.85;

    const count = (thumb ? 1 : 0) + (i ? 1 : 0) + (m ? 1 : 0) + (r ? 1 : 0) + (p ? 1 : 0);

    const pinchClose = dist(pts[4], pts[8]) < size * (CONFIG.gesture.pinchRatio || 0.28);
    if (pinchClose && (m || r || p)) return { gesture: 'pinch', count };

    // 엄지 척 (Thumbs-Up) 감지: 다른 손가락들은 접혀 있고 엄지만 위를 향함
    const thumbIsUp = (thumb || pts[4].y < pts[2].y - size * 0.2) && (!i && !m && !r && !p) && (pts[4].y < w.y);
    if (thumbIsUp) {
      return { gesture: 'thumbsUp', count: 1 };
    }

    if (count === 0) return { gesture: 'fist', count: 0 };
    if (count === 5) return { gesture: 'open', count: 5 };
    if (count === 1 && i) return { gesture: 'point', count: 1 };
    if (count === 2 && i && m) return { gesture: 'peace', count: 2 };
    if (count === 3) return { gesture: 'finger_3', count: 3 };
    if (count === 4 || (!thumb && i && m && r && p)) return { gesture: 'finger_4', count: 4 };

    return { gesture: count === 5 ? 'open' : (count === 0 ? 'fist' : `finger_${count}`), count };
  }

  /** 디바운스 + 전이 이벤트 생성 */
  _stabilize(s, rawObj, now, center, size, slot, events, pts) {
    const raw = rawObj.gesture;
    const count = rawObj.count;

    if (raw === s.cand) s.candCount += 1;
    else {
      s.cand = raw;
      s.candCount = 1;
    }

    if (s.candCount >= this.stableFrames && s.cand !== s.stable) {
      const prev = s.stable;
      s.stable = s.cand;
      s.fingerCount = count;

      const vx = pts[9].x - pts[0].x;
      const vy = pts[9].y - pts[0].y;
      const vl = Math.hypot(vx, vy) || 1;
      const base = { slot, x: center.x, y: center.y, size, count, dir: { x: vx / vl, y: vy / vl } };
      const T = CONFIG.gesture.transitionMs;
      events.push({ type: 'enter', gesture: s.stable, count, from: prev, ...base });
      if (s.stable === 'fist' && s.lastOpenAt > s.lastFistAt && now - s.lastOpenAt < T) {
        events.push({ type: 'charge', ...base });
      }
      if (s.stable === 'open' && s.lastFistAt > s.lastOpenAt && now - s.lastFistAt < T) {
        events.push({ type: 'release', ...base });
      }
    }
    if (s.stable === 'open') s.lastOpenAt = now;
    if (s.stable === 'fist') s.lastFistAt = now;
  }

  /**
   * 프레임 갱신
   * @param {{landmarks:Array}} result HandTracker 결과
   * @param {number} W 캔버스 너비
   * @param {number} H 캔버스 높이
   * @param {boolean} mirror 거울 모드
   * @param {number} now 현재 시각(ms)
   */
  update(result, W, H, mirror, now) {
    const events = [];
    const hands = [];

    const detected = (result.landmarks || []).map((lm) => {
      const pts = this._toPixels(lm, W, H, mirror);
      return { pts, center: palmCenter(pts), size: Math.max(1, dist(pts[0], pts[9])) };
    });

    // ① 슬롯 배정
    const used = new Set();
    const assigned = [];
    for (const d of detected) {
      let best = -1;
      let bestDist = Infinity;
      this.slots.forEach((s, i) => {
        if (used.has(i) || !s.active) return;
        const dd = dist(s.last, d.center);
        if (dd < bestDist && dd < W * 0.4) {
          bestDist = dd;
          best = i;
        }
      });
      if (best < 0) best = this.slots.findIndex((s, i) => !used.has(i) && !s.active);
      if (best < 0) best = this.slots.findIndex((s, i) => !used.has(i));
      if (best < 0) continue;
      used.add(best);
      assigned.push({ slot: best, ...d });
    }

    // ② 슬롯별 판정
    for (const a of assigned) {
      const s = this.slots[a.slot];
      s.active = true;
      s.last = a.center;
      s.lastSeen = now;
      const classified = this._classify(a.pts, a.size);
      this._stabilize(s, classified, now, a.center, a.size, a.slot, events, a.pts);
      hands.push({
        slot: a.slot,
        center: a.center,
        size: a.size,
        gesture: s.stable,
        fingerCount: s.fingerCount || classified.count,
        raw: classified.gesture,
        pts: a.pts,
        tips: { thumb: a.pts[4], index: a.pts[8], middle: a.pts[12], ring: a.pts[16], pinky: a.pts[20] },
        pinch: { x: (a.pts[4].x + a.pts[8].x) / 2, y: (a.pts[4].y + a.pts[8].y) / 2 },
      });
    }

    // ③ 오래 안 보인 손은 슬롯 초기화
    this.slots.forEach((s, i) => {
      if (!used.has(i) && s.active && now - s.lastSeen > CONFIG.gesture.lostMs) {
        this.slots[i] = this._newSlot();
      }
    });

    // ④ 두 손 조합 & 하트 / 박수 제스처 감지
    let two = null;
    if (assigned.length === 2) {
      const [a, b] = assigned;
      const d = dist(a.center, b.center);
      const avg = (a.size + b.size) / 2;
      const mid = { x: (a.center.x + b.center.x) / 2, y: (a.center.y + b.center.y) / 2 };
      const bothOpen = this.slots[a.slot].stable === 'open' && this.slots[b.slot].stable === 'open';
      const bothFist = this.slots[a.slot].stable === 'fist' && this.slots[b.slot].stable === 'fist';

      // 하트 제스처 감지: 양 손의 검지 끝과 엄지 끝이 가까움 (또는 손가락 하트)
      const idxDist = dist(a.pts[8], b.pts[8]);
      const thmDist = dist(a.pts[4], b.pts[4]);
      if (idxDist < avg * 1.55 && thmDist < avg * 1.55 && now - this.lastHeartAt > 400) {
        this.lastHeartAt = now;
        events.push({ type: 'heart', x: mid.x, y: mid.y, size: avg });
      }

      this.palmHist.push({ t: now, d });
      while (this.palmHist.length && now - this.palmHist[0].t > 400) this.palmHist.shift();
      const maxD = Math.max(...this.palmHist.map((h) => h.d));

      // 박수 감지: 두 손 사이 거리가 빠르게 좁아져 가까워질 때
      if (d < avg * 2.2 && maxD > avg * 2.5 && now - this.lastClapAt > (CONFIG.gesture.clapCooldownMs || 800)) {
        this.lastClapAt = now;
        this.palmHist.length = 0;
        events.push({ type: 'clap', x: mid.x, y: mid.y, size: avg });
      }
      const sA = this.slots[a.slot].stable;
      const sB = this.slots[b.slot].stable;
      const cntA = this.slots[a.slot].fingerCount || 5;
      const cntB = this.slots[b.slot].fingerCount || 5;
      const facingHands = (cntA >= 3 || sA === 'open' || sA === 'finger_4') && (cntB >= 3 || sB === 'open' || sB === 'finger_4');
      two = { a: a.center, b: b.center, mid, dist: d, bothOpen, bothFist, facingHands, avgSize: avg };
    } else {
      // 한 손 하트 (미니 하트: 엄지-검지 교차)
      for (const a of assigned) {
        const pClose = dist(a.pts[4], a.pts[8]) < a.size * 0.4;
        const middleFold = dist(a.pts[12], a.pts[0]) < a.size * 1.0;
        if (pClose && middleFold && now - this.lastHeartAt > 600) {
          this.lastHeartAt = now;
          events.push({ type: 'heart', x: a.center.x, y: a.center.y - a.size * 0.6, size: a.size });
        }
      }
      this.palmHist.length = 0;
    }

    return { hands, two, events };
  }

  /** 몸(포즈) 모션 판정 */
  updatePose(poseLm, W, H, mirror, now) {
    if (!poseLm || !CONFIG.bodyMotion || !CONFIG.bodyMotion.enabled) return null;
    const pts = poseLm.map((p) => ({
      x: (mirror ? 1 - p.x : p.x) * W,
      y: p.y * H,
      v: p.visibility === undefined ? 1 : p.visibility,
    }));

    if (pts[11].v < 0.4 || pts[12].v < 0.4) return null;
    const s1 = pts[11];
    const s2 = pts[12];
    const w1 = pts[15]; // left wrist
    const w2 = pts[16]; // right wrist
    const sw = dist(s1, s2);

    let poseType = null;
    // X-Shield: 양 손목이 가슴 앞에서 교차
    if (w1.v > 0.4 && w2.v > 0.4 && CONFIG.bodyMotion.xShield) {
      if (dist(w1, w2) < sw * 0.5 && Math.abs(w1.y - s1.y) < sw * 0.7) {
        poseType = 'x_shield';
      }
    }

    // Sky Strike: 양 손목이 어깨보다 훨씬 높이 위치
    if (w1.v > 0.4 && w2.v > 0.4 && CONFIG.bodyMotion.skyStrike) {
      if (w1.y < s1.y - sw * 0.7 && w2.y < s2.y - sw * 0.7) {
        poseType = 'sky_strike';
      }
    }

    return poseType;
  }
}

