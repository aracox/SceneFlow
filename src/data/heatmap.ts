import { MAP_CENTER, hashSeed, mulberry32, offsetCoordinate } from '../services/geometryUtils';

export type HeatmapMetric = 'traffic' | 'congestion' | 'incidents' | 'safety-risk';
export type HeatmapTimeMode = 'live' | 'historical';
export type HotspotSeverity = 'low' | 'moderate' | 'high' | 'critical';
export type HeatmapComparison =
  | 'none'
  | 'previous-period'
  | 'yesterday'
  | 'previous-week'
  | 'normal-baseline';
export type HeatmapDisplayStyle = 'density' | 'clusters' | 'risk-zones';
export type HeatmapPeriod = 'today' | 'yesterday' | 'last-7-days' | 'last-30-days' | 'custom-range';

export interface HeatmapPointDetails {
  flowRate?: number;
  density?: number;
  averageSpeed?: number;
  queueLength?: number;
  durationMinutes?: number;
  totalIncidents?: number;
  activeIncidents?: number;
  criticalIncidents?: number;
  accidents?: number;
  nearMisses?: number;
  wrongWayMovements?: number;
  restrictedIntrusions?: number;
  unsafeProximityEvents?: number;
  suddenStops?: number;
}

export interface HeatmapPoint {
  id: string;
  locationName: string;
  zoneId: string;
  siteId: string;
  latitude: number;
  longitude: number;
  intensity: number;
  value: number;
  unit: string;
  previousValue: number;
  percentageChange: number;
  severity: HotspotSeverity;
  activeIncidentIds: string[];
  description: string;
  operationalImpact: string;
  suggestedAction?: string;
  details: HeatmapPointDetails;
}

export interface HeatmapDataset {
  metric: HeatmapMetric;
  timeMode: HeatmapTimeMode;
  period: HeatmapPeriod;
  updatedAt: string;
  points: HeatmapPoint[];
}

export interface OperationalZone {
  id: string;
  name: string;
  siteId: string;
  siteName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  metersEast: number;
  metersNorth: number;
}

export interface HeatmapNavigationContext {
  zone: string;
  metric: HeatmapMetric;
  period: HeatmapPeriod;
  site: string;
}

export const HEATMAP_METRICS: Array<{ id: HeatmapMetric; label: string }> = [
  { id: 'traffic', label: 'Traffic' },
  { id: 'congestion', label: 'Congestion' },
  { id: 'incidents', label: 'Incidents' },
  { id: 'safety-risk', label: 'Safety Risk' },
];

export const OPERATIONAL_ZONES: OperationalZone[] = [
  { id: 'transit-hub', name: 'Transit Hub', siteId: 'central-campus', siteName: 'Central Campus', x: 20, y: 21, width: 18, height: 15, metersEast: -220, metersNorth: 210 },
  { id: 'medical-center', name: 'Medical Center', siteId: 'medical-campus', siteName: 'Medical Campus', x: 72, y: 22, width: 20, height: 17, metersEast: 205, metersNorth: 205 },
  { id: 'retail-zone', name: 'Retail Zone', siteId: 'central-campus', siteName: 'Central Campus', x: 21, y: 53, width: 20, height: 16, metersEast: -215, metersNorth: -35 },
  { id: 'logistics-yard', name: 'Logistics Yard', siteId: 'logistics-campus', siteName: 'Logistics Campus', x: 75, y: 68, width: 22, height: 18, metersEast: 240, metersNorth: -205 },
  { id: 'parking', name: 'Parking', siteId: 'central-campus', siteName: 'Central Campus', x: 49, y: 79, width: 22, height: 13, metersEast: 0, metersNorth: -305 },
  { id: 'internal-junction', name: 'Internal Junction', siteId: 'central-campus', siteName: 'Central Campus', x: 48, y: 47, width: 13, height: 13, metersEast: -10, metersNorth: 15 },
  { id: 'gate-b', name: 'Gate B', siteId: 'central-campus', siteName: 'Central Campus', x: 13, y: 78, width: 11, height: 11, metersEast: -300, metersNorth: -285 },
  { id: 'er-drop-off', name: 'ER Drop-off', siteId: 'medical-campus', siteName: 'Medical Campus', x: 81, y: 39, width: 13, height: 10, metersEast: 290, metersNorth: 75 },
];

