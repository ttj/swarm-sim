import { encode } from 'modern-gif';
import { useSimulationStore } from '../store/SimulationStore';

/**
 * Capture the map area as a PNG screenshot and trigger download.
 */
export async function captureScreenshot(filename?: string): Promise<void> {
  const mapArea = document.querySelector('.map-area') as HTMLElement;
  if (!mapArea) return;

  // Use html2canvas approach: grab the map's canvas elements
  const mapCanvas = mapArea.querySelector('canvas.maplibregl-canvas') as HTMLCanvasElement;
  const deckCanvas = mapArea.querySelector('canvas[data-engine]') ?? mapArea.querySelectorAll('canvas')[1] as HTMLCanvasElement | null;

  // Create a composite canvas
  const width = mapArea.offsetWidth;
  const height = mapArea.offsetHeight;
  const compositeCanvas = document.createElement('canvas');
  compositeCanvas.width = width * window.devicePixelRatio;
  compositeCanvas.height = height * window.devicePixelRatio;
  const ctx = compositeCanvas.getContext('2d')!;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  // Draw map canvas
  if (mapCanvas) {
    ctx.drawImage(mapCanvas, 0, 0, width, height);
  }

  // Draw deck.gl canvas on top
  if (deckCanvas) {
    ctx.drawImage(deckCanvas as HTMLCanvasElement, 0, 0, width, height);
  }

  // Draw HTML overlay elements (markers, labels)
  // We'll add a watermark with scenario info
  const state = useSimulationStore.getState();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, height - 30, width, 30);
  ctx.fillStyle = '#fff';
  ctx.font = '12px Consolas, monospace';
  const timeStr = formatTimeSec(state.currentTimeSec);
  const scenarioName = state.activeScenario?.name ?? 'No scenario';
  const redCount = state.drones.filter(d => d.side === 'red' && d.state === 'transit').length;
  const destroyed = state.dronesDestroyed.red;
  ctx.fillText(`${scenarioName} | T=${timeStr} | Active: ${redCount} | Destroyed: ${destroyed}`, 8, height - 10);

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
  const frameCount = Math.floor(durationMs / 1000 * fps);
  const frameDelay = 1000 / fps;

  const frames: ImageData[] = [];
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext('2d')!;

  // Capture frames over time
  for (let i = 0; i < frameCount; i++) {
    await new Promise((r) => setTimeout(r, frameDelay));

    const mapCanvas = mapArea.querySelector('canvas.maplibregl-canvas') as HTMLCanvasElement;
    const allCanvases = mapArea.querySelectorAll('canvas');
    const deckCanvas = allCanvases.length > 1 ? allCanvases[1] : null;

    tempCtx.clearRect(0, 0, width, height);
    if (mapCanvas) {
      tempCtx.drawImage(mapCanvas, 0, 0, width, height);
    }
    if (deckCanvas) {
      tempCtx.drawImage(deckCanvas, 0, 0, width, height);
    }

    frames.push(tempCtx.getImageData(0, 0, width, height));
    onProgress?.((i + 1) / frameCount);
  }

  // Encode GIF using canvas snapshots
  onProgress?.(0.95);

  // Convert ImageData frames to canvas sources
  const gifFrames = frames.map((imageData) => {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    c.getContext('2d')!.putImageData(imageData, 0, 0);
    return {
      data: c as CanvasImageSource,
      delay: Math.round(frameDelay),
    };
  });

  const output = await encode({
    width,
    height,
    frames: gifFrames,
  });

  // Download
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
