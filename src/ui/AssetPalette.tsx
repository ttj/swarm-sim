import { useSimulationStore } from '../store/SimulationStore';
import { useUIStore } from '../store/UIStore';
import type { DefenseAssetType } from '../types';

interface AssetTemplate {
  specId: string;
  name: string;
  type: DefenseAssetType;
  rangeKm: number;
  description: string;
  costLabel: string;
  defaultStock: number;
}

const ASSET_TEMPLATES: AssetTemplate[] = [
  {
    specId: 'interceptor-cheap',
    name: 'Interceptor Squad (GPS)',
    type: 'interceptor_squad',
    rangeKm: 20,
    description: '$2K/drone, 80 units. Best cost ratio but GPS-jammable.',
    costLabel: '$160K',
    defaultStock: 80,
  },
  {
    specId: 'interceptor-autonav',
    name: 'Interceptor Squad (Auto-Nav)',
    type: 'interceptor_squad',
    rangeKm: 20,
    description: '$15K/drone, 40 units. EW-resistant, higher cost.',
    costLabel: '$600K',
    defaultStock: 40,
  },
  {
    specId: 'ew-jammer',
    name: 'EW Jammer Station',
    type: 'ew_jammer',
    rangeKm: 15,
    description: 'Jams GPS drones. $0/engagement. Useless vs vision-nav.',
    costLabel: '$3M',
    defaultStock: 9999,
  },
  {
    specId: 'directed-energy-50kw',
    name: '50kW Directed Energy',
    type: 'directed_energy',
    rangeKm: 2,
    description: '<$10/shot, unlimited ammo, very short range.',
    costLabel: '$10M',
    defaultStock: 9999,
  },
  {
    specId: 'net-launcher',
    name: 'Net Launcher Drone',
    type: 'net_launcher',
    rangeKm: 2,
    description: '3 nets, captures drones intact for intel.',
    costLabel: '$6.5K',
    defaultStock: 3,
  },
  {
    specId: 'decoy-emitter',
    name: 'Decoy Emitter',
    type: 'decoy_emitter',
    rangeKm: 5,
    description: 'Lures GPS drones. Effectiveness decays over time.',
    costLabel: '$3K',
    defaultStock: 9999,
  },
  {
    specId: 'hsiung-feng-3',
    name: 'Hsiung Feng III (Anti-Ship)',
    type: 'anti_ship_battery',
    rangeKm: 250,
    description: 'Mach 2.3 anti-ship. 8 rounds. Thins quarantine fleet.',
    costLabel: '$50M',
    defaultStock: 8,
  },
  {
    specId: 'patriot-pac3',
    name: 'Patriot PAC-3',
    type: 'patriot_battery',
    rangeKm: 60,
    description: '$4M/missile, 16 rounds. Cruise/ballistic only.',
    costLabel: '$1B',
    defaultStock: 16,
  },
];

export default function AssetPalette() {
  const { defenseAssets, setDefenseAssets, isRunning } = useSimulationStore();
  const { placementMode, setPlacementMode, clearPlacementMode } = useUIStore();

  const handleSelectTemplate = (template: AssetTemplate) => {
    if (isRunning) return;

    if (placementMode.active && placementMode.specId === template.specId) {
      // Toggle off
      clearPlacementMode();
    } else {
      // Enter placement mode -- next map click places the asset
      setPlacementMode({
        active: true,
        specId: template.specId,
        name: template.name,
      });
    }
  };

  const handleRemoveAsset = (instanceId: number) => {
    setDefenseAssets(defenseAssets.filter((a) => a.instanceId !== instanceId));
  };

  const getTemplateName = (specId: string) =>
    ASSET_TEMPLATES.find((t) => t.specId === specId)?.name ?? specId;

  return (
    <div className="asset-palette">
      <h3>Defense Assets</h3>

      {placementMode.active && (
        <div className="placement-banner">
          Click on the map to place: <strong>{placementMode.name}</strong>
          <button className="cancel-placement" onClick={clearPlacementMode}>Cancel</button>
        </div>
      )}

      {/* Asset templates */}
      <div className="asset-templates">
        {ASSET_TEMPLATES.map((template) => (
          <div
            key={template.specId}
            className={`asset-card ${placementMode.specId === template.specId ? 'selected' : ''} ${isRunning ? 'disabled' : ''}`}
            onClick={() => handleSelectTemplate(template)}
          >
            <div className="asset-card-header">
              <span className="asset-name">{template.name}</span>
              <span className="asset-cost">{template.costLabel}</span>
            </div>
            <div className="asset-card-desc">{template.description}</div>
            <div className="asset-card-range">Range: {template.rangeKm}km</div>
          </div>
        ))}
      </div>

      {/* Placed assets */}
      {defenseAssets.length > 0 && (
        <div className="placed-assets">
          <h4>Placed ({defenseAssets.length}) — drag on map to reposition</h4>
          {defenseAssets.map((asset) => (
            <div key={asset.instanceId} className="placed-asset-row">
              <span className="placed-asset-name">{getTemplateName(asset.specId)}</span>
              <span className="placed-asset-stock">
                {asset.maxStock < 9999 ? `${asset.currentStock}/${asset.maxStock}` : '∞'}
              </span>
              {!isRunning && (
                <button
                  className="remove-btn"
                  onClick={() => handleRemoveAsset(asset.instanceId)}
                  title="Remove"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Export templates for use by MapContainer
export { ASSET_TEMPLATES };
export type { AssetTemplate };
