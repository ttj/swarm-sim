import type {
  DroneInstance, DroneSpec, DefenseAssetSpec, Scenario, SimEvent,
  Facility, DefenseAssetInstance, VesselInstance,
} from '../types';
import { MovementModel } from './MovementModel';
import { CombatResolver } from './CombatResolver';
import { CostTracker } from './CostTracker';
import { RandomStream } from './RandomStream';
import { SnapshotStore, type SimSnapshot } from './SnapshotStore';
import { SIM_TICK_SECONDS } from '../utils/constants';
import { bearing, distanceKm } from '../utils/geo';

let nextInstanceId = 1;

function getNextId(): number {
  return nextInstanceId++;
}

export function resetIdCounter(): void {
  nextInstanceId = 1;
}

/**
 * Core simulation engine with support for:
 * - Air drone waves (land-launched)
 * - Maritime quarantine vessels that launch sea drones
 * - Conventional strike precursors (ballistic/cruise missiles)
 * - Allied support effects (additional interceptor capacity)
 * - C2 disruption tracking
 */
export class SimulationEngine {
  private scenario: Scenario;
  private droneSpecs: DroneSpec[];
  private rng: RandomStream;
  private movementModel: MovementModel;
  private combatResolver: CombatResolver;
  private costTracker: CostTracker;

  private drones: DroneInstance[] = [];
  private vessels: VesselInstance[] = [];
  private defenseAssets: DefenseAssetInstance[] = [];
  private facilities: Facility[] = [];
  private events: SimEvent[] = [];
  private currentTimeSec = 0;
  private wavesLaunched: Set<string> = new Set();
  private strikesExecuted: Set<number> = new Set();
  private vesselWavesDeployed: Set<string> = new Set();
  private c2DamageLevel = 0; // 0-1
  private snapshotStore = new SnapshotStore(60); // Snapshot every 60 ticks (10 sim-minutes)

  constructor(
    scenario: Scenario,
    droneSpecs: DroneSpec[],
    assetSpecs: DefenseAssetSpec[],
    seed: number = 42
  ) {
    this.scenario = scenario;
    this.droneSpecs = droneSpecs;
    this.rng = new RandomStream(seed);
    this.costTracker = new CostTracker();
    this.movementModel = new MovementModel(droneSpecs);
    this.combatResolver = new CombatResolver(droneSpecs, assetSpecs, this.costTracker, seed);

    this.facilities = scenario.facilities.map((f) => ({ ...f }));
    this.defenseAssets = scenario.blueForce.assets.map((a) => ({ ...a }));

    // Apply allied support: add bonus interceptors
    if (scenario.blueForce.alliedSupport.enabled) {
      this.applyAlliedSupport();
    }

    resetIdCounter();
  }

  /**
   * Allied support adds extra defense capacity.
   */
  private applyAlliedSupport(): void {
    const support = this.scenario.blueForce.alliedSupport;

    if (support.carrierStrikeGroup) {
      // CSG adds interceptor capacity near northern facilities
      this.defenseAssets.push({
        instanceId: getNextId(),
        specId: 'interceptor-autonav',
        type: 'interceptor_squad',
        position: [121.5, 25.0], // East of Taiwan, CSG position
        currentStock: 200,
        maxStock: 200,
        reloadTimer: 0,
        isActive: true,
      });
    }

    if (support.ewSupport) {
      // Allied EW adds wide-area jamming
      this.defenseAssets.push({
        instanceId: getNextId(),
        specId: 'ew-jammer',
        type: 'ew_jammer',
        position: [121.3, 24.5],
        currentStock: 9999,
        maxStock: 9999,
        reloadTimer: 0,
        isActive: true,
      });
    }

    if (support.submarineSupport) {
      // Submarines can engage quarantine vessels — modeled as anti-ship from sea
      this.defenseAssets.push({
        instanceId: getNextId(),
        specId: 'hsiung-feng-3',
        type: 'anti_ship_battery',
        position: [120.0, 24.0], // In the strait
        currentStock: 12,
        maxStock: 12,
        reloadTimer: 0,
        isActive: true,
      });
    }
  }

