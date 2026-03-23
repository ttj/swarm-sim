import type { Scenario, Facility, DefenseAssetInstance } from '../types';

// Fujian coast launch origins
const FUJIAN_NORTH: [number, number] = [119.3, 24.5];
const FUJIAN_CENTRAL: [number, number] = [119.0, 23.5];
const FUJIAN_SOUTH: [number, number] = [119.2, 22.8];

// Defense positions near each TSMC facility
const POS_HSINCHU_WEST: [number, number] = [120.82, 24.82];
const POS_HSINCHU_NORTH: [number, number] = [120.95, 24.88];
const POS_HSINCHU_SOUTH: [number, number] = [120.92, 24.74];
const POS_TAICHUNG_WEST: [number, number] = [120.55, 24.16];
const POS_TAINAN_WEST: [number, number] = [120.12, 23.10];
const POS_TAINAN_NORTH: [number, number] = [120.22, 23.18];
const POS_KAOHSIUNG_WEST: [number, number] = [120.18, 22.65];
const POS_KAOHSIUNG_SOUTH: [number, number] = [120.28, 22.56];

let nextAssetId = 10000;
function aid(): number { return nextAssetId++; }

function makeAsset(
  specId: string,
  type: DefenseAssetInstance['type'],
  position: [number, number],
  stock: number,
): DefenseAssetInstance {
  return {
    instanceId: aid(),
    specId,
    type,
    position,
    currentStock: stock,
    maxStock: stock,
    reloadTimer: 0,
    isActive: true,
  };
}

// ============================================================
// DEFENSE STRATEGY 1: Shoestring Budget ($1M)
// Cheap interceptor drones only, concentrated on Hsinchu
// ============================================================
function defenseShoestring(): DefenseAssetInstance[] {
  return [
    makeAsset('interceptor-cheap', 'interceptor_squad', POS_HSINCHU_WEST, 200),
    makeAsset('interceptor-cheap', 'interceptor_squad', POS_TAINAN_WEST, 100),
    makeAsset('decoy-emitter', 'decoy_emitter', POS_HSINCHU_NORTH, 9999),
    makeAsset('decoy-emitter', 'decoy_emitter', POS_TAINAN_NORTH, 9999),
  ];
}

// ============================================================
// DEFENSE STRATEGY 2: EW-Focused ($50M)
// Heavy electronic warfare with interceptor backup
// Effective vs GPS-guided drones, fails vs autonomous nav
// ============================================================
function defenseEWFocused(): DefenseAssetInstance[] {
  return [
    // EW jammers blanketing all four facilities
    makeAsset('ew-jammer', 'ew_jammer', POS_HSINCHU_WEST, 9999),
    makeAsset('ew-jammer', 'ew_jammer', POS_TAINAN_WEST, 9999),
    makeAsset('ew-jammer', 'ew_jammer', POS_TAICHUNG_WEST, 9999),
    makeAsset('ew-jammer', 'ew_jammer', POS_KAOHSIUNG_WEST, 9999),
    // Interceptor backup for Hsinchu and Tainan (highest value)
    makeAsset('interceptor-cheap', 'interceptor_squad', POS_HSINCHU_NORTH, 150),
    makeAsset('interceptor-cheap', 'interceptor_squad', POS_TAINAN_NORTH, 100),
    // Decoys
    makeAsset('decoy-emitter', 'decoy_emitter', POS_HSINCHU_SOUTH, 9999),
    makeAsset('decoy-emitter', 'decoy_emitter', POS_KAOHSIUNG_SOUTH, 9999),
  ];
}

