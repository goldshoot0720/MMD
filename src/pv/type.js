// Foreground typography: one bottom sticker plate for every lyric line, plus the
// title card, chapter tabs, prop badges, news ticker and the ending card.
import { withoutPunctuation, fillText, strokeText, measureText } from './text.js';
import { CANDY, css } from './color.js';
import { SANS } from './bg.js';
import { clamp, hash, smooth } from './timeline.js';
import { stageOrder } from '../song-data.js';

const backOut = k => {
  k = clamp(k, 0, 1);
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
};
const SPACE_UNITS = 0.35; // what stickerRow gives a space, as a fraction of a glyph

// PingFang TC at weight 900, as a fraction of the font size. stickerRow draws Latin
// at measureText * 0.98, so these are that advance. Kana and Han stay 1. Counting
// Latin as a full em wraps an English line that still fits on one row.
const LATIN_EM = {
  A: 0.679, B: 0.69, C: 0.732, D: 0.72, E: 0.642, F: 0.582, G: 0.756, H: 0.736, I: 0.257,
  J: 0.538, K: 0.714, L: 0.592, M: 0.903, N: 0.732, O: 0.775, P: 0.655, Q: 0.775, R: 0.697,
  S: 0.651, T: 0.615, U: 0.734, V: 0.659, W: 0.953, X: 0.664, Y: 0.691, Z: 0.639,
  a: 0.572, b: 0.602, c: 0.561, d: 0.602, e: 0.567, f: 0.378, g: 0.602, h: 0.577, i: 0.275,
  j: 0.276, k: 0.553, l: 0.254, m: 0.884, n: 0.581, o: 0.6, p: 0.602, q: 0.602, r: 0.374,
  s: 0.525, t: 0.362, u: 0.582, v: 0.506, w: 0.777, x: 0.537, y: 0.526, z: 0.506,
  0: 0.6, 1: 0.41, 2: 0.6, 3: 0.6, 4: 0.6, 5: 0.6, 6: 0.6, 7: 0.553, 8: 0.6, 9: 0.6,
};
const glyphUnits = ch => {
  if (/\s/.test(ch)) return SPACE_UNITS;
  const cp = ch.codePointAt(0);
  if (cp >= 0xFF00 && cp <= 0xFFEF) return 1;
  const em = LATIN_EM[ch];
  if (em != null) return Math.ceil(em * 98) / 100;
  if (/\p{Script=Latin}/u.test(ch)) return 0.78;
  return 1;
};

// Width of a row in glyph units. Full-width glyphs count 1. Latin uses its real advance,
// so an English or romaji line that fits the plate stays on one row.
export const rowUnits = row => [...row].reduce((n, ch) => n + glyphUnits(ch), 0);

