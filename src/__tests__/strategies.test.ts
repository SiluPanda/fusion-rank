import { describe, it, expect } from 'vitest';
import { rrfScore, computeScore } from '../strategies/index';
import type { DeduplicatedDoc } from '../dedup';
import type { FusionContext } from '../types';

function makeDoc(id: string, appearances: { listIndex: number; rank: number }[]): DeduplicatedDoc {
  return {
    id,
    appearances: appearances.map(a => ({ ...a })),
  };
}

describe('rrfScore', () => {
  it('computes correct RRF score for a doc in 2 lists with known ranks', () => {
    // doc appears at rank 2 in list 0 and rank 5 in list 1
    const doc = makeDoc('d1', [
      { listIndex: 0, rank: 2 },
      { listIndex: 1, rank: 5 },
    ]);
    const k = 60;
    // Expected: 1/(60+2) + 1/(60+5) = 1/62 + 1/65
    const expected = 1 / 62 + 1 / 65;
    expect(rrfScore(doc, 2, [10, 10], k, 'worst-rank')).toBeCloseTo(expected, 10);
  });

  it('uses default k=60 formula: 1/(60+rank)', () => {
    const doc = makeDoc('d1', [{ listIndex: 0, rank: 1 }]);
    // 1/(60+1) = 1/61
    expect(rrfScore(doc, 1, [10], 60, 'skip')).toBeCloseTo(1 / 61, 10);
  });

  it('produces different scores with different k values', () => {
    const doc = makeDoc('d1', [
      { listIndex: 0, rank: 3 },
      { listIndex: 1, rank: 7 },
    ]);
    const scoreK10 = rrfScore(doc, 2, [10, 10], 10, 'skip');
    const scoreK60 = rrfScore(doc, 2, [10, 10], 60, 'skip');
    const scoreK100 = rrfScore(doc, 2, [10, 10], 100, 'skip');

    // k=10: 1/13 + 1/17 ~= 0.1355
    // k=60: 1/63 + 1/67 ~= 0.0308
    // k=100: 1/103 + 1/107 ~= 0.0191
    expect(scoreK10).toBeGreaterThan(scoreK60);
    expect(scoreK60).toBeGreaterThan(scoreK100);
  });

  it('scores a doc in all lists higher than a doc in one list', () => {
    const docAll = makeDoc('all', [
      { listIndex: 0, rank: 3 },
      { listIndex: 1, rank: 3 },
      { listIndex: 2, rank: 3 },
    ]);
    const docOne = makeDoc('one', [{ listIndex: 0, rank: 3 }]);

    const scoreAll = rrfScore(docAll, 3, [10, 10, 10], 60, 'skip');
    const scoreOne = rrfScore(docOne, 3, [10, 10, 10], 60, 'skip');

    // docAll: 3 * 1/63 = 3/63, docOne: 1/63
    expect(scoreAll).toBeGreaterThan(scoreOne);
    expect(scoreAll).toBeCloseTo(3 * scoreOne, 10);
  });

  it('assigns worst-rank (listLength + 1) for missing docs', () => {
    // doc appears only in list 0, missing from list 1
    const doc = makeDoc('d1', [{ listIndex: 0, rank: 2 }]);
    const listLengths = [10, 20];
    const k = 60;

    const score = rrfScore(doc, 2, listLengths, k, 'worst-rank');
    // Expected: 1/(60+2) + 1/(60+21) = 1/62 + 1/81
    const expected = 1 / 62 + 1 / 81;
    expect(score).toBeCloseTo(expected, 10);
  });

  it('only sums appeared lists when missingDocStrategy is skip', () => {
    // doc appears only in list 0, missing from list 1
    const doc = makeDoc('d1', [{ listIndex: 0, rank: 2 }]);
    const listLengths = [10, 20];
    const k = 60;

    const score = rrfScore(doc, 2, listLengths, k, 'skip');
    // Expected: only 1/(60+2) = 1/62
    const expected = 1 / 62;
    expect(score).toBeCloseTo(expected, 10);
  });

  it('ranks multiple docs correctly — lowest ranks get highest scores', () => {
    const docA = makeDoc('a', [
      { listIndex: 0, rank: 1 },
      { listIndex: 1, rank: 2 },
    ]);
    const docB = makeDoc('b', [
      { listIndex: 0, rank: 5 },
      { listIndex: 1, rank: 8 },
    ]);
    const docC = makeDoc('c', [
      { listIndex: 0, rank: 10 },
      { listIndex: 1, rank: 10 },
    ]);

    const k = 60;
    const scoreA = rrfScore(docA, 2, [10, 10], k, 'skip');
    const scoreB = rrfScore(docB, 2, [10, 10], k, 'skip');
    const scoreC = rrfScore(docC, 2, [10, 10], k, 'skip');

    expect(scoreA).toBeGreaterThan(scoreB);
    expect(scoreB).toBeGreaterThan(scoreC);
  });

  it('works correctly with a single list', () => {
    const doc = makeDoc('d1', [{ listIndex: 0, rank: 3 }]);
    const score = rrfScore(doc, 1, [10], 60, 'worst-rank');
    expect(score).toBeCloseTo(1 / 63, 10);
  });

  it('computes maximum possible score for doc at rank 1 in all lists', () => {
    const doc = makeDoc('top', [
      { listIndex: 0, rank: 1 },
      { listIndex: 1, rank: 1 },
      { listIndex: 2, rank: 1 },
    ]);
    const k = 60;
    const score = rrfScore(doc, 3, [10, 10, 10], k, 'worst-rank');
    // 3 * 1/(60+1) = 3/61
    expect(score).toBeCloseTo(3 / 61, 10);
  });

  it('adds nothing for default-score strategy when doc is missing', () => {
    // doc appears only in list 0, missing from list 1
    const doc = makeDoc('d1', [{ listIndex: 0, rank: 2 }]);
    const scoreDefaultScore = rrfScore(doc, 2, [10, 10], 60, 'default-score');
    const scoreSkip = rrfScore(doc, 2, [10, 10], 60, 'skip');

    // For RRF, default-score with default 0 adds nothing, same as skip
    expect(scoreDefaultScore).toBeCloseTo(scoreSkip, 10);
  });
});