// ============================================================
// DEFENSE STRATEGY 3: Layered Defense ($500M)
// Multi-layer: outer EW, mid-range interceptors, close-in DE
// Balanced coverage of all four facilities
// ============================================================
function defenseLayered(): DefenseAssetInstance[] {
  return [
    // Layer 1: EW (outer ring, 15km)
    makeAsset('ew-jammer', 'ew_jammer', POS_HSINCHU_WEST, 9999),
    makeAsset('ew-jammer', 'ew_jammer', POS_TAINAN_WEST, 9999),

    // Layer 2: Interceptor drones (mid ring, 20km)
    makeAsset('interceptor-cheap', 'interceptor_squad', POS_HSINCHU_NORTH, 200),
    makeAsset('interceptor-autonav', 'interceptor_squad', POS_HSINCHU_SOUTH, 50),
    makeAsset('interceptor-cheap', 'interceptor_squad', POS_TAINAN_NORTH, 150),
    makeAsset('interceptor-autonav', 'interceptor_squad', POS_TAINAN_WEST, 40),
    makeAsset('interceptor-cheap', 'interceptor_squad', POS_TAICHUNG_WEST, 100),
    makeAsset('interceptor-cheap', 'interceptor_squad', POS_KAOHSIUNG_WEST, 80),

    // Layer 3: Directed energy (close-in, 2km)
    makeAsset('directed-energy-50kw', 'directed_energy', [120.97, 24.80], 9999),
    makeAsset('directed-energy-50kw', 'directed_energy', [120.25, 23.08], 9999),

    // Decoys to divert
    makeAsset('decoy-emitter', 'decoy_emitter', [120.70, 24.90], 9999),
    makeAsset('decoy-emitter', 'decoy_emitter', [120.05, 23.20], 9999),

    // Net launchers for intel collection
    makeAsset('net-launcher', 'net_launcher', [120.96, 24.78], 6),
    makeAsset('net-launcher', 'net_launcher', [120.24, 23.06], 6),
  ];
}

// ============================================================
// DEFENSE STRATEGY 4: Fortress Hsinchu ($1.5B)
// Sacrifice coverage of lesser fabs, concentrate everything
// on protecting the HQ + most advanced node.
// Anti-ship batteries to thin maritime quarantine.
// ============================================================
function defenseFortressHsinchu(): DefenseAssetInstance[] {
  return [
    // Massive interceptor concentration at Hsinchu
    makeAsset('interceptor-cheap', 'interceptor_squad', POS_HSINCHU_WEST, 400),
    makeAsset('interceptor-cheap', 'interceptor_squad', POS_HSINCHU_NORTH, 300),
    makeAsset('interceptor-autonav', 'interceptor_squad', POS_HSINCHU_SOUTH, 100),

    // Full EW blanket at Hsinchu
    makeAsset('ew-jammer', 'ew_jammer', POS_HSINCHU_WEST, 9999),
    makeAsset('ew-jammer', 'ew_jammer', POS_HSINCHU_NORTH, 9999),

    // Directed energy close-in
    makeAsset('directed-energy-50kw', 'directed_energy', [120.97, 24.80], 9999),
    makeAsset('directed-energy-50kw', 'directed_energy', [120.95, 24.83], 9999),

    // Coyote launchers
    makeAsset('coyote-block3', 'interceptor_squad', [120.90, 24.78], 24),

    // Anti-ship to thin quarantine fleet
    makeAsset('hsiung-feng-3', 'anti_ship_battery', [120.60, 24.70], 8),
    makeAsset('harpoon-block2', 'anti_ship_battery', [120.50, 24.60], 8),

    // Minimal coverage elsewhere (just decoys)
    makeAsset('decoy-emitter', 'decoy_emitter', POS_TAINAN_WEST, 9999),
    makeAsset('decoy-emitter', 'decoy_emitter', POS_KAOHSIUNG_WEST, 9999),

    // Patriot for cruise missiles
    makeAsset('patriot-pac3', 'patriot_battery', [120.88, 24.85], 16),
  ];
}

