/**
 * main.js — 앱 시작점: 초기화, 메인 루프, UI 연결, 파워 슈트 제어
 *
 * 시작 흐름 (멈춘 것처럼 보이지 않도록 단계별로 즉시 피드백)
 *  1) 버튼 클릭 → 카메라 연결(허용 안내 문구)
 *  2) 카메라가 켜지면 바로 무대 화면으로 전환 (영상이 먼저 보임)
 *  3) 손 인식 모델은 배너로 진행 상황을 보여 주며 뒤에서 로딩 (실패 시 '다시 시도' 버튼)
 */
import { CONFIG } from './config.js';
import { startCamera, explainCameraError } from './camera.js';
import { HandTracker } from './handTracker.js';
import { GestureEngine } from './gestureEngine.js';
import { ParticleSystem, getSprite } from './particles.js';
import { EffectManager } from './effects.js';
import { SuitRenderer } from './suit.js';
import { THEMES } from './themes.js';
import { Recorder } from './recorder.js';
import { BannerManager } from './bannerSystem.js';
import { DrawingEngine } from './drawingEngine.js';

const $ = (id) => document.getElementById(id);

const els = {
  stage: $('stage'),
  canvas: $('view'),
  video: $('cam'),
  topbar: $('topbar'),
  hud: $('hud'),
  toast: $('toast'),
  hint: $('hint'),
  banner: $('banner'),
  bannerText: $('bannerText'),
  retryBtn: $('retryBtn'),
  intro: $('intro'),
  startBtn: $('startBtn'),
  startLabel: $('startLabel'),
  status: $('status'),
  guide: $('guide'),
  guideBtn: $('guideBtn'),
  guideClose: $('guideClose'),
  dock: $('dock'),
  themes: $('themes'),
  suitBtn: $('suitBtn'),
  faceBtn: $('faceBtn'),
  stable: $('stable'),
  intensity: $('intensity'),
  mirror: $('mirror'),
  skeleton: $('skeleton'),
  toastToggle: $('toastToggle'),
  debug: $('debug'),
  captureBtn: $('captureBtn'),
  recordBtn: $('recordBtn'),
  recordLabel: $('recordLabel'),
  fsBtn: $('fsBtn'),

  // 설정 모달
  settingsBtn: $('settingsBtn'),
  dockSettingsBtn: $('dockSettingsBtn'),
  settingsModal: $('settingsModal'),
  modalClose: $('modalClose'),
  modalBackdrop: $('modalBackdrop'),
  suitPresetSelect: $('suitPresetSelect'),
  suitReactorColorSelect: $('suitReactorColorSelect'),
  suitScaleInput: $('suitScaleInput'),
  suitHudCheck: $('suitHudCheck'),
  bannerTextInput: $('bannerTextInput'),
  bannerFileInput: $('bannerFileInput'),
  bannerImgPreview: $('bannerImgPreview'),
  bannerTriggerSelect: $('bannerTriggerSelect'),
  bannerStyleSelect: $('bannerStyleSelect'),
  bannerAnimSelect: $('bannerAnimSelect'),
  testBannerBtn: $('testBannerBtn'),
  bodyMotionCheck: $('bodyMotionCheck'),
  xShieldCheck: $('xShieldCheck'),
  skyStrikeCheck: $('skyStrikeCheck'),

  // 드로잉 툴바 및 HUD 포인터
  drawingToolbar: $('drawingToolbar'),
  drawPalette: $('drawPalette'),
  drawColorPicker: $('drawColorPicker'),
  drawSizeSlider: $('drawSizeSlider'),
  clearDrawBtn: $('clearDrawBtn'),
  downloadDrawBtn: $('downloadDrawBtn'),
  exitDrawBtn: $('exitDrawBtn'),
  drawBtn: $('drawBtn'),
  motionPointer: $('motionPointer'),
  pointerProgressRing: $('pointerProgressRing'),
  pointerBadge: $('pointerBadge'),
  dtOpacityBtn: $('dtOpacityBtn'),
  dtDockBtn: $('dtDockBtn'),
};

const ctx = els.canvas.getContext('2d');
const tracker = new HandTracker();
const gestures = new GestureEngine();
const particles = new ParticleSystem(CONFIG.particles.max);
const bannerManager = new BannerManager();
const effects = new EffectManager(particles, bannerManager);
const suit = new SuitRenderer();
const recorder = new Recorder(els.canvas);
const drawingEngine = new DrawingEngine();

const state = { running: false, mirror: true, skeleton: true, showToast: true, debug: false, W: 1280, H: 720, suitLoading: false, drawingMode: false };

