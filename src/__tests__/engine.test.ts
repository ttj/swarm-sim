import { describe, it, expect, beforeEach } from 'vitest';
import { RandomStream } from '../engine/RandomStream';
import { CostTracker } from '../engine/CostTracker';
import { MovementModel } from '../engine/MovementModel';
import { CombatResolver } from '../engine/CombatResolver';
import { SimulationEngine, resetIdCounter } from '../engine/SimulationEngine';
import { distanceKm } from '../utils/geo';
import type { DroneSpec, DroneInstance, DefenseAssetSpec, DefenseAssetInstance, Facility } from '../types';

// === Test Data ===

const shahedSpec: DroneSpec = {
  id: 'shahed-136',
  name: 'Shahed-136',
  side: 'red',
  domain: 'air',
  speedKmh: 150,
  cruiseSpeedKmh: 150,
  maxRangeKm: 2500,
  enduranceMinutes: 360,
  costUSD: 30000,
  payloadKg: 40,
  guidance: 'gps',
  vulnerabilities: { ewJammable: true, radarCrossSection: 'low', irSignature: 'low' },
};

const interceptorSpec: DroneSpec = {
  id: 'interceptor-cheap',
  name: 'Interceptor',
  side: 'blue',
  domain: 'air',
  speedKmh: 200,
  cruiseSpeedKmh: 160,
  maxRangeKm: 20,
  enduranceMinutes: 30,
  costUSD: 2000,
  payloadKg: 1,
  guidance: 'gps',
  vulnerabilities: { ewJammable: true, radarCrossSection: 'low', irSignature: 'low' },
};

const ewJammerAssetSpec: DefenseAssetSpec = {
  id: 'ew-jammer',
  name: 'EW Jammer',
  type: 'ew_jammer',
  rangeKm: 15,
  costPerUseUSD: 0,
  fixedCostUSD: 3000000,
  capacity: 9999,
  reloadTimeMinutes: 0,
  pkill: 0.5,
};

const interceptorAssetSpec: DefenseAssetSpec = {
  id: 'interceptor-squad',
  name: 'Interceptor Squad',
  type: 'interceptor_squad',
  rangeKm: 20,
  costPerUseUSD: 2000,
  fixedCostUSD: 100000,
  capacity: 50,
  reloadTimeMinutes: 0,
  pkill: 0.7,
};

const testFacility: Facility = {
  id: 'tsmc-hsinchu',
  name: 'TSMC Hsinchu',
  position: [120.99, 24.80],
  radiusKm: 2.5,
  value: 100,
  hitPoints: 5,
  currentHitPoints: 5,
  status: 'operational',
};

// === RandomStream Tests ===

