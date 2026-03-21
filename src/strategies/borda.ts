import type { DeduplicatedDoc } from '../dedup';
import type { MissingDocStrategy } from '../types';

/**
 * Borda count scoring.
 * Borda_score(d) = sum(N_i - rank_i(d))
 * For absent documents with 'worst-rank', assign rank = N_i + 1, yielding N_i - (N_i + 1) = -1.
 */
export function bordaScore(
  doc: DeduplicatedDoc,
  totalLists: number,
  listLengths: number[],
  missingDocStrategy: MissingDocStrategy,
): number {
  let score = 0;

  if (missingDocStrategy === 'skip') {
    for (const app of doc.appearances) {
      score += listLengths[app.listIndex] - app.rank;
    }
  } else {
    for (let i = 0; i < totalLists; i++) {
      const app = doc.appearances.find(a => a.listIndex === i);
      if (app) {
        score += listLengths[i] - app.rank;
      } else if (missingDocStrategy === 'worst-rank') {
        score += listLengths[i] - (listLengths[i] + 1); // = -1
      }
      // 'default-score' adds nothing for Borda
    }
  }

  return score;
}