// Greedy wrap that prefers spaces and never exceeds `max` glyph units per row.
export function wrap(text, max) {
  const words = withoutPunctuation(text).trim().split(/[\s　]+/).filter(Boolean);
  const rows = [];
  let row = '';
  const push = () => { if (row) rows.push(row); row = ''; };
  for (const word of words) {
    const chars = [...word];
    if (rowUnits(word) > max) {
      push();
      let chunk = '';
      for (const ch of chars) {
        const next = chunk + ch;
        if (chunk && rowUnits(next) > max) { rows.push(chunk); chunk = ch; }
        else chunk = next;
      }
      if (chunk) rows.push(chunk);
      continue;
    }
    const joined = row ? `${row} ${word}` : word;
    if (row && rowUnits(joined) > max) { push(); row = word; } else row = joined;
  }
  push();
  // Balance a short orphan row with the one before it.
  if (rows.length > 1) {
    const last = [...rows[rows.length - 1]];
    const prev = [...rows[rows.length - 2]];
    if (last.length < prev.length / 3 && !rows[rows.length - 2].includes(' ')) {
      const all = prev.concat(last);
      const cut = Math.ceil(all.length / 2);
      rows.splice(rows.length - 2, 2, all.slice(0, cut).join(''), all.slice(cut).join(''));
    }
  }
  return rows;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// One sticker glyph: dark offset shadow, coloured outer rim, thick white outline, candy fill.
function stickerGlyph(ctx, ch, size, fill, rim) {
  ctx.lineJoin = 'round';
  ctx.fillStyle = 'rgba(30,15,45,.35)';
  fillText(ctx, ch, size * 0.06, size * 0.09);
  ctx.strokeStyle = rim;
  ctx.lineWidth = size * 0.34;
  strokeText(ctx, ch, 0, 0);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = size * 0.2;
  strokeText(ctx, ch, 0, 0);
  const g = ctx.createLinearGradient(0, -size * 0.5, 0, size * 0.5);
  g.addColorStop(0, fill);
  g.addColorStop(1, shade(fill));
  ctx.fillStyle = g;
  fillText(ctx, ch, 0, 0);
  // Gloss highlight.
  ctx.save();
  ctx.globalAlpha *= 0.35;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.rect(-size, -size * 0.6, size * 2, size * 0.42);
  ctx.clip();
  fillText(ctx, ch, 0, 0);
  ctx.restore();
}
const shade = hex => {
  const n = parseInt(hex.slice(1), 16);
  const f = v => Math.round(v * 0.72).toString(16).padStart(2, '0');
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
};

// Lay out and animate a row of sticker glyphs centred on (cx, cy).
// appear(i) gives each glyph's entrance time; `exit` (0..1) shrinks the row away.
function stickerRow(ctx, text, cx, cy, size, t, appear, { exit = 0, seed = 0, offset = 0, rim = '#3a1d52', alpha = 1 } = {}) {
  ctx.save();
  ctx.font = `900 ${size}px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const chars = [...text];
  const widths = chars.map(ch => (ch === ' ' ? size * 0.35 : measureText(ctx, ch).width * 0.98));
  const total = widths.reduce((a, b) => a + b, 0);
  let x = cx - total / 2;
  let n = 0;
  chars.forEach((ch, i) => {
    const w = widths[i];
    if (ch !== ' ') {
      const k = (t - appear(n)) / 0.32;
      if (k > 0) {
        const s = backOut(k) * (1 - smooth(exit));
        const wobble = Math.sin(t * 3.2 + i * 1.7 + seed) * 0.05;
        const hop = Math.sin(t * 6 + i * 0.6) * size * 0.025;
        ctx.save();
        ctx.translate(x + w / 2, cy + hop - (1 - smooth(k)) * size * 0.3);
        ctx.rotate(wobble + (hash(seed, i) - 0.5) * 0.16);
        ctx.scale(s, s);
        ctx.globalAlpha = smooth(k * 2) * (1 - smooth(exit)) * alpha;
        stickerGlyph(ctx, ch, size, CANDY[(n + offset) % CANDY.length], rim);
        ctx.restore();
      }
      n++;
    }
    x += w;
  });
  ctx.restore();
  return n;
}

// ---------------------------------------------------------------------------
// One lyric plate for every line. It lives in the bottom LYRIC_BAND of the frame;
// cameras keep heads, hands and feet above that band.
// ---------------------------------------------------------------------------
export const LYRIC_BAND = 0.2;

export function lyricLookDown(distance, fov, share = LYRIC_BAND * 0.45) {
  return share * 2 * distance * Math.tan((fov * Math.PI) / 360);
}

// Glyphs are capped by how wide the plate may get and by how tall the band is, and the
// two limits pull in opposite directions as rows are added. A long line is far more
// legible as two wide rows than as four cramped ones, so try every row count and keep
// whichever ends up with the biggest glyphs.
export const PLATE_WIDTH = 1620;
export const MAX_GLYPH = 88;
const ROW_FIT = 1.26; // glyph size = innerH / (rows × ROW_FIT); slack for the outline
const MAX_ROWS = 4;

// Greedy wrapping alone gives "one full row plus a stub" (36 / 20 / 17 for a long line).
// Binary-search the narrowest per-row budget that still fits in `rows` rows instead, so
// the rows come out even and the glyphs can be as large as the band allows.
function fitRows(text, rows) {
  const units = Math.max(1, rowUnits(text));
  let lo = Math.max(1, Math.ceil(units / rows));
  let hi = Math.max(lo, Math.ceil(units));
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (wrap(text, mid).length <= rows) hi = mid;
    else lo = mid + 1;
  }
  return wrap(text, lo);
}

function rowsFor(text, innerH) {
  let best = null;
  let single = null;
  for (let guess = 1; guess <= MAX_ROWS; guess++) {
    const rows = fitRows(text, guess);
    const longest = Math.max(1, ...rows.map(rowUnits));
    const size = Math.min(MAX_GLYPH, PLATE_WIDTH / longest, innerH / (rows.length * ROW_FIT));
    if (rows.length === 1) single = { rows, size };
    if (!best || size > best.size + 0.01) best = { rows, size };
  }
  // English and romaji are narrower than a full em. Keep one row whenever that
  // size is still readable; only wrap when one row would shrink below 40px.
  if (single && single.size >= 40) return single.rows;
  return best.rows;
}

// Drawn ink height as a fraction of the em, measured on PingFang TC 900.
// Chinese fills more of the em than kana, and much more than Latin capitals.
function inkOf(text) {
  const chars = [...text].filter(ch => !/\s/.test(ch));
  if (!chars.length) return 0.91;
  let latin = 0, kana = 0;
  for (const ch of chars) {
    if (/\p{Script=Latin}/u.test(ch) || /\p{Nd}/u.test(ch)) latin++;
    else if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(ch)) kana++;
  }
  const n = chars.length;
  if (latin / n >= 0.5) return 0.72;
  if (kana / n >= 0.35) return 0.84;
  return 0.91;
}

export function lyricPlate(text, H, inset = 0, translation = '') {
  text = withoutPunctuation(text);
  translation = withoutPunctuation(translation).trim();
  const bandTop = Math.round(H * (1 - LYRIC_BAND));
  const bandBottom = H - inset - 22;
  const pad = 12;
  const innerH = Math.max(36, bandBottom - bandTop - pad * 2);
  const translationGap = 6;
  const rows = rowsFor(text, innerH);
  const longest = Math.max(1, ...rows.map(rowUnits));
  let size = clamp(Math.min(MAX_GLYPH, innerH / (rows.length * ROW_FIT), PLATE_WIDTH / longest), 14, MAX_GLYPH);
  // Chinese ink is taller than kana and much taller than Latin at the same em.
  // Keep its drawn height just under the main language, never larger.
  const mainInk = inkOf(text);
  const translationRatio = Math.min(0.94, 0.92 * mainInk / 0.91);
  const widthCap = translation ? PLATE_WIDTH / Math.max(1, rowUnits(translation)) : 0;
  if (translation) {
    const want = Math.min(size * translationRatio, widthCap);
    const need = rows.length * size * 1.18 + translationGap + want * 1.2;
    if (need > innerH) size = Math.max(14, size * innerH / need);
  }
  const lineH = size * 1.18;
  const mainBlock = rows.length * lineH;
  const translationRoom = Math.max(0, (innerH - mainBlock - translationGap) / 1.2);
  const translationSize = translation
    ? Math.min(size * translationRatio, widthCap, translationRoom)
    : 0;
  const block = translation ? mainBlock + translationGap + translationSize * 1.2 : mainBlock;
  let top = bandTop + pad + Math.max(0, (innerH - block) / 2);
  if (top + block > bandBottom - 4) top = bandBottom - 4 - block;
  if (top < bandTop) top = bandTop;
  const translationY = top + mainBlock + translationGap + translationSize * 0.6;
  return { bandTop, bandBottom, size, rows, top, lineH, block, translation, translationSize, translationY };
}

function plateMode(ctx, line, t, W, H, inset) {
  const plate = lyricPlate(line.text, H, inset, line.translation);
  const fade = smooth((t - line.start) / 0.12);
  if (fade <= 0) return;
  ctx.save();
  ctx.letterSpacing = '0px';
  const shade = ctx.createLinearGradient(0, plate.bandTop, 0, H);
  shade.addColorStop(0, 'rgba(8,6,16,0)');
  shade.addColorStop(0.2, 'rgba(8,6,16,.5)');
  shade.addColorStop(1, 'rgba(8,6,16,.82)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, plate.bandTop, W, H - plate.bandTop);
  plate.rows.forEach((row, r) => {
    const y = plate.top + plate.lineH * (r + 0.5);
    stickerRow(ctx, row, W / 2, y, plate.size, t, () => line.start - 1, {
      seed: line.index * 7 + r,
      offset: line.index + r,
      alpha: fade,
    });
  });
  if (plate.translation) {
    const row = plate.rows.length;
    stickerRow(ctx, plate.translation, W / 2, plate.translationY, plate.translationSize, t, () => line.start - 1, {
      seed: line.index * 7 + row,
      offset: line.index + row,
      alpha: fade,
    });
  }
  ctx.restore();
}

export function drawLyric(ctx, line, t, look, W, H, { inset = 0 } = {}) {
  if (!line || t < line.start || t > line.end) return 0;
  plateMode(ctx, line, t, W, H, inset);
  return 0;
}

// ---------------------------------------------------------------------------
// Cards and HUD
// ---------------------------------------------------------------------------
function pill(ctx, x, y, text, { size = 24, fill = '#fff', ink = '#3a2a4a', border = '#ff5fa2', dot = true, spacing = 0 } = {}) {
  ctx.save();
  ctx.font = `800 ${size}px ${SANS}`;
  ctx.letterSpacing = `${spacing}px`;
  const w = measureText(ctx, text).width + size * (dot ? 3.2 : 1.8);
  const h = size * 2;
  ctx.fillStyle = fill;
  ctx.shadowColor = 'rgba(20,10,40,.3)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 5;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 4;
  ctx.strokeStyle = border;
  ctx.stroke();
  if (dot) {
    ctx.fillStyle = border;
    ctx.beginPath(); ctx.arc(x - w / 2 + h * 0.55, y, h * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x - w / 2 + h * 0.55, y, h * 0.1, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fillText(ctx, text, x + (dot ? size * 0.7 : 0), y + 1);
  ctx.restore();
  return w;
}

// Opening card: sticker title, kicker pill and a "search bar" that types the tagline.
export function drawTitle(ctx, { song, style, number, total }, t, end, look, W, H, compact) {
  const fade = 1 - smooth((t - (end - 0.7)) / 0.7);
  if (fade <= 0) return;
  ctx.save();
  ctx.globalAlpha = fade;
  if (!compact) {
    const g = ctx.createRadialGradient(W / 2, H * 0.45, 100, W / 2, H * 0.45, W * 0.6);
    g.addColorStop(0, look.light > 0.5 ? 'rgba(255,255,255,.55)' : 'rgba(10,5,20,.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  const rows = wrap(song.title.replace(/！/g, '!'), compact ? 12 : 10);
  const longest = Math.max(...rows.map(r => [...r].length));
  const size = compact ? clamp(700 / longest, 46, 80) : clamp(1500 / longest, 96, 180);
  const cx = compact ? 90 + (longest * size) / 2 : W / 2;
  const top = compact ? 110 : H * 0.36 - ((rows.length - 1) * size * 1.15) / 2;
  let n = 0;
  rows.forEach((row, r) => {
    const base = n;
    n += stickerRow(ctx, row, cx, top + r * size * 1.15, size, t, i => 0.35 + (base + i) * 0.07, { seed: r * 5, offset: r });
  });
  const after = top + (rows.length - 1) * size * 1.15 + size * 0.95;
  const appear = 0.35 + n * 0.07;
  if (t > appear) {
    const k = backOut((t - appear) / 0.4);
    ctx.save();
    ctx.translate(cx, after);
    ctx.scale(k, k);
    pill(ctx, 0, 0, style.kicker, { size: compact ? 16 : 22, spacing: 6, border: CANDY[(number + 1) % CANDY.length] });
    ctx.restore();
  }
  if (!compact && t > appear + 0.4) {
    // Search bar that types the tagline, ending on an ENTER key.
    const k = backOut((t - appear - 0.4) / 0.4);
    const barW = 980;
    const barH = 92;
    const y = after + 110;
    ctx.save();
    ctx.translate(W / 2, y);
    ctx.scale(k, k);
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(20,10,40,.35)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    roundRect(ctx, -barW / 2, -barH / 2, barW, barH, barH / 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#3a2a4a';
    ctx.stroke();
    ctx.fillStyle = '#ff5fa2';
    ctx.beginPath(); ctx.arc(-barW / 2 + barH / 2 + 4, 0, barH * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(-barW / 2 + barH / 2, -4, 12, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-barW / 2 + barH / 2 + 9, 5); ctx.lineTo(-barW / 2 + barH / 2 + 18, 14); ctx.stroke();
    const typed = [...withoutPunctuation(song.tagline)].slice(0, Math.floor((t - appear - 0.7) / 0.07));
    ctx.font = `600 34px ${SANS}`;
    ctx.fillStyle = '#4a3a5a';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const text = typed.join('');
    fillText(ctx, text, -barW / 2 + barH + 20, 2);
    if (Math.floor(t * 2.5) % 2 === 0) ctx.fillRect(-barW / 2 + barH + 22 + measureText(ctx, text).width, -20, 3, 40);
    ctx.font = `800 22px ${SANS}`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#3a2a4a';
    roundRect(ctx, barW / 2 - 150, -28, 118, 56, 12);
    ctx.stroke();
    ctx.fillStyle = '#3a2a4a';
    ctx.textAlign = 'center';
    fillText(ctx, 'ENTER ↵', barW / 2 - 91, 1);
    ctx.restore();
    ctx.globalAlpha = fade * smooth((t - appear - 1) / 0.5);
    ctx.font = `600 28px ${SANS}`;
    ctx.fillStyle = look.light > 0.5 ? css(look.ink) : '#ffffff';
    ctx.textAlign = 'center';
    fillText(ctx, `${song.subtitle}　·　HyperStage PV №${String(number).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, W / 2, y + 110);
  }
  ctx.restore();
}

