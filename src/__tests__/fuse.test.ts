import { describe, it, expect } from 'vitest';
import { fuse, rrf, weightedFuse, createFuser } from '../fuse';
import { FusionRankError } from '../errors';
import type { RankedItem } from '../types';

// --- Helpers ---

function makeList(...items: Array<{ id: string; score?: number; rank?: number }>): RankedItem[] {
  return items.map(item => ({ ...item }));
}

// --- Tests ---

describe('fuse', () => {
  describe('RRF strategy', () => {
    it('fuses 2 lists with correct ranking using RRF', () => {
      const list1 = makeList(
        { id: 'a', rank: 1 },
        { id: 'b', rank: 2 },
        { id: 'c', rank: 3 },
      );
      const list2 = makeList(
        { id: 'b', rank: 1 },
        { id: 'c', rank: 2 },
        { id: 'a', rank: 3 },
      );

      const results = fuse([list1, list2], { strategy: 'rrf' });

      // All docs appear in both lists — b is rank 1+2, a is 1+3, c is 3+2
      // RRF(b) = 1/(60+2) + 1/(60+1) highest because lower sum of ranks
      // b should be #1, a and c should follow
      expect(results).toHaveLength(3);
      expect(results[0].id).toBe('b'); // rank 2 + rank 1 = best
      expect(results[0].rank).toBe(1);
      expect(results[1].rank).toBe(2);
      expect(results[2].rank).toBe(3);
    });

    it('defaults to rrf strategy when no strategy specified', () => {
      const list1 = makeList({ id: 'a', rank: 1 }, { id: 'b', rank: 2 });
      const list2 = makeList({ id: 'b', rank: 1 }, { id: 'a', rank: 2 });

      const results = fuse([list1, list2]);

      // Both docs at same combined rank sum (3), so scores should be equal
      expect(results).toHaveLength(2);
      expect(results[0].score).toBeCloseTo(results[1].score, 10);
    });

    it('defaults k to 60', () => {
      const list1 = makeList({ id: 'a', rank: 1 });
      const list2 = makeList({ id: 'a', rank: 1 });

      // With k=60, score = 2/(60+1), normalizeOutput will make it 1.0 (single result)
      const results = fuse([list1, list2]);
      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(1.0);
    });
  });

  describe('Borda strategy', () => {
    it('computes correct Borda scores', () => {
      const list1 = makeList(
        { id: 'a', rank: 1 },
        { id: 'b', rank: 2 },
        { id: 'c', rank: 3 },
      );
      const list2 = makeList(
        { id: 'b', rank: 1 },
        { id: 'a', rank: 2 },
        { id: 'c', rank: 3 },
      );

      const results = fuse([list1, list2], { strategy: 'borda', normalizeOutput: false });

      // Borda: a = (3-1) + (3-2) = 2+1 = 3
      //        b = (3-2) + (3-1) = 1+2 = 3
      //        c = (3-3) + (3-3) = 0+0 = 0
      expect(results).toHaveLength(3);
      // a and b tied at 3, c at 0
      const aResult = results.find(r => r.id === 'a')!;
      const bResult = results.find(r => r.id === 'b')!;
      const cResult = results.find(r => r.id === 'c')!;
      expect(aResult.score).toBe(3);
      expect(bResult.score).toBe(3);
      expect(cResult.score).toBe(0);
    });

    it('assigns worst-rank for missing docs in Borda', () => {
      const list1 = makeList({ id: 'a', rank: 1 }, { id: 'b', rank: 2 });
      const list2 = makeList({ id: 'a', rank: 1 });

      const results = fuse([list1, list2], { strategy: 'borda', normalizeOutput: false });

      // a: (2-1) + (1-1) = 1 + 0 = 1
      // b: (2-2) + worst-rank penalty = 0 + (1 - (1+1)) = 0 + (-1) = -1
      const aResult = results.find(r => r.id === 'a')!;
      const bResult = results.find(r => r.id === 'b')!;
      expect(aResult.score).toBe(1);
      expect(bResult.score).toBe(-1);
    });
  });

  describe('CombSUM strategy', () => {
    it('computes correct CombSUM scores', () => {
      const list1 = makeList(
        { id: 'a', score: 10, rank: 1 },
        { id: 'b', score: 5, rank: 2 },
      );
      const list2 = makeList(
        { id: 'b', score: 8, rank: 1 },
        { id: 'a', score: 2, rank: 2 },
      );

      const results = fuse([list1, list2], { strategy: 'combsum', normalizeOutput: false });

      // After min-max norm per list:
      // list1: a=1.0, b=0.0; list2: b=1.0, a=0.0
      // CombSUM(a) = 1.0 + 0.0 = 1.0
      // CombSUM(b) = 0.0 + 1.0 = 1.0
      expect(results).toHaveLength(2);
      expect(results[0].score).toBeCloseTo(results[1].score, 5);
    });

    it('ranks docs appearing in more lists higher', () => {
      const list1 = makeList(
        { id: 'a', score: 10, rank: 1 },
        { id: 'b', score: 8, rank: 2 },
        { id: 'c', score: 5, rank: 3 },
      );
      const list2 = makeList(
        { id: 'a', score: 9, rank: 1 },
        { id: 'b', score: 7, rank: 2 },
        { id: 'c', score: 3, rank: 3 },
      );

      const results = fuse([list1, list2], { strategy: 'combsum', normalizeOutput: false });

      // a should score highest, then b, then c
      expect(results[0].id).toBe('a');
      expect(results[1].id).toBe('b');
      expect(results[2].id).toBe('c');
    });

    it('applies defaultScore for documents missing from some lists', () => {
      const list1 = makeList(
        { id: 'a', score: 10, rank: 1 },
        { id: 'b', score: 5, rank: 2 },
      );
      const list2 = makeList(
        { id: 'a', score: 8, rank: 1 },
        // 'b' is missing from list2
      );

      const results = fuse([list1, list2], {
        strategy: 'combsum',
        normalizeOutput: false,
        missingDocStrategy: 'default-score',
        defaultScore: 0.5,
      });

      const bResult = results.find(r => r.id === 'b')!;
      // b appears in list1 only. After min-max norm in list1: b=0.0
      // Missing from list2: gets defaultScore 0.5
      // CombSUM(b) = 0.0 + 0.5 = 0.5
      expect(bResult.score).toBeCloseTo(0.5, 5);
    });
  });

  describe('CombMNZ strategy', () => {
    it('multiplies score sum by appearance count', () => {
      const list1 = makeList(
        { id: 'a', score: 10, rank: 1 },
        { id: 'b', score: 5, rank: 2 },
      );
      const list2 = makeList(
        { id: 'a', score: 8, rank: 1 },
      );

      const results = fuse([list1, list2], { strategy: 'combmnz', normalizeOutput: false });

      // a appears in 2 lists, b in 1 list
      const aResult = results.find(r => r.id === 'a')!;
      const bResult = results.find(r => r.id === 'b')!;
      // a multiplied by 2, b by 1 — a should dominate
      expect(aResult.score).toBeGreaterThan(bResult.score);
    });

    it('CombMNZ produces higher scores for docs in all lists vs one list', () => {
      // 3 lists, doc-all in all 3, doc-one in 1
      const list1 = makeList(
        { id: 'all', score: 10, rank: 1 },
        { id: 'one', score: 9, rank: 2 },
      );
      const list2 = makeList(
        { id: 'all', score: 10, rank: 1 },
        { id: 'two', score: 9, rank: 2 },
      );

      const results = fuse([list1, list2], { strategy: 'combmnz', normalizeOutput: false });

      const allResult = results.find(r => r.id === 'all')!;
      const oneResult = results.find(r => r.id === 'one')!;
      // all: 2 * (1.0 + 1.0) = 4.0
      // one: 1 * 0.0 = 0.0
      expect(allResult.score).toBeGreaterThan(oneResult.score);
    });

    it('applies defaultScore for documents missing from some lists', () => {
      const list1 = makeList(
        { id: 'a', score: 10, rank: 1 },
        { id: 'b', score: 5, rank: 2 },
      );
      const list2 = makeList(
        { id: 'a', score: 8, rank: 1 },
        // 'b' is missing from list2
      );

      const results = fuse([list1, list2], {
        strategy: 'combmnz',
        normalizeOutput: false,
        missingDocStrategy: 'default-score',
        defaultScore: 0.5,
      });

      const bResult = results.find(r => r.id === 'b')!;
      // b appears in 1 list. After norm: b=0.0 in list1
      // Missing from list2: gets defaultScore 0.5 added to sum
      // CombMNZ(b) = 1 * (0.0 + 0.5) = 0.5
      expect(bResult.score).toBeCloseTo(0.5, 5);
    });
  });

  describe('Input validation', () => {
    it('throws TOO_FEW_LISTS for fewer than 2 lists', () => {
      expect(() => fuse([])).toThrow(FusionRankError);
      expect(() => fuse([])).toThrow('At least 2 result lists required');

      const list1 = makeList({ id: 'a', rank: 1 });
      expect(() => fuse([list1])).toThrow(FusionRankError);

      try {
        fuse([]);
      } catch (e) {
        expect((e as FusionRankError).code).toBe('TOO_FEW_LISTS');
      }
    });

    it('throws EMPTY_LIST when a list is empty', () => {
      const list1 = makeList({ id: 'a', rank: 1 });
      const emptyList: RankedItem[] = [];

      expect(() => fuse([list1, emptyList])).toThrow(FusionRankError);
      expect(() => fuse([list1, emptyList])).toThrow('List 1 is empty');

      try {
        fuse([list1, emptyList]);
      } catch (e) {
        expect((e as FusionRankError).code).toBe('EMPTY_LIST');
      }
    });

    it('throws WEIGHT_LENGTH_MISMATCH when weights length differs from list count', () => {
      const list1 = makeList({ id: 'a', rank: 1 });
      const list2 = makeList({ id: 'b', rank: 1 });

      expect(() => fuse([list1, list2], { weights: [0.5] })).toThrow(FusionRankError);

      try {
        fuse([list1, list2], { weights: [0.5] });
      } catch (e) {
        expect((e as FusionRankError).code).toBe('WEIGHT_LENGTH_MISMATCH');
      }
    });

    it('throws INVALID_K when k is non-positive', () => {
      const list1 = makeList({ id: 'a', rank: 1 });
      const list2 = makeList({ id: 'a', rank: 1 });

      expect(() => fuse([list1, list2], { k: 0 })).toThrow(FusionRankError);
      expect(() => fuse([list1, list2], { k: -5 })).toThrow(FusionRankError);

      try {
        fuse([list1, list2], { k: 0 });
      } catch (e) {
        expect((e as FusionRankError).code).toBe('INVALID_K');
      }
    });

    it('throws MISSING_CUSTOM_FN when custom strategy lacks customFusion', () => {
      const list1 = makeList({ id: 'a', rank: 1 });
      const list2 = makeList({ id: 'a', rank: 1 });

      expect(() => fuse([list1, list2], { strategy: 'custom' })).toThrow(FusionRankError);

      try {
        fuse([list1, list2], { strategy: 'custom' });
      } catch (e) {
        expect((e as FusionRankError).code).toBe('MISSING_CUSTOM_FN');
      }
    });
  });

  describe('Default options', () => {
    it('uses strategy=rrf by default', () => {
      const list1 = makeList({ id: 'a', rank: 1 });
      const list2 = makeList({ id: 'a', rank: 2 });

      // Should not throw — defaults to rrf
      const results = fuse([list1, list2]);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('a');
    });

    it('assigns ranks from array position when rank is missing', () => {
      const list1 = makeList({ id: 'a', score: 0.9 }, { id: 'b', score: 0.7 });
      const list2 = makeList({ id: 'b', score: 0.8 }, { id: 'a', score: 0.6 });

      const results = fuse([list1, list2]);

      // a: rank 1 in list1, rank 2 in list2
      // b: rank 2 in list1, rank 1 in list2
      // Both have same sum of ranks, so tied
      expect(results).toHaveLength(2);
    });
  });

  describe('normalizeOutput', () => {
    it('normalizes output scores to [0, 1] by default', () => {
      const list1 = makeList(
        { id: 'a', rank: 1 },
        { id: 'b', rank: 2 },
        { id: 'c', rank: 3 },
      );
      const list2 = makeList(
        { id: 'a', rank: 1 },
        { id: 'c', rank: 2 },
        { id: 'b', rank: 3 },
      );

      const results = fuse([list1, list2]);

      // All scores should be in [0, 1]
      for (const r of results) {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1);
      }
      // First result should be 1.0, last should be 0.0
      expect(results[0].score).toBeCloseTo(1.0, 5);
      expect(results[results.length - 1].score).toBeCloseTo(0.0, 5);
    });

    it('preserves raw scores when normalizeOutput is false', () => {
      const list1 = makeList({ id: 'a', rank: 1 }, { id: 'b', rank: 2 });
      const list2 = makeList({ id: 'a', rank: 1 }, { id: 'b', rank: 3 });

      const resultsRaw = fuse([list1, list2], { normalizeOutput: false });

      // Raw scores should NOT all be in [0,1] necessarily (they are RRF sums)
      // But they should differ from normalized ones in general
      expect(resultsRaw[0].score).not.toBeCloseTo(1.0, 5);
    });

    it('gives single result a score of 1.0 when normalizeOutput is true', () => {
      const list1 = makeList({ id: 'a', rank: 1 });
      const list2 = makeList({ id: 'a', rank: 1 });

      const results = fuse([list1, list2]);
      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(1.0);
    });
  });

  describe('topK limiting', () => {
    it('limits results to topK', () => {
      const list1 = makeList(
        { id: 'a', rank: 1 },
        { id: 'b', rank: 2 },
        { id: 'c', rank: 3 },
        { id: 'd', rank: 4 },
      );
      const list2 = makeList(
        { id: 'a', rank: 1 },
        { id: 'b', rank: 2 },
        { id: 'c', rank: 3 },
        { id: 'd', rank: 4 },
      );

      const results = fuse([list1, list2], { topK: 2 });

      expect(results).toHaveLength(2);
      expect(results[0].rank).toBe(1);
      expect(results[1].rank).toBe(2);
    });

    it('returns all results when topK is larger than result count', () => {
      const list1 = makeList({ id: 'a', rank: 1 }, { id: 'b', rank: 2 });
      const list2 = makeList({ id: 'a', rank: 1 }, { id: 'b', rank: 2 });

      const results = fuse([list1, list2], { topK: 100 });
      expect(results).toHaveLength(2);
    });
  });

  describe('Custom fusion', () => {
    it('calls custom fusion function with correct arguments', () => {
      const list1 = makeList({ id: 'a', rank: 1 }, { id: 'b', rank: 2 });
      const list2 = makeList({ id: 'a', rank: 2 }, { id: 'b', rank: 1 });

      const results = fuse([list1, list2], {
        strategy: 'custom',
        normalizeOutput: false,
        customFusion: (_docId, appearances) => {
          // Simple custom: count of appearances * 10
          return appearances.length * 10;
        },
      });

      expect(results).toHaveLength(2);
      // Both appear in 2 lists, so both get 20
      expect(results[0].score).toBe(20);
      expect(results[1].score).toBe(20);
    });
  });

  describe('Provenance (sources)', () => {
    it('includes source appearances in results', () => {
      const list1 = makeList({ id: 'a', score: 0.9, rank: 1 }, { id: 'b', score: 0.7, rank: 2 });
      const list2 = makeList({ id: 'a', score: 0.8, rank: 1 });

      const results = fuse([list1, list2]);

      const aResult = results.find(r => r.id === 'a')!;
      expect(aResult.sources).toHaveLength(2);
      expect(aResult.sources[0].listIndex).toBe(0);
      expect(aResult.sources[0].rank).toBe(1);
      expect(aResult.sources[1].listIndex).toBe(1);

      const bResult = results.find(r => r.id === 'b')!;
      expect(bResult.sources).toHaveLength(1);
      expect(bResult.sources[0].listIndex).toBe(0);
    });
  });
});

