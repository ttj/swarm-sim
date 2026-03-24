import { describe, it, expect } from 'vitest';
import { runHeadless, runMonteCarlo } from '../engine/HeadlessRunner';
import type { Scenario, DroneSpec, DefenseAssetSpec, Facility } from '../types';

// === Shared Test Data ===

const shahedSpec: DroneSpec = {
  id: 'shahed-136',
  name: 'Shahed-136',
  side: 'red',
  domain: 'air',
  speedKmh: 150,
  cruiseSpeedKmh: 150,
  maxRangeKm: 2500,
  enduranceMinutes: 360,
  costUSD: 30000,
  payloadKg: 40,
  guidance: 'gps',
  vulnerabilities: { ewJammable: true, radarCrossSection: 'low', irSignature: 'low' },
};

const interceptorAssetSpec: DefenseAssetSpec = {
  id: 'interceptor-squad',
  name: 'Interceptor Squad',
  type: 'interceptor_squad',
  rangeKm: 20,
  costPerUseUSD: 2000,
  fixedCostUSD: 100000,
  capacity: 50,
  reloadTimeMinutes: 0,
  pkill: 0.7,
};

const testFacility: Facility = {
  id: 'tsmc-hsinchu-hq',
  name: 'TSMC Hsinchu',
  position: [120.99, 24.80],
  radiusKm: 2.5,
  value: 100,
  hitPoints: 5,
  currentHitPoints: 5,
  status: 'operational',
};

function createTestScenario(droneCount: number, defenseStock: number): Scenario {
  return {
    id: 'test',
    name: 'Test',
    description: 'Test scenario',
    durationHours: 4,
    redForce: {
      conventionalStrikes: [],
      vessels: [],
      quarantineFormation: 'arc',
      airWaves: [{
        id: 'wave-1',
        launchTimeMinutes: 1,
        droneSpec: 'shahed-136',
        count: droneCount,
        origin: [119.3, 24.5],
        target: 'tsmc-hsinchu-hq',
        approachBearing: 90,
        formation: 'dispersed',
      }],
      seaLaunchedWaves: [],
      uuvDeployment: { count: 0, mineTargets: [] },
      strategy: 'saturation_rush',
      totalBudgetUSD: droneCount * 30000,
      gpsJammingActive: false,
      ewCapability: 'none',
    },
    blueForce: {
      assets: [{
        instanceId: 100,
        specId: 'interceptor-squad',
        type: 'interceptor_squad',
        position: [120.85, 24.80],
        currentStock: defenseStock,
        maxStock: defenseStock,
        reloadTimer: 0,
        isActive: true,
      }],
      totalBudgetUSD: 1000000,
      alliedSupport: { enabled: false, carrierStrikeGroup: false, submarineSupport: false, ewSupport: false },
      c2Resilience: 'distributed',
      productionRate: 0,
    },
    facilities: [{ ...testFacility }],
    environment: {
      windSpeedKmh: 15,
      windBearing: 270,
      visibility: 'clear',
      timeOfDay: 'day',
      seaState: 2,
    },
  };
}

// === Tests ===

