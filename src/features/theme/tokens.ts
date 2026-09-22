export type ThemeName = 'light' | 'dark';

export type MethodToken = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'other';

export interface MethodColors {
  get: string;
  post: string;
  put: string;
  patch: string;
  delete: string;
  other: string;
}

export interface UiTokens {
  background: string;
  method: MethodColors;
  varChip: string;
  varChipBg: string;
  warning: string;
}

export const methodTokens: readonly MethodToken[] = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'other',
];

export const tokens: Record<ThemeName, UiTokens> = {
  light: {
    background: 'oklch(1 0 0)',
    method: {
      get: 'oklch(0.52 0.13 155)',
      post: 'oklch(0.52 0.15 250)',
      put: 'oklch(0.55 0.14 70)',
      patch: 'oklch(0.54 0.13 300)',
      delete: 'oklch(0.54 0.19 27)',
      other: 'oklch(0.55 0 0)',
    },
    varChip: 'oklch(0.5 0.14 290)',
    varChipBg: 'oklch(0.95 0.03 290)',
    warning: 'oklch(0.55 0.18 70)',
  },
  dark: {
    background: 'oklch(0.145 0 0)',
    method: {
      get: 'oklch(0.75 0.15 155)',
      post: 'oklch(0.74 0.14 250)',
      put: 'oklch(0.78 0.14 70)',
      patch: 'oklch(0.76 0.13 300)',
      delete: 'oklch(0.71 0.18 27)',
      other: 'oklch(0.71 0 0)',
    },
    varChip: 'oklch(0.8 0.13 290)',
    varChipBg: 'oklch(0.3 0.06 290)',
    warning: 'oklch(0.73 0.14 70)',
  },
};
