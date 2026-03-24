/**
 * Adversarial strategy search: systematically explores blue defense configurations
 * against red attack scenarios to find cost-effective defensive strategies.
 *
 * Key question: What is the cheapest blue configuration that achieves a given
 * survival probability against a specific red attack?
 */

import { runMonteCarlo, type AggregateResults } from '../engine/HeadlessRunner';
import type { Scenario, DroneSpec, DefenseAssetSpec, DefenseAssetInstance, Facility } from '../types';


// ============================================================
// Defense building blocks — atomic units we can combine
// ============================================================

interface DefenseBlock {
  id: string;
  name: string;
  assets: Omit<DefenseAssetInstance, 'instanceId'>[];
  totalCostUSD: number;
  description: string;
  tags: string[];
}

let blockIdCounter = 50000;

function makeAsset(
  specId: string,
  type: DefenseAssetInstance['type'],
  position: [number, number],
  stock: number,
): Omit<DefenseAssetInstance, 'instanceId'> {
  return { specId, type, position, currentStock: stock, maxStock: stock, reloadTimer: 0, isActive: true };
}

// Positions near each TSMC facility
const P = {
  hsinchu_w: [120.82, 24.82] as [number, number],
  hsinchu_n: [120.95, 24.88] as [number, number],
  hsinchu_s: [120.92, 24.74] as [number, number],
  hsinchu_close: [120.97, 24.80] as [number, number],
  tainan_w: [120.12, 23.10] as [number, number],
  tainan_n: [120.22, 23.18] as [number, number],
  tainan_close: [120.25, 23.08] as [number, number],
  kaohsiung_w: [120.18, 22.65] as [number, number],
  kaohsiung_s: [120.28, 22.56] as [number, number],
  taichung_w: [120.55, 24.16] as [number, number],
};

/**
 * Generate all defense building blocks we want to test.
 */
