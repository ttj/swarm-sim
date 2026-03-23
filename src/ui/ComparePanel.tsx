import { useState, useCallback } from 'react';
import { useSimulationStore } from '../store/SimulationStore';
import { runMonteCarlo, type AggregateResults } from '../engine/HeadlessRunner';
import type { DroneSpec, DefenseAssetSpec, Scenario } from '../types';

let catalogCache: { droneSpecs: DroneSpec[]; assetSpecs: DefenseAssetSpec[] } | null = null;

async function getCatalog() {
  if (catalogCache) return catalogCache;
  const res = await fetch('/data/drone-catalog.json');
  const data = await res.json();
  catalogCache = {
    droneSpecs: [...data.attackDrones, ...data.defenseDrones],
    assetSpecs: data.defenseAssets,
  };
  return catalogCache;
}

function formatPercent(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`;
  return `$${amount.toFixed(0)}`;
}

interface CompareResult {
  label: string;
  results: AggregateResults;
}

export default function ComparePanel() {
  const { activeScenario, defenseAssets, facilities } = useSimulationStore();
  const [isRunning, setIsRunning] = useState(false);
  const [compareResults, setCompareResults] = useState<CompareResult[] | null>(null);
  const [numRuns, setNumRuns] = useState(50);

  const runComparison = useCallback(async () => {
    if (!activeScenario || isRunning) return;

    setIsRunning(true);
    const catalog = await getCatalog();

    // Config A: Current defense placement
    const scenarioA: Scenario = {
      ...activeScenario,
      blueForce: {
        ...activeScenario.blueForce,
        assets: defenseAssets.map((a) => ({ ...a, currentStock: a.maxStock })),
      },
      facilities: facilities.map((f) => ({
        ...f, currentHitPoints: f.hitPoints, status: 'operational' as const,
      })),
    };

    // Config B: Scenario's default defense (as originally defined)
    const scenarioB: Scenario = {
      ...activeScenario,
      facilities: facilities.map((f) => ({
        ...f, currentHitPoints: f.hitPoints, status: 'operational' as const,
      })),
    };

    // Config C: No defense at all (baseline)
    const scenarioC: Scenario = {
      ...activeScenario,
      blueForce: {
        ...activeScenario.blueForce,
        assets: [],
        alliedSupport: { enabled: false, carrierStrikeGroup: false, submarineSupport: false, ewSupport: false },
      },
      facilities: facilities.map((f) => ({
        ...f, currentHitPoints: f.hitPoints, status: 'operational' as const,
      })),
    };

    // Run all three with same base seed for fair comparison
    const baseSeed = 1;
    const [resA, resB, resC] = await Promise.all([
      new Promise<AggregateResults>((resolve) => {
        setTimeout(() => resolve(runMonteCarlo(scenarioA, catalog.droneSpecs, catalog.assetSpecs, numRuns, baseSeed)), 0);
      }),
      new Promise<AggregateResults>((resolve) => {
        setTimeout(() => resolve(runMonteCarlo(scenarioB, catalog.droneSpecs, catalog.assetSpecs, numRuns, baseSeed)), 0);
      }),
      new Promise<AggregateResults>((resolve) => {
        setTimeout(() => resolve(runMonteCarlo(scenarioC, catalog.droneSpecs, catalog.assetSpecs, numRuns, baseSeed)), 0);
      }),
    ]);

    setCompareResults([
      { label: 'Your Defense', results: resA },
      { label: 'Scenario Default', results: resB },
      { label: 'No Defense', results: resC },
    ]);
    setIsRunning(false);
  }, [activeScenario, isRunning, numRuns, defenseAssets, facilities]);

  return (
    <div className="compare-panel">
      <h3>Compare Defenses</h3>
      <p className="compare-desc">
        Run the same attack against your current placement, the scenario default, and no defense.
      </p>

      <div className="prob-controls">
        <div className="control-group">
          <label>Runs</label>
          <select value={numRuns} onChange={(e) => setNumRuns(Number(e.target.value))}>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
        <button
          className="evaluate-btn"
          onClick={runComparison}
          disabled={!activeScenario || isRunning}
        >
          {isRunning ? 'Comparing...' : 'Compare'}
        </button>
      </div>

      {compareResults && (
        <div className="compare-results">
          {/* Comparison table */}
          <table className="compare-table">
            <thead>
              <tr>
                <th>Metric</th>
                {compareResults.map((cr) => (
                  <th key={cr.label}>{cr.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>P(all safe)</td>
                {compareResults.map((cr) => (
                  <td key={cr.label} className={cr.results.probAllSafe > 0.5 ? 'cell-ok' : cr.results.probAllSafe > 0.1 ? 'cell-warn' : 'cell-danger'}>
                    {formatPercent(cr.results.probAllSafe)}
                  </td>
                ))}
              </tr>
              <tr>
                <td>P(&ge;3 safe)</td>
                {compareResults.map((cr) => (
                  <td key={cr.label} className={cr.results.probAtLeast3Safe > 0.7 ? 'cell-ok' : cr.results.probAtLeast3Safe > 0.3 ? 'cell-warn' : 'cell-danger'}>
                    {formatPercent(cr.results.probAtLeast3Safe)}
                  </td>
                ))}
              </tr>
              <tr>
                <td>P(all lost)</td>
                {compareResults.map((cr) => (
                  <td key={cr.label} className={cr.results.probAllDestroyed < 0.1 ? 'cell-ok' : cr.results.probAllDestroyed < 0.5 ? 'cell-warn' : 'cell-danger'}>
                    {formatPercent(cr.results.probAllDestroyed)}
                  </td>
                ))}
              </tr>
              <tr>
                <td>Avg fabs OK</td>
                {compareResults.map((cr) => (
                  <td key={cr.label}>{cr.results.avgFacilitiesOperational.toFixed(1)}</td>
                ))}
              </tr>
              <tr>
                <td>Avg destroyed</td>
                {compareResults.map((cr) => (
                  <td key={cr.label}>{cr.results.avgFacilitiesDestroyed.toFixed(1)}</td>
                ))}
              </tr>
              <tr>
                <td>Blue cost</td>
                {compareResults.map((cr) => (
                  <td key={cr.label}>{formatCurrency(cr.results.avgCostBlue)}</td>
                ))}
              </tr>
              <tr>
                <td>CER ($/kill)</td>
                {compareResults.map((cr) => (
                  <td key={cr.label} className={cr.results.avgCER < 10000 ? 'cell-ok' : cr.results.avgCER < 50000 ? 'cell-warn' : 'cell-danger'}>
                    {cr.results.avgCER > 0 ? formatCurrency(cr.results.avgCER) : '-'}
                  </td>
                ))}
              </tr>
              <tr>
                <td>Red killed</td>
                {compareResults.map((cr) => (
                  <td key={cr.label}>{cr.results.avgDronesDestroyedRed.toFixed(0)}</td>
                ))}
              </tr>
            </tbody>
          </table>

          {/* Per-facility comparison */}
          <div className="prob-section">
            <h4>Per-Facility Destruction Probability</h4>
            {Object.keys(compareResults[0].results.facilityDestructionProb).map((fId) => (
              <div key={fId} className="compare-facility-row">
                <span className="compare-fac-name">{fId.replace('tsmc-', '')}</span>
                {compareResults.map((cr) => {
                  const p = cr.results.facilityDestructionProb[fId] ?? 0;
                  return (
                    <div key={cr.label} className="compare-bar-cell">
                      <div className="prob-bar-container">
                        <div
                          className={`prob-bar ${p < 0.2 ? 'ok' : p < 0.5 ? 'warn' : 'danger'}`}
                          style={{ width: `${p * 100}%` }}
                        />
                      </div>
                      <span className="compare-bar-val">{formatPercent(p)}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