const GESTURE_INFO = {
  open: { emoji: '✋', name: '손바닥', desc: '화염 & 리펄서 폭발' },
  fist: { emoji: '✊', name: '주먹', desc: '에너지를 모으는 중' },
  pinch: { emoji: '🤏', name: '핀치', desc: '스파크가 튀어요' },
  point: { emoji: '☝️', name: '검지', desc: '빛의 궤적을 그려요' },
  peace: { emoji: '✌️', name: 'V 사인', desc: '번개가 뻗어 나가요' },
  finger_3: { emoji: '🤟', name: '손가락 3개', desc: '삼중 에너지 링 & 커스텀 배너' },
  finger_4: { emoji: '🖐️', name: '손가락 4개', desc: '쿼드 에너지 파동 & 다이아몬드 배리어' },
  thumbsUp: { emoji: '👍', name: '엄지 척', desc: '골든 빅토리 아우라 & 라이징 스타' },
};
const GESTURE_LABEL = { open: '손바닥', fist: '주먹', pinch: '핀치', point: '검지', peace: 'V', finger_3: '손가락 3개', finger_4: '손가락 4개', thumbsUp: '엄지 척', none: '-' };
const GESTURE_EMOJI = { open: '✋', fist: '✊', pinch: '🤏', point: '☝️', peace: '✌️', finger_3: '🤟', finger_4: '🖐️', thumbsUp: '👍', none: '·' };
const HAND_LINES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];
const TIPS = [4, 8, 12, 16, 20];

// 모션 줄이기 설정 존중: 화면 흔들림 끄기
if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  effects.shakeEnabled = false;
}

/* ===================== 공통 UI 도우미 ===================== */

function setStatus(msg, isError = false) {
  els.status.textContent = msg;
  els.status.classList.toggle('error', isError);
}

/** 상단 배너: 진행/완료/오류 상태 표시 */
function showBanner(text, mode = 'loading', retry = false) {
  els.banner.hidden = false;
  els.banner.className = 'banner ' + mode; // loading | ok | err
  els.bannerText.textContent = text;
  els.retryBtn.hidden = !retry;
}
function hideBanner() {
  els.banner.hidden = true;
}

let hintOn = false;
function setHint(text) {
  if (!text) {
    if (hintOn) els.hint.hidden = true;
    hintOn = false;
    return;
  }
  els.hint.textContent = text;
  els.hint.hidden = false;
  hintOn = true;
}

/** 중앙 상단 토스트 (Web Animations API로 매번 새로 재생) */
let lastToastAt = 0;
function showToast(emoji, name, desc, force = false) {
  if (!state.showToast) {
    els.toast.hidden = true;
    els.toast.style.display = 'none';
    return;
  }
  els.toast.style.display = '';
  const now = performance.now();
  if (!force && now - lastToastAt < 500) return;
  lastToastAt = now;
  const t = els.toast;
  t.innerHTML = `<span class="ti">${emoji}</span><span><b>${name}</b><br><small>${desc}</small></span>`;
  t.hidden = false;
  const keyframes = [
    { opacity: 0, transform: 'translate(-50%, 12px) scale(0.85)' },
    { opacity: 1, transform: 'translate(-50%, 0) scale(1)', offset: 0.12 },
    { opacity: 1, transform: 'translate(-50%, 0) scale(1)', offset: 0.75 },
    { opacity: 0, transform: 'translate(-50%, -8px) scale(0.98)' },
  ];
  t.getAnimations().forEach((a) => a.cancel());
  const anim = t.animate(keyframes, { duration: 1500, easing: 'ease-out' });
  anim.onfinish = () => {
    t.hidden = true;
  };
}

/* ===================== 테마 ===================== */

function applyAccent() {
  const th = effects.theme;
  els.stage.style.setProperty('--acc', th.core);
  els.stage.style.setProperty('--acc2', th.palette[2]);
}

function buildThemeButtons() {
  els.themes.innerHTML = '';
  THEMES.forEach((t, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(i === effects.themeIndex));
    b.innerHTML = `${t.emoji} ${t.label}`;
    b.addEventListener('click', () => effects.setTheme(i));
    els.themes.appendChild(b);
  });
}

let themeChanged = false;
effects.onThemeChange = () => {
  themeChanged = true;
  [...els.themes.children].forEach((b, i) => b.setAttribute('aria-checked', String(i === effects.themeIndex)));
  applyAccent();
};

/* ===================== 파워 슈트 ===================== */

function syncSuitButtons() {
  const on = suit.target;
  els.suitBtn.setAttribute('aria-pressed', String(on));
  els.faceBtn.hidden = !on;
}

/** 슈트 켜기/끄기. 처음 켤 때 몸 인식 모델을 불러온다. */
async function setSuit(on) {
  if (state.suitLoading) return;
  if (on && !tracker.poseReady) {
    state.suitLoading = true;
    showBanner('슈트 시스템(몸 인식) 불러오는 중…', 'loading');
    try {
      await tracker.initPose((msg) => showBanner(msg, 'loading'));
      hideBanner();
    } catch (e) {
      console.error(e);
      showBanner('몸 인식을 불러오지 못했습니다: ' + (e.message || e), 'err');
      state.suitLoading = false;
      return;
    }
    state.suitLoading = false;
  }
  suit.setOn(on);
  effects.setSuitMode(on);
  if (!on) {
    suit.flash = 0;
    effects.flash = 0;
    effects.cores.length = 0;
  }
  syncSuitButtons();
  if (on) showToast('🦾', '파워 슈트 호출', '상체가 보이게 서 주세요', true);
  else showToast('🛡️', '슈트 해제', '장갑이 분리돼요', true);
}

