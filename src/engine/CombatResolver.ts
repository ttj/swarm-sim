import type { DroneInstance, DroneSpec, DefenseAssetInstance, DefenseAssetSpec, Facility, SimEvent } from '../types';
import { distanceKm } from '../utils/geo';
import { RandomStream } from './RandomStream';
import { CostTracker } from './CostTracker';
import { SpatialGrid, kmToDeg } from './SpatialGrid';
import { engagementTracker, defenseTypeToEngagement } from './EngagementTracker';

export interface CombatContext {
  gpsJammingActive: boolean;
  currentTimeSec: number;
  c2DamageLevel: number; // 0-1, 0 = fully operational, 1 = destroyed
  visibility: 'clear' | 'overcast' | 'fog';
  timeOfDay: 'day' | 'night';
  seaState: number; // 1-5
}

/**
 * Resolves combat engagements between defense assets and attacking drones.
 * Implements the saturation modifier, GPS jamming effects, and layered defense.
 */
// Kill chain delay: ticks a drone must be tracked before engagement
// Real-world: 15-60 seconds = 1.5-6 ticks at 10s/tick
const KILL_CHAIN_TICKS: Record<string, number> = {
  interceptor_squad: 3,   // 30s: detect, track, launch interceptor
  ew_jammer: 1,           // 10s: near-instant once in range
  directed_energy: 2,     // 20s: acquire, track, fire
  hpm: 1,                 // 10s: area-denial, no tracking needed
  net_launcher: 3,        // 30s: approach, aim, fire net
  decoy_emitter: 0,       // Instant: passive
  patriot_battery: 4,     // 40s: detect, classify, authorize, fire
  anti_ship_battery: 5,   // 50s: full engagement cycle
};

export class CombatResolver {
  private droneSpecs: Map<string, DroneSpec>;
  private assetSpecs: Map<string, DefenseAssetSpec>;
  private rng: RandomStream;
  private costTracker: CostTracker;
  // Track how many ticks each drone has been in range of each asset
  private trackingTicks: Map<string, number> = new Map(); // key: "assetId-droneId"

  constructor(
    droneSpecs: DroneSpec[],
    assetSpecs: DefenseAssetSpec[],
    costTracker: CostTracker,
    seed: number = 42
  ) {
    this.droneSpecs = new Map(droneSpecs.map((s) => [s.id, s]));
    this.assetSpecs = new Map(assetSpecs.map((s) => [s.id, s]));
    this.rng = new RandomStream(seed);
    this.costTracker = costTracker;
  }

