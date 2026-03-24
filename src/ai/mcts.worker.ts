import { mctsSearch, type MCTSState, type MCTSResult } from './MCTSEngine';

export interface MCTSWorkerRequest {
  type: 'search';
  state: MCTSState;
  iterations: number;
  seed: number;
}

export interface MCTSWorkerResponse {
  type: 'result';
  result: MCTSResult;
}

self.onmessage = (e: MessageEvent<MCTSWorkerRequest>) => {
  const { state, iterations, seed } = e.data;
  const result = mctsSearch(state, iterations, seed);
  self.postMessage({ type: 'result', result } as MCTSWorkerResponse);
};
