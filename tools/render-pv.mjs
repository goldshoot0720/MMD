#!/usr/bin/env node
// Render every song's PV to MP4: headless Chrome poses pv.html frame by frame,
// ffmpeg encodes the JPEG stream and muxes the original MP3.
//
//   npm run pv                         all songs → pv/NN-title.mp4
//   npm run pv -- s023 s024            only these songs
//   npm run pv -- s023 --from 40 --to 52 --out pv/test   a short test clip
//   options: --jobs 3 (parallel songs), --crf 21, --chrome <path>
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const root = resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv.splice(i, 2)[1] : fallback;
};
const from = Number(option('from', 0));
const to = Number(option('to', Infinity));
const jobs = Number(option('jobs', 3));
const crf = option('crf', '21');
const outDir = resolve(root, option('out', 'pv'));
const chrome = option('chrome', [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
].find(existsSync));
const wanted = argv.filter(a => !a.startsWith('--'));

if (!chrome) throw new Error('找不到 Chrome，請用 --chrome <路徑> 指定');
await mkdir(outDir, { recursive: true });

const server = await createServer({ root, logLevel: 'error', server: { port: 5199, strictPort: false, host: '127.0.0.1' } });
await server.listen();
const base = server.resolvedUrls.local[0];

// One browser per job: background tabs of a shared browser get throttled and stall.
const browsers = [];
async function openPage() {
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    protocolTimeout: 0,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  browsers.push(browser);
  const [page] = await browser.pages();
  page.on('pageerror', error => console.error('page error:', error.message));
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto(`${base}pv.html?render`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.PV);
  return page;
}

const probe = await openPage();
const catalogue = await probe.evaluate(() => window.PV.songs);
await probe.browser().close();
const queue = catalogue
  .map((song, i) => ({ ...song, number: i + 1 }))
  .filter(song => !wanted.length || wanted.includes(song.id));
if (!queue.length) throw new Error(`沒有符合的歌曲：${wanted.join(', ')}`);

const safe = text => text.replace(/[\\/:*?"<>|！!？?]/g, '').replace(/\s+/g, '');

async function render(song) {
  const page = await openPage();
  const info = await page.evaluate(id => window.PV.load(id), song.id);
  const first = Math.max(0, Math.floor(from * info.fps));
  const last = Math.min(info.frames, Math.ceil(Math.min(to, info.duration) * info.fps));
  const clip = from > 0 || Number.isFinite(to);
  const file = resolve(outDir, `${String(song.number).padStart(2, '0')}-${safe(song.title)}${clip ? `-${from}s` : ''}.mp4`);

  const ffmpeg = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(info.fps), '-c:v', 'mjpeg', '-i', '-',
    '-ss', String(first / info.fps), '-i', resolve(root, 'public', `audio/${song.id === 'wedding' ? 'wedding' : song.id}.mp3`),
    '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', crf, '-pix_fmt', 'yuv420p', '-r', String(info.fps),
    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart',
    file,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((ok, fail) => ffmpeg.on('close', code => (code === 0 ? ok() : fail(new Error(`ffmpeg exit ${code}`)))));

  const started = Date.now();
  for (let f = first; f < last; f++) {
    const jpeg = await page.evaluate(t => { window.PV.frame(t); return window.PV.jpeg(0.93); }, f / info.fps);
    if (!ffmpeg.stdin.write(Buffer.from(jpeg, 'base64'))) await new Promise(ok => ffmpeg.stdin.once('drain', ok));
    if ((f - first) % 300 === 0) {
      const pct = (((f - first) / (last - first)) * 100).toFixed(0);
      const rate = (f - first) / ((Date.now() - started) / 1000 || 1);
      console.log(`[${song.id}] ${song.title} ${pct}% · ${rate.toFixed(1)} fps`);
    }
  }
  ffmpeg.stdin.end();
  await done;
  await page.browser().close();
  console.log(`✔ ${file} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
  return file;
}

const results = [];
const workers = Array.from({ length: Math.min(jobs, queue.length) }, async () => {
  while (queue.length) {
    const song = queue.shift();
    try {
      results.push(await render(song));
    } catch (error) {
      console.error(`✘ ${song.id} ${song.title}:`, error);
      process.exitCode = 1;
    }
  }
});
await Promise.all(workers);
await Promise.all(browsers.map(b => b.close().catch(() => {})));
await server.close();
console.log(`完成 ${results.length} 支 PV → ${outDir}`);
