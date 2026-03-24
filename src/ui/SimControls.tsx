import { useState } from 'react';
import { useSimulationStore } from '../store/SimulationStore';
import { SPEED_PRESETS } from '../utils/constants';
import { captureScreenshot, captureGif } from '../utils/capture';
import type { MapStyle } from '../types';

function formatTime(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (days > 0) {
    return `Day ${days + 1}, ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const MAP_STYLES: { value: MapStyle; label: string }[] = [
  { value: 'satellite', label: 'Satellite' },
  { value: 'terrain', label: 'Terrain' },
  { value: 'streets', label: 'Streets' },
];

export default function SimControls() {
  const {
    isRunning,
    speedMultiplier,
    currentTimeSec,
    mapStyle,
    setIsRunning,
    setSpeedMultiplier,
    setMapStyle,
    activeScenario,
  } = useSimulationStore();

  const [gifRecording, setGifRecording] = useState(false);
  const [gifProgress, setGifProgress] = useState(0);

  const durationSec = (activeScenario?.durationHours ?? 24) * 3600;
  const progress = durationSec > 0 ? (currentTimeSec / durationSec) * 100 : 0;

  const handleReset = () => {
    const resetSim = (useSimulationStore as any)._resetSim;
    if (resetSim) resetSim();
  };

  const handleScreenshot = () => {
    captureScreenshot();
  };

  const handleGif = async () => {
    if (gifRecording) return;
    setGifRecording(true);
    setGifProgress(0);
    try {
      await captureGif(8000, 4, (pct) => setGifProgress(pct));
    } finally {
      setGifRecording(false);
      setGifProgress(0);
    }
  };

  return (
    <div className="sim-controls">
      <div className="controls-row">
        {/* Map style selector */}
        <div className="control-group">
          <label>Map</label>
          <select
            value={mapStyle}
            onChange={(e) => setMapStyle(e.target.value as MapStyle)}
          >
            {MAP_STYLES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Playback controls */}
        <div className="control-group">
          <button
            className="control-btn"
            onClick={() => setIsRunning(!isRunning)}
            title={isRunning ? 'Pause' : 'Play'}
            disabled={!activeScenario}
          >
            {isRunning ? '⏸' : '▶'}
          </button>
          <button
            className="control-btn"
            onClick={handleReset}
            title="Reset"
          >
            ⏹
          </button>
        </div>

        {/* Speed selector */}
        <div className="control-group">
          <label>Speed</label>
          <select
            value={speedMultiplier}
            onChange={(e) => setSpeedMultiplier(Number(e.target.value))}
          >
            {SPEED_PRESETS.map((s) => (
              <option key={s} value={s}>
                {s}x
              </option>
            ))}
          </select>
        </div>

        {/* Capture controls */}
        <div className="control-group">
          <button
            className="control-btn capture-btn"
            onClick={handleScreenshot}
            title="Save screenshot (PNG)"
          >
            📷
          </button>
          <button
            className={`control-btn capture-btn ${gifRecording ? 'recording' : ''}`}
            onClick={handleGif}
            title={gifRecording ? `Recording... ${Math.round(gifProgress * 100)}%` : 'Record GIF (8 sec)'}
            disabled={gifRecording}
          >
            {gifRecording ? `⏺ ${Math.round(gifProgress * 100)}%` : '🎬'}
          </button>
        </div>

        {/* Time display */}
        <div className="control-group time-display">
          <span className="time-label">{formatTime(currentTimeSec)}</span>
        </div>
      </div>

      {/* Timeline bar */}
      <div className="timeline-bar">
        <div
          className="timeline-progress"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
    </div>
  );
}