function generateDefenseBlocks(): DefenseBlock[] {
  return [
    // === CHEAP INTERCEPTOR SQUADS (GPS) ===
    {
      id: 'int-cheap-hsinchu-50', name: '50 cheap interceptors at Hsinchu',
      assets: [makeAsset('interceptor-cheap', 'interceptor_squad', P.hsinchu_w, 50)],
      totalCostUSD: 100_000, description: '50 GPS interceptors west of Hsinchu',
      tags: ['cheap', 'interceptor', 'hsinchu'],
    },
    {
      id: 'int-cheap-hsinchu-200', name: '200 cheap interceptors at Hsinchu',
      assets: [makeAsset('interceptor-cheap', 'interceptor_squad', P.hsinchu_w, 100), makeAsset('interceptor-cheap', 'interceptor_squad', P.hsinchu_n, 100)],
      totalCostUSD: 400_000, description: '200 GPS interceptors in 2 squads around Hsinchu',
      tags: ['cheap', 'interceptor', 'hsinchu', 'concentrated'],
    },
    {
      id: 'int-cheap-tainan-100', name: '100 cheap interceptors at Tainan',
      assets: [makeAsset('interceptor-cheap', 'interceptor_squad', P.tainan_w, 100)],
      totalCostUSD: 200_000, description: '100 GPS interceptors at Tainan',
      tags: ['cheap', 'interceptor', 'tainan'],
    },
    {
      id: 'int-cheap-spread-200', name: '200 interceptors spread across all 4',
      assets: [
        makeAsset('interceptor-cheap', 'interceptor_squad', P.hsinchu_w, 50),
        makeAsset('interceptor-cheap', 'interceptor_squad', P.tainan_w, 50),
        makeAsset('interceptor-cheap', 'interceptor_squad', P.kaohsiung_w, 50),
        makeAsset('interceptor-cheap', 'interceptor_squad', P.taichung_w, 50),
      ],
      totalCostUSD: 400_000, description: '50 interceptors at each of 4 facilities',
      tags: ['cheap', 'interceptor', 'spread'],
    },

    // === EW JAMMERS (near-zero marginal cost) ===
    {
      id: 'ew-hsinchu', name: 'EW jammer at Hsinchu',
      assets: [makeAsset('ew-jammer', 'ew_jammer', P.hsinchu_w, 9999)],
      totalCostUSD: 3_000_000, description: 'Single EW jammer at Hsinchu (15km range)',
      tags: ['ew', 'hsinchu'],
    },
    {
      id: 'ew-all4', name: 'EW jammers at all 4 facilities',
      assets: [
        makeAsset('ew-jammer', 'ew_jammer', P.hsinchu_w, 9999),
        makeAsset('ew-jammer', 'ew_jammer', P.tainan_w, 9999),
        makeAsset('ew-jammer', 'ew_jammer', P.kaohsiung_w, 9999),
        makeAsset('ew-jammer', 'ew_jammer', P.taichung_w, 9999),
      ],
      totalCostUSD: 12_000_000, description: 'EW blanket all facilities',
      tags: ['ew', 'spread', 'blanket'],
    },

    // === DECOYS (very cheap, divert GPS drones) ===
    {
      id: 'decoys-offshore-2', name: '2 decoy emitters offshore',
      assets: [
        makeAsset('decoy-emitter', 'decoy_emitter', [120.50, 24.90], 9999),
        makeAsset('decoy-emitter', 'decoy_emitter', [119.90, 23.20], 9999),
      ],
      totalCostUSD: 6_000, description: 'Decoys placed offshore to lure GPS drones away from coast',
      tags: ['decoy', 'cheap', 'deception'],
    },
    {
      id: 'decoys-ring-6', name: '6 decoys in a ring around Taiwan',
      assets: [
        makeAsset('decoy-emitter', 'decoy_emitter', [120.50, 25.10], 9999),
        makeAsset('decoy-emitter', 'decoy_emitter', [120.00, 24.50], 9999),
        makeAsset('decoy-emitter', 'decoy_emitter', [119.90, 23.50], 9999),
        makeAsset('decoy-emitter', 'decoy_emitter', [119.90, 22.80], 9999),
        makeAsset('decoy-emitter', 'decoy_emitter', [120.60, 24.20], 9999),
        makeAsset('decoy-emitter', 'decoy_emitter', [120.40, 23.60], 9999),
      ],
      totalCostUSD: 18_000, description: '6 decoy emitters creating false targets offshore',
      tags: ['decoy', 'very-cheap', 'deception', 'ring'],
    },

    // === DIRECTED ENERGY (unlimited ammo, short range) ===
    {
      id: 'de-hsinchu', name: 'Directed energy at Hsinchu',
      assets: [makeAsset('directed-energy-50kw', 'directed_energy', P.hsinchu_close, 9999)],
      totalCostUSD: 10_000_000, description: '50kW laser at Hsinchu (2km range, <$10/shot)',
      tags: ['de', 'hsinchu', 'last-resort'],
    },
    {
      id: 'de-top2', name: 'DE at Hsinchu + Tainan',
      assets: [
        makeAsset('directed-energy-50kw', 'directed_energy', P.hsinchu_close, 9999),
        makeAsset('directed-energy-50kw', 'directed_energy', P.tainan_close, 9999),
      ],
      totalCostUSD: 20_000_000, description: 'Directed energy at top-2 value facilities',
      tags: ['de', 'top2'],
    },

    // === NET LAUNCHERS (capture for intel) ===
    {
      id: 'nets-hsinchu-3', name: '3 net launchers at Hsinchu',
      assets: [
        makeAsset('net-launcher', 'net_launcher', [120.96, 24.78], 6),
        makeAsset('net-launcher', 'net_launcher', [120.94, 24.82], 6),
        makeAsset('net-launcher', 'net_launcher', [120.98, 24.79], 6),
      ],
      totalCostUSD: 24_000, description: 'Net launchers for intel collection at Hsinchu',
      tags: ['net', 'cheap', 'intel'],
    },

    // === AUTO-NAV INTERCEPTORS (EW-resistant, more expensive) ===
    {
      id: 'autonav-hsinchu-30', name: '30 auto-nav interceptors at Hsinchu',
      assets: [makeAsset('interceptor-autonav', 'interceptor_squad', P.hsinchu_w, 30)],
      totalCostUSD: 450_000, description: 'EW-resistant interceptors (works under GPS jamming)',
      tags: ['autonav', 'hsinchu', 'ew-resistant'],
    },
    {
      id: 'autonav-top2-60', name: '60 auto-nav split Hsinchu/Tainan',
      assets: [
        makeAsset('interceptor-autonav', 'interceptor_squad', P.hsinchu_w, 30),
        makeAsset('interceptor-autonav', 'interceptor_squad', P.tainan_w, 30),
      ],
      totalCostUSD: 900_000, description: '30 auto-nav at each of top-2 facilities',
      tags: ['autonav', 'top2', 'ew-resistant'],
    },
  ];
}

