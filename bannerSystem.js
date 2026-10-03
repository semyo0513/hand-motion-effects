/**
 * bannerSystem.js — 커스텀 업로드 이미지 & 글자 배너 관리자
 *
 * 기능:
 *  1) 설정 탭에서 업로드한 이미지(file) 또는 입력한 텍스트 저장
 *  2) 지정된 모션(손가락 3개, 하트, 박수, 슈트착용, 손바닥 등) 발생 시 배너 애니메이션 발동
 *  3) Canvas overlay 상에 고급 네온/홀로그램 HUD 스타일 배너 렌더링
 */
import { CONFIG } from './config.js';
import { getSprite } from './particles.js';

export class BannerManager {
  constructor() {
    this.text = CONFIG.banner.text;
    this.imageUrl = CONFIG.banner.imageUrl;
    this.imageObj = null;
    this.triggerGesture = CONFIG.banner.triggerGesture; // 'finger_3' | 'heart' | 'clap' | 'suit_on' | 'finger_5'
    this.style = CONFIG.banner.style; // 'neon' | 'hologram' | 'gold' | 'glass'
    this.durationMs = CONFIG.banner.durationMs;
    this.animation = CONFIG.banner.animation; // 'zoom' | 'slide' | 'pulse'

    this.active = false;
    this.startTime = 0;
    this.progress = 0;
    this.triggerCount = 0;
    this.lastTriggerAt = -1e9;

    if (this.imageUrl) {
      this._loadImage(this.imageUrl);
    }
  }

  setImage(dataUrl) {
    this.imageUrl = dataUrl;
    CONFIG.banner.imageUrl = dataUrl;
    if (dataUrl) {
      this._loadImage(dataUrl);
    } else {
      this.imageObj = null;
    }
  }

  setText(str) {
    this.text = str || '2026 창순기획';
    CONFIG.banner.text = this.text;
  }

  setTriggerGesture(g) {
    this.triggerGesture = g;
    CONFIG.banner.triggerGesture = g;
  }

  setStyle(s) {
    this.style = s;
    CONFIG.banner.style = s;
  }

  setAnimation(a) {
    this.animation = a;
    CONFIG.banner.animation = a;
  }

  setDuration(ms) {
    this.durationMs = Number(ms) || 3000;
    CONFIG.banner.durationMs = this.durationMs;
  }

