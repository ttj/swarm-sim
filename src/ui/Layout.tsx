import { useState, useEffect } from 'react';
import { Allotment } from 'allotment';
import 'allotment/dist/style.css';
import SimControls from './SimControls';
import StatsPanel from './StatsPanel';
import AssetPalette from './AssetPalette';
import ScenarioPanel from './ScenarioPanel';
import ProbabilityPanel from './ProbabilityPanel';
import StrategyAdvisor from './StrategyAdvisor';
import EventLog from './EventLog';
import ComparePanel from './ComparePanel';
import CampaignPanel from './CampaignPanel';
import WargamePanel from './WargamePanel';
import TimelineBar from './TimelineBar';
import MapContainer from '../map/MapContainer';
import { useUIStore } from '../store/UIStore';

type SidebarTab = 'scenario' | 'assets' | 'events' | 'stats' | 'probability' | 'advisor' | 'compare' | 'campaign' | 'wargame';

export default function Layout() {
  const [activeTab, setActiveTab] = useState<SidebarTab>('scenario');
  const presentationMode = useUIStore((s) => s.presentationMode);
  const setPresentationMode = useUIStore((s) => s.setPresentationMode);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && presentationMode) setPresentationMode(false);
      if (e.key === 'f' && e.ctrlKey) {
        e.preventDefault();
        setPresentationMode(!presentationMode);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [presentationMode, setPresentationMode]);

  return (
    <div className={`app-layout ${presentationMode ? 'presentation' : ''}`}>
      <header className="toolbar">
        <div className="toolbar-title">
          <h1>Taiwan Drone Swarm Defense Simulator</h1>
          {!presentationMode && (
            <span className="toolbar-subtitle">TSMC Critical Infrastructure Protection</span>
          )}
        </div>
        <div className="toolbar-right">
          <SimControls />
          <button
            className={`control-btn ${useUIStore.getState().aisEnabled ? 'ais-active' : ''}`}
            onClick={() => {
              const s = useUIStore.getState();
              s.setAisEnabled(!s.aisEnabled);
            }}
            title="Toggle AIS ship tracking overlay"
          >
            🚢
          </button>
          <button
            className="control-btn presentation-btn"
            onClick={() => setPresentationMode(!presentationMode)}
            title={presentationMode ? 'Exit fullscreen (Esc)' : 'Presentation mode (Ctrl+F)'}
          >
            {presentationMode ? '⊡' : '⊞'}
          </button>
        </div>
      </header>

      <div className="main-content">
        <Allotment>
          {!presentationMode && (
            <Allotment.Pane minSize={200} preferredSize={280} maxSize={500}>
              <aside className="sidebar">
                <div className="sidebar-tabs">
                  {[
                    { id: 'scenario', label: 'Scenario' },
                    { id: 'assets', label: 'Defense' },
                    { id: 'events', label: 'Events' },
                    { id: 'stats', label: 'Stats' },
                    { id: 'probability', label: 'Prob' },
                    { id: 'compare', label: 'Cmp' },
                    { id: 'campaign', label: 'Camp' },
                    { id: 'wargame', label: 'War' },
                    { id: 'advisor', label: 'AI' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                      onClick={() => setActiveTab(tab.id as SidebarTab)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="sidebar-content">
                  {activeTab === 'scenario' && <ScenarioPanel />}
                  {activeTab === 'assets' && <AssetPalette />}
                  {activeTab === 'events' && <EventLog />}
                  {activeTab === 'stats' && <StatsPanel />}
                  {activeTab === 'probability' && <ProbabilityPanel />}
                  {activeTab === 'compare' && <ComparePanel />}
                  {activeTab === 'campaign' && <CampaignPanel />}
                  {activeTab === 'wargame' && <WargamePanel />}
                  {activeTab === 'advisor' && <StrategyAdvisor />}
                </div>
              </aside>
            </Allotment.Pane>
          )}

          <Allotment.Pane>
            <div className="map-area">
              <MapContainer />
            </div>
          </Allotment.Pane>
        </Allotment>
      </div>

      <footer className="bottom-bar">
        <TimelineBar />
      </footer>
    </div>
  );
}
