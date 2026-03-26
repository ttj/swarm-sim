// === Guidance and Domain Types ===

export type GuidanceType = 'gps' | 'gps_inertial' | 'rf_command' | 'autonomous_vision' | 'fiber_optic';
export type Domain = 'air' | 'sea_surface' | 'subsurface';
export type Side = 'red' | 'blue';
export type RadarCrossSection = 'low' | 'medium' | 'high';

// === Drone Types ===

export interface DroneVulnerabilities {
  ewJammable: boolean;
  radarCrossSection: RadarCrossSection;
  irSignature: 'low' | 'medium' | 'high';
}

export interface DroneSpec {
  id: string;
  name: string;
  side: Side;
  domain: Domain;
  speedKmh: number;
  cruiseSpeedKmh: number;
  maxRangeKm: number;
  enduranceMinutes: number;
  costUSD: number;
  payloadKg: number;
  guidance: GuidanceType;
  vulnerabilities: DroneVulnerabilities;
}

export type DroneState = 'transit' | 'loiter' | 'engaging' | 'returning' | 'destroyed' | 'captured' | 'jammed';

export interface DroneInstance {
  instanceId: number;
  specId: string;
  side: Side;
  state: DroneState;
  position: [number, number]; // [lng, lat]
  heading: number; // degrees
  fuelRemaining: number; // 0-1
  targetId: number | null;
  waypointIndex: number;
  waypoints: [number, number][];
}

// === Vessel Types ===

export type VesselType = 'fishing_militia' | 'coast_guard' | 'naval' | 'drone_carrier';
export type ArmorClass = 'none' | 'light' | 'medium' | 'heavy';

export interface VesselSpec {
  id: string;
  name: string;
  side: Side;
  type: VesselType;
  speedKnots: number;
  droneCapacity: number;
  droneSpecCarried: string;
  armorClass: ArmorClass;
  costUSD: number;
}

export type VesselState = 'transit' | 'station' | 'launching' | 'disabled' | 'sunk';

export interface VesselInstance {
  instanceId: number;
  specId: string;
  side: Side;
  state: VesselState;
  position: [number, number];
  heading: number;
  dronesRemaining: number;
  launchCooldownSeconds: number;
}

// === Defense Types ===

export type DefenseAssetType =
  | 'interceptor_squad'
  | 'ew_jammer'
  | 'directed_energy'
  | 'net_launcher'
  | 'decoy_emitter'
  | 'anti_ship_battery'
  | 'patriot_battery'
  | 'hpm';

export interface DefenseAssetSpec {
  id: string;
  name: string;
  type: DefenseAssetType;
  rangeKm: number;
  costPerUseUSD: number;
  fixedCostUSD: number;
  capacity: number;
  reloadTimeMinutes: number;
  pkill: number;
}

export interface DefenseAssetInstance {
  instanceId: number;
  specId: string;
  type: DefenseAssetType;
  position: [number, number];
  currentStock: number;
  maxStock: number;
  reloadTimer: number; // seconds remaining until next reload
  isActive: boolean;
}

// === Facility Types ===

export type FacilityStatus = 'operational' | 'damaged' | 'destroyed';

export interface Facility {
  id: string;
  name: string;
  position: [number, number];
  radiusKm: number;
  value: number; // 0-100
  hitPoints: number;
  currentHitPoints: number;
  status: FacilityStatus;
  description?: string;
  boundary?: [number, number][]; // Polygon enclosure [lng, lat][]
}

// === Conventional Strike Types ===

export type ConventionalStrikeType = 'ballistic_missile' | 'cruise_missile' | 'anti_ship_missile';

export interface ConventionalStrike {
  type: ConventionalStrikeType;
  side: Side;
  launchTimeMinutes: number;
  targetType: string; // facility id or 'quarantine_fleet'
  count: number;
  pkill: number;
}

// === Attack Wave Types ===

export type Formation = 'dispersed' | 'concentrated' | 'line';

export interface AttackWave {
  id: string;
  launchTimeMinutes: number;
  droneSpec: string;
  count: number;
  origin: [number, number];
  target: string; // facility id
  approachBearing: number;
  formation: Formation;
}

export interface VesselWave {
  id: string;
  vesselSpec: string;
  count: number;
  origin: [number, number];
  stationPosition: [number, number];
  arrivalTimeMinutes: number;
}

// === Strategy Types ===

export type RedStrategyType = 'saturation_rush' | 'multi_axis_sea' | 'feint_and_strike' | 'attrition' | 'adaptive';
export type C2Resilience = 'centralized' | 'distributed' | 'mesh';
export type EWCapability = 'none' | 'moderate' | 'advanced';
export type Visibility = 'clear' | 'overcast' | 'fog';
export type TimeOfDay = 'day' | 'night';
export type QuarantineFormation = 'arc' | 'ring' | 'corridor';

// === Scenario Types ===

export interface AlliedSupport {
  enabled: boolean;
  carrierStrikeGroup: boolean;
  submarineSupport: boolean;
  ewSupport: boolean;
}

export interface RedForce {
  conventionalStrikes: ConventionalStrike[];
  vessels: VesselWave[];
  quarantineFormation: QuarantineFormation;
  airWaves: AttackWave[];
  seaLaunchedWaves: AttackWave[];
  uuvDeployment: { count: number; mineTargets: string[] };
  strategy: RedStrategyType;
  totalBudgetUSD: number;
  gpsJammingActive: boolean;
  ewCapability: EWCapability;
}

export interface BlueForce {
  assets: DefenseAssetInstance[];
  totalBudgetUSD: number;
  alliedSupport: AlliedSupport;
  c2Resilience: C2Resilience;
  productionRate: number; // interceptors per day
}

export interface EnvironmentConfig {
  windSpeedKmh: number;
  windBearing: number;
  visibility: Visibility;
  timeOfDay: TimeOfDay;
  seaState: 1 | 2 | 3 | 4 | 5;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  durationHours: number;
  redForce: RedForce;
  blueForce: BlueForce;
  facilities: Facility[];
  environment: EnvironmentConfig;
  swarmAlgorithm?: string; // 'waypoint' | 'boids' | 'potential_field' | 'combined'
}

// === Simulation State ===

export interface SimulationState {
  scenario: Scenario;
  currentTimeSec: number;
  drones: DroneInstance[];
  vessels: VesselInstance[];
  defenseAssets: DefenseAssetInstance[];
  facilities: Facility[];
  events: SimEvent[];
  costs: { red: number; blue: number };
  dronesDestroyed: { red: number; blue: number };
  vesselsDestroyed: number;
  isRunning: boolean;
  speedMultiplier: number;
}

export interface SimEvent {
  timeSec: number;
  type: 'launch' | 'intercept' | 'hit' | 'miss' | 'vessel_sunk' | 'facility_hit' | 'facility_destroyed' | 'wave_start' | 'conventional_strike';
  description: string;
  position?: [number, number];
  involvedIds?: number[];
}

// === Map Types ===

export type MapStyle = 'satellite' | 'terrain' | 'streets';

export interface MapConfig {
  provider: 'maplibre' | 'mapbox';
  style: MapStyle;
  center: [number, number];
  zoom: number;
}
