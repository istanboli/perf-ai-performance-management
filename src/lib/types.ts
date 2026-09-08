export type Locale = "en" | "ar";

export type Scope = "company" | "department" | "team" | "role" | "employee";
export type BuildMode = "scratch" | "audit" | "improve" | "ai";
export type Origin = "user" | "ai" | "assumption" | "template";
export type ObjLevel = "company" | "department" | "team" | "role" | "individual";
export type KpiStatus = "draft" | "under_review" | "approved" | "active" | "archived";
export type CheckinStatus = "on_track" | "at_risk" | "behind" | "achieved" | "not_measured";
export type Direction = "higher" | "lower" | "range" | "threshold";
export type ParmenterType = "KRI" | "RI" | "PI" | "KPI";
export type PlanTier = "free" | "pro" | "business" | "enterprise";

export type IndustryId =
  | "retail"
  | "sales"
  | "marketing"
  | "hr"
  | "finance"
  | "operations"
  | "customer_service"
  | "manufacturing"
  | "supply_chain"
  | "it"
  | "education"
  | "training"
  | "nonprofit"
  | "project_management";

export interface Workspace {
  id: string;
  userId: string;
  name: string;
  industry: string | null;
  sizeBand: string | null;
  locale: Locale;
  plan: PlanTier;
  createdAt: string;
}

export interface Organization {
  id: string;
  workspaceId: string;
  name: string;
  industry: string | null;
  sizeBand: string | null;
  businessModel: string | null;
  strategicPriorities: string | null;
  maturityNotes: string | null;
}