describe('HeadlessRunner', () => {
  describe('runHeadless', () => {
    it('completes a simulation to the end', () => {
      const scenario = createTestScenario(10, 20);
      const result = runHeadless(scenario, [shahedSpec], [interceptorAssetSpec], 42);

      expect(result.seed).toBe(42);
      expect(result.totalTicks).toBeGreaterThan(0);
      expect(result.durationSec).toBeGreaterThan(0);
    });

    it('is deterministic for the same seed', () => {
      const scenario = createTestScenario(10, 20);
      const result1 = runHeadless(scenario, [shahedSpec], [interceptorAssetSpec], 42);
      const result2 = runHeadless(scenario, [shahedSpec], [interceptorAssetSpec], 42);

      expect(result1.facilitiesOperational).toBe(result2.facilitiesOperational);
      expect(result1.facilitiesDestroyed).toBe(result2.facilitiesDestroyed);
      expect(result1.dronesDestroyedRed).toBe(result2.dronesDestroyedRed);
      expect(result1.costRed).toBe(result2.costRed);
      expect(result1.costBlue).toBe(result2.costBlue);
    });

    it('produces different results for different seeds', () => {
      const scenario = createTestScenario(50, 10);
      const results = [];
      for (let seed = 1; seed <= 20; seed++) {
        results.push(runHeadless(scenario, [shahedSpec], [interceptorAssetSpec], seed));
      }
      // Not all results should be identical (stochastic)
      const uniqueDestroyed = new Set(results.map((r) => r.dronesDestroyedRed));
      expect(uniqueDestroyed.size).toBeGreaterThan(1);
    });

    it('reports facility survival map', () => {
      const scenario = createTestScenario(10, 20);
      const result = runHeadless(scenario, [shahedSpec], [interceptorAssetSpec], 42);

      expect(result.facilitySurvivalMap).toHaveProperty('tsmc-hsinchu-hq');
      expect(['operational', 'damaged', 'destroyed']).toContain(
        result.facilitySurvivalMap['tsmc-hsinchu-hq']
      );
    });

    it('tracks costs correctly', () => {
      const scenario = createTestScenario(10, 20);
      const result = runHeadless(scenario, [shahedSpec], [interceptorAssetSpec], 42);

      // Red should have launched 10 drones at $30k each
      expect(result.costRed).toBeGreaterThanOrEqual(10 * 30000);
      // Blue should have spent something on interceptions
      expect(result.costBlue).toBeGreaterThanOrEqual(0);
    });

    it('shows saturation effect: many drones overwhelm few defenders', () => {
      // Heavy attack, light defense
      const heavyAttack = createTestScenario(100, 10);
      const heavyResults = [];
      for (let i = 0; i < 20; i++) {
        heavyResults.push(runHeadless(heavyAttack, [shahedSpec], [interceptorAssetSpec], i));
      }

      // Light attack, heavy defense
      const lightAttack = createTestScenario(10, 50);
      const lightResults = [];
      for (let i = 0; i < 20; i++) {
        lightResults.push(runHeadless(lightAttack, [shahedSpec], [interceptorAssetSpec], i + 100));
      }

      const heavyAvgDestroyed = heavyResults.reduce((s, r) => s + r.facilitiesDestroyed, 0) / heavyResults.length;
      const lightAvgDestroyed = lightResults.reduce((s, r) => s + r.facilitiesDestroyed, 0) / lightResults.length;

      // Heavy attack should cause more facility destruction on average
      expect(heavyAvgDestroyed).toBeGreaterThanOrEqual(lightAvgDestroyed);
    });
  });

  describe('runMonteCarlo', () => {
    it('runs specified number of simulations', () => {
      const scenario = createTestScenario(10, 20);
      const results = runMonteCarlo(scenario, [shahedSpec], [interceptorAssetSpec], 30);

      expect(results.numRuns).toBe(30);
      expect(results.results).toHaveLength(30);
    });

    it('probabilities sum to approximately 1', () => {
      const scenario = createTestScenario(30, 15);
      const results = runMonteCarlo(scenario, [shahedSpec], [interceptorAssetSpec], 50);

      const totalProb = results.distribution.reduce((s, p) => s + p, 0);
      expect(totalProb).toBeCloseTo(1.0, 2);
    });

    it('returns valid probability values', () => {
      const scenario = createTestScenario(30, 15);
      const results = runMonteCarlo(scenario, [shahedSpec], [interceptorAssetSpec], 50);

      expect(results.probAllSafe).toBeGreaterThanOrEqual(0);
      expect(results.probAllSafe).toBeLessThanOrEqual(1);
      expect(results.probAllDestroyed).toBeGreaterThanOrEqual(0);
      expect(results.probAllDestroyed).toBeLessThanOrEqual(1);
      expect(results.probAtLeast3Safe).toBeGreaterThanOrEqual(results.probAllSafe);
      expect(results.probAtLeast2Safe).toBeGreaterThanOrEqual(results.probAtLeast3Safe);
    });

    it('calculates per-facility destruction probabilities', () => {
      const scenario = createTestScenario(30, 15);
      const results = runMonteCarlo(scenario, [shahedSpec], [interceptorAssetSpec], 50);

      expect(results.facilityDestructionProb).toHaveProperty('tsmc-hsinchu-hq');
      const prob = results.facilityDestructionProb['tsmc-hsinchu-hq'];
      expect(prob).toBeGreaterThanOrEqual(0);
      expect(prob).toBeLessThanOrEqual(1);
    });

    it('heavy defense yields higher survival probability', () => {
      const heavyDefense = createTestScenario(20, 50);
      const lightDefense = createTestScenario(20, 5);

      const heavyResults = runMonteCarlo(heavyDefense, [shahedSpec], [interceptorAssetSpec], 50, 1);
      const lightResults = runMonteCarlo(lightDefense, [shahedSpec], [interceptorAssetSpec], 50, 1000);

      // Heavy defense should have higher or equal survival probability
      expect(heavyResults.probAllSafe).toBeGreaterThanOrEqual(lightResults.probAllSafe);
    });

    it('computes average cost exchange ratio', () => {
      const scenario = createTestScenario(30, 15);
      const results = runMonteCarlo(scenario, [shahedSpec], [interceptorAssetSpec], 50);

      expect(results.avgCER).toBeGreaterThanOrEqual(0);
      expect(results.avgCostRed).toBeGreaterThan(0);
    });

    it('runs fast enough for interactive use (100 runs < 5s)', () => {
      const scenario = createTestScenario(50, 20);
      const start = performance.now();
      runMonteCarlo(scenario, [shahedSpec], [interceptorAssetSpec], 100);
      const elapsed = performance.now() - start;

      // Should complete in reasonable time for interactive use
      expect(elapsed).toBeLessThan(5000);
    });
  });
});
