/**
 * recorder.js — 화면 캡처(PNG)와 녹화(webm/mp4)
 *  캔버스에 이미 영상+효과가 합성되어 있으므로 캔버스를 그대로 저장한다.
 *  (소리는 녹음하지 않음)
 */

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function pickMime() {
  const list = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  return list.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}

export class Recorder {
  constructor(canvas) {
    this.canvas = canvas;
    this.rec = null;
    this.chunks = [];
  }

  /** 녹화 기능 지원 여부 */
  static supported() {
    return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';
  }

  get recording() {
    return !!this.rec && this.rec.state === 'recording';
  }

  /** 현재 화면을 PNG로 저장 */
  capture() {
    return new Promise((resolve, reject) => {
      this.canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('캡처에 실패했습니다.'));
        download(blob, `hand-fx-${timestamp()}.png`);
        resolve();
      }, 'image/png');
    });
  }

  /** 녹화 시작 */
  start() {
    if (!Recorder.supported()) throw new Error('이 브라우저는 화면 녹화를 지원하지 않습니다.');
    if (this.recording) return;

    const mime = pickMime();
    const stream = this.canvas.captureStream(30);
    this.chunks = [];
    this.rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 5000000 } : undefined);
    this.rec.ondataavailable = (e) => {
      if (e.data && e.data.size) this.chunks.push(e.data);
    };
    this.rec.onstop = () => {
      const type = (this.rec && this.rec.mimeType) || mime || 'video/webm';
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      download(new Blob(this.chunks, { type }), `hand-fx-${timestamp()}.${ext}`);
      this.chunks = [];
    };
    this.rec.start(1000);
  }

  /** 녹화 종료 → 파일 자동 저장 */
  stop() {
    if (this.recording) this.rec.stop();
  }
}
