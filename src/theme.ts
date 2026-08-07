// theme.ts — 이음(ieum) design tokens for React Native (hex/rgba; no oklch/color-mix)
// LIGHT (white) edition — 3 directions: 기본(light) / 신호(signal) / 고대비(contrast)

export type Level = 'safe' | 'caution' | 'danger';
export type DirId = 'light' | 'signal' | 'contrast';

export interface StatusColor { fg: string; glow: string; }
export interface Theme {
  id: DirId;
  label: string;
  bg: string;
  bgGrad: string[];
  surface: string;
  surface2: string;
  border: string;
  text: string;
  textDim: string;
  textFaint: string;
  primary: string;
  primaryDim: string;
  onPrimary: string;
  radius: number;
  radiusSm: number;
  borderW: number;
  ambient: boolean;
  status: Record<Level, StatusColor>;
}

// hex + alpha -> rgba()
export function withAlpha(hex: string, a: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

// status hues tuned for readability on WHITE surfaces
const STATUS = {
  light: {
    safe: { fg: '#0f9d58', glow: 'rgba(15,157,88,0.22)' },
    caution: { fg: '#b9770a', glow: 'rgba(214,150,20,0.26)' },
    danger: { fg: '#d92d20', glow: 'rgba(217,45,32,0.26)' },
  },
  signal: {
    safe: { fg: '#0c9150', glow: 'rgba(12,145,80,0.30)' },
    caution: { fg: '#a86a00', glow: 'rgba(200,140,10,0.34)' },
    danger: { fg: '#d32316', glow: 'rgba(211,35,22,0.36)' },
  },
  contrast: {
    safe: { fg: '#067a3a', glow: 'rgba(6,122,58,0.30)' },
    caution: { fg: '#8a5300', glow: 'rgba(138,83,0,0.30)' },
    danger: { fg: '#c4001a', glow: 'rgba(196,0,26,0.34)' },
  },
} as const;

export const THEMES: Record<DirId, Theme> = {
  light: {
    id: 'light', label: '기본',
    bg: '#f5f8fd',
    bgGrad: ['#e9f1ff', '#f4f8fd', '#ffffff'],
    surface: '#ffffff',
    surface2: '#eef2f8',
    border: 'rgba(22,42,82,0.12)',
    text: '#15213c',
    textDim: '#5a6b86',
    textFaint: '#97a3b8',
    primary: '#2f6bff',
    primaryDim: '#1f4fd0',
    onPrimary: '#ffffff',
    radius: 26, radiusSm: 18, borderW: 1, ambient: false,
    status: STATUS.light,
  },
  signal: {
    id: 'signal', label: '신호',
    bg: '#f6f9fd',
    bgGrad: ['#eaf2ff', '#f5f9fd', '#ffffff'],
    surface: '#ffffff',
    surface2: '#eef2f8',
    border: 'rgba(22,42,82,0.14)',
    text: '#141f38',
    textDim: '#56667f',
    textFaint: '#909cb2',
    primary: '#2f6bff',
    primaryDim: '#1f4fd0',
    onPrimary: '#ffffff',
    radius: 20, radiusSm: 14, borderW: 1.5, ambient: true,
    status: STATUS.signal,
  },
  contrast: {
    id: 'contrast', label: '고대비',
    bg: '#ffffff',
    bgGrad: ['#ffffff', '#ffffff'],
    surface: '#ffffff',
    surface2: '#f0f0f0',
    border: '#000000',
    text: '#000000',
    textDim: '#1a1a1a',
    textFaint: '#555555',
    primary: '#0a3bd6',
    primaryDim: '#072a9c',
    onPrimary: '#ffffff',
    radius: 8, radiusSm: 6, borderW: 3, ambient: false,
    status: STATUS.contrast,
  },
};

// ambient background wash for the Signal theme, flooding with status color (light washes)
export function ambientGrad(theme: Theme, level: Level | 'idle'): string[] {
  if (!theme.ambient || !level || level === 'idle') return theme.bgGrad;
  const map: Record<Level, string[]> = {
    safe: ['#d6f3e1', '#edf9f2', '#ffffff'],
    caution: ['#fdecc6', '#fdf5e4', '#ffffff'],
    danger: ['#fcd9d4', '#fceeeb', '#ffffff'],
  };
  return map[level];
}

export const ACCENTS = ['#2f6bff', '#1f9e6e', '#7a52ff', '#e0612d'];
export const STATUS_LABEL: Record<Level, string> = { safe: '안전', caution: '주의', danger: '위험' };