const pointAt = (
  zoneId: string,
  metric: HeatmapMetric,
  value: number,
  unit: string,
  previousValue: number,
  intensity: number,
  severity: HotspotSeverity,
  details: HeatmapPointDetails,
  description: string,
  operationalImpact: string,
  suggestedAction: string,
  activeIncidentIds: string[],
): HeatmapPoint => {
  const zone = OPERATIONAL_ZONES.find((item) => item.id === zoneId);
  if (!zone) throw new Error(`Unknown heatmap zone: ${zoneId}`);
  const [longitude, latitude] = offsetCoordinate(MAP_CENTER, zone.metersEast, zone.metersNorth);
  return {
    id: `${metric}-${zoneId}`,
    locationName: zone.name,
    zoneId,
    siteId: zone.siteId,
    latitude,
    longitude,
    intensity,
    value,
    unit,
    previousValue,
    percentageChange: Math.round(((value - previousValue) / Math.max(previousValue, 1)) * 100),
    severity,
    activeIncidentIds,
    description,
    operationalImpact,
    suggestedAction,
    details,
  };
};

const DATASETS: Record<HeatmapMetric, HeatmapPoint[]> = {
  traffic: [
    pointAt('gate-b', 'traffic', 3821, 'vehicles', 3238, 96, 'critical', { flowRate: 476 }, 'Inbound traffic is exceeding the normal arrival profile.', 'Estimated arrival delay of 12 minutes.', 'Open Gate C and deploy one traffic-control team.', ['INC-1042', 'INC-1048']),
    pointAt('internal-junction', 'traffic', 2860, 'vehicles', 2470, 79, 'high', { flowRate: 351 }, 'Cross-campus flow is building at the internal junction.', 'Service vehicles are losing an estimated 7 minutes per trip.', 'Prioritize northbound flow for the next signal cycle.', ['INC-1051']),
    pointAt('retail-zone', 'traffic', 2194, 'vehicles', 2250, 66, 'high', { flowRate: 282 }, 'Retail entrance volume remains elevated but stable.', 'Pedestrian crossing windows are becoming constrained.', 'Place a marshal at the retail crossing.', ['INC-1046']),
    pointAt('er-drop-off', 'traffic', 1748, 'vehicles', 1494, 58, 'moderate', { flowRate: 210 }, 'Drop-off activity is increasing ahead of the evening peak.', 'Ambulance approach lanes remain open.', 'Keep the emergency lane clear and monitor arrivals.', ['INC-1054']),
    pointAt('transit-hub', 'traffic', 1435, 'vehicles', 1520, 45, 'moderate', { flowRate: 188 }, 'Transit turnover is within the expected operating band.', 'No material delay to scheduled departures.', 'Continue routine monitoring.', []),
    pointAt('logistics-yard', 'traffic', 1186, 'vehicles', 980, 42, 'moderate', { flowRate: 164 }, 'Delivery arrivals are clustering around shift change.', 'Dock allocation may be delayed by 5 minutes.', 'Sequence arrivals by assigned loading bay.', ['INC-1050']),
    pointAt('medical-center', 'traffic', 824, 'vehicles', 790, 28, 'moderate', { flowRate: 112 }, 'Medical Center traffic is close to baseline.', 'Patient access remains unaffected.', 'No immediate action required.', []),
    pointAt('parking', 'traffic', 486, 'vehicles', 540, 18, 'low', { flowRate: 68 }, 'Parking circulation is below the normal baseline.', 'Available capacity is improving.', 'Maintain current lane configuration.', []),
  ],
  congestion: [
    pointAt('gate-b', 'congestion', 42, 'min', 28, 93, 'critical', { density: 88, averageSpeed: 6, queueLength: 28, durationMinutes: 42 }, 'Exit speed is declining while inbound flow continues to rise.', 'Estimated arrival delay of 12 minutes.', 'Open Gate C and deploy one traffic-control team.', ['INC-1042', 'INC-1048']),
    pointAt('er-drop-off', 'congestion', 38, 'min', 31, 84, 'high', { density: 76, averageSpeed: 8, queueLength: 21, durationMinutes: 38 }, 'Drop-off dwell times are blocking the inner approach lane.', 'Emergency arrivals may experience a 6-minute delay.', 'Move long-dwell vehicles to overflow parking.', ['INC-1054']),
    pointAt('internal-junction', 'congestion', 31, 'min', 22, 76, 'high', { density: 72, averageSpeed: 9, queueLength: 19, durationMinutes: 31 }, 'Signal imbalance is causing a northbound queue.', 'Campus shuttle reliability is at risk.', 'Extend the northbound green phase for two cycles.', ['INC-1051']),
    pointAt('logistics-yard', 'congestion', 26, 'min', 19, 64, 'high', { density: 67, averageSpeed: 10, queueLength: 16, durationMinutes: 26 }, 'Loading-bay turnover is slower than the normal shift profile.', 'Three scheduled deliveries may miss dock windows.', 'Reassign Bay 4 for overflow unloading.', ['INC-1050']),
    pointAt('retail-zone', 'congestion', 18, 'min', 20, 48, 'moderate', { density: 52, averageSpeed: 14, queueLength: 11, durationMinutes: 18 }, 'Retail access is busy but recovering.', 'Minor delay at the pedestrian crossing.', 'Continue monitoring crossing demand.', ['INC-1046']),
    pointAt('transit-hub', 'congestion', 14, 'min', 17, 35, 'moderate', { density: 41, averageSpeed: 18, queueLength: 8, durationMinutes: 14 }, 'Transit circulation is improving.', 'Departure lanes are operating normally.', 'No immediate action required.', []),
    pointAt('medical-center', 'congestion', 9, 'min', 11, 24, 'low', { density: 28, averageSpeed: 23, queueLength: 5, durationMinutes: 9 }, 'Internal medical access remains clear.', 'No operational impact.', 'Maintain current access controls.', []),
    pointAt('parking', 'congestion', 6, 'min', 8, 16, 'low', { density: 21, averageSpeed: 19, queueLength: 3, durationMinutes: 6 }, 'Parking circulation is unconstrained.', 'No operational impact.', 'No action required.', []),
  ],
  incidents: [
    pointAt('logistics-yard', 'incidents', 12, 'incidents', 8, 96, 'critical', { totalIncidents: 12, activeIncidents: 3, criticalIncidents: 2 }, 'Repeated loading conflicts and restricted-lane entries are driving incident volume.', 'Two loading bays are operating at reduced capacity.', 'Dispatch the yard supervisor and isolate Bay 2.', ['INC-1050', 'INC-1056', 'INC-1059']),
    pointAt('internal-junction', 'incidents', 9, 'incidents', 7, 82, 'high', { totalIncidents: 9, activeIncidents: 3, criticalIncidents: 1 }, 'Turning conflicts account for most active incidents.', 'Shuttle and service vehicle routes are affected.', 'Deploy a traffic-control team at the junction.', ['INC-1051', 'INC-1058', 'INC-1061']),
    pointAt('gate-b', 'incidents', 7, 'incidents', 5, 74, 'high', { totalIncidents: 7, activeIncidents: 2, criticalIncidents: 1 }, 'Queue spillback is contributing to minor collisions and blocked access.', 'Gate throughput is reduced by approximately 20%.', 'Open Gate C and clear the shoulder lane.', ['INC-1042', 'INC-1048']),
    pointAt('er-drop-off', 'incidents', 6, 'incidents', 4, 65, 'high', { totalIncidents: 6, activeIncidents: 2, criticalIncidents: 1 }, 'Long vehicle dwell times are generating access conflicts.', 'Emergency access remains available but constrained.', 'Move waiting vehicles to the holding area.', ['INC-1054', 'INC-1060']),
    pointAt('retail-zone', 'incidents', 5, 'incidents', 6, 49, 'moderate', { totalIncidents: 5, activeIncidents: 1, criticalIncidents: 0 }, 'Retail incidents are trending down from the previous period.', 'No major operational disruption.', 'Continue pedestrian marshal coverage.', ['INC-1046']),
    pointAt('transit-hub', 'incidents', 4, 'incidents', 4, 37, 'moderate', { totalIncidents: 4, activeIncidents: 1, criticalIncidents: 0 }, 'Transit incidents are within the expected range.', 'Departure service remains normal.', 'Monitor the active platform incident.', ['INC-1062']),
    pointAt('medical-center', 'incidents', 2, 'incidents', 3, 22, 'low', { totalIncidents: 2, activeIncidents: 0, criticalIncidents: 0 }, 'No active incidents are affecting medical access.', 'No operational impact.', 'No action required.', []),
    pointAt('parking', 'incidents', 1, 'incidents', 2, 14, 'low', { totalIncidents: 1, activeIncidents: 0, criticalIncidents: 0 }, 'Parking incident activity is low.', 'No operational impact.', 'No action required.', []),
  ],
  'safety-risk': [
    pointAt('internal-junction', 'safety-risk', 86, '/ 100', 77, 97, 'critical', { accidents: 2, nearMisses: 7, wrongWayMovements: 2, restrictedIntrusions: 0, unsafeProximityEvents: 6, suddenStops: 9 }, 'Near misses and sudden stopping events are rising at crossing movements.', 'A collision could block the primary campus corridor.', 'Deploy a traffic-control team and reduce approach speed.', ['INC-1051', 'INC-1058']),
    pointAt('logistics-yard', 'safety-risk', 81, '/ 100', 68, 91, 'critical', { accidents: 1, nearMisses: 6, wrongWayMovements: 1, restrictedIntrusions: 4, unsafeProximityEvents: 5, suddenStops: 7 }, 'Restricted-zone intrusions and reversing conflicts are elevated.', 'Staff safety risk is high around active loading bays.', 'Pause Bay 2 operations for a safety inspection.', ['INC-1050', 'INC-1059']),
    pointAt('er-drop-off', 'safety-risk', 69, '/ 100', 61, 76, 'high', { accidents: 1, nearMisses: 5, wrongWayMovements: 0, restrictedIntrusions: 1, unsafeProximityEvents: 7, suddenStops: 5 }, 'Pedestrian and vehicle proximity is above the safe operating range.', 'Emergency access has increased conflict exposure.', 'Add a marshal and separate pedestrian flow.', ['INC-1054']),
    pointAt('gate-b', 'safety-risk', 63, '/ 100', 54, 70, 'high', { accidents: 1, nearMisses: 4, wrongWayMovements: 2, restrictedIntrusions: 0, unsafeProximityEvents: 3, suddenStops: 8 }, 'Queue pressure is producing wrong-way movements and sudden stops.', 'Entry-lane conflict risk is increasing.', 'Open the overflow gate and add directional barriers.', ['INC-1042', 'INC-1048']),
    pointAt('retail-zone', 'safety-risk', 48, '/ 100', 52, 52, 'moderate', { accidents: 0, nearMisses: 4, wrongWayMovements: 0, restrictedIntrusions: 0, unsafeProximityEvents: 6, suddenStops: 3 }, 'Pedestrian interaction remains the dominant safety factor.', 'Crossing delay is manageable.', 'Maintain marshal coverage during peak periods.', ['INC-1046']),
    pointAt('transit-hub', 'safety-risk', 41, '/ 100', 45, 44, 'moderate', { accidents: 0, nearMisses: 3, wrongWayMovements: 0, restrictedIntrusions: 0, unsafeProximityEvents: 4, suddenStops: 2 }, 'Platform access risk is stable and improving.', 'No major operational impact.', 'Continue routine monitoring.', []),
    pointAt('medical-center', 'safety-risk', 24, '/ 100', 29, 26, 'low', { accidents: 0, nearMisses: 1, wrongWayMovements: 0, restrictedIntrusions: 0, unsafeProximityEvents: 2, suddenStops: 1 }, 'Medical Center risk remains low.', 'No operational impact.', 'No action required.', []),
    pointAt('parking', 'safety-risk', 18, '/ 100', 21, 18, 'low', { accidents: 0, nearMisses: 1, wrongWayMovements: 0, restrictedIntrusions: 0, unsafeProximityEvents: 1, suddenStops: 2 }, 'Parking activity is within the normal safety band.', 'No operational impact.', 'No action required.', []),
  ],
};

