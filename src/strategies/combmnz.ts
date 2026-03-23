import type { DeduplicatedDoc } from '../dedup';
import type { MissingDocStrategy } from '../types';

/**
 * CombMNZ scoring.
 * CombMNZ_score(d) = |lists containing d| * sum(normalize(score_i(d)))
 * For missing lists with 'default-score', adds defaultScore per missing list to the sum.
 * The multiplier remains the count of lists where the doc actually appeared.
 */
export function combMnzScore(
  doc: DeduplicatedDoc,
  totalLists: number,
  defaultScore: number,
  missingDocStrategy: MissingDocStrategy,
): number {
  let sum = doc.appearances.reduce((s, app) => s + (app.normalizedScore ?? 0), 0);
  if (missingDocStrategy === 'default-score') {
    const missingCount = totalLists - doc.appearances.length;
    sum += missingCount * defaultScore;
  }
  return doc.appearances.length * sum;
}