describe('computeScore', () => {
  it('delegates to rrfScore for rrf strategy', () => {
    const doc = makeDoc('d1', [
      { listIndex: 0, rank: 1 },
      { listIndex: 1, rank: 3 },
    ]);
    const context: FusionContext = {
      totalLists: 2,
      listLengths: [5, 5],
      options: { strategy: 'rrf', k: 60, missingDocStrategy: 'worst-rank' },
    };
    const expected = 1 / 61 + 1 / 63;
    expect(computeScore('rrf', doc, context)).toBeCloseTo(expected, 10);
  });

  it('uses default k=60 when options.k is undefined', () => {
    const doc = makeDoc('d1', [{ listIndex: 0, rank: 1 }]);
    const context: FusionContext = {
      totalLists: 1,
      listLengths: [5],
      options: {},
    };
    expect(computeScore('rrf', doc, context)).toBeCloseTo(1 / 61, 10);
  });

  it('uses default missingDocStrategy worst-rank when undefined', () => {
    const doc = makeDoc('d1', [{ listIndex: 0, rank: 2 }]);
    const context: FusionContext = {
      totalLists: 2,
      listLengths: [10, 20],
      options: {},
    };
    // worst-rank: 1/(60+2) + 1/(60+21)
    const expected = 1 / 62 + 1 / 81;
    expect(computeScore('rrf', doc, context)).toBeCloseTo(expected, 10);
  });

  it('throws for unimplemented strategies', () => {
    const doc = makeDoc('d1', [{ listIndex: 0, rank: 1 }]);
    const context: FusionContext = {
      totalLists: 1,
      listLengths: [5],
      options: {},
    };
    expect(() => computeScore('weighted', doc, context)).toThrow('Strategy "weighted" not yet implemented');
    expect(() => computeScore('combsum', doc, context)).toThrow('Strategy "combsum" not yet implemented');
    expect(() => computeScore('combmnz', doc, context)).toThrow('Strategy "combmnz" not yet implemented');
    expect(() => computeScore('borda', doc, context)).toThrow('Strategy "borda" not yet implemented');
    expect(() => computeScore('custom', doc, context)).toThrow('Strategy "custom" not yet implemented');
  });
});
