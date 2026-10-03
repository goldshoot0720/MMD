#!/usr/bin/env node
// Shrink rendered PVs under a size cap with two-pass H.264 (default 92 MB, for GitHub's 100 MB limit).
//
//   npm run pv:compress                 every pv/NN-*.mp4 larger than the cap
//   npm run pv:compress -- --mb 80      a different cap
//
// Originals are kept in pv/hq/. Files already under the cap are left alone.
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const root = resolve(import.meta.dirname, '..');
const dir = resolve(root, 'pv');
const argv = process.argv.slice(2);
const at = argv.indexOf('--mb');
const capMB = at >= 0 ? Number(argv[at + 1]) : 92;
const cap = capMB * 1000 * 1000;
const AUDIO_KBPS = 160;

const run = args => new Promise((ok, fail) => {
  const child = spawn('ffmpeg', args, { stdio: ['ignore', 'inherit', 'inherit'] });
  child.on('close', code => (code === 0 ? ok() : fail(new Error(`ffmpeg exit ${code}`))));
});

async function shrink(name) {
  const source = join(dir, name);
  const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', source]).toString());
  // 3% headroom for container overhead and rate-control drift.
  const videoKbps = Math.floor(((cap * 8 * 0.97) / duration) / 1000 - AUDIO_KBPS);
  const hq = join(dir, 'hq', name);
  await rename(source, hq);
  const log = join(tmpdir(), `pv-pass-${name.replace(/\W/g, '')}`);
  const common = ['-y', '-loglevel', 'error', '-i', hq, '-c:v', 'libx264', '-preset', 'slow', '-b:v', `${videoKbps}k`, '-pix_fmt', 'yuv420p', '-passlogfile', log];
  try {
    await run([...common, '-pass', '1', '-an', '-f', 'mp4', '/dev/null']);
    await run([...common, '-pass', '2', '-c:a', 'aac', '-b:a', `${AUDIO_KBPS}k`, '-movflags', '+faststart', source]);
  } catch (error) {
    await rm(source, { force: true });
    await rename(hq, source);
    throw error;
  }
  const size = (await stat(source)).size;
  console.log(`✔ ${name}: ${(size / 1e6).toFixed(1)} MB（${videoKbps} kbps）`);
  if (size > cap) console.warn(`  ⚠ 仍超過 ${capMB} MB`);
}

await mkdir(join(dir, 'hq'), { recursive: true });
const names = [];
for (const name of (await readdir(dir)).filter(n => /^\d\d-.*\.mp4$/.test(n) && !n.includes('.part.')).sort()) {
  if ((await stat(join(dir, name))).size > cap) names.push(name);
  else console.log(`↷ ${name} 已在 ${capMB} MB 以下`);
}
// Three at a time keeps every core busy without thrashing.
const queue = [...names];
await Promise.all(Array.from({ length: 3 }, async () => {
  while (queue.length) {
    const name = queue.shift();
    try { await shrink(name); } catch (error) { console.error(`✘ ${name}: ${error.message}`); process.exitCode = 1; }
  }
}));
