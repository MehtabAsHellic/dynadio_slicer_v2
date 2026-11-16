import type { ColorMode } from './types';

export const STROKE_PALETTE = [
  '#2ca9e1',
  '#f5c400',
  '#36c98c',
  '#f07a5a',
  '#8b7cf6',
  '#20bcc4',
  '#e15a9c',
  '#7aa7ff',
  '#f2a23a',
  '#5cc0e8',
  '#9ed44e',
  '#e46a7a',
  '#63b3ed',
  '#d9a441',
  '#54c7a2',
  '#b48cf2',
  '#ef9b58',
  '#67b7d1',
  '#c3d94e',
  '#e887b1',
];

const RGB_CACHE = new Map<string, [number, number, number]>();

export function hexToRgb(hex: string): [number, number, number] {
  const cached = RGB_CACHE.get(hex);
  if (cached) return cached;
  const clean = hex.replace('#', '');
  const value = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = Number.parseInt(value, 16);
  const rgb: [number, number, number] = [
    ((num >> 16) & 255) / 255,
    ((num >> 8) & 255) / 255,
    (num & 255) / 255,
  ];
  RGB_CACHE.set(hex, rgb);
  return rgb;
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number] = [0, 0, 0];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = l - c / 2;
  return [rgb[0] + m, rgb[1] + m, rgb[2] + m];
}

export function layerColor(fraction: number): [number, number, number] {
  // Blue at the bottom, through cyan and green, to warm yellow at the top.
  const hue = 205 - 165 * Math.min(1, Math.max(0, fraction));
  return hslToRgb(hue, 0.72, 0.56);
}

export function strokeColor(index: number): [number, number, number] {
  return hexToRgb(STROKE_PALETTE[index % STROKE_PALETTE.length]);
}

export function colorForSegment(
  mode: ColorMode,
  strokeIndex: number,
  zFraction: number,
  pumpOn: boolean,
  kick: boolean,
  material: [number, number, number],
): [number, number, number] {
  switch (mode) {
    case 'stroke':
      return strokeColor(strokeIndex + 1);
    case 'layer':
      return layerColor(zFraction);
    case 'speed':
      return hexToRgb('#54c7a2');
    case 'pump':
      return pumpOn ? (kick ? hexToRgb('#f5c400') : hexToRgb('#2ca9e1')) : hexToRgb('#8794a5');
    default:
      return material;
  }
}

export function cssColor(rgb: [number, number, number], alpha = 1): string {
  return `rgba(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)}, ${alpha})`;
}
