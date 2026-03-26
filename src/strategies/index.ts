import type { FusionStrategy, FusionContext } from '../types';
import type { DeduplicatedDoc } from '../dedup';
import { rrfScore } from './rrf';
import { bordaScore } from './borda';
import { combSumScore } from './combsum';
import { combMnzScore } from './combmnz';

export function computeScore(
  strategy: FusionStrategy,
  doc: DeduplicatedDoc,
  context: FusionContext,
): number {
  const { totalLists, listLengths, options } = context;

  switch (strategy) {
    case 'rrf':
      return rrfScore(doc, totalLists, listLengths, options.k ?? 60, options.missingDocStrategy ?? 'worst-rank');
    case 'borda':
      return bordaScore(doc, totalLists, listLengths, options.missingDocStrategy ?? 'worst-rank');
    case 'combsum':
      return combSumScore(doc, totalLists, options.defaultScore ?? 0, options.missingDocStrategy ?? 'default-score');
    case 'combmnz':
      return combMnzScore(doc, totalLists, options.defaultScore ?? 0, options.missingDocStrategy ?? 'default-score');
    case 'weighted': {
      const defaultScoreVal = options.defaultScore ?? 0;
      const missingStrat = options.missingDocStrategy ?? 'default-score';
      const sum = doc.appearances.reduce((s, app) => s + (app.normalizedScore ?? 0), 0);
      if (missingStrat === 'default-score' && context.normalizedWeights) {
        const presentListIndices = new Set(doc.appearances.map(a => a.listIndex));
        let missingWeightedDefault = 0;
        for (let i = 0; i < totalLists; i++) {
          if (!presentListIndices.has(i)) {
            missingWeightedDefault += defaultScoreVal * context.normalizedWeights[i];
          }
        }
        return sum + missingWeightedDefault;
      }
      if (missingStrat === 'default-score') {
        const missingCount = totalLists - doc.appearances.length;
        return sum + missingCount * defaultScoreVal;
      }
      return sum;
    }
    case 'custom':
      if (options.customFusion) {
        return options.customFusion(doc.id, doc.appearances, context);
      }
      throw new Error('Custom strategy requires customFusion function');
    default:
      throw new Error(`Strategy "${strategy}" not yet implemented`);
  }
}

export { rrfScore } from './rrf';
export { bordaScore } from './borda';
export { combSumScore } from './combsum';
export { combMnzScore } from './combmnz';