describe('rrf', () => {
  it('is a shorthand for fuse with rrf strategy', () => {
    const list1 = makeList({ id: 'a', rank: 1 }, { id: 'b', rank: 2 });
    const list2 = makeList({ id: 'b', rank: 1 }, { id: 'a', rank: 2 });

    const rrfResults = rrf([list1, list2]);
    const fuseResults = fuse([list1, list2], { strategy: 'rrf' });

    expect(rrfResults).toHaveLength(fuseResults.length);
    for (let i = 0; i < rrfResults.length; i++) {
      expect(rrfResults[i].id).toBe(fuseResults[i].id);
      expect(rrfResults[i].score).toBeCloseTo(fuseResults[i].score, 10);
      expect(rrfResults[i].rank).toBe(fuseResults[i].rank);
    }
  });

  it('accepts RRF-specific options like k', () => {
    const list1 = makeList({ id: 'a', rank: 1 });
    const list2 = makeList({ id: 'a', rank: 1 });

    const results = rrf([list1, list2], { k: 10 });
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(1.0); // single result, normalized
  });
});

describe('weightedFuse', () => {
  it('is a shorthand for fuse with weighted strategy', () => {
    const list1 = makeList({ id: 'a', score: 10, rank: 1 }, { id: 'b', score: 5, rank: 2 });
    const list2 = makeList({ id: 'b', score: 8, rank: 1 }, { id: 'a', score: 2, rank: 2 });

    const wResults = weightedFuse([list1, list2], [0.7, 0.3]);
    const fuseResults = fuse([list1, list2], { strategy: 'weighted', weights: [0.7, 0.3] });

    expect(wResults).toHaveLength(fuseResults.length);
    for (let i = 0; i < wResults.length; i++) {
      expect(wResults[i].id).toBe(fuseResults[i].id);
      expect(wResults[i].score).toBeCloseTo(fuseResults[i].score, 10);
    }
  });

  it('weights defaultScore by list weight for missing docs', () => {
    // list1 has both 'a' and 'b'; list2 has only 'a'
    // weights: list1=0.9, list2=0.1 (normalized)
    // 'b' is missing from list2, so its defaultScore should be weighted by 0.1
    const list1 = makeList(
      { id: 'a', score: 10, rank: 1 },
      { id: 'b', score: 5, rank: 2 },
    );
    const list2 = makeList(
      { id: 'a', score: 8, rank: 1 },
      // 'b' missing from list2
    );

    const results = weightedFuse([list1, list2], [0.9, 0.1], {
      normalizeOutput: false,
      missingDocStrategy: 'default-score',
      defaultScore: 0.5,
    });

    const bResult = results.find(r => r.id === 'b')!;
    // After min-max norm in list1: b=0.0 (lowest score), a=1.0
    // After weighting present scores: b in list1 = 0.0 * 0.9 = 0.0
    // Missing from list2: defaultScore * weight_list2 = 0.5 * 0.1 = 0.05
    // Total for b = 0.0 + 0.05 = 0.05
    expect(bResult.score).toBeCloseTo(0.05, 5);

    // Verify this differs from unweighted defaultScore behavior:
    // Without the fix, b would get 0.0 + 0.5 * 1.0 = 0.5
    // With the fix, b gets 0.0 + 0.5 * 0.1 = 0.05
    expect(bResult.score).not.toBeCloseTo(0.5, 1);
  });

  it('auto-normalizes weights to sum to 1.0', () => {
    const list1 = makeList({ id: 'a', score: 10, rank: 1 }, { id: 'b', score: 5, rank: 2 });
    const list2 = makeList({ id: 'a', score: 8, rank: 1 }, { id: 'b', score: 3, rank: 2 });

    // Weights [7, 3] should be auto-normalized to [0.7, 0.3]
    const results1 = weightedFuse([list1, list2], [7, 3]);
    const results2 = weightedFuse([list1, list2], [0.7, 0.3]);

    expect(results1).toHaveLength(results2.length);
    for (let i = 0; i < results1.length; i++) {
      expect(results1[i].id).toBe(results2[i].id);
      expect(results1[i].score).toBeCloseTo(results2[i].score, 10);
    }
  });
});

