import type { DefenseAssetInstance } from '../types';

const STORAGE_KEY = 'swarm-sim-saved-defenses';

export interface SavedDefenseConfig {
  name: string;
  timestamp: number;
  assets: DefenseAssetInstance[];
}

/** Save current defense placement to localStorage */
export function saveDefenseConfig(name: string, assets: DefenseAssetInstance[]): void {
  const configs = loadAllConfigs();
  configs.push({
    name,
    timestamp: Date.now(),
    assets: assets.map((a) => ({ ...a })),
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
}

/** Load all saved defense configs */
export function loadAllConfigs(): SavedDefenseConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/** Delete a saved config by index */
export function deleteConfig(index: number): void {
  const configs = loadAllConfigs();
  configs.splice(index, 1);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
}
