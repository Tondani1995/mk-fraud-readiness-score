export type DeterministicAdvisoryFailureCode =
  | 'semantic_mapping_missing'
  | 'question_playbook_missing'
  | 'deterministic_advisory_invalid';

export class DeterministicAdvisoryError extends Error {
  readonly code: DeterministicAdvisoryFailureCode;
  readonly questionCode?: string;
  readonly methodologyVersionId?: string;

  constructor(
    code: DeterministicAdvisoryFailureCode,
    message: string,
    details: { questionCode?: string; methodologyVersionId?: string } = {}
  ) {
    super(message);
    this.name = 'DeterministicAdvisoryError';
    this.code = code;
    this.questionCode = details.questionCode;
    this.methodologyVersionId = details.methodologyVersionId;
  }
}

export class SemanticMappingMissingError extends DeterministicAdvisoryError {
  constructor(questionCode: string, methodologyVersionId?: string) {
    super(
      'semantic_mapping_missing',
      `No explicit primary semantic mapping is registered for ${questionCode}.`,
      { questionCode, methodologyVersionId }
    );
    this.name = 'SemanticMappingMissingError';
  }
}

export class QuestionPlaybookMissingError extends DeterministicAdvisoryError {
  constructor(questionCode: string, methodologyVersionId?: string) {
    super(
      'question_playbook_missing',
      `No exact question playbook is registered for ${questionCode}.`,
      { questionCode, methodologyVersionId }
    );
    this.name = 'QuestionPlaybookMissingError';
  }
}

export function isDeterministicAdvisoryError(error: unknown): error is DeterministicAdvisoryError {
  return error instanceof DeterministicAdvisoryError;
}
