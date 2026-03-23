import { EARTH_RADIUS_KM } from './constants';

/** Convert degrees to radians */
export function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Convert radians to degrees */
export function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Haversine distance between two [lng, lat] points in kilometers
 */
export function distanceKm(
  a: [number, number],
  b: [number, number]
): number {
  const dLat = toRadians(b[1] - a[1]);
  const dLon = toRadians(b[0] - a[0]);
  const lat1 = toRadians(a[1]);
  const lat2 = toRadians(b[1]);

  const sinDlat = Math.sin(dLat / 2);
  const sinDlon = Math.sin(dLon / 2);
  const h = sinDlat * sinDlat + Math.cos(lat1) * Math.cos(lat2) * sinDlon * sinDlon;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Bearing from point a to point b in degrees (0 = north, 90 = east)
 */
export function bearing(
  a: [number, number],
  b: [number, number]
): number {
  const lat1 = toRadians(a[1]);
  const lat2 = toRadians(b[1]);
  const dLon = toRadians(b[0] - a[0]);

  const x = Math.sin(dLon) * Math.cos(lat2);
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  return (toDegrees(Math.atan2(x, y)) + 360) % 360;
}

/**
 * Move a point [lng, lat] by a given distance (km) and bearing (degrees)
 * Returns new [lng, lat]
 */
export function movePoint(
  origin: [number, number],
  distKm: number,
  bearingDeg: number
): [number, number] {
  const lat1 = toRadians(origin[1]);
  const lon1 = toRadians(origin[0]);
  const brng = toRadians(bearingDeg);
  const d = distKm / EARTH_RADIUS_KM;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );

  return [toDegrees(lon2), toDegrees(lat2)];
}

/**
 * Calculate the speed in degrees-per-second for a given km/h speed
 * (approximate, for small distances)
 */
export function kmhToDegreesPerSec(kmh: number, latitude: number): { dLng: number; dLat: number } {
  const kmPerDegreeLat = (2 * Math.PI * EARTH_RADIUS_KM) / 360;
  const kmPerDegreeLng = kmPerDegreeLat * Math.cos(toRadians(latitude));
  const kmPerSec = kmh / 3600;

  return {
    dLat: kmPerSec / kmPerDegreeLat,
    dLng: kmPerSec / kmPerDegreeLng,
  };
}

/**
 * Generate a circle of points around a center (for zone visualization)
 */
export function circlePoints(
  center: [number, number],
  radiusKm: number,
  numPoints: number = 64
): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i < numPoints; i++) {
    const angle = (360 / numPoints) * i;
    points.push(movePoint(center, radiusKm, angle));
  }
  points.push(points[0]); // close the ring
  return points;
}