const PERIOD_FACTORS: Record<HeatmapPeriod, number> = {
  today: 1,
  yesterday: 0.94,
  'last-7-days': 1.08,
  'last-30-days': 1.14,
  'custom-range': 0.98,
};

const COMPARISON_FACTORS: Record<HeatmapComparison, number | null> = {
  none: null,
  'previous-period': 0.96,
  yesterday: 0.92,
  'previous-week': 0.88,
  'normal-baseline': 1,
};

export const HEATMAP_LEGENDS: Record<HeatmapMetric, Array<{ severity: HotspotSeverity; label: string }>> = {
  traffic: [
    { severity: 'low', label: '< 500 vehicles' },
    { severity: 'moderate', label: '500–1,500' },
    { severity: 'high', label: '1,501–3,000' },
    { severity: 'critical', label: '> 3,000' },
  ],
  congestion: [
    { severity: 'low', label: '< 10 min' },
    { severity: 'moderate', label: '10–20 min' },
    { severity: 'high', label: '21–40 min' },
    { severity: 'critical', label: '> 40 min' },
  ],
  incidents: [
    { severity: 'low', label: '0–2 incidents' },
    { severity: 'moderate', label: '3–5 incidents' },
    { severity: 'high', label: '6–10 incidents' },
    { severity: 'critical', label: '> 10 incidents' },
  ],
  'safety-risk': [
    { severity: 'low', label: '0–25' },
    { severity: 'moderate', label: '26–50' },
    { severity: 'high', label: '51–75' },
    { severity: 'critical', label: '76–100' },
  ],
};

