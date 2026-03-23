import { useEffect, useState } from 'react';
import { useSimulationStore } from '../store/SimulationStore';
import { getScenarioPresets } from '../engine/ScenarioLoader';
import ScenarioEditor from './ScenarioEditor';
import type { Scenario } from '../types';

export default function ScenarioPanel() {
  const { facilities, activeScenario } = useSimulationStore();
  const [presets, setPresets] = useState<Scenario[]>([]);

  useEffect(() => {
    if (facilities.length > 0) {
      setPresets(getScenarioPresets(facilities));
    }
  }, [facilities]);

  const handleSelectScenario = (scenario: Scenario) => {
    const store = useSimulationStore.getState();

    // Stop any running sim
    store.setIsRunning(false);

    // Set the new scenario
    store.setActiveScenario(scenario);

    // Reset simulation state
    store.setCurrentTimeSec(0);
    store.setDrones([]);
    store.setCosts({ red: 0, blue: 0 });
    store.setDronesDestroyed({ red: 0, blue: 0 });
    store.setVesselsDestroyed(0);

    // Reset facilities to full HP
    store.setFacilities(
      scenario.facilities.map((f) => ({
        ...f,
        currentHitPoints: f.hitPoints,
        status: 'operational' as const,
      }))
    );

    // Load the scenario's defense assets (reset stock to full)
    store.setDefenseAssets(
      scenario.blueForce.assets.map((a) => ({
        ...a,
        currentStock: a.maxStock,
        reloadTimer: 0,
      }))
    );

    // Clear engine ref so a fresh one is created on next Play
    const resetSim = (useSimulationStore as any)._resetSim;
    if (resetSim) {
      // Don't call full reset since we already did everything above;
      // just need to clear the engine ref. The resetSim sets isRunning=false
      // and clears drones which we already did.
    }
  };

  return (
    <div className="scenario-panel">
      <h3>Scenarios</h3>

      <div className="scenario-list">
        {presets.map((preset) => (
          <div
            key={preset.id}
            className={`scenario-card ${activeScenario?.id === preset.id ? 'active' : ''}`}
            onClick={() => handleSelectScenario(preset)}
          >
            <div className="scenario-card-name">{preset.name}</div>
            <div className="scenario-card-desc">{preset.description}</div>
            <div className="scenario-card-details">
              <span>Duration: {preset.durationHours}h</span>
              <span>GPS Jam: {preset.redForce.gpsJammingActive ? 'ON' : 'OFF'}</span>
              <span>
                Drones: {preset.redForce.airWaves.reduce((s, w) => s + w.count, 0) +
                  preset.redForce.seaLaunchedWaves.reduce((s, w) => s + w.count, 0)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Active scenario details */}
      {activeScenario && (
        <div className="scenario-details">
          <h4>Active: {activeScenario.name}</h4>

          <div className="detail-section">
            <h5>Red Force</h5>
            <div className="detail-row">
              <span>Strategy</span>
              <span>{activeScenario.redForce.strategy.replace(/_/g, ' ')}</span>
            </div>
            <div className="detail-row">
              <span>Air Waves</span>
              <span>{activeScenario.redForce.airWaves.length}</span>
            </div>
            <div className="detail-row">
              <span>Total Drones</span>
              <span>
                {activeScenario.redForce.airWaves.reduce((s, w) => s + w.count, 0) +
                  activeScenario.redForce.seaLaunchedWaves.reduce((s, w) => s + w.count, 0)}
              </span>
            </div>
            <div className="detail-row">
              <span>GPS Jamming</span>
              <span className={activeScenario.redForce.gpsJammingActive ? 'danger-text' : ''}>
                {activeScenario.redForce.gpsJammingActive ? 'ACTIVE' : 'OFF'}
              </span>
            </div>
          </div>

          <div className="detail-section">
            <h5>Blue Force</h5>
            <div className="detail-row">
              <span>Defense Assets</span>
              <span>{activeScenario.blueForce.assets.length}</span>
            </div>
            <div className="detail-row">
              <span>Allied Support</span>
              <span>{activeScenario.blueForce.alliedSupport.enabled ? 'YES' : 'NO'}</span>
            </div>
            <div className="detail-row">
              <span>C2 Resilience</span>
              <span>{activeScenario.blueForce.c2Resilience}</span>
            </div>
          </div>

          <div className="detail-section">
            <h5>Environment</h5>
            <div className="detail-row">
              <span>Visibility</span>
              <span>{activeScenario.environment.visibility}</span>
            </div>
            <div className="detail-row">
              <span>Sea State</span>
              <span>{activeScenario.environment.seaState}</span>
            </div>
          </div>
        </div>
      )}

      {/* Custom scenario editor */}
      <div className="scenario-divider" />
      <ScenarioEditor />
    </div>
  );
}
