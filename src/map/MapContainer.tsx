import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScatterplotLayer, LineLayer, PolygonLayer, TextLayer } from '@deck.gl/layers';
import { useSimulationStore } from '../store/SimulationStore';
import { useUIStore } from '../store/UIStore';
import { ASSET_TEMPLATES } from '../ui/AssetPalette';
import { MAP_CENTER, MAP_DEFAULT_ZOOM, MAPLIBRE_STYLES, MAPBOX_STYLES, COLORS } from '../utils/constants';
import { circlePoints } from '../utils/geo';
import type { MapStyle, DroneInstance, DefenseAssetInstance, Facility } from '../types';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
const useMapbox = Boolean(MAPBOX_TOKEN);

function getStyle(style: MapStyle): string | maplibregl.StyleSpecification {
  if (useMapbox) return MAPBOX_STYLES[style];
  const s = MAPLIBRE_STYLES[style];
  return s as string | maplibregl.StyleSpecification;
}

interface EngagementFlash {
  from: [number, number];
  to: [number, number];
  time: number;
}

let engagementFlashes: EngagementFlash[] = [];
let nextPlacementId = 30000;

// Range ring colors by asset type
const RANGE_COLORS: Record<string, [number, number, number, number]> = {
  interceptor_squad: [74, 158, 255, 25],
  ew_jammer: [170, 102, 255, 20],
  directed_energy: [255, 102, 170, 30],
  net_launcher: [102, 255, 170, 30],
  decoy_emitter: [255, 170, 51, 15],
  anti_ship_battery: [255, 68, 68, 10],
  patriot_battery: [200, 200, 200, 8],
};

const RANGE_BORDER_COLORS: Record<string, [number, number, number, number]> = {
  interceptor_squad: [74, 158, 255, 80],
  ew_jammer: [170, 102, 255, 60],
  directed_energy: [255, 102, 170, 100],
  net_launcher: [102, 255, 170, 80],
  decoy_emitter: [255, 170, 51, 50],
  anti_ship_battery: [255, 68, 68, 40],
  patriot_battery: [200, 200, 200, 30],
};

// Look up range for an asset
function getAssetRange(asset: DefenseAssetInstance): number {
  const template = ASSET_TEMPLATES.find((t) => t.specId === asset.specId);
  return template?.rangeKm ?? 10;
}

// Build range ring polygon data
interface RangeRing {
  polygon: [number, number][];
  color: [number, number, number, number];
  borderColor: [number, number, number, number];
}

function buildRangeRings(assets: DefenseAssetInstance[]): RangeRing[] {
  return assets
    .filter((a) => a.isActive)
    .map((a) => ({
      polygon: circlePoints(a.position, getAssetRange(a), 48),
      color: RANGE_COLORS[a.type] ?? [100, 100, 100, 20],
      borderColor: RANGE_BORDER_COLORS[a.type] ?? [100, 100, 100, 50],
    }));
}

// Build facility status labels with drone counts
interface FacilityLabel {
  position: [number, number];
  text: string;
  color: [number, number, number, number];
}

function buildFacilityLabels(
  facilities: Facility[],
  drones: DroneInstance[]
): FacilityLabel[] {
  return facilities.map((f) => {
    const incoming = drones.filter(
      (d) => d.side === 'red' && d.state === 'transit' && d.waypoints.length > 0 &&
        Math.abs(d.waypoints[d.waypoints.length - 1][0] - f.position[0]) < 0.1 &&
        Math.abs(d.waypoints[d.waypoints.length - 1][1] - f.position[1]) < 0.1
    ).length;

    const destroyed = drones.filter(
      (d) => d.side === 'red' && (d.state === 'destroyed' || d.state === 'captured') &&
        Math.abs(d.position[0] - f.position[0]) < 0.3 &&
        Math.abs(d.position[1] - f.position[1]) < 0.3
    ).length;

    const shortName = f.name.replace('TSMC ', '').replace(/ \(.*\)/, '');
    const hpText = `${f.currentHitPoints}/${f.hitPoints}HP`;
    const droneText = incoming > 0 ? `${incoming} inbound` : '';
    const killText = destroyed > 0 ? `${destroyed} killed` : '';
    const parts = [shortName, hpText, droneText, killText].filter(Boolean);

    const color: [number, number, number, number] =
      f.status === 'destroyed' ? [200, 80, 80, 255] :
      f.status === 'damaged' ? [255, 180, 50, 255] :
      incoming > 0 ? [255, 255, 100, 255] :
      [255, 255, 255, 200];

    return {
      position: [f.position[0], f.position[1] + 0.06] as [number, number],
      text: parts.join(' | '),
      color,
    };
  });
}

