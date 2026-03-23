import type { DroneInstance, DroneSpec } from '../types';
import { distanceKm, bearing, movePoint } from '../utils/geo';
import { SIM_TICK_SECONDS } from '../utils/constants';

/**
 * Handles drone movement along waypoints, respecting speed and fuel constraints.
 */
export class MovementModel {
  private specLookup: Map<string, DroneSpec>;

  constructor(specs: DroneSpec[]) {
    this.specLookup = new Map(specs.map((s) => [s.id, s]));
  }

  /**
   * Update a single drone's position for one tick.
   * Returns true if the drone reached its final waypoint (target).
   */
  updateDrone(drone: DroneInstance): boolean {
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
      drone.state = 'destroyed'; // out of fuel = crashed
      return false;
    }

    // If no waypoints, loiter
    if (drone.waypoints.length === 0) {
      drone.state = 'loiter';
      return false;
    }

    // Move toward current waypoint
    const target = drone.waypoints[drone.waypointIndex];
    if (!target) {
      drone.state = 'loiter';
      return false;
    }

    const dist = distanceKm(drone.position, target);
    const speedKmPerTick = (spec.cruiseSpeedKmh / 3600) * SIM_TICK_SECONDS;

    if (dist <= speedKmPerTick) {
      // Reached waypoint
      drone.position = [...target] as [number, number];
      drone.waypointIndex++;

      if (drone.waypointIndex >= drone.waypoints.length) {
        // Reached final waypoint (target)
        return true;
      }

      // Update heading toward next waypoint
      const next = drone.waypoints[drone.waypointIndex];
      if (next) {
        drone.heading = bearing(drone.position, next);
      }
    } else {
      // Move toward waypoint
      const brng = bearing(drone.position, target);
      drone.heading = brng;
      drone.position = movePoint(drone.position, speedKmPerTick, brng);
    }

    return false;
  }

  /**
   * Update all drones in a batch.
   * Returns array of drone instanceIds that reached their target.
   */
  updateAll(drones: DroneInstance[]): number[] {
    const reached: number[] = [];
    for (const drone of drones) {
      if (this.updateDrone(drone)) {
        reached.push(drone.instanceId);
      }
    }
    return reached;
  }
}
