import { useState, useCallback } from 'react';
import { useSimulationStore } from '../store/SimulationStore';
import { type MCTSState, type MCTSResult, type ZoneState } from '../ai/MCTSEngine';
import type { MCTSWorkerRequest, MCTSWorkerResponse } from '../ai/mcts.worker';
import MCTSWorkerModule from '../ai/mcts.worker?worker';

let activeWorker: Worker | null = null;

function buildMCTSState(): MCTSState | null {
  const state = useSimulationStore.getState();
  const { activeScenario, facilities, defenseAssets, currentTimeSec, drones } = state;
  if (!activeScenario || facilities.length === 0) return null;

  const zones: ZoneState[] = facilities.map((f) => {
    const nearbyInterceptors = defenseAssets
      .filter((a) => a.type === 'interceptor_squad' && a.isActive)
      .reduce((sum, a) => {
        const dlng = a.position[0] - f.position[0];
        const dlat = a.position[1] - f.position[1];
        const approxKm = Math.sqrt(dlng * dlng + dlat * dlat) * 111;
        return approxKm < 30 ? sum + a.currentStock : sum;
      }, 0);

    const ewActive = defenseAssets.some(
      (a) => a.type === 'ew_jammer' && a.isActive && (() => {
        const dlng = a.position[0] - f.position[0];
        const dlat = a.position[1] - f.position[1];
        return Math.sqrt(dlng * dlng + dlat * dlat) * 111 < 20;
      })()
    );

    const incomingDrones = drones.filter(
      (d) => d.side === 'red' && d.state === 'transit' && d.waypoints.length > 0 &&
        Math.abs(d.waypoints[d.waypoints.length - 1][0] - f.position[0]) < 0.1 &&
        Math.abs(d.waypoints[d.waypoints.length - 1][1] - f.position[1]) < 0.1
    ).length;

    return {
      facilityId: f.id,
      facilityName: f.name.replace('TSMC ', ''),
      facilityValue: f.value,
      facilityHpRemaining: f.currentHitPoints,
      blueInterceptors: nearbyInterceptors,
      ewActive,
      incomingDrones,
    };
  });

  const totalDronesInWaves = [
    ...activeScenario.redForce.airWaves,
    ...activeScenario.redForce.seaLaunchedWaves,
  ].reduce((s, w) => s + w.count, 0);
  const launchedDrones = drones.filter((d) => d.side === 'red').length;
  const remainingBudget = (totalDronesInWaves - launchedDrones) * 30000;

  return {
    zones,
    redBudgetRemaining: Math.max(0, remainingBudget),
    redWavesRemaining: Math.max(0, activeScenario.redForce.airWaves.length -
      drones.filter((d) => d.side === 'red').length / Math.max(1, activeScenario.redForce.airWaves[0]?.count ?? 100)),
    blueInterceptorsTotal: defenseAssets
      .filter((a) => a.type === 'interceptor_squad')
      .reduce((s, a) => s + a.currentStock, 0),
    facilitiesIntact: facilities.filter((f) => f.status !== 'destroyed').length,
    facilitiesTotalValue: facilities.reduce((s, f) => s + f.value, 0),
    timeSec: currentTimeSec,
    gpsJammingActive: activeScenario.redForce.gpsJammingActive,
  };
}

export default function StrategyAdvisor() {
  const [result, setResult] = useState<MCTSResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [iterations, setIterations] = useState(1000);
  const [side, setSide] = useState<'blue' | 'red'>('blue');

  const runSearch = useCallback(async () => {
    const state = buildMCTSState();
    if (!state) return;

    setIsSearching(true);

    activeWorker?.terminate();
    const worker = new MCTSWorkerModule();
    activeWorker = worker;

    worker.onmessage = (e: MessageEvent<MCTSWorkerResponse>) => {
      if (e.data.type === 'result') {
        setResult(e.data.result);
        setIsSearching(false);
        worker.terminate();
        activeWorker = null;
      }
    };

    worker.onerror = () => {
      setIsSearching(false);
      worker.terminate();
      activeWorker = null;
    };

    const request: MCTSWorkerRequest = {
      type: 'search',
      state,
      iterations,
      seed: Date.now() % 100000,
      side,
    };
    worker.postMessage(request);
  }, [iterations, side]);

  const isNonObvious = result && result.bestMove.type !== 'no_op' &&
    result.moveScores.length > 1 &&
    result.moveScores[0].avgReward - result.moveScores[result.moveScores.length - 1].avgReward > 0.1;

  return (
    <div className="strategy-advisor">
      <h3>AI Strategy Advisor</h3>

      <div className="prob-controls">
        <div className="control-group">
          <label>Side</label>
          <select value={side} onChange={(e) => setSide(e.target.value as 'blue' | 'red')}>
            <option value="blue">Blue (defend)</option>
            <option value="red">Red (attack)</option>
          </select>
        </div>
        <div className="control-group">
          <label>Depth</label>
          <select value={iterations} onChange={(e) => setIterations(Number(e.target.value))}>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
            <option value={2000}>2000</option>
            <option value={5000}>5000</option>
          </select>
        </div>
        <button
          className="evaluate-btn"
          onClick={runSearch}
          disabled={isSearching}
        >
          {isSearching ? 'Thinking...' : side === 'blue' ? 'Advise Blue' : 'Advise Red'}
        </button>
      </div>

      {/* Key insights from strategy analysis */}
      <div className="advisor-insights">
        <h4>Key Insights (from analysis)</h4>
        <div className="insight-item">
          <span className="insight-badge">SURPRISING</span>
          <span>EW-only ($12M) beats 200 interceptors ($400K) — zero marginal cost per kill</span>
        </div>
        <div className="insight-item">
          <span className="insight-badge">PARADOX</span>
          <span>Red GPS jamming helps blue's EW defense — double-edged sword</span>
        </div>
        <div className="insight-item">
          <span className="insight-badge">STRATEGY</span>
          <span>EW+DE layered ($32M) achieves 95% survival vs 2,000 drones</span>
        </div>
      </div>

      {result && (
        <div className="advisor-results">
          <div className="recommendation">
            {isNonObvious && (
              <div className="insight-badge">NON-OBVIOUS INSIGHT</div>
            )}
            <div className="recommendation-text">
              {result.bestMove.description}
            </div>
            <div className="recommendation-score">
              Expected outcome: {(result.expectedReward * 100).toFixed(1)}%
            </div>
          </div>

          <div className="prob-section">
            <h4>Move Rankings ({result.iterations} iterations)</h4>
            {result.moveScores.slice(0, 8).map((ms, i) => (
              <div key={i} className="move-rank-row">
                <span className="move-rank">#{i + 1}</span>
                <span className="move-desc">{ms.move.description}</span>
                <span className="move-score">
                  {(ms.avgReward * 100).toFixed(1)}%
                </span>
                <span className="move-visits">
                  ({ms.visits})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
