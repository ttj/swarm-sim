import { useMemo } from 'react';
import { ScatterplotLayer } from '@deck.gl/layers';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { useSimulationStore } from '../store/SimulationStore';
import { COLORS } from '../utils/constants';
import type { DroneInstance, DefenseAssetInstance, Facility } from '../types';

/**
 * Creates deck.gl layers for rendering drones, defense zones, and facilities
 * as an overlay on the map.
 */
export function useDeckLayers() {
  const drones = useSimulationStore((s) => s.drones);
  const defenseAssets = useSimulationStore((s) => s.defenseAssets);
  const facilities = useSimulationStore((s) => s.facilities);

  const layers = useMemo(() => {
    const result = [];

    // Red drones layer
    const activeDrones = drones.filter(
      (d) => d.state !== 'destroyed' && d.state !== 'captured'
    );
    const redDrones = activeDrones.filter((d) => d.side === 'red');
    const blueDrones = activeDrones.filter((d) => d.side === 'blue');

    if (redDrones.length > 0) {
      result.push(
        new ScatterplotLayer<DroneInstance>({
          id: 'red-drones',
          data: redDrones,
          getPosition: (d) => d.position,
          getRadius: 800,
          getFillColor: COLORS.redDrone,
          radiusMinPixels: 2,
          radiusMaxPixels: 8,
          pickable: true,
          updateTriggers: {
            getPosition: drones,
          },
        })
      );
    }

    if (blueDrones.length > 0) {
      result.push(
        new ScatterplotLayer<DroneInstance>({
          id: 'blue-drones',
          data: blueDrones,
          getPosition: (d) => d.position,
          getRadius: 600,
          getFillColor: COLORS.blueDrone,
          radiusMinPixels: 2,
          radiusMaxPixels: 6,
          pickable: true,
          updateTriggers: {
            getPosition: drones,
          },
        })
      );
    }

    // Defense asset positions
    if (defenseAssets.length > 0) {
      result.push(
        new ScatterplotLayer<DefenseAssetInstance>({
          id: 'defense-assets',
          data: defenseAssets.filter((a) => a.isActive),
          getPosition: (d) => d.position,
          getRadius: 1500,
          getFillColor: [50, 150, 255, 150],
          getLineColor: [100, 200, 255, 200],
          lineWidthMinPixels: 1,
          stroked: true,
          radiusMinPixels: 4,
          radiusMaxPixels: 12,
          pickable: true,
        })
      );
    }

    // Facilities layer
    if (facilities.length > 0) {
      result.push(
        new ScatterplotLayer<Facility>({
          id: 'facilities',
          data: facilities,
          getPosition: (d) => d.position,
          getRadius: (d) => d.radiusKm * 1000,
          getFillColor: (d) =>
            d.status === 'operational'
              ? COLORS.facility
              : d.status === 'damaged'
                ? COLORS.facilityDamaged
                : COLORS.facilityDestroyed,
          radiusMinPixels: 6,
          radiusMaxPixels: 20,
          pickable: true,
          updateTriggers: {
            getFillColor: facilities,
          },
        })
      );
    }

    return result;
  }, [drones, defenseAssets, facilities]);

  return layers;
}

/**
 * Create a MapboxOverlay instance for deck.gl integration.
 */
export function createDeckOverlay() {
  return new MapboxOverlay({
    interleaved: true,
    layers: [],
  });
}
