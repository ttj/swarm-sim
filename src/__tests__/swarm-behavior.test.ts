import { describe, it, expect } from 'vitest';
import { computeSwarmVelocity, DEFAULT_SWARM_CONFIG, type SwarmConfig } from '../engine/SwarmBehavior';
import type { DroneInstance, DefenseAssetInstance } from '../types';

function makeDrone(id: number, pos: [number, number], heading: number = 90): DroneInstance {
  return {
    instanceId: id, specId: 'shahed-136', side: 'red', state: 'transit',
    position: pos, heading, fuelRemaining: 1, targetId: null, waypointIndex: 0,
    waypoints: [[121.0, 24.8]],
  };
}

function makeThreat(id: number, pos: [number, number]): DefenseAssetInstance {
  return {
    instanceId: id, specId: 'ew-jammer', type: 'ew_jammer',
    position: pos, currentStock: 9999, maxStock: 9999, reloadTimer: 0, isActive: true,
  };
}

describe('SwarmBehavior', () => {
  const target: [number, number] = [121.0, 24.8];

  describe('waypoint mode', () => {
    it('returns heading toward target', () => {
      const drone = makeDrone(1, [120.0, 24.0]);
      const config: SwarmConfig = { ...DEFAULT_SWARM_CONFIG, algorithm: 'waypoint' };
      const result = computeSwarmVelocity(drone, [], [], target, config);
      expect(result.heading).toBeGreaterThan(0);
      expect(result.heading).toBeLessThan(90); // NE direction
      expect(result.speedMod).toBe(1.0);
    });

    it('ignores neighbors and threats', () => {
      const drone = makeDrone(1, [120.0, 24.0]);
      const neighbors = [makeDrone(2, [120.001, 24.001])];
      const threats = [makeThreat(100, [120.5, 24.5])];
      const config: SwarmConfig = { ...DEFAULT_SWARM_CONFIG, algorithm: 'waypoint' };
      const result = computeSwarmVelocity(drone, neighbors, threats, target, config);
      expect(result.speedMod).toBe(1.0);
    });
  });

  describe('boids mode', () => {
    it('separation pushes drones apart when close', () => {
      const drone = makeDrone(1, [120.0, 24.0]);
      const veryClose = makeDrone(2, [120.001, 24.0]); // ~100m east
      const config: SwarmConfig = { ...DEFAULT_SWARM_CONFIG, algorithm: 'boids', separationWeight: 5.0, targetWeight: 0.1 };
      const resultAlone = computeSwarmVelocity(drone, [], [], target, config);
      const resultWithNeighbor = computeSwarmVelocity(drone, [veryClose], [], target, config);
      // Heading should shift AWAY from the close neighbor (westward offset)
      expect(resultWithNeighbor.heading).not.toBeCloseTo(resultAlone.heading, 0);
    });

    it('cohesion pulls toward group center', () => {
      const drone = makeDrone(1, [120.0, 24.0]);
      // Group center is to the NE
      const neighbors = [
        makeDrone(2, [120.05, 24.03]),
        makeDrone(3, [120.04, 24.04]),
        makeDrone(4, [120.06, 24.02]),
      ];
      const config: SwarmConfig = { ...DEFAULT_SWARM_CONFIG, algorithm: 'boids', cohesionWeight: 5.0, separationWeight: 0.1, targetWeight: 0.1 };
      const result = computeSwarmVelocity(drone, neighbors, [], target, config);
      // Should steer somewhat NE toward group center
      expect(result.heading).toBeGreaterThan(0);
      expect(result.heading).toBeLessThan(180);
    });

    it('no neighbors produces target-only heading', () => {
      const drone = makeDrone(1, [120.0, 24.0]);
      const config: SwarmConfig = { ...DEFAULT_SWARM_CONFIG, algorithm: 'boids' };
      const result = computeSwarmVelocity(drone, [], [], target, config);
      expect(result.heading).toBeGreaterThan(0);
      expect(result.speedMod).toBeGreaterThan(0);
    });
  });

  describe('potential field mode', () => {
    it('avoids threats within detection range', () => {
      const drone = makeDrone(1, [120.5, 24.5]);
      // Place threat VERY close — 0.01° ≈ 1km, directly between drone and target
      const threat = makeThreat(100, [120.51, 24.5]);
      const targetStraightEast: [number, number] = [121.0, 24.5];
      const config: SwarmConfig = { ...DEFAULT_SWARM_CONFIG, algorithm: 'potential_field', threatAvoidanceWeight: 50.0, targetWeight: 1.0, threatDetectionKm: 30 };

      const noThreat = computeSwarmVelocity(drone, [], [], targetStraightEast, config);
      const withThreat = computeSwarmVelocity(drone, [], [threat], targetStraightEast, config);

      // At 1km with weight 50, repulsion should be significant
      const delta = Math.abs(withThreat.heading - noThreat.heading);
      expect(delta).toBeGreaterThan(0.01); // Any measurable deviation
    });

    it('ignores threats beyond detection range', () => {
      const drone = makeDrone(1, [120.0, 24.0]);
      const farThreat = makeThreat(100, [122.0, 26.0]); // Very far
      const config: SwarmConfig = { ...DEFAULT_SWARM_CONFIG, algorithm: 'potential_field', threatDetectionKm: 10 };

      const noThreat = computeSwarmVelocity(drone, [], [], target, config);
      const withFarThreat = computeSwarmVelocity(drone, [], [farThreat], target, config);

      expect(withFarThreat.heading).toBeCloseTo(noThreat.heading, 0);
    });

    it('inactive threats are ignored', () => {
      const drone = makeDrone(1, [120.5, 24.5]);
      const inactiveThreat: DefenseAssetInstance = { ...makeThreat(100, [120.6, 24.5]), isActive: false };
      const config: SwarmConfig = { ...DEFAULT_SWARM_CONFIG, algorithm: 'potential_field' };

      const result = computeSwarmVelocity(drone, [], [inactiveThreat], target, config);
      const noThreat = computeSwarmVelocity(drone, [], [], target, config);
      expect(result.heading).toBeCloseTo(noThreat.heading, 1);
    });
  });

  describe('combined mode', () => {
    it('produces valid heading in [0, 360)', () => {
      const drone = makeDrone(1, [120.0, 24.0]);
      const neighbors = [makeDrone(2, [120.01, 24.01])];
      const threats = [makeThreat(100, [120.5, 24.5])];
      const config: SwarmConfig = { ...DEFAULT_SWARM_CONFIG, algorithm: 'combined' };

      const result = computeSwarmVelocity(drone, neighbors, threats, target, config);
      expect(result.heading).toBeGreaterThanOrEqual(0);
      expect(result.heading).toBeLessThan(360);
    });

    it('speedMod is in reasonable range', () => {
      const drone = makeDrone(1, [120.0, 24.0]);
      const config: SwarmConfig = { ...DEFAULT_SWARM_CONFIG, algorithm: 'combined' };
      const result = computeSwarmVelocity(drone, [], [], target, config);
      expect(result.speedMod).toBeGreaterThanOrEqual(0.5);
      expect(result.speedMod).toBeLessThanOrEqual(1.3);
    });
  });
});
