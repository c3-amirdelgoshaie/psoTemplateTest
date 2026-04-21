/*
 * Crude Schedule Optimizer — TypeScript interfaces.
 *
 * Mirror the C3 data model in psoTest/src/{input,output,scenario,recommendation}.
 * Field names match the seed JSON EXACTLY so the UI renders straight from the
 * backend contract with no transformation layer.
 */

export type VesselType = 'VLCC' | 'Suezmax' | 'Aframax';
export type CargoStatus = 'Confirmed' | 'Provisional' | 'At Risk';
export type TankGroup = 'HighSulphur' | 'LowSulphur' | 'Slops';
export type DecisionKind =
  | 'HOLD'
  | 'REORDER'
  | 'SUBSTITUTE'
  | 'DEFER'
  | 'DROP'
  | 'RETIME'
  | 'NOMINATE_TANK';
export type ObjectiveMode = 'MaxGRM' | 'MinDemurrage' | 'MinLogistics' | 'Balanced';
export type RecommendationStatus = 'Proposed' | 'Accepted' | 'Rejected' | 'Modified' | 'Completed';
export type Priority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface Cargo {
  cargoId: string;
  vesselName: string;
  imoNumber?: string;
  vesselType: VesselType;
  crudeGrade: string;
  originRegion?: string;
  volumeBbls: number;
  loadingPort?: string;
  laycanStart: string;
  laycanEnd: string;
  etaTerminal?: string;
  destinationTerminal?: string;
  charterPartyRef?: string;
  status: CargoStatus;
  nominatedTanks?: string[];
  currentLat?: number;
  currentLon?: number;
  demurrageRiskLevel?: 'None' | 'Low' | 'Medium' | 'High';
  demurrageRateUsdDay?: number;
  freightCostUsd?: number;
  isFixed: boolean;
}

export interface Tank {
  tankId: string;
  name?: string;
  tankGroup: TankGroup;
  crudeGrade?: string;
  currentVolumeBbls: number;
  capacityBbls: number;
  ullageBbls?: number;
  lastUpdated?: string;
}

export interface CrudeItem {
  itemId: string;
  name: string;
  gradeFamily: string;
  originRegion?: string;
  apiGravity: number;
  sulphurPct: number;
  tankGroup: TankGroup;
  priceDifferentialUsdBbl?: number;
  priceDifferentialAsOf?: string;
  grmContributionUsdBbl?: number;
  itemType: string;
}

export interface BlendConstraint {
  constraintId: string;
  name: string;
  metric: string;
  limitType: 'LE' | 'GE' | 'EQ';
  limitValue: number;
  currentValue?: number;
  status?: 'OK' | 'WARNING' | 'VIOLATED';
  version?: string;
}

export interface Cdu {
  cduId: string;
  name?: string;
  plannedThroughputBpd: number;
  minThroughputBpd: number;
  maxThroughputBpd: number;
  blendConstraints?: BlendConstraint[];
  lpTargetByGrade?: Record<string, number[]>;
}

export interface MaintenanceWindow {
  windowId: string;
  cduId: string;
  startDate: string;
  endDate: string;
  reason?: string;
  description?: string;
}

export interface TankTransfer {
  transferId: string;
  fromTankId: string;
  toTankId: string;
  crudeGrade: string;
  volumeBbls: number;
  startDate: string;
  endDate: string;
  status: 'Scheduled' | 'In Progress' | 'Completed';
  reason?: string;
}

export interface ItemFacility {
  itemId: string;
  initialInventoryBbls?: number;
  arrivalsBblsByDay?: number[];
  demandBblsByDay?: number[];
  safetyStockBbls?: number;
  holdingCostUsdBblDay?: number;
}

export interface Facility {
  facilityId: string;
  name?: string;
  tanks: Tank[];
  cdus: Cdu[];
  cargoes: Cargo[];
  maintenanceWindows?: MaintenanceWindow[];
  tankTransfers?: TankTransfer[];
  items?: ItemFacility[];
}

export interface PsoInput {
  id: string;
  refineryId: string;
  planningHorizonDays: number;
  startDate: string;
  endDate: string;
  lpTargetVersion?: string;
  dataFreshness?: Record<string, string>;
  facilities: Facility[];
  items: CrudeItem[];
  berthCount: number;
  pipelineCapacityBblsPerDay?: number;
  flexDays: number;
}

export interface ReorderPlan {
  totalQtyKbbls: number;
  crudeGrade: string;
  originRegion?: string;
  orderByDate: string;
  expectedArrivalWindowStart: string;
  expectedArrivalWindowEnd: string;
}

