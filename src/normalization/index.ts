import type { NormalizationMethod } from '../types';
import { minMaxNormalize } from './min-max';
import { zScoreNormalize } from './z-score';
import { rankBasedNormalize } from './rank-based';

export function normalize(scores: number[], method: NormalizationMethod): number[] {
  switch (method) {
    case 'min-max': return minMaxNormalize(scores);
    case 'z-score': return zScoreNormalize(scores);
    case 'rank-based': return rankBasedNormalize(scores);
    case 'none': return [...scores];
  }
}

export { minMaxNormalize } from './min-max';
export { zScoreNormalize } from './z-score';
export { rankBasedNormalize } from './rank-based';
