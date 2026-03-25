/**
 * Turn-based wargame engine with fog of war.
 *
 * Each turn = 1 simulated hour. Players alternate:
 * 1. Blue places/moves defenses, allocates interceptors
 * 2. Red launches waves, positions vessels, toggles GPS jamming
 * 3. Engine simulates 1 hour (360 ticks at 10s each)
 * 4. Each side sees only what their sensors detect
 */

import type {
  Scenario, DroneSpec, DefenseAssetSpec, Facility,
  DefenseAssetInstance, DroneInstance, VesselInstance, Side,
} from '../types';
import { SimulationEngine, resetIdCounter } from './SimulationEngine';
import { distanceKm } from '../utils/geo';

export interface WargameTurn {
  turnNumber: number;
  phase: 'blue_plan' | 'red_plan' | 'resolve' | 'review';
  currentSide: Side | null;
}

export interface WargameMove {
  side: Side;
  type: 'launch_wave' | 'place_defense' | 'move_defense' | 'toggle_jamming' | 'end_turn';
  data?: any;
}

export interface WargameState {
  turn: WargameTurn;
  totalTurns: number; // e.g., 24 turns = 1 day
  blueScore: number;
  redScore: number;
  facilitiesStatus: { id: string; status: string; hp: number }[];
  // What each side can see (fog of war filtered)
  blueVisibleDrones: DroneInstance[];
  redVisibleDefenses: DefenseAssetInstance[];
  // Full state (for review phase)
  allDrones: DroneInstance[];
  allVessels: VesselInstance[];
  allDefenses: DefenseAssetInstance[];
  allFacilities: Facility[];
  costs: { red: number; blue: number };
  dronesDestroyed: { red: number; blue: number };
  log: string[];
  gameOver: boolean;
  winner: Side | 'draw' | null;
}

// Detection ranges for blue sensors
const BLUE_RADAR_RANGE_KM = 80;
const BLUE_EW_DETECT_RANGE_KM = 20; // EW jammers also detect within their range

// Red intelligence (knows facility locations, can see own forces)
const RED_INTEL_RANGE_KM = 0; // Red can't see blue defenses (fog of war)

/**
 * Filter drones to only those detectable by blue's sensors.
 */
function filterForBlue(
  drones: DroneInstance[],
  defenseAssets: DefenseAssetInstance[],
  facilities: Facility[],
): DroneInstance[] {
  // Blue can detect red drones within radar range of any facility or defense asset
  const detectionPoints: [number, number][] = [
    ...facilities.map((f) => f.position),
    ...defenseAssets.filter((a) => a.isActive).map((a) => a.position),
  ];

  return drones.filter((d) => {
    if (d.side === 'blue') return true; // Always see own drones
    if (d.state === 'destroyed' || d.state === 'captured') return false;

    // Check if within detection range of any sensor
    for (const point of detectionPoints) {
      const dist = distanceKm(point, d.position);
      if (dist <= BLUE_RADAR_RANGE_KM) return true;
    }
    return false;
  });
}

/**
 * Filter defenses visible to red (fog of war — red has limited intel).
 */
function filterForRed(
  defenseAssets: DefenseAssetInstance[],
): DefenseAssetInstance[] {
  // Red can only see defenses that have engaged (revealed by firing)
  // For simplicity: red sees nothing until defenses fire
  // In future: add reconnaissance drones for red
  return [];
}

export class WargameEngine {
  private scenario: Scenario;
  private droneSpecs: DroneSpec[];
  private assetSpecs: DefenseAssetSpec[];
  private state: WargameState;
  private pendingRedWaves: { droneSpec: string; count: number; target: string; origin: [number, number] }[] = [];
  private gpsJamming = false;
  private seed: number;

  constructor(
    scenario: Scenario,
    droneSpecs: DroneSpec[],
    assetSpecs: DefenseAssetSpec[],
    totalTurns: number = 24,
    seed: number = 42,
  ) {
    this.scenario = scenario;
    this.droneSpecs = droneSpecs;
    this.assetSpecs = assetSpecs;
    this.seed = seed;

    this.state = {
      turn: { turnNumber: 1, phase: 'blue_plan', currentSide: 'blue' },
      totalTurns,
      blueScore: 0,
      redScore: 0,
      facilitiesStatus: scenario.facilities.map((f) => ({
        id: f.id, status: f.status, hp: f.hitPoints,
      })),
      blueVisibleDrones: [],
      redVisibleDefenses: [],
      allDrones: [],
      allVessels: [],
      allDefenses: scenario.blueForce.assets.map((a) => ({ ...a })),
      allFacilities: scenario.facilities.map((f) => ({ ...f })),
      costs: { red: 0, blue: 0 },
      dronesDestroyed: { red: 0, blue: 0 },
      log: [`=== WARGAME START: ${totalTurns} turns ===`],
      gameOver: false,
      winner: null,
    };
  }

  getState(): WargameState {
    return this.state;
  }

