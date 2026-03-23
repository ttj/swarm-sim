import type { AggregateResults } from '../engine/HeadlessRunner';

/**
 * Export Monte Carlo results as JSON and trigger download.
 */
export function exportResultsJSON(results: AggregateResults, scenarioName: string): void {
  const data = {
    exportedAt: new Date().toISOString(),
    scenario: scenarioName,
    summary: {
      numRuns: results.numRuns,
      probAllSafe: results.probAllSafe,
      probAtLeast3Safe: results.probAtLeast3Safe,
      probAtLeast2Safe: results.probAtLeast2Safe,
      probAllDestroyed: results.probAllDestroyed,
      avgFacilitiesOperational: results.avgFacilitiesOperational,
      avgFacilitiesDestroyed: results.avgFacilitiesDestroyed,
      avgCostRed: results.avgCostRed,
      avgCostBlue: results.avgCostBlue,
      avgCER: results.avgCER,
      avgDronesDestroyedRed: results.avgDronesDestroyedRed,
    },
    facilityDestructionProb: results.facilityDestructionProb,
    distribution: results.distribution,
    runs: results.results.map((r) => ({
      seed: r.seed,
      facilitiesOperational: r.facilitiesOperational,
      facilitiesDamaged: r.facilitiesDamaged,
      facilitiesDestroyed: r.facilitiesDestroyed,
      costRed: r.costRed,
      costBlue: r.costBlue,
      dronesDestroyedRed: r.dronesDestroyedRed,
      cer: r.cer,
    })),
  };

  downloadFile(
    JSON.stringify(data, null, 2),
    `mc-results-${slugify(scenarioName)}-${Date.now()}.json`,
    'application/json'
  );
}

/**
 * Export Monte Carlo results as CSV and trigger download.
 */
export function exportResultsCSV(results: AggregateResults, scenarioName: string): void {
  const header = 'run,seed,facs_operational,facs_damaged,facs_destroyed,cost_red,cost_blue,drones_killed_red,cer\n';
  const rows = results.results.map((r, i) =>
    `${i + 1},${r.seed},${r.facilitiesOperational},${r.facilitiesDamaged},${r.facilitiesDestroyed},${r.costRed},${r.costBlue},${r.dronesDestroyedRed},${r.cer.toFixed(2)}`
  ).join('\n');

  downloadFile(
    header + rows,
    `mc-results-${slugify(scenarioName)}-${Date.now()}.csv`,
    'text/csv'
  );
}

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
