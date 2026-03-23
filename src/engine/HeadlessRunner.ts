import type { Scenario, DroneSpec, DefenseAssetSpec } from '../types';
import { SimulationEngine, resetIdCounter } from './SimulationEngine';

/**
 * Result of a single headless simulation run.
 */
export interface SimulationResult {
  seed: number;
  facilitiesOperational: number;
  facilitiesDamaged: number;
  facilitiesDestroyed: number;
  facilitySurvivalMap: Record<string, 'operational' | 'damaged' | 'destroyed'>;
  costRed: number;
  costBlue: number;
  dronesDestroyedRed: number;
  dronesDestroyedBlue: number;
  vesselsDestroyed: number;
  cer: number; // cost exchange ratio
  durationSec: number;
  totalTicks: number;
}

/**
 * Aggregate results from multiple headless runs.
 */
export interface AggregateResults {
  numRuns: number;
  probAllSafe: number;       // P(all facilities operational)
  probAtLeast3Safe: number;  // P(>=3 facilities operational or damaged-but-not-destroyed)
  probAtLeast2Safe: number;
  probAllDestroyed: number;
  avgFacilitiesOperational: number;
  avgFacilitiesDestroyed: number;
  avgCostRed: number;
  avgCostBlue: number;
  avgCER: number;
  avgDronesDestroyedRed: number;
  facilityDestructionProb: Record<string, number>; // probability each facility is destroyed
  distribution: number[];   // [P(0 destroyed), P(1 destroyed), ..., P(all destroyed)]
  results: SimulationResult[];
}

/**
 * Run a single simulation to completion without any rendering.
 * Used for Monte Carlo probability estimation and aggregate analysis.
 */
export function runHeadless(
  scenario: Scenario,
  droneSpecs: DroneSpec[],
  assetSpecs: DefenseAssetSpec[],
  seed: number
): SimulationResult {
  resetIdCounter();

  const engine = new SimulationEngine(scenario, droneSpecs, assetSpecs, seed);
  let ticks = 0;
  const maxTicks = (scenario.durationHours * 3600) / 10 + 100; // safety margin

  while (!engine.isComplete() && ticks < maxTicks) {
    engine.tick();
    ticks++;
  }

  const state = engine.getState();
  const facilitySurvivalMap: Record<string, 'operational' | 'damaged' | 'destroyed'> = {};
  let operational = 0;
  let damaged = 0;
  let destroyed = 0;

  for (const f of state.facilities) {
    facilitySurvivalMap[f.id] = f.status;
    if (f.status === 'operational') operational++;
    else if (f.status === 'damaged') damaged++;
    else destroyed++;
  }

  const cer = state.dronesDestroyed.red > 0
    ? state.costs.blue / state.dronesDestroyed.red
    : 0;

  return {
    seed,
    facilitiesOperational: operational,
    facilitiesDamaged: damaged,
    facilitiesDestroyed: destroyed,
    facilitySurvivalMap,
    costRed: state.costs.red,
    costBlue: state.costs.blue,
    dronesDestroyedRed: state.dronesDestroyed.red,
    dronesDestroyedBlue: state.dronesDestroyed.blue,
    vesselsDestroyed: state.vesselsDestroyed,
    cer,
    durationSec: state.currentTimeSec,
    totalTicks: ticks,
  };
}

/**
 * Run multiple headless simulations and aggregate results.
 * This is the core Monte Carlo probability estimation.
 */
export function runMonteCarlo(
  scenario: Scenario,
  droneSpecs: DroneSpec[],
  assetSpecs: DefenseAssetSpec[],
  numRuns: number = 200,
  baseSeed: number = 1
): AggregateResults {
  const results: SimulationResult[] = [];
  const numFacilities = scenario.facilities.length;

  for (let i = 0; i < numRuns; i++) {
    const result = runHeadless(scenario, droneSpecs, assetSpecs, baseSeed + i);
    results.push(result);
  }

  // Calculate probabilities
  const distribution = new Array(numFacilities + 1).fill(0);
  const facilityDestroyedCount: Record<string, number> = {};

  for (const f of scenario.facilities) {
    facilityDestroyedCount[f.id] = 0;
  }

  let allSafe = 0;
  let atLeast3Safe = 0;
  let atLeast2Safe = 0;
  let allDestroyed = 0;
  let totalOperational = 0;
  let totalDestroyed = 0;
  let totalCostRed = 0;
  let totalCostBlue = 0;
  let totalCER = 0;
  let totalDronesDestroyedRed = 0;
  let cerCount = 0;

  for (const result of results) {
    distribution[result.facilitiesDestroyed]++;

    const surviving = result.facilitiesOperational + result.facilitiesDamaged;
    if (result.facilitiesDestroyed === 0) allSafe++;
    if (surviving >= 3) atLeast3Safe++;
    if (surviving >= 2) atLeast2Safe++;
    if (result.facilitiesOperational === 0 && result.facilitiesDamaged === 0) allDestroyed++;

    totalOperational += result.facilitiesOperational;
    totalDestroyed += result.facilitiesDestroyed;
    totalCostRed += result.costRed;
    totalCostBlue += result.costBlue;
    totalDronesDestroyedRed += result.dronesDestroyedRed;

    if (result.cer > 0) {
      totalCER += result.cer;
      cerCount++;
    }

    for (const [fId, status] of Object.entries(result.facilitySurvivalMap)) {
      if (status === 'destroyed') {
        facilityDestroyedCount[fId]++;
      }
    }
  }

  const n = results.length;
  const facilityDestructionProb: Record<string, number> = {};
  for (const [fId, count] of Object.entries(facilityDestroyedCount)) {
    facilityDestructionProb[fId] = count / n;
  }

  return {
    numRuns: n,
    probAllSafe: allSafe / n,
    probAtLeast3Safe: atLeast3Safe / n,
    probAtLeast2Safe: atLeast2Safe / n,
    probAllDestroyed: allDestroyed / n,
    avgFacilitiesOperational: totalOperational / n,
    avgFacilitiesDestroyed: totalDestroyed / n,
    avgCostRed: totalCostRed / n,
    avgCostBlue: totalCostBlue / n,
    avgCER: cerCount > 0 ? totalCER / cerCount : 0,
    avgDronesDestroyedRed: totalDronesDestroyedRed / n,
    facilityDestructionProb,
    distribution: distribution.map((d) => d / n),
    results,
  };
}
