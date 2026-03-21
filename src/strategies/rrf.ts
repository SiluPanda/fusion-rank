import type { DeduplicatedDoc } from '../dedup';
import type { MissingDocStrategy } from '../types';

/**
 * Reciprocal Rank Fusion scoring.
 * RRF_score(d) = sum(1 / (k + rank_i(d)))
 */
export function rrfScore(
  doc: DeduplicatedDoc,
  totalLists: number,
  listLengths: number[],
  k: number,
  missingDocStrategy: MissingDocStrategy,
): number {
  let score = 0;

  if (missingDocStrategy === 'skip') {
    // Only sum over lists where the document appears
    for (const app of doc.appearances) {
      score += 1 / (k + app.rank);
    }
  } else {
    // Sum over all lists; missing docs get worst-rank
    for (let i = 0; i < totalLists; i++) {
      const app = doc.appearances.find(a => a.listIndex === i);
      if (app) {
        score += 1 / (k + app.rank);
      } else if (missingDocStrategy === 'worst-rank') {
        const worstRank = listLengths[i] + 1;
        score += 1 / (k + worstRank);
      }
      // 'default-score' with default 0 adds nothing for RRF
    }
  }

  return score;
}
