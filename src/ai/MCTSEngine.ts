import { RandomStream } from '../engine/RandomStream';

/**
 * Abstract game state for MCTS.
 * Operates at zone level, not individual drones.
 */
export interface MCTSState {
  zones: ZoneState[];
  redBudgetRemaining: number;
  redWavesRemaining: number;
  blueInterceptorsTotal: number;
  facilitiesIntact: number;
  facilitiesTotalValue: number;
  timeSec: number;
  gpsJammingActive: boolean;
}

export interface ZoneState {
  facilityId: string;
  facilityName: string;
  facilityValue: number;
  facilityHpRemaining: number;
  blueInterceptors: number;
  ewActive: boolean;
  incomingDrones: number;
}

/**
 * A strategic move in the MCTS tree.
 */
export interface MCTSMove {
  type: 'reallocate' | 'activate_ew' | 'deactivate_ew' | 'no_op';
  description: string;
  fromZone?: number;
  toZone?: number;
  count?: number;
  zoneIndex?: number;
}

/**
 * MCTS tree node.
 */
class MCTSNode {
  move: MCTSMove | null;
  parent: MCTSNode | null;
  children: MCTSNode[] = [];
  visits = 0;
  totalReward = 0;
  untriedMoves: MCTSMove[];

  constructor(move: MCTSMove | null, parent: MCTSNode | null, untriedMoves: MCTSMove[]) {
    this.move = move;
    this.parent = parent;
    this.untriedMoves = untriedMoves;
  }

  /** UCB1 selection score */
  ucb1(explorationWeight: number = 1.414): number {
    if (this.visits === 0) return Infinity;
    const exploitation = this.totalReward / this.visits;
    const exploration = explorationWeight * Math.sqrt(Math.log(this.parent!.visits) / this.visits);
    return exploitation + exploration;
  }

  /** Select child with highest UCB1 */
  selectChild(): MCTSNode {
    let best = this.children[0];
    let bestScore = -Infinity;
    for (const child of this.children) {
      const score = child.ucb1();
      if (score > bestScore) {
        bestScore = score;
        best = child;
      }
    }
    return best;
  }

  /** Expand by creating a child for an untried move */
  expand(rng: RandomStream): MCTSNode {
    const idx = rng.nextInt(0, this.untriedMoves.length - 1);
    const move = this.untriedMoves.splice(idx, 1)[0];
    const child = new MCTSNode(move, this, []);
    this.children.push(child);
    return child;
  }

  /** Backpropagate a reward */
  backpropagate(reward: number): void {
    let node: MCTSNode | null = this;
    while (node) {
      node.visits++;
      node.totalReward += reward;
      node = node.parent;
    }
  }
}

/**
 * Generate legal moves for the blue (defensive) side.
 */
export function getLegalMoves(state: MCTSState): MCTSMove[] {
  const moves: MCTSMove[] = [
    { type: 'no_op', description: 'Hold current positions' },
  ];

  // Reallocate interceptors between zones
  for (let from = 0; from < state.zones.length; from++) {
    for (let to = 0; to < state.zones.length; to++) {
      if (from === to) continue;
      if (state.zones[from].blueInterceptors < 10) continue;

      const count = Math.floor(state.zones[from].blueInterceptors * 0.3);
      if (count < 5) continue;

      moves.push({
        type: 'reallocate',
        description: `Move ${count} interceptors from ${state.zones[from].facilityName} to ${state.zones[to].facilityName}`,
        fromZone: from,
        toZone: to,
        count,
      });
    }
  }

  // Toggle EW in each zone
  for (let i = 0; i < state.zones.length; i++) {
    if (!state.zones[i].ewActive) {
      moves.push({
        type: 'activate_ew',
        description: `Activate EW jamming at ${state.zones[i].facilityName}`,
        zoneIndex: i,
      });
    } else {
      moves.push({
        type: 'deactivate_ew',
        description: `Deactivate EW at ${state.zones[i].facilityName}`,
        zoneIndex: i,
      });
    }
  }

  return moves;
}

/**
 * Apply a move to produce a new state.
 */
export function applyMove(state: MCTSState, move: MCTSMove): MCTSState {
  const newState: MCTSState = {
    ...state,
    zones: state.zones.map((z) => ({ ...z })),
  };

  switch (move.type) {
    case 'reallocate':
      if (move.fromZone !== undefined && move.toZone !== undefined && move.count !== undefined) {
        newState.zones[move.fromZone].blueInterceptors -= move.count;
        newState.zones[move.toZone].blueInterceptors += move.count;
      }
      break;
    case 'activate_ew':
      if (move.zoneIndex !== undefined) {
        newState.zones[move.zoneIndex].ewActive = true;
      }
      break;
    case 'deactivate_ew':
      if (move.zoneIndex !== undefined) {
        newState.zones[move.zoneIndex].ewActive = false;
      }
      break;
    case 'no_op':
      break;
  }

  return newState;
}

