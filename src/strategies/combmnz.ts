import type { DeduplicatedDoc } from '../dedup';

/**
 * CombMNZ scoring.
 * CombMNZ_score(d) = |lists containing d| * sum(normalize(score_i(d)))
 */
export function combMnzScore(doc: DeduplicatedDoc): number {
  const sum = doc.appearances.reduce((s, app) => s + (app.normalizedScore ?? 0), 0);
  return doc.appearances.length * sum;
}
