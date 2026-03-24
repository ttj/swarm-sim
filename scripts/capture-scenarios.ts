/**
 * Automated scenario capture using Playwright.
 *
 * Each scenario gets a FRESH browser page (no state carryover).
 * Play button clicked once, then only screenshots — no pause/reset.
 *
 * Prerequisites: npm run dev (server on localhost:5173), ffmpeg in PATH
 * Usage: npx tsx scripts/capture-scenarios.ts
 */

import { chromium, type Browser, type BrowserContext } from 'playwright';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_URL = 'http://localhost:5173';
const OUTPUT_DIR = path.resolve(__dirname, '../captures');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Find ffmpeg - check PATH first, then common winget location
let FFMPEG = 'ffmpeg';
function findFfmpeg(): string {
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    return 'ffmpeg';
  } catch {}
  // Check winget install location
  const wingetPath = path.join(
    process.env.LOCALAPPDATA ?? '',
    'Microsoft/WinGet/Packages'
  );
  if (fs.existsSync(wingetPath)) {
    for (const dir of fs.readdirSync(wingetPath)) {
      if (dir.includes('FFmpeg')) {
        const binDir = path.join(wingetPath, dir);
        // Search recursively for ffmpeg.exe
        const findExe = (d: string): string | null => {
          for (const f of fs.readdirSync(d)) {
            const fp = path.join(d, f);
            if (f === 'ffmpeg.exe') return fp;
            if (fs.statSync(fp).isDirectory()) {
              const r = findExe(fp);
              if (r) return r;
            }
          }
          return null;
        };
        const exe = findExe(binDir);
        if (exe) return exe;
      }
    }
  }
  return '';
}

// Check prerequisites
async function checkPrereqs() {
  FFMPEG = findFfmpeg();
  if (FFMPEG) {
    console.log(`[OK] ffmpeg: ${FFMPEG}`);
  } else {
    console.error('[ERROR] ffmpeg not found. Install with: winget install Gyan.FFmpeg');
    process.exit(1);
  }

  // Check dev server
  try {
    const http = await import('http');
    await new Promise<void>((resolve, reject) => {
      http.get('http://localhost:5173/', (res) => {
        if (res.statusCode === 200) resolve();
        else reject(new Error(`Status ${res.statusCode}`));
        res.resume();
      }).on('error', reject);
    });
    console.log('[OK] Dev server on localhost:5173');
  } catch {
    console.error('[ERROR] Dev server not running. Start with: npm run dev');
    process.exit(1);
  }
}

interface Shot {
  name: string;
  scenarioIndex: number;
  mapStyle: string;
  speed: number;
  /** ms to wait after play before taking the PNG screenshot */
  waitMs: number;
  /** If set, record this many ms of GIF frames before the screenshot */
  gifBeforeMs?: number;
  /** If set, record this many ms of GIF frames after the screenshot */
  gifAfterMs?: number;
  gifFps?: number;
  /** If true, don't press play — static screenshot only */
  staticOnly?: boolean;
  /** If true, take full-page screenshot (with sidebar) instead of map-only */
  fullPage?: boolean;
  /** Tab to switch to before screenshot (0=scenario, 4=prob) */
  switchToTab?: number;
  /** If true, click the Evaluate button and wait */
  runMonteCarlo?: boolean;
}

const SHOTS: Shot[] = [
  {
    name: '01-swarm-crosses-strait',
    scenarioIndex: 2,
    mapStyle: 'satellite',
    speed: 10,
    waitMs: 15000,
    gifAfterMs: 8000,
    gifFps: 4,
  },
  {
    name: '02-ew-blanket',
    scenarioIndex: 6,
    mapStyle: 'satellite',
    speed: 100,
    waitMs: 0,
    gifAfterMs: 12000,
    gifFps: 4,
  },
  {
    name: '03-interceptors-fail',
    scenarioIndex: 9,
    mapStyle: 'satellite',
    speed: 100,
    waitMs: 0,
    gifAfterMs: 12000,
    gifFps: 4,
  },
  {
    name: '04-quarantine',
    scenarioIndex: 5,
    mapStyle: 'satellite',
    speed: 10,
    waitMs: 25000,
    gifAfterMs: 10000,
    gifFps: 4,
  },
  {
    name: '05-range-rings',
    scenarioIndex: 3,
    mapStyle: 'terrain',
    speed: 1,
    waitMs: 0,
    staticOnly: true,
  },
  {
    name: '05-range-rings-full',
    scenarioIndex: 3,
    mapStyle: 'terrain',
    speed: 1,
    waitMs: 0,
    staticOnly: true,
    fullPage: true,
  },
  {
    name: '06-full-spectrum',
    scenarioIndex: 4,
    mapStyle: 'satellite',
    speed: 100,
    waitMs: 8000,
    gifAfterMs: 8000,
    gifFps: 4,
  },
  {
    name: '07-gps-backfires',
    scenarioIndex: 10,
    mapStyle: 'satellite',
    speed: 100,
    waitMs: 0,
    gifAfterMs: 10000,
    gifFps: 4,
  },
  {
    name: '08-probability',
    scenarioIndex: 6,
    mapStyle: 'satellite',
    speed: 1,
    waitMs: 0,
    staticOnly: true,
    fullPage: true,
    switchToTab: 4,
    runMonteCarlo: true,
  },
];