  tick(): SimEvent[] {
    const tickEvents: SimEvent[] = [];

    // 1. Conventional strike precursors
    this.checkConventionalStrikes(tickEvents);

    // 2. Deploy quarantine vessels
    this.checkVesselDeployments(tickEvents);

    // 3. Vessel drone launches
    this.processVesselLaunches(tickEvents);

    // 4. Check for air wave launches
    this.checkWaveLaunches(tickEvents);

    // 5. Move all drones
    const reachedTarget = this.movementModel.updateAll(this.drones, this.defenseAssets);

    // 6. Resolve combat
    const combatEvents = this.combatResolver.resolve(
      this.drones,
      this.defenseAssets,
      this.facilities,
      {
        gpsJammingActive: this.scenario.redForce.gpsJammingActive,
        currentTimeSec: this.currentTimeSec,
        c2DamageLevel: this.c2DamageLevel,
        visibility: this.scenario.environment.visibility,
        timeOfDay: this.scenario.environment.timeOfDay,
        seaState: this.scenario.environment.seaState,
      }
    );
    tickEvents.push(...combatEvents);

    // 7. Resolve facility hits
    if (reachedTarget.length > 0) {
      const hitEvents = this.combatResolver.resolveFacilityHits(
        reachedTarget, this.drones, this.facilities, this.currentTimeSec
      );
      tickEvents.push(...hitEvents);
    }

    // 8. Anti-ship engagements against quarantine vessels
    this.processAntiShipEngagements(tickEvents);

    // 9. UUV mine-laying at port approaches
    this.processUUVMineLaying(tickEvents);

    // 10. Advance time
    this.currentTimeSec += SIM_TICK_SECONDS;

    // 10. Take periodic snapshot for replay
    this.snapshotStore.maybeTakeSnapshot(this.getState());

    this.events.push(...tickEvents);
    return tickEvents;
  }

  /**
   * Conventional strikes: ballistic/cruise missiles at facilities or C2.
   */
  private checkConventionalStrikes(events: SimEvent[]): void {
    const currentTimeMin = this.currentTimeSec / 60;

    for (let i = 0; i < this.scenario.redForce.conventionalStrikes.length; i++) {
      if (this.strikesExecuted.has(i)) continue;
      const strike = this.scenario.redForce.conventionalStrikes[i];
      if (currentTimeMin < strike.launchTimeMinutes) continue;

      this.strikesExecuted.add(i);

      for (let m = 0; m < strike.count; m++) {
        if (this.rng.chance(strike.pkill)) {
          // Hit target
          if (strike.targetType === 'c2') {
            // C2 disruption
            this.c2DamageLevel = Math.min(1.0, this.c2DamageLevel + 0.3);
            events.push({
              timeSec: this.currentTimeSec,
              type: 'conventional_strike',
              description: `${strike.type.replace(/_/g, ' ')} struck C2 node — coordination degraded to ${((1 - this.c2DamageLevel) * 100).toFixed(0)}%`,
            });
          } else {
            // Strike on facility
            const facility = this.facilities.find((f) => f.id === strike.targetType);
            if (facility && facility.status !== 'destroyed') {
              facility.currentHitPoints -= 2; // Missiles do more damage than drones
              if (facility.currentHitPoints <= 0) {
                facility.currentHitPoints = 0;
                facility.status = 'destroyed';
                events.push({
                  timeSec: this.currentTimeSec,
                  type: 'facility_destroyed',
                  description: `${strike.type.replace(/_/g, ' ')} DESTROYED ${facility.name}`,
                  position: facility.position,
                });
              } else {
                facility.status = 'damaged';
                events.push({
                  timeSec: this.currentTimeSec,
                  type: 'facility_hit',
                  description: `${strike.type.replace(/_/g, ' ')} hit ${facility.name} (${facility.currentHitPoints}/${facility.hitPoints} HP)`,
                  position: facility.position,
                });
              }
            }
          }
        } else {
          // Intercepted by Patriot/air defense
          events.push({
            timeSec: this.currentTimeSec,
            type: 'intercept',
            description: `${strike.type.replace(/_/g, ' ')} intercepted by air defense`,
          });
        }
      }
    }
  }

  /**
   * Deploy quarantine vessels to their station positions.
   */
  private checkVesselDeployments(events: SimEvent[]): void {
    const currentTimeMin = this.currentTimeSec / 60;

    for (const vw of this.scenario.redForce.vessels) {
      if (this.vesselWavesDeployed.has(vw.id)) continue;
      if (currentTimeMin < vw.arrivalTimeMinutes) continue;

      this.vesselWavesDeployed.add(vw.id);

      // Create vessel instances at station positions with some spread
      for (let i = 0; i < vw.count; i++) {
        const spreadLng = (this.rng.next() - 0.5) * 0.5;
        const spreadLat = (this.rng.next() - 0.5) * 0.3;

        const vessel: VesselInstance = {
          instanceId: getNextId(),
          specId: vw.vesselSpec,
          side: 'red',
          state: 'station',
          position: [
            vw.stationPosition[0] + spreadLng,
            vw.stationPosition[1] + spreadLat,
          ],
          heading: 90,
          dronesRemaining: 3, // Default capacity per fishing vessel
          launchCooldownSeconds: 0,
        };

        this.vessels.push(vessel);
      }

      events.push({
        timeSec: this.currentTimeSec,
        type: 'wave_start',
        description: `${vw.count} quarantine vessels deployed to station`,
        position: vw.stationPosition,
      });
    }
  }

