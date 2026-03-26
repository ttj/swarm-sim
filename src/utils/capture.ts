import { encode } from 'modern-gif';
import { useSimulationStore } from '../store/SimulationStore';

/**
 * Find all canvas elements in the map area and composite them.
 * MapLibre creates one canvas, deck.gl creates another on top.
 * With preserveDrawingBuffer: true on the map, both are capturable.
 */
function compositeMapCanvases(mapArea: HTMLElement, targetCanvas: HTMLCanvasElement): void {
  const width = targetCanvas.width;
  const height = targetCanvas.height;
  const ctx = targetCanvas.getContext('2d')!;

  // Fill with dark background first (prevents transparency issues)
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, width, height);

  // Find all canvases in the map area — draw them in order (bottom to top)
  const canvases = mapArea.querySelectorAll('canvas');
  for (const canvas of canvases) {
    try {
      ctx.drawImage(canvas, 0, 0, width, height);
    } catch {
      // Skip canvases that can't be read (cross-origin, etc.)
    }
  }
}

/**
 * Capture the map area as a PNG screenshot and trigger download.
 */
export async function captureScreenshot(filename?: string): Promise<void> {
  const mapArea = document.querySelector('.map-area') as HTMLElement;
  if (!mapArea) return;

  const width = mapArea.offsetWidth;
  const height = mapArea.offsetHeight;
  const dpr = window.devicePixelRatio || 1;

  const compositeCanvas = document.createElement('canvas');
  compositeCanvas.width = width * dpr;
  compositeCanvas.height = height * dpr;
  const ctx = compositeCanvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  // Composite all map canvases
  compositeMapCanvases(mapArea, compositeCanvas);

  // Add info watermark bar at bottom
  const state = useSimulationStore.getState();
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, height - 28, width, 28);
  ctx.fillStyle = '#fff';
  ctx.font = '11px Consolas, monospace';
  const timeStr = formatTimeSec(state.currentTimeSec);
  const scenarioName = state.activeScenario?.name ?? 'No scenario';
  const redCount = state.drones.filter((d) => d.side === 'red' && d.state === 'transit').length;
  const destroyed = state.dronesDestroyed.red;
  ctx.fillText(`${scenarioName} | T=${timeStr} | Active: ${redCount} | Destroyed: ${destroyed}`, 8, height - 9);

  // Download
  const name = filename ?? `swarm-sim-${Date.now()}.png`;
  compositeCanvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
}

/**
 * Record a GIF of the map area for a specified duration.
 */
export async function captureGif(
  durationMs: number = 5000,
  fps: number = 5,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const mapArea = document.querySelector('.map-area') as HTMLElement;
  if (!mapArea) return;

  const width = mapArea.offsetWidth;
  const height = mapArea.offsetHeight;
  // Use half resolution for GIF to keep file size reasonable
  const gifWidth = Math.floor(width / 2);
  const gifHeight = Math.floor(height / 2);
  const frameCount = Math.floor((durationMs / 1000) * fps);
  const frameDelay = 1000 / fps;

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = gifWidth;
  tempCanvas.height = gifHeight;
  const tempCtx = tempCanvas.getContext('2d')!;

  const gifFrames: { data: CanvasImageSource; delay: number }[] = [];

  for (let i = 0; i < frameCount; i++) {
    await new Promise((r) => setTimeout(r, frameDelay));

    // Fill background
    tempCtx.fillStyle = '#1a1a2e';
    tempCtx.fillRect(0, 0, gifWidth, gifHeight);

    // Composite all canvases at half resolution
    const canvases = mapArea.querySelectorAll('canvas');
    for (const canvas of canvases) {
      try {
        tempCtx.drawImage(canvas, 0, 0, gifWidth, gifHeight);
      } catch {}
    }

    // Create a frame canvas (GIF encoder needs separate canvas per frame)
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = gifWidth;
    frameCanvas.height = gifHeight;
    frameCanvas.getContext('2d')!.drawImage(tempCanvas, 0, 0);
    gifFrames.push({ data: frameCanvas, delay: Math.round(frameDelay) });

    onProgress?.((i + 1) / frameCount);
  }

  onProgress?.(0.95);

  const output = await encode({
    width: gifWidth,
    height: gifHeight,
    frames: gifFrames,
  });

  const blob = new Blob([output], { type: 'image/gif' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `swarm-sim-${Date.now()}.gif`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  onProgress?.(1);
}

function formatTimeSec(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