export function drawChapterTab(ctx, chapter, index, t, look, W) {
  const since = t - chapter.start;
  const enter = backOut(since / 0.5);
  const big = 1 - smooth((since - 2.4) / 0.6);
  const [head, ...rest] = chapter.title.split(' · ');
  ctx.save();
  ctx.translate(-260 * (1 - enter), 0);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  // Number badge.
  ctx.fillStyle = CANDY[index % CANDY.length];
  roundRect(ctx, 48, 40, 74, 56, 16);
  ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = `900 30px ${SANS}`;
  ctx.textAlign = 'center';
  fillText(ctx, String(index + 1).padStart(2, '0'), 85, 69);
  ctx.textAlign = 'left';
  ctx.font = `800 30px ${SANS}`;
  ctx.fillStyle = look.light > 0.5 ? css(look.ink) : '#ffffff';
  ctx.shadowColor = look.light > 0.5 ? 'rgba(255,255,255,.8)' : 'rgba(0,0,0,.6)';
  ctx.shadowBlur = 10;
  fillText(ctx, head, 140, 58);
  ctx.font = `600 22px ${SANS}`;
  ctx.globalAlpha = 0.65 + 0.35 * big;
  fillText(ctx, rest.join(' · '), 140, 90);
  ctx.restore();
}

