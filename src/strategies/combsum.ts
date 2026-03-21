import type { DeduplicatedDoc } from '../dedup';

/**
 * CombSUM scoring.
 * CombSUM_score(d) = sum(normalize(score_i(d)))
 */
export function combSumScore(doc: DeduplicatedDoc): number {
  return doc.appearances.reduce((sum, app) => sum + (app.normalizedScore ?? 0), 0);
}