// ============================================================
// Strategy = combination of blocks
// ============================================================

export interface StrategyConfig {
  id: string;
  name: string;
  blocks: DefenseBlock[];
  totalCostUSD: number;
  assetCount: number;
  description: string;
}

export interface StrategyResult {
  strategy: StrategyConfig;
  results: AggregateResults;
  costEfficiency: number; // survival probability per $M spent
}

/**
 * Generate candidate strategies by combining blocks.
 */
function generateStrategies(): StrategyConfig[] {
  const blocks = generateDefenseBlocks();
  const strategies: StrategyConfig[] = [];

  // 1. Single blocks (test each alone)
  for (const block of blocks) {
    strategies.push({
      id: `solo-${block.id}`,
      name: block.name,
      blocks: [block],
      totalCostUSD: block.totalCostUSD,
      assetCount: block.assets.length,
      description: block.description,
    });
  }

  // 2. Key combinations (hand-picked interesting combos)
  const combos: [string, string[]][] = [
    // Decoy + cheap interceptors (ultra-cheap layered)
    ['Decoys + 50 interceptors Hsinchu', ['decoys-offshore-2', 'int-cheap-hsinchu-50']],
    ['Decoy ring + 200 interceptors spread', ['decoys-ring-6', 'int-cheap-spread-200']],

    // EW + cheap interceptors (EW does heavy lifting)
    ['EW all + 200 interceptors spread', ['ew-all4', 'int-cheap-spread-200']],
    ['EW Hsinchu + 200 interceptors Hsinchu', ['ew-hsinchu', 'int-cheap-hsinchu-200']],

    // Decoy + EW (zero-marginal-cost defense)
    ['Decoy ring + EW all (no interceptors)', ['decoys-ring-6', 'ew-all4']],

    // Layered cheap: decoy + EW + cheap interceptors
    ['Decoy + EW all + 200 interceptors spread', ['decoys-ring-6', 'ew-all4', 'int-cheap-spread-200']],
    ['Decoy + EW all + 200 concentrated Hsinchu', ['decoys-ring-6', 'ew-all4', 'int-cheap-hsinchu-200']],

    // DE as last-resort behind interceptors
    ['200 interceptors + DE at Hsinchu', ['int-cheap-hsinchu-200', 'de-hsinchu']],
    ['EW + interceptors + DE at top 2', ['ew-all4', 'int-cheap-spread-200', 'de-top2']],

    // Auto-nav for GPS-jammed scenarios
    ['Auto-nav 60 + decoys', ['autonav-top2-60', 'decoys-ring-6']],
    ['Auto-nav 60 + EW all', ['autonav-top2-60', 'ew-all4']],
    ['Auto-nav 30 + cheap 200 + EW all', ['autonav-hsinchu-30', 'int-cheap-spread-200', 'ew-all4']],

    // Concentrated fortress approach
    ['Fortress Hsinchu: 200 int + EW + DE + nets', ['int-cheap-hsinchu-200', 'ew-hsinchu', 'de-hsinchu', 'nets-hsinchu-3']],

    // Ultra-budget: just decoys
    ['ULTRA-CHEAP: 6 decoys only ($18K)', ['decoys-ring-6']],
    ['ULTRA-CHEAP: 2 decoys + 3 nets ($30K)', ['decoys-offshore-2', 'nets-hsinchu-3']],

    // Nets + decoys (cheapest possible active defense)
    ['Nets + decoys + 50 interceptors ($124K)', ['nets-hsinchu-3', 'decoys-offshore-2', 'int-cheap-hsinchu-50']],
  ];

  const blockMap = new Map(blocks.map((b) => [b.id, b]));

  for (const [name, blockIds] of combos) {
    const comboBlocks = blockIds.map((id) => blockMap.get(id)).filter(Boolean) as DefenseBlock[];
    if (comboBlocks.length !== blockIds.length) continue;

    strategies.push({
      id: `combo-${blockIds.join('+')}`,
      name,
      blocks: comboBlocks,
      totalCostUSD: comboBlocks.reduce((s, b) => s + b.totalCostUSD, 0),
      assetCount: comboBlocks.reduce((s, b) => s + b.assets.length, 0),
      description: comboBlocks.map((b) => b.description).join('; '),
    });
  }

  return strategies;
}