export function drawProp(ctx, text, since, W) {
  if (!text) return;
  const k = backOut(since / 0.5);
  ctx.save();
  ctx.translate(W / 2, 150);
  ctx.scale(k, k);
  ctx.rotate(Math.sin(since * 2) * 0.015);
  pill(ctx, 0, 0, text, { size: 28, border: '#ffb300', ink: '#5a3200', fill: '#fff8dc', dot: false });
  ctx.restore();
}

export function drawHud(ctx, number, title, look, W) {
  ctx.save();
  ctx.font = `700 18px ${SANS}`;
  ctx.textAlign = 'right';
  ctx.letterSpacing = '4px';
  ctx.fillStyle = look.light > 0.5 ? css(look.ink, 0.6) : 'rgba(255,255,255,.6)';
  fillText(ctx, `HYPERSTAGE PV  №${String(number).padStart(2, '0')}`, W - 48, 62);
  ctx.letterSpacing = '0px';
  ctx.font = `600 18px ${SANS}`;
  fillText(ctx, `♫ ${title}`, W - 48, 90);
  ctx.restore();
}

export function drawTicker(ctx, text, t, W, H) {
  ctx.save();
  ctx.fillStyle = 'rgba(14,10,24,.88)';
  ctx.fillRect(0, H - 58, W, 58);
  ctx.font = `600 26px ${SANS}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  const width = measureText(ctx, text).width + 120;
  const offset = (t * 160) % width;
  for (let x = 230 - offset; x < W; x += width) fillText(ctx, text, x, H - 29);
  ctx.fillStyle = '#e8243c';
  ctx.fillRect(0, H - 58, 210, 58);
  ctx.fillStyle = '#fff';
  ctx.font = `900 26px ${SANS}`;
  ctx.textAlign = 'center';
  fillText(ctx, 'BREAKING', 105, H - 29);
  // LIVE badge.
  ctx.fillStyle = '#e8243c';
  roundRect(ctx, W - 170, 112, 122, 44, 10);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `900 22px ${SANS}`;
  fillText(ctx, Math.floor(t * 1.5) % 2 ? '● LIVE' : '○ LIVE', W - 109, 135);
  ctx.restore();
}

export function drawEnding(ctx, { song, cast }, t, start, end, look, W, H) {
  const since = t - start;
  if (since < 0) return;
  ctx.save();
  ctx.globalAlpha = smooth(since / 0.8);
  const g = ctx.createRadialGradient(W / 2, H * 0.45, 100, W / 2, H * 0.45, W * 0.6);
  g.addColorStop(0, look.light > 0.5 ? 'rgba(255,255,255,.6)' : 'rgba(10,5,20,.6)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const outro = (song.outro ?? `— ${song.tagline} —`).replace(/^—\s*|\s*—$/g, '');
  const rows = wrap(outro, 10);
  const size = clamp(1300 / Math.max(...rows.map(r => [...r].length)), 70, 120);
  let n = 0;
  rows.forEach((row, r) => {
    const base = n;
    n += stickerRow(ctx, row, W / 2, H * 0.36 + r * size * 1.2, size, since, i => 0.2 + (base + i) * 0.06, { seed: 99 + r, offset: r + 2 });
  });
  const y = H * 0.36 + rows.length * size * 1.2 + 40;
  if (since > 0.8) {
    ctx.font = `800 22px ${SANS}`;
    ctx.letterSpacing = '8px';
    ctx.textAlign = 'center';
    ctx.fillStyle = look.light > 0.5 ? css(look.ink) : '#fff';
    ctx.globalAlpha = smooth((since - 0.8) / 0.5);
    fillText(ctx, 'CAST', W / 2, y);
    ctx.letterSpacing = '0px';
    const names = [...new Set(stageOrder(cast.length).map(i => cast[i]))];
    const spacing = 240;
    names.forEach((name, i) => {
      const k = backOut((since - 1 - i * 0.12) / 0.4);
      if (k <= 0) return;
      ctx.save();
      ctx.translate(W / 2 + (i - (names.length - 1) / 2) * spacing, y + 64);
      ctx.scale(k, k);
      pill(ctx, 0, 0, name, { size: 24, border: CANDY[i % CANDY.length] });
      ctx.restore();
    });
    ctx.globalAlpha = smooth((since - 1.6) / 0.5);
    ctx.font = `600 22px ${SANS}`;
    ctx.fillStyle = look.light > 0.5 ? css(look.ink, 0.8) : 'rgba(255,255,255,.75)';
    fillText(ctx, `♫ ${song.title}　·　HyperStage PV · Three.js 即時演算`, W / 2, y + 150);
  }
  ctx.restore();
  // Fade to black over the final 1.4 seconds.
  const black = smooth((t - (end - 1.4)) / 1.4);
  if (black > 0) {
    ctx.fillStyle = `rgba(0,0,0,${black})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// Title bar for a character window that frames a 3D close-up.
export function drawWindowFrame(ctx, x, y, w, h, name, color, bg) {
  ctx.save();
  ctx.shadowColor = 'rgba(20,10,40,.4)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = '#fff';
  roundRect(ctx, x - 8, y - 52, w + 16, h + 60, 22);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = color;
  roundRect(ctx, x - 8, y - 52, w + 16, 52, 22);
  ctx.fill();
  ctx.fillRect(x - 8, y - 20, w + 16, 20);
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#3a2a4a';
  roundRect(ctx, x - 8, y - 52, w + 16, h + 60, 22);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x + 22, y - 26, 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color;
  ctx.font = `900 16px ${SANS}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  fillText(ctx, '✿', x + 22, y - 25);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.font = `800 24px ${SANS}`;
  fillText(ctx, name, x + 46, y - 25);
  for (let i = 0; i < 3; i++) {
    const bx = x + w - 26 - i * 34;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(bx, y - 26, 11, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
