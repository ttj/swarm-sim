import { describe, it, expect } from 'vitest';
import { runStrategySearch, generateStrategies, buildAttackTemplates } from '../ai/StrategySearch';
import type { Facility, DroneSpec, DefenseAssetSpec } from '../types';

const facilities: Facility[] = [
  { id: 'tsmc-hsinchu', name: 'TSMC Hsinchu', position: [120.99, 24.80], radiusKm: 2.5, value: 100, hitPoints: 5, currentHitPoints: 5, status: 'operational' },
  { id: 'tsmc-taichung', name: 'TSMC Taichung', position: [120.68, 24.14], radiusKm: 1.5, value: 60, hitPoints: 4, currentHitPoints: 4, status: 'operational' },
  { id: 'tsmc-tainan', name: 'TSMC Tainan', position: [120.27, 23.08], radiusKm: 2.0, value: 90, hitPoints: 5, currentHitPoints: 5, status: 'operational' },
  { id: 'tsmc-kaohsiung', name: 'TSMC Kaohsiung', position: [120.30, 22.63], radiusKm: 1.5, value: 80, hitPoints: 4, currentHitPoints: 4, status: 'operational' },
];

const droneSpecs: DroneSpec[] = [
  { id: 'shahed-136', name: 'Shahed-136', side: 'red', domain: 'air', speedKmh: 150, cruiseSpeedKmh: 150, maxRangeKm: 2500, enduranceMinutes: 360, costUSD: 30000, payloadKg: 40, guidance: 'gps', vulnerabilities: { ewJammable: true, radarCrossSection: 'low', irSignature: 'low' } },
  { id: 'fpv-kamikaze', name: 'FPV', side: 'red', domain: 'air', speedKmh: 150, cruiseSpeedKmh: 120, maxRangeKm: 15, enduranceMinutes: 25, costUSD: 1500, payloadKg: 2, guidance: 'rf_command', vulnerabilities: { ewJammable: true, radarCrossSection: 'low', irSignature: 'low' } },
  { id: 'interceptor-cheap', name: 'Interceptor', side: 'blue', domain: 'air', speedKmh: 200, cruiseSpeedKmh: 160, maxRangeKm: 20, enduranceMinutes: 30, costUSD: 2000, payloadKg: 1, guidance: 'gps', vulnerabilities: { ewJammable: true, radarCrossSection: 'low', irSignature: 'low' } },
  { id: 'interceptor-autonav', name: 'Auto-Nav', side: 'blue', domain: 'air', speedKmh: 200, cruiseSpeedKmh: 160, maxRangeKm: 20, enduranceMinutes: 40, costUSD: 15000, payloadKg: 1, guidance: 'autonomous_vision', vulnerabilities: { ewJammable: false, radarCrossSection: 'low', irSignature: 'low' } },
];

const assetSpecs: DefenseAssetSpec[] = [
  { id: 'interceptor-squad', name: 'Interceptor Squad', type: 'interceptor_squad', rangeKm: 20, costPerUseUSD: 2000, fixedCostUSD: 100000, capacity: 50, reloadTimeMinutes: 0, pkill: 0.7 },
  { id: 'ew-jammer', name: 'EW Jammer', type: 'ew_jammer', rangeKm: 15, costPerUseUSD: 0, fixedCostUSD: 3000000, capacity: 9999, reloadTimeMinutes: 0, pkill: 0.5 },
  { id: 'directed-energy-50kw', name: '50kW DE', type: 'directed_energy', rangeKm: 2, costPerUseUSD: 10, fixedCostUSD: 10000000, capacity: 9999, reloadTimeMinutes: 0.08, pkill: 0.8 },
  { id: 'decoy-emitter', name: 'Decoy', type: 'decoy_emitter', rangeKm: 5, costPerUseUSD: 0, fixedCostUSD: 3000, capacity: 9999, reloadTimeMinutes: 0, pkill: 0 },
  { id: 'net-launcher', name: 'Net', type: 'net_launcher', rangeKm: 2, costPerUseUSD: 500, fixedCostUSD: 5000, capacity: 3, reloadTimeMinutes: 15, pkill: 0.7 },
];

describe('Strategy Search', () => {
  it('generates multiple strategies', () => {
    const strategies = generateStrategies();
    expect(strategies.length).toBeGreaterThan(15);
  });

  it('generates attack templates', () => {
    const attacks = buildAttackTemplates(facilities);
    expect(attacks.length).toBe(4);
  });

  it('runs search and finds strategies', () => {
    const results = runStrategySearch(facilities, droneSpecs, assetSpecs, 0, 10);
    expect(results.strategies.length).toBeGreaterThan(10);
    expect(results.attack.id).toBe('attack-500');
  }, 120_000);

  it('prints deep analysis results', () => {
    // Run against all 4 attack scenarios with enough runs for meaningful stats
    for (let attackIdx = 0; attackIdx < 4; attackIdx++) {
      const results = runStrategySearch(facilities, droneSpecs, assetSpecs, attackIdx, 15);

      console.log(`\n${'='.repeat(70)}`);
      console.log(`ATTACK: ${results.attack.name}`);
      console.log(`${'='.repeat(70)}`);
      console.log(`\nTOP 10 BY COST EFFICIENCY (survival improvement per $M):`);
      for (const r of results.strategies.slice(0, 10)) {
        const cost = r.strategy.totalCostUSD < 1_000_000
          ? `$${(r.strategy.totalCostUSD / 1000).toFixed(0)}K`
          : `$${(r.strategy.totalCostUSD / 1_000_000).toFixed(1)}M`;
        console.log(
          `  ${cost.padEnd(8)} | P(>=3): ${(r.results.probAtLeast3Safe * 100).toFixed(0).padStart(3)}% | ` +
          `P(all): ${(r.results.probAllSafe * 100).toFixed(0).padStart(3)}% | ` +
          `Kills: ${r.results.avgDronesDestroyedRed.toFixed(0).padStart(4)} | ` +
          `CER: $${(r.results.avgCER / 1000).toFixed(0)}K | ` +
          `Eff: ${r.costEfficiency.toFixed(1).padStart(5)} | ` +
          `${r.strategy.name}`
        );
      }

      if (results.bestCheap) {
        console.log(`\nBEST CHEAP (<$1M): ${results.bestCheap.strategy.name} → ${(results.bestCheap.results.probAtLeast3Safe * 100).toFixed(0)}%`);
      }
      if (results.bestMid) {
        console.log(`BEST MID (<$15M): ${results.bestMid.strategy.name} → ${(results.bestMid.results.probAtLeast3Safe * 100).toFixed(0)}%`);
      }
      if (results.bestOverall) {
        console.log(`BEST OVERALL: ${results.bestOverall.strategy.name} → ${(results.bestOverall.results.probAtLeast3Safe * 100).toFixed(0)}%`);
      }

      console.log(`\nINSIGHTS:`);
      for (const i of results.insights) {
        console.log(`  → ${i}`);
      }
    }

    expect(true).toBe(true); // Always passes; output is the value
  }, 600_000);
});