/**
 * Fast abstract rollout: simulate the rest of the scenario at zone level.
 * Returns a reward in [0, 1].
 */
export function rollout(state: MCTSState, rng: RandomStream): number {
  const s = {
    zones: state.zones.map((z) => ({ ...z })),
    redWavesRemaining: state.redWavesRemaining,
    facilitiesIntact: state.facilitiesIntact,
  };

  // Simulate remaining red waves
  const dronesPerWave = Math.ceil(state.redBudgetRemaining / 30000 / Math.max(1, s.redWavesRemaining));

  for (let wave = 0; wave < s.redWavesRemaining; wave++) {
    // Red distributes drones across zones (weighted toward highest value)
    const totalValue = s.zones.reduce((sum, z) => sum + (z.facilityHpRemaining > 0 ? z.facilityValue : 0), 0);
    if (totalValue === 0) break;

    for (const zone of s.zones) {
      if (zone.facilityHpRemaining <= 0) continue;

      const share = zone.facilityValue / totalValue;
      const incoming = Math.floor(dronesPerWave * share);
      if (incoming === 0) continue;

      // Calculate interception rate
      const saturation = Math.min(1.0, zone.blueInterceptors / Math.max(1, incoming));
      const basePkill = 0.7;
      const ewBonus = zone.ewActive && state.gpsJammingActive ? 0.0 : (zone.ewActive ? 0.15 : 0);
      const effectivePkill = Math.min(0.95, (basePkill + ewBonus) * saturation);

      let getting_through = 0;
      for (let i = 0; i < incoming; i++) {
        if (!rng.chance(effectivePkill)) {
          getting_through++;
        }
      }

      // Damage facility
      zone.facilityHpRemaining -= getting_through;
      if (zone.facilityHpRemaining <= 0) {
        zone.facilityHpRemaining = 0;
        s.facilitiesIntact--;
      }

      // Consume interceptors
      const intercepted = incoming - getting_through;
      zone.blueInterceptors = Math.max(0, zone.blueInterceptors - intercepted);
    }
  }

  // Evaluate: primary = facilities intact, secondary = total remaining HP
  const maxFacilities = state.zones.length;
  const intactCount = s.zones.filter((z) => z.facilityHpRemaining > 0).length;
  const totalHpRemaining = s.zones.reduce((sum, z) => sum + Math.max(0, z.facilityHpRemaining), 0);
  const maxHp = state.zones.reduce((sum, z) => sum + z.facilityHpRemaining, 0);

  const facilityScore = intactCount / maxFacilities;
  const hpScore = maxHp > 0 ? totalHpRemaining / maxHp : 0;

  return facilityScore * 0.7 + hpScore * 0.3;
}

/**
 * MCTS search result.
 */
export interface MCTSResult {
  bestMove: MCTSMove;
  expectedReward: number;
  iterations: number;
  moveScores: { move: MCTSMove; visits: number; avgReward: number }[];
}

/**
 * Run MCTS search to find the best defensive move.
 */
export function mctsSearch(
  state: MCTSState,
  iterations: number = 1000,
  seed: number = 42
): MCTSResult {
  const rng = new RandomStream(seed);
  const legalMoves = getLegalMoves(state);
  const root = new MCTSNode(null, null, [...legalMoves]);

  for (let i = 0; i < iterations; i++) {
    // Selection
    let node = root;
    let currentState = { ...state, zones: state.zones.map((z) => ({ ...z })) };

    while (node.untriedMoves.length === 0 && node.children.length > 0) {
      node = node.selectChild();
      if (node.move) {
        currentState = applyMove(currentState, node.move);
      }
    }

    // Expansion
    if (node.untriedMoves.length > 0) {
      node = node.expand(rng);
      if (node.move) {
        currentState = applyMove(currentState, node.move);
      }
    }

    // Rollout
    const reward = rollout(currentState, rng);

    // Backpropagation
    node.backpropagate(reward);
  }

  // Collect results
  const moveScores = root.children.map((child) => ({
    move: child.move!,
    visits: child.visits,
    avgReward: child.visits > 0 ? child.totalReward / child.visits : 0,
  }));

  moveScores.sort((a, b) => b.avgReward - a.avgReward);

  const bestChild = root.children.reduce((best, child) =>
    child.visits > best.visits ? child : best
  );

  return {
    bestMove: bestChild.move!,
    expectedReward: bestChild.totalReward / bestChild.visits,
    iterations,
    moveScores,
  };
}