export interface Project {
  id: string;
  workspaceId: string;
  userId: string;
  name: string;
  scope: Scope;
  mode: BuildMode;
  industry: string | null;
  department: string | null;
  status: string;
  isDemo: boolean;
  interviewState: InterviewState | null;
  alignmentScore: number | null;
  maturityScore: number | null;
  qualityScore: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewQuestion {
  id: string;
  prompt: string;
  promptAr?: string;
  answer: string;
  skipped?: boolean;
}

export interface InterviewState {
  round: number;
  facts: Record<string, string>;
  assumptions: string[];
  missing: string[];
  questions: InterviewQuestion[];
  done: boolean;
}

export interface Objective {
  id: string;
  projectId: string;
  workspaceId: string;
  parentId: string | null;
  level: ObjLevel;
  title: string;
  description: string | null;
  ownerName: string | null;
  status: string;
  origin: Origin;
}

export interface KeyResult {
  id: string;
  objectiveId: string;
  projectId: string;
  workspaceId: string;
  name: string;
  definition: string | null;
  baseline: number | null;
  target: number | null;
  unit: string | null;
  deadline: string | null;
  ownerName: string | null;
  measurementMethod: string | null;
  progress: number | null;
  status: string;
  relatedKpiId: string | null;
  origin: Origin;
}

export interface Kpi {
  id: string;
  projectId: string;
  workspaceId: string;
  objectiveId: string | null;
  relatedKrId: string | null;
  kpiCode: string | null;
  name: string;
  definition: string | null;
  purpose: string | null;
  scope: string | null;
  ownerName: string | null;
  responsibleTeam: string | null;
  unit: string | null;
  direction: Direction | null;
  frequency: string | null;
  reviewCadence: string | null;
  baseline: number | null;
  currentValue: number | null;
  target: number | null;
  conservativeTarget: number | null;
  expectedTarget: number | null;
  stretchTarget: number | null;
  formula: string | null;
  numerator: string | null;
  denominator: string | null;
  calculationMethod: string | null;
  dataSource: string | null;
  weight: number | null;
  thresholds: Thresholds | null;
  guardrail: string | null;
  leadingLagging: string | null;
  resultDriver: string | null;
  efficiencyEffectiveness: string | null;
  qualityQuantity: string | null;
  parmenterType: ParmenterType | null;
  ipoo: string | null;
  gamingRisk: string | null;
  gamingSeverity: string | null;
  dataQualityRisk: string | null;
  definitionAmbiguity: string | null;
  ownershipRisk: string | null;
  measurementRisk: string | null;
  manipulationRisk: string | null;
  qualityScore: number | null;
  qualityNotes: QualityNotes | null;
  status: KpiStatus;
  version: string;
  origin: Origin;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Thresholds {
  red?: number;
  amber?: number;
  green?: number;
  min?: number;
  max?: number;
}

export interface QualityCriterion {
  id: string;
  label: string;
  score: number;
  max: number;
  note: string;
}

export interface QualityNotes {
  total: number;
  criteria: QualityCriterion[];
}

export interface Checkin {
  id: string;
  kpiId: string;
  projectId: string;
  workspaceId: string;
  currentValue: number | null;
  target: number | null;
  progress: number | null;
  status: CheckinStatus | null;
  comment: string | null;
  ownerName: string | null;
  recordedAt: string;
}

export interface AuditLog {
  id: string;
  workspaceId: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  detail: string | null;
  createdAt: string;
}

export interface EntityVersion {
  id: string;
  entityType: string;
  entityId: string;
  version: string;
  changeSummary: string | null;
  author: string | null;
  reason: string | null;
  previousValue: string | null;
  newValue: string | null;
  createdAt: string;
}

export interface ProjectBundle {
  project: Project;
  objectives: Objective[];
  keyResults: KeyResult[];
  kpis: Kpi[];
  checkins: Checkin[];
}

export interface AlignmentReport {
  score: number;
  reasons: string[];
  orphanKpis: string[];
  orphanKrs: string[];
  unmeasuredObjectives: string[];
  duplicates: string[];
  conflicts: string[];
}

export interface MaturityReport {
  score: number;
  categories: { id: string; label: string; score: number; note: string }[];
  weaknesses: string[];
  priorities: string[];
  plan: ImprovementAction[];
}

export interface ImprovementAction {
  phase: "1-30" | "31-60" | "61-90";
  action: string;
  owner: string;
  priority: "high" | "medium" | "low";
  expectedOutcome: string;
  relatedWeakness: string;
  deadline: string;
}

export interface GamingFinding {
  kpiId: string;
  kpiName: string;
  risk: string;
  why: string;
  severity: "high" | "medium" | "low";
  possibleBehavior: string;
  guardrail: string;
}

export interface BalanceReport {
  leading: number;
  lagging: number;
  result: number;
  driver: number;
  efficiency: number;
  effectiveness: number;
  quality: number;
  quantity: number;
  ipoo: Record<string, number>;
  parmenter: Record<string, number>;
  notes: string[];
}

export interface WeightReport {
  total: number;
  unallocated: number;
  valid: boolean;
  message: string;
}

export interface ScoreResult {
  score: number | null;
  status: CheckinStatus;
  reason: string;
}

export interface CatalogKpi {
  key: string;
  category: IndustryId;
  name: string;
  nameAr: string;
  definition: string;
  purpose: string;
  unit: string;
  direction: Direction;
  frequency: string;
  formula: string;
  numerator?: string;
  denominator?: string;
  leadingLagging: "leading" | "lagging";
  resultDriver: "result" | "driver";
  efficiencyEffectiveness: "efficiency" | "effectiveness";
  qualityQuantity: "quality" | "quantity";
  parmenterType: ParmenterType;
  ipoo: "input" | "process" | "output" | "outcome";
  gamingRisk: string;
  gamingSeverity: "high" | "medium" | "low";
  guardrail: string;
  dataSource: string;
}

export const INDUSTRIES: { id: IndustryId; en: string; ar: string }[] = [
  { id: "retail", en: "Retail", ar: "التجزئة" },
  { id: "sales", en: "Sales", ar: "المبيعات" },
  { id: "marketing", en: "Marketing", ar: "التسويق" },
  { id: "hr", en: "Human Resources", ar: "الموارد البشرية" },
  { id: "finance", en: "Finance", ar: "المالية" },
  { id: "operations", en: "Operations", ar: "العمليات" },
  { id: "customer_service", en: "Customer Service", ar: "خدمة العملاء" },
  { id: "manufacturing", en: "Manufacturing", ar: "التصنيع" },
  { id: "supply_chain", en: "Supply Chain", ar: "سلسلة الإمداد" },
  { id: "it", en: "IT", ar: "تقنية المعلومات" },
  { id: "education", en: "Education", ar: "التعليم" },
  { id: "training", en: "Training", ar: "التدريب" },
  { id: "nonprofit", en: "Nonprofit", ar: "غير ربحي" },
  { id: "project_management", en: "Project Management", ar: "إدارة المشاريع" },
];

export const SIZE_BANDS = [
  { id: "1-20", en: "1–20 people", ar: "1–20 شخصاً" },
  { id: "21-100", en: "21–100 people", ar: "21–100 شخص" },
  { id: "101-500", en: "101–500 people", ar: "101–500 شخص" },
  { id: "500+", en: "500+ people", ar: "أكثر من 500" },
];

export const SCOPES: { id: Scope; en: string; ar: string }[] = [
  { id: "company", en: "Company system", ar: "نظام الشركة" },
  { id: "department", en: "Department system", ar: "نظام القسم" },
  { id: "team", en: "Team system", ar: "نظام الفريق" },
  { id: "role", en: "Role / position system", ar: "نظام الدور الوظيفي" },
  { id: "employee", en: "Individual employee", ar: "الموظف الفرد" },
];

export const MODES: { id: BuildMode; en: string; ar: string; hint: string; hintAr: string }[] = [
  {
    id: "scratch",
    en: "Build from scratch",
    ar: "البناء من الصفر",
    hint: "Create a new performance system.",
    hintAr: "إنشاء نظام أداء جديد.",
  },
  {
    id: "audit",
    en: "Audit existing system",
    ar: "تدقيق النظام الحالي",
    hint: "Paste or upload KPIs and analyse them.",
    hintAr: "الصق أو ارفع مؤشراتك الحالية وحللها.",
  },
  {
    id: "improve",
    en: "Improve existing system",
    ar: "تحسين النظام الحالي",
    hint: "Take existing KPIs and strengthen them.",
    hintAr: "خذ المؤشرات الحالية وحسّنها.",
  },
  {
    id: "ai",
    en: "AI recommended",
    ar: "توصية الذكاء الاصطناعي",
    hint: "Answer a short interview and let the architect propose a structure.",
    hintAr: "أجب عن مقابلة قصيرة ودع المعماري يقترح الهيكل.",
  },
];
