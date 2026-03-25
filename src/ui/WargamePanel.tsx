import { useState, useCallback, useRef } from 'react';
import { useSimulationStore } from '../store/SimulationStore';
import { WargameEngine, type WargameState } from '../engine/WargameEngine';
import type { DroneSpec, DefenseAssetSpec } from '../types';

let catalogCache: { droneSpecs: DroneSpec[]; assetSpecs: DefenseAssetSpec[] } | null = null;
async function getCatalog() {
  if (catalogCache) return catalogCache;
  const res = await fetch(`${import.meta.env.BASE_URL}data/drone-catalog.json`);
  const data = await res.json();
  catalogCache = { droneSpecs: [...data.attackDrones, ...data.defenseDrones], assetSpecs: data.defenseAssets };
  return catalogCache;
}

const TARGETS = [
  { id: 'tsmc-hsinchu-hq', label: 'Hsinchu HQ' },
  { id: 'tsmc-tainan-fab18', label: 'Tainan Fab 18' },
  { id: 'tsmc-kaohsiung', label: 'Kaohsiung' },
  { id: 'tsmc-taichung', label: 'Taichung' },
];

const DRONE_TYPES = [
  { id: 'shahed-136', label: 'Shahed-136 ($30K)', cost: 30000 },
  { id: 'autonomous-strike', label: 'Autonomous ($75K)', cost: 75000 },
  { id: 'fiber-optic-drone', label: 'Fiber-Optic ($8K)', cost: 8000 },
];