// ============================================================
// DEFENSE STRATEGY 5: Full Spectrum ($5B)
// Everything: layered defense at all sites, anti-ship,
// Patriot batteries, allied support enabled, EW-resistant
// interceptors, full directed energy coverage.
// ============================================================
function defenseFullSpectrum(): DefenseAssetInstance[] {
  return [
    // === HSINCHU (value 100) ===
    makeAsset('ew-jammer', 'ew_jammer', POS_HSINCHU_WEST, 9999),
    makeAsset('interceptor-cheap', 'interceptor_squad', POS_HSINCHU_WEST, 400),
    makeAsset('interceptor-autonav', 'interceptor_squad', POS_HSINCHU_NORTH, 150),
    makeAsset('directed-energy-50kw', 'directed_energy', [120.97, 24.80], 9999),
    makeAsset('coyote-block3', 'interceptor_squad', POS_HSINCHU_SOUTH, 24),
    makeAsset('net-launcher', 'net_launcher', [120.96, 24.78], 6),
    makeAsset('decoy-emitter', 'decoy_emitter', [120.75, 24.90], 9999),

    // === TAINAN (value 90) ===
    makeAsset('ew-jammer', 'ew_jammer', POS_TAINAN_WEST, 9999),
    makeAsset('interceptor-cheap', 'interceptor_squad', POS_TAINAN_WEST, 300),
    makeAsset('interceptor-autonav', 'interceptor_squad', POS_TAINAN_NORTH, 100),
    makeAsset('directed-energy-50kw', 'directed_energy', [120.25, 23.08], 9999),
    makeAsset('coyote-block3', 'interceptor_squad', [120.20, 23.05], 12),
    makeAsset('decoy-emitter', 'decoy_emitter', [120.05, 23.15], 9999),

    // === KAOHSIUNG (value 80) ===
    makeAsset('ew-jammer', 'ew_jammer', POS_KAOHSIUNG_WEST, 9999),
    makeAsset('interceptor-cheap', 'interceptor_squad', POS_KAOHSIUNG_WEST, 200),
    makeAsset('interceptor-autonav', 'interceptor_squad', POS_KAOHSIUNG_SOUTH, 60),
    makeAsset('directed-energy-50kw', 'directed_energy', [120.28, 22.63], 9999),

    // === TAICHUNG (value 60) ===
    makeAsset('ew-jammer', 'ew_jammer', POS_TAICHUNG_WEST, 9999),
    makeAsset('interceptor-cheap', 'interceptor_squad', POS_TAICHUNG_WEST, 150),
    makeAsset('directed-energy-50kw', 'directed_energy', [120.66, 24.14], 9999),

    // === ANTI-SHIP (for maritime quarantine) ===
    makeAsset('hsiung-feng-3', 'anti_ship_battery', [120.60, 24.70], 16),
    makeAsset('hsiung-feng-3', 'anti_ship_battery', [120.10, 22.90], 8),
    makeAsset('harpoon-block2', 'anti_ship_battery', [120.50, 24.50], 8),
    makeAsset('harpoon-block2', 'anti_ship_battery', [120.15, 23.00], 8),

    // === AIR DEFENSE (for cruise/ballistic missiles) ===
    makeAsset('patriot-pac3', 'patriot_battery', [120.88, 24.85], 32),
    makeAsset('patriot-pac3', 'patriot_battery', [120.20, 23.12], 16),
  ];
}

// ============================================================
// Helper to build a base scenario
// ============================================================
function baseEnvironment() {
  return {
    windSpeedKmh: 15,
    windBearing: 270,
    visibility: 'clear' as const,
    timeOfDay: 'day' as const,
    seaState: 2 as const,
  };
}

/**
 * Generate all scenario presets.
 * Each pairs a red offensive plan with a blue defensive strategy.
 */
