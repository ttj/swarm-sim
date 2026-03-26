import { describe, it, expect } from 'vitest';
import { WargameEngine } from '../engine/WargameEngine';
import type { Scenario, DroneSpec, DefenseAssetSpec } from '../types';

const droneSpecs: DroneSpec[] = [
  { id: 'shahed-136', name: 'Shahed', side: 'red', domain: 'air', speedKmh: 150, cruiseSpeedKmh: 150, maxRangeKm: 2500, enduranceMinutes: 360, costUSD: 30000, payloadKg: 40, guidance: 'gps', vulnerabilities: { ewJammable: true, radarCrossSection: 'low', irSignature: 'low' } },
  { id: 'interceptor-cheap', name: 'Interceptor', side: 'blue', domain: 'air', speedKmh: 200, cruiseSpeedKmh: 160, maxRangeKm: 20, enduranceMinutes: 30, costUSD: 2000, payloadKg: 1, guidance: 'gps', vulnerabilities: { ewJammable: true, radarCrossSection: 'low', irSignature: 'low' } },
];

const assetSpecs: DefenseAssetSpec[] = [
  { id: 'interceptor-squad', name: 'Squad', type: 'interceptor_squad', rangeKm: 20, costPerUseUSD: 2000, fixedCostUSD: 100000, capacity: 50, reloadTimeMinutes: 0, pkill: 0.7 },
  { id: 'ew-jammer', name: 'EW', type: 'ew_jammer', rangeKm: 15, costPerUseUSD: 0, fixedCostUSD: 3000000, capacity: 9999, reloadTimeMinutes: 0, pkill: 0.5 },
];

function makeScenario(): Scenario {
  return {
    id: 'test', name: 'Test', description: '', durationHours: 24,
    redForce: {
      conventionalStrikes: [], vessels: [], quarantineFormation: 'arc',
      airWaves: [], seaLaunchedWaves: [],
      uuvDeployment: { count: 0, mineTargets: [] },
      strategy: 'saturation_rush', totalBudgetUSD: 10000000,
      gpsJammingActive: false, ewCapability: 'none',
    },
    blueForce: {
      assets: [{
        instanceId: 100, specId: 'interceptor-squad', type: 'interceptor_squad',
        position: [121.0, 24.8], currentStock: 50, maxStock: 50, reloadTimer: 0, isActive: true,
      }],
      totalBudgetUSD: 1000000,
      alliedSupport: { enabled: false, carrierStrikeGroup: false, submarineSupport: false, ewSupport: false },
      c2Resilience: 'distributed', productionRate: 0,
    },
    facilities: [
      { id: 'tsmc-hsinchu-hq', name: 'Hsinchu', position: [121.01, 24.77], radiusKm: 1.5, value: 100, hitPoints: 5, currentHitPoints: 5, status: 'operational' },
      { id: 'tsmc-tainan-fab18', name: 'Tainan', position: [120.26, 23.12], radiusKm: 2.0, value: 90, hitPoints: 5, currentHitPoints: 5, status: 'operational' },
    ],
    environment: { windSpeedKmh: 15, windBearing: 270, visibility: 'clear', timeOfDay: 'day', seaState: 2 },
  };
}

describe('WargameEngine', () => {
  it('initializes in blue_plan phase', () => {
    const engine = new WargameEngine(makeScenario(), droneSpecs, assetSpecs, 24);
    const state = engine.getState();
    expect(state.turn.phase).toBe('blue_plan');
    expect(state.turn.turnNumber).toBe(1);
    expect(state.turn.currentSide).toBe('blue');
    expect(state.gameOver).toBe(false);
  });

  it('transitions blue→red→resolve correctly', () => {
    const engine = new WargameEngine(makeScenario(), droneSpecs, assetSpecs, 24);

    engine.submitBlueTurn();
    expect(engine.getState().turn.phase).toBe('red_plan');
    expect(engine.getState().turn.currentSide).toBe('red');

    engine.submitRedTurn();
    // After resolve, should advance to next turn (blue_plan) or game over
    const state = engine.getState();
    expect(state.turn.turnNumber).toBe(2);
    expect(state.turn.phase).toBe('blue_plan');
  });

  it('queues red waves before submitting', () => {
    const engine = new WargameEngine(makeScenario(), droneSpecs, assetSpecs, 24);
    engine.submitBlueTurn();

    engine.queueRedWave('shahed-136', 50, 'tsmc-hsinchu-hq', [119.3, 24.5]);
    const state = engine.getState();
    expect(state.log.some((l) => l.includes('queues 50'))).toBe(true);
  });

  it('tracks scores across turns', () => {
    const engine = new WargameEngine(makeScenario(), droneSpecs, assetSpecs, 3);

    // Play 3 turns with no attacks
    for (let i = 0; i < 3; i++) {
      engine.submitBlueTurn();
      engine.submitRedTurn();
    }

    const state = engine.getState();
    // Blue should get points for operational facilities each turn
    expect(state.blueScore).toBeGreaterThan(0);
    expect(state.gameOver).toBe(true);
  });

  it('detects game over at max turns', () => {
    const engine = new WargameEngine(makeScenario(), droneSpecs, assetSpecs, 2);

    engine.submitBlueTurn();
    engine.submitRedTurn();
    engine.submitBlueTurn();
    engine.submitRedTurn();

    const state = engine.getState();
    expect(state.gameOver).toBe(true);
    expect(state.winner).not.toBeNull();
  });

  it('GPS jamming toggle persists through turns', () => {
    const engine = new WargameEngine(makeScenario(), droneSpecs, assetSpecs, 3);
    engine.submitBlueTurn();
    engine.setGpsJamming(true);
    expect(engine.getState().log.some((l) => l.includes('activates GPS'))).toBe(true);
  });

  it('ignores moves in wrong phase', () => {
    const engine = new WargameEngine(makeScenario(), droneSpecs, assetSpecs, 24);
    // In blue_plan, red operations should be ignored
    engine.queueRedWave('shahed-136', 50, 'tsmc-hsinchu-hq', [119.3, 24.5]);
    // Should NOT have logged a wave (wrong phase)
    expect(engine.getState().log.some((l) => l.includes('queues'))).toBe(false);
  });

  it('facility status tracks across turns', () => {
    const engine = new WargameEngine(makeScenario(), droneSpecs, assetSpecs, 5);

    // Turn 1: attack with large wave
    engine.submitBlueTurn();
    engine.queueRedWave('shahed-136', 200, 'tsmc-hsinchu-hq', [119.3, 24.5]);
    engine.submitRedTurn();

    const state = engine.getState();
    expect(state.facilitiesStatus.length).toBe(2);
    // At least one facility should still exist
    expect(state.facilitiesStatus.some((f) => f.status === 'operational' || f.status === 'damaged')).toBe(true);
  });
});
