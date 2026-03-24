import { useEffect } from 'react';
import Layout from './ui/Layout';
import { useSimulationStore } from './store/SimulationStore';
import { useSimulation } from './engine/useSimulation';
import type { Facility } from './types';

function App() {
  const setFacilities = useSimulationStore((s) => s.setFacilities);

  // Initialize simulation hook
  useSimulation();

  // Load facility data on mount
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/taiwan-facilities.json`)
      .then((res) => res.json())
      .then((data) => {
        const facilities: Facility[] = data.facilities.map(
          (f: {
            id: string;
            name: string;
            position: [number, number];
            radiusKm: number;
            value: number;
            hitPoints: number;
            description?: string;
            boundary?: [number, number][];
          }) => ({
            ...f,
            currentHitPoints: f.hitPoints,
            status: 'operational' as const,
          })
        );
        setFacilities(facilities);
      })
      .catch((err) => console.error('Failed to load facilities:', err));
  }, [setFacilities]);

  return <Layout />;
}

export default App;
