// Tiny colour helpers: palettes are authored as hex and blended as RGB triples.
export const rgb = hex => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
export const css = (c, alpha = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha})`;
export const toHex = c => (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]);

// Sticker palette for pop lettering: each glyph cycles through these fills.
export const CANDY = ['#ff5fa2', '#4cc9f0', '#ffd23f', '#9b7bff', '#5ee6a8', '#ff8c42'];
