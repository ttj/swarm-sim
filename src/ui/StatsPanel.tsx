import { useSimulationStore } from '../store/SimulationStore';

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`;
  return `$${amount}`;
}

export default function StatsPanel() {
  const {
    drones,
    vessels,
    costs,
    dronesDestroyed,
    vesselsDestroyed,
    facilities,
    activeScenario,
  } = useSimulationStore();

  const redDrones = drones.filter((d) => d.side === 'red');
  const blueDrones = drones.filter((d) => d.side === 'blue');
  const activeRedDrones = redDrones.filter((d) => d.state !== 'destroyed' && d.state !== 'captured');
  const activeBlueDrones = blueDrones.filter((d) => d.state !== 'destroyed' && d.state !== 'captured');
  const activeVessels = vessels.filter((v) => v.state !== 'sunk' && v.state !== 'disabled');

  const facilitiesOk = facilities.filter((f) => f.status === 'operational').length;
  const facilitiesDamaged = facilities.filter((f) => f.status === 'damaged').length;
  const facilitiesDestroyed = facilities.filter((f) => f.status === 'destroyed').length;

  const cer = dronesDestroyed.red > 0
    ? costs.blue / dronesDestroyed.red
    : 0;

  return (
    <div className="stats-panel">
      <h3>Situation</h3>

      {/* Facilities */}
      <div className="stat-section">
        <h4>TSMC Facilities</h4>
        <div className="stat-row">
          <span className="stat-label">Operational</span>
          <span className="stat-value ok">{facilitiesOk}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Damaged</span>
          <span className="stat-value warn">{facilitiesDamaged}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Destroyed</span>
          <span className="stat-value danger">{facilitiesDestroyed}</span>
        </div>
      </div>

      {/* Forces */}
      <div className="stat-section">
        <h4>Red Force</h4>
        <div className="stat-row">
          <span className="stat-label">Active Drones</span>
          <span className="stat-value">{activeRedDrones.length}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Destroyed</span>
          <span className="stat-value">{dronesDestroyed.red}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Vessels Active</span>
          <span className="stat-value">{activeVessels.length}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Vessels Sunk</span>
          <span className="stat-value">{vesselsDestroyed}</span>
        </div>
      </div>

      <div className="stat-section">
        <h4>Blue Force</h4>
        <div className="stat-row">
          <span className="stat-label">Active Drones</span>
          <span className="stat-value">{activeBlueDrones.length}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Destroyed</span>
          <span className="stat-value">{dronesDestroyed.blue}</span>
        </div>
        {activeScenario && (
          <div className="stat-row">
            <span className="stat-label">Allied Support</span>
            <span className="stat-value">
              {activeScenario.blueForce.alliedSupport.enabled ? 'YES' : 'NO'}
            </span>
          </div>
        )}
      </div>

      {/* Costs */}
      <div className="stat-section">
        <h4>Cost Analysis</h4>
        <div className="stat-row">
          <span className="stat-label">Red Spent</span>
          <span className="stat-value">{formatCurrency(costs.red)}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Blue Spent</span>
          <span className="stat-value">{formatCurrency(costs.blue)}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">CER (Blue $/kill)</span>
          <span className={`stat-value ${cer > 50000 ? 'danger' : cer > 10000 ? 'warn' : 'ok'}`}>
            {cer > 0 ? formatCurrency(cer) : '-'}
          </span>
        </div>
      </div>
    </div>
  );
}
