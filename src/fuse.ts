import type { RankedItem, FusedResult, FuseOptions, RRFOptions, WeightedFuseOptions, Fuser, FusionContext } from './types';
import { FusionRankError } from './errors';
import { deduplicateResults } from './dedup';
import { normalize } from './normalization/index';
import { computeScore } from './strategies/index';
import { minMaxNormalize } from './normalization/min-max';

/**
 * Fuse multiple ranked result lists into a single ranked list.
 *
 * Supports multiple strategies: rrf, weighted, combsum, combmnz, borda, custom.
 * By default uses RRF with k=60.
 */
export function fuse(resultLists: RankedItem[][], options: Partial<FuseOptions> = {}): FusedResult[] {
  // Resolve defaults
  const strategy = options.strategy ?? 'rrf';
  const k = options.k ?? 60;
  const normalization = options.normalization ?? 'min-max';
  const missingDocStrategy = options.missingDocStrategy ?? (strategy === 'rrf' || strategy === 'borda' ? 'worst-rank' : 'default-score');
  const defaultScore = options.defaultScore ?? 0;
  const normalizeOutput = options.normalizeOutput ?? true;
  const topK = options.topK ?? Infinity;
  const idField = options.idField ?? 'id';
  const metadataMerge = options.metadataMerge ?? 'first';

  // Validate
  if (resultLists.length < 2) {
    throw new FusionRankError('At least 2 result lists required', 'TOO_FEW_LISTS');
  }
  for (let i = 0; i < resultLists.length; i++) {
    if (resultLists[i].length === 0) {
      throw new FusionRankError(`List ${i} is empty`, 'EMPTY_LIST');
    }
  }
  if (options.weights && options.weights.length !== resultLists.length) {
    throw new FusionRankError('weights length must match list count', 'WEIGHT_LENGTH_MISMATCH');
  }
  if (k <= 0) {
    throw new FusionRankError('k must be positive', 'INVALID_K');
  }
  if (strategy === 'custom' && !options.customFusion) {
    throw new FusionRankError('custom strategy requires customFusion fn', 'MISSING_CUSTOM_FN');
  }

  // Determine if we need score normalization for this strategy
  const needsScoreNorm = strategy === 'weighted' || strategy === 'combsum' || strategy === 'combmnz';

  // Assign ranks and normalize scores per list
  const processed = resultLists.map((list) => {
    const ranked = list.map((item, i) => ({ ...item, rank: item.rank ?? i + 1 }));

    if (needsScoreNorm && normalization !== 'none') {
      const scores = ranked.map(item => item.score ?? 0);
      const normalized = normalize(scores, normalization);
      return ranked.map((item, i) => ({ ...item, _normalizedScore: normalized[i] }));
    }

    return ranked.map(item => ({ ...item, _normalizedScore: item.score }));
  });

  // Apply weights to normalized scores for weighted strategy
  if (strategy === 'weighted' && options.weights) {
    const weightSum = options.weights.reduce((s, w) => s + w, 0);
    const normalizedWeights = options.weights.map(w => w / weightSum);
    for (let listIdx = 0; listIdx < processed.length; listIdx++) {
      const weight = normalizedWeights[listIdx];
      for (const item of processed[listIdx]) {
        item._normalizedScore = (item._normalizedScore ?? 0) * weight;
      }
    }
  }

  // Dedup
  const docs = deduplicateResults(
    processed.map(list => list.map(item => ({
      id: item.id,
      score: item.score,
      rank: item.rank,
      metadata: item.metadata,
    }))),
    { idField, metadataMerge },
  );

  // Attach normalized scores to appearances
  for (const doc of docs.values()) {
    for (const app of doc.appearances) {
      const listItem = processed[app.listIndex]?.find(item => item.id === doc.id);
      if (listItem) {
        app.normalizedScore = (listItem as { _normalizedScore?: number })._normalizedScore;
      }
    }
  }

  const listLengths = resultLists.map(l => l.length);
  const resolvedOptions: FuseOptions = {
    strategy,
    k,
    normalization,
    missingDocStrategy,
    defaultScore,
    normalizeOutput,
    topK,
    idField,
    metadataMerge,
    customFusion: options.customFusion,
  };
  const context: FusionContext = {
    totalLists: resultLists.length,
    listLengths,
    options: resolvedOptions,
  };

  // Compute scores
  const results: FusedResult[] = [];
  for (const doc of docs.values()) {
    const score = computeScore(strategy, doc, context);
    results.push({
      id: doc.id,
      score,
      rank: 0,
      sources: doc.appearances,
      metadata: doc.metadata,
    });
  }

  // Sort descending by score
  results.sort((a, b) => b.score - a.score);

  // Normalize output scores to [0, 1]
  if (normalizeOutput && results.length > 1) {
    const scores = results.map(r => r.score);
    const normalized = minMaxNormalize(scores);
    for (let i = 0; i < results.length; i++) {
      results[i].score = normalized[i];
    }
  } else if (normalizeOutput && results.length === 1) {
    results[0].score = 1.0;
  }

  // TopK limiting
  const limited = topK < Infinity ? results.slice(0, topK) : results;

  // Assign final 1-based ranks
  for (let i = 0; i < limited.length; i++) {
    limited[i].rank = i + 1;
  }

  return limited;
}

/**
 * Shorthand for RRF fusion.
 */
export function rrf(resultLists: RankedItem[][], options?: Partial<RRFOptions>): FusedResult[] {
  return fuse(resultLists, { ...options, strategy: 'rrf' });
}

/**
 * Shorthand for weighted score fusion.
 */
export function weightedFuse(resultLists: RankedItem[][], weights: number[], options?: Partial<WeightedFuseOptions>): FusedResult[] {
  return fuse(resultLists, { ...options, strategy: 'weighted', weights });
}

/**
 * Factory to create a reusable Fuser with preset configuration.
 * Each call to fuse() merges overrides with the preset config.
 * The Fuser is stateless across calls.
 */
export function createFuser(config: Partial<FuseOptions>): Fuser {
  return {
    fuse(resultLists, overrides) {
      return fuse(resultLists, { ...config, ...overrides });
    },
  };
}
