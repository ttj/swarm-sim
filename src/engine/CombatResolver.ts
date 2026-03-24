import type { DroneInstance, DroneSpec, DefenseAssetInstance, DefenseAssetSpec, Facility, SimEvent } from '../types';
import { distanceKm } from '../utils/geo';
import { RandomStream } from './RandomStream';
import { CostTracker } from './CostTracker';

interface CombatContext {
  gpsJammingActive: boolean;
  currentTimeSec: number;
  c2DamageLevel: number; // 0-1, 0 = fully operational, 1 = destroyed
}

/**
 * Resolves combat engagements between defense assets and attacking drones.
 * Implements the saturation modifier, GPS jamming effects, and layered defense.
 */
export class CombatResolver {
  private droneSpecs: Map<string, DroneSpec>;
  private assetSpecs: Map<string, DefenseAssetSpec>;
  private rng: RandomStream;
  private costTracker: CostTracker;

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

    // Process each defense asset
    for (const asset of defenseAssets) {
      if (!asset.isActive || asset.currentStock <= 0) continue;

      const spec = this.assetSpecs.get(asset.specId);
      if (!spec) continue;

      // Find drones in range of this asset
      const inRange = attackDrones.filter(
        (d) => d.state === 'transit' && distanceKm(asset.position, d.position) <= spec.rangeKm
      );

      if (inRange.length === 0) continue;

      // Calculate saturation modifier
      const saturationMod = Math.min(1.0, asset.currentStock / inRange.length);

      // Process engagements based on asset type
      const engagementsThisTick = this.getEngagementsPerTick(spec, asset.currentStock);

      for (let i = 0; i < Math.min(engagementsThisTick, inRange.length); i++) {
        if (asset.currentStock <= 0) break;

        const target = inRange[i];
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
          target.state = spec.type === 'net_launcher' ? 'captured' : 'destroyed';
          this.costTracker.addDroneDestroyed('red');

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

    // Saturation modifier (core mechanic)
    // C2 damage degrades coordination
    const c2Mod = 1.0 - context.c2DamageLevel * 0.5;

    pkill = pkill * rangeMod * guidanceMod * saturationMod * c2Mod * decoyMod;

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
        return 2; // ~5s per engagement
      case 'ew_jammer':
        return 10; // Affects many simultaneously within range
      case 'interceptor_squad':
        // A squad launches interceptors in parallel — scales with stock
        // Each tick, up to 20% of remaining stock can engage (launch rate)
        return Math.max(1, Math.floor((currentStock ?? spec.capacity) * 0.2));
      case 'net_launcher':
        return 1;
      case 'decoy_emitter':
        return 5; // Diverts multiple
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
