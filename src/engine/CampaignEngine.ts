/**
 * Multi-day campaign simulation engine.
 * Models production rates, stockpile depletion, and attrition spirals
 * over a 1-7 day horizon.
 *
 * Each "day" runs a full simulation cycle:
 * 1. Red launches daily attack wave (based on production rate)
 * 2. Blue defends with current stockpiles
 * 3. Both sides replenish from daily production
 * 4. Track cumulative attrition, costs, facility status
 */

import { runHeadless, type SimulationResult } from './HeadlessRunner';
import type { Scenario, DroneSpec, DefenseAssetSpec, Facility, DefenseAssetInstance } from '../types';

export interface CampaignConfig {
  name: string;
  durationDays: number;

  // Red production
  redDronesPerDay: number;
  redDroneSpec: string;
  redCostPerDrone: number;
  redInitialStockpile: number;
  redStrategy: 'even_spread' | 'concentrate_hsinchu' | 'rotate_targets';
  gpsJammingActive: boolean;

  // Blue production
  blueInterceptorsPerDay: number;
  blueInterceptorSpec: string;
  blueInitialStockpile: number;

  // Blue static defenses (don't deplete — EW, HPM, DE)
  blueStaticAssets: DefenseAssetInstance[];
}

export interface DayResult {
  day: number;
  redDronesLaunched: number;
  redDronesDestroyed: number;
  redDronesGotThrough: number;
  blueInterceptorsUsed: number;
  blueInterceptorsRemaining: number;
  redStockpileRemaining: number;
  facilitiesOperational: number;
  facilitiesDamaged: number;
  facilitiesDestroyed: number;
  costRed: number;
  costBlue: number;
  simResult: SimulationResult;
}

export interface CampaignResult {
  config: CampaignConfig;
  days: DayResult[];
  totalRedCost: number;
  totalBlueCost: number;
  breakPointDay: number | null; // Day when all facilities destroyed, or null
  finalFacilitiesOperational: number;
  redStockpileExhaustedDay: number | null;
  blueStockpileExhaustedDay: number | null;
}

// Target facility IDs for attack distribution
// const TARGETS = ['tsmc-hsinchu-hq', 'tsmc-tainan-fab18', 'tsmc-kaohsiung', 'tsmc-taichung'];

/**
 * Run a multi-day campaign simulation.
 */
