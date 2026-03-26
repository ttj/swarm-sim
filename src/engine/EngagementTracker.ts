/**
 * Tracks recent engagement events with type information for visualization.
 * Each engagement has a type (interceptor, ew, hpm, de, net, patriot) and
 * source/target positions for rendering type-specific animations.
 */

export type EngagementType = 'interceptor' | 'ew_jam' | 'hpm_pulse' | 'directed_energy' | 'net_capture' | 'patriot' | 'facility_hit';

export interface EngagementEvent {
  type: EngagementType;
  source: [number, number]; // Defense asset position
  target: [number, number]; // Drone/facility position
  time: number; // performance.now() when created
  success: boolean; // Hit or miss
}

const MAX_EVENTS = 200;
const EVENT_LIFETIME_MS = 3000;

class EngagementTrackerSingleton {
  private events: EngagementEvent[] = [];

  add(event: EngagementEvent): void {
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(-MAX_EVENTS);
    }
  }

  getActive(): EngagementEvent[] {
    const now = performance.now();
    this.events = this.events.filter((e) => now - e.time < EVENT_LIFETIME_MS);
    return this.events;
  }

  clear(): void {
    this.events = [];
  }

  /** Get age of event as fraction 0-1 (0 = just happened, 1 = about to expire) */
  getAge(event: EngagementEvent): number {
    return Math.min(1, (performance.now() - event.time) / EVENT_LIFETIME_MS);
  }
}

export const engagementTracker = new EngagementTrackerSingleton();

/**
 * Map defense asset type to engagement visual type.
 */
export function defenseTypeToEngagement(assetType: string, isCapture: boolean): EngagementType {
  if (isCapture) return 'net_capture';
  switch (assetType) {
    case 'interceptor_squad': return 'interceptor';
    case 'ew_jammer': return 'ew_jam';
    case 'hpm': return 'hpm_pulse';
    case 'directed_energy': return 'directed_energy';
    case 'net_launcher': return 'net_capture';
    case 'patriot_battery': return 'patriot';
    default: return 'interceptor';
  }
}