export interface RiskFlag {
  /**
   * Flag kind. Named `flagType` (not `type`) to avoid clashing with the
   * reserved `type` method on C3 types.
   */
  flagType:
    | 'DEMURRAGE_RISK'
    | 'STOCKOUT_RISK'
    | 'OVERSTOCK_RISK'
    | 'BLEND_VIOLATION'
    | 'PIPELINE_CONFLICT'
    | 'BERTH_CONFLICT';
  severity: number;
  summary: string;
  recommendedAction: string;
  cargoId?: string;
  crudeGrade?: string;
  tankId?: string;
  cduId?: string;
  dayOffset?: number;
  impactUsd?: number;
}

export interface Anomaly {
  /** Anomaly kind. Named `anomalyType` to avoid the reserved `type` method. */
  anomalyType: string;
  description: string;
  severity: number;
  dayOffset?: number;
  objectId?: string;
  objectKind?: string;
}

export interface Schedule {
  cargoId: string;
  decision: DecisionKind;
  berthStartDay: number;
  berthEndDay: number;
  assignedTanks: string[];
  substitutedWithGrade?: string;
  deferredToDay?: number;
  demurrageDays: number;
  demurrageCostUsd: number;
  isOnTime: boolean;
}

export interface Recommendation {
  recommendationId: string;
  cargoId?: string;
  crudeGrade?: string;
  decision: DecisionKind;
  confidence: number;
  expectedImpactUsd?: number;
  title: string;
  summary?: string;
  evidence: string[];
  assumptions?: string[];
  risks?: string[];
  nextActions?: string[];
  reorderPlan?: ReorderPlan | null;
  riskFlags?: RiskFlag[];
  anomalies?: Anomaly[];
  priority: Priority;
  metadata: Record<string, unknown>;
}

/** Persisted form of a recommendation (entity) with feedback lifecycle. */
export interface PersistedRecommendation extends Recommendation {
  id: string;
  scenarioId: string;
  runId?: string;
  status: RecommendationStatus;
  createdAt: string;
  actedOnAt?: string;
  actedOnBy?: string;
  feedbackNotes?: string;
  realizedOutcomeUsd?: number;
}

export interface Kpis {
  throughputBpd: number;
  daysOfCoverHs: number;
  daysOfCoverLs: number;
  scheduledArrivalsNext14d: number;
  openDemurrageRiskUsd: number;
  grmUsdPerBbl: number;
  grmUsdAnnualizedMM: number;
  opportunityUsdAnnualizedMM: number;
  blendViolationCount: number;
  objectiveValue?: number;
  objectiveMode?: ObjectiveMode;
}

export interface PsoOutput {
  id: string;
  status: 'optimal' | 'time_limit' | 'infeasible' | 'fallback' | 'error';
  objectiveValue: number;
  solveTimeSeconds: number;
  solvedAt: string;
  scenarioId: string;
  objectiveMode: ObjectiveMode;
  schedules: Schedule[];
  recommendations: Recommendation[];
  kpis: Kpis;
  riskFlags: RiskFlag[];
  anomalies: Anomaly[];
  cduChargeByDay: Record<string, Record<string, number[]>>;
  tankInventoryByDay: Record<string, Record<string, number[]>>;
  metadata: {
    solver?: 'gurobi' | 'heuristic';
    missingFields?: string[];
    dataSourcesUsed?: string[];
    dataFreshness?: Record<string, string>;
    lpTargetVersion?: string;
    gurobiStatus?: number | null;
    fallbackReason?: string;
  };
}

export interface Scenario {
  id: string;
  name: string;
  description?: string;
  objective: ObjectiveMode;
  status: 'Draft' | 'Running' | 'Complete' | 'Failed';
  createdAt: string;
  lastRunAt?: string;
  parameterChanges?: Record<string, unknown>;
  inputSnapshot?: unknown;
  output?: {
    status: string;
    objectiveValue: number;
    schedules: unknown[];
    recommendations: unknown[];
    kpis: Kpis;
    solveTimeSeconds?: number;
    solver?: string;
  };
  baselineKpis?: Kpis;
  scenarioKpis?: Kpis;
  kpiDeltas?: Partial<Kpis>;
  createdBy?: string;
}

/* Global filter state. */
export type HorizonDays = 7 | 14 | 30;
export type GradeFamilyFilter = 'All' | 'Arab Light' | 'Urals' | 'CPC Blend' | 'Azeri' | 'Other';
export type VesselStatusFilter = 'All' | CargoStatus;

export interface GlobalFilters {
  horizon: HorizonDays;
  refineryId: string;
  gradeFamily: GradeFamilyFilter;
  vesselStatus: VesselStatusFilter;
}
