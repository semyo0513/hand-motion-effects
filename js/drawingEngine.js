/**
 * drawingEngine.js — 손가락(검지) 드로잉 모드 관리자
 *
 * 기능:
 *  1) 검지 손가락 위치로 화면 상에 자유자재 그림 그리기
 *  2) 네온 글루 펜, 마커 펜, 스파크 펜, 지우개 지원
 *  3) 색상 팔레트 & 두께 조절 슬라이더
 *  4) 전체 지우기, 그림 다운로드(PNG), 드로잉 모드 종료/유지
 */
const TAU = Math.PI * 2;

function hexToRgb(hex) {
  let c = (hex || '#00f0ff').replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  const num = parseInt(c, 16) || 0;
  return `${(num >> 16) & 255},${(num >> 8) & 255},${num & 255}`;
}

export class DrawingEngine {
  constructor() {
    this.enabled = false;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.W = 1280;
    this.H = 720;
    this.color = '#00f0ff';
    this.tool = 'glow'; // 'glow' | 'marker' | 'spark' | 'eraser'
    this.size = 8;
    this.lastPts = new Map(); // slot -> {x, y}
    this.hasStrokes = false;

    this.canvas.width = this.W;
    this.canvas.height = this.H;
  }

  setBounds(W, H) {
    if (this.W === W && this.H === H) return;
    const temp = document.createElement('canvas');
    temp.width = this.W;
    temp.height = this.H;
    temp.getContext('2d').drawImage(this.canvas, 0, 0);

    this.W = W;
    this.H = H;
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx.drawImage(temp, 0, 0, W, H);
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (!on) this.lastPts.clear();
  }

  setColor(c) {
    this.color = c || '#00f0ff';
  }

  setTool(t) {
    this.tool = t || 'glow';
  }

  setSize(s) {
    this.size = Math.max(2, Math.min(80, Number(s) || 8));
  }

  clear() {
    this.ctx.clearRect(0, 0, this.W, this.H);
    this.hasStrokes = false;
    this.lastPts.clear();
  }

  /** 검지 손가락 위치로 캔버스에 선 그리기 */
  drawPoint(slot, x, y, particleSystem) {
    const prev = this.lastPts.get(slot);
    this.ctx.save();
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    if (this.tool === 'eraser') {
      this.ctx.globalCompositeOperation = 'destination-out';
      this.ctx.beginPath();
      if (prev) {
        this.ctx.lineWidth = this.size * 2.5;
        this.ctx.moveTo(prev.x, prev.y);
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
      } else {
        this.ctx.arc(x, y, this.size * 1.25, 0, TAU);
        this.ctx.fill();
      }
    } else if (this.tool === 'glow') {
      this.ctx.globalCompositeOperation = 'source-over';
      // 네온 글로우 외곽
      this.ctx.shadowColor = this.color;
      this.ctx.shadowBlur = this.size * 1.8;
      this.ctx.strokeStyle = this.color;
      this.ctx.lineWidth = this.size;
      this.ctx.beginPath();
      if (prev) {
        this.ctx.moveTo(prev.x, prev.y);
        this.ctx.lineTo(x, y);
      } else {
        this.ctx.arc(x, y, this.size / 2, 0, TAU);
      }
      this.ctx.stroke();

      // 밝은 코어 중심선
      this.ctx.shadowBlur = 0;
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = Math.max(1.5, this.size * 0.35);
      this.ctx.stroke();
      this.hasStrokes = true;
    } else if (this.tool === 'spark') {
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.shadowColor = this.color;
      this.ctx.shadowBlur = this.size;
      this.ctx.strokeStyle = this.color;
      this.ctx.lineWidth = this.size;
      this.ctx.beginPath();
      if (prev) {
        this.ctx.moveTo(prev.x, prev.y);
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
      }
      this.hasStrokes = true;

      // 스파크 입자 가사 튀김
      if (particleSystem && Math.random() < 0.65) {
        const rgb = hexToRgb(this.color);
        particleSystem.emit({
          x: x + (Math.random() - 0.5) * 14,
          y: y + (Math.random() - 0.5) * 14,
          vx: (Math.random() - 0.5) * 120,
          vy: (Math.random() - 0.5) * 120,
          life: 0.35,
          size: Math.random() * 6 + 3,
          rgb,
          gravity: 80,
          drag: 0.92,
        });
      }
    } else {
      // 마커 (솔리드)
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.shadowBlur = 0;
      this.ctx.fillStyle = this.color;
      this.ctx.strokeStyle = this.color;
      this.ctx.lineWidth = this.size;
      this.ctx.beginPath();
      if (prev) {
        this.ctx.moveTo(prev.x, prev.y);
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
      } else {
        this.ctx.arc(x, y, this.size / 2, 0, TAU);
        this.ctx.fill();
      }
      this.hasStrokes = true;
    }

    this.ctx.restore();
    this.lastPts.set(slot, { x, y });
  }

  liftPoint(slot) {
    this.lastPts.delete(slot);
  }

  /** 메인 캔버스 상에 드로잉 레이어 합성 */
  render(mainCtx) {
    if (!this.hasStrokes && !this.enabled) return;
    mainCtx.save();
    mainCtx.globalAlpha = 1.0;
    mainCtx.globalCompositeOperation = 'source-over';
    mainCtx.drawImage(this.canvas, 0, 0);
    mainCtx.restore();
  }

  /** 완성된 그림 다운로드 (PNG 저장) */
  download(videoElement, mirror) {
    const out = document.createElement('canvas');
    out.width = this.W;
    out.height = this.H;
    const octx = out.getContext('2d');

    // 1. 카메라 원본 영상 캡처 (선택적 배경)
    if (videoElement && videoElement.videoWidth) {
      octx.save();
      if (mirror) {
        octx.translate(this.W, 0);
        octx.scale(-1, 1);
      }
      octx.drawImage(videoElement, 0, 0, this.W, this.H);
      octx.restore();
    } else {
      octx.fillStyle = '#0b0a14';
      octx.fillRect(0, 0, this.W, this.H);
    }

    // 2. 드로잉 레이어 합성
    octx.drawImage(this.canvas, 0, 0);

    const a = document.createElement('a');
    a.download = `hand-drawing-${Date.now()}.png`;
    a.href = out.toDataURL('image/png');
    a.click();
  }
}