  _loadImage(url) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.imageObj = img;
    };
    img.src = url;
  }

  /** 모션 트리거 검사 */
  checkTrigger(gestureKey, now) {
    if (this.triggerGesture === gestureKey && now - this.lastTriggerAt > 1500) {
      this.fire(now);
      return true;
    }
    return false;
  }

  /** 배너 강제 연출 발동 */
  fire(now) {
    this.active = true;
    this.startTime = now;
    this.lastTriggerAt = now;
    this.triggerCount++;
  }

  update(now) {
    if (!this.active) return;
    const elapsed = now - this.startTime;
    if (elapsed > this.durationMs) {
      this.active = false;
      this.progress = 0;
      return;
    }
    this.progress = elapsed / this.durationMs; // 0 ~ 1
  }

  /** Canvas 렌더링 */
  draw(ctx, W, H, now) {
    if (!this.active) return;

    const p = this.progress;
    // Enter & Exit scale/alpha
    let alpha = 1;
    let scale = 1;
    let translateY = 0;

    if (p < 0.15) {
      const t = p / 0.15;
      if (this.animation === 'zoom') {
        scale = 0.3 + 0.7 * t;
        alpha = t;
      } else if (this.animation === 'slide') {
        translateY = -80 * (1 - t);
        alpha = t;
      } else {
        scale = 1 + 0.2 * Math.sin(t * Math.PI);
        alpha = t;
      }
    } else if (p > 0.85) {
      const t = (p - 0.85) / 0.15;
      alpha = 1 - t;
      if (this.animation === 'zoom') scale = 1 + 0.3 * t;
      if (this.animation === 'slide') translateY = 50 * t;
    }

    const cx = W / 2;
    const cy = H * 0.28 + translateY;
    const bw = Math.min(W * 0.75, 540);
    const bh = this.imageObj ? 140 : 90;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    // Style gradients & borders
    let bgGrad, strokeStyle, textColor, glowColor;
    if (this.style === 'hologram') {
      bgGrad = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
      bgGrad.addColorStop(0, 'rgba(0, 200, 255, 0.45)');
      bgGrad.addColorStop(0.5, 'rgba(0, 100, 220, 0.65)');
      bgGrad.addColorStop(1, 'rgba(0, 200, 255, 0.45)');
      strokeStyle = '#50e0ff';
      textColor = '#ffffff';
      glowColor = '80,220,255';
    } else if (this.style === 'gold') {
      bgGrad = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
      bgGrad.addColorStop(0, 'rgba(230, 178, 48, 0.5)');
      bgGrad.addColorStop(0.5, 'rgba(120, 80, 10, 0.75)');
      bgGrad.addColorStop(1, 'rgba(230, 178, 48, 0.5)');
      strokeStyle = '#ffe08a';
      textColor = '#fff2cd';
      glowColor = '255,200,80';
    } else if (this.style === 'glass') {
      bgGrad = ctx.createLinearGradient(-bw / 2, -bh / 2, bw / 2, bh / 2);
      bgGrad.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
      bgGrad.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
      strokeStyle = 'rgba(255, 255, 255, 0.6)';
      textColor = '#ffffff';
      glowColor = '255,255,255';
    } else {
      // Neon default
      bgGrad = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
      bgGrad.addColorStop(0, 'rgba(255, 50, 100, 0.5)');
      bgGrad.addColorStop(0.5, 'rgba(120, 20, 80, 0.7)');
      bgGrad.addColorStop(1, 'rgba(50, 200, 255, 0.5)');
      strokeStyle = '#ff5d9e';
      textColor = '#ffffff';
      glowColor = '255,90,160';
    }

    // Outer Glow
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(getSprite(glowColor), -bw * 0.6, -bh * 0.9, bw * 1.2, bh * 1.8);
    ctx.restore();

    // Box Container (rounded rect)
    const rx = -bw / 2;
    const ry = -bh / 2;
    const r = 16;
    ctx.beginPath();
    ctx.moveTo(rx + r, ry);
    ctx.lineTo(rx + bw - r, ry);
    ctx.quadraticCurveTo(rx + bw, ry, rx + bw, ry + r);
    ctx.lineTo(rx + bw, ry + bh - r);
    ctx.quadraticCurveTo(rx + bw, ry + bh, rx + bw - r, ry + bh);
    ctx.lineTo(rx + r, ry + bh);
    ctx.quadraticCurveTo(rx, ry + bh, rx, ry + bh - r);
    ctx.lineTo(rx, ry + r);
    ctx.quadraticCurveTo(rx, ry, rx + r, ry);
    ctx.closePath();

    ctx.fillStyle = bgGrad;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();

    // Corner HUD Brackets
    const brLen = 14;
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    for (const [bx, by, sx, sy] of [
      [rx, ry, 1, 1],
      [rx + bw, ry, -1, 1],
      [rx, ry + bh, 1, -1],
      [rx + bw, ry + bh, -1, -1],
    ]) {
      ctx.beginPath();
      ctx.moveTo(bx + sx * brLen, by);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx, by + sy * brLen);
      ctx.stroke();
    }

    // Content: Image + Text
    if (this.imageObj) {
      const imgH = bh - 24;
      const aspect = this.imageObj.width / (this.imageObj.height || 1);
      const imgW = Math.min(imgH * aspect, bw * 0.35);
      const imgX = rx + 16;
      const imgY = -imgH / 2;

      ctx.save();
      ctx.beginPath();
      ctx.rect(imgX, imgY, imgW, imgH);
      ctx.clip();
      ctx.drawImage(this.imageObj, imgX, imgY, imgW, imgH);
      ctx.restore();

      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = 2;
      ctx.strokeRect(imgX, imgY, imgW, imgH);

      // Text alongside image
      ctx.fillStyle = textColor;
      ctx.font = `900 ${Math.max(16, Math.min(24, bw / 20))}px "Pretendard Variable", sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const textX = imgX + imgW + 16;
      ctx.fillText(this.text, textX, 0, bw - imgW - 48);
    } else {
      // Centered Text
      ctx.fillStyle = textColor;
      ctx.font = `900 ${Math.max(20, Math.min(32, bw / 15))}px "Pretendard Variable", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = strokeStyle;
      ctx.shadowBlur = 10;
      ctx.fillText(this.text, 0, 0, bw - 32);
      ctx.shadowBlur = 0;
    }

    // Bottom Subtitle Tag
    ctx.font = '700 12px "Consolas", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.fillText('MOTION TRIGGERED BANNER · © 2026 창순기획', 0, bh / 2 - 10);

    ctx.restore();
  }
}
