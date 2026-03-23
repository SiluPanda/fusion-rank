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
    case 'weighted':
      return combSumScore(doc, totalLists, options.defaultScore ?? 0, options.missingDocStrategy ?? 'default-score');
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