async function framesToGif(framesDir: string, outputPath: string, fps: number): Promise<boolean> {
  try {
    const ff = `"${FFMPEG}"`;
    const pal = path.join(framesDir, 'pal.png');
    execSync(
      `${ff} -y -framerate ${fps} -i "${framesDir}/f%04d.png" -vf "scale=700:-1:flags=lanczos,palettegen=stats_mode=diff" "${pal}"`,
      { stdio: 'pipe' }
    );
    execSync(
      `${ff} -y -framerate ${fps} -i "${framesDir}/f%04d.png" -i "${pal}" -lavfi "scale=700:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3" -loop 0 "${outputPath}"`,
      { stdio: 'pipe' }
    );
    return true;
  } catch (e) {
    console.error(`    ffmpeg error: ${e}`);
    return false;
  }
}

async function captureShot(browser: Browser, shot: Shot) {
  // Fresh context + page for each shot
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

    // Set map style
    await page.locator('.controls-row select').first().selectOption(shot.mapStyle);
    await sleep(3000);

    // Switch tab if needed
    if (shot.switchToTab !== undefined) {
      await page.locator('.tab-btn').nth(shot.switchToTab).click();
      await sleep(500);
    }

    // Run Monte Carlo if needed
    if (shot.runMonteCarlo) {
      await page.locator('.evaluate-btn').click();
      console.log('    Monte Carlo running (~25s)...');
      await sleep(28000);
    }

    if (!shot.staticOnly) {
      // Set speed
      await page.locator('.controls-row select').nth(1).selectOption(String(shot.speed));
      await sleep(200);

      // Press play ONCE
      await page.locator('[data-action="play-pause"]').click();
      await sleep(800);

      // Wait for the action to develop
      if (shot.waitMs > 0) {
        console.log(`    Waiting ${(shot.waitMs / 1000).toFixed(0)}s for action...`);
        await sleep(shot.waitMs);
      }
    }

    // Take PNG screenshot
    const pngPath = path.join(OUTPUT_DIR, `${shot.name}.png`);
    if (shot.fullPage) {
      await page.screenshot({ path: pngPath });
    } else {
      await page.locator('.map-area').screenshot({ path: pngPath });
    }
    console.log(`    -> ${shot.name}.png`);

    // Record GIF frames if requested
    const gifMs = shot.gifAfterMs ?? 0;
    if (gifMs > 0 && shot.gifFps) {
      const fps = shot.gifFps;
      const interval = 1000 / fps;
      const count = Math.floor(gifMs / interval);
      const framesDir = path.join(OUTPUT_DIR, `_f_${shot.name}`);
      if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });

      console.log(`    Recording ${count} frames (${(gifMs / 1000).toFixed(0)}s)...`);
      for (let i = 0; i < count; i++) {
        await page.locator('.map-area').screenshot({
          path: path.join(framesDir, `f${String(i).padStart(4, '0')}.png`),
        });
        await sleep(interval);
      }

      const gifPath = path.join(OUTPUT_DIR, `${shot.name}.gif`);
      const ok = await framesToGif(framesDir, gifPath, fps);
      if (ok) {
        console.log(`    -> ${shot.name}.gif`);
      }
      try { fs.rmSync(framesDir, { recursive: true, force: true }); } catch {}
    }
  } finally {
    await context.close();
  }
}

async function main() {
  await checkPrereqs();

  console.log(`\nCapturing ${SHOTS.length} shots...\n`);
  const browser = await chromium.launch({ headless: false });

  for (let i = 0; i < SHOTS.length; i++) {
    const shot = SHOTS[i];
    console.log(`[${i + 1}/${SHOTS.length}] ${shot.name}`);
    await captureShot(browser, shot);
  }

  await browser.close();

  // Summary
  console.log('\n=== COMPLETE ===');
  const files = fs.readdirSync(OUTPUT_DIR).filter(f => !f.startsWith('_'));
  console.log(`${files.length} files in ${OUTPUT_DIR}:`);
  for (const f of files.sort()) {
    const kb = (fs.statSync(path.join(OUTPUT_DIR, f)).size / 1024).toFixed(0);
    console.log(`  ${f} (${kb}KB)`);
  }
}

main().catch(console.error);
