export interface RankedItem {
  id: string;
  score?: number;
  rank?: number;
  metadata?: Record<string, unknown>;
}

export interface SourceAppearance {
  listIndex: number;
  rank: number;
  score?: number;
  normalizedScore?: number;
}

export interface FusedResult {
  id: string;
  score: number;
  rank: number;
  sources: SourceAppearance[];
  metadata?: Record<string, unknown>;
}

export type FusionStrategy = 'rrf' | 'weighted' | 'combsum' | 'combmnz' | 'borda' | 'custom';

export type NormalizationMethod = 'min-max' | 'z-score' | 'rank-based' | 'none';

export type MissingDocStrategy = 'worst-rank' | 'skip' | 'default-score';

export type MetadataMerge = 'first' | 'deep' | 'all';

export interface FusionContext {
  totalLists: number;
  listLengths: number[];
  options: FuseOptions;
}

export type CustomFusionFn = (
  docId: string,
  appearances: Array<{ listIndex: number; rank: number; score?: number; normalizedScore?: number }>,
  context: FusionContext,
) => number;

export interface FuseOptions {
  strategy?: FusionStrategy;
  /** RRF constant k (default: 60) */
  k?: number;
  /** Weights per list for weighted strategy */
  weights?: number[];
  normalization?: NormalizationMethod;
  missingDocStrategy?: MissingDocStrategy;
  /** Default score when missingDocStrategy is 'default-score' */
  defaultScore?: number;
  /** Normalize final scores to [0,1] */
  normalizeOutput?: boolean;
  /** Return only top N results */
  topK?: number;
  /** Field to use as document ID (default: 'id') */
  idField?: string;
  metadataMerge?: MetadataMerge;
  customFusion?: CustomFusionFn;
}

export type FuserConfig = FuseOptions;

export type RRFOptions = Omit<FuseOptions, 'strategy' | 'weights' | 'normalization'> & {
  k?: number;
};

export type WeightedFuseOptions = Omit<FuseOptions, 'strategy' | 'weights'> & {
  normalization?: NormalizationMethod;
};

export interface Fuser {
  fuse(resultLists: RankedItem[][], overrides?: Partial<FuseOptions>): FusedResult[];
}
