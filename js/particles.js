/**
 * particles.js — 가산 혼합(빛 번짐) 파티클 시스템
 *  - 색별 글로우 스프라이트를 한 번만 만들어 재사용 (성능)
 *  - 동시 개수 상한(max)을 넘으면 새 파티클을 만들지 않는다
 */

const spriteCache = new Map();

/** 'r,g,b' 문자열로 부드러운 원형 글로우 스프라이트를 만든다(캐시). */
export function getSprite(rgb) {
  let sprite = spriteCache.get(rgb);
  if (!sprite) {
    sprite = document.createElement('canvas');
    sprite.width = sprite.height = 64;
    const g = sprite.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, `rgba(${rgb},1)`);
    grad.addColorStop(0.35, `rgba(${rgb},0.55)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    spriteCache.set(rgb, sprite);
  }
  return sprite;
}

export class ParticleSystem {
  constructor(max = 1600) {
    this.max = max;
    this.list = [];
  }

  get count() {
    return this.list.length;
  }

  /**
   * 파티클 1개 추가
   * @param {object} o x,y,vx,vy,life,size,rgb 필수 / gravity,jitter,drag,grow,tx,ty,pull 선택
   *   tx,ty,pull : 목표점으로 끌어당기는 힘(수렴·공전 효과)
   */
  emit(o) {
    if (this.list.length >= this.max) return;
    this.list.push({
      x: o.x,
      y: o.y,
      vx: o.vx || 0,
      vy: o.vy || 0,
      life: o.life,
      maxLife: o.life,
      size: o.size,
      sprite: getSprite(o.rgb),
      gravity: o.gravity || 0,
      jitter: o.jitter || 0,
      drag: o.drag === undefined ? 1 : o.drag,
      grow: o.grow || 0,
      tx: o.tx || 0,
      ty: o.ty || 0,
      pull: o.pull || 0,
    });
  }

  /** 물리 갱신 (dt: 초) */
  update(dt) {
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) {
        list[i] = list[list.length - 1];
        list.pop();
        continue;
      }
      if (p.pull) {
        p.vx += (p.tx - p.x) * p.pull * dt;
        p.vy += (p.ty - p.y) * p.pull * dt;
      }
      p.vy += p.gravity * dt;
      if (p.jitter) {
        p.vx += (Math.random() - 0.5) * p.jitter * dt;
        p.vy += (Math.random() - 0.5) * p.jitter * dt;
      }
      const d = Math.pow(p.drag, dt * 60); // 프레임레이트와 무관한 감속
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
    }
  }

  /** 그리기 (가산 혼합) */
  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.list) {
      const t = p.life / p.maxLife;
      const s = Math.max(0.5, p.size * (0.4 + 0.6 * t));
      ctx.globalAlpha = Math.min(1, t * 1.6);
      ctx.drawImage(p.sprite, p.x - s, p.y - s, s * 2, s * 2);
    }
    ctx.restore();
  }

  clear() {
    this.list.length = 0;
  }
}
