/**
 * Swarm behavior algorithms for drone movement.
 *
 * Implements:
 * - Reynolds Boids (flocking: separation + alignment + cohesion)
 * - Potential Field navigation (attractive targets + repulsive threats)
 * - Combined mode (boids + threat avoidance)
 *
 * Each algorithm computes a desired velocity vector per drone per tick.
 * The MovementModel uses this instead of simple waypoint following.
 */

import type { DroneInstance, DefenseAssetInstance } from '../types';
import { distanceKm, bearing } from '../utils/geo';

export type SwarmAlgorithm = 'waypoint' | 'boids' | 'potential_field' | 'combined';

export interface SwarmConfig {
  algorithm: SwarmAlgorithm;
  separationWeight: number;    // Boids: avoid crowding (default: 1.5)
  alignmentWeight: number;     // Boids: match neighbor heading (default: 1.0)
  cohesionWeight: number;      // Boids: steer toward group center (default: 1.0)
  targetWeight: number;        // Attraction to target facility (default: 2.0)
  threatAvoidanceWeight: number; // Repulsion from defense assets (default: 3.0)
  neighborRadiusKm: number;    // Radius to consider neighbors (default: 5)
  threatDetectionKm: number;   // Range at which drones detect threats (default: 25)
}

export const DEFAULT_SWARM_CONFIG: SwarmConfig = {
  algorithm: 'waypoint', // Default to simple waypoint for backward compat
  separationWeight: 1.5,
  alignmentWeight: 1.0,
  cohesionWeight: 1.0,
  targetWeight: 2.0,
  threatAvoidanceWeight: 3.0,
  neighborRadiusKm: 5,
  threatDetectionKm: 25,
};

interface Vec2 {
  x: number; // longitude delta
  y: number; // latitude delta
}

function vec2(x: number, y: number): Vec2 { return { x, y }; }
function vecAdd(a: Vec2, b: Vec2): Vec2 { return { x: a.x + b.x, y: a.y + b.y }; }
function vecScale(v: Vec2, s: number): Vec2 { return { x: v.x * s, y: v.y * s }; }
function vecLen(v: Vec2): number { return Math.sqrt(v.x * v.x + v.y * v.y); }
function vecNorm(v: Vec2): Vec2 {
  const len = vecLen(v);
  return len > 0 ? { x: v.x / len, y: v.y / len } : { x: 0, y: 0 };
}

/**
 * Compute the desired heading and speed modifier for a drone using swarm behavior.
 *
 * Returns: { heading: number (degrees), speedMod: number (0-1.2) }
 */
export function computeSwarmVelocity(
  drone: DroneInstance,
  allDrones: DroneInstance[],
  threats: DefenseAssetInstance[],
  target: [number, number],
  config: SwarmConfig,
): { heading: number; speedMod: number } {
  if (config.algorithm === 'waypoint') {
    // Simple waypoint — just head to target
    return { heading: bearing(drone.position, target), speedMod: 1.0 };
  }

  let force = vec2(0, 0);

  // === BOIDS FORCES ===
  if (config.algorithm === 'boids' || config.algorithm === 'combined') {
    const neighbors = allDrones.filter((d) =>
      d.instanceId !== drone.instanceId &&
      d.side === drone.side &&
      d.state === 'transit' &&
      distanceKm(drone.position, d.position) <= config.neighborRadiusKm
    );

    if (neighbors.length > 0) {
      // Separation: steer away from nearby drones
      let sep = vec2(0, 0);
      for (const n of neighbors) {
        const dist = Math.max(0.01, distanceKm(drone.position, n.position));
        const away = vec2(
          drone.position[0] - n.position[0],
          drone.position[1] - n.position[1],
        );
        // Inverse distance weighting — stronger when closer
        sep = vecAdd(sep, vecScale(away, 1 / (dist * dist)));
      }
      force = vecAdd(force, vecScale(vecNorm(sep), config.separationWeight));

      // Alignment: match average heading of neighbors
      let avgHeadingX = 0;
      let avgHeadingY = 0;
      for (const n of neighbors) {
        const rad = (n.heading * Math.PI) / 180;
        avgHeadingX += Math.cos(rad);
        avgHeadingY += Math.sin(rad);
      }
      avgHeadingX /= neighbors.length;
      avgHeadingY /= neighbors.length;
      force = vecAdd(force, vecScale(
        vec2(avgHeadingX * 0.01, avgHeadingY * 0.01), // Small magnitude
        config.alignmentWeight,
      ));

      // Cohesion: steer toward center of mass of neighbors
      let cx = 0, cy = 0;
      for (const n of neighbors) {
        cx += n.position[0];
        cy += n.position[1];
      }
      cx /= neighbors.length;
      cy /= neighbors.length;
      const toCenter = vec2(cx - drone.position[0], cy - drone.position[1]);
      force = vecAdd(force, vecScale(vecNorm(toCenter), config.cohesionWeight * 0.5));
    }
  }

  // === TARGET ATTRACTION ===
  const toTarget = vec2(
    target[0] - drone.position[0],
    target[1] - drone.position[1],
  );
  force = vecAdd(force, vecScale(vecNorm(toTarget), config.targetWeight));

  // === THREAT AVOIDANCE (Potential Field) ===
  if (config.algorithm === 'potential_field' || config.algorithm === 'combined') {
    for (const threat of threats) {
      if (!threat.isActive) continue;
      const dist = distanceKm(drone.position, threat.position);
      if (dist > config.threatDetectionKm) continue;
      if (dist < 0.1) continue;

      // Repulsive force: stronger when closer, inversely proportional to distance²
      const away = vec2(
        drone.position[0] - threat.position[0],
        drone.position[1] - threat.position[1],
      );
      const repulsionStrength = config.threatAvoidanceWeight / (dist * dist);
      force = vecAdd(force, vecScale(vecNorm(away), repulsionStrength));
    }
  }

  // Convert force vector to heading
  const normalized = vecNorm(force);
  if (vecLen(force) < 0.0001) {
    // No significant force — maintain current heading
    return { heading: drone.heading, speedMod: 1.0 };
  }

  // Convert from lng/lat delta to compass bearing
  const headingRad = Math.atan2(normalized.x, normalized.y);
  const headingDeg = ((headingRad * 180) / Math.PI + 360) % 360;

  // Speed modifier: slow down when making sharp turns or near threats
  const headingDelta = Math.abs(headingDeg - drone.heading);
  const turnPenalty = headingDelta > 90 ? 0.7 : headingDelta > 45 ? 0.85 : 1.0;

  // Speed boost when far from threats, slow when close
  const nearestThreatDist = threats
    .filter((t) => t.isActive)
    .reduce((min, t) => Math.min(min, distanceKm(drone.position, t.position)), Infinity);
  const threatSpeedMod = nearestThreatDist < 5 ? 1.2 : 1.0; // Speed up to escape!

  return {
    heading: headingDeg,
    speedMod: Math.min(1.2, turnPenalty * threatSpeedMod),
  };
}