describe('RandomStream', () => {
  it('produces deterministic output for same seed', () => {
    const r1 = new RandomStream(123);
    const r2 = new RandomStream(123);
    for (let i = 0; i < 100; i++) {
      expect(r1.next()).toBe(r2.next());
    }
  });

  it('produces different output for different seeds', () => {
    const r1 = new RandomStream(1);
    const r2 = new RandomStream(2);
    const v1 = r1.next();
    const v2 = r2.next();
    expect(v1).not.toBe(v2);
  });

  it('next() returns values in [0, 1)', () => {
    const r = new RandomStream(42);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextInt returns values in [min, max]', () => {
    const r = new RandomStream(42);
    for (let i = 0; i < 1000; i++) {
      const v = r.nextInt(5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(10);
    }
  });

  it('chance returns booleans', () => {
    const r = new RandomStream(42);
    let trues = 0;
    const n = 10000;
    for (let i = 0; i < n; i++) {
      if (r.chance(0.5)) trues++;
    }
    // Should be roughly 50% within statistical tolerance
    expect(trues / n).toBeCloseTo(0.5, 1);
  });

  it('shuffle produces all elements', () => {
    const r = new RandomStream(42);
    const arr = [1, 2, 3, 4, 5];
    const shuffled = r.shuffle([...arr]);
    expect(shuffled).toHaveLength(5);
    expect(shuffled.sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

// === CostTracker Tests ===

describe('CostTracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  it('starts at zero', () => {
    expect(tracker.getCosts()).toEqual({ red: 0, blue: 0 });
    expect(tracker.getDronesDestroyed()).toEqual({ red: 0, blue: 0 });
  });

  it('tracks costs per side', () => {
    tracker.addCost('red', 30000);
    tracker.addCost('blue', 2000);
    tracker.addCost('red', 30000);
    expect(tracker.getCosts()).toEqual({ red: 60000, blue: 2000 });
  });

  it('tracks drone destruction', () => {
    tracker.addDroneDestroyed('red');
    tracker.addDroneDestroyed('red');
    tracker.addDroneDestroyed('blue');
    expect(tracker.getDronesDestroyed()).toEqual({ red: 2, blue: 1 });
  });

  it('calculates CER', () => {
    tracker.addCost('blue', 100000);
    tracker.addDroneDestroyed('red');
    tracker.addDroneDestroyed('red');
    expect(tracker.getCER()).toBe(50000);
  });

  it('CER is 0 when no drones destroyed', () => {
    tracker.addCost('blue', 100000);
    expect(tracker.getCER()).toBe(0);
  });

  it('resets to zero', () => {
    tracker.addCost('red', 100000);
    tracker.addDroneDestroyed('red');
    tracker.reset();
    expect(tracker.getCosts()).toEqual({ red: 0, blue: 0 });
    expect(tracker.getDronesDestroyed()).toEqual({ red: 0, blue: 0 });
  });
});

// === MovementModel Tests ===

describe('MovementModel', () => {
  let model: MovementModel;

  beforeEach(() => {
    model = new MovementModel([shahedSpec]);
  });

  it('moves drone toward waypoint', () => {
    const drone: DroneInstance = {
      instanceId: 1,
      specId: 'shahed-136',
      side: 'red',
      state: 'transit',
      position: [119.3, 24.5],
      heading: 90,
      fuelRemaining: 1.0,
      targetId: null,
      waypointIndex: 0,
      waypoints: [[120.99, 24.80]],
    };

    const origDist = distanceKm(drone.position, drone.waypoints[0]);
    model.updateDrone(drone);
    const newDist = distanceKm(drone.position, drone.waypoints[0]);

    expect(newDist).toBeLessThan(origDist);
  });

  it('consumes fuel each tick', () => {
    const drone: DroneInstance = {
      instanceId: 1,
      specId: 'shahed-136',
      side: 'red',
      state: 'transit',
      position: [119.3, 24.5],
      heading: 90,
      fuelRemaining: 1.0,
      targetId: null,
      waypointIndex: 0,
      waypoints: [[120.99, 24.80]],
    };

    model.updateDrone(drone);
    expect(drone.fuelRemaining).toBeLessThan(1.0);
    expect(drone.fuelRemaining).toBeGreaterThan(0);
  });

  it('destroys drone when fuel runs out', () => {
    const drone: DroneInstance = {
      instanceId: 1,
      specId: 'shahed-136',
      side: 'red',
      state: 'transit',
      position: [119.3, 24.5],
      heading: 90,
      fuelRemaining: 0.0001, // Nearly empty
      targetId: null,
      waypointIndex: 0,
      waypoints: [[120.99, 24.80]],
    };

    model.updateDrone(drone);
    expect(drone.state).toBe('destroyed');
  });

  it('does not move destroyed drones', () => {
    const drone: DroneInstance = {
      instanceId: 1,
      specId: 'shahed-136',
      side: 'red',
      state: 'destroyed',
      position: [119.3, 24.5],
      heading: 90,
      fuelRemaining: 1.0,
      targetId: null,
      waypointIndex: 0,
      waypoints: [[120.99, 24.80]],
    };

    const origPos = [...drone.position];
    model.updateDrone(drone);
    expect(drone.position[0]).toBe(origPos[0]);
    expect(drone.position[1]).toBe(origPos[1]);
  });

  it('returns true when drone reaches final waypoint', () => {
    const drone: DroneInstance = {
      instanceId: 1,
      specId: 'shahed-136',
      side: 'red',
      state: 'transit',
      position: [120.989, 24.800], // ~0.1km from target, within one tick distance
      heading: 90,
      fuelRemaining: 1.0,
      targetId: null,
      waypointIndex: 0,
      waypoints: [[120.99, 24.80]],
    };

    const reached = model.updateDrone(drone);
    expect(reached).toBe(true);
  });

  it('updateAll returns ids of drones that reached targets', () => {
    const drones: DroneInstance[] = [
      {
        instanceId: 1,
        specId: 'shahed-136',
        side: 'red',
        state: 'transit',
        position: [120.989, 24.800], // Very close, within one tick
        heading: 90,
        fuelRemaining: 1.0,
        targetId: null,
        waypointIndex: 0,
        waypoints: [[120.99, 24.80]],
      },
      {
        instanceId: 2,
        specId: 'shahed-136',
        side: 'red',
        state: 'transit',
        position: [119.3, 24.5], // Far away
        heading: 90,
        fuelRemaining: 1.0,
        targetId: null,
        waypointIndex: 0,
        waypoints: [[120.99, 24.80]],
      },
    ];

    const reached = model.updateAll(drones);
    expect(reached).toContain(1);
    expect(reached).not.toContain(2);
  });
});

// === CombatResolver Tests ===

describe('CombatResolver', () => {
  let costTracker: CostTracker;

  beforeEach(() => {
    costTracker = new CostTracker();
  });

  it('engages drones within range', () => {
    const resolver = new CombatResolver(
      [shahedSpec],
      [interceptorAssetSpec],
      costTracker,
      42
    );

    const drones: DroneInstance[] = [{
      instanceId: 1,
      specId: 'shahed-136',
      side: 'red',
      state: 'transit',
      position: [120.90, 24.80], // Within 20km of asset
      heading: 90,
      fuelRemaining: 1.0,
      targetId: null,
      waypointIndex: 0,
      waypoints: [[120.99, 24.80]],
    }];

    const assets: DefenseAssetInstance[] = [{
      instanceId: 100,
      specId: 'interceptor-squad',
      type: 'interceptor_squad',
      position: [120.85, 24.80],
      currentStock: 50,
      maxStock: 50,
      reloadTimer: 0,
      isActive: true,
    }];

    // Run many ticks to statistically verify engagements happen
    let events: { type: string }[] = [];
    for (let i = 0; i < 100; i++) {
      // Reset drone state for each iteration
      drones[0].state = 'transit';
      assets[0].currentStock = 50;

      const result = resolver.resolve(drones, assets, [testFacility], {
        gpsJammingActive: false,
        currentTimeSec: i * 10,
        c2DamageLevel: 0,
      });
      events = events.concat(result);
    }

    // Should have some intercepts and some misses
    const intercepts = events.filter((e) => e.type === 'intercept');
    const misses = events.filter((e) => e.type === 'miss');
    expect(intercepts.length).toBeGreaterThan(0);
    expect(intercepts.length + misses.length).toBe(100);
  });

  it('does not engage drones out of range', () => {
    const resolver = new CombatResolver(
      [shahedSpec],
      [interceptorAssetSpec],
      costTracker,
      42
    );

    const drones: DroneInstance[] = [{
      instanceId: 1,
      specId: 'shahed-136',
      side: 'red',
      state: 'transit',
      position: [119.0, 24.0], // Far away, well outside 20km
      heading: 90,
      fuelRemaining: 1.0,
      targetId: null,
      waypointIndex: 0,
      waypoints: [[120.99, 24.80]],
    }];

    const assets: DefenseAssetInstance[] = [{
      instanceId: 100,
      specId: 'interceptor-squad',
      type: 'interceptor_squad',
      position: [120.85, 24.80],
      currentStock: 50,
      maxStock: 50,
      reloadTimer: 0,
      isActive: true,
    }];

    const events = resolver.resolve(drones, assets, [testFacility], {
      gpsJammingActive: false,
      currentTimeSec: 0,
      c2DamageLevel: 0,
    });

    expect(events).toHaveLength(0);
  });

  it('consumes stock on engagement', () => {
    const resolver = new CombatResolver(
      [shahedSpec],
      [interceptorAssetSpec],
      costTracker,
      42
    );

    const drones: DroneInstance[] = [{
      instanceId: 1,
      specId: 'shahed-136',
      side: 'red',
      state: 'transit',
      position: [120.90, 24.80],
      heading: 90,
      fuelRemaining: 1.0,
      targetId: null,
      waypointIndex: 0,
      waypoints: [[120.99, 24.80]],
    }];

    const assets: DefenseAssetInstance[] = [{
      instanceId: 100,
      specId: 'interceptor-squad',
      type: 'interceptor_squad',
      position: [120.85, 24.80],
      currentStock: 50,
      maxStock: 50,
      reloadTimer: 0,
      isActive: true,
    }];

    resolver.resolve(drones, assets, [testFacility], {
      gpsJammingActive: false,
      currentTimeSec: 0,
      c2DamageLevel: 0,
    });

    expect(assets[0].currentStock).toBe(49);
  });

  it('EW jammer only engages jammable drones', () => {
    const nonJammableSpec: DroneSpec = {
      ...shahedSpec,
      id: 'autonomous-strike',
      guidance: 'autonomous_vision',
      vulnerabilities: { ewJammable: false, radarCrossSection: 'low', irSignature: 'low' },
    };

    const resolver = new CombatResolver(
      [nonJammableSpec],
      [ewJammerAssetSpec],
      costTracker,
      42
    );

    const drones: DroneInstance[] = [{
      instanceId: 1,
      specId: 'autonomous-strike',
      side: 'red',
      state: 'transit',
      position: [120.90, 24.80],
      heading: 90,
      fuelRemaining: 1.0,
      targetId: null,
      waypointIndex: 0,
      waypoints: [[120.99, 24.80]],
    }];

    const assets: DefenseAssetInstance[] = [{
      instanceId: 100,
      specId: 'ew-jammer',
      type: 'ew_jammer',
      position: [120.85, 24.80],
      currentStock: 9999,
      maxStock: 9999,
      reloadTimer: 0,
      isActive: true,
    }];

    const events = resolver.resolve(drones, assets, [testFacility], {
      gpsJammingActive: false,
      currentTimeSec: 0,
      c2DamageLevel: 0,
    });

    // EW jammer should NOT engage autonomous drones
    expect(events).toHaveLength(0);
  });

  it('resolves facility hits correctly', () => {
    const resolver = new CombatResolver(
      [shahedSpec],
      [],
      costTracker,
      42
    );

    const facility: Facility = { ...testFacility, currentHitPoints: 2 };

    const drones: DroneInstance[] = [{
      instanceId: 1,
      specId: 'shahed-136',
      side: 'red',
      state: 'transit',
      position: [120.99, 24.80], // At facility
      heading: 0,
      fuelRemaining: 1.0,
      targetId: null,
      waypointIndex: 0,
      waypoints: [],
    }];

    const events = resolver.resolveFacilityHits([1], drones, [facility], 100);

    expect(events).toHaveLength(1);
    expect(facility.currentHitPoints).toBe(1);
    expect(facility.status).toBe('damaged');
    expect(drones[0].state).toBe('destroyed');
  });

  it('destroys facility when HP reaches 0', () => {
    const resolver = new CombatResolver(
      [shahedSpec],
      [],
      costTracker,
      42
    );

    const facility: Facility = { ...testFacility, currentHitPoints: 1 };
    const drones: DroneInstance[] = [{
      instanceId: 1,
      specId: 'shahed-136',
      side: 'red',
      state: 'transit',
      position: [120.99, 24.80],
      heading: 0,
      fuelRemaining: 1.0,
      targetId: null,
      waypointIndex: 0,
      waypoints: [],
    }];

    const events = resolver.resolveFacilityHits([1], drones, [facility], 100);

    expect(facility.currentHitPoints).toBe(0);
    expect(facility.status).toBe('destroyed');
    expect(events[0].type).toBe('facility_destroyed');
  });
});

// === SimulationEngine Integration Tests ===

describe('SimulationEngine', () => {
  const droneSpecs = [shahedSpec, interceptorSpec];
  const assetSpecs = [interceptorAssetSpec, ewJammerAssetSpec];

  function createTestScenario(): ReturnType<typeof import('../types')['Scenario']> & any {
    return {
      id: 'test',
      name: 'Test Scenario',
      description: 'Test',
      durationHours: 4,
      redForce: {
        conventionalStrikes: [],
        vessels: [],
        quarantineFormation: 'arc' as const,
        airWaves: [{
          id: 'wave-1',
          launchTimeMinutes: 1, // Launch at 1 minute
          droneSpec: 'shahed-136',
          count: 10,
          origin: [119.3, 24.5] as [number, number],
          target: 'tsmc-hsinchu',
          approachBearing: 90,
          formation: 'dispersed',
        }],
        seaLaunchedWaves: [],
        uuvDeployment: { count: 0, mineTargets: [] },
        strategy: 'saturation_rush' as const,
        totalBudgetUSD: 300000,
        gpsJammingActive: false,
        ewCapability: 'none' as const,
      },
      blueForce: {
        assets: [{
          instanceId: 100,
          specId: 'interceptor-squad',
          type: 'interceptor_squad' as const,
          position: [120.85, 24.80] as [number, number],
          currentStock: 20,
          maxStock: 20,
          reloadTimer: 0,
          isActive: true,
        }],
        totalBudgetUSD: 1000000,
        alliedSupport: { enabled: false, carrierStrikeGroup: false, submarineSupport: false, ewSupport: false },
        c2Resilience: 'distributed' as const,
        productionRate: 50,
      },
      facilities: [{ ...testFacility }],
      environment: {
        windSpeedKmh: 15,
        windBearing: 270,
        visibility: 'clear' as const,
        timeOfDay: 'day' as const,
        seaState: 2 as const,
      },
    };
  }

  beforeEach(() => {
    resetIdCounter();
  });

  it('initializes with correct state', () => {
    const scenario = createTestScenario();
    const engine = new SimulationEngine(scenario, droneSpecs, assetSpecs);

    const state = engine.getState();
    expect(state.currentTimeSec).toBe(0);
    expect(state.drones).toHaveLength(0); // No drones yet (wave at 1 min)
    expect(state.facilities).toHaveLength(1);
    expect(state.facilities[0].status).toBe('operational');
  });

  it('launches wave at correct time', () => {
    const scenario = createTestScenario();
    const engine = new SimulationEngine(scenario, droneSpecs, assetSpecs);

    // Tick until 1 minute (6 ticks at 10s each)
    for (let i = 0; i < 7; i++) {
      engine.tick();
    }

    const state = engine.getState();
    expect(state.drones.length).toBe(10);
    expect(state.drones[0].side).toBe('red');
    expect(state.drones[0].state).toBe('transit');
  });

  it('drones move toward target over time', () => {
    const scenario = createTestScenario();
    const engine = new SimulationEngine(scenario, droneSpecs, assetSpecs);

    // Launch wave
    for (let i = 0; i < 7; i++) engine.tick();

    const state1 = engine.getState();
    const drone = state1.drones[0];
    const origDist = distanceKm(drone.position, testFacility.position);

    // Run 100 more ticks
    for (let i = 0; i < 100; i++) engine.tick();

    const state2 = engine.getState();
    const movedDrone = state2.drones[0];
    if (movedDrone.state === 'transit') {
      const newDist = distanceKm(movedDrone.position, testFacility.position);
      expect(newDist).toBeLessThan(origDist);
    }
    // If destroyed, that's also valid (intercepted)
  });

  it('reports completion when all waves done and no active drones', () => {
    const scenario = createTestScenario();
    const engine = new SimulationEngine(scenario, droneSpecs, assetSpecs);

    expect(engine.isComplete()).toBe(false);

    // Run enough ticks for all drones to either reach target or be destroyed
    // At 150km/h with ~180km to travel: ~1.2 hours = 432 ticks
    for (let i = 0; i < 500; i++) {
      engine.tick();
      if (engine.isComplete()) break;
    }

    expect(engine.isComplete()).toBe(true);
  });

  it('tracks costs through simulation', () => {
    const scenario = createTestScenario();
    const engine = new SimulationEngine(scenario, droneSpecs, assetSpecs);

    // Run until wave launches and some engagement happens
    for (let i = 0; i < 500; i++) {
      engine.tick();
      if (engine.isComplete()) break;
    }

    const state = engine.getState();
    // Red should have spent on launching drones
    expect(state.costs.red).toBeGreaterThan(0);
  });
});
