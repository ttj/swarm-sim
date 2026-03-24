import type { DroneInstance, VesselInstance, DefenseAssetInstance, Facility } from '../types';

/**
 * A lightweight snapshot of simulation state at a point in time.
 * Used for timeline scrubbing / replay.
 */
export interface SimSnapshot {
  timeSec: number;
  drones: DroneInstance[];
  vessels: VesselInstance[];
  defenseAssets: DefenseAssetInstance[];
  facilities: Facility[];
  costs: { red: number; blue: number };
  dronesDestroyed: { red: number; blue: number };
  vesselsDestroyed: number;
}

/**
 * Stores periodic snapshots during simulation.
 * Snapshots taken every INTERVAL ticks (~60 ticks = 10 sim-minutes).
 */
export class SnapshotStore {
  private snapshots: SimSnapshot[] = [];
  private tickCounter = 0;
  private readonly interval: number;

  constructor(intervalTicks: number = 60) {
    this.interval = intervalTicks;
  }

  /** Called each tick. Captures a snapshot if due. */
  maybeTakeSnapshot(state: {
    currentTimeSec: number;
    drones: DroneInstance[];
    vessels: VesselInstance[];
    defenseAssets: DefenseAssetInstance[];
    facilities: Facility[];
    costs: { red: number; blue: number };
    dronesDestroyed: { red: number; blue: number };
    vesselsDestroyed: number;
  }): void {
    this.tickCounter++;
    if (this.tickCounter % this.interval !== 0) return;

    // Deep-copy arrays for the snapshot (only active drones to save memory)
    this.snapshots.push({
      timeSec: state.currentTimeSec,
      drones: state.drones
        .filter((d) => d.state !== 'destroyed' && d.state !== 'captured')
        .map((d) => ({ ...d, position: [...d.position] as [number, number], waypoints: d.waypoints.map((w) => [...w] as [number, number]) })),
      vessels: state.vessels.map((v) => ({ ...v, position: [...v.position] as [number, number] })),
      defenseAssets: state.defenseAssets.map((a) => ({ ...a, position: [...a.position] as [number, number] })),
      facilities: state.facilities.map((f) => ({ ...f, position: [...f.position] as [number, number] })),
      costs: { ...state.costs },
      dronesDestroyed: { ...state.dronesDestroyed },
      vesselsDestroyed: state.vesselsDestroyed,
    });
  }

  /** Get all snapshots */
  getSnapshots(): SimSnapshot[] {
    return this.snapshots;
  }

  /** Find the nearest snapshot to a given time */
  getSnapshotAt(timeSec: number): SimSnapshot | null {
    if (this.snapshots.length === 0) return null;

    let best = this.snapshots[0];
    let bestDist = Math.abs(best.timeSec - timeSec);

    for (const snap of this.snapshots) {
      const dist = Math.abs(snap.timeSec - timeSec);
      if (dist < bestDist) {
        best = snap;
        bestDist = dist;
      }
    }

    return best;
  }

  /** Clear all snapshots */
  clear(): void {
    this.snapshots = [];
    this.tickCounter = 0;
  }

  get count(): number {
    return this.snapshots.length;
  }
}