export default function MapContainer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const deckOverlayRef = useRef<MapboxOverlay | null>(null);
  const assetMarkersRef = useRef<Map<number, maplibregl.Marker>>(new Map());

  const mapStyle = useSimulationStore((s) => s.mapStyle);
  const drones = useSimulationStore((s) => s.drones);
  const defenseAssets = useSimulationStore((s) => s.defenseAssets);
  const facilities = useSimulationStore((s) => s.facilities);
  const events = useSimulationStore((s) => s.events);
  const vessels = useSimulationStore((s) => s.vessels);
  const isRunning = useSimulationStore((s) => s.isRunning);

  const placementMode = useUIStore((s) => s.placementMode);

  // Track engagement flashes
  useEffect(() => {
    if (events.length === 0) return;
    const now = performance.now();
    const recentEvents = events.slice(-50);
    for (const evt of recentEvents) {
      if ((evt.type === 'intercept' || evt.type === 'facility_hit' || evt.type === 'facility_destroyed') && evt.position) {
        const offsetLng = (Math.random() - 0.5) * 0.05;
        const offsetLat = (Math.random() - 0.5) * 0.05;
        engagementFlashes.push({
          from: [evt.position[0] + offsetLng, evt.position[1] + offsetLat],
          to: evt.position,
          time: now,
        });
      }
    }
    engagementFlashes = engagementFlashes.filter((f) => now - f.time < 2000);
  }, [events]);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const mapOptions: maplibregl.MapOptions = {
      container: containerRef.current,
      style: getStyle(mapStyle),
      center: MAP_CENTER,
      zoom: MAP_DEFAULT_ZOOM,
      minZoom: 5,
      maxZoom: 15,
    };

    if (useMapbox && MAPBOX_TOKEN) {
      mapOptions.transformRequest = (url: string) => {
        if (url.startsWith('mapbox://')) {
          const mapboxUrl = url
            .replace('mapbox://styles/', 'https://api.mapbox.com/styles/v1/')
            .replace('mapbox://tiles/', 'https://api.mapbox.com/v4/');
          return { url: `${mapboxUrl}${mapboxUrl.includes('?') ? '&' : '?'}access_token=${MAPBOX_TOKEN}` };
        }
        return { url };
      };
    }

    const map = new maplibregl.Map(mapOptions);
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl(), 'bottom-right');

    const deckOverlay = new MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(deckOverlay as unknown as maplibregl.IControl);
    deckOverlayRef.current = deckOverlay;

    // Click handler for asset placement
    map.on('click', (e) => {
      const mode = useUIStore.getState().placementMode;
      if (!mode.active || !mode.specId) return;
      if (useSimulationStore.getState().isRunning) return;

      const template = ASSET_TEMPLATES.find((t) => t.specId === mode.specId);
      if (!template) return;

      const pos: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      const newAsset: DefenseAssetInstance = {
        instanceId: nextPlacementId++,
        specId: template.specId,
        type: template.type,
        position: pos,
        currentStock: template.defaultStock,
        maxStock: template.defaultStock,
        reloadTimer: 0,
        isActive: true,
      };

      const store = useSimulationStore.getState();
      store.setDefenseAssets([...store.defenseAssets, newAsset]);
    });

    map.getCanvas().style.cursor = '';
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      deckOverlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cursor for placement mode
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.getCanvas().style.cursor = placementMode.active ? 'crosshair' : '';
  }, [placementMode.active]);

  // Style switching
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setStyle(getStyle(mapStyle));
  }, [mapStyle]);

  // Draggable defense asset markers
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const currentMarkers = assetMarkersRef.current;
    const simRunning = isRunning;

    const assetIds = new Set(defenseAssets.map((a) => a.instanceId));
    for (const [id, marker] of currentMarkers) {
      if (!assetIds.has(id)) {
        marker.remove();
        currentMarkers.delete(id);
      }
    }

    for (const asset of defenseAssets) {
      let marker = currentMarkers.get(asset.instanceId);

      if (!marker) {
        const el = document.createElement('div');
        el.className = 'defense-asset-marker';
        const typeColors: Record<string, string> = {
          interceptor_squad: '#4a9eff',
          ew_jammer: '#aa66ff',
          directed_energy: '#ff66aa',
          net_launcher: '#66ffaa',
          decoy_emitter: '#ffaa33',
          anti_ship_battery: '#ff4444',
          patriot_battery: '#ffffff',
        };
        const color = typeColors[asset.type] ?? '#4a9eff';
        el.style.cssText = `
          width: 12px; height: 12px;
          background: ${color};
          border: 2px solid #fff;
          border-radius: 50%;
          cursor: ${simRunning ? 'default' : 'grab'};
          box-shadow: 0 0 8px ${color}88;
        `;

        const shortName = ASSET_TEMPLATES.find((t) => t.specId === asset.specId)?.name ?? asset.specId;
        el.title = `${shortName} (drag to move)`;

        marker = new maplibregl.Marker({ element: el, draggable: !simRunning })
          .setLngLat(asset.position)
          .addTo(map);

        marker.on('dragend', () => {
          const lngLat = marker!.getLngLat();
          const store = useSimulationStore.getState();
          store.setDefenseAssets(
            store.defenseAssets.map((a) =>
              a.instanceId === asset.instanceId
                ? { ...a, position: [lngLat.lng, lngLat.lat] as [number, number] }
                : a
            )
          );
        });

        currentMarkers.set(asset.instanceId, marker);
      } else {
        const curr = marker.getLngLat();
        if (Math.abs(curr.lng - asset.position[0]) > 0.0001 || Math.abs(curr.lat - asset.position[1]) > 0.0001) {
          marker.setLngLat(asset.position);
        }
        marker.setDraggable(!simRunning);
      }
    }
  }, [defenseAssets, isRunning]);

  // Update deck.gl layers
  useEffect(() => {
    if (!deckOverlayRef.current) return;
    const now = performance.now();
    const layers: any[] = [];

    // === RANGE RINGS (lowest z-order, drawn first) ===
    const rangeRings = buildRangeRings(defenseAssets);
    if (rangeRings.length > 0) {
      layers.push(
        new PolygonLayer<RangeRing>({
          id: 'defense-range-rings',
          data: rangeRings,
          getPolygon: (d) => d.polygon,
          getFillColor: (d) => d.color,
          getLineColor: (d) => d.borderColor,
          getLineWidth: 1,
          lineWidthMinPixels: 1,
          filled: true,
          stroked: true,
        })
      );
    }

    // === FACILITY INDICATORS ===
    if (facilities.length > 0) {
      layers.push(
        new ScatterplotLayer<Facility>({
          id: 'facility-indicators',
          data: facilities,
          getPosition: (d) => d.position,
          getRadius: (d) => d.radiusKm * 1000,
          getFillColor: (d) =>
            d.status === 'operational' ? COLORS.facility
              : d.status === 'damaged' ? COLORS.facilityDamaged
              : COLORS.facilityDestroyed,
          radiusMinPixels: 8,
          radiusMaxPixels: 25,
          getLineColor: [255, 255, 255, 100],
          stroked: true,
          lineWidthMinPixels: 1,
        })
      );

      // Facility labels with drone counts
      const labels = buildFacilityLabels(facilities, drones);
      layers.push(
        new TextLayer<FacilityLabel>({
          id: 'facility-labels',
          data: labels,
          getPosition: (d) => d.position,
          getText: (d) => d.text,
          getColor: (d) => d.color,
          getSize: 12,
          getTextAnchor: 'middle',
          getAlignmentBaseline: 'bottom',
          fontFamily: 'Consolas, monospace',
          fontWeight: 'bold',
          outlineWidth: 2,
          outlineColor: [0, 0, 0, 200],
          billboard: true,
          sizeUnits: 'pixels',
        })
      );
    }

    // === VESSELS (maritime quarantine) ===
    if (vessels.length > 0) {
      const activeVessels = vessels.filter((v) => v.state !== 'sunk' && v.state !== 'disabled');
      if (activeVessels.length > 0) {
        layers.push(
          new ScatterplotLayer({
            id: 'vessels',
            data: activeVessels,
            getPosition: (d: any) => d.position,
            getRadius: 1200,
            getFillColor: COLORS.redVessel,
            radiusMinPixels: 3,
            radiusMaxPixels: 8,
          })
        );
      }
    }

    // === RED DRONES ===
    const activeRedDrones = drones.filter((d) => d.side === 'red' && d.state === 'transit');
    const destroyedRedDrones = drones.filter(
      (d) => d.side === 'red' && (d.state === 'destroyed' || d.state === 'captured')
    );

    if (activeRedDrones.length > 0) {
      layers.push(
        new ScatterplotLayer<DroneInstance>({
          id: 'red-drones-active',
          data: activeRedDrones,
          getPosition: (d) => d.position,
          getRadius: 800,
          getFillColor: COLORS.redDrone,
          radiusMinPixels: 2,
          radiusMaxPixels: 8,
        })
      );
    }

    if (destroyedRedDrones.length > 0) {
      const recentDestroyed = destroyedRedDrones.slice(-300);
      layers.push(
        new ScatterplotLayer<DroneInstance>({
          id: 'red-drones-destroyed',
          data: recentDestroyed,
          getPosition: (d) => d.position,
          getRadius: 400,
          getFillColor: [150, 80, 80, 60],
          radiusMinPixels: 1,
          radiusMaxPixels: 3,
        })
      );
    }

    // === BLUE DRONES ===
    const activeBlueDrones = drones.filter(
      (d) => d.side === 'blue' && d.state !== 'destroyed' && d.state !== 'captured'
    );
    if (activeBlueDrones.length > 0) {
      layers.push(
        new ScatterplotLayer<DroneInstance>({
          id: 'blue-drones',
          data: activeBlueDrones,
          getPosition: (d) => d.position,
          getRadius: 600,
          getFillColor: COLORS.blueDrone,
          radiusMinPixels: 2,
          radiusMaxPixels: 6,
        })
      );
    }

    // === ENGAGEMENT FLASHES ===
    const activeFlashes = engagementFlashes.filter((f) => now - f.time < 1500);
    if (activeFlashes.length > 0) {
      layers.push(
        new LineLayer<EngagementFlash>({
          id: 'engagement-flashes',
          data: activeFlashes,
          getSourcePosition: (d) => d.from,
          getTargetPosition: (d) => d.to,
          getColor: (d) => {
            const age = (now - d.time) / 1500;
            const alpha = Math.max(0, 255 * (1 - age));
            return [255, 255, 50, alpha];
          },
          getWidth: 2,
          widthMinPixels: 1,
        })
      );
    }

    deckOverlayRef.current.setProps({ layers });
  }, [drones, defenseAssets, facilities, events, vessels]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    />
  );
}
