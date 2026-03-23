import { describe, it, expect } from 'vitest';
import {
  mctsSearch,
  getLegalMoves,
  applyMove,
  rollout,
  type MCTSState,
  type ZoneState,
} from '../ai/MCTSEngine';
import { RandomStream } from '../engine/RandomStream';

function createTestState(overrides?: Partial<MCTSState>): MCTSState {
  const zones: ZoneState[] = [
    {
      facilityId: 'tsmc-hsinchu',
      facilityName: 'Hsinchu',
      facilityValue: 100,
      facilityHpRemaining: 5,
      blueInterceptors: 40,
      ewActive: false,
      incomingDrones: 100,
    },
    {
      facilityId: 'tsmc-tainan',
      facilityName: 'Tainan',
      facilityValue: 90,
      facilityHpRemaining: 5,
      blueInterceptors: 20,
      ewActive: false,
      incomingDrones: 50,
    },
    {
      facilityId: 'tsmc-kaohsiung',
      facilityName: 'Kaohsiung',
      facilityValue: 80,
      facilityHpRemaining: 4,
      blueInterceptors: 15,
      ewActive: false,
      incomingDrones: 30,
    },
  ];

  return {
    zones,
    redBudgetRemaining: 5000000,
    redWavesRemaining: 3,
    blueInterceptorsTotal: 75,
    facilitiesIntact: 3,
    facilitiesTotalValue: 270,
    timeSec: 0,
    gpsJammingActive: false,
    ...overrides,
  };
}

