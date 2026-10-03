// Background layer: sky gradient, drifting glow orbs, a per-song pattern, floating
// lyric glyphs and motion-graphic particles. Drawn behind the transparent 3D canvas.
// Every position is a function of time, so frames can be rendered in any order.
import { css, mix } from './color.js';
import { rng, smooth } from './timeline.js';

export const SERIF = '"Songti TC","Songti SC","Noto Serif TC",serif';
export const SANS = '"PingFang TC","Heiti TC","Noto Sans TC",sans-serif';

const KINDS = ['petal', 'heart', 'confetti', 'coin', 'ball', 'star', 'note', 'bolt', 'paw', 'fur', 'ticket', 'digit', 'code', 'ring', 'spark', 'page', 'sun'];
const COUNT = { star: 70, spark: 46, confetti: 60, petal: 34, code: 26, digit: 14, ring: 8, bolt: 6, ball: 12, page: 10, ticket: 12 };
const fract = x => x - Math.floor(x);

export function createBackground(W, H, style, seed) {
  const random = rng(seed);
  const particles = {};
  for (const kind of KINDS) {
    particles[kind] = Array.from({ length: COUNT[kind] ?? 22 }, (_, i) => ({
      i,
      x: random(),
      y: random(),
      z: 0.4 + random() * 0.9,          // depth: size and speed
      speed: 0.6 + random() * 0.8,
      spin: (random() - 0.5) * 3,
      phase: random() * Math.PI * 2,
      hue: Math.floor(random() * 6),
      n: 1 + Math.floor(random() * (style.ballRange ?? 49)),
      word: (style.digits ?? ['333', '539', '100', '1', '2026'])[Math.floor(random() * (style.digits?.length ?? 5))],
      code: ['debug()', 'evolve++', '0x539', 'if(dream)', 'deploy', '{ }', '01101', 'return 1;', 'git push', 'async'][Math.floor(random() * 10)],
    }));
  }
  const orbs = Array.from({ length: 5 }, () => ({ x: random(), y: random() * 0.7, r: 0.25 + random() * 0.3, f: 0.03 + random() * 0.05, p: random() * 6 }));
  const glyphSeeds = Array.from({ length: 24 }, () => ({ x: random(), y: random(), s: 0.6 + random() * 0.9, p: random() * 6 }));

  // Anime sky sprites, drawn once: a crescent moon and cel-shaded cumulus clouds.
  const moon = document.createElement('canvas');
  moon.width = moon.height = 260;
  {
    const m = moon.getContext('2d');
    m.fillStyle = '#fffbe8';
    m.beginPath(); m.arc(130, 130, 92, 0, Math.PI * 2); m.fill();
    m.globalCompositeOperation = 'destination-out';
    m.beginPath(); m.arc(172, 104, 84, 0, Math.PI * 2); m.fill();
  }
  const clouds = Array.from({ length: 3 }, (_, n) => {
    const c = document.createElement('canvas');
    c.width = 640; c.height = 260;
    const g = c.getContext('2d');
    const puffs = Array.from({ length: 7 + n }, (_, k) => [90 + k * (460 / (6 + n)) + random() * 30, 150 - Math.sin((k / (6 + n)) * Math.PI) * (60 + random() * 40), 55 + random() * 45]);
    const blob = (dx, dy, grow) => { g.beginPath(); for (const [x, y, r] of puffs) { g.moveTo(x + dx + r + grow, y + dy); g.arc(x + dx, y + dy, r + grow, 0, Math.PI * 2); } g.rect(70 + dx, 150 + dy, 500, 60 + grow); g.fill(); };
    g.fillStyle = '#c9b8e8'; blob(0, 10, 0);          // shadow side
    g.fillStyle = '#ffffff'; blob(-8, -6, -6);        // lit body
    g.fillStyle = '#fff6fb'; blob(-18, -18, -26);     // highlight
    return c;
  });
  const cloudSeeds = Array.from({ length: 6 }, (_, i) => ({ x: random(), y: 0.5 + random() * 0.22, s: 0.6 + random() * 0.6, v: 4 + random() * 8, k: i % 3 }));

  function animeSky(ctx, look, t) {
    const night = 1 - look.light;
    if (night > 0.02) {
      // Moon with a soft halo and a thin ring, as in night-sky anime key art.
      const x = W * 0.8;
      const y = H * 0.2;
      ctx.save();
      ctx.globalAlpha = night;
      ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(x, y, 30, x, y, 360);
      halo.addColorStop(0, css(mix(look.glow, [255, 255, 255], 0.5), 0.45));
      halo.addColorStop(1, css(look.glow, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(x - 360, y - 360, 720, 720);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = css([255, 250, 230], 0.35);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 150 + Math.sin(t * 0.6) * 4, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowColor = '#fff6d0';
      ctx.shadowBlur = 40;
      ctx.drawImage(moon, x - 130, y - 130);
      ctx.restore();
    }
    // Clouds drift along the horizon: bright in daylight, faint and moonlit at night.
    ctx.save();
    for (const c of cloudSeeds) {
      const w = 640 * c.s;
      const x = (((c.x * (W + w) + t * c.v) % (W + w)) + W + w) % (W + w) - w;
      ctx.globalAlpha = 0.18 + 0.75 * look.light;
      ctx.drawImage(clouds[c.k], x, c.y * H - 130 * c.s, w, 260 * c.s);
    }
    ctx.restore();
    // Diagonal light leaks.
    if (look.light < 0.5) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const x = W * (0.1 + i * 0.22) + Math.sin(t * 0.2 + i) * 60;
        const g = ctx.createLinearGradient(x, 0, x + 260, H);
        g.addColorStop(0, css(look.glow, 0.10 + look.energy * 0.06));
        g.addColorStop(1, css(look.glow, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 90, 0); ctx.lineTo(x + 520, H); ctx.lineTo(x + 380, H); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  }

  // Pattern tiles are drawn once.
  const dots = document.createElement('canvas');
  dots.width = dots.height = 64;
  const d = dots.getContext('2d');
  d.fillStyle = '#fff';
  d.beginPath(); d.arc(16, 16, 5, 0, Math.PI * 2); d.arc(48, 48, 5, 0, Math.PI * 2); d.fill();

  function sky(ctx, look, t) {
    const g = ctx.createLinearGradient(0, 0, W * 0.3, H);
    g.addColorStop(0, css(look.top));
    g.addColorStop(1, css(look.bottom));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = look.light > 0.5 ? 'source-over' : 'lighter';
    for (const o of orbs) {
      const x = (o.x + Math.sin(t * o.f + o.p) * 0.12) * W;
      const y = (o.y + Math.cos(t * o.f * 0.8 + o.p) * 0.08) * H;
      const r = o.r * W * (1 + look.energy * 0.25);
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, css(look.glow, look.light > 0.5 ? 0.55 : 0.22));
      rg.addColorStop(1, css(look.glow, 0));
      ctx.fillStyle = rg;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function pattern(ctx, look, t) {
    const ink = look.light > 0.5 ? css(look.accent, 0.10) : css(look.glow, 0.10);
    ctx.save();
    switch (style.pattern) {
      case 'blueprint': {
        // Perspective floor grid rushing toward the viewer, plus a faint drafting grid.
        ctx.strokeStyle = css(look.glow, 0.16);
        ctx.lineWidth = 1.5;
        const horizon = H * 0.5;
        for (let i = -12; i <= 12; i++) {
          ctx.beginPath(); ctx.moveTo(W / 2 + i * 40, horizon); ctx.lineTo(W / 2 + i * 260, H); ctx.stroke();
        }
        for (let k = 0; k < 14; k++) {
          const z = fract(k / 14 + t * 0.06);
          const y = horizon + (H - horizon) * z * z;
          ctx.globalAlpha = z;
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = css(look.glow, 0.05);
        for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, horizon); ctx.stroke(); }
        for (let y = 0; y < horizon; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
        break;
      }
      case 'spotlights': {
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 6; i++) {
          const base = W * (0.1 + i * 0.16);
          const angle = Math.sin(t * (0.5 + i * 0.13) + i) * 0.45;
          const color = i % 2 ? look.glow : look.accent;
          const g = ctx.createLinearGradient(base, 0, base, H);
          g.addColorStop(0, css(color, 0.20 + look.energy * 0.25));
          g.addColorStop(1, css(color, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(base, -10);
          ctx.lineTo(base + Math.tan(angle - 0.12) * H, H);
          ctx.lineTo(base + Math.tan(angle + 0.12) * H, H);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case 'dots': {
        ctx.globalAlpha = look.light > 0.5 ? 0.35 : 0.06;
        ctx.fillStyle = ctx.createPattern(dots, 'repeat');
        const off = (t * 20) % 64;
        ctx.translate(off, off);
        ctx.fillRect(-64, -64, W + 128, H + 128);
        break;
      }
      case 'rays': {
        ctx.translate(W / 2, H * 0.42);
        ctx.rotate(t * 0.05);
        ctx.fillStyle = look.light > 0.5 ? css([255, 255, 255], 0.35) : css(look.glow, 0.07 + look.energy * 0.05);
        for (let i = 0; i < 18; i++) {
          ctx.rotate((Math.PI * 2) / 18);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, -90); ctx.lineTo(W, 90); ctx.closePath(); ctx.fill();
        }
        break;
      }
      case 'scanlines': {
        ctx.fillStyle = css(look.glow, 0.05);
        for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 2);
        const band = fract(t * 0.15) * (H + 200) - 100;
        const g = ctx.createLinearGradient(0, band - 80, 0, band + 80);
        g.addColorStop(0, css(look.glow, 0)); g.addColorStop(0.5, css(look.glow, 0.08)); g.addColorStop(1, css(look.glow, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, band - 80, W, 160);
        break;
      }
      case 'code': {
        ctx.font = `600 22px ui-monospace, Menlo, monospace`;
        ctx.textAlign = 'center';
        for (let c = 0; c < 48; c++) {
          const speed = 60 + ((c * 37) % 90);
          const head = fract((t * speed) / H + c * 0.137) * (H + 400);
          for (let k = 0; k < 14; k++) {
            const y = head - k * 26;
            if (y < -20 || y > H + 20) continue;
            ctx.fillStyle = css(k === 0 ? look.accent : look.glow, (k === 0 ? 0.55 : 0.22) * (1 - k / 14));
            ctx.fillText(String.fromCharCode(0x30 + ((c * 7 + k * 13 + Math.floor(t * 8)) % 10)), c * (W / 48) + 20, y);
          }
        }
        break;
      }
      case 'paper': {
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2;
        for (let y = 40; y < H; y += 54) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
        ctx.strokeStyle = css([230, 90, 90], 0.18);
        ctx.beginPath(); ctx.moveTo(150, 0); ctx.lineTo(150, H); ctx.stroke();
        break;
      }
      default: break;
    }
    ctx.restore();
  }

  // The current line's characters drift large and faint behind the stage (花束 style).
  function glyphs(ctx, look, t, line) {
    if (!line) return;
    const chars = [...line.text.replace(/[\s　()（）]/g, '')];
    if (!chars.length) return;
    const local = t - line.start;
    const life = smooth(local / 0.8) * smooth((line.end - t) / 0.5);
    if (life <= 0) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const count = Math.min(chars.length, 10);
    for (let k = 0; k < count; k++) {
      const s = glyphSeeds[(k + line.index * 5) % glyphSeeds.length];
      const size = 70 + s.s * 70;
      ctx.font = `700 ${size}px ${SERIF}`;
      ctx.fillStyle = css(look.light > 0.5 ? look.accent : look.ink, 0.10 * life);
      const x = (0.06 + s.x * 0.88) * W;
      const y = (0.08 + s.y * 0.7) * H + Math.sin(t * 0.4 + s.p) * 18 - local * 6;
      ctx.fillText(chars[(k * 3) % chars.length], x, y);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Particles
  // ---------------------------------------------------------------------------
  const PALETTE = ['#ff6fae', '#ffd23f', '#4cc9f0', '#9b7bff', '#5ee6a8', '#ff8c42'];

  function drawHeart(ctx, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.35);
    ctx.bezierCurveTo(-s, -s * 0.3, -s * 0.5, -s, 0, -s * 0.45);
    ctx.bezierCurveTo(s * 0.5, -s, s, -s * 0.3, 0, s * 0.35);
    ctx.fill();
  }
  function drawStar(ctx, s, color, alpha) {
    // Four-point sparkle with a soft core, like lens glints.
    ctx.fillStyle = css(color, alpha);
    ctx.beginPath();
    ctx.moveTo(0, -s); ctx.quadraticCurveTo(0, 0, s, 0); ctx.quadraticCurveTo(0, 0, 0, s);
    ctx.quadraticCurveTo(0, 0, -s, 0); ctx.quadraticCurveTo(0, 0, 0, -s);
    ctx.fill();
  }
  function drawPaw(ctx, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(0, s * 0.25, s * 0.42, s * 0.36, 0, 0, Math.PI * 2); ctx.fill();
    for (const [x, y] of [[-0.42, -0.2], [-0.15, -0.45], [0.15, -0.45], [0.42, -0.2]]) {
      ctx.beginPath(); ctx.ellipse(x * s, y * s, s * 0.15, s * 0.19, x, 0, Math.PI * 2); ctx.fill();
    }
  }
  function drawBall(ctx, s, color, n) {
    const g = ctx.createRadialGradient(-s * 0.35, -s * 0.35, s * 0.1, 0, 0, s);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, color); g.addColorStop(1, '#00000055');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, 0, s * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a2030';
    ctx.font = `800 ${s * 0.62}px ${SANS}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(n).padStart(2, '0'), 0, s * 0.04);
  }
  function drawCoin(ctx, s, turn) {
    ctx.scale(Math.max(0.15, Math.abs(Math.cos(turn))), 1);
    ctx.fillStyle = '#e8a817';
    ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd95a';
    ctx.beginPath(); ctx.arc(0, 0, s * 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c98a0c';
    ctx.font = `800 ${s}px ${SANS}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, s * 0.05);
  }
  function drawTicket(ctx, s, color) {
    ctx.fillStyle = '#fffaf0';
    ctx.fillRect(-s * 1.4, -s * 0.8, s * 2.8, s * 1.6);
    ctx.fillStyle = color;
    ctx.fillRect(-s * 1.4, -s * 0.8, s * 2.8, s * 0.42);
    ctx.fillStyle = '#c0392b';
    ctx.font = `800 ${s * 0.6}px ${SANS}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('頭獎', 0, s * 0.25);
  }
  function drawNote(ctx, s, color) {
    ctx.fillStyle = color;
    ctx.font = `700 ${s * 2}px ${SANS}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('♪', 0, 0);
  }
  function drawBolt(ctx, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(s * 0.2, -s * 1.4); ctx.lineTo(-s * 0.6, s * 0.15); ctx.lineTo(-s * 0.05, s * 0.15);
    ctx.lineTo(-s * 0.3, s * 1.4); ctx.lineTo(s * 0.6, -s * 0.2); ctx.lineTo(s * 0.05, -s * 0.2);
    ctx.closePath(); ctx.fill();
  }
  function drawFur(ctx, s, color, t, p) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-s, 0);
    ctx.bezierCurveTo(-s * 0.3, -s * 0.6 * Math.sin(t + p), s * 0.3, s * 0.6 * Math.cos(t * 1.3 + p), s, 0);
    ctx.stroke();
  }
  function drawPage(ctx, s, light) {
    ctx.fillStyle = light ? '#fffdf6' : '#fff8ec';
    ctx.fillRect(-s, -s * 1.3, s * 2, s * 2.6);
    ctx.strokeStyle = '#c9b79a';
    ctx.lineWidth = 1.5;
    for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(-s * 0.75, k * s * 0.32); ctx.lineTo(s * 0.75, k * s * 0.32); ctx.stroke(); }
  }
  function drawSun(ctx, s) {
    ctx.fillStyle = '#ffcc33';
    for (let k = 0; k < 12; k++) {
      ctx.rotate(Math.PI / 6);
      ctx.beginPath(); ctx.ellipse(0, -s * 0.85, s * 0.22, s * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#8a5a1c';
    ctx.beginPath(); ctx.arc(0, 0, s * 0.55, 0, Math.PI * 2); ctx.fill();
  }

  function particlesOf(ctx, kind, weight, look, t) {
    if (weight <= 0.01) return;
    const list = particles[kind];
    const shown = Math.ceil(list.length * weight);
    for (let k = 0; k < shown; k++) {
      const p = list[k];
      const alpha = Math.min(1, weight * list.length - k);
      const color = PALETTE[p.hue];
      let x;
      let y;
      let s = p.z;
      // Motion family: rising, falling or floating.
      if (kind === 'heart' || kind === 'note' || kind === 'spark' || kind === 'ring') {
        y = (1.1 - fract(p.y + (t * 0.05 * p.speed) / p.z)) * (H + 200) - 100;
        x = p.x * W + Math.sin(t * 0.8 * p.speed + p.phase) * 40;
      } else if (kind === 'star' || kind === 'digit' || kind === 'ball' || kind === 'bolt') {
        x = p.x * W + Math.sin(t * 0.15 * p.speed + p.phase) * 60;
        y = p.y * H + Math.cos(t * 0.12 * p.speed + p.phase) * 40;
      } else {
        y = fract(p.y + (t * 0.06 * p.speed) / p.z) * (H + 200) - 100;
        x = p.x * W + Math.sin(t * 0.7 * p.speed + p.phase) * 70;
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.globalAlpha = alpha;
      switch (kind) {
        case 'petal': {
          ctx.rotate(t * p.spin + p.phase);
          ctx.scale(1, Math.abs(Math.sin(t * 1.5 * p.speed + p.phase)) * 0.7 + 0.3);
          ctx.fillStyle = look.light > 0.5 ? '#ffb3d1' : css(mix([255, 210, 230], look.glow, 0.3), 0.85);
          ctx.beginPath(); ctx.ellipse(0, 0, 14 * s, 8 * s, 0, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'heart': ctx.rotate(Math.sin(t + p.phase) * 0.3); drawHeart(ctx, 26 * s, css(mix([255, 120, 180], look.glow, 0.25), 0.8)); break;
        case 'confetti': {
          ctx.rotate(t * p.spin * 2 + p.phase);
          ctx.scale(1, Math.sin(t * 3 * p.speed + p.phase));
          ctx.fillStyle = color;
          ctx.fillRect(-9 * s, -5 * s, 18 * s, 10 * s);
          break;
        }
        case 'coin': drawCoin(ctx, 22 * s, t * 2.5 * p.speed + p.phase); break;
        case 'ball': ctx.rotate(Math.sin(t * 0.5 + p.phase) * 0.4); drawBall(ctx, 40 * s, color, p.n); break;
        case 'star': {
          const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.7 * p.speed + p.phase));
          drawStar(ctx, 18 * s * tw + look.energy * 6, look.light > 0.5 ? [255, 255, 255] : mix([255, 255, 255], look.glow, 0.3), tw);
          break;
        }
        case 'note': ctx.rotate(Math.sin(t * 2 + p.phase) * 0.25); drawNote(ctx, 22 * s, color); break;
        case 'bolt': {
          const flash = fract(t * 0.9 * p.speed + p.phase) < 0.12 ? 1 : 0.15;
          ctx.globalAlpha = alpha * flash;
          ctx.rotate(p.spin * 0.2);
          drawBolt(ctx, 50 * s, '#ffe94a');
          break;
        }
        case 'paw': ctx.rotate(p.spin + Math.sin(t + p.phase) * 0.2); drawPaw(ctx, 30 * s, look.light > 0.5 ? css([255, 140, 190], 0.65) : css([255, 200, 230], 0.6)); break;
        case 'fur': ctx.rotate(t * p.spin * 0.5 + p.phase); drawFur(ctx, 26 * s, look.light > 0.5 ? css([140, 110, 150], 0.6) : css([255, 255, 255], 0.7), t, p.phase); break;
        case 'ticket': ctx.rotate(Math.sin(t * 1.2 + p.phase) * 0.6); drawTicket(ctx, 26 * s, color); break;
        case 'digit': {
          ctx.font = `800 ${90 * s}px ${SANS}`;
          ctx.textAlign = 'center';
          ctx.fillStyle = css(look.light > 0.5 ? look.accent : look.glow, 0.22);
          ctx.fillText(p.word, 0, 0);
          break;
        }
        case 'code': {
          ctx.font = `600 ${22 * s}px ui-monospace, Menlo, monospace`;
          ctx.fillStyle = css(look.glow, 0.5);
          ctx.fillText(p.code, 0, 0);
          break;
        }
        case 'ring': {
          const r = 20 + fract(t * 0.4 * p.speed + p.phase) * 120 * s;
          ctx.strokeStyle = css(look.glow, 0.5 * (1 - fract(t * 0.4 * p.speed + p.phase)));
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
          break;
        }
        case 'spark': {
          const r = 4 * s + look.energy * 3;
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 4);
          g.addColorStop(0, css([255, 255, 255], 0.9)); g.addColorStop(0.3, css(look.glow, 0.5)); g.addColorStop(1, css(look.glow, 0));
          ctx.fillStyle = g;
          ctx.fillRect(-r * 4, -r * 4, r * 8, r * 8);
          break;
        }
        case 'page': ctx.rotate(t * p.spin * 0.3 + p.phase); drawPage(ctx, 26 * s, look.light > 0.5); break;
        case 'sun': ctx.rotate(t * p.spin * 0.4); drawSun(ctx, 26 * s); break;
        default: break;
      }
      ctx.restore();
    }
  }

  return {
    draw(ctx, look, t, line) {
      sky(ctx, look, t);
      animeSky(ctx, look, t);
      pattern(ctx, look, t);
      glyphs(ctx, look, t, line);
      for (const [kind, weight] of Object.entries(look.weights)) particlesOf(ctx, kind, weight, look, t);
    },
    // Foreground sprinkle (drawn over the 3D layer) uses a thinner set of the same particles.
    front(ctx, look, t) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      for (const [kind, weight] of Object.entries(look.weights)) {
        if (['confetti', 'petal', 'star', 'spark', 'heart', 'coin', 'fur'].includes(kind)) particlesOf(ctx, kind, weight * 0.22, look, t * 1.3 + 40);
      }
      ctx.restore();
    },
  };
}

// Manga focus lines (集中線): thin wedges converging on the centre, re-drawn 15 times a second.
export function speedLines(ctx, strength, t, W, H, light) {
  const random = rng(Math.floor(t * 15) * 0.0137 + 0.5);
  const cx = W / 2;
  const cy = H * 0.45;
  const outer = Math.hypot(W, H) * 0.62;
  ctx.save();
  ctx.fillStyle = light ? `rgba(60,30,80,${0.35 * strength})` : `rgba(255,255,255,${0.55 * strength})`;
  for (let i = 0; i < 90; i++) {
    const a = random() * Math.PI * 2;
    const spread = 0.004 + random() * 0.012;
    const inner = outer * (0.42 + random() * 0.25);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a - spread) * outer, cy + Math.sin(a - spread) * outer);
    ctx.lineTo(cx + Math.cos(a + spread) * outer, cy + Math.sin(a + spread) * outer);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
