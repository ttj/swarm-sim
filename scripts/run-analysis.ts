/**
 * Standalone script to run deep strategy analysis.
 * Usage: npx tsx scripts/run-analysis.ts
 */

import { runStrategySearch } from '../src/ai/StrategySearch';
import type { Facility, DroneSpec, DefenseAssetSpec } from '../src/types';

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
  { id: 'hpm-leonidas', name: 'Leonidas HPM', type: 'hpm', rangeKm: 1, costPerUseUSD: 5, fixedCostUSD: 16500000, capacity: 9999, reloadTimeMinutes: 0.08, pkill: 0.95 },
  { id: 'skyfall-interceptor', name: 'SkyFall', type: 'interceptor_squad', rangeKm: 15, costPerUseUSD: 1000, fixedCostUSD: 10000, capacity: 50, reloadTimeMinutes: 0, pkill: 0.65 },
];

// Count available attack templates
const attackCount = 7; // Original 4 + autonomous + fiber-optic + Jiutian
console.log(`Running deep strategy analysis across ${attackCount} attack scenarios...\n`);

for (let attackIdx = 0; attackIdx < attackCount; attackIdx++) {
  const start = Date.now();
  const results = runStrategySearch(facilities, droneSpecs, assetSpecs, attackIdx, 20);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\n${'='.repeat(80)}`);
  console.log(`ATTACK: ${results.attack.name} (${elapsed}s)`);
  console.log(`${'='.repeat(80)}`);

  console.log(`\nTOP 10 BY COST EFFICIENCY:`);
  console.log(`${'Cost'.padEnd(9)} | ${'P(>=3)'.padEnd(7)} | ${'P(all)'.padEnd(7)} | ${'Kills'.padEnd(6)} | ${'CER'.padEnd(7)} | ${'Eff'.padEnd(6)} | Strategy`);
  console.log(`${'-'.repeat(80)}`);

  for (const r of results.strategies.slice(0, 10)) {
    const cost = r.strategy.totalCostUSD < 1_000_000
      ? `$${(r.strategy.totalCostUSD / 1000).toFixed(0)}K`
      : `$${(r.strategy.totalCostUSD / 1_000_000).toFixed(1)}M`;
    console.log(
      `${cost.padEnd(9)} | ` +
      `${(r.results.probAtLeast3Safe * 100).toFixed(0).padStart(4)}%  | ` +
      `${(r.results.probAllSafe * 100).toFixed(0).padStart(4)}%  | ` +
      `${r.results.avgDronesDestroyedRed.toFixed(0).padStart(5)} | ` +
      `$${(r.results.avgCER / 1000).toFixed(0).padStart(4)}K | ` +
      `${r.costEfficiency.toFixed(1).padStart(5)} | ` +
      `${r.strategy.name}`
    );
  }

  console.log(`\nBY CATEGORY:`);
  if (results.bestCheap) {
    console.log(`  BEST CHEAP (<$1M):  ${results.bestCheap.strategy.name} → P(>=3 safe)=${(results.bestCheap.results.probAtLeast3Safe * 100).toFixed(0)}% for $${(results.bestCheap.strategy.totalCostUSD / 1000).toFixed(0)}K`);
  }
  if (results.bestMid) {
    console.log(`  BEST MID (<$15M):   ${results.bestMid.strategy.name} → P(>=3 safe)=${(results.bestMid.results.probAtLeast3Safe * 100).toFixed(0)}%`);
  }
  if (results.bestOverall) {
    console.log(`  BEST OVERALL:       ${results.bestOverall.strategy.name} → P(>=3 safe)=${(results.bestOverall.results.probAtLeast3Safe * 100).toFixed(0)}%`);
  }

  console.log(`\nINSIGHTS:`);
  for (const insight of results.insights) {
    console.log(`  → ${insight}`);
  }
}