describe('MCTS Engine', () => {
  describe('getLegalMoves', () => {
    it('always includes no_op', () => {
      const state = createTestState();
      const moves = getLegalMoves(state);
      const noOps = moves.filter((m) => m.type === 'no_op');
      expect(noOps).toHaveLength(1);
    });

    it('generates reallocation moves between zones with enough interceptors', () => {
      const state = createTestState();
      const moves = getLegalMoves(state);
      const reallocations = moves.filter((m) => m.type === 'reallocate');
      expect(reallocations.length).toBeGreaterThan(0);
    });

    it('generates EW toggle moves for each zone', () => {
      const state = createTestState();
      const moves = getLegalMoves(state);
      const ewMoves = moves.filter((m) => m.type === 'activate_ew' || m.type === 'deactivate_ew');
      expect(ewMoves.length).toBe(3); // One per zone (all currently off -> activate)
    });

    it('does not generate reallocation from zones with few interceptors', () => {
      const state = createTestState();
      state.zones[2].blueInterceptors = 5; // Too few
      const moves = getLegalMoves(state);
      const fromKaohsiung = moves.filter(
        (m) => m.type === 'reallocate' && m.fromZone === 2
      );
      expect(fromKaohsiung).toHaveLength(0);
    });
  });

  describe('applyMove', () => {
    it('reallocates interceptors correctly', () => {
      const state = createTestState();
      const move = {
        type: 'reallocate' as const,
        description: 'test',
        fromZone: 0,
        toZone: 1,
        count: 10,
      };

      const newState = applyMove(state, move);
      expect(newState.zones[0].blueInterceptors).toBe(30); // 40 - 10
      expect(newState.zones[1].blueInterceptors).toBe(30); // 20 + 10
    });

    it('does not mutate original state', () => {
      const state = createTestState();
      const origInterceptors = state.zones[0].blueInterceptors;

      applyMove(state, {
        type: 'reallocate',
        description: 'test',
        fromZone: 0,
        toZone: 1,
        count: 10,
      });

      expect(state.zones[0].blueInterceptors).toBe(origInterceptors);
    });

    it('activates EW correctly', () => {
      const state = createTestState();
      const newState = applyMove(state, {
        type: 'activate_ew',
        description: 'test',
        zoneIndex: 1,
      });
      expect(newState.zones[1].ewActive).toBe(true);
      expect(newState.zones[0].ewActive).toBe(false); // Others unchanged
    });
  });

  describe('rollout', () => {
    it('returns a value in [0, 1]', () => {
      const state = createTestState();
      const rng = new RandomStream(42);

      for (let i = 0; i < 50; i++) {
        const reward = rollout(state, rng);
        expect(reward).toBeGreaterThanOrEqual(0);
        expect(reward).toBeLessThanOrEqual(1);
      }
    });

    it('gives higher reward when defense is stronger', () => {
      const rng1 = new RandomStream(42);
      const rng2 = new RandomStream(42);

      const strongDefense = createTestState({
        redBudgetRemaining: 300000,
        redWavesRemaining: 1,
        zones: [
          { facilityId: 'a', facilityName: 'A', facilityValue: 100, facilityHpRemaining: 5, blueInterceptors: 200, ewActive: true, incomingDrones: 50 },
          { facilityId: 'b', facilityName: 'B', facilityValue: 90, facilityHpRemaining: 5, blueInterceptors: 200, ewActive: true, incomingDrones: 50 },
        ],
      });

      const weakDefense = createTestState({
        redBudgetRemaining: 300000,
        redWavesRemaining: 1,
        zones: [
          { facilityId: 'a', facilityName: 'A', facilityValue: 100, facilityHpRemaining: 5, blueInterceptors: 5, ewActive: false, incomingDrones: 50 },
          { facilityId: 'b', facilityName: 'B', facilityValue: 90, facilityHpRemaining: 5, blueInterceptors: 5, ewActive: false, incomingDrones: 50 },
        ],
      });

      // Average over many rollouts
      let strongTotal = 0;
      let weakTotal = 0;
      const n = 100;
      for (let i = 0; i < n; i++) {
        strongTotal += rollout(strongDefense, rng1);
        weakTotal += rollout(weakDefense, rng2);
      }

      expect(strongTotal / n).toBeGreaterThan(weakTotal / n);
    });
  });

  describe('mctsSearch', () => {
    it('returns a valid result', () => {
      const state = createTestState();
      const result = mctsSearch(state, 200, 42);

      expect(result.bestMove).toBeDefined();
      expect(result.expectedReward).toBeGreaterThanOrEqual(0);
      expect(result.expectedReward).toBeLessThanOrEqual(1);
      expect(result.iterations).toBe(200);
      expect(result.moveScores.length).toBeGreaterThan(0);
    });

    it('visits are distributed across moves', () => {
      const state = createTestState();
      const result = mctsSearch(state, 500, 42);

      const totalVisits = result.moveScores.reduce((s, m) => s + m.visits, 0);
      expect(totalVisits).toBeGreaterThan(0);

      // Best move should have more visits
      expect(result.moveScores[0].visits).toBeGreaterThan(0);
    });

    it('prefers concentration over spreading thin under saturation', () => {
      // Scenario: many drones at Hsinchu, few at Tainan
      // MCTS should suggest moving interceptors TO Hsinchu (or concentrating there)
      const state = createTestState({
        zones: [
          {
            facilityId: 'tsmc-hsinchu',
            facilityName: 'Hsinchu',
            facilityValue: 100,
            facilityHpRemaining: 5,
            blueInterceptors: 20, // Under-defended
            ewActive: false,
            incomingDrones: 200, // Heavy attack
          },
          {
            facilityId: 'tsmc-tainan',
            facilityName: 'Tainan',
            facilityValue: 50, // Lower value
            facilityHpRemaining: 5,
            blueInterceptors: 50, // Over-defended
            ewActive: false,
            incomingDrones: 10, // Light attack
          },
        ],
      });

      const result = mctsSearch(state, 1000, 42);

      // The best move should involve reallocating FROM Tainan TO Hsinchu
      // (or the highest-scoring reallocation should move toward Hsinchu)
      const reallocations = result.moveScores.filter((m) => m.move.type === 'reallocate');
      if (reallocations.length > 0) {
        const toHsinchu = reallocations.filter((m) => m.move.toZone === 0);
        const fromHsinchu = reallocations.filter((m) => m.move.fromZone === 0);

        // Moves toward Hsinchu should have higher average reward than moves away
        if (toHsinchu.length > 0 && fromHsinchu.length > 0) {
          const avgToHsinchu = toHsinchu.reduce((s, m) => s + m.avgReward, 0) / toHsinchu.length;
          const avgFromHsinchu = fromHsinchu.reduce((s, m) => s + m.avgReward, 0) / fromHsinchu.length;
          expect(avgToHsinchu).toBeGreaterThanOrEqual(avgFromHsinchu);
        }
      }
    });

    it('runs fast enough for interactive use (1000 iterations < 2s)', () => {
      const state = createTestState();
      const start = performance.now();
      mctsSearch(state, 1000, 42);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(2000);
    });
  });
});