/** 두 주먹을 맞대고 일정 시간 유지하면 슈트 켜기/끄기 */
let fistStart = 0;
let lastSuitToggle = -1e9;
function handleSuitCall(frame, now) {
  const tw = frame.two;
  const together = tw && tw.bothFist && tw.dist < tw.avgSize * 2.6;
  if (together && !state.suitLoading) {
    if (!fistStart) fistStart = now;
    const p = Math.min(1, (now - fistStart) / CONFIG.suit.callHoldMs);
    suit.setCall(now - lastSuitToggle < CONFIG.suit.toggleCooldownMs ? 0 : p, tw.mid);
    if (p >= 1 && now - lastSuitToggle > CONFIG.suit.toggleCooldownMs) {
      lastSuitToggle = now;
      fistStart = 0;
      suit.setCall(0, null);
      setSuit(!suit.target);
    }
  } else {
    fistStart = 0;
    suit.setCall(0, null);
  }
}

/* ===================== 드로잉 모드 ===================== */

function setDrawingMode(on) {
  const next = on === undefined ? !state.drawingMode : !!on;
  state.drawingMode = next;
  drawingEngine.setEnabled(next);
  if (els.drawBtn) {
    els.drawBtn.setAttribute('aria-pressed', String(next));
    els.drawBtn.classList.toggle('active', next);
  }
  if (els.drawingToolbar) {
    els.drawingToolbar.hidden = !next;
    els.drawingToolbar.style.display = next ? 'flex' : 'none';
  }
  if (next) {
    showToast('🎨', '드로잉 스튜디오', '검지(☝️) 글자쓰기 | 주먹(✊) 펜떼기 | 3손가락(🤟) 색상변경 | 2손가락(✌️) 도구변경', true);
  } else {
    showToast('🚪', '드로잉 종료', '작성한 그림은 보존됩니다', true);
  }
}

/* ===================== 모션 인식 팔레트 선택 & 제스처 단축 ===================== */

const PALETTE_COLORS = [
  { hex: '#00f0ff', name: '네온 시안' },
  { hex: '#ff5500', name: '플레임 오렌지' },
  { hex: '#b026ff', name: '바이올렛' },
  { hex: '#00ff66', name: '네온 그린' },
  { hex: '#ffd700', name: '골드' },
  { hex: '#ff007f', name: '핫 핑크' },
  { hex: '#ffffff', name: '화이트' },
  { hex: '#222222', name: '다크' },
];
let currentColorIdx = 0;

function cycleDrawColor() {
  currentColorIdx = (currentColorIdx + 1) % PALETTE_COLORS.length;
  const item = PALETTE_COLORS[currentColorIdx];
  drawingEngine.setColor(item.hex);
  if (els.drawPalette) {
    const swatches = els.drawPalette.querySelectorAll('.swatch');
    swatches.forEach((sw) => {
      sw.classList.toggle('active', sw.dataset.color === item.hex);
    });
  }
  showToast('🎨', '색상 변경 (손가락 3개)', item.name, true);
}

const DRAW_TOOLS = [
  { id: 'glow', emoji: '🖌️', name: '네온 글루 펜' },
  { id: 'marker', emoji: '✏️', name: '마커 펜' },
  { id: 'spark', emoji: '⚡', name: '스파크 펜' },
  { id: 'eraser', emoji: '🧹', name: '지우개' },
];
let currentToolIdx = 0;

function cycleDrawTool() {
  currentToolIdx = (currentToolIdx + 1) % DRAW_TOOLS.length;
  const tool = DRAW_TOOLS[currentToolIdx];
  drawingEngine.setTool(tool.id);
  const toolChips = document.querySelectorAll('.tool-chip');
  toolChips.forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.tool === tool.id);
  });
  showToast(tool.emoji, '도구 변경 (V-사인)', tool.name, true);
}

let paletteHoverStart = 0;
let paletteHoverTarget = null;
let hoverProgress = 0;
let lastHoverPoint = null;

