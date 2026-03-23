import { runMonteCarlo, type AggregateResults } from '../engine/HeadlessRunner';
import type { Scenario, DroneSpec, DefenseAssetSpec } from '../types';

export interface MonteCarloRequest {
  type: 'run';
  scenario: Scenario;
  droneSpecs: DroneSpec[];
  assetSpecs: DefenseAssetSpec[];
  numRuns: number;
  baseSeed: number;
}

export interface MonteCarloResponse {
  type: 'result' | 'progress';
  results?: AggregateResults;
  progress?: number; // 0-1
}

self.onmessage = (e: MessageEvent<MonteCarloRequest>) => {
  const { scenario, droneSpecs, assetSpecs, numRuns, baseSeed } = e.data;

  // Post initial progress then run full batch
  self.postMessage({ type: 'progress', progress: 0.1 } as MonteCarloResponse);

  const results = runMonteCarlo(scenario, droneSpecs, assetSpecs, numRuns, baseSeed);

  self.postMessage({ type: 'result', results } as MonteCarloResponse);
};
