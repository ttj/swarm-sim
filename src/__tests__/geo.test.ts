import { describe, it, expect } from 'vitest';
import { distanceKm, bearing, movePoint, toRadians, toDegrees, circlePoints } from '../utils/geo';

describe('geo utilities', () => {
  describe('toRadians / toDegrees', () => {
    it('converts 180 degrees to PI radians', () => {
      expect(toRadians(180)).toBeCloseTo(Math.PI);
    });

    it('converts PI radians to 180 degrees', () => {
      expect(toDegrees(Math.PI)).toBeCloseTo(180);
    });

    it('roundtrips correctly', () => {
      expect(toDegrees(toRadians(45))).toBeCloseTo(45);
    });
  });

  describe('distanceKm', () => {
    it('returns 0 for same point', () => {
      const p: [number, number] = [120.5, 24.0];
      expect(distanceKm(p, p)).toBeCloseTo(0, 5);
    });

    it('computes Taiwan Strait width approximately correctly', () => {
      // Fujian coast to Hsinchu (roughly across the strait)
      const fujian: [number, number] = [119.3, 24.5];
      const hsinchu: [number, number] = [120.99, 24.80];
      const dist = distanceKm(fujian, hsinchu);
      // Should be roughly 130-180 km
      expect(dist).toBeGreaterThan(120);
      expect(dist).toBeLessThan(200);
    });

    it('computes distance between TSMC Hsinchu and Tainan', () => {
      const hsinchu: [number, number] = [120.99, 24.80];
      const tainan: [number, number] = [120.27, 23.08];
      const dist = distanceKm(hsinchu, tainan);
      // About 200 km apart
      expect(dist).toBeGreaterThan(150);
      expect(dist).toBeLessThan(250);
    });
  });

  describe('bearing', () => {
    it('returns ~0 for due north', () => {
      const a: [number, number] = [120.0, 24.0];
      const b: [number, number] = [120.0, 25.0];
      expect(bearing(a, b)).toBeCloseTo(0, 0);
    });

    it('returns ~90 for due east', () => {
      const a: [number, number] = [120.0, 24.0];
      const b: [number, number] = [121.0, 24.0];
      expect(bearing(a, b)).toBeCloseTo(90, 0);
    });

    it('returns ~180 for due south', () => {
      const a: [number, number] = [120.0, 25.0];
      const b: [number, number] = [120.0, 24.0];
      expect(bearing(a, b)).toBeCloseTo(180, 0);
    });

    it('returns ~270 for due west', () => {
      const a: [number, number] = [121.0, 24.0];
      const b: [number, number] = [120.0, 24.0];
      expect(bearing(a, b)).toBeCloseTo(270, 0);
    });
  });

  describe('movePoint', () => {
    it('moving 0 km returns same point', () => {
      const origin: [number, number] = [120.5, 24.0];
      const result = movePoint(origin, 0, 0);
      expect(result[0]).toBeCloseTo(origin[0], 5);
      expect(result[1]).toBeCloseTo(origin[1], 5);
    });

    it('moving north increases latitude', () => {
      const origin: [number, number] = [120.5, 24.0];
      const result = movePoint(origin, 100, 0); // 100km north
      expect(result[1]).toBeGreaterThan(origin[1]);
      expect(result[0]).toBeCloseTo(origin[0], 2);
    });

    it('moving east increases longitude', () => {
      const origin: [number, number] = [120.5, 24.0];
      const result = movePoint(origin, 100, 90); // 100km east
      expect(result[0]).toBeGreaterThan(origin[0]);
      expect(result[1]).toBeCloseTo(origin[1], 2);
    });

    it('roundtrip: move then measure distance', () => {
      const origin: [number, number] = [120.5, 24.0];
      const dest = movePoint(origin, 50, 45); // 50km NE
      const measured = distanceKm(origin, dest);
      expect(measured).toBeCloseTo(50, 0);
    });
  });

  describe('circlePoints', () => {
    it('generates correct number of points plus closing point', () => {
      const center: [number, number] = [120.5, 24.0];
      const points = circlePoints(center, 10, 32);
      expect(points).toHaveLength(33); // 32 + 1 closing
    });

    it('first and last points are the same (closed ring)', () => {
      const center: [number, number] = [120.5, 24.0];
      const points = circlePoints(center, 10, 16);
      expect(points[0][0]).toBeCloseTo(points[points.length - 1][0], 5);
      expect(points[0][1]).toBeCloseTo(points[points.length - 1][1], 5);
    });

    it('all points are approximately the correct distance from center', () => {
      const center: [number, number] = [120.5, 24.0];
      const radiusKm = 20;
      const points = circlePoints(center, radiusKm, 8);
      for (let i = 0; i < points.length - 1; i++) {
        const dist = distanceKm(center, points[i]);
        expect(dist).toBeCloseTo(radiusKm, 0);
      }
    });
  });
});
