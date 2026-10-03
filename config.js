/**
 * config.js — 전역 설정 (수치는 이 파일에서만 조정)
 *
 * MediaPipe 주소 안내
 *  - 모델(.task)과 wasm 경로 형식은 MediaPipe 공식 문서 예제와 동일합니다.
 *  - 아래 `candidates`는 위에서부터 차례로 시도합니다.
 *    1순위: 버전 고정 주소 (VERSION 값은 필요 시 바꾸세요)
 *    2순위: 공식 문서의 기본(버전 미지정) 주소 — 1순위가 실패하면 자동 대체
 */
const MP_VERSION = '0.10.14';
const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision';

export const CONFIG = {
  mediapipe: {
    candidates: [
      { module: `${CDN}@${MP_VERSION}/vision_bundle.mjs`, wasm: `${CDN}@${MP_VERSION}/wasm` },
      { module: `${CDN}/vision_bundle.mjs`, wasm: `${CDN}@latest/wasm` },
    ],
    modelUrl:
      'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    // 파워 슈트(상체 인식)용 포즈 모델 — 슈트를 켤 때만 불러옵니다
    poseModelUrl:
      'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
    // 각 단계 최대 대기 시간(ms) — 넘으면 오류 안내
    timeouts: { library: 20000, wasm: 30000, modelGpu: 25000, modelCpu: 45000 },
    numHands: 2,
    minDetectionConfidence: 0.6,
    minPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  },

  particles: {
    max: 1800, // 동시 파티클 상한
  },

  gesture: {
    stableFrames: 3, // 같은 동작이 연속 N프레임 유지되어야 확정
    fingerMargin: 1.05, // 손가락 확장 임계값
    pinchRatio: 0.28, // 엄지-검지 핀치 비유
    lostMs: 300,
    transitionMs: 1500,
    clapCooldownMs: 1000,
    themeCooldownMs: 1200,
    // 손가락 개수별 매핑 (0 ~ 5)
    fingerActions: {
      0: 'fist_charge',      // 0개 (주먹): 에너지 응축
      1: 'point_laser',      // 1개 (검지): 빛의 레이저 궤적
      2: 'peace_lightning',  // 2개 (V-sign): 번개 스파크
      3: 'triple_rings',     // 3개 (손가락 3개): 삼중 에너지 링 & 커스텀 배너
      4: 'hex_shield',       // 4개 (손가락 4개): 육각형 배리어 방패
      5: 'repulsor_flare',   // 5개 (손바닥): 리펄서 화염 폭발
    },
  },

  suit: {
    assembleSec: 2.0, // 슈트 조립 연출 시간
    callHoldMs: 600, // 두 주먹을 맞대고 있어야 하는 시간
    toggleCooldownMs: 3000,
    smoothing: 0.5,
    lostMs: 600,
    preset: 'mark85', // mark85 | markL | stealth | warMachine
    reactorColor: '120,230,255',
    hudEnabled: true,
    scale: 1.0,
  },

  suitPresets: {
    mark85: {
      name: 'Mark 85 Classic',
      redHi: '#ff5a45',
      red: '#d0202e',
      redLo: '#7d0f1c',
      goldHi: '#ffe08a',
      gold: '#e6b230',
      goldLo: '#9a6b10',
      cyan: '120,230,255',
    },
    markL: {
      name: 'Mark L Nano-Tech',
      redHi: '#45b5ff',
      red: '#1665d8',
      redLo: '#0b2e78',
      goldHi: '#d4f0ff',
      gold: '#78c6ff',
      goldLo: '#2e75b8',
      cyan: '80,220,255',
    },
    stealth: {
      name: 'Stealth Spec-Ops',
      redHi: '#4a4e58',
      red: '#24272e',
      redLo: '#111318',
      goldHi: '#ffd875',
      gold: '#d4a222',
      goldLo: '#785705',
      cyan: '255,200,80',
    },
    warMachine: {
      name: 'War Machine',
      redHi: '#d8dee9',
      red: '#8892b0',
      redLo: '#3b4252',
      goldHi: '#ff6b6b',
      gold: '#e63946',
      goldLo: '#900c3f',
      cyan: '255,75,75',
    },
  },

  bodyMotion: {
    enabled: false,
    xShield: true,      // X자 팔 교차 -> 보호막
    skyStrike: true,    // 두 팔 치켜들기 -> 궤도 에너지 빔
    punchShockwave: true, // 전방 펀치 -> 화면 충격파
  },

  banner: {
    text: '2026 창순기획 HAND MOTION STUDIO',
    imageUrl: null, // data URL 또는 image path
    triggerGesture: 'finger_3', // finger_3 | heart | clap | suit_on | finger_5
    style: 'neon', // neon | hologram | gold | glass
    durationMs: 3000,
    animation: 'zoom', // zoom | slide | pulse
  },

  render: {
    dim: 0.15,
  },
};

