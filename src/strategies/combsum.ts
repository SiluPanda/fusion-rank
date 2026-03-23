import type { DeduplicatedDoc } from '../dedup';
import type { MissingDocStrategy } from '../types';

/**
 * CombSUM scoring.
 * CombSUM_score(d) = sum(normalize(score_i(d)))
 * For missing lists with 'default-score', adds defaultScore per missing list.
 */
export function combSumScore(
  doc: DeduplicatedDoc,
  totalLists: number,
  defaultScore: number,
  missingDocStrategy: MissingDocStrategy,
): number {
  const sum = doc.appearances.reduce((s, app) => s + (app.normalizedScore ?? 0), 0);
  if (missingDocStrategy === 'default-score') {
    const missingCount = totalLists - doc.appearances.length;
    return sum + missingCount * defaultScore;
  }
  return sum;
}
