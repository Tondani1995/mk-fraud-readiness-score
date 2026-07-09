export type MaturityBand = 'Reactive' | 'Developing' | 'Structured' | 'Strategic';
export type ExposureBand = 'Low' | 'Moderate' | 'High' | 'Severe';

export interface ScoreRunRecord {
  id: string;
  assessmentId: string;
  overallScore: number;
  calculatedMaturity: MaturityBand;
  finalMaturity: MaturityBand;
  exposureScore: number;
  exposureBand: ExposureBand;
  coveragePct: number;
  nARatePct: number;
  criticalGapCount: number;
  majorGapCount: number;
  capApplied: boolean;
  capReason: string | null;
}

export interface DomainResultRecord {
  domainCode: string;
  domainName: string;
  weightPct: number;
  rawScore: number | null;
  weightedContribution: number | null;
  coveragePct: number | null;
  criticalGapCount: number;
}

export interface GapQuestionRecord {
  questionCode: string;
  domainCode: string;
  domainName: string;
  prompt: string;
  responseValue: number | null;
  isCritical: boolean;
  isHardGate: boolean;
  isCriticalGap: boolean;
  isMajorGap: boolean;
}

export interface ExposureAnswerRecord {
  factorCode: string;
  name: string;
  selectedLabel: string;
  pointsAwarded: number;
  maxPoints: number;
}

export interface MaturityCapEventRecord {
  ruleCode: string;
  capTo: MaturityBand;
  reason: string;
  relatedQuestionCode: string | null;
  relatedDomainCode: string | null;
}

export interface RecommendationRuleRecord {
  ruleCode: string;
  title: string;
  severity: string;
  action30: string | null;
  action60: string | null;
  action90: string | null;
  firedForDomainCodes: string[];
}

export interface AssembledReportData {
  orderId: string;
  organisationName: string;
  respondentName: string;
  assessmentReference: string;
  reportReference: string;
  generatedAt: string;
  packageName: string;
  productCode: string | null;
  scoreRun: ScoreRunRecord;
  domainResults: DomainResultRecord[];
  exposureAnswers: ExposureAnswerRecord[];
  criticalMajorGaps: GapQuestionRecord[];
  maturityCapEvents: MaturityCapEventRecord[];
  recommendationRules: RecommendationRuleRecord[];
}

export interface ContentBlock {
  blockKey: string;
  blockType: 'executive_summary' | 'domain_narrative' | 'gap_commentary' | 'false_comfort' | 'leadership_attention' | 'next_step_pathway';
  domainCode: string | null;
  maturityBand: MaturityBand | null;
  severity: string | null;
  title: string | null;
  body: string | null;
  status: 'draft' | 'active' | 'retired';
}

export interface SelectedContent {
  executiveSummary: { title: string; body: string; usedFallback: boolean };
  falseComfort: { title: string; body: string; usedFallback: boolean };
  leadershipAttention: { body: string; usedFallback: boolean };
  domainNarratives: Record<string, { title: string; body: string; usedFallback: boolean }>;
  gapCommentary: Record<string, { body: string; usedFallback: boolean }>;
}

export interface RoadmapItem {
  ruleCode: string;
  domainCode: string | null;
  domainName: string;
  ownerRole: string;
  rationale: string;
  severity: string;
  action30: string | null;
  action60: string | null;
  action90: string | null;
  priorityScore: number;
}