  /**
   * Resolve one tick of combat engagements.
   * Returns events generated during this tick.
   */
  resolve(
    drones: DroneInstance[],
    defenseAssets: DefenseAssetInstance[],
    _facilities: Facility[],
    context: CombatContext
  ): SimEvent[] {
    const events: SimEvent[] = [];

    // Get active attacking drones
    const attackDrones = drones.filter(
      (d) => d.side === 'red' && d.state === 'transit'
    );
    if (attackDrones.length === 0) return events;

    // Build spatial index for fast proximity queries (O(n) build, O(k) query)
    const grid = new SpatialGrid();
    for (let i = 0; i < attackDrones.length; i++) {
      grid.insert(i, attackDrones[i].position[0], attackDrones[i].position[1]);
    }

    // Process each defense asset
    for (const asset of defenseAssets) {
      if (!asset.isActive || asset.currentStock <= 0) continue;

      const spec = this.assetSpecs.get(asset.specId);
      if (!spec) continue;

      // Use spatial grid to find candidate drones, then exact distance check
      const radiusDeg = kmToDeg(spec.rangeKm);
      const candidateIndices = grid.queryRadius(asset.position[0], asset.position[1], radiusDeg);
      const inRange = candidateIndices
        .map((i) => attackDrones[i])
        .filter((d) => d.state === 'transit' && distanceKm(asset.position, d.position) <= spec.rangeKm);

      if (inRange.length === 0) continue;

      // === KILL CHAIN DELAY: track how long each drone has been in range ===
      const requiredTicks = KILL_CHAIN_TICKS[spec.type] ?? 2;
      const engageableDrones: DroneInstance[] = [];
      for (const drone of inRange) {
        const key = `${asset.instanceId}-${drone.instanceId}`;
        const currentTicks = (this.trackingTicks.get(key) ?? 0) + 1;
        this.trackingTicks.set(key, currentTicks);
        if (currentTicks >= requiredTicks) {
          engageableDrones.push(drone);
        }
      }

      // Clean up tracking for drones no longer in range
      const inRangeIds = new Set(inRange.map((d) => d.instanceId));
      for (const [key] of this.trackingTicks) {
        if (key.startsWith(`${asset.instanceId}-`)) {
          const droneId = Number(key.split('-')[1]);
          if (!inRangeIds.has(droneId)) {
            this.trackingTicks.delete(key);
          }
        }
      }

      if (engageableDrones.length === 0) continue;

      // === HPM SPECIAL CASE: area-denial, single pulse defeats all in range ===
      // HPM works against ALL drone types including fiber-optic and autonomous
      if (spec.type === 'hpm') {
        // HPM fires once per cooldown (~5s), hits everything in range
        let hpmKills = 0;
        for (const target of engageableDrones) {
          if (target.state !== 'transit') continue;
          // HPM has very high pkill regardless of drone guidance type
          const rangeFraction = distanceKm(asset.position, target.position) / spec.rangeKm;
          const rangeMod = rangeFraction < 0.5 ? 1.0 : 1.0 - (rangeFraction - 0.5) * 0.3;
          if (this.rng.chance(spec.pkill * rangeMod)) {
            target.state = 'destroyed';
            this.costTracker.addDroneDestroyed('red');
            hpmKills++;
          }
        }
        if (hpmKills > 0) {
          engagementTracker.add({
            type: 'hpm_pulse',
            source: asset.position,
            target: [...asset.position] as [number, number],
            time: performance.now(),
            success: true,
          });
          events.push({
            timeSec: context.currentTimeSec,
            type: 'intercept',
            description: `${spec.name} pulse destroyed ${hpmKills} drones`,
            position: asset.position,
            involvedIds: [asset.instanceId],
          });
          this.costTracker.addCost('blue', spec.costPerUseUSD);
        }
        continue; // Skip normal engagement loop for HPM
      }

      // Calculate saturation modifier (based on all drones in range, not just engageable)
      const saturationMod = Math.min(1.0, asset.currentStock / inRange.length);

      // Process engagements only against drones that have completed kill chain
      const engagementsThisTick = this.getEngagementsPerTick(spec, asset.currentStock);

      for (let i = 0; i < Math.min(engagementsThisTick, engageableDrones.length); i++) {
        if (asset.currentStock <= 0) break;

        const target = engageableDrones[i];
        if (target.state !== 'transit') continue;

        const droneSpec = this.droneSpecs.get(target.specId);
        if (!droneSpec) continue;

        // Skip if asset type doesn't match target
        if (!this.canEngage(spec, droneSpec)) continue;

        // Calculate effective pkill
        const effectivePkill = this.calculatePkill(
          spec,
          droneSpec,
          asset,
          target,
          saturationMod,
          context
        );

        // Roll for kill
        if (this.rng.chance(effectivePkill)) {
          const isCapture = spec.type === 'net_launcher';
          target.state = isCapture ? 'captured' : 'destroyed';
          this.costTracker.addDroneDestroyed('red');

          // Track typed engagement for visualization
          engagementTracker.add({
            type: defenseTypeToEngagement(spec.type, isCapture),
            source: asset.position,
            target: [...target.position] as [number, number],
            time: performance.now(),
            success: true,
          });

          events.push({
            timeSec: context.currentTimeSec,
            type: 'intercept',
            description: `${spec.name} intercepted ${droneSpec.name}`,
            position: target.position,
            involvedIds: [target.instanceId, asset.instanceId],
          });
        } else {
          events.push({
            timeSec: context.currentTimeSec,
            type: 'miss',
            description: `${spec.name} missed ${droneSpec.name}`,
            position: target.position,
          });
        }

        // Consume ammo / track cost
        if (spec.type !== 'ew_jammer' && spec.type !== 'decoy_emitter') {
          asset.currentStock--;
          this.costTracker.addCost('blue', spec.costPerUseUSD);
        }
      }
    }

    return events;
  }

  /**
   * Check if a defense asset can engage a given drone type.
   */
  private canEngage(asset: DefenseAssetSpec, drone: DroneSpec): boolean {
    switch (asset.type) {
      case 'hpm':
        return true; // HPM defeats all drone types (handled in special case above)
      case 'ew_jammer':
        return drone.vulnerabilities.ewJammable;
      case 'patriot_battery':
        // Patriots only for missiles and high-value targets
        return drone.domain === 'air' && drone.costUSD > 100000;
      case 'anti_ship_battery':
        return false; // Anti-ship doesn't engage drones
      case 'decoy_emitter':
        return drone.guidance === 'gps'; // Only diverts GPS-guided
      default:
        return drone.domain === 'air'; // All other types engage air drones
    }
  }