function updateMotionPalette(frame, now) {
  if (!state.drawingMode) {
    if (els.motionPointer) els.motionPointer.hidden = true;
    if (paletteHoverTarget) paletteHoverTarget.classList.remove('motion-hover');
    paletteHoverTarget = null;
    paletteHoverStart = 0;
    hoverProgress = 0;
    lastHoverPoint = null;
    return;
  }

  const rect = els.canvas.getBoundingClientRect();
  const scaleX = rect.width / state.W;
  const scaleY = rect.height / state.H;

  // 손가락 위치 감지 (검지 끝 우선)
  let activeHand = null;
  let tipPt = null;

  for (const h of frame.hands) {
    if (h.tips.index) {
      activeHand = h;
      tipPt = h.tips.index;
      break;
    }
  }

  if (!tipPt && frame.hands.length > 0) {
    activeHand = frame.hands[0];
    tipPt = activeHand.tips.index || activeHand.center;
  }

  if (!tipPt) {
    if (els.motionPointer) els.motionPointer.hidden = true;
    if (paletteHoverTarget) paletteHoverTarget.classList.remove('motion-hover');
    paletteHoverTarget = null;
    paletteHoverStart = 0;
    hoverProgress = 0;
    lastHoverPoint = null;
    return;
  }

  const screenX = rect.left + tipPt.x * scaleX;
  const screenY = rect.top + tipPt.y * scaleY;

  // 화면 최상단 HUD 포인터 레이어 이동
  if (els.motionPointer) {
    els.motionPointer.hidden = false;
    els.motionPointer.style.left = `${screenX}px`;
    els.motionPointer.style.top = `${screenY}px`;
  }

  // 팔레트 항목과 자석(Magnet) 조준 충돌 테스트
  let currentTarget = null;
  let currentPt = null;

  if (els.drawingToolbar && !els.drawingToolbar.hidden) {
    const clickableItems = [
      ...els.drawingToolbar.querySelectorAll('.swatch'),
      ...els.drawingToolbar.querySelectorAll('.tool-chip'),
      ...els.drawingToolbar.querySelectorAll('.dt-btn'),
      ...els.drawingToolbar.querySelectorAll('.dt-head-btn'),
    ];

    for (const item of clickableItems) {
      const b = item.getBoundingClientRect();
      // 넓은 자석 영역 패딩 (+18px) 적용으로 손쉬운 맞춤
      if (screenX >= b.left - 18 && screenX <= b.right + 18 && screenY >= b.top - 18 && screenY <= b.bottom + 18) {
        currentTarget = item;
        currentPt = { x: tipPt.x, y: tipPt.y, screenX, screenY };
        break;
      }
    }
  }

  if (currentTarget !== paletteHoverTarget) {
    if (paletteHoverTarget) paletteHoverTarget.classList.remove('motion-hover');
    paletteHoverTarget = currentTarget;
    paletteHoverStart = currentTarget ? now : 0;
    hoverProgress = 0;
  }

  if (currentTarget) {
    currentTarget.classList.add('motion-hover');
    lastHoverPoint = currentPt;
    const elapsed = now - paletteHoverStart;
    hoverProgress = Math.min(1, elapsed / 300); // 0.3초 멈춤 시 자동 선택

    if (els.motionPointer) {
      els.motionPointer.classList.add('target-locked');
    }

    // 조준 중인 항목 뱃지 표시
    let label = '🎯 조준';
    if (currentTarget.classList.contains('swatch')) {
      label = `🎨 ${currentTarget.title || '색상'}`;
    } else if (currentTarget.classList.contains('tool-chip')) {
      label = currentTarget.textContent.trim();
    } else if (currentTarget.classList.contains('dt-btn')) {
      label = currentTarget.textContent.trim();
    } else if (currentTarget.classList.contains('dt-head-btn')) {
      label = currentTarget.textContent.trim();
    }

    if (els.pointerBadge) els.pointerBadge.textContent = label;

    if (hoverProgress >= 1) {
      currentTarget.click();
      paletteHoverStart = now + 450; // 클릭 후 쿨다운
      hoverProgress = 0;
    }
  } else {
    lastHoverPoint = null;
    if (els.motionPointer) {
      els.motionPointer.classList.remove('target-locked');
    }
    if (els.pointerBadge) {
      const isDrawing = activeHand && (activeHand.gesture === 'point' || activeHand.fingerCount === 1);
      els.pointerBadge.textContent = isDrawing ? '✏️ 그리는 중' : '☝️ 검지 조준';
    }
  }

  // 360도 SVG 원형 프로그레스 링 업데이트
  if (els.pointerProgressRing) {
    const totalCircumference = 150.79;
    const offset = totalCircumference * (1 - hoverProgress);
    els.pointerProgressRing.style.strokeDashoffset = `${offset}`;
  }
}

