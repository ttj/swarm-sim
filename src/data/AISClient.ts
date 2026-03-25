/**
 * AIS (Automatic Identification System) maritime tracking client.
 *
 * Connects to aisstream.io WebSocket for real-time ship positions,
 * or falls back to a static dataset of representative Taiwan Strait traffic.
 *
 * Set VITE_AIS_API_KEY in .env for live data.
 */

export interface AISVessel {
  mmsi: number;
  name: string;
  lat: number;
  lon: number;
  speed: number; // knots
  course: number; // degrees
  shipType: number;
  timestamp: number;
}

// Taiwan Strait bounding box
const BBOX_MIN_LAT = 21.5;
const BBOX_MAX_LAT = 26.0;
const BBOX_MIN_LON = 118.0;
const BBOX_MAX_LON = 123.0;

type AISCallback = (vessels: AISVessel[]) => void;

let activeSocket: WebSocket | null = null;
let currentVessels: Map<number, AISVessel> = new Map();
let listeners: AISCallback[] = [];
let connected = false;

/**
 * Start receiving AIS data. If API key is available, connects to aisstream.io.
 * Otherwise loads static fallback data.
 */
export function startAIS(onUpdate: AISCallback): () => void {
  listeners.push(onUpdate);

  const apiKey = import.meta.env.VITE_AIS_API_KEY as string | undefined;

  if (apiKey && !activeSocket) {
    connectWebSocket(apiKey);
  } else if (!apiKey && currentVessels.size === 0) {
    loadStaticData();
  }

  // Immediately send current data
  if (currentVessels.size > 0) {
    onUpdate(Array.from(currentVessels.values()));
  }

  // Return unsubscribe function
  return () => {
    listeners = listeners.filter((l) => l !== onUpdate);
    if (listeners.length === 0 && activeSocket) {
      activeSocket.close();
      activeSocket = null;
      connected = false;
    }
  };
}

function notifyListeners() {
  const vessels = Array.from(currentVessels.values());
  for (const cb of listeners) {
    cb(vessels);
  }
}

function connectWebSocket(apiKey: string) {
  if (connected) return;

  const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
  activeSocket = ws;

  ws.onopen = () => {
    connected = true;
    // Subscribe to Taiwan Strait bounding box
    const subscription = {
      APIKey: apiKey,
      BoundingBoxes: [
        [[BBOX_MIN_LAT, BBOX_MIN_LON], [BBOX_MAX_LAT, BBOX_MAX_LON]],
      ],
      FilterMessageTypes: ['PositionReport'],
    };
    ws.send(JSON.stringify(subscription));
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.MessageType === 'PositionReport' && data.MetaData) {
        const vessel: AISVessel = {
          mmsi: data.MetaData.MMSI ?? 0,
          name: (data.MetaData.ShipName ?? '').trim(),
          lat: data.MetaData.latitude ?? 0,
          lon: data.MetaData.longitude ?? 0,
          speed: data.Message?.PositionReport?.Sog ?? 0,
          course: data.Message?.PositionReport?.Cog ?? 0,
          shipType: data.MetaData.ShipType ?? 0,
          timestamp: Date.now(),
        };

        // Filter to bounding box
        if (vessel.lat >= BBOX_MIN_LAT && vessel.lat <= BBOX_MAX_LAT &&
            vessel.lon >= BBOX_MIN_LON && vessel.lon <= BBOX_MAX_LON) {
          currentVessels.set(vessel.mmsi, vessel);

          // Throttle updates to 1/sec
          throttledNotify();
        }
      }
    } catch {}
  };

  ws.onerror = () => {
    connected = false;
    // Fall back to static data
    loadStaticData();
  };

  ws.onclose = () => {
    connected = false;
    activeSocket = null;
  };
}

let notifyTimer: ReturnType<typeof setTimeout> | null = null;
function throttledNotify() {
  if (notifyTimer) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    notifyListeners();
  }, 1000);
}

/**
 * Static fallback: representative Taiwan Strait vessel positions.
 * Based on typical commercial shipping lanes and fishing vessel patterns.
 */
function loadStaticData() {
  const rng = (min: number, max: number) => min + Math.random() * (max - min);

  // Major shipping lane (SW-NE through strait center)
  for (let i = 0; i < 40; i++) {
    const t = i / 40;
    const lat = 22.5 + t * 3.0 + (Math.random() - 0.5) * 0.3;
    const lon = 119.5 + t * 1.5 + (Math.random() - 0.5) * 0.4;
    currentVessels.set(100000 + i, {
      mmsi: 100000 + i,
      name: `CARGO-${i + 1}`,
      lat, lon,
      speed: rng(8, 16),
      course: rng(20, 50),
      shipType: 70, // Cargo
      timestamp: Date.now(),
    });
  }

  // Fishing vessels (clusters near coast)
  const fishingClusters: [number, number][] = [
    [119.8, 24.3], [119.5, 23.5], [120.0, 22.8], [119.3, 24.8],
    [120.5, 25.0], [120.8, 23.2], [119.7, 23.0],
  ];
  let fishId = 200000;
  for (const [cLon, cLat] of fishingClusters) {
    const count = Math.floor(rng(8, 25));
    for (let i = 0; i < count; i++) {
      currentVessels.set(fishId, {
        mmsi: fishId,
        name: `FISHING-${fishId - 200000 + 1}`,
        lat: cLat + (Math.random() - 0.5) * 0.2,
        lon: cLon + (Math.random() - 0.5) * 0.2,
        speed: rng(2, 8),
        course: rng(0, 360),
        shipType: 30, // Fishing
        timestamp: Date.now(),
      });
      fishId++;
    }
  }

  // Tankers (fewer, slower, in shipping lanes)
  for (let i = 0; i < 12; i++) {
    const t = i / 12;
    currentVessels.set(300000 + i, {
      mmsi: 300000 + i,
      name: `TANKER-${i + 1}`,
      lat: 22.8 + t * 2.5 + (Math.random() - 0.5) * 0.2,
      lon: 119.8 + t * 1.2 + (Math.random() - 0.5) * 0.3,
      speed: rng(6, 12),
      course: rng(30, 60),
      shipType: 80, // Tanker
      timestamp: Date.now(),
    });
  }

  notifyListeners();
}

export function getVesselCount(): number {
  return currentVessels.size;
}

export function isLiveData(): boolean {
  return connected;
}
