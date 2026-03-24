import { useState } from 'react';
import { useSimulationStore } from '../store/SimulationStore';
import type { Scenario, RedStrategyType } from '../types';

const STRATEGIES: { value: RedStrategyType; label: string }[] = [
  { value: 'saturation_rush', label: 'Saturation Rush' },
  { value: 'multi_axis_sea', label: 'Multi-Axis' },
  { value: 'feint_and_strike', label: 'Feint & Strike' },
  { value: 'attrition', label: 'Attrition' },
  { value: 'adaptive', label: 'Adaptive' },
];

const TARGETS = [
  { id: 'tsmc-hsinchu-hq', label: 'Hsinchu' },
  { id: 'tsmc-tainan-fab18', label: 'Tainan' },
  { id: 'tsmc-kaohsiung', label: 'Kaohsiung' },
  { id: 'tsmc-taichung', label: 'Taichung' },
];

export default function ScenarioEditor() {
  const { facilities } = useSimulationStore();

  const [droneCount, setDroneCount] = useState(500);
  const [targetId, setTargetId] = useState('tsmc-hsinchu-hq');
  const [gpsJamming, setGpsJamming] = useState(false);
  const [strategy, setStrategy] = useState<RedStrategyType>('saturation_rush');
  const [durationHours, setDurationHours] = useState(4);
  const [waveCount, setWaveCount] = useState(1);

  const handleApply = () => {
    if (facilities.length === 0) return;

    const dronesPerWave = Math.ceil(droneCount / waveCount);
    const origins: [number, number][] = [
      [119.3, 24.5],
      [119.0, 23.5],
      [119.2, 22.8],
      [119.4, 24.0],
    ];

    const airWaves = Array.from({ length: waveCount }, (_, i) => ({
      id: `custom-wave-${i + 1}`,
      launchTimeMinutes: 5 + i * 20,
      droneSpec: 'shahed-136',
      count: i === waveCount - 1 ? droneCount - dronesPerWave * i : dronesPerWave,
      origin: origins[i % origins.length],
      target: waveCount === 1 ? targetId : TARGETS[i % TARGETS.length].id,
      approachBearing: 85 + (i * 10) % 30,
      formation: 'dispersed' as const,
    }));

    const customScenario: Scenario = {
      id: 'custom',
      name: `Custom: ${droneCount} drones`,
      description: `Custom scenario: ${droneCount} drones in ${waveCount} wave(s), ${strategy} strategy${gpsJamming ? ', GPS jammed' : ''}`,
      durationHours,
      redForce: {
        conventionalStrikes: [],
        vessels: [],
        quarantineFormation: 'arc',
        airWaves,
        seaLaunchedWaves: [],
        uuvDeployment: { count: 0, mineTargets: [] },
        strategy,
        totalBudgetUSD: droneCount * 30000,
        gpsJammingActive: gpsJamming,
        ewCapability: gpsJamming ? 'moderate' : 'none',
      },
      blueForce: {
        assets: useSimulationStore.getState().defenseAssets.map((a) => ({ ...a })),
        totalBudgetUSD: 0,
        alliedSupport: { enabled: false, carrierStrikeGroup: false, submarineSupport: false, ewSupport: false },
        c2Resilience: 'distributed',
        productionRate: 0,
      },
      facilities: facilities.map((f) => ({
        ...f,
        currentHitPoints: f.hitPoints,
        status: 'operational' as const,
      })),
      environment: {
        windSpeedKmh: 15,
        windBearing: 270,
        visibility: 'clear',
        timeOfDay: 'day',
        seaState: 2,
      },
    };

    const store = useSimulationStore.getState();
    store.setIsRunning(false);
    store.setActiveScenario(customScenario);
    store.setCurrentTimeSec(0);
    store.setDrones([]);
    store.setCosts({ red: 0, blue: 0 });
    store.setDronesDestroyed({ red: 0, blue: 0 });
    store.setVesselsDestroyed(0);
    store.setFacilities(customScenario.facilities);
  };

  return (
    <div className="scenario-editor">
      <h4>Custom Attack</h4>

      <div className="editor-field">
        <label>Total Drones</label>
        <input
          type="range"
          min={50}
          max={5000}
          step={50}
          value={droneCount}
          onChange={(e) => setDroneCount(Number(e.target.value))}
        />
        <span className="editor-value">{droneCount}</span>
      </div>

      <div className="editor-field">
        <label>Waves</label>
        <input
          type="range"
          min={1}
          max={12}
          step={1}
          value={waveCount}
          onChange={(e) => setWaveCount(Number(e.target.value))}
        />
        <span className="editor-value">{waveCount}</span>
      </div>

      <div className="editor-field">
        <label>Primary Target</label>
        <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          {TARGETS.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>

      <div className="editor-field">
        <label>Strategy</label>
        <select value={strategy} onChange={(e) => setStrategy(e.target.value as RedStrategyType)}>
          {STRATEGIES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      <div className="editor-field">
        <label>Duration (hours)</label>
        <input
          type="range"
          min={1}
          max={48}
          step={1}
          value={durationHours}
          onChange={(e) => setDurationHours(Number(e.target.value))}
        />
        <span className="editor-value">{durationHours}h</span>
      </div>

      <div className="editor-field">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={gpsJamming}
            onChange={(e) => setGpsJamming(e.target.checked)}
          />
          GPS Jamming Active
        </label>
      </div>

      <div className="editor-summary">
        Cost: ${((droneCount * 30000) / 1_000_000).toFixed(1)}M |
        {' '}{Math.ceil(droneCount / waveCount)}/wave
      </div>

      <button className="evaluate-btn" onClick={handleApply}>
        Apply Custom Scenario
      </button>
    </div>
  );
}