export default function WargamePanel() {
  const { activeScenario, facilities, defenseAssets } = useSimulationStore();
  const engineRef = useRef<WargameEngine | null>(null);
  const [state, setState] = useState<WargameState | null>(null);
  const [waveSpec, setWaveSpec] = useState('shahed-136');
  const [waveCount, setWaveCount] = useState(100);
  const [waveTarget, setWaveTarget] = useState('tsmc-hsinchu-hq');
  const [gpsJam, setGpsJam] = useState(false);

  const startGame = useCallback(async () => {
    if (!activeScenario || facilities.length === 0) return;
    const catalog = await getCatalog();

    const scenario = {
      ...activeScenario,
      blueForce: {
        ...activeScenario.blueForce,
        assets: defenseAssets.map((a) => ({ ...a })),
      },
      facilities: facilities.map((f) => ({
        ...f, currentHitPoints: f.hitPoints, status: 'operational' as const,
      })),
    };

    const engine = new WargameEngine(scenario, catalog.droneSpecs, catalog.assetSpecs, 24);
    engineRef.current = engine;
    setState(engine.getState());
  }, [activeScenario, facilities, defenseAssets]);

  const submitBlue = useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.submitBlueTurn();
    setState({ ...engineRef.current.getState() });
  }, []);

  const addWave = useCallback(() => {
    if (!engineRef.current) return;
    const origins: [number, number][] = [
      [119.3, 24.5], [119.0, 23.5], [119.2, 22.8], [119.4, 24.0],
    ];
    const targetIdx = TARGETS.findIndex((t) => t.id === waveTarget);
    engineRef.current.queueRedWave(
      waveSpec, waveCount, waveTarget,
      origins[targetIdx >= 0 ? targetIdx : 0],
    );
    setState({ ...engineRef.current.getState() });
  }, [waveSpec, waveCount, waveTarget]);

  const submitRed = useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.setGpsJamming(gpsJam);
    engineRef.current.submitRedTurn();
    setState({ ...engineRef.current.getState() });
  }, [gpsJam]);

  if (!state) {
    return (
      <div className="wargame-panel">
        <h3>Wargame Mode</h3>
        <p className="compare-desc">
          Turn-based 2-player wargame. Blue places defenses, Red launches attacks.
          Each turn = 1 hour. 24 turns = 1 day. Fog of war limits visibility.
        </p>
        <p className="compare-desc">
          Select a scenario and place defenses first, then start the wargame.
        </p>
        <button className="evaluate-btn" onClick={startGame} disabled={!activeScenario}>
          Start Wargame (24 turns)
        </button>
      </div>
    );
  }

  const phase = state.turn.phase;

  return (
    <div className="wargame-panel">
      <h3>Wargame — Turn {state.turn.turnNumber}/{state.totalTurns}</h3>

      {/* Status bar */}
      <div className="wg-status">
        <span className={`wg-phase ${phase}`}>
          {phase === 'blue_plan' ? '🔵 BLUE PLANNING' :
           phase === 'red_plan' ? '🔴 RED PLANNING' :
           phase === 'resolve' ? '⚔️ RESOLVING' :
           '📊 GAME OVER'}
        </span>
        <span className="wg-score">Blue: {state.blueScore} | Red: {state.redScore}</span>
      </div>

      {/* Facility status */}
      <div className="prob-section">
        <h4>Facilities</h4>
        {state.facilitiesStatus.map((f) => (
          <div key={f.id} className="stat-row">
            <span className="stat-label">{f.id.replace('tsmc-', '')}</span>
            <span className={`stat-value ${f.status === 'operational' ? 'ok' : f.status === 'damaged' ? 'warn' : 'danger'}`}>
              {f.status} ({f.hp}HP)
            </span>
          </div>
        ))}
      </div>

      {/* Blue planning phase */}
      {phase === 'blue_plan' && (
        <div className="wg-phase-content">
          <p className="compare-desc">
            Blue: review defenses (use Defense tab to adjust), then submit turn.
          </p>
          <button className="evaluate-btn" onClick={submitBlue}>
            Submit Blue Turn →
          </button>
        </div>
      )}

      {/* Red planning phase */}
      {phase === 'red_plan' && (
        <div className="wg-phase-content">
          <div className="editor-field">
            <label>Drone type</label>
            <select value={waveSpec} onChange={(e) => setWaveSpec(e.target.value)}>
              {DRONE_TYPES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </div>
          <div className="editor-field">
            <label>Count</label>
            <input type="range" min={0} max={500} step={25} value={waveCount}
              onChange={(e) => setWaveCount(Number(e.target.value))} />
            <span className="editor-value">{waveCount}</span>
          </div>
          <div className="editor-field">
            <label>Target</label>
            <select value={waveTarget} onChange={(e) => setWaveTarget(e.target.value)}>
              {TARGETS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <button className="export-btn" onClick={addWave} style={{ marginBottom: 6 }}>
            + Add Wave
          </button>
          <div className="editor-field">
            <label className="checkbox-label">
              <input type="checkbox" checked={gpsJam} onChange={(e) => setGpsJam(e.target.checked)} />
              GPS Jamming
            </label>
          </div>
          <button className="evaluate-btn" onClick={submitRed}>
            Submit Red Turn → Resolve
          </button>
        </div>
      )}

      {/* Game over */}
      {state.gameOver && (
        <div className="wg-phase-content">
          <div className="recommendation">
            <div className="recommendation-text">
              {state.winner === 'blue' ? '🔵 BLUE WINS — facilities defended!' :
               state.winner === 'red' ? '🔴 RED WINS — all facilities destroyed!' :
               '🤝 DRAW'}
            </div>
            <div className="recommendation-score">
              Blue: {state.blueScore} | Red: {state.redScore}
            </div>
          </div>
          <div className="stat-row">
            <span className="stat-label">Total red cost</span>
            <span className="stat-value">${(state.costs.red / 1e6).toFixed(1)}M</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Total blue cost</span>
            <span className="stat-value">${(state.costs.blue / 1e6).toFixed(1)}M</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Red drones destroyed</span>
            <span className="stat-value">{state.dronesDestroyed.red}</span>
          </div>
          <button className="evaluate-btn" onClick={() => { engineRef.current = null; setState(null); }}>
            New Game
          </button>
        </div>
      )}

      {/* Turn log */}
      <div className="prob-section">
        <h4>Turn Log</h4>
        <div className="event-log-scroll" style={{ maxHeight: 150 }}>
          {state.log.map((line, i) => (
            <div key={i} className="event-row" style={{ borderLeftColor: line.includes('Red') ? '#f44' : line.includes('Blue') ? '#48f' : '#666' }}>
              <span className="event-desc">{line}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
