import type { FusionStrategy, FusionContext } from '../types';
import type { DeduplicatedDoc } from '../dedup';
import { rrfScore } from './rrf';

export function computeScore(
  strategy: FusionStrategy,
  doc: DeduplicatedDoc,
  context: FusionContext,
): number {
  const { totalLists, listLengths, options } = context;

  switch (strategy) {
    case 'rrf':
      return rrfScore(doc, totalLists, listLengths, options.k ?? 60, options.missingDocStrategy ?? 'worst-rank');
    // Other strategies to be added in future phases
    default:
      throw new Error(`Strategy "${strategy}" not yet implemented`);
  }
}

export { rrfScore } from './rrf';
