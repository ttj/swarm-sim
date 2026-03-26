import type { DroneInstance, DroneSpec, DefenseAssetInstance } from '../types';
import { distanceKm, bearing, movePoint } from '../utils/geo';
import { SIM_TICK_SECONDS } from '../utils/constants';
import { computeSwarmVelocity, type SwarmConfig, DEFAULT_SWARM_CONFIG } from './SwarmBehavior';

/**
 * Handles drone movement with configurable swarm behavior.
 *
 * When swarmConfig.algorithm is 'waypoint' (default), uses simple waypoint following.
 * When set to 'boids', 'potential_field', or 'combined', drones exhibit
 * flocking behavior and threat avoidance.
 */
export class MovementModel {
  private specLookup: Map<string, DroneSpec>;
  private swarmConfig: SwarmConfig;

  constructor(specs: DroneSpec[], swarmConfig?: SwarmConfig) {
    this.specLookup = new Map(specs.map((s) => [s.id, s]));
    this.swarmConfig = swarmConfig ?? DEFAULT_SWARM_CONFIG;
  }

  setSwarmConfig(config: SwarmConfig): void {
    this.swarmConfig = config;
  }

  /**
   * Update a single drone's position for one tick.
   * Returns true if the drone reached its final waypoint (target).
   */
  updateDrone(
    drone: DroneInstance,
    allDrones?: DroneInstance[],
    threats?: DefenseAssetInstance[],
  ): boolean {
    if (drone.state === 'destroyed' || drone.state === 'captured' || drone.state === 'jammed') {
      return false;
    }

    const spec = this.specLookup.get(drone.specId);
    if (!spec) return false;

    // Check fuel
    const fuelPerTick = SIM_TICK_SECONDS / (spec.enduranceMinutes * 60);
    drone.fuelRemaining -= fuelPerTick;
    if (drone.fuelRemaining <= 0) {
      drone.fuelRemaining = 0;
      drone.state = 'destroyed';
      return false;
    }

    if (drone.waypoints.length === 0) {
      drone.state = 'loiter';
      return false;
    }

    const target = drone.waypoints[drone.waypointIndex];
    if (!target) {
      drone.state = 'loiter';
      return false;
    }

    const dist = distanceKm(drone.position, target);
    let speedKmPerTick = (spec.cruiseSpeedKmh / 3600) * SIM_TICK_SECONDS;

    // Apply swarm behavior if not simple waypoint mode
    if (this.swarmConfig.algorithm !== 'waypoint' &&
        drone.side === 'red' && // Only apply to attack drones
        allDrones && threats) {
      const swarmResult = computeSwarmVelocity(
        drone, allDrones, threats, target, this.swarmConfig,
      );
      drone.heading = swarmResult.heading;
      speedKmPerTick *= swarmResult.speedMod;

      // Move in the swarm-computed direction
      if (dist <= speedKmPerTick) {
        drone.position = [...target] as [number, number];
        drone.waypointIndex++;
        if (drone.waypointIndex >= drone.waypoints.length) {
          return true;
        }
      } else {
        drone.position = movePoint(drone.position, speedKmPerTick, drone.heading);
      }
    } else {
      // Simple waypoint following (original behavior)
      if (dist <= speedKmPerTick) {
        drone.position = [...target] as [number, number];
        drone.waypointIndex++;
        if (drone.waypointIndex >= drone.waypoints.length) {
          return true;
        }
        const next = drone.waypoints[drone.waypointIndex];
        if (next) {
          drone.heading = bearing(drone.position, next);
        }
      } else {
        const brng = bearing(drone.position, target);
        drone.heading = brng;
        drone.position = movePoint(drone.position, speedKmPerTick, brng);
      }
    }

    return false;
  }

  /**
   * Update all drones in a batch.
   * Passes full drone list and threats for swarm behavior computation.
   */
  updateAll(drones: DroneInstance[], threats?: DefenseAssetInstance[]): number[] {
    const reached: number[] = [];
    for (const drone of drones) {
      if (this.updateDrone(drone, drones, threats)) {
        reached.push(drone.instanceId);
      }
    }
    return reached;
  }
}
