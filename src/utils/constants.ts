// Map constants
export const MAP_CENTER: [number, number] = [120.5, 24.0];
export const MAP_DEFAULT_ZOOM = 7;
export const MAP_BOUNDS: [[number, number], [number, number]] = [
  [118.0, 21.5],
  [123.0, 26.0],
];

// Simulation constants
export const SIM_TICK_SECONDS = 10; // 10 seconds per tick
export const EARTH_RADIUS_KM = 6371;

// Spatial grid constants
export const GRID_COLS = 30;
export const GRID_ROWS = 40;
export const GRID_CELL_KM = 10;

// Speed multiplier presets
export const SPEED_PRESETS = [1, 10, 100, 1000];

// MapLibre style URLs (free, no token needed)
// Satellite uses ESRI World Imagery (free for non-commercial/dev use)
export const MAPLIBRE_STYLES: Record<string, string | object> = {
  streets: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  terrain: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  satellite: {
    version: 8,
    sources: {
      'esri-satellite': {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        maxzoom: 18,
        attribution: 'Esri, Maxar, Earthstar Geographics',
      },
    },
    layers: [
      {
        id: 'esri-satellite-layer',
        type: 'raster',
        source: 'esri-satellite',
        minzoom: 0,
        maxzoom: 18,
      },
    ],
  },
};

// Mapbox style URLs (requires token)
export const MAPBOX_STYLES: Record<string, string> = {
  streets: 'mapbox://styles/mapbox/streets-v12',
  terrain: 'mapbox://styles/mapbox/outdoors-v12',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
};

// Colors
export const COLORS = {
  redDrone: [220, 50, 50, 200] as [number, number, number, number],
  blueDrone: [50, 100, 220, 200] as [number, number, number, number],
  redVessel: [180, 40, 40, 180] as [number, number, number, number],
  facility: [255, 200, 50, 200] as [number, number, number, number],
  facilityDamaged: [255, 140, 0, 200] as [number, number, number, number],
  facilityDestroyed: [100, 100, 100, 150] as [number, number, number, number],
  defenseZoneEW: [100, 200, 255, 40] as [number, number, number, number],
  defenseZoneKinetic: [50, 150, 255, 30] as [number, number, number, number],
  defenseZoneDE: [255, 100, 255, 30] as [number, number, number, number],
  engagement: [255, 255, 0, 200] as [number, number, number, number],
  port: [150, 150, 255, 200] as [number, number, number, number],
};