/**
 * Build a Scenario from a strategy config and an attack template.
 */
function buildScenario(
  strategy: StrategyConfig,
  attackTemplate: Scenario,
  facilities: Facility[]
): Scenario {
  blockIdCounter = 50000;
  const assets: DefenseAssetInstance[] = [];

  for (const block of strategy.blocks) {
    for (const a of block.assets) {
      assets.push({ ...a, instanceId: blockIdCounter++ });
    }
  }

  return {
    ...attackTemplate,
    blueForce: {
      ...attackTemplate.blueForce,
      assets,
      totalBudgetUSD: strategy.totalCostUSD,
      alliedSupport: { enabled: false, carrierStrikeGroup: false, submarineSupport: false, ewSupport: false },
    },
    facilities: facilities.map((f) => ({
      ...f,
      currentHitPoints: f.hitPoints,
      status: 'operational' as const,
    })),
  };
}

// ============================================================
// Attack templates for testing against
// ============================================================

function buildAttackTemplates(facilities: Facility[]): Scenario[] {
  const base = {
    blueForce: {
      assets: [] as DefenseAssetInstance[],
      totalBudgetUSD: 0,
      alliedSupport: { enabled: false, carrierStrikeGroup: false, submarineSupport: false, ewSupport: false },
      c2Resilience: 'distributed' as const,
      productionRate: 0,
    },
    facilities: facilities.map((f) => ({ ...f })),
    environment: {
      windSpeedKmh: 15, windBearing: 270,
      visibility: 'clear' as const, timeOfDay: 'day' as const, seaState: 2 as const,
    },
  };

  const redBase = {
    conventionalStrikes: [],
    vessels: [],
    quarantineFormation: 'arc' as const,
    seaLaunchedWaves: [],
    uuvDeployment: { count: 0, mineTargets: [] as string[] },
  };

  return [
    // Attack A: 500 Shaheds, no jamming
    {
      ...base, id: 'attack-500', name: '500 Shaheds (no jamming)',
      description: '', durationHours: 4,
      redForce: {
        ...redBase, strategy: 'saturation_rush' as const,
        totalBudgetUSD: 15_000_000, gpsJammingActive: false, ewCapability: 'none' as const,
        airWaves: [
          { id: 'w1', launchTimeMinutes: 5, droneSpec: 'shahed-136', count: 300, origin: [119.3, 24.5] as [number, number], target: 'tsmc-hsinchu', approachBearing: 90, formation: 'dispersed' },
          { id: 'w2', launchTimeMinutes: 15, droneSpec: 'shahed-136', count: 200, origin: [119.0, 23.5] as [number, number], target: 'tsmc-tainan', approachBearing: 110, formation: 'concentrated' },
        ],
      },
    },
    // Attack B: 500 Shaheds WITH GPS jamming
    {
      ...base, id: 'attack-500-jammed', name: '500 Shaheds (GPS jammed)',
      description: '', durationHours: 4,
      redForce: {
        ...redBase, strategy: 'saturation_rush' as const,
        totalBudgetUSD: 15_000_000, gpsJammingActive: true, ewCapability: 'moderate' as const,
        airWaves: [
          { id: 'w1', launchTimeMinutes: 5, droneSpec: 'shahed-136', count: 300, origin: [119.3, 24.5] as [number, number], target: 'tsmc-hsinchu', approachBearing: 90, formation: 'dispersed' },
          { id: 'w2', launchTimeMinutes: 15, droneSpec: 'shahed-136', count: 200, origin: [119.0, 23.5] as [number, number], target: 'tsmc-tainan', approachBearing: 110, formation: 'concentrated' },
        ],
      },
    },
    // Attack C: 1000 Shaheds multi-axis
    {
      ...base, id: 'attack-1000', name: '1,000 Shaheds multi-axis',
      description: '', durationHours: 6,
      redForce: {
        ...redBase, strategy: 'multi_axis_sea' as const,
        totalBudgetUSD: 30_000_000, gpsJammingActive: false, ewCapability: 'none' as const,
        airWaves: [
          { id: 'w1', launchTimeMinutes: 5, droneSpec: 'shahed-136', count: 400, origin: [119.3, 24.5] as [number, number], target: 'tsmc-hsinchu', approachBearing: 85, formation: 'dispersed' },
          { id: 'w2', launchTimeMinutes: 10, droneSpec: 'shahed-136', count: 300, origin: [119.0, 23.5] as [number, number], target: 'tsmc-tainan', approachBearing: 105, formation: 'dispersed' },
          { id: 'w3', launchTimeMinutes: 25, droneSpec: 'shahed-136', count: 300, origin: [119.2, 22.8] as [number, number], target: 'tsmc-kaohsiung', approachBearing: 95, formation: 'concentrated' },
        ],
      },
    },
    // Attack D: 2000 Shaheds + GPS jamming (hardest non-quarantine)
    {
      ...base, id: 'attack-2000-jammed', name: '2,000 Shaheds + GPS jam',
      description: '', durationHours: 8,
      redForce: {
        ...redBase, strategy: 'feint_and_strike' as const,
        totalBudgetUSD: 60_000_000, gpsJammingActive: true, ewCapability: 'advanced' as const,
        airWaves: [
          { id: 'w1', launchTimeMinutes: 5, droneSpec: 'shahed-136', count: 500, origin: [119.3, 24.5] as [number, number], target: 'tsmc-hsinchu', approachBearing: 88, formation: 'dispersed' },
          { id: 'w2', launchTimeMinutes: 10, droneSpec: 'shahed-136', count: 400, origin: [119.0, 23.5] as [number, number], target: 'tsmc-tainan', approachBearing: 105, formation: 'dispersed' },
          { id: 'w3', launchTimeMinutes: 30, droneSpec: 'shahed-136', count: 500, origin: [119.3, 24.5] as [number, number], target: 'tsmc-hsinchu', approachBearing: 80, formation: 'concentrated' },
          { id: 'w4', launchTimeMinutes: 50, droneSpec: 'shahed-136', count: 300, origin: [119.2, 22.8] as [number, number], target: 'tsmc-kaohsiung', approachBearing: 95, formation: 'dispersed' },
          { id: 'w5', launchTimeMinutes: 70, droneSpec: 'shahed-136', count: 300, origin: [119.0, 24.0] as [number, number], target: 'tsmc-taichung', approachBearing: 90, formation: 'line' },
        ],
      },
    },
  ];
}

