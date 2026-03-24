/**
 * Capture the remaining scenarios not yet captured.
 * Uses same approach as capture-scenarios.ts: fresh context per shot.
 */

import { chromium, type Browser, type BrowserContext } from 'playwright';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_URL = 'http://localhost:5173';
const OUTPUT_DIR = path.resolve(__dirname, '../captures');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Find ffmpeg
let FFMPEG = '';
function findFfmpeg(): string {
  try { execSync('ffmpeg -version', { stdio: 'pipe' }); return 'ffmpeg'; } catch {}
  const wp = path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft/WinGet/Packages');
  if (fs.existsSync(wp)) {
    for (const dir of fs.readdirSync(wp)) {
      if (dir.includes('FFmpeg')) {
        const find = (d: string): string | null => {
          for (const f of fs.readdirSync(d)) {
            const fp = path.join(d, f);
            if (f === 'ffmpeg.exe') return fp;
            if (fs.statSync(fp).isDirectory()) { const r = find(fp); if (r) return r; }
          }
          return null;
        };
        const exe = find(path.join(wp, dir));
        if (exe) return exe;
      }
    }
  }
  return '';
}

async function framesToGif(framesDir: string, outputPath: string, fps: number): Promise<boolean> {
  try {
    const ff = `"${FFMPEG}"`;
    const pal = path.join(framesDir, 'pal.png');
    execSync(`${ff} -y -framerate ${fps} -i "${framesDir}/f%04d.png" -vf "scale=700:-1:flags=lanczos,palettegen=stats_mode=diff" "${pal}"`, { stdio: 'pipe' });
    execSync(`${ff} -y -framerate ${fps} -i "${framesDir}/f%04d.png" -i "${pal}" -lavfi "scale=700:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3" -loop 0 "${outputPath}"`, { stdio: 'pipe' });
    return true;
  } catch (e) { console.error(`    ffmpeg error: ${e}`); return false; }
}

interface Shot {
  name: string;
  scenarioIndex: number;
  mapStyle: string;
  speed: number;
  waitMs: number;
  gifMs: number;
  gifFps: number;
  staticOnly?: boolean;
  fullPage?: boolean;
}

const SHOTS: Shot[] = [
  {
    name: '09-probe-shoestring',
    scenarioIndex: 0, // Probe vs Shoestring ($1M)
    mapStyle: 'satellite', speed: 10, waitMs: 12000,
    gifMs: 8000, gifFps: 4,
  },
  {
    name: '10-500-vs-ew-defense',
    scenarioIndex: 1, // 500 Shaheds vs EW ($50M)
    mapStyle: 'satellite', speed: 100, waitMs: 0,
    gifMs: 10000, gifFps: 4,
  },
  {
    name: '11-single-ew-hsinchu',
    scenarioIndex: 7, // [AI] Single EW at Hsinchu ($3M)
    mapStyle: 'satellite', speed: 100, waitMs: 0,
    gifMs: 10000, gifFps: 4,
  },
  {
    name: '12-ew-de-layered-2k',
    scenarioIndex: 8, // [AI] EW+DE Layered vs 2K ($32M)
    mapStyle: 'satellite', speed: 100, waitMs: 5000,
    gifMs: 10000, gifFps: 4,
  },
];

async function captureShot(browser: Browser, shot: Shot) {
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await sleep(4000);

    // Select scenario
    await page.locator('.tab-btn').first().click();
    await sleep(400);
    await page.locator('.scenario-card').nth(shot.scenarioIndex).click();
    await sleep(1200);

    // Map style
    await page.locator('.controls-row select').first().selectOption(shot.mapStyle);
    await sleep(3000);

    if (!shot.staticOnly) {
      // Speed
      await page.locator('.controls-row select').nth(1).selectOption(String(shot.speed));
      await sleep(200);

      // Play
      await page.locator('[data-action="play-pause"]').click();
      await sleep(800);

      if (shot.waitMs > 0) {
        console.log(`    Waiting ${(shot.waitMs / 1000).toFixed(0)}s...`);
        await sleep(shot.waitMs);
      }
    }

    // PNG
    const pngPath = path.join(OUTPUT_DIR, `${shot.name}.png`);
    if (shot.fullPage) {
      await page.screenshot({ path: pngPath });
    } else {
      await page.locator('.map-area').screenshot({ path: pngPath });
    }
    console.log(`    -> ${shot.name}.png`);

    // GIF
    if (shot.gifMs > 0) {
      const fps = shot.gifFps;
      const interval = 1000 / fps;
      const count = Math.floor(shot.gifMs / interval);
      const framesDir = path.join(OUTPUT_DIR, `_f_${shot.name}`);
      if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });

      console.log(`    Recording ${count} frames...`);
      for (let i = 0; i < count; i++) {
        await page.locator('.map-area').screenshot({
          path: path.join(framesDir, `f${String(i).padStart(4, '0')}.png`),
        });
        await sleep(interval);
      }

      const gifPath = path.join(OUTPUT_DIR, `${shot.name}.gif`);
      const ok = await framesToGif(framesDir, gifPath, fps);
      if (ok) console.log(`    -> ${shot.name}.gif`);
      try { fs.rmSync(framesDir, { recursive: true, force: true }); } catch {}
    }
  } finally {
    await context.close();
  }
}

async function main() {
  FFMPEG = findFfmpeg();
  if (!FFMPEG) { console.error('ffmpeg not found'); process.exit(1); }
  console.log(`ffmpeg: ${FFMPEG}`);

  // Check server
  await new Promise<void>((resolve, reject) => {
    http.get(BASE_URL, (res) => { res.resume(); resolve(); }).on('error', reject);
  }).catch(() => { console.error('Dev server not running'); process.exit(1); });

  console.log(`\nCapturing ${SHOTS.length} remaining shots...\n`);
  const browser = await chromium.launch({ headless: false });

  for (let i = 0; i < SHOTS.length; i++) {
    console.log(`[${i + 1}/${SHOTS.length}] ${SHOTS[i].name}`);
    await captureShot(browser, SHOTS[i]);
  }

  await browser.close();

  console.log('\n=== DONE ===');
  const files = fs.readdirSync(OUTPUT_DIR).filter(f => !f.startsWith('_'));
  console.log(`Total files: ${files.length}`);
  for (const f of files.sort()) {
    const kb = (fs.statSync(path.join(OUTPUT_DIR, f)).size / 1024).toFixed(0);
    console.log(`  ${f} (${kb}KB)`);
  }
}

main().catch(console.error);
