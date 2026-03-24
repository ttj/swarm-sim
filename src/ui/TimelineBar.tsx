import { useMemo, useCallback, useRef } from 'react';
import { useSimulationStore } from '../store/SimulationStore';

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

interface TimelineMarker {
  timeSec: number;
  type: string;
  label: string;
  color: string;
}

export default function TimelineBar() {
  const events = useSimulationStore((s) => s.events);
  const currentTimeSec = useSimulationStore((s) => s.currentTimeSec);
  const activeScenario = useSimulationStore((s) => s.activeScenario);
  const trackRef = useRef<HTMLDivElement>(null);

  const durationSec = (activeScenario?.durationHours ?? 24) * 3600;
  const progress = durationSec > 0 ? (currentTimeSec / durationSec) * 100 : 0;

  const markers = useMemo(() => {
    const m: TimelineMarker[] = [];
    const seen = new Set<string>();

    for (const evt of events) {
      if (evt.type === 'wave_start' || evt.type === 'facility_hit' || evt.type === 'facility_destroyed' || evt.type === 'conventional_strike' || evt.type === 'vessel_sunk') {
        const key = `${evt.type}-${Math.floor(evt.timeSec / 60)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const colors: Record<string, string> = {
          wave_start: '#ff9800',
          facility_hit: '#ff5722',
          facility_destroyed: '#d32f2f',
          conventional_strike: '#ff5722',
          vessel_sunk: '#2196f3',
        };

        m.push({
          timeSec: evt.timeSec,
          type: evt.type,
          label: evt.description.slice(0, 40),
          color: colors[evt.type] ?? '#666',
        });
      }
    }
    return m;
  }, [events]);

  /** Click on timeline to seek to that point */
  const handleTrackClick = useCallback((e: React.MouseEvent) => {
    if (!trackRef.current || durationSec <= 0) return;

    const rect = trackRef.current.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetSec = fraction * durationSec;

    // Call seekTo via the store
    const seekTo = (useSimulationStore as any).seekTo;
    if (seekTo) {
      seekTo(targetSec);
    }
  }, [durationSec]);

  return (
    <div className="timeline-container">
      <div
        className="timeline-track"
        ref={trackRef}
        onClick={handleTrackClick}
        title="Click to seek (after running simulation)"
      >
        <div className="timeline-fill" style={{ width: `${Math.min(progress, 100)}%` }} />

        {markers.map((m, i) => {
          const pos = durationSec > 0 ? (m.timeSec / durationSec) * 100 : 0;
          return (
            <div
              key={i}
              className="timeline-marker"
              style={{ left: `${pos}%`, backgroundColor: m.color }}
              title={`${formatTime(m.timeSec)} - ${m.label}`}
            />
          );
        })}

        <div className="timeline-playhead" style={{ left: `${Math.min(progress, 100)}%` }} />
      </div>

      <div className="timeline-labels">
        <span>00:00</span>
        <span>{formatTime(durationSec / 4)}</span>
        <span>{formatTime(durationSec / 2)}</span>
        <span>{formatTime((durationSec * 3) / 4)}</span>
        <span>{formatTime(durationSec)}</span>
      </div>
    </div>
  );
}