export function getScenarioPresets(facilities: Facility[]): Scenario[] {
  nextAssetId = 10000; // Reset IDs

  const facilityClones = () => facilities.map((f) => ({ ...f }));

  // ── SCENARIO 1: Probe Attack vs Shoestring Defense ($1M) ──
  const scenario1: Scenario = {
    id: 'probe-shoestring',
    name: 'Probe Attack vs Shoestring ($1M)',
    description: '200 Shaheds test a minimal defense of cheap interceptor drones and decoys. Can volume beat budget?',
    durationHours: 3,
    redForce: {
      conventionalStrikes: [],
      vessels: [],
      quarantineFormation: 'arc',
      airWaves: [
        { id: 'w1', launchTimeMinutes: 5, droneSpec: 'shahed-136', count: 120, origin: FUJIAN_NORTH, target: 'tsmc-hsinchu', approachBearing: 90, formation: 'dispersed' },
        { id: 'w2', launchTimeMinutes: 15, droneSpec: 'shahed-136', count: 80, origin: FUJIAN_CENTRAL, target: 'tsmc-tainan', approachBearing: 110, formation: 'concentrated' },
      ],
      seaLaunchedWaves: [],
      uuvDeployment: { count: 0, mineTargets: [] },
      strategy: 'saturation_rush',
      totalBudgetUSD: 6_000_000,
      gpsJammingActive: false,
      ewCapability: 'none',
    },
    blueForce: {
      assets: defenseShoestring(),
      totalBudgetUSD: 1_000_000,
      alliedSupport: { enabled: false, carrierStrikeGroup: false, submarineSupport: false, ewSupport: false },
      c2Resilience: 'centralized',
      productionRate: 0,
    },
    facilities: facilityClones(),
    environment: baseEnvironment(),
  };

  // ── SCENARIO 2: 500 Shaheds vs EW Defense ($50M) ──
  const scenario2: Scenario = {
    id: 'medium-ew',
    name: '500 Shaheds vs EW Defense ($50M)',
    description: 'GPS-guided swarm meets EW jamming blanket. Cheap and effective -- unless they switch to autonomous nav.',
    durationHours: 4,
    redForce: {
      conventionalStrikes: [],
      vessels: [],
      quarantineFormation: 'arc',
      airWaves: [
        { id: 'w1', launchTimeMinutes: 5, droneSpec: 'shahed-136', count: 300, origin: FUJIAN_NORTH, target: 'tsmc-hsinchu', approachBearing: 90, formation: 'dispersed' },
        { id: 'w2', launchTimeMinutes: 15, droneSpec: 'shahed-136', count: 200, origin: FUJIAN_CENTRAL, target: 'tsmc-tainan', approachBearing: 110, formation: 'concentrated' },
      ],
      seaLaunchedWaves: [],
      uuvDeployment: { count: 0, mineTargets: [] },
      strategy: 'saturation_rush',
      totalBudgetUSD: 15_000_000,
      gpsJammingActive: false,
      ewCapability: 'none',
    },
    blueForce: {
      assets: defenseEWFocused(),
      totalBudgetUSD: 50_000_000,
      alliedSupport: { enabled: false, carrierStrikeGroup: false, submarineSupport: false, ewSupport: false },
      c2Resilience: 'distributed',
      productionRate: 20,
    },
    facilities: facilityClones(),
    environment: baseEnvironment(),
  };

  // ── SCENARIO 3: 1,000 Drones + GPS Jam vs Layered Defense ($500M) ──
  const scenario3: Scenario = {
    id: 'thousand-layered',
    name: '1,000 Drones + GPS Jam vs Layered ($500M)',
    description: 'Multi-wave attack with GPS jamming. Defense uses EW, interceptors (GPS + auto-nav), directed energy, and decoys in layers.',
    durationHours: 6,
    redForce: {
      conventionalStrikes: [],
      vessels: [],
      quarantineFormation: 'arc',
      airWaves: [
        { id: 'w1', launchTimeMinutes: 5, droneSpec: 'shahed-136', count: 400, origin: FUJIAN_NORTH, target: 'tsmc-hsinchu', approachBearing: 85, formation: 'dispersed' },
        { id: 'w2', launchTimeMinutes: 10, droneSpec: 'shahed-136', count: 250, origin: FUJIAN_CENTRAL, target: 'tsmc-tainan', approachBearing: 105, formation: 'dispersed' },
        { id: 'w3', launchTimeMinutes: 30, droneSpec: 'shahed-136', count: 200, origin: FUJIAN_SOUTH, target: 'tsmc-kaohsiung', approachBearing: 95, formation: 'concentrated' },
        { id: 'w4', launchTimeMinutes: 60, droneSpec: 'shahed-136', count: 150, origin: FUJIAN_NORTH, target: 'tsmc-taichung', approachBearing: 90, formation: 'line' },
      ],
      seaLaunchedWaves: [],
      uuvDeployment: { count: 0, mineTargets: [] },
      strategy: 'multi_axis_sea',
      totalBudgetUSD: 30_000_000,
      gpsJammingActive: true,
      ewCapability: 'moderate',
    },
    blueForce: {
      assets: defenseLayered(),
      totalBudgetUSD: 500_000_000,
      alliedSupport: { enabled: false, carrierStrikeGroup: false, submarineSupport: false, ewSupport: false },
      c2Resilience: 'distributed',
      productionRate: 50,
    },
    facilities: facilityClones(),
    environment: baseEnvironment(),
  };

  // ── SCENARIO 4: 2,000 Drones + Feint vs Fortress Hsinchu ($1.5B) ──
  const scenario4: Scenario = {
    id: 'feint-fortress',
    name: '2,000 Drones + Feint vs Fortress ($1.5B)',
    description: 'Red feints at Tainan/Kaohsiung, then mass-attacks Hsinchu. Blue concentrates all defenses on HQ. "Lose 3, save 1" strategy.',
    durationHours: 8,
    redForce: {
      conventionalStrikes: [],
      vessels: [],
      quarantineFormation: 'arc',
      airWaves: [
        // Feint waves (smaller, go to secondary targets)
        { id: 'feint-1', launchTimeMinutes: 5, droneSpec: 'shahed-136', count: 200, origin: FUJIAN_CENTRAL, target: 'tsmc-tainan', approachBearing: 110, formation: 'dispersed' },
        { id: 'feint-2', launchTimeMinutes: 8, droneSpec: 'shahed-136', count: 150, origin: FUJIAN_SOUTH, target: 'tsmc-kaohsiung', approachBearing: 100, formation: 'dispersed' },
        { id: 'feint-3', launchTimeMinutes: 12, droneSpec: 'shahed-136', count: 100, origin: FUJIAN_NORTH, target: 'tsmc-taichung', approachBearing: 90, formation: 'line' },
        // Main assault on Hsinchu (delayed, massive)
        { id: 'main-1', launchTimeMinutes: 40, droneSpec: 'shahed-136', count: 600, origin: FUJIAN_NORTH, target: 'tsmc-hsinchu', approachBearing: 85, formation: 'concentrated' },
        { id: 'main-2', launchTimeMinutes: 50, droneSpec: 'shahed-136', count: 500, origin: [119.1, 24.8], target: 'tsmc-hsinchu', approachBearing: 75, formation: 'dispersed' },
        { id: 'main-3', launchTimeMinutes: 65, droneSpec: 'shahed-136', count: 450, origin: [119.5, 24.2], target: 'tsmc-hsinchu', approachBearing: 100, formation: 'dispersed' },
      ],
      seaLaunchedWaves: [],
      uuvDeployment: { count: 0, mineTargets: [] },
      strategy: 'feint_and_strike',
      totalBudgetUSD: 60_000_000,
      gpsJammingActive: true,
      ewCapability: 'advanced',
    },
    blueForce: {
      assets: defenseFortressHsinchu(),
      totalBudgetUSD: 1_500_000_000,
      alliedSupport: { enabled: false, carrierStrikeGroup: false, submarineSupport: false, ewSupport: false },
      c2Resilience: 'mesh',
      productionRate: 100,
    },
    facilities: facilityClones(),
    environment: baseEnvironment(),
  };

  // ── SCENARIO 5: 3,000 Drones + Attrition vs Full Spectrum ($5B) ──
  const scenario5: Scenario = {
    id: 'attrition-fullspectrum',
    name: '3,000 Drones Attrition vs Full Spectrum ($5B)',
    description: 'Sustained 24-hour attrition attack across all axes. Full spectrum defense with allied support. Tests if even $5B can hold against persistent saturation.',
    durationHours: 24,
    redForce: {
      conventionalStrikes: [],
      vessels: [],
      quarantineFormation: 'ring',
      airWaves: [
        // Wave every 30 minutes for 12 hours -- sustained pressure
        { id: 'a1', launchTimeMinutes: 5, droneSpec: 'shahed-136', count: 250, origin: FUJIAN_NORTH, target: 'tsmc-hsinchu', approachBearing: 88, formation: 'dispersed' },
        { id: 'a2', launchTimeMinutes: 30, droneSpec: 'shahed-136', count: 200, origin: FUJIAN_CENTRAL, target: 'tsmc-tainan', approachBearing: 105, formation: 'dispersed' },
        { id: 'a3', launchTimeMinutes: 60, droneSpec: 'shahed-136', count: 200, origin: FUJIAN_SOUTH, target: 'tsmc-kaohsiung', approachBearing: 95, formation: 'concentrated' },
        { id: 'a4', launchTimeMinutes: 90, droneSpec: 'shahed-136', count: 250, origin: FUJIAN_NORTH, target: 'tsmc-hsinchu', approachBearing: 80, formation: 'dispersed' },
        { id: 'a5', launchTimeMinutes: 120, droneSpec: 'shahed-136', count: 200, origin: FUJIAN_CENTRAL, target: 'tsmc-tainan', approachBearing: 110, formation: 'line' },
        { id: 'a6', launchTimeMinutes: 150, droneSpec: 'shahed-136', count: 150, origin: FUJIAN_NORTH, target: 'tsmc-taichung', approachBearing: 90, formation: 'dispersed' },
        { id: 'a7', launchTimeMinutes: 180, droneSpec: 'shahed-136', count: 300, origin: FUJIAN_NORTH, target: 'tsmc-hsinchu', approachBearing: 92, formation: 'concentrated' },
        { id: 'a8', launchTimeMinutes: 240, droneSpec: 'shahed-136', count: 250, origin: FUJIAN_CENTRAL, target: 'tsmc-tainan', approachBearing: 108, formation: 'dispersed' },
        { id: 'a9', launchTimeMinutes: 300, droneSpec: 'shahed-136', count: 200, origin: FUJIAN_SOUTH, target: 'tsmc-kaohsiung', approachBearing: 97, formation: 'dispersed' },
        { id: 'a10', launchTimeMinutes: 360, droneSpec: 'shahed-136', count: 350, origin: FUJIAN_NORTH, target: 'tsmc-hsinchu', approachBearing: 85, formation: 'concentrated' },
        { id: 'a11', launchTimeMinutes: 480, droneSpec: 'shahed-136', count: 250, origin: FUJIAN_CENTRAL, target: 'tsmc-tainan', approachBearing: 112, formation: 'dispersed' },
        { id: 'a12', launchTimeMinutes: 600, droneSpec: 'shahed-136', count: 200, origin: FUJIAN_SOUTH, target: 'tsmc-kaohsiung', approachBearing: 100, formation: 'line' },
      ],
      seaLaunchedWaves: [],
      uuvDeployment: { count: 0, mineTargets: [] },
      strategy: 'attrition',
      totalBudgetUSD: 90_000_000,
      gpsJammingActive: true,
      ewCapability: 'advanced',
    },
    blueForce: {
      assets: defenseFullSpectrum(),
      totalBudgetUSD: 5_000_000_000,
      alliedSupport: { enabled: true, carrierStrikeGroup: true, submarineSupport: true, ewSupport: true },
      c2Resilience: 'mesh',
      productionRate: 200,
    },
    facilities: facilityClones(),
    environment: baseEnvironment(),
  };

  // ── SCENARIO 6: Full Quarantine + Missile Precursors ($5B + Allied) ──
  const scenario6: Scenario = {
    id: 'quarantine-missiles',
    name: 'Quarantine + Missiles + 2K Drones ($5B)',
    description: 'Full multi-domain: DF-21 missile strikes on C2, 500 fishing militia vessels launching FPVs from the strait, 2,000 Shaheds, GPS jammed. Blue has full spectrum + allied support.',
    durationHours: 12,
    redForce: {
      conventionalStrikes: [
        // Ballistic missile strikes on C2 at T+0
        { type: 'ballistic_missile', side: 'red', launchTimeMinutes: 2, targetType: 'c2', count: 4, pkill: 0.6 },
        // Cruise missiles at Hsinchu at T+5
        { type: 'cruise_missile', side: 'red', launchTimeMinutes: 5, targetType: 'tsmc-hsinchu', count: 6, pkill: 0.5 },
      ],
      vessels: [
        // 500 fishing militia in an arc across the strait
        {
          id: 'quarantine-north',
          vesselSpec: 'fishing-militia',
          count: 200,
          origin: [119.5, 24.8],
          stationPosition: [120.2, 24.6],
          arrivalTimeMinutes: 10,
        },
        {
          id: 'quarantine-central',
          vesselSpec: 'fishing-militia',
          count: 200,
          origin: [119.2, 23.8],
          stationPosition: [119.8, 23.5],
          arrivalTimeMinutes: 15,
        },
        {
          id: 'quarantine-south',
          vesselSpec: 'fishing-militia',
          count: 100,
          origin: [119.0, 22.8],
          stationPosition: [119.8, 22.8],
          arrivalTimeMinutes: 20,
        },
      ],
      quarantineFormation: 'arc',
      airWaves: [
        { id: 'w1', launchTimeMinutes: 15, droneSpec: 'shahed-136', count: 600, origin: FUJIAN_NORTH, target: 'tsmc-hsinchu', approachBearing: 88, formation: 'dispersed' },
        { id: 'w2', launchTimeMinutes: 25, droneSpec: 'shahed-136', count: 400, origin: FUJIAN_CENTRAL, target: 'tsmc-tainan', approachBearing: 105, formation: 'dispersed' },
        { id: 'w3', launchTimeMinutes: 60, droneSpec: 'shahed-136', count: 500, origin: FUJIAN_NORTH, target: 'tsmc-hsinchu', approachBearing: 82, formation: 'concentrated' },
        { id: 'w4', launchTimeMinutes: 90, droneSpec: 'shahed-136', count: 300, origin: FUJIAN_SOUTH, target: 'tsmc-kaohsiung', approachBearing: 95, formation: 'dispersed' },
        { id: 'w5', launchTimeMinutes: 150, droneSpec: 'shahed-136', count: 200, origin: FUJIAN_NORTH, target: 'tsmc-taichung', approachBearing: 90, formation: 'line' },
      ],
      seaLaunchedWaves: [],
      uuvDeployment: { count: 0, mineTargets: [] },
      strategy: 'adaptive',
      totalBudgetUSD: 80_000_000,
      gpsJammingActive: true,
      ewCapability: 'advanced',
    },
    blueForce: {
      assets: defenseFullSpectrum(),
      totalBudgetUSD: 5_000_000_000,
      alliedSupport: { enabled: true, carrierStrikeGroup: true, submarineSupport: true, ewSupport: true },
      c2Resilience: 'mesh',
      productionRate: 200,
    },
    facilities: facilityClones(),
    environment: baseEnvironment(),
  };

  return [scenario1, scenario2, scenario3, scenario4, scenario5, scenario6];
}

// Keep backward compat
export function createDefaultScenario(facilities: Facility[]): Scenario {
  return getScenarioPresets(facilities)[0];
}
