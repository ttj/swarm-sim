/**
 * Grid-based spatial hash for fast proximity queries.
 * Divides the operational area into cells and indexes entities by cell.
 * Reduces engagement checks from O(n^2) to O(n*k) where k = avg entities per neighborhood.
 */

// Operational area bounds (Taiwan Strait + Taiwan)
const MIN_LNG = 118.0;
const MAX_LNG = 123.0;
const MIN_LAT = 21.5;
const MAX_LAT = 26.0;
const COLS = 50;
const ROWS = 45;
const CELL_WIDTH = (MAX_LNG - MIN_LNG) / COLS;
const CELL_HEIGHT = (MAX_LAT - MIN_LAT) / ROWS;

export class SpatialGrid {
  private cells: number[][]; // Each cell contains array of entity indices
  private entityCount = 0;

  constructor() {
    this.cells = new Array(COLS * ROWS);
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i] = [];
    }
  }

  /** Clear all cells */
  clear(): void {
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i].length = 0;
    }
    this.entityCount = 0;
  }

  /** Get cell index for a position [lng, lat] */
  private cellIndex(lng: number, lat: number): number {
    const col = Math.floor((lng - MIN_LNG) / CELL_WIDTH);
    const row = Math.floor((lat - MIN_LAT) / CELL_HEIGHT);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return -1;
    return row * COLS + col;
  }

  /** Insert an entity at position [lng, lat] with given index */
  insert(entityIndex: number, lng: number, lat: number): void {
    const idx = this.cellIndex(lng, lat);
    if (idx >= 0) {
      this.cells[idx].push(entityIndex);
      this.entityCount++;
    }
  }

  /**
   * Query all entity indices within a radius (in degrees, approximate).
   * Checks the cell containing the point plus all neighboring cells
   * within the radius.
   */
  queryRadius(lng: number, lat: number, radiusDeg: number): number[] {
    const results: number[] = [];

    const minCol = Math.max(0, Math.floor((lng - radiusDeg - MIN_LNG) / CELL_WIDTH));
    const maxCol = Math.min(COLS - 1, Math.floor((lng + radiusDeg - MIN_LNG) / CELL_WIDTH));
    const minRow = Math.max(0, Math.floor((lat - radiusDeg - MIN_LAT) / CELL_HEIGHT));
    const maxRow = Math.min(ROWS - 1, Math.floor((lat + radiusDeg - MIN_LAT) / CELL_HEIGHT));

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const cell = this.cells[row * COLS + col];
        for (let i = 0; i < cell.length; i++) {
          results.push(cell[i]);
        }
      }
    }

    return results;
  }

  getEntityCount(): number {
    return this.entityCount;
  }
}

/**
 * Convert km radius to approximate degree radius at a given latitude.
 * 1 degree latitude ≈ 111 km. 1 degree longitude ≈ 111 * cos(lat) km.
 */
export function kmToDeg(km: number, lat: number = 24): number {
  const latDeg = km / 111;
  const lngDeg = km / (111 * Math.cos(lat * Math.PI / 180));
  return Math.max(latDeg, lngDeg); // Use the larger to ensure coverage
}