export function runCampaign(
  config: CampaignConfig,
  facilities: Facility[],
  droneSpecs: DroneSpec[],
  assetSpecs: DefenseAssetSpec[],
  seed: number = 1,
): CampaignResult {
  const days: DayResult[] = [];
  let redStockpile = config.redInitialStockpile;
  let blueInterceptorStock = config.blueInitialStockpile;
  let cumulativeFacilities = facilities.map((f) => ({ ...f }));
  let totalRedCost = 0;
  let totalBlueCost = 0;
  let breakPointDay: number | null = null;
  let redExhaustedDay: number | null = null;
  let blueExhaustedDay: number | null = null;

  for (let day = 1; day <= config.durationDays; day++) {
    // Determine daily attack size (limited by stockpile)
    const dailyAttackSize = Math.min(config.redDronesPerDay, redStockpile);
    if (dailyAttackSize === 0 && redExhaustedDay === null) {
      redExhaustedDay = day;
    }

    // Pick targets based on strategy
    const operationalFacilities = cumulativeFacilities.filter((f) => f.status !== 'destroyed');
    const targetIds = operationalFacilities.map((f) => f.id);

    // Build attack waves for the day
    const waves = buildDailyWaves(dailyAttackSize, config.redDroneSpec, config.redStrategy, targetIds, day);

    // Build blue defense assets for the day
    const blueAssets: DefenseAssetInstance[] = [
      ...config.blueStaticAssets.map((a) => ({ ...a })),
    ];

    // Add interceptor squad based on current stock
    if (blueInterceptorStock > 0) {
      // Distribute interceptors across operational facilities
      const perFacility = Math.floor(blueInterceptorStock / Math.max(1, operationalFacilities.length));
      for (let i = 0; i < operationalFacilities.length && i < 4; i++) {
        blueAssets.push({
          instanceId: 60000 + day * 100 + i,
          specId: config.blueInterceptorSpec,
          type: 'interceptor_squad',
          position: operationalFacilities[i].position,
          currentStock: Math.min(perFacility, blueInterceptorStock),
          maxStock: perFacility,
          reloadTimer: 0,
          isActive: true,
        });
      }
    }

    if (blueInterceptorStock <= 0 && blueExhaustedDay === null) {
      blueExhaustedDay = day;
    }

    // Build scenario for this day
    const dayScenario: Scenario = {
      id: `campaign-day-${day}`,
      name: `Day ${day}`,
      description: '',
      durationHours: 4, // Each day's attack unfolds over 4 hours
      redForce: {
        conventionalStrikes: [],
        vessels: [],
        quarantineFormation: 'arc',
        airWaves: waves,
        seaLaunchedWaves: [],
        uuvDeployment: { count: 0, mineTargets: [] },
        strategy: 'saturation_rush',
        totalBudgetUSD: dailyAttackSize * config.redCostPerDrone,
        gpsJammingActive: config.gpsJammingActive,
        ewCapability: config.gpsJammingActive ? 'moderate' : 'none',
      },
      blueForce: {
        assets: blueAssets,
        totalBudgetUSD: 0,
        alliedSupport: { enabled: false, carrierStrikeGroup: false, submarineSupport: false, ewSupport: false },
        c2Resilience: 'distributed',
        productionRate: 0,
      },
      facilities: cumulativeFacilities.map((f) => ({ ...f })),
      environment: {
        windSpeedKmh: 15, windBearing: 270, visibility: 'clear', timeOfDay: 'day', seaState: 2,
      },
    };

    // Run the day's simulation
    const simResult = runHeadless(dayScenario, droneSpecs, assetSpecs, seed + day);

    // Update cumulative state
    const dronesGotThrough = dailyAttackSize - simResult.dronesDestroyedRed;
    const interceptorsUsed = Math.min(blueInterceptorStock, simResult.dronesDestroyedRed);

    redStockpile -= dailyAttackSize;
    redStockpile += config.redDronesPerDay; // Daily production
    blueInterceptorStock -= interceptorsUsed;
    blueInterceptorStock += config.blueInterceptorsPerDay; // Daily production

    totalRedCost += simResult.costRed;
    totalBlueCost += simResult.costBlue;

    // Update facility status from sim results
    for (const [fId, status] of Object.entries(simResult.facilitySurvivalMap)) {
      const fac = cumulativeFacilities.find((f) => f.id === fId);
      if (fac && status === 'destroyed') {
        fac.status = 'destroyed';
        fac.currentHitPoints = 0;
      } else if (fac && status === 'damaged' && fac.status === 'operational') {
        fac.status = 'damaged';
        fac.currentHitPoints = Math.max(1, fac.currentHitPoints - 1);
      }
    }

    const operational = cumulativeFacilities.filter((f) => f.status === 'operational').length;
    const damaged = cumulativeFacilities.filter((f) => f.status === 'damaged').length;
    const destroyed = cumulativeFacilities.filter((f) => f.status === 'destroyed').length;

    days.push({
      day,
      redDronesLaunched: dailyAttackSize,
      redDronesDestroyed: simResult.dronesDestroyedRed,
      redDronesGotThrough: dronesGotThrough,
      blueInterceptorsUsed: interceptorsUsed,
      blueInterceptorsRemaining: blueInterceptorStock,
      redStockpileRemaining: redStockpile,
      facilitiesOperational: operational,
      facilitiesDamaged: damaged,
      facilitiesDestroyed: destroyed,
      costRed: simResult.costRed,
      costBlue: simResult.costBlue,
      simResult,
    });

    // Check break point
    if (destroyed >= cumulativeFacilities.length && breakPointDay === null) {
      breakPointDay = day;
    }

    // If all destroyed, stop
    if (operational + damaged === 0) break;
  }

  return {
    config,
    days,
    totalRedCost,
    totalBlueCost,
    breakPointDay,
    finalFacilitiesOperational: cumulativeFacilities.filter((f) => f.status === 'operational').length,
    redStockpileExhaustedDay: redExhaustedDay,
    blueStockpileExhaustedDay: blueExhaustedDay,
  };
}

function buildDailyWaves(
  totalDrones: number,
  droneSpec: string,
  strategy: string,
  targetIds: string[],
  day: number,
) {
  if (totalDrones === 0 || targetIds.length === 0) return [];

  const origins: [number, number][] = [
    [119.3, 24.5], [119.0, 23.5], [119.2, 22.8], [119.4, 24.0],
  ];

  if (strategy === 'concentrate_hsinchu') {
    return [{
      id: `day${day}-w1`,
      launchTimeMinutes: 5,
      droneSpec,
      count: totalDrones,
      origin: origins[0],
      target: targetIds.includes('tsmc-hsinchu-hq') ? 'tsmc-hsinchu-hq' : targetIds[0],
      approachBearing: 90,
      formation: 'dispersed' as const,
    }];
  }

  if (strategy === 'rotate_targets') {
    const targetIdx = (day - 1) % targetIds.length;
    return [{
      id: `day${day}-w1`,
      launchTimeMinutes: 5,
      droneSpec,
      count: totalDrones,
      origin: origins[targetIdx % origins.length],
      target: targetIds[targetIdx],
      approachBearing: 85 + (targetIdx * 10),
      formation: 'dispersed' as const,
    }];
  }

  // even_spread: distribute across all targets
  const perTarget = Math.ceil(totalDrones / targetIds.length);
  return targetIds.map((target, i) => ({
    id: `day${day}-w${i + 1}`,
    launchTimeMinutes: 5 + i * 5,
    droneSpec,
    count: Math.min(perTarget, totalDrones - i * perTarget > 0 ? perTarget : 0),
    origin: origins[i % origins.length],
    target,
    approachBearing: 85 + (i * 10),
    formation: 'dispersed' as const,
  })).filter((w) => w.count > 0);
}

