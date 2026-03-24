import { useRef, useCallback, useEffect } from 'react';
import { useSimulationStore } from '../store/SimulationStore';
import { SimulationEngine } from './SimulationEngine';
import type { DroneSpec, DefenseAssetSpec, Scenario } from '../types';
import { SIM_TICK_SECONDS } from '../utils/constants';

// Cache for loaded catalog data
let cachedDroneSpecs: DroneSpec[] | null = null;
let cachedAssetSpecs: DefenseAssetSpec[] | null = null;

async function loadCatalog(): Promise<{ droneSpecs: DroneSpec[]; assetSpecs: DefenseAssetSpec[] }> {
  if (cachedDroneSpecs && cachedAssetSpecs) {
    return { droneSpecs: cachedDroneSpecs, assetSpecs: cachedAssetSpecs };
  }

  const res = await fetch('/data/drone-catalog.json');
  const data = await res.json();

  cachedDroneSpecs = [...data.attackDrones, ...data.defenseDrones] as DroneSpec[];
  cachedAssetSpecs = data.defenseAssets as DefenseAssetSpec[];

  return { droneSpecs: cachedDroneSpecs, assetSpecs: cachedAssetSpecs };
}

/**
 * React hook that manages the simulation lifecycle.
 *
 * Key design: The engine is created fresh each time the user presses Play.
 * This ensures that:
 * - Manually placed defense assets from the store are included
 * - The simulation can be restarted after completion
 * - Scenario changes are picked up
 */
export function useSimulation() {
  const engineRef = useRef<SimulationEngine | null>(null);
  const animFrameRef = useRef<number>(0);

  const isRunning = useSimulationStore((s) => s.isRunning);

  /**
   * Create a fresh engine from the current store state.
   * Called when simulation starts (play pressed) or restarts.
   */
  const createEngine = useCallback(async (): Promise<SimulationEngine | null> => {
    const state = useSimulationStore.getState();
    const { activeScenario, defenseAssets, facilities } = state;

    if (!activeScenario || facilities.length === 0) return null;

    const { droneSpecs, assetSpecs } = await loadCatalog();

    // Build a scenario that uses the CURRENT store defense assets
    // (which may have been modified by the user via AssetPalette)
    const scenarioWithCurrentDefenses: Scenario = {
      ...activeScenario,
      blueForce: {
        ...activeScenario.blueForce,
        assets: defenseAssets.map((a) => ({ ...a })),
      },
      facilities: facilities.map((f) => ({
        ...f,
        currentHitPoints: f.hitPoints, // Reset HP on new sim
        status: 'operational' as const,
      })),
    };

    const engine = new SimulationEngine(
      scenarioWithCurrentDefenses,
      droneSpecs,
      assetSpecs,
      Date.now() % 100000 // Vary seed each run
    );

    return engine;
  }, []);

  /**
   * Reset simulation state in the store (but keep scenario and defense placements).
   */
  const resetSimState = useCallback(() => {
    const store = useSimulationStore.getState();
    store.setIsRunning(false);
    store.setCurrentTimeSec(0);
    store.setDrones([]);
    store.setCosts({ red: 0, blue: 0 });
    store.setDronesDestroyed({ red: 0, blue: 0 });
    store.setVesselsDestroyed(0);
    // Reset facilities to full HP
    const facilities = store.facilities;
    if (facilities.length > 0) {
      store.setFacilities(
        facilities.map((f) => ({
          ...f,
          currentHitPoints: f.hitPoints,
          status: 'operational' as const,
        }))
      );
    }
    // Reset defense asset stocks
    const assets = store.defenseAssets;
    if (assets.length > 0) {
      store.setDefenseAssets(
        assets.map((a) => ({
          ...a,
          currentStock: a.maxStock,
          reloadTimer: 0,
        }))
      );
    }
    engineRef.current = null;
  }, []);

  // Expose resetSimState and seekTo on the store
  useEffect(() => {
    (useSimulationStore as any)._resetSim = resetSimState;

    // Seek to a point in time using snapshots
    (useSimulationStore as any).seekTo = (timeSec: number) => {
      const engine = engineRef.current;
      if (!engine) return;

      const snapshot = engine.getSnapshotAt(timeSec);
      if (!snapshot) return;

      // Pause sim
      useSimulationStore.getState().setIsRunning(false);

      // Restore snapshot state to store
      const store = useSimulationStore.getState();
      store.setDrones([...snapshot.drones]);
      store.setVessels([...snapshot.vessels]);
      store.setDefenseAssets([...snapshot.defenseAssets]);
      store.setFacilities([...snapshot.facilities]);
      store.setCurrentTimeSec(snapshot.timeSec);
      store.setCosts(snapshot.costs);
      store.setDronesDestroyed(snapshot.dronesDestroyed);
      store.setVesselsDestroyed(snapshot.vesselsDestroyed);
    };
  }, [resetSimState]);

  // Simulation loop: starts when isRunning becomes true
  useEffect(() => {
    if (!isRunning) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }
      return;
    }

    const startAndRun = async () => {
      // Create a fresh engine if we don't have one or if time is 0 (restart)
      if (!engineRef.current || useSimulationStore.getState().currentTimeSec === 0) {
        const engine = await createEngine();
        if (!engine) {
          useSimulationStore.getState().setIsRunning(false);
          return;
        }
        engineRef.current = engine;

        // Sync initial engine state to store
        const state = engine.getState();
        useSimulationStore.getState().setDefenseAssets([...state.defenseAssets]);
        useSimulationStore.getState().setFacilities([...state.facilities]);
      }

      let lastTime = performance.now();

      const loop = (now: number) => {
        const engine = engineRef.current;
        if (!engine || !useSimulationStore.getState().isRunning) return;

        const dt = (now - lastTime) / 1000;
        lastTime = now;

        const currentSpeed = useSimulationStore.getState().speedMultiplier;
        const ticksPerSec = currentSpeed * (1 / SIM_TICK_SECONDS);
        const ticksThisFrame = Math.max(1, Math.round(ticksPerSec * dt));
        const maxTicksPerFrame = Math.min(ticksThisFrame, 500);

        for (let i = 0; i < maxTicksPerFrame; i++) {
          if (engine.isComplete()) {
            useSimulationStore.getState().setIsRunning(false);
            break;
          }
          engine.tick();
        }

        // Sync state to store
        const state = engine.getState();
        const store = useSimulationStore.getState();
        store.setDrones([...state.drones]);
        store.setVessels([...state.vessels]);
        store.setFacilities([...state.facilities]);
        store.setDefenseAssets([...state.defenseAssets]);
        store.setCurrentTimeSec(state.currentTimeSec);
        store.setCosts(state.costs);
        store.setDronesDestroyed(state.dronesDestroyed);
        store.setVesselsDestroyed(state.vesselsDestroyed);

        animFrameRef.current = requestAnimationFrame(loop);
      };

      animFrameRef.current = requestAnimationFrame(loop);
    };

    startAndRun();

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isRunning, createEngine]);

  return { resetSimState };
}