  /**
   * Vessels at station periodically launch drones toward nearest facility.
   */
  private processVesselLaunches(_events: SimEvent[]): void {
    const launchInterval = 300; // Launch every 5 minutes of sim time

    for (const vessel of this.vessels) {
      if (vessel.state !== 'station' || vessel.dronesRemaining <= 0) continue;

      vessel.launchCooldownSeconds -= SIM_TICK_SECONDS;
      if (vessel.launchCooldownSeconds > 0) continue;

      // Find nearest operational facility
      let nearest: Facility | null = null;
      let nearestDist = Infinity;
      for (const f of this.facilities) {
        if (f.status === 'destroyed') continue;
        const d = distanceKm(vessel.position, f.position);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = f;
        }
      }

      if (!nearest || nearestDist > 100) continue; // Only launch if within 100km

      // Launch one drone
      const drone: DroneInstance = {
        instanceId: getNextId(),
        specId: 'fpv-kamikaze',
        side: 'red',
        state: 'transit',
        position: [...vessel.position] as [number, number],
        heading: bearing(vessel.position, nearest.position),
        fuelRemaining: 1.0,
        targetId: null,
        waypointIndex: 0,
        waypoints: [nearest.position],
      };

      this.drones.push(drone);
      vessel.dronesRemaining--;
      vessel.launchCooldownSeconds = launchInterval;

      const fpvSpec = this.droneSpecs.find((s) => s.id === 'fpv-kamikaze');
      if (fpvSpec) {
        this.costTracker.addCost('red', fpvSpec.costUSD);
      }
    }
  }

  /**
   * Anti-ship assets engage quarantine vessels.
   */
  private processAntiShipEngagements(events: SimEvent[]): void {
    const activeVessels = this.vessels.filter((v) => v.state === 'station');
    if (activeVessels.length === 0) return;

    for (const asset of this.defenseAssets) {
      if (asset.type !== 'anti_ship_battery' || !asset.isActive || asset.currentStock <= 0) continue;

      // Find vessels in range
      const template = ASSET_RANGES[asset.specId];
      const range = template ?? 130;

      for (const vessel of activeVessels) {
        if (vessel.state !== 'station') continue;
        const dist = distanceKm(asset.position, vessel.position);
        if (dist > range) continue;

        // Engage (one per tick)
        if (this.rng.chance(0.75)) {
          vessel.state = 'sunk';
          this.costTracker.addVesselDestroyed();
          events.push({
            timeSec: this.currentTimeSec,
            type: 'vessel_sunk',
            description: `Anti-ship missile sank quarantine vessel`,
            position: vessel.position,
          });
        }

        asset.currentStock--;
        this.costTracker.addCost('blue', asset.specId === 'hsiung-feng-3' ? 2500000 : 1500000);
        break; // One engagement per asset per tick
      }
    }
  }

  /**
   * UUV mine-laying: deployed UUVs gradually mine port approaches,
   * degrading facility HP over time (logistics disruption).
   */
  private uuvDeployed = false;
  private uuvDamageTimer = 0;
  private processUUVMineLaying(events: SimEvent[]): void {
    const uuv = this.scenario.redForce.uuvDeployment;
    if (uuv.count === 0) return;

    // Deploy UUVs at T+30min
    if (!this.uuvDeployed && this.currentTimeSec >= 1800) {
      this.uuvDeployed = true;
      events.push({
        timeSec: this.currentTimeSec,
        type: 'wave_start',
        description: `${uuv.count} UUVs deployed — mining port approaches`,
      });
    }

    if (!this.uuvDeployed) return;

    // Every 30 sim-minutes, mines damage a targeted facility
    this.uuvDamageTimer += SIM_TICK_SECONDS;
    if (this.uuvDamageTimer < 1800) return;
    this.uuvDamageTimer = 0;

    for (const targetId of uuv.mineTargets) {
      const facility = this.facilities.find((f) => f.id === targetId);
      if (!facility || facility.status === 'destroyed') continue;

      // 30% chance per interval that a mine detonates near the facility
      if (this.rng.chance(0.3)) {
        facility.currentHitPoints--;
        if (facility.currentHitPoints <= 0) {
          facility.currentHitPoints = 0;
          facility.status = 'destroyed';
          events.push({
            timeSec: this.currentTimeSec,
            type: 'facility_destroyed',
            description: `UUV mine DESTROYED ${facility.name} port infrastructure`,
            position: facility.position,
          });
        } else {
          facility.status = 'damaged';
          events.push({
            timeSec: this.currentTimeSec,
            type: 'facility_hit',
            description: `UUV mine damaged ${facility.name} port (${facility.currentHitPoints}/${facility.hitPoints} HP)`,
            position: facility.position,
          });
        }
      }
    }
  }

  private checkWaveLaunches(events: SimEvent[]): void {
    const currentTimeMin = this.currentTimeSec / 60;

    for (const wave of this.scenario.redForce.airWaves) {
      if (this.wavesLaunched.has(wave.id)) continue;
      if (currentTimeMin >= wave.launchTimeMinutes) {
        this.launchWave(wave, events);
        this.wavesLaunched.add(wave.id);
      }
    }

    for (const wave of this.scenario.redForce.seaLaunchedWaves) {
      if (this.wavesLaunched.has(wave.id)) continue;
      if (currentTimeMin >= wave.launchTimeMinutes) {
        this.launchWave(wave, events);
        this.wavesLaunched.add(wave.id);
      }
    }
  }

  private launchWave(
    wave: { id: string; droneSpec: string; count: number; origin: [number, number]; target: string; approachBearing: number; formation: string },
    events: SimEvent[]
  ): void {
    const targetFacility = this.facilities.find((f) => f.id === wave.target);
    if (!targetFacility) return;

    const spec = this.droneSpecs.find((s) => s.id === wave.droneSpec);
    if (!spec) return;

    for (let i = 0; i < wave.count; i++) {
      const spreadKm = wave.formation === 'concentrated' ? 2 : wave.formation === 'dispersed' ? 15 : 5;
      const offsetLng = (this.rng.next() - 0.5) * spreadKm * 0.01;
      const offsetLat = (this.rng.next() - 0.5) * spreadKm * 0.01;

      const origin: [number, number] = [
        wave.origin[0] + offsetLng,
        wave.origin[1] + offsetLat,
      ];

      const drone: DroneInstance = {
        instanceId: getNextId(),
        specId: wave.droneSpec,
        side: 'red',
        state: 'transit',
        position: origin,
        heading: bearing(origin, targetFacility.position),
        fuelRemaining: 1.0,
        targetId: null,
        waypointIndex: 0,
        waypoints: [targetFacility.position],
      };

      this.drones.push(drone);
      this.costTracker.addCost('red', spec.costUSD);
    }

    events.push({
      timeSec: this.currentTimeSec,
      type: 'wave_start',
      description: `Wave "${wave.id}": ${wave.count} ${spec.name}s toward ${targetFacility.name}`,
      position: wave.origin,
    });
  }

  getState() {
    return {
      currentTimeSec: this.currentTimeSec,
      drones: this.drones,
      vessels: this.vessels,
      defenseAssets: this.defenseAssets,
      facilities: this.facilities,
      events: this.events,
      costs: this.costTracker.getCosts(),
      dronesDestroyed: this.costTracker.getDronesDestroyed(),
      vesselsDestroyed: this.costTracker.getVesselsDestroyed(),
    };
  }

  isComplete(): boolean {
    const durationSec = this.scenario.durationHours * 3600;
    if (this.currentTimeSec >= durationSec) return true;

    const allDestroyed = this.facilities.every((f) => f.status === 'destroyed');
    if (allDestroyed) return true;

    // Check if all threats are exhausted
    const allAirWavesLaunched = [...this.scenario.redForce.airWaves, ...this.scenario.redForce.seaLaunchedWaves]
      .every((w) => this.wavesLaunched.has(w.id));
    const activeRedDrones = this.drones.filter(
      (d) => d.side === 'red' && d.state !== 'destroyed' && d.state !== 'captured'
    );
    const activeVesselsWithDrones = this.vessels.filter(
      (v) => v.state === 'station' && v.dronesRemaining > 0
    );

    if (allAirWavesLaunched && activeRedDrones.length === 0 && activeVesselsWithDrones.length === 0) {
      return true;
    }

    return false;
  }

  getCurrentTimeSec(): number {
    return this.currentTimeSec;
  }

  /** Get the nearest snapshot to a given time (for replay scrubbing) */
  getSnapshotAt(timeSec: number): SimSnapshot | null {
    return this.snapshotStore.getSnapshotAt(timeSec);
  }

  /** Get all snapshots */
  getSnapshots(): SimSnapshot[] {
    return this.snapshotStore.getSnapshots();
  }
}

// Lookup table for asset ranges (used by anti-ship engagement)
const ASSET_RANGES: Record<string, number> = {
  'hsiung-feng-3': 250,
  'harpoon-block2': 130,
};
