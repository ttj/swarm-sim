import { describe, it, expect } from 'vitest';
import { SpatialGrid, kmToDeg } from '../engine/SpatialGrid';

describe('SpatialGrid', () => {
  it('inserts and queries entities', () => {
    const grid = new SpatialGrid();
    grid.insert(0, 120.5, 24.0);
    grid.insert(1, 120.51, 24.01);

    const results = grid.queryRadius(120.5, 24.0, 0.1);
    expect(results).toContain(0);
    expect(results).toContain(1);
  });

  it('does not return distant entities', () => {
    const grid = new SpatialGrid();
    grid.insert(0, 120.5, 24.0);
    grid.insert(1, 122.0, 25.5); // Far away

    const results = grid.queryRadius(120.5, 24.0, 0.1);
    expect(results).toContain(0);
    expect(results).not.toContain(1);
  });

  it('handles out-of-bounds inserts gracefully', () => {
    const grid = new SpatialGrid();
    // Out of Taiwan Strait bounds (118-123, 21.5-26)
    grid.insert(0, 100.0, 10.0);
    expect(grid.getEntityCount()).toBe(0);
  });

  it('clears all entities', () => {
    const grid = new SpatialGrid();
    grid.insert(0, 120.5, 24.0);
    grid.insert(1, 120.6, 24.1);
    expect(grid.getEntityCount()).toBe(2);

    grid.clear();
    expect(grid.getEntityCount()).toBe(0);
    expect(grid.queryRadius(120.5, 24.0, 1.0)).toHaveLength(0);
  });

  it('handles many entities efficiently', () => {
    const grid = new SpatialGrid();
    for (let i = 0; i < 1000; i++) {
      const lng = 119.0 + Math.random() * 3.0;
      const lat = 22.0 + Math.random() * 3.5;
      grid.insert(i, lng, lat);
    }
    expect(grid.getEntityCount()).toBe(1000);

    const results = grid.queryRadius(120.5, 24.0, 0.5);
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThan(1000);
  });
});

describe('kmToDeg', () => {
  it('converts km to approximate degrees', () => {
    const deg = kmToDeg(10, 24);
    // 10km ≈ 0.09 degrees latitude
    expect(deg).toBeGreaterThan(0.08);
    expect(deg).toBeLessThan(0.12);
  });

  it('returns larger value at higher latitudes', () => {
    const degLow = kmToDeg(10, 10);
    const degHigh = kmToDeg(10, 50);
    // Longitude degrees shrink at higher latitudes, so the max should be larger
    expect(degHigh).toBeGreaterThan(degLow);
  });
});
