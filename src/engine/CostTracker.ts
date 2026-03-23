import type { Side } from '../types';

/**
 * Tracks running cost tallies for both sides during simulation.
 */
export class CostTracker {
  private costs: { red: number; blue: number } = { red: 0, blue: 0 };
  private dronesDestroyed: { red: number; blue: number } = { red: 0, blue: 0 };
  private vesselsDestroyed = 0;

  /** Record a cost expenditure for a side */
  addCost(side: Side, amount: number): void {
    this.costs[side] += amount;
  }

  /** Record a drone destruction */
  addDroneDestroyed(side: Side): void {
    this.dronesDestroyed[side]++;
  }

  /** Record a vessel destruction */
  addVesselDestroyed(): void {
    this.vesselsDestroyed++;
  }

  /** Get current costs */
  getCosts(): { red: number; blue: number } {
    return { ...this.costs };
  }

  /** Get destruction counts */
  getDronesDestroyed(): { red: number; blue: number } {
    return { ...this.dronesDestroyed };
  }

  getVesselsDestroyed(): number {
    return this.vesselsDestroyed;
  }

  /** Cost exchange ratio: blue cost per red drone destroyed */
  getCER(): number {
    if (this.dronesDestroyed.red === 0) return 0;
    return this.costs.blue / this.dronesDestroyed.red;
  }

  /** Reset all tracking */
  reset(): void {
    this.costs = { red: 0, blue: 0 };
    this.dronesDestroyed = { red: 0, blue: 0 };
    this.vesselsDestroyed = 0;
  }
}