describe('createFuser', () => {
  it('creates a reusable fuser with preset config', () => {
    const fuser = createFuser({ strategy: 'rrf', k: 30 });

    const list1 = makeList({ id: 'a', rank: 1 });
    const list2 = makeList({ id: 'a', rank: 1 });

    const results = fuser.fuse([list1, list2]);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('a');
  });

  it('allows overrides on each fuse call', () => {
    const fuser = createFuser({ strategy: 'rrf', normalizeOutput: false });

    const list1 = makeList({ id: 'a', rank: 1 }, { id: 'b', rank: 2 });
    const list2 = makeList({ id: 'a', rank: 1 }, { id: 'b', rank: 2 });

    // Override topK
    const results = fuser.fuse([list1, list2], { topK: 1 });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('a');
  });

  it('is stateless across calls', () => {
    const fuser = createFuser({ strategy: 'rrf' });

    const list1a = makeList({ id: 'x', rank: 1 });
    const list2a = makeList({ id: 'x', rank: 1 });
    const resultsA = fuser.fuse([list1a, list2a]);

    const list1b = makeList({ id: 'y', rank: 1 });
    const list2b = makeList({ id: 'y', rank: 1 });
    const resultsB = fuser.fuse([list1b, list2b]);

    expect(resultsA[0].id).toBe('x');
    expect(resultsB[0].id).toBe('y');
    // No state leakage
    expect(resultsA).toHaveLength(1);
    expect(resultsB).toHaveLength(1);
  });
});