/**
 * Preset campaign configurations.
 */
export function getCampaignPresets(): CampaignConfig[] {
  return [
    {
      name: '7-Day: China 400/day vs Taiwan (EW defense)',
      durationDays: 7,
      redDronesPerDay: 400,
      redDroneSpec: 'shahed-136',
      redCostPerDrone: 30000,
      redInitialStockpile: 1000,
      redStrategy: 'even_spread',
      gpsJammingActive: false,
      blueInterceptorsPerDay: 40,
      blueInterceptorSpec: 'interceptor-cheap',
      blueInitialStockpile: 500,
      blueStaticAssets: [
        { instanceId: 70001, specId: 'ew-jammer', type: 'ew_jammer', position: [120.97, 24.80], currentStock: 9999, maxStock: 9999, reloadTimer: 0, isActive: true },
        { instanceId: 70002, specId: 'ew-jammer', type: 'ew_jammer', position: [120.25, 23.08], currentStock: 9999, maxStock: 9999, reloadTimer: 0, isActive: true },
        { instanceId: 70003, specId: 'ew-jammer', type: 'ew_jammer', position: [120.64, 24.255], currentStock: 9999, maxStock: 9999, reloadTimer: 0, isActive: true },
        { instanceId: 70004, specId: 'ew-jammer', type: 'ew_jammer', position: [120.30, 22.719], currentStock: 9999, maxStock: 9999, reloadTimer: 0, isActive: true },
      ],
    },
    {
      name: '7-Day: China 400/day vs HPM defense',
      durationDays: 7,
      redDronesPerDay: 400,
      redDroneSpec: 'shahed-136',
      redCostPerDrone: 30000,
      redInitialStockpile: 1000,
      redStrategy: 'even_spread',
      gpsJammingActive: true,
      blueInterceptorsPerDay: 40,
      blueInterceptorSpec: 'skyfall-interceptor',
      blueInitialStockpile: 200,
      blueStaticAssets: [
        { instanceId: 70001, specId: 'hpm-leonidas', type: 'hpm', position: [120.97, 24.80], currentStock: 9999, maxStock: 9999, reloadTimer: 0, isActive: true },
        { instanceId: 70002, specId: 'hpm-leonidas', type: 'hpm', position: [120.25, 23.08], currentStock: 9999, maxStock: 9999, reloadTimer: 0, isActive: true },
        { instanceId: 70003, specId: 'ew-jammer', type: 'ew_jammer', position: [120.64, 24.255], currentStock: 9999, maxStock: 9999, reloadTimer: 0, isActive: true },
        { instanceId: 70004, specId: 'ew-jammer', type: 'ew_jammer', position: [120.30, 22.719], currentStock: 9999, maxStock: 9999, reloadTimer: 0, isActive: true },
      ],
    },
    {
      name: '7-Day: China 1000/day SURGE (overwhelming)',
      durationDays: 7,
      redDronesPerDay: 1000,
      redDroneSpec: 'shahed-136',
      redCostPerDrone: 30000,
      redInitialStockpile: 3000,
      redStrategy: 'rotate_targets',
      gpsJammingActive: true,
      blueInterceptorsPerDay: 40,
      blueInterceptorSpec: 'interceptor-cheap',
      blueInitialStockpile: 500,
      blueStaticAssets: [
        { instanceId: 70001, specId: 'hpm-leonidas', type: 'hpm', position: [120.97, 24.80], currentStock: 9999, maxStock: 9999, reloadTimer: 0, isActive: true },
        { instanceId: 70002, specId: 'hpm-leonidas', type: 'hpm', position: [120.25, 23.08], currentStock: 9999, maxStock: 9999, reloadTimer: 0, isActive: true },
        { instanceId: 70003, specId: 'hpm-leonidas', type: 'hpm', position: [120.64, 24.255], currentStock: 9999, maxStock: 9999, reloadTimer: 0, isActive: true },
        { instanceId: 70004, specId: 'hpm-leonidas', type: 'hpm', position: [120.30, 22.719], currentStock: 9999, maxStock: 9999, reloadTimer: 0, isActive: true },
        { instanceId: 70005, specId: 'ew-jammer', type: 'ew_jammer', position: [120.97, 24.85], currentStock: 9999, maxStock: 9999, reloadTimer: 0, isActive: true },
        { instanceId: 70006, specId: 'ew-jammer', type: 'ew_jammer', position: [120.25, 23.12], currentStock: 9999, maxStock: 9999, reloadTimer: 0, isActive: true },
      ],
    },
  ];
}
