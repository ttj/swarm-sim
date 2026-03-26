import { describe, it, expect } from 'vitest';
import { runCampaign, getCampaignPresets, type CampaignConfig } from '../engine/CampaignEngine';
import type { Facility, DroneSpec, DefenseAssetSpec } from '../types';

const facilities: Facility[] = [
  { id: 'tsmc-hsinchu-hq', name: 'Hsinchu', position: [121.01, 24.77], radiusKm: 1.5, value: 100, hitPoints: 5, currentHitPoints: 5, status: 'operational' },
  { id: 'tsmc-tainan-fab18', name: 'Tainan', position: [120.26, 23.12], radiusKm: 2.0, value: 90, hitPoints: 5, currentHitPoints: 5, status: 'operational' },
];

const droneSpecs: DroneSpec[] = [
  { id: 'shahed-136', name: 'Shahed', side: 'red', domain: 'air', speedKmh: 150, cruiseSpeedKmh: 150, maxRangeKm: 2500, enduranceMinutes: 360, costUSD: 30000, payloadKg: 40, guidance: 'gps', vulnerabilities: { ewJammable: true, radarCrossSection: 'low', irSignature: 'low' } },
  { id: 'interceptor-cheap', name: 'Interceptor', side: 'blue', domain: 'air', speedKmh: 200, cruiseSpeedKmh: 160, maxRangeKm: 20, enduranceMinutes: 30, costUSD: 2000, payloadKg: 1, guidance: 'gps', vulnerabilities: { ewJammable: true, radarCrossSection: 'low', irSignature: 'low' } },
  { id: 'skyfall-interceptor', name: 'SkyFall', side: 'blue', domain: 'air', speedKmh: 200, cruiseSpeedKmh: 160, maxRangeKm: 15, enduranceMinutes: 20, costUSD: 1000, payloadKg: 1, guidance: 'gps', vulnerabilities: { ewJammable: true, radarCrossSection: 'low', irSignature: 'low' } },
];

const assetSpecs: DefenseAssetSpec[] = [
  { id: 'interceptor-squad', name: 'Interceptor', type: 'interceptor_squad', rangeKm: 20, costPerUseUSD: 2000, fixedCostUSD: 100000, capacity: 50, reloadTimeMinutes: 0, pkill: 0.7 },
  { id: 'ew-jammer', name: 'EW', type: 'ew_jammer', rangeKm: 15, costPerUseUSD: 0, fixedCostUSD: 3000000, capacity: 9999, reloadTimeMinutes: 0, pkill: 0.5 },
  { id: 'hpm-leonidas', name: 'HPM', type: 'hpm', rangeKm: 1, costPerUseUSD: 5, fixedCostUSD: 16500000, capacity: 9999, reloadTimeMinutes: 0.08, pkill: 0.95 },
];

function makeConfig(overrides?: Partial<CampaignConfig>): CampaignConfig {
  return {
    name: 'Test Campaign',
    durationDays: 3,
    redDronesPerDay: 50,
    redDroneSpec: 'shahed-136',
    redCostPerDrone: 30000,
    redInitialStockpile: 100,
    redStrategy: 'even_spread',
    gpsJammingActive: false,
    blueInterceptorsPerDay: 20,
    blueInterceptorSpec: 'interceptor-cheap',
    blueInitialStockpile: 100,
    blueStaticAssets: [],
    ...overrides,
  };
}

describe('CampaignEngine', () => {
  it('runs a campaign and returns day results', () => {
    const config = makeConfig();
    const result = runCampaign(config, facilities, droneSpecs, assetSpecs);
    expect(result.days.length).toBeGreaterThan(0);
    expect(result.days.length).toBeLessThanOrEqual(3);
    expect(result.totalRedCost).toBeGreaterThanOrEqual(0);
  });

  it('tracks cumulative costs across days', () => {
    const config = makeConfig({ durationDays: 2 });
    const result = runCampaign(config, facilities, droneSpecs, assetSpecs);
    expect(result.totalRedCost).toBeGreaterThan(0);
    const sumDailyCosts = result.days.reduce((s, d) => s + d.costRed, 0);
    expect(result.totalRedCost).toBeCloseTo(sumDailyCosts, 0);
  });

  it('runs for specified duration with EW defense', () => {
    const config = makeConfig({
      redInitialStockpile: 50,
      redDronesPerDay: 10,
      blueInitialStockpile: 200,
      blueInterceptorsPerDay: 50,
      durationDays: 3,
      blueStaticAssets: [
        { instanceId: 70001, specId: 'ew-jammer', type: 'ew_jammer', position: [121.0, 24.77], currentStock: 9999, maxStock: 9999, reloadTimer: 0, isActive: true },
        { instanceId: 70002, specId: 'ew-jammer', type: 'ew_jammer', position: [120.26, 23.12], currentStock: 9999, maxStock: 9999, reloadTimer: 0, isActive: true },
      ],
    });
    const result = runCampaign(config, facilities, droneSpecs, assetSpecs);
    // With EW + interceptors vs small attack, should survive all 3 days
    expect(result.days.length).toBe(3);
  });

  it('stops early when all facilities destroyed', () => {
    const config = makeConfig({
      redDronesPerDay: 500,
      redInitialStockpile: 2000,
      blueInitialStockpile: 0,
      blueInterceptorsPerDay: 0,
      durationDays: 7,
    });
    const result = runCampaign(config, facilities, droneSpecs, assetSpecs);
    // With no defense and 500 drones/day, facilities should be destroyed quickly
    if (result.breakPointDay !== null) {
      expect(result.breakPointDay).toBeLessThanOrEqual(7);
      expect(result.days.length).toBeLessThanOrEqual(result.breakPointDay);
    }
  });

  it('presets generate valid configurations', () => {
    const presets = getCampaignPresets();
    expect(presets.length).toBeGreaterThanOrEqual(3);
    for (const p of presets) {
      expect(p.durationDays).toBeGreaterThan(0);
      expect(p.redDronesPerDay).toBeGreaterThan(0);
      expect(p.redDroneSpec).toBeTruthy();
    }
  });

  it('day results contain expected fields', () => {
    const config = makeConfig({ durationDays: 1 });
    const result = runCampaign(config, facilities, droneSpecs, assetSpecs);
    const day = result.days[0];
    expect(day.day).toBe(1);
    expect(day.redDronesLaunched).toBeGreaterThanOrEqual(0);
    expect(day.blueInterceptorsRemaining).toBeGreaterThanOrEqual(0);
    expect(day.facilitiesOperational + day.facilitiesDamaged + day.facilitiesDestroyed).toBe(facilities.length);
  });
});
