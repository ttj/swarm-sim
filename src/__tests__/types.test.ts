import { describe, it, expect } from 'vitest';
import type {
  DroneSpec,
  DroneInstance,
  VesselSpec,
  DefenseAssetSpec,
  Facility,
  Scenario,
} from '../types';

/**
 * Type validation tests - ensure our data model is correct and
 * the JSON data files conform to the types.
 */
describe('type validation', () => {
  it('DroneSpec has all required fields', () => {
    const spec: DroneSpec = {
      id: 'shahed-136',
      name: 'Shahed-136',
      side: 'red',
      domain: 'air',
      speedKmh: 185,
      cruiseSpeedKmh: 150,
      maxRangeKm: 2500,
      enduranceMinutes: 360,
      costUSD: 30000,
      payloadKg: 40,
      guidance: 'gps',
      vulnerabilities: {
        ewJammable: true,
        radarCrossSection: 'low',
        irSignature: 'low',
      },
    };
    expect(spec.id).toBe('shahed-136');
    expect(spec.guidance).toBe('gps');
    expect(spec.vulnerabilities.ewJammable).toBe(true);
  });

  it('DroneInstance has correct state types', () => {
    const instance: DroneInstance = {
      instanceId: 1,
      specId: 'shahed-136',
      side: 'red',
      state: 'transit',
      position: [119.5, 24.0],
      heading: 90,
      fuelRemaining: 1.0,
      targetId: null,
      waypointIndex: 0,
      waypoints: [[120.5, 24.0]],
    };
    expect(instance.state).toBe('transit');
    expect(instance.fuelRemaining).toBe(1.0);
  });

  it('VesselSpec has maritime-specific fields', () => {
    const spec: VesselSpec = {
      id: 'fishing-militia',
      name: 'Fishing Militia Vessel',
      side: 'red',
      type: 'fishing_militia',
      speedKnots: 12,
      droneCapacity: 3,
      droneSpecCarried: 'fpv-kamikaze',
      armorClass: 'none',
      costUSD: 100000,
    };
    expect(spec.droneCapacity).toBe(3);
    expect(spec.type).toBe('fishing_militia');
  });

  it('DefenseAssetSpec has combat parameters', () => {
    const spec: DefenseAssetSpec = {
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
    expect(spec.pkill).toBe(0.5);
    expect(spec.costPerUseUSD).toBe(0);
  });

  it('Facility tracks hit points and status', () => {
    const facility: Facility = {
      id: 'tsmc-hsinchu',
      name: 'TSMC Hsinchu',
      position: [120.99, 24.80],
      radiusKm: 2.5,
      value: 100,
      hitPoints: 5,
      currentHitPoints: 3,
      status: 'damaged',
    };
    expect(facility.currentHitPoints).toBeLessThan(facility.hitPoints);
    expect(facility.status).toBe('damaged');
  });

  it('drone-catalog.json is loadable and valid', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const catalogPath = path.resolve(__dirname, '../../public/data/drone-catalog.json');
    const data = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));

    expect(data.attackDrones).toBeDefined();
    expect(data.defenseDrones).toBeDefined();
    expect(data.defenseAssets).toBeDefined();
    expect(data.vessels).toBeDefined();

    // Validate a Shahed entry
    const shahed = data.attackDrones.find((d: DroneSpec) => d.id === 'shahed-136');
    expect(shahed).toBeDefined();
    expect(shahed.costUSD).toBeGreaterThanOrEqual(20000);
    expect(shahed.costUSD).toBeLessThanOrEqual(50000);
    expect(shahed.speedKmh).toBeGreaterThan(100);
    expect(shahed.guidance).toBe('gps');
  });

  it('taiwan-facilities.json is loadable and valid', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const facilityPath = path.resolve(__dirname, '../../public/data/taiwan-facilities.json');
    const data = JSON.parse(fs.readFileSync(facilityPath, 'utf-8'));

    expect(data.facilities).toHaveLength(4); // 4 TSMC fabs
    expect(data.ports).toBeDefined();
    expect(data.geography).toBeDefined();

    // Validate Hsinchu
    const hsinchu = data.facilities.find((f: Facility) => f.id === 'tsmc-hsinchu');
    expect(hsinchu).toBeDefined();
    expect(hsinchu.value).toBe(100);
    expect(hsinchu.position[0]).toBeCloseTo(120.99, 1);
    expect(hsinchu.position[1]).toBeCloseTo(24.80, 1);
  });
});