  /** Blue submits their turn: defense placements are already in state */
  submitBlueTurn(): void {
    if (this.state.turn.phase !== 'blue_plan') return;
    this.state.log.push(`Turn ${this.state.turn.turnNumber}: Blue completes planning`);
    this.state.turn.phase = 'red_plan';
    this.state.turn.currentSide = 'red';
  }

  /** Red queues an attack wave for this turn */
  queueRedWave(droneSpec: string, count: number, target: string, origin: [number, number]): void {
    if (this.state.turn.phase !== 'red_plan') return;
    this.pendingRedWaves.push({ droneSpec, count, target, origin });
    this.state.log.push(`Turn ${this.state.turn.turnNumber}: Red queues ${count} ${droneSpec} at ${target}`);
  }

  /** Red toggles GPS jamming */
  setGpsJamming(on: boolean): void {
    this.gpsJamming = on;
    this.state.log.push(`Turn ${this.state.turn.turnNumber}: Red ${on ? 'activates' : 'deactivates'} GPS jamming`);
  }

  /** Red submits their turn, triggers resolution */
  submitRedTurn(): void {
    if (this.state.turn.phase !== 'red_plan') return;
    this.state.log.push(`Turn ${this.state.turn.turnNumber}: Red completes planning — resolving...`);
    this.state.turn.phase = 'resolve';
    this.resolveTurn();
  }

  /** Resolve one turn (1 simulated hour = 360 ticks) */
  private resolveTurn(): void {
    resetIdCounter();

    // Build a mini-scenario for this turn's hour
    const turnScenario: Scenario = {
      ...this.scenario,
      durationHours: 1,
      redForce: {
        ...this.scenario.redForce,
        gpsJammingActive: this.gpsJamming,
        airWaves: this.pendingRedWaves.map((w, i) => ({
          id: `turn${this.state.turn.turnNumber}-w${i}`,
          launchTimeMinutes: 2 + i * 3,
          droneSpec: w.droneSpec,
          count: w.count,
          origin: w.origin,
          target: w.target,
          approachBearing: 90,
          formation: 'dispersed' as const,
        })),
        seaLaunchedWaves: [],
        conventionalStrikes: [],
        vessels: [],
      },
      blueForce: {
        ...this.scenario.blueForce,
        assets: this.state.allDefenses.map((a) => ({ ...a })),
      },
      facilities: this.state.allFacilities.map((f) => ({ ...f })),
    };

    // Run 1-hour simulation
    const engine = new SimulationEngine(
      turnScenario, this.droneSpecs, this.assetSpecs, this.seed + this.state.turn.turnNumber
    );

    const TICKS_PER_HOUR = 360;
    for (let i = 0; i < TICKS_PER_HOUR; i++) {
      if (engine.isComplete()) break;
      engine.tick();
    }

    const result = engine.getState();

    // Update cumulative state
    this.state.allDrones = result.drones;
    this.state.allVessels = result.vessels;
    this.state.allDefenses = result.defenseAssets;
    this.state.allFacilities = result.facilities;
    this.state.costs.red += result.costs.red;
    this.state.costs.blue += result.costs.blue;
    this.state.dronesDestroyed.red += result.dronesDestroyed.red;
    this.state.dronesDestroyed.blue += result.dronesDestroyed.blue;

    // Apply fog of war
    this.state.blueVisibleDrones = filterForBlue(
      result.drones, this.state.allDefenses, this.state.allFacilities
    );
    this.state.redVisibleDefenses = filterForRed(this.state.allDefenses);

    // Update facility status
    this.state.facilitiesStatus = result.facilities.map((f) => ({
      id: f.id, status: f.status, hp: f.currentHitPoints,
    }));

    // Score
    const destroyed = result.facilities.filter((f) => f.status === 'destroyed').length;
    const operational = result.facilities.filter((f) => f.status === 'operational').length;
    this.state.redScore += destroyed * 10;
    this.state.blueScore += operational * 5;

    // Log results
    const redLaunched = this.pendingRedWaves.reduce((s, w) => s + w.count, 0);
    this.state.log.push(
      `Turn ${this.state.turn.turnNumber} resolved: ${redLaunched} launched, ` +
      `${result.dronesDestroyed.red} destroyed, ${operational} fabs operational`
    );

    // Clear pending waves
    this.pendingRedWaves = [];

    // Check game over
    const allDestroyed = result.facilities.every((f) => f.status === 'destroyed');
    if (allDestroyed || this.state.turn.turnNumber >= this.state.totalTurns) {
      this.state.gameOver = true;
      this.state.winner = allDestroyed ? 'red' :
        this.state.blueScore > this.state.redScore ? 'blue' :
        this.state.redScore > this.state.blueScore ? 'red' : 'draw';
      this.state.log.push(`=== GAME OVER: ${this.state.winner?.toUpperCase()} WINS ===`);
      this.state.turn.phase = 'review';
    } else {
      // Next turn
      this.state.turn.turnNumber++;
      this.state.turn.phase = 'blue_plan';
      this.state.turn.currentSide = 'blue';
    }
  }
}