// ============================================================
// Main search function
// ============================================================

export interface SearchResults {
  attack: { id: string; name: string };
  strategies: StrategyResult[];
  bestCheap: StrategyResult | null;  // Best strategy under $1M
  bestMid: StrategyResult | null;    // Best strategy under $15M
  bestOverall: StrategyResult | null;
  insights: string[];
}

export function runStrategySearch(
  facilities: Facility[],
  droneSpecs: DroneSpec[],
  assetSpecs: DefenseAssetSpec[],
  attackIndex: number = 0,
  runsPerStrategy: number = 30,
): SearchResults {
  const attacks = buildAttackTemplates(facilities);
  const attack = attacks[Math.min(attackIndex, attacks.length - 1)];
  const strategies = generateStrategies();

  const results: StrategyResult[] = [];

  // Also run no-defense baseline
  const baselineScenario = buildScenario(
    { id: 'none', name: 'No defense', blocks: [], totalCostUSD: 0, assetCount: 0, description: 'No defense' },
    attack, facilities
  );
  const baselineResult = runMonteCarlo(baselineScenario, droneSpecs, assetSpecs, runsPerStrategy, 1);

  for (const strategy of strategies) {
    const scenario = buildScenario(strategy, attack, facilities);
    const mcResult = runMonteCarlo(scenario, droneSpecs, assetSpecs, runsPerStrategy, 1);

    const survivalImprovement = mcResult.probAtLeast3Safe - baselineResult.probAtLeast3Safe;
    const costMillions = Math.max(0.001, strategy.totalCostUSD / 1_000_000);
    const costEfficiency = survivalImprovement / costMillions;

    results.push({
      strategy,
      results: mcResult,
      costEfficiency,
    });
  }

  // Sort by cost efficiency
  results.sort((a, b) => b.costEfficiency - a.costEfficiency);

  // Find bests in categories
  const bestCheap = results.filter((r) => r.strategy.totalCostUSD <= 1_000_000)
    .sort((a, b) => b.results.probAtLeast3Safe - a.results.probAtLeast3Safe)[0] ?? null;

  const bestMid = results.filter((r) => r.strategy.totalCostUSD <= 15_000_000)
    .sort((a, b) => b.results.probAtLeast3Safe - a.results.probAtLeast3Safe)[0] ?? null;

  const bestOverall = results.sort((a, b) => b.results.probAtLeast3Safe - a.results.probAtLeast3Safe)[0] ?? null;

  // Generate insights
  const insights: string[] = [];

  if (bestCheap) {
    insights.push(
      `Best cheap defense (<$1M): "${bestCheap.strategy.name}" achieves ${(bestCheap.results.probAtLeast3Safe * 100).toFixed(0)}% survival for $${(bestCheap.strategy.totalCostUSD / 1000).toFixed(0)}K — cost efficiency: ${bestCheap.costEfficiency.toFixed(2)} pp/$M`
    );
  }

  // Check if decoys alone are effective
  const decoyOnly = results.find((r) => r.strategy.id.includes('decoys-ring-6') && r.strategy.blocks.length === 1);
  if (decoyOnly && decoyOnly.results.probAtLeast3Safe > baselineResult.probAtLeast3Safe + 0.05) {
    insights.push(
      `SURPRISING: $18K in decoys alone improves survival from ${(baselineResult.probAtLeast3Safe * 100).toFixed(0)}% to ${(decoyOnly.results.probAtLeast3Safe * 100).toFixed(0)}% — 1000x cheaper than EW jammers with measurable impact`
    );
  }

  // Check if EW without interceptors is effective
  const ewOnly = results.find((r) => r.strategy.id === 'solo-ew-all4');
  if (ewOnly) {
    insights.push(
      `EW blanket alone ($12M): ${(ewOnly.results.probAtLeast3Safe * 100).toFixed(0)}% survival, ${ewOnly.results.avgDronesDestroyedRed.toFixed(0)} avg kills — zero marginal cost per engagement`
    );
  }

  // Check concentration vs spreading
  const concentrated = results.find((r) => r.strategy.id.includes('hsinchu-200') && r.strategy.blocks.length === 1);
  const spread = results.find((r) => r.strategy.id.includes('spread-200') && r.strategy.blocks.length === 1);
  if (concentrated && spread) {
    const concP = concentrated.results.probAtLeast3Safe;
    const spreadP = spread.results.probAtLeast3Safe;
    if (Math.abs(concP - spreadP) > 0.05) {
      const better = concP > spreadP ? 'Concentrating' : 'Spreading';
      insights.push(
        `${better} 200 interceptors is better: concentrated=${(concP * 100).toFixed(0)}% vs spread=${(spreadP * 100).toFixed(0)}% (same total cost)`
      );
    }
  }

  // Cost asymmetry insight
  if (bestCheap && bestCheap.results.probAtLeast3Safe > 0.5) {
    const ratio = attack.redForce.totalBudgetUSD / bestCheap.strategy.totalCostUSD;
    insights.push(
      `Cost asymmetry: blue spends ${(bestCheap.strategy.totalCostUSD / 1000).toFixed(0)}K to counter red's $${(attack.redForce.totalBudgetUSD / 1_000_000).toFixed(0)}M attack — ${ratio.toFixed(0)}:1 cost advantage for defense`
    );
  }

  return {
    attack: { id: attack.id, name: attack.name },
    strategies: results,
    bestCheap,
    bestMid,
    bestOverall,
    insights,
  };
}

export { generateStrategies, buildAttackTemplates, buildScenario };
