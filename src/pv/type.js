// Foreground typography: one bottom sticker plate for every lyric line, plus the
// title card, chapter tabs, prop badges, news ticker and the ending card.
import { CANDY, css } from './color.js';
import { SANS } from './bg.js';
import { clamp, hash, smooth } from './timeline.js';

const backOut = k => {
  k = clamp(k, 0, 1);
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
};
const visible = text => [...text.replace(/[\s　]/g, '')];

// Greedy wrap that prefers spaces and never exceeds `max` visible characters per row.
export function wrap(text, max) {
  const words = text.trim().split(/[\s　]+/).filter(Boolean);
  const rows = [];
  let row = '';
  const push = () => { if (row) rows.push(row); row = ''; };
  for (const word of words) {
    const chars = [...word];
    if (chars.length > max) {
      push();
      for (let i = 0; i < chars.length; i += max) rows.push(chars.slice(i, i + max).join(''));
      continue;
    }
    const joined = row ? `${row} ${word}` : word;
    if (visible(joined).length + (row ? 1 : 0) > max) { push(); row = word; } else row = joined;
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
  ctx.fillText(ch, size * 0.06, size * 0.09);
  ctx.strokeStyle = rim;
  ctx.lineWidth = size * 0.34;
  ctx.strokeText(ch, 0, 0);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = size * 0.2;
  ctx.strokeText(ch, 0, 0);
  const g = ctx.createLinearGradient(0, -size * 0.5, 0, size * 0.5);
  g.addColorStop(0, fill);
  g.addColorStop(1, shade(fill));
  ctx.fillStyle = g;
  ctx.fillText(ch, 0, 0);
  // Gloss highlight.
  ctx.save();
  ctx.globalAlpha *= 0.35;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.rect(-size, -size * 0.6, size * 2, size * 0.42);
  ctx.clip();
  ctx.fillText(ch, 0, 0);
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
  const widths = chars.map(ch => (ch === ' ' ? size * 0.35 : ctx.measureText(ch).width * 0.98));
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

function rowsFor(text) {
  const count = Math.max(1, visible(text).length);
  const target = count <= 16 ? 1 : count <= 32 ? 2 : count <= 48 ? 3 : 4;
  let per = Math.max(8, Math.ceil(count / target));
  let rows = wrap(text, per);
  while (rows.length > target && per < count) {
    per += 2;
    rows = wrap(text, per);
  }
  return rows;
}

export function lyricPlate(text, H, inset = 0) {
  const bandTop = Math.round(H * (1 - LYRIC_BAND));
  const bandBottom = H - inset - 22;
  const pad = 12;
  const innerH = Math.max(36, bandBottom - bandTop - pad * 2);
  const rows = rowsFor(text);
  const longest = Math.max(1, ...rows.map(row => visible(row).length));
  const size = clamp(Math.min(72, innerH / (rows.length * 1.28), 1560 / longest), 14, 72);
  const lineH = size * 1.18;
  const block = rows.length * lineH;
  let top = bandTop + pad + Math.max(0, (innerH - block) / 2);
  if (top + block > bandBottom - 4) top = bandBottom - 4 - block;
  if (top < bandTop) top = bandTop;
  return { bandTop, bandBottom, size, rows, top, lineH, block };
}

function plateMode(ctx, line, t, W, H, inset) {
  const plate = lyricPlate(line.text, H, inset);
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
  const w = ctx.measureText(text).width + size * (dot ? 3.2 : 1.8);
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
  ctx.fillText(text, x + (dot ? size * 0.7 : 0), y + 1);
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
    const typed = [...song.tagline].slice(0, Math.floor((t - appear - 0.7) / 0.07));
    ctx.font = `600 34px ${SANS}`;
    ctx.fillStyle = '#4a3a5a';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const text = typed.join('');
    ctx.fillText(text, -barW / 2 + barH + 20, 2);
    if (Math.floor(t * 2.5) % 2 === 0) ctx.fillRect(-barW / 2 + barH + 22 + ctx.measureText(text).width, -20, 3, 40);
    ctx.font = `800 22px ${SANS}`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#3a2a4a';
    roundRect(ctx, barW / 2 - 150, -28, 118, 56, 12);
    ctx.stroke();
    ctx.fillStyle = '#3a2a4a';
    ctx.textAlign = 'center';
    ctx.fillText('ENTER ↵', barW / 2 - 91, 1);
    ctx.restore();
    ctx.globalAlpha = fade * smooth((t - appear - 1) / 0.5);
    ctx.font = `600 28px ${SANS}`;
    ctx.fillStyle = look.light > 0.5 ? css(look.ink) : '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(`${song.subtitle}　·　HyperStage PV №${String(number).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, W / 2, y + 110);
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
  ctx.fillText(String(index + 1).padStart(2, '0'), 85, 69);
  ctx.textAlign = 'left';
  ctx.font = `800 30px ${SANS}`;
  ctx.fillStyle = look.light > 0.5 ? css(look.ink) : '#ffffff';
  ctx.shadowColor = look.light > 0.5 ? 'rgba(255,255,255,.8)' : 'rgba(0,0,0,.6)';
  ctx.shadowBlur = 10;
  ctx.fillText(head, 140, 58);
  ctx.font = `600 22px ${SANS}`;
  ctx.globalAlpha = 0.65 + 0.35 * big;
  ctx.fillText(rest.join(' · '), 140, 90);
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
  ctx.fillText(`HYPERSTAGE PV  №${String(number).padStart(2, '0')}`, W - 48, 62);
  ctx.letterSpacing = '0px';
  ctx.font = `600 18px ${SANS}`;
  ctx.fillText(`♫ ${title}`, W - 48, 90);
  ctx.restore();
}

export function drawTicker(ctx, text, t, W, H) {
  ctx.save();
  ctx.fillStyle = 'rgba(14,10,24,.88)';
  ctx.fillRect(0, H - 58, W, 58);
  ctx.font = `600 26px ${SANS}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  const width = ctx.measureText(text).width + 120;
  const offset = (t * 160) % width;
  for (let x = 230 - offset; x < W; x += width) ctx.fillText(text, x, H - 29);
  ctx.fillStyle = '#e8243c';
  ctx.fillRect(0, H - 58, 210, 58);
  ctx.fillStyle = '#fff';
  ctx.font = `900 26px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.fillText('BREAKING', 105, H - 29);
  // LIVE badge.
  ctx.fillStyle = '#e8243c';
  roundRect(ctx, W - 170, 112, 122, 44, 10);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `900 22px ${SANS}`;
  ctx.fillText(Math.floor(t * 1.5) % 2 ? '● LIVE' : '○ LIVE', W - 109, 135);
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
    ctx.fillText('CAST', W / 2, y);
    ctx.letterSpacing = '0px';
    const names = [...new Set(cast)];
    const spacing = 240;
    names.forEach((name, i) => {
      const k = backOut((since - 1 - i * 0.12) / 0.4);
      if (k <= 0) return;
      ctx.save();
      ctx.translate(W / 2 + (i - (names.length - 1) / 2) * spacing, y + 64);
      ctx.scale(k, k);
      pill(ctx, 0, 0, `${name}.pet`, { size: 24, border: CANDY[i % CANDY.length] });
      ctx.restore();
    });
    ctx.globalAlpha = smooth((since - 1.6) / 0.5);
    ctx.font = `600 22px ${SANS}`;
    ctx.fillStyle = look.light > 0.5 ? css(look.ink, 0.8) : 'rgba(255,255,255,.75)';
    ctx.fillText(`♫ ${song.title}　·　HyperStage PV · Three.js 即時演算`, W / 2, y + 150);
  }
  ctx.restore();
  // Fade to black over the final 1.4 seconds.
  const black = smooth((t - (end - 1.4)) / 1.4);
  if (black > 0) {
    ctx.fillStyle = `rgba(0,0,0,${black})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// Title bar for a ".pet" window that frames a 3D close-up.
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
  ctx.fillText('✿', x + 22, y - 25);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.font = `800 24px ${SANS}`;
  ctx.fillText(`${name}.pet`, x + 46, y - 25);
  for (let i = 0; i < 3; i++) {
    const bx = x + w - 26 - i * 34;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(bx, y - 26, 11, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