  /**
   * Calculate effective kill probability with all modifiers.
   */
  private calculatePkill(
    assetSpec: DefenseAssetSpec,
    droneSpec: DroneSpec,
    asset: DefenseAssetInstance,
    drone: DroneInstance,
    saturationMod: number,
    context: CombatContext
  ): number {
    let pkill = assetSpec.pkill;

    // Range modifier: effectiveness drops near max range
    const dist = distanceKm(asset.position, drone.position);
    const rangeFraction = dist / assetSpec.rangeKm;
    const rangeMod = rangeFraction < 0.5 ? 1.0 : 1.0 - (rangeFraction - 0.5);

    // GPS jamming modifier
    let guidanceMod = 1.0;
    if (context.gpsJammingActive) {
      if (droneSpec.guidance === 'gps') {
        // GPS-guided attack drones are disrupted (good for defense)
        // But GPS-guided defense drones are also disrupted (bad)
        // EW jammers get a boost since they jam the same thing GPS jamming does
        if (assetSpec.type === 'ew_jammer') {
          guidanceMod = 1.3; // EW is more effective with GPS jamming
        }
      }
    }

    // Decoy effectiveness decay: starts at 1.0, decays by 0.05 per sim-hour
    // as red AI "learns" to distinguish decoys from real targets
    let decoyMod = 1.0;
    if (assetSpec.type === 'decoy_emitter') {
      const simHours = context.currentTimeSec / 3600;
      decoyMod = Math.max(0.2, 1.0 - simHours * 0.05);
    }

    // Weather/environment modifiers
    let weatherMod = 1.0;
    // Fog reduces detection range → lower pkill for all systems
    if (context.visibility === 'fog') weatherMod *= 0.6;
    else if (context.visibility === 'overcast') weatherMod *= 0.85;
    // Night degrades visual detection (but IR/radar still works)
    if (context.timeOfDay === 'night') {
      if (assetSpec.type === 'directed_energy') weatherMod *= 1.0; // DE unaffected
      else if (assetSpec.type === 'ew_jammer') weatherMod *= 1.0; // EW unaffected
      else weatherMod *= 0.8; // Interceptors less effective at night
    }
    // High sea state degrades sea-surface operations
    if (context.seaState >= 4 && droneSpec.domain === 'air') {
      // Rough seas don't affect air drones much, but affect sea-launched accuracy
    }

    // Saturation modifier (core mechanic)
    // C2 damage degrades coordination
    const c2Mod = 1.0 - context.c2DamageLevel * 0.5;

    pkill = pkill * rangeMod * guidanceMod * saturationMod * c2Mod * decoyMod * weatherMod;

    return Math.max(0, Math.min(1, pkill));
  }

  /**
   * How many engagements this asset can process per tick (10 seconds).
   * Interceptor squads scale with stock: a squad of 80 drones can engage
   * multiple targets simultaneously (each interceptor drone engages one target).
   */
  private getEngagementsPerTick(spec: DefenseAssetSpec, currentStock?: number): number {
    switch (spec.type) {
      case 'directed_energy':
        return 2; // ~5s per engagement, rate-limited by tracking
      case 'ew_jammer':
        return 5; // Area effect but diminishing returns at high density
      case 'interceptor_squad':
        // Each interceptor drone takes ~30s to launch, acquire, and engage
        // So per 10-second tick, ~3% of stock can launch new engagements
        // A squad of 100 processes ~3 per tick; needs multiple ticks to clear a wave
        return Math.max(1, Math.ceil((currentStock ?? spec.capacity) * 0.03));
      case 'net_launcher':
        return 1;
      case 'decoy_emitter':
        return 3; // Diverts a few per tick
      case 'patriot_battery':
        return 1;
      default:
        return 1;
    }
  }

  /**
   * Process drones that reached their target facility.
   * Returns events for facility hits.
   */
  resolveFacilityHits(
    reachedDroneIds: number[],
    drones: DroneInstance[],
    facilities: Facility[],
    currentTimeSec: number
  ): SimEvent[] {
    const events: SimEvent[] = [];

    for (const droneId of reachedDroneIds) {
      const drone = drones.find((d) => d.instanceId === droneId);
      if (!drone || drone.state === 'destroyed' || drone.state === 'captured') continue;

      const droneSpec = this.droneSpecs.get(drone.specId);
      if (!droneSpec) continue;

      // Find nearest facility
      let nearestFacility: Facility | null = null;
      let nearestDist = Infinity;
      for (const facility of facilities) {
        if (facility.status === 'destroyed') continue;
        const dist = distanceKm(drone.position, facility.position);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestFacility = facility;
        }
      }

      if (nearestFacility && nearestDist <= nearestFacility.radiusKm + 5) {
        // Hit the facility
        nearestFacility.currentHitPoints--;
        drone.state = 'destroyed'; // Kamikaze drone is consumed
        this.costTracker.addCost('red', droneSpec.costUSD);

        if (nearestFacility.currentHitPoints <= 0) {
          nearestFacility.status = 'destroyed';
          nearestFacility.currentHitPoints = 0;
          events.push({
            timeSec: currentTimeSec,
            type: 'facility_destroyed',
            description: `${nearestFacility.name} DESTROYED`,
            position: nearestFacility.position,
          });
        } else if (nearestFacility.currentHitPoints < nearestFacility.hitPoints) {
          nearestFacility.status = 'damaged';
          events.push({
            timeSec: currentTimeSec,
            type: 'facility_hit',
            description: `${nearestFacility.name} hit (${nearestFacility.currentHitPoints}/${nearestFacility.hitPoints} HP)`,
            position: nearestFacility.position,
          });
        }
      } else {
        // Drone reached end of path but missed facility
        drone.state = 'destroyed';
      }
    }

    return events;
  }
}