export function getHeatmapDataset(
  metric: HeatmapMetric,
  timeMode: HeatmapTimeMode,
  period: HeatmapPeriod,
  comparison: HeatmapComparison,
  updatedAt: string,
): HeatmapDataset {
  const periodFactor = timeMode === 'live' ? 1 : PERIOD_FACTORS[period];
  const comparisonFactor = COMPARISON_FACTORS[comparison];
  const refreshBucket = timeMode === 'live' ? Math.floor(Date.parse(updatedAt) / 10_000) : 0;
  const points = DATASETS[metric].map((point) => {
    const random = mulberry32(hashSeed(`${point.id}-${period}-${refreshBucket}`));
    const liveFactor = timeMode === 'live' ? 0.975 + random() * 0.05 : 1;
    const value = Math.max(0, Math.round(point.value * periodFactor * liveFactor));
    const baseline = comparisonFactor === null
      ? value
      : Math.max(1, Math.round(point.previousValue * comparisonFactor * periodFactor));
    return {
      ...point,
      value,
      previousValue: baseline,
      percentageChange: comparisonFactor === null
        ? 0
        : Math.round(((value - baseline) / baseline) * 100),
    };
  });
  return { metric, timeMode, period, updatedAt, points };
}

export function formatHeatmapValue(point: HeatmapPoint, metric: HeatmapMetric): string {
  if (metric === 'safety-risk') return `${point.value} / 100`;
  return `${point.value.toLocaleString('en-US')} ${point.unit}`;
}

export function buildLiveOperationsUrl(context: HeatmapNavigationContext): string {
  const params = new URLSearchParams({
    zone: context.zone,
    metric: context.metric,
    period: context.period,
    site: context.site,
  });
  return `/map?${params.toString()}`;
}
