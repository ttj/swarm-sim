import { create } from 'zustand';
import type { MapStyle, Scenario, SimEvent, DroneInstance, VesselInstance, DefenseAssetInstance, Facility } from '../types';
import type { AggregateResults } from '../engine/HeadlessRunner';

interface SimulationStore {
  // Map state
  mapStyle: MapStyle;
  setMapStyle: (style: MapStyle) => void;

  // Simulation state
  isRunning: boolean;
  speedMultiplier: number;
  currentTimeSec: number;

  // Entities
  drones: DroneInstance[];
  vessels: VesselInstance[];
  defenseAssets: DefenseAssetInstance[];
  facilities: Facility[];
  events: SimEvent[];

  // Costs
  costs: { red: number; blue: number };
  dronesDestroyed: { red: number; blue: number };
  vesselsDestroyed: number;

  // Active scenario
  activeScenario: Scenario | null;

  // Monte Carlo analysis (persists across tab switches)
  mcIsRunning: boolean;
  mcProgress: number;
  mcResults: AggregateResults | null;
  setMcIsRunning: (running: boolean) => void;
  setMcProgress: (progress: number) => void;
  setMcResults: (results: AggregateResults | null) => void;

  // Actions
  setIsRunning: (running: boolean) => void;
  setSpeedMultiplier: (speed: number) => void;
  setCurrentTimeSec: (time: number) => void;
  setDrones: (drones: DroneInstance[]) => void;
  setVessels: (vessels: VesselInstance[]) => void;
  setDefenseAssets: (assets: DefenseAssetInstance[]) => void;
  setFacilities: (facilities: Facility[]) => void;
  addEvent: (event: SimEvent) => void;
  setActiveScenario: (scenario: Scenario | null) => void;
  setCosts: (costs: { red: number; blue: number }) => void;
  setDronesDestroyed: (counts: { red: number; blue: number }) => void;
  setVesselsDestroyed: (count: number) => void;
  reset: () => void;
}

const initialState = {
  mapStyle: 'satellite' as MapStyle,
  isRunning: false,
  speedMultiplier: 1,
  currentTimeSec: 0,
  drones: [] as DroneInstance[],
  vessels: [] as VesselInstance[],
  defenseAssets: [] as DefenseAssetInstance[],
  facilities: [] as Facility[],
  events: [] as SimEvent[],
  costs: { red: 0, blue: 0 },
  dronesDestroyed: { red: 0, blue: 0 },
  vesselsDestroyed: 0,
  activeScenario: null as Scenario | null,
  mcIsRunning: false,
  mcProgress: 0,
  mcResults: null as AggregateResults | null,
};

export const useSimulationStore = create<SimulationStore>((set) => ({
  ...initialState,

  setMapStyle: (style) => set({ mapStyle: style }),
  setIsRunning: (running) => set({ isRunning: running }),
  setSpeedMultiplier: (speed) => set({ speedMultiplier: speed }),
  setCurrentTimeSec: (time) => set({ currentTimeSec: time }),
  setDrones: (drones) => set({ drones }),
  setVessels: (vessels) => set({ vessels }),
  setDefenseAssets: (assets) => set({ defenseAssets: assets }),
  setFacilities: (facilities) => set({ facilities }),
  addEvent: (event) => set((state) => ({ events: [...state.events, event] })),
  setActiveScenario: (scenario) => set({ activeScenario: scenario }),
  setCosts: (costs) => set({ costs }),
  setDronesDestroyed: (counts) => set({ dronesDestroyed: counts }),
  setVesselsDestroyed: (count) => set({ vesselsDestroyed: count }),
  setMcIsRunning: (running) => set({ mcIsRunning: running }),
  setMcProgress: (progress) => set({ mcProgress: progress }),
  setMcResults: (results) => set({ mcResults: results }),
  reset: () => set(initialState),
}));
