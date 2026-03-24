import { useState, useCallback } from 'react';
import { useSimulationStore } from '../store/SimulationStore';
import { exportResultsJSON, exportResultsCSV } from '../utils/export';
import type { MonteCarloRequest, MonteCarloResponse } from '../ai/montecarlo.worker';
import type { DroneSpec, DefenseAssetSpec } from '../types';
import MonteCarloWorker from '../ai/montecarlo.worker?worker';

let catalogCache: { droneSpecs: DroneSpec[]; assetSpecs: DefenseAssetSpec[] } | null = null;

async function getCatalog() {
  if (catalogCache) return catalogCache;
  const res = await fetch(`${import.meta.env.BASE_URL}data/drone-catalog.json`);
  const data = await res.json();
  catalogCache = {
    droneSpecs: [...data.attackDrones, ...data.defenseDrones],
    assetSpecs: data.defenseAssets,
  };
  return catalogCache;
}

// Module-level worker ref so it survives component unmount/remount
let activeWorker: Worker | null = null;

function formatPercent(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`;
  return `$${amount.toFixed(0)}`;
}

export default function ProbabilityPanel() {
  const activeScenario = useSimulationStore((s) => s.activeScenario);
  const defenseAssets = useSimulationStore((s) => s.defenseAssets);
  const facilities = useSimulationStore((s) => s.facilities);
  const mcIsRunning = useSimulationStore((s) => s.mcIsRunning);
  const mcProgress = useSimulationStore((s) => s.mcProgress);
  const results = useSimulationStore((s) => s.mcResults);

  const [numRuns, setNumRuns] = useState(100);

  const runEvaluation = useCallback(async () => {
    if (!activeScenario || mcIsRunning) return;

    const store = useSimulationStore.getState();
    store.setMcIsRunning(true);
    store.setMcProgress(0);
    store.setMcResults(null);

    const catalog = await getCatalog();

    const scenarioWithCurrentDefenses = {
      ...activeScenario,
      blueForce: {
        ...activeScenario.blueForce,
        assets: defenseAssets.map((a) => ({ ...a, currentStock: a.maxStock })),
      },
      facilities: facilities.map((f) => ({
        ...f,
        currentHitPoints: f.hitPoints,
        status: 'operational' as const,
      })),
    };

    // Terminate previous worker
    activeWorker?.terminate();

    const worker = new MonteCarloWorker();
    activeWorker = worker;

    // Write results directly to the store (persists across tab switches)
    worker.onmessage = (e: MessageEvent<MonteCarloResponse>) => {
      const s = useSimulationStore.getState();
      if (e.data.type === 'progress') {
        s.setMcProgress(e.data.progress ?? 0);
      } else if (e.data.type === 'result' && e.data.results) {
        s.setMcResults(e.data.results);
        s.setMcIsRunning(false);
        s.setMcProgress(1);
        worker.terminate();
        activeWorker = null;
      }
    };

    worker.onerror = () => {
      const s = useSimulationStore.getState();
      s.setMcIsRunning(false);
      worker.terminate();
      activeWorker = null;
    };

    const request: MonteCarloRequest = {
      type: 'run',
      scenario: scenarioWithCurrentDefenses,
      droneSpecs: catalog.droneSpecs,
      assetSpecs: catalog.assetSpecs,
      numRuns,
      baseSeed: Date.now() % 100000,
    };

    worker.postMessage(request);
  }, [activeScenario, mcIsRunning, numRuns, defenseAssets, facilities]);

  return (
    <div className="probability-panel">
      <h3>Probability Analysis</h3>

      <div className="prob-controls">
        <div className="control-group">
          <label>Runs</label>
          <select value={numRuns} onChange={(e) => setNumRuns(Number(e.target.value))}>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
          </select>
        </div>
        <button
          className="evaluate-btn"
          onClick={runEvaluation}
          disabled={!activeScenario || mcIsRunning}
        >
          {mcIsRunning ? `Running... ${Math.round(mcProgress * 100)}%` : 'Evaluate'}
        </button>
      </div>

      {results && (
        <div className="export-buttons">
          <button
            className="export-btn"
            onClick={() => exportResultsJSON(results, activeScenario?.name ?? 'unknown')}
          >
            Export JSON
          </button>
          <button
            className="export-btn"
            onClick={() => exportResultsCSV(results, activeScenario?.name ?? 'unknown')}
          >
            Export CSV
          </button>
        </div>
      )}

      {!activeScenario && (
        <div className="prob-empty">Select a scenario first</div>
      )}

      {results && (
        <div className="prob-results">
          <div className="prob-section">
            <h4>Outcome Probabilities</h4>
            <div className="prob-bar-row">
              <span className="prob-label">All facilities safe</span>
              <div className="prob-bar-container">
                <div className="prob-bar ok" style={{ width: `${results.probAllSafe * 100}%` }} />
              </div>
              <span className="prob-value">{formatPercent(results.probAllSafe)}</span>
            </div>
            <div className="prob-bar-row">
              <span className="prob-label">&ge;3 surviving</span>
              <div className="prob-bar-container">
                <div className="prob-bar ok" style={{ width: `${results.probAtLeast3Safe * 100}%` }} />
              </div>
              <span className="prob-value">{formatPercent(results.probAtLeast3Safe)}</span>
            </div>
            <div className="prob-bar-row">
              <span className="prob-label">&ge;2 surviving</span>
              <div className="prob-bar-container">
                <div className="prob-bar warn" style={{ width: `${results.probAtLeast2Safe * 100}%` }} />
              </div>
              <span className="prob-value">{formatPercent(results.probAtLeast2Safe)}</span>
            </div>
            <div className="prob-bar-row">
              <span className="prob-label">All destroyed</span>
              <div className="prob-bar-container">
                <div className="prob-bar danger" style={{ width: `${results.probAllDestroyed * 100}%` }} />
              </div>
              <span className="prob-value">{formatPercent(results.probAllDestroyed)}</span>
            </div>
          </div>

          <div className="prob-section">
            <h4>Facilities Destroyed Distribution</h4>
            {results.distribution.map((prob, i) => (
              <div key={i} className="prob-bar-row">
                <span className="prob-label">{i} destroyed</span>
                <div className="prob-bar-container">
                  <div
                    className={`prob-bar ${i === 0 ? 'ok' : i < 3 ? 'warn' : 'danger'}`}
                    style={{ width: `${prob * 100}%` }}
                  />
                </div>
                <span className="prob-value">{formatPercent(prob)}</span>
              </div>
            ))}
          </div>

          <div className="prob-section">
            <h4>Per-Facility Destruction Prob</h4>
            {Object.entries(results.facilityDestructionProb).map(([fId, prob]) => (
              <div key={fId} className="prob-bar-row">
                <span className="prob-label">{fId.replace('tsmc-', '')}</span>
                <div className="prob-bar-container">
                  <div
                    className={`prob-bar ${prob < 0.2 ? 'ok' : prob < 0.5 ? 'warn' : 'danger'}`}
                    style={{ width: `${prob * 100}%` }}
                  />
                </div>
                <span className="prob-value">{formatPercent(prob)}</span>
              </div>
            ))}
          </div>

          <div className="prob-section">
            <h4>Expected Costs ({results.numRuns} runs)</h4>
            <div className="stat-row">
              <span className="stat-label">Avg Red Cost</span>
              <span className="stat-value">{formatCurrency(results.avgCostRed)}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Avg Blue Cost</span>
              <span className="stat-value">{formatCurrency(results.avgCostBlue)}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Avg CER ($/kill)</span>
              <span className={`stat-value ${results.avgCER > 50000 ? 'danger' : results.avgCER > 10000 ? 'warn' : 'ok'}`}>
                {formatCurrency(results.avgCER)}
              </span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Avg Red Drones Killed</span>
              <span className="stat-value">{results.avgDronesDestroyedRed.toFixed(0)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
