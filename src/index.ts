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
