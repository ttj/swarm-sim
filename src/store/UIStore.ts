import { create } from 'zustand';

export interface PlacementMode {
  active: boolean;
  specId: string | null;
  name: string | null;
}

interface UIStore {
  // Asset placement
  placementMode: PlacementMode;
  setPlacementMode: (mode: PlacementMode) => void;
  clearPlacementMode: () => void;

  // Dragging
  draggingAssetId: number | null;
  setDraggingAssetId: (id: number | null) => void;

  // Presentation mode
  presentationMode: boolean;
  setPresentationMode: (on: boolean) => void;

  // AIS overlay
  aisEnabled: boolean;
  setAisEnabled: (on: boolean) => void;
  aisVessels: { lat: number; lon: number; shipType: number }[];
  setAisVessels: (v: { lat: number; lon: number; shipType: number }[]) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  placementMode: { active: false, specId: null, name: null },
  setPlacementMode: (mode) => set({ placementMode: mode }),
  clearPlacementMode: () => set({ placementMode: { active: false, specId: null, name: null } }),

  draggingAssetId: null,
  setDraggingAssetId: (id) => set({ draggingAssetId: id }),

  presentationMode: false,
  setPresentationMode: (on) => set({ presentationMode: on }),

  aisEnabled: false,
  setAisEnabled: (on) => set({ aisEnabled: on }),
  aisVessels: [],
  setAisVessels: (v) => set({ aisVessels: v }),
}));
