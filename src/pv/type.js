// Foreground typography: sticker lettering (candy fills, white outline, drop shadow),
// elegant vertical serif lines, chorus impact stacks, karaoke caption cards, plus the
// title card, chapter tabs, prop badges, news ticker and the ending card.
import { CANDY, css } from './color.js';
import { SANS, SERIF } from './bg.js';
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
function stickerRow(ctx, text, cx, cy, size, t, appear, { exit = 0, seed = 0, offset = 0, rim = '#3a1d52' } = {}) {
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
        ctx.globalAlpha = smooth(k * 2) * (1 - smooth(exit));
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
// Lyric modes
// ---------------------------------------------------------------------------
function popMode(ctx, line, t, look, W, H, inset) {
  const rows = wrap(line.text, 11);
  const longest = Math.max(...rows.map(r => visible(r).length));
  const size = clamp(1450 / longest, 70, 124);
  const count = rows.reduce((n, r) => n + visible(r).length, 0);
  const span = Math.min((line.end - line.start) * 0.5, count * 0.075 + 0.2);
  const step = span / Math.max(1, count);
  const exit = (t - (line.end - 0.22)) / 0.22;
  let n = 0;
  const bottom = H - inset - 70;
  rows.forEach((row, r) => {
    const base = n;
    const y = bottom - (rows.length - 1 - r) * size * 1.22;
    n += stickerRow(ctx, row, W / 2, y, size, t, i => line.start + (base + i) * step, { exit, seed: line.index * 7 + r, offset: line.index + r });
  });
}

function impactMode(ctx, line, t, look, W, H) {
  let chunks = line.text.trim().split(/[\s　]+/).filter(Boolean);
  // Long phrases split into balanced halves (or thirds) rather than 6 + leftovers.
  chunks = chunks.flatMap(c => {
    const chars = [...c];
    if (chars.length <= 7) return [c];
    const parts = Math.ceil(chars.length / 7);
    const per = Math.ceil(chars.length / parts);
    return Array.from({ length: parts }, (_, i) => chars.slice(i * per, (i + 1) * per).join(''));
  });
  if (chunks.length > 4) {
    const merged = [];
    const per = Math.ceil(chunks.length / 4);
    for (let i = 0; i < chunks.length; i += per) merged.push(chunks.slice(i, i + per).join(' '));
    chunks = merged;
  }
  const longest = Math.max(...chunks.map(c => [...c].length));
  let size = clamp(1500 / longest, 90, 168);
  size = Math.min(size, (H * 0.74) / (chunks.length * 1.25));
  const gap = Math.min(0.45, ((line.end - line.start) * 0.55) / chunks.length);
  const exit = (t - (line.end - 0.18)) / 0.18;
  const top = H * 0.47 - ((chunks.length - 1) * size * 1.25) / 2;
  let shake = 0;
  chunks.forEach((chunk, i) => {
    const at = line.start + i * gap;
    const since = t - at;
    if (since < 0) return;
    shake = Math.max(shake, 1 - since / 0.18);
    const k = backOut(since / 0.24);
    const slam = 1 + (1 - smooth(since / 0.2)) * 0.9;
    ctx.save();
    const x = W / 2 + (i % 2 ? 1 : -1) * Math.min(90, W * 0.04) * (chunks.length > 1 ? 1 : 0);
    const y = top + i * size * 1.25;
    ctx.translate(x, y);
    ctx.rotate((i % 2 ? 1 : -1) * 0.045);
    ctx.scale(slam * k, slam * k);
    stickerRow(ctx, chunk, 0, 0, size, t, () => at - 1, { exit, seed: line.index * 13 + i, offset: i * 2 + line.index });
    ctx.restore();
  });
  return Math.max(0, shake);
}

function verticalMode(ctx, line, t, look, W, H) {
  const rows = wrap(line.text, 8);
  const size = rows.length > 2 ? 64 : 80;
  const right = line.index % 2 === 0;
  const count = rows.reduce((n, r) => n + [...r].length, 0);
  const step = Math.min(0.12, ((line.end - line.start) * 0.55) / count);
  const fade = smooth((line.end - t) / 0.35);
  ctx.save();
  ctx.font = `700 ${size}px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const ink = look.light > 0.5 ? css(look.ink) : css(look.ink);
  const glow = look.light > 0.5 ? 'rgba(255,255,255,.95)' : css(look.glow, 0.9);
  let n = 0;
  rows.forEach((row, r) => {
    const x = right ? W * 0.88 - r * size * 1.45 : W * 0.12 + r * size * 1.45;
    const top = H * 0.2 + (r % 2) * size * 0.6;
    // Hairline and a small diamond beside each column.
    const lineK = smooth((t - line.start - r * 0.1) / 0.6) * fade;
    ctx.strokeStyle = css(look.accent, 0.6 * lineK);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + (right ? 1 : -1) * size * 0.72, top - size * 0.5);
    ctx.lineTo(x + (right ? 1 : -1) * size * 0.72, top - size * 0.5 + lineK * size * 1.15 * [...row].length);
    ctx.stroke();
    [...row].forEach((ch, i) => {
      const k = smooth((t - (line.start + n * step)) / 0.5);
      n++;
      if (k <= 0 || ch === ' ') return;
      ctx.save();
      ctx.globalAlpha = k * fade;
      ctx.shadowColor = glow;
      ctx.shadowBlur = 26;
      ctx.fillStyle = ink;
      ctx.fillText(ch, x, top + i * size * 1.15 - (1 - k) * 26);
      ctx.restore();
    });
  });
  ctx.restore();
}

function captionMode(ctx, line, t, look, W, H, inset, label) {
  const k = backOut((t - line.start) / 0.3);
  const fade = smooth((line.end - t) / 0.2);
  let size = 52;
  let rows = wrap(line.text, 26);
  if (rows.length > 3) { size = 42; rows = wrap(line.text, 33); }
  const lineH = size * 1.42;
  const cardW = Math.min(W - 160, 1660);
  const cardH = rows.length * lineH + 70;
  const x = (W - cardW) / 2;
  const y = H - inset - 46 - cardH;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(W / 2, y + cardH);
  ctx.scale(0.92 + 0.08 * k, 0.92 + 0.08 * k);
  ctx.translate(-W / 2, -(y + cardH));
  // Window-style card with a tab title bar.
  ctx.shadowColor = 'rgba(20,10,40,.35)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = 'rgba(255,255,255,.94)';
  roundRect(ctx, x, y, cardW, cardH, 30);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 5;
  ctx.strokeStyle = css(look.accent, 1);
  ctx.stroke();
  ctx.font = `700 22px ${SANS}`;
  const tabW = ctx.measureText(label).width + 56;
  ctx.fillStyle = css(look.accent, 1);
  roundRect(ctx, x + 34, y - 20, tabW, 42, 21);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 62, y + 1);
  // Karaoke: sung characters turn pink.
  const chars = rows.reduce((n, r) => n + [...r].length, 0);
  const sung = clamp((t - line.start) / Math.max(0.5, (line.end - line.start) * 0.9), 0, 1) * chars;
  ctx.font = `600 ${size}px ${SANS}`;
  ctx.textAlign = 'left';
  let n = 0;
  rows.forEach((row, r) => {
    const width = ctx.measureText(row).width;
    let cx = W / 2 - width / 2;
    const cy = y + 50 + r * lineH + lineH / 2 - 8;
    for (const ch of row) {
      ctx.fillStyle = n < sung ? '#ff4f93' : '#3a2a4a';
      ctx.fillText(ch, cx, cy);
      cx += ctx.measureText(ch).width;
      n++;
    }
  });
  ctx.restore();
}

export function drawLyric(ctx, line, t, look, W, H, { inset = 0, label = '' } = {}) {
  if (!line || t < line.start || t > line.end) return 0;
  switch (line.mode) {
    case 'impact': return impactMode(ctx, line, t, look, W, H);
    case 'vertical': verticalMode(ctx, line, t, look, W, H); return 0;
    case 'caption': captionMode(ctx, line, t, look, W, H, inset, label); return 0;
    default: popMode(ctx, line, t, look, W, H, inset); return 0;
  }
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
