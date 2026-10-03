/**
 * handTracker.js — MediaPipe 손/몸 인식 래퍼
 *  - 손 인식(HandLandmarker)은 시작 시, 몸 인식(PoseLandmarker)은 슈트를 켤 때 불러온다.
 *  - 모든 단계에 시간 제한을 두어 "멈춘 것처럼" 보이지 않게 하고, 진행 상황을 콜백으로 알린다.
 *  - GPU delegate 우선, 실패하면 CPU로 대체한다.
 */
import { CONFIG } from './config.js';

const EMPTY = { landmarks: [] };

/** promise에 시간 제한을 건다 */
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} 시간 초과 (${Math.round(ms / 1000)}초)`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export class HandTracker {
  constructor() {
    this.hand = null;
    this.pose = null;
    this.delegate = '';
    this._lib = null; // { lib, vision }
    this._handPromise = null;
    this._posePromise = null;
    this.lastHandTime = -1;
    this.lastPoseTime = -1;
    this.lastHand = EMPTY;
    this.lastPose = null;
  }

  get ready() {
    return !!this.hand;
  }
  get poseReady() {
    return !!this.pose;
  }

  /** 라이브러리 + wasm 로딩 (한 번만) */
  async _loadLib(onStep) {
    if (this._lib) return this._lib;
    const mp = CONFIG.mediapipe;
    let lib = null;
    let wasmUrl = '';
    let lastError = null;

    onStep && onStep('손 인식 라이브러리를 불러오는 중…');
    for (const c of mp.candidates) {
      try {
        lib = await withTimeout(import(c.module), mp.timeouts.library, '라이브러리 로딩');
        wasmUrl = c.wasm;
        break;
      } catch (e) {
        lastError = e;
        console.warn('[Tracker] 라이브러리 로딩 실패, 다음 주소 시도:', c.module, e);
      }
    }
    if (!lib) {
      throw new Error('손 인식 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요. (' + (lastError && lastError.message) + ')');
    }

    onStep && onStep('인식 엔진(wasm)을 준비하는 중…');
    const vision = await withTimeout(lib.FilesetResolver.forVisionTasks(wasmUrl), mp.timeouts.wasm, '인식 엔진 준비');
    this._lib = { lib, vision };
    return this._lib;
  }

  /** GPU → CPU 순으로 landmarker 생성 */
  async _create(factory, onStep, label) {
    const t = CONFIG.mediapipe.timeouts;
    try {
      onStep && onStep(`${label} 모델을 불러오는 중… (GPU)`);
      const lm = await withTimeout(factory('GPU'), t.modelGpu, `${label} 모델(GPU)`);
      this.delegate = 'GPU';
      return lm;
    } catch (e) {
      console.warn(`[Tracker] ${label} GPU 사용 불가, CPU로 대체:`, e);
      onStep && onStep(`${label} 모델을 불러오는 중… (CPU)`);
      const lm = await withTimeout(factory('CPU'), t.modelCpu, `${label} 모델(CPU)`);
      this.delegate = 'CPU';
      return lm;
    }
  }

  /** 손 인식 준비. 이미 준비/진행 중이면 같은 결과를 돌려준다. */
  init(onStep) {
    if (this.hand) return Promise.resolve();
    if (!this._handPromise) {
      this._handPromise = (async () => {
        const { lib, vision } = await this._loadLib(onStep);
        const mp = CONFIG.mediapipe;
        this.hand = await this._create(
          (delegate) =>
            lib.HandLandmarker.createFromOptions(vision, {
              baseOptions: { modelAssetPath: mp.modelUrl, delegate },
              runningMode: 'VIDEO',
              numHands: mp.numHands,
              minHandDetectionConfidence: mp.minDetectionConfidence,
              minHandPresenceConfidence: mp.minPresenceConfidence,
              minTrackingConfidence: mp.minTrackingConfidence,
            }),
          onStep,
          '손 인식'
        );
      })().catch((e) => {
        this._handPromise = null; // 재시도 가능하게 초기화
        throw e;
      });
    }
    return this._handPromise;
  }

  /** 몸(포즈) 인식 준비 — 슈트를 켤 때 호출 */
  initPose(onStep) {
    if (this.pose) return Promise.resolve();
    if (!this._posePromise) {
      this._posePromise = (async () => {
        const { lib, vision } = await this._loadLib(onStep);
        const mp = CONFIG.mediapipe;
        this.pose = await this._create(
          (delegate) =>
            lib.PoseLandmarker.createFromOptions(vision, {
              baseOptions: { modelAssetPath: mp.poseModelUrl, delegate },
              runningMode: 'VIDEO',
              numPoses: 1,
              minPoseDetectionConfidence: 0.5,
              minPosePresenceConfidence: 0.5,
              minTrackingConfidence: 0.5,
            }),
          onStep,
          '몸 인식'
        );
      })().catch((e) => {
        this._posePromise = null;
        throw e;
      });
    }
    return this._posePromise;
  }

  /** 손 검출 (같은 영상 프레임이면 이전 결과 재사용) */
  detect(video, nowMs) {
    if (!this.hand) return EMPTY;
    if (video.currentTime === this.lastHandTime) return this.lastHand;
    this.lastHandTime = video.currentTime;
    try {
      const r = this.hand.detectForVideo(video, Math.round(nowMs));
      this.lastHand = { landmarks: (r && r.landmarks) || [] };
    } catch (e) {
      console.warn('[Tracker] 손 검출 오류:', e);
      this.lastHand = EMPTY;
    }
    return this.lastHand;
  }

  /** 몸 검출 → 33개 랜드마크 배열 또는 null (프레임레이트 저하 방지를 위해 최대 30fps 제한) */
  detectPose(video, nowMs) {
    if (!this.pose) return null;
    if (video.currentTime === this.lastPoseTime) return this.lastPose;
    if (this.lastPoseDetectMs && nowMs - this.lastPoseDetectMs < 32) return this.lastPose;
    this.lastPoseDetectMs = nowMs;
    this.lastPoseTime = video.currentTime;
    try {
      const r = this.pose.detectForVideo(video, Math.round(nowMs));
      this.lastPose = r && r.landmarks && r.landmarks[0] ? r.landmarks[0] : null;
    } catch (e) {
      console.warn('[Tracker] 몸 검출 오류:', e);
      this.lastPose = null;
    }
    return this.lastPose;
  }

  close() {
    if (this.hand) this.hand.close();
    if (this.pose) this.pose.close();
    this.hand = this.pose = null;
    this._handPromise = this._posePromise = null;
  }
}
