import { useRef, useEffect } from 'react';
import { useSimulationStore } from '../store/SimulationStore';

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const EVENT_ICONS: Record<string, string> = {
  wave_start: '\u{1F680}',      // rocket
  intercept: '\u{1F6E1}',       // shield
  hit: '\u{1F4A5}',             // explosion
  facility_hit: '\u{26A0}',     // warning
  facility_destroyed: '\u{1F534}', // red circle
  miss: '\u{274C}',             // cross
  vessel_sunk: '\u{1F30A}',     // wave
  conventional_strike: '\u{1F4A3}', // bomb
  launch: '\u{2708}',           // plane
};

const EVENT_COLORS: Record<string, string> = {
  wave_start: '#ff9800',
  intercept: '#4caf50',
  hit: '#f44336',
  facility_hit: '#ff5722',
  facility_destroyed: '#d32f2f',
  miss: '#9e9e9e',
  vessel_sunk: '#2196f3',
  conventional_strike: '#ff5722',
  launch: '#ff9800',
};

export default function EventLog() {
  const events = useSimulationStore((s) => s.events);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  // Show last 200 events, most recent at bottom
  const visibleEvents = events.slice(-200);

  // Collapse repeated miss events
  const collapsed: typeof visibleEvents = [];
  let missCount = 0;
  for (const evt of visibleEvents) {
    if (evt.type === 'miss') {
      missCount++;
    } else {
      if (missCount > 0) {
        collapsed.push({
          timeSec: evt.timeSec,
          type: 'miss',
          description: `${missCount} engagement${missCount > 1 ? 's' : ''} missed`,
        });
        missCount = 0;
      }
      collapsed.push(evt);
    }
  }
  if (missCount > 0) {
    collapsed.push({
      timeSec: visibleEvents[visibleEvents.length - 1]?.timeSec ?? 0,
      type: 'miss',
      description: `${missCount} engagement${missCount > 1 ? 's' : ''} missed`,
    });
  }

  return (
    <div className="event-log">
      <h3>Event Log</h3>
      <div className="event-log-scroll" ref={scrollRef}>
        {collapsed.length === 0 && (
          <div className="event-empty">No events yet. Press Play to start simulation.</div>
        )}
        {collapsed.map((evt, i) => (
          <div
            key={i}
            className="event-row"
            style={{ borderLeftColor: EVENT_COLORS[evt.type] ?? '#666' }}
          >
            <span className="event-time">{formatTime(evt.timeSec)}</span>
            <span className="event-icon">{EVENT_ICONS[evt.type] ?? '\u{2022}'}</span>
            <span className="event-desc">{evt.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
