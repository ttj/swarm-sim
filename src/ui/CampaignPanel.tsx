import { useState, useCallback } from 'react';
import { useSimulationStore } from '../store/SimulationStore';
import { runCampaign, getCampaignPresets, type CampaignResult } from '../engine/CampaignEngine';
import type { DroneSpec, DefenseAssetSpec } from '../types';

let catalogCache: { droneSpecs: DroneSpec[]; assetSpecs: DefenseAssetSpec[] } | null = null;

async function getCatalog() {
  if (catalogCache) return catalogCache;
  const res = await fetch(`${import.meta.env.BASE_URL}data/drone-catalog.json`);
  const data = await res.json();
  catalogCache = { droneSpecs: [...data.attackDrones, ...data.defenseDrones], assetSpecs: data.defenseAssets };
  return catalogCache;
}

function formatCurrency(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

export default function CampaignPanel() {
  const { facilities } = useSimulationStore();
  const [result, setResult] = useState<CampaignResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState(0);
  const presets = getCampaignPresets();

  const runCampaignSim = useCallback(async () => {
    if (facilities.length === 0 || isRunning) return;
    setIsRunning(true);

    // Run async to not block UI
    await new Promise((r) => setTimeout(r, 50));
    const catalog = await getCatalog();
    const config = presets[selectedPreset];
    const campaignResult = runCampaign(
      config,
      facilities.map((f) => ({ ...f, currentHitPoints: f.hitPoints, status: 'operational' as const })),
      catalog.droneSpecs,
      catalog.assetSpecs,
    );

    setResult(campaignResult);
    setIsRunning(false);
  }, [facilities, isRunning, selectedPreset]);

  return (
    <div className="campaign-panel">
      <h3>Multi-Day Campaign</h3>

      <div className="prob-controls">
        <select
          value={selectedPreset}
          onChange={(e) => setSelectedPreset(Number(e.target.value))}
          style={{ flex: 1, background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '3px', padding: '4px', fontSize: '10px' }}
        >
          {presets.map((p, i) => (
            <option key={i} value={i}>{p.name}</option>
          ))}
        </select>
        <button className="evaluate-btn" onClick={runCampaignSim} disabled={isRunning || facilities.length === 0}>
          {isRunning ? 'Running...' : 'Run Campaign'}
        </button>
      </div>

      {result && (
        <div className="campaign-results">
          {/* Summary */}
          <div className="prob-section">
            <h4>Campaign Summary ({result.config.durationDays} days)</h4>
            <div className="stat-row">
              <span className="stat-label">Final fabs operational</span>
              <span className={`stat-value ${result.finalFacilitiesOperational > 3 ? 'ok' : result.finalFacilitiesOperational > 0 ? 'warn' : 'danger'}`}>
                {result.finalFacilitiesOperational}
              </span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Break point (all lost)</span>
              <span className={`stat-value ${result.breakPointDay ? 'danger' : 'ok'}`}>
                {result.breakPointDay ? `Day ${result.breakPointDay}` : 'Never'}
              </span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Red stockpile exhausted</span>
              <span className="stat-value">{result.redStockpileExhaustedDay ? `Day ${result.redStockpileExhaustedDay}` : 'Never'}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Blue stockpile exhausted</span>
              <span className={`stat-value ${result.blueStockpileExhaustedDay ? 'danger' : 'ok'}`}>
                {result.blueStockpileExhaustedDay ? `Day ${result.blueStockpileExhaustedDay}` : 'Never'}
              </span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Total red cost</span>
              <span className="stat-value">{formatCurrency(result.totalRedCost)}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Total blue cost</span>
              <span className="stat-value">{formatCurrency(result.totalBlueCost)}</span>
            </div>
          </div>

          {/* Day-by-day table */}
          <div className="prob-section">
            <h4>Day-by-Day</h4>
            <table className="compare-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Launched</th>
                  <th>Killed</th>
                  <th>Through</th>
                  <th>Blue Stock</th>
                  <th>Fabs OK</th>
                </tr>
              </thead>
              <tbody>
                {result.days.map((d) => (
                  <tr key={d.day}>
                    <td>{d.day}</td>
                    <td>{d.redDronesLaunched}</td>
                    <td>{d.redDronesDestroyed}</td>
                    <td className={d.redDronesGotThrough > 0 ? 'cell-danger' : 'cell-ok'}>{d.redDronesGotThrough}</td>
                    <td className={d.blueInterceptorsRemaining < 50 ? 'cell-warn' : ''}>{d.blueInterceptorsRemaining}</td>
                    <td className={d.facilitiesOperational < 4 ? 'cell-warn' : 'cell-ok'}>{d.facilitiesOperational}/{d.facilitiesOperational + d.facilitiesDamaged + d.facilitiesDestroyed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
