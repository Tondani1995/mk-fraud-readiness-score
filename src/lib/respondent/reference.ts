import { randomBytes } from 'crypto';

export function createAssessmentReference(date = new Date()): string {
  const year = date.getUTCFullYear();
  const randomPart = randomBytes(5).toString('hex').toUpperCase();
  return `MKFRS-${year}-${randomPart}`;
}