function drawMotionPaletteCursor(ctx, now) {
  if (!state.drawingMode) return;
  if (lastHoverPoint && paletteHoverTarget) {
    const { x, y } = lastHoverPoint;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgb(${CONFIG.suit.reactorColor || '120,230,255'})`;
    ctx.fillStyle = '#ffffff';

    const r = 22;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - r * 1.6, y); ctx.lineTo(x - r * 0.7, y);
    ctx.moveTo(x + r * 0.7, y); ctx.lineTo(x + r * 1.6, y);
    ctx.moveTo(x, y - r * 1.6); ctx.lineTo(x, y - r * 0.7);
    ctx.moveTo(x, y + r * 0.7); ctx.lineTo(x, y + r * 1.6);
    ctx.stroke();

    ctx.restore();
  }
}

/* ===================== 토스트(동작 인식 안내) ===================== */

let prevBothOpen = false;
function toastFromFrame(frame) {
  if (!state.showToast) return;
  const ev = frame.events;
  const has = (t) => ev.find((e) => e.type === t);
  let pick = null;
  let force = false;
  if (has('clap')) {
    pick = ['👏', '박수', '화면 전체 충격파!'];
    force = true;
  } else if (has('release')) {
    pick = effects.suitMode ? ['🔫', '리펄서 발사', '손 방향으로 빔이 나가요'] : ['💥', '방출', '폭발과 충격파'];
    force = true;
  } else if (has('charge')) {
    pick = ['🌀', '응축', '빛이 손으로 빨려 들어가요'];
  } else if (themeChanged) {
    pick = [effects.theme.emoji, '테마 전환', `${effects.theme.label} 테마`];
    force = true;
  } else if (frame.two && frame.two.bothOpen && !prevBothOpen) {
    pick = effects.suitMode ? ['🚀', '비행 모드', '두 손을 아래로 내려 보세요'] : ['🙌', '에너지 구체', '두 손 간격으로 크기를 조절해요'];
  } else {
    const en = ev.find((e) => e.type === 'enter' && GESTURE_INFO[e.gesture]);
    if (en) {
      const i = GESTURE_INFO[en.gesture];
      pick = [i.emoji, i.name, i.desc];
    }
  }
  themeChanged = false;
  prevBothOpen = !!(frame.two && frame.two.bothOpen);
  if (pick) showToast(pick[0], pick[1], pick[2], force);
}

/* ===================== 컨트롤 연결 ===================== */

function bindControls() {
  els.stable.addEventListener('input', () => gestures.setStableFrames(els.stable.value));
  els.intensity.addEventListener('input', () => effects.setIntensity(els.intensity.value));
  els.mirror.addEventListener('change', () => {
    state.mirror = els.mirror.checked;
    effects.reset();
    suit.resetTracking();
  });
  els.skeleton.addEventListener('change', () => (state.skeleton = els.skeleton.checked));
  if (els.toastToggle) {
    els.toastToggle.addEventListener('change', () => {
      state.showToast = els.toastToggle.checked;
      if (!state.showToast) {
        els.toast.hidden = true;
        els.toast.style.display = 'none';
        if (els.toast.getAnimations) {
          els.toast.getAnimations().forEach((a) => a.cancel());
        }
        els.hud.hidden = true;
        els.hint.hidden = true;
      } else {
        els.toast.style.display = '';
        els.hud.hidden = false;
      }
    });
  }
  els.debug.addEventListener('change', () => (state.debug = els.debug.checked));

  els.suitBtn.addEventListener('click', () => setSuit(!suit.target));
  els.faceBtn.addEventListener('click', () => {
    suit.setFaceOpen(!suit.faceIsOpen);
    els.faceBtn.setAttribute('aria-pressed', String(suit.faceIsOpen));
  });

  const toggleGuide = (open) => {
    const next = open === undefined ? !els.guide.classList.contains('open') : open;
    els.guide.classList.toggle('open', next);
    els.guide.setAttribute('aria-hidden', String(!next));
  };
  els.guideBtn.addEventListener('click', () => toggleGuide());
  els.guideClose.addEventListener('click', () => toggleGuide(false));

  const toggleSettings = (open) => {
    const next = open === undefined ? els.settingsModal.hidden : open;
    els.settingsModal.hidden = !next;
    els.settingsModal.setAttribute('aria-hidden', String(!next));
  };
  if (els.settingsBtn) els.settingsBtn.addEventListener('click', () => toggleSettings(true));
  if (els.dockSettingsBtn) els.dockSettingsBtn.addEventListener('click', () => toggleSettings(true));
  if (els.modalClose) els.modalClose.addEventListener('click', () => toggleSettings(false));
  if (els.modalBackdrop) els.modalBackdrop.addEventListener('click', () => toggleSettings(false));

  // 탭 전환
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.remove('active'));
      tabContents.forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      const targetTab = $(btn.dataset.tab);
      if (targetTab) targetTab.classList.add('active');
    });
  });

  // 설정 폼 바인딩
  if (els.suitPresetSelect) els.suitPresetSelect.addEventListener('change', (e) => (CONFIG.suit.preset = e.target.value));
  if (els.suitReactorColorSelect) els.suitReactorColorSelect.addEventListener('change', (e) => (CONFIG.suit.reactorColor = e.target.value));
  if (els.suitScaleInput) els.suitScaleInput.addEventListener('input', (e) => (CONFIG.suit.scale = parseFloat(e.target.value) || 1.0));
  if (els.suitHudCheck) els.suitHudCheck.addEventListener('change', () => (CONFIG.suit.hudEnabled = els.suitHudCheck.checked));

  if (els.bannerTextInput) els.bannerTextInput.addEventListener('input', (e) => bannerManager.setText(e.target.value));
  if (els.bannerTriggerSelect) els.bannerTriggerSelect.addEventListener('change', (e) => bannerManager.setTriggerGesture(e.target.value));
  if (els.bannerStyleSelect) els.bannerStyleSelect.addEventListener('change', (e) => bannerManager.setStyle(e.target.value));
  if (els.bannerAnimSelect) els.bannerAnimSelect.addEventListener('change', (e) => bannerManager.setAnimation(e.target.value));
  if (els.testBannerBtn) els.testBannerBtn.addEventListener('click', () => bannerManager.fire(performance.now()));

  if (els.bannerFileInput) {
    els.bannerFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          bannerManager.setImage(ev.target.result);
          if (els.bannerImgPreview) {
            els.bannerImgPreview.innerHTML = `<img src="${ev.target.result}" alt="미리보기">`;
          }
        };
        reader.readAsDataURL(file);
      }
    });
  }

  if (els.bodyMotionCheck) els.bodyMotionCheck.addEventListener('change', (e) => (CONFIG.bodyMotion.enabled = e.target.checked));
  if (els.xShieldCheck) els.xShieldCheck.addEventListener('change', (e) => (CONFIG.bodyMotion.xShield = e.target.checked));
  if (els.skyStrikeCheck) els.skyStrikeCheck.addEventListener('change', (e) => (CONFIG.bodyMotion.skyStrike = e.target.checked));

  if (els.drawBtn) els.drawBtn.addEventListener('click', () => setDrawingMode());
  if (els.exitDrawBtn) els.exitDrawBtn.addEventListener('click', () => setDrawingMode(false));
  if (els.clearDrawBtn) els.clearDrawBtn.addEventListener('click', () => drawingEngine.clear());
  if (els.downloadDrawBtn) els.downloadDrawBtn.addEventListener('click', () => drawingEngine.download(els.video, state.mirror));

  if (els.dtOpacityBtn) {
    els.dtOpacityBtn.addEventListener('click', () => {
      const isTrans = els.drawingToolbar.classList.toggle('transparent-mode');
      els.dtOpacityBtn.classList.toggle('active', isTrans);
      showToast('👁️', isTrans ? '투명 뷰 활성화' : '투명 뷰 해제', isTrans ? '카메라 화면이 완벽하게 투과됩니다' : '기본 유선형 스타일', true);
    });
  }

  if (els.dtDockBtn) {
    els.dtDockBtn.addEventListener('click', () => {
      const isDock = els.drawingToolbar.classList.toggle('top-dock-mode');
      els.dtDockBtn.classList.toggle('active', isDock);
      els.dtDockBtn.textContent = isDock ? '📌 우측 팝업' : '📌 상단 Dock';
      showToast('📌', isDock ? '상단 Dock 모드' : '우측 팝업 모드', isDock ? '팔레트가 상단 바에 고정됩니다' : '팔레트가 우측 모달로 배치됩니다', true);
    });
  }

  if (els.drawSizeSlider) {
    els.drawSizeSlider.addEventListener('input', (e) => drawingEngine.setSize(e.target.value));
  }

  if (els.drawPalette) {
    const swatches = els.drawPalette.querySelectorAll('.swatch');
    swatches.forEach((sw) => {
      sw.addEventListener('click', () => {
        swatches.forEach((s) => s.classList.remove('active'));
        sw.classList.add('active');
        drawingEngine.setColor(sw.dataset.color);
      });
    });
  }

  if (els.drawColorPicker) {
    els.drawColorPicker.addEventListener('input', (e) => {
      drawingEngine.setColor(e.target.value);
    });
  }

  const toolChips = document.querySelectorAll('.tool-chip');
  toolChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      toolChips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      drawingEngine.setTool(chip.dataset.tool);
    });
  });

  // 마우스 및 터치 드로잉 지원
  let isMouseDown = false;
  els.canvas.addEventListener('mousedown', (e) => {
    if (!state.drawingMode) return;
    isMouseDown = true;
    const rect = els.canvas.getBoundingClientRect();
    const scaleX = state.W / rect.width;
    const scaleY = state.H / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    drawingEngine.drawPoint('mouse', x, y, particles);
  });

  els.canvas.addEventListener('mousemove', (e) => {
    if (!state.drawingMode || !isMouseDown) return;
    const rect = els.canvas.getBoundingClientRect();
    const scaleX = state.W / rect.width;
    const scaleY = state.H / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    drawingEngine.drawPoint('mouse', x, y, particles);
  });

  const stopMouseDraw = () => {
    isMouseDown = false;
    drawingEngine.liftPoint('mouse');
  };
  window.addEventListener('mouseup', stopMouseDraw);
  els.canvas.addEventListener('mouseleave', stopMouseDraw);

  els.canvas.addEventListener('touchstart', (e) => {
    if (!state.drawingMode || !e.touches[0]) return;
    const rect = els.canvas.getBoundingClientRect();
    const scaleX = state.W / rect.width;
    const scaleY = state.H / rect.height;
    const touch = e.touches[0];
    const x = (touch.clientX - rect.left) * scaleX;
    const y = (touch.clientY - rect.top) * scaleY;
    drawingEngine.drawPoint('touch', x, y, particles);
  }, { passive: true });

  els.canvas.addEventListener('touchmove', (e) => {
    if (!state.drawingMode || !e.touches[0]) return;
    const rect = els.canvas.getBoundingClientRect();
    const scaleX = state.W / rect.width;
    const scaleY = state.H / rect.height;
    const touch = e.touches[0];
    const x = (touch.clientX - rect.left) * scaleX;
    const y = (touch.clientY - rect.top) * scaleY;
    drawingEngine.drawPoint('touch', x, y, particles);
  }, { passive: true });

  els.canvas.addEventListener('touchend', () => {
    drawingEngine.liftPoint('touch');
  });

  els.captureBtn.addEventListener('click', async () => {
    try {
      await recorder.capture();
      showToast('📸', '캡처 완료', 'PNG 파일로 저장했어요', true);
    } catch (e) {
      alert(e.message);
    }
  });

  els.recordBtn.addEventListener('click', () => {
    try {
      if (recorder.recording) {
        recorder.stop();
        els.recordLabel.textContent = '녹화';
        els.recordBtn.classList.remove('rec');
      } else {
        recorder.start();
        els.recordLabel.textContent = '중지·저장';
        els.recordBtn.classList.add('rec');
      }
    } catch (e) {
      alert(e.message);
    }
  });

  els.fsBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (els.stage.requestFullscreen) els.stage.requestFullscreen();
  });

  els.retryBtn.addEventListener('click', loadModel);

  // 단축키: 1~5 테마, D 디버그, G 가이드, S 슈트, F 페이스플레이트, O 설정
  window.addEventListener('keydown', (e) => {
    if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (!state.running) return;
    const n = Number(e.key);
    const k = e.key.toLowerCase();
    if (n >= 1 && n <= THEMES.length) effects.setTheme(n - 1);
    else if (k === 'd') {
      els.debug.checked = !els.debug.checked;
      state.debug = els.debug.checked;
    } else if (k === 'g') toggleGuide();
    else if (k === 's') setSuit(!suit.target);
    else if (k === 'f' && suit.target) els.faceBtn.click();
    else if (k === 'o') toggleSettings();
  });

  if (!Recorder.supported()) {
    els.recordBtn.disabled = true;
    els.recordBtn.title = '이 브라우저는 녹화를 지원하지 않습니다';
  }
}

/* ===================== 시작 ===================== */

function resetStartButton(label) {
  els.startBtn.disabled = false;
  els.startBtn.classList.remove('busy');
  els.startLabel.textContent = label;
}

async function start() {
  els.startBtn.disabled = true;
  els.startBtn.classList.add('busy');
  els.startLabel.textContent = '카메라 연결 중…';
  setStatus('브라우저 상단에 카메라 허용 창이 뜨면 “허용”을 눌러 주세요.');
  const hintTimer = setTimeout(
    () => setStatus('허용 창이 안 보이면 주소창 왼쪽 카메라/자물쇠 아이콘에서 카메라를 “허용”으로 바꿔 주세요.'),
    10000
  );

  try {
    await startCamera(els.video);
  } catch (e) {
    clearTimeout(hintTimer);
    console.error(e);
    setStatus(explainCameraError(e), true);
    resetStartButton('다시 시도');
    return;
  }
  clearTimeout(hintTimer);

  // 카메라가 켜지면 바로 무대로 전환 (모델은 뒤에서 로딩)
  state.W = els.video.videoWidth || 1280;
  state.H = els.video.videoHeight || 720;
  els.canvas.width = state.W;
  els.canvas.height = state.H;
  effects.setBounds(state.W, state.H);

  els.intro.classList.add('leaving');
  setTimeout(() => (els.intro.hidden = true), 650);
  els.topbar.hidden = false;
  els.dock.hidden = false;
  applyAccent();
  state.running = true;
  requestAnimationFrame(loop);

  loadModel();
}

/** 손 인식 모델 로딩 (배너로 진행 상황 표시, 실패 시 재시도 버튼) */
async function loadModel() {
  showBanner('손 인식 준비 중…', 'loading');
  try {
    await tracker.init((msg) => showBanner(msg, 'loading'));
    showBanner('준비 완료! 카메라에 손을 보여 주세요 ✨', 'ok');
    setTimeout(() => {
      if (els.banner.classList.contains('ok')) hideBanner();
    }, 3500);
  } catch (e) {
    console.error(e);
    showBanner('손 인식을 시작하지 못했습니다: ' + (e.message || e), 'err', true);
  }
}

/* ===================== 메인 루프 ===================== */

let lastT = performance.now();
let fpsAcc = 0;
let fpsFrames = 0;
let fps = 0;
let loopErrorShown = false;

function loop(now) {
  if (!state.running) return;
  requestAnimationFrame(loop);
  try {
    tick(now);
  } catch (e) {
    console.error(e);
    if (!loopErrorShown) {
      loopErrorShown = true;
      showBanner('화면 처리 중 오류가 발생했습니다: ' + (e.message || e), 'err');
    }
  }
}

function tick(now) {
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  fpsAcc += dt;
  fpsFrames += 1;
  if (fpsAcc >= 0.5) {
    fps = Math.round(fpsFrames / fpsAcc);
    fpsAcc = 0;
    fpsFrames = 0;
  }

  const result = tracker.detect(els.video, now);
  const frame = gestures.update(result, state.W, state.H, state.mirror, now);

  const shouldPose = (suit.active || suit.target || (CONFIG.bodyMotion && CONFIG.bodyMotion.enabled)) && tracker.poseReady;
  const pose = shouldPose ? tracker.detectPose(els.video, now) : null;
  const poseMotion = gestures.updatePose(pose, state.W, state.H, state.mirror, now);

  suit.update(pose, state.W, state.H, state.mirror, dt, now);
  for (const l of suit.consumeLands()) {
    effects.burstAt(l.x, l.y, l.name === 'helmet' ? 90 : 45, l.size);
  }
  handleSuitCall(frame, now);
  setHint(suit.target && suit.active && !suit.poseOk ? '상체(어깨)가 화면에 보이도록 조금 뒤로 물러서 주세요' : '');

  drawingEngine.setBounds(state.W, state.H);

  if (frame.events.some((e) => e.type === 'toggle_drawing')) {
    setDrawingMode();
  }

  if (state.drawingMode) {
    updateMotionPalette(frame, now);

    let lastCycleAt = state.lastCycleAt || 0;
    const hasEv = (t) => frame.events.some((e) => e.type === t);

    // 🤟 손가락 3개 -> 색상 순환 변경
    if (hasEv('enter') && frame.events.some((e) => e.gesture === 'finger_3') && now - lastCycleAt > 1200) {
      state.lastCycleAt = now;
      cycleDrawColor();
    }
    // ✌️ V-사인 -> 펜 도구 순환 변경
    else if (hasEv('enter') && frame.events.some((e) => e.gesture === 'peace') && now - lastCycleAt > 1200) {
      state.lastCycleAt = now;
      cycleDrawTool();
    }
    // 🖐️ 손가락 4개 -> 전체 지우기
    else if (hasEv('enter') && frame.events.some((e) => e.gesture === 'finger_4') && now - lastCycleAt > 1500) {
      state.lastCycleAt = now;
      drawingEngine.clear();
      showToast('🗑️', '전체 지우기', '드로잉 캔버스가 초기화되었습니다', true);
    }

    for (const h of frame.hands) {
      // 오직 검지 손가락만 펼쳤을 때만(point / fingerCount 1) 펜으로 그려짐
      const isPen = h.gesture === 'point' || (h.fingerCount === 1 && h.tips.index);
      if (isPen) {
        drawingEngine.drawPoint(h.slot, h.tips.index.x, h.tips.index.y, particles);
      } else {
        // 주먹을 쥐거나(fist) 검지를 접은 경우에는 펜 떼기 (드로잉 안 됨)
        drawingEngine.liftPoint(h.slot);
      }
    }
  } else {
    for (const h of frame.hands) {
      drawingEngine.liftPoint(h.slot);
    }
  }

  effects.update(frame, dt, now, poseMotion);
  particles.update(dt);
  toastFromFrame(frame);

  render(frame, now);
  updateHud(frame);
}


function render(frame, now) {
  const { W, H } = state;
  ctx.save();
  // 캔버스 상태 완전 초기화 (흐림/어두움 잔상 방지)
  ctx.globalAlpha = 1.0;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  const s = effects.shakeOffset();
  ctx.translate(s.x, s.y);

  // 카메라 원본 영상 (선명하게 렌더링)
  ctx.save();
  ctx.globalAlpha = 1.0;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  if (state.mirror) {
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(els.video, 0, 0, W, H);
  ctx.restore();

  suit.draw(ctx, W, H, now); // 슈트 아머
  particles.draw(ctx);
  drawingEngine.render(ctx); // 드로잉 레이어 합성 (선명하게 유지)
  effects.draw(ctx, W, H, now);
  drawMotionPaletteCursor(ctx, now); // 모션 팔레트 호버 커서 & 프로그레스 링
  if (state.skeleton || state.debug) drawHands(frame);
  suit.drawHud(ctx, W, H, now, frame.hands);
  suit.drawOverlay(ctx, W, H, now);
  if (state.debug) drawDebug(frame);
  ctx.restore();
}

/** 손 윤곽 + 손끝 빛 (인식되고 있다는 것을 바로 보여 준다) */
function drawHands(frame) {
  const th = effects.theme;
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  for (const h of frame.hands) {
    ctx.beginPath();
    for (const [a, b] of HAND_LINES) {
      ctx.moveTo(h.pts[a].x, h.pts[a].y);
      ctx.lineTo(h.pts[b].x, h.pts[b].y);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    const spr = getSprite(effects.suitMode ? '120,230,255' : th.core);
    for (const i of TIPS) {
      ctx.drawImage(spr, h.pts[i].x - 16, h.pts[i].y - 16, 32, 32);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

function drawDebug(frame) {
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.font = '600 22px sans-serif';
  for (const h of frame.hands) {
    for (const p of h.pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const label = `${GESTURE_LABEL[h.gesture] || h.gesture} (${GESTURE_LABEL[h.raw] || h.raw})`;
    ctx.fillText(label, h.center.x - 40, h.center.y - h.size * 1.4);
  }
  const pose = suit.poseOk ? '몸 OK' : '몸 -';
  ctx.fillText(`FPS ${fps} · ${tracker.delegate} · 파티클 ${particles.count} · ${pose}`, 16, state.H - 16);
  ctx.restore();
}

function updateHud(frame) {
  if (!state.showToast) {
    els.hud.hidden = true;
    return;
  }
  els.hud.hidden = false;
  const g = frame.hands.map((h) => GESTURE_EMOJI[h.gesture] || '·').join(' ');
  const suitTag = suit.target ? ' · 🦾' : '';
  els.hud.textContent = `${effects.theme.emoji} ${effects.theme.label}${suitTag} · ${g || '손을 보여 주세요'}`;
}

/* ===================== 초기화 ===================== */

buildThemeButtons();
applyAccent();
bindControls();
els.startBtn.addEventListener('click', start);

// 탭이 숨겨지면 녹화 중지 (실수로 길게 녹화되는 것 방지)
document.addEventListener('visibilitychange', () => {
  if (document.hidden && recorder.recording) {
    recorder.stop();
    els.recordLabel.textContent = '녹화';
    els.recordBtn.classList.remove('rec');
  }
});

// 모듈이 정상 실행되었음을 index.html의 부팅 점검에 알린다
window.__booted = true;
