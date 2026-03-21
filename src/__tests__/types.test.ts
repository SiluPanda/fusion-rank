import { describe, it, expect } from 'vitest';
import type {
  RankedItem,
  SourceAppearance,
  FusedResult,
  FusionStrategy,
  NormalizationMethod,
  MissingDocStrategy,
  MetadataMerge,
  FuseOptions,
  CustomFusionFn,
  FusionContext,
  Fuser,
  RRFOptions,
  WeightedFuseOptions,
} from '../types';

describe('Types (compile-time shape checks via assignment)', () => {
  it('RankedItem with only id is valid (all others optional)', () => {
    const item: RankedItem = { id: 'doc-1' };
    expect(item.id).toBe('doc-1');
    expect(item.score).toBeUndefined();
    expect(item.rank).toBeUndefined();
    expect(item.metadata).toBeUndefined();
  });

  it('RankedItem with all fields is valid', () => {
    const item: RankedItem = {
      id: 'doc-2',
      score: 0.95,
      rank: 1,
      metadata: { source: 'vector', extra: 42 },
    };
    expect(item.id).toBe('doc-2');
    expect(item.score).toBe(0.95);
    expect(item.rank).toBe(1);
    expect(item.metadata).toEqual({ source: 'vector', extra: 42 });
  });

  it('SourceAppearance requires listIndex and rank', () => {
    const sa: SourceAppearance = { listIndex: 0, rank: 1 };
    expect(sa.listIndex).toBe(0);
    expect(sa.rank).toBe(1);
    expect(sa.score).toBeUndefined();
    expect(sa.normalizedScore).toBeUndefined();
  });

  it('SourceAppearance with all optional fields is valid', () => {
    const sa: SourceAppearance = {
      listIndex: 1,
      rank: 3,
      score: 12.3,
      normalizedScore: 0.75,
    };
    expect(sa.score).toBe(12.3);
    expect(sa.normalizedScore).toBe(0.75);
  });

  it('FusedResult requires id, score, rank, sources', () => {
    const result: FusedResult = {
      id: 'doc-A',
      score: 0.032,
      rank: 1,
      sources: [{ listIndex: 0, rank: 1 }, { listIndex: 1, rank: 2 }],
    };
    expect(result.id).toBe('doc-A');
    expect(result.score).toBe(0.032);
    expect(result.rank).toBe(1);
    expect(result.sources).toHaveLength(2);
  });

  it('FusedResult metadata is optional', () => {
    const result: FusedResult = {
      id: 'doc-B',
      score: 0.028,
      rank: 2,
      sources: [],
      metadata: { text: 'hello' },
    };
    expect(result.metadata).toEqual({ text: 'hello' });
  });

  it('FuseOptions with no fields is valid (all optional)', () => {
    const opts: FuseOptions = {};
    expect(opts.strategy).toBeUndefined();
    expect(opts.k).toBeUndefined();
    expect(opts.weights).toBeUndefined();
  });

  it('FuseOptions with all fields is valid', () => {
    const customFn: CustomFusionFn = (id, appearances, ctx) => {
      void id; void appearances; void ctx;
      return 0.5;
    };
    const opts: FuseOptions = {
      strategy: 'rrf',
      k: 60,
      weights: [1, 1],
      normalization: 'min-max',
      missingDocStrategy: 'worst-rank',
      defaultScore: 0,
      normalizeOutput: true,
      topK: 10,
      idField: 'id',
      metadataMerge: 'first',
      customFusion: customFn,
    };
    expect(opts.strategy).toBe('rrf');
    expect(opts.k).toBe(60);
  });

  it('FusionStrategy union covers all 6 strategies', () => {
    const strategies: FusionStrategy[] = ['rrf', 'weighted', 'combsum', 'combmnz', 'borda', 'custom'];
    expect(strategies).toHaveLength(6);
    strategies.forEach((s) => {
      const opt: FuseOptions = { strategy: s };
      expect(opt.strategy).toBe(s);
    });
  });

  it('NormalizationMethod covers all 4 values', () => {
    const methods: NormalizationMethod[] = ['min-max', 'z-score', 'rank-based', 'none'];
    expect(methods).toHaveLength(4);
    methods.forEach((m) => {
      const opt: FuseOptions = { normalization: m };
      expect(opt.normalization).toBe(m);
    });
  });

  it('MissingDocStrategy covers all 3 values', () => {
    const strategies: MissingDocStrategy[] = ['worst-rank', 'skip', 'default-score'];
    expect(strategies).toHaveLength(3);
    strategies.forEach((s) => {
      const opt: FuseOptions = { missingDocStrategy: s };
      expect(opt.missingDocStrategy).toBe(s);
    });
  });

  it('MetadataMerge covers all 3 values', () => {
    const merges: MetadataMerge[] = ['first', 'deep', 'all'];
    expect(merges).toHaveLength(3);
    merges.forEach((m) => {
      const opt: FuseOptions = { metadataMerge: m };
      expect(opt.metadataMerge).toBe(m);
    });
  });

  it('CustomFusionFn has correct signature', () => {
    const ctx: FusionContext = {
      totalLists: 2,
      listLengths: [5, 5],
      options: {},
    };
    const fn: CustomFusionFn = (docId, appearances, context) => {
      expect(typeof docId).toBe('string');
      expect(Array.isArray(appearances)).toBe(true);
      expect(context.totalLists).toBe(2);
      return appearances.length * 0.1;
    };
    const result = fn('doc-1', [{ listIndex: 0, rank: 1, score: 0.9 }], ctx);
    expect(result).toBe(0.1);
  });

  it('Fuser interface can be implemented by a mock class', () => {
    class MockFuser implements Fuser {
      fuse(resultLists: RankedItem[][], overrides?: Partial<FuseOptions>): FusedResult[] {
        void overrides;
        return resultLists.flat().map((item, i) => ({
          id: item.id,
          score: 0.5,
          rank: i + 1,
          sources: [{ listIndex: 0, rank: i + 1 }],
        }));
      }
    }
    const fuser = new MockFuser();
    const results = fuser.fuse([[{ id: 'doc-1' }]]);
    expect(results[0].id).toBe('doc-1');
    expect(results[0].rank).toBe(1);
  });

  it('RRFOptions excludes strategy, weights, and normalization', () => {
    // RRFOptions should allow k, topK, etc. but not strategy/weights/normalization
    const opts: RRFOptions = { k: 60, topK: 10, idField: 'id' };
    expect(opts.k).toBe(60);
    expect(opts.topK).toBe(10);
  });

  it('WeightedFuseOptions excludes strategy and weights', () => {
    // WeightedFuseOptions allows normalization but not strategy/weights
    const opts: WeightedFuseOptions = { normalization: 'min-max', topK: 5 };
    expect(opts.normalization).toBe('min-max');
    expect(opts.topK).toBe(5);
  });
});
