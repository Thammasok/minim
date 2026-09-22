interface Oklch {
  l: number;
  c: number;
  h: number;
}

export function parseOklch(color: string): Oklch {
  const match = /^oklch\(\s*([\d.]+)\s+([\d.]+)(?:\s+([\d.]+))?\s*\)$/.exec(color.trim());
  if (!match) {
    throw new Error(`not an oklch color: ${color}`);
  }
  return {
    l: Number(match[1]),
    c: Number(match[2]),
    h: match[3] !== undefined ? Number(match[3]) : 0,
  };
}

export function relativeLuminance(color: string): number {
  const { l, c, h } = parseOklch(color);
  const hue = (h * Math.PI) / 180;
  const a = c * Math.cos(hue);
  const b = c * Math.sin(hue);

  const lmsL = l + 0.3963377774 * a + 0.2158037573 * b;
  const lmsM = l - 0.1055613458 * a - 0.0638541728 * b;
  const lmsS = l - 0.0894841775 * a - 1.291485548 * b;

  const lr = lmsL ** 3;
  const mr = lmsM ** 3;
  const sr = lmsS ** 3;

  const r = 4.0767416621 * lr - 3.3077115913 * mr + 0.2309699292 * sr;
  const g = -1.2684380046 * lr + 2.6097574011 * mr - 0.3413193965 * sr;
  const bl = -0.0041960863 * lr - 0.7034186147 * mr + 1.707614701 * sr;

  const clamp = (value: number): number => Math.min(1, Math.max(0, value));
  return 0.2126 * clamp(r) + 0.7152 * clamp(g) + 0.0722 * clamp(bl);
}

export function contrastRatio(a: string, b: string): number {
  const lumaA = relativeLuminance(a);
  const lumaB = relativeLuminance(b);
  const [lighter, darker] = lumaA >= lumaB ? [lumaA, lumaB] : [lumaB, lumaA];
  return (lighter + 0.05) / (darker + 0.05);
}

export const AA_TEXT_CONTRAST = 4.5;

export function meetsAA(fg: string, bg: string, threshold = AA_TEXT_CONTRAST): boolean {
  return contrastRatio(fg, bg) >= threshold;
}
