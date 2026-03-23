import { describe, it, expect, beforeEach } from 'vitest';
import { useSimulationStore } from '../store/SimulationStore';
import type { Facility, SimEvent } from '../types';

describe('SimulationStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useSimulationStore.getState().reset();
  });

  it('initializes with default values', () => {
    const state = useSimulationStore.getState();
    expect(state.mapStyle).toBe('satellite');
    expect(state.isRunning).toBe(false);
    expect(state.speedMultiplier).toBe(1);
    expect(state.currentTimeSec).toBe(0);
    expect(state.drones).toHaveLength(0);
    expect(state.vessels).toHaveLength(0);
    expect(state.facilities).toHaveLength(0);
    expect(state.costs).toEqual({ red: 0, blue: 0 });
    expect(state.dronesDestroyed).toEqual({ red: 0, blue: 0 });
  });

  it('sets map style', () => {
    useSimulationStore.getState().setMapStyle('terrain');
    expect(useSimulationStore.getState().mapStyle).toBe('terrain');
  });

  it('toggles running state', () => {
    useSimulationStore.getState().setIsRunning(true);
    expect(useSimulationStore.getState().isRunning).toBe(true);

    useSimulationStore.getState().setIsRunning(false);
    expect(useSimulationStore.getState().isRunning).toBe(false);
  });

  it('updates speed multiplier', () => {
    useSimulationStore.getState().setSpeedMultiplier(100);
    expect(useSimulationStore.getState().speedMultiplier).toBe(100);
  });

  it('updates current time', () => {
    useSimulationStore.getState().setCurrentTimeSec(3600);
    expect(useSimulationStore.getState().currentTimeSec).toBe(3600);
  });

  it('sets facilities', () => {
    const facilities: Facility[] = [
      {
        id: 'test-fab',
        name: 'Test Fab',
        position: [120.5, 24.0],
        radiusKm: 2,
        value: 80,
        hitPoints: 5,
        currentHitPoints: 5,
        status: 'operational',
      },
    ];
    useSimulationStore.getState().setFacilities(facilities);
    expect(useSimulationStore.getState().facilities).toHaveLength(1);
    expect(useSimulationStore.getState().facilities[0].name).toBe('Test Fab');
  });

  it('adds events', () => {
    const event: SimEvent = {
      timeSec: 100,
      type: 'launch',
      description: 'Wave 1 launched',
      position: [119.5, 24.0],
    };
    useSimulationStore.getState().addEvent(event);
    expect(useSimulationStore.getState().events).toHaveLength(1);
    expect(useSimulationStore.getState().events[0].type).toBe('launch');
  });

  it('tracks costs', () => {
    useSimulationStore.getState().setCosts({ red: 5000000, blue: 2000000 });
    expect(useSimulationStore.getState().costs.red).toBe(5000000);
    expect(useSimulationStore.getState().costs.blue).toBe(2000000);
  });

  it('tracks drone destruction counts', () => {
    useSimulationStore.getState().setDronesDestroyed({ red: 150, blue: 20 });
    expect(useSimulationStore.getState().dronesDestroyed.red).toBe(150);
    expect(useSimulationStore.getState().dronesDestroyed.blue).toBe(20);
  });

  it('resets to initial state', () => {
    // Modify various state
    useSimulationStore.getState().setIsRunning(true);
    useSimulationStore.getState().setCurrentTimeSec(5000);
    useSimulationStore.getState().setCosts({ red: 1000, blue: 2000 });

    // Reset
    useSimulationStore.getState().reset();

    const state = useSimulationStore.getState();
    expect(state.isRunning).toBe(false);
    expect(state.currentTimeSec).toBe(0);
    expect(state.costs).toEqual({ red: 0, blue: 0 });
  });
});
