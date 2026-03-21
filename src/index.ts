export type {
  RankedItem, SourceAppearance, FusedResult,
  FusionStrategy, NormalizationMethod, MissingDocStrategy, MetadataMerge,
  FusionContext, CustomFusionFn, FuseOptions, FuserConfig,
  RRFOptions, WeightedFuseOptions, Fuser,
} from './types';
export { FusionRankError } from './errors';
export type { FusionRankErrorCode } from './errors';
export { deduplicateResults } from './dedup';
export type { DeduplicatedDoc } from './dedup';
export { normalize, minMaxNormalize, zScoreNormalize, rankBasedNormalize } from './normalization/index';
export { computeScore, rrfScore } from './strategies/index';
