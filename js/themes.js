/**
 * themes.js — 효과 테마 정의
 *  palette : 파티클 색(r,g,b 문자열) 목록
 *  core    : 빛 덩어리·충격파 색
 *  bolt    : 번개 색
 *  gravity : 세로 가속(px/s²) — 음수면 위로 상승
 *  jitter  : 무작위 흔들림 세기
 *  size    : [최소, 최대] 파티클 반지름(px)
 *  life    : [최소, 최대] 수명(초)
 *  swatch  : 버튼 색 표시용 CSS 색
 *  emoji   : 안내 문구·버튼에 쓰는 이모지
 */
export const THEMES = [
  {
    id: 'fire',
    emoji: '🔥',
    label: '불꽃',
    palette: ['255,225,130', '255,150,50', '255,80,25'],
    core: '255,150,60',
    bolt: '255,200,120',
    gravity: -260,
    jitter: 90,
    size: [10, 26],
    life: [0.5, 1.1],
    swatch: 'linear-gradient(135deg,#ffd36b,#ff4d1f)',
  },
  {
    id: 'ice',
    emoji: '❄️',
    label: '얼음',
    palette: ['235,250,255', '150,220,255', '90,170,255'],
    core: '130,200,255',
    bolt: '220,245,255',
    gravity: -20,
    jitter: 130,
    size: [4, 12],
    life: [0.9, 1.6],
    swatch: 'linear-gradient(135deg,#eafcff,#4aa8ff)',
  },
  {
    id: 'lightning',
    emoji: '⚡',
    label: '번개',
    palette: ['255,255,200', '190,160,255', '255,255,255'],
    core: '190,160,255',
    bolt: '255,255,230',
    gravity: 0,
    jitter: 600,
    size: [3, 8],
    life: [0.25, 0.5],
    swatch: 'linear-gradient(135deg,#fff7a8,#8f6bff)',
  },
  {
    id: 'sakura',
    emoji: '🌸',
    label: '벚꽃',
    palette: ['255,225,235', '255,170,200', '255,120,170'],
    core: '255,160,200',
    bolt: '255,215,230',
    gravity: 60,
    jitter: 90,
    size: [7, 14],
    life: [1.2, 2.2],
    swatch: 'linear-gradient(135deg,#ffe4ee,#ff6fa5)',
  },
  {
    id: 'neon',
    emoji: '🌈',
    label: '네온',
    palette: ['60,255,240', '255,70,200', '170,255,80'],
    core: '70,230,255',
    bolt: '255,120,220',
    gravity: 0,
    jitter: 200,
    size: [5, 12],
    life: [0.6, 1.2],
    swatch: 'linear-gradient(135deg,#3cfff0,#ff46c8)',
  },
];
