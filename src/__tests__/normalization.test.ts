import { describe, it, expect } from 'vitest';
import { minMaxNormalize } from '../normalization/min-max';
import { zScoreNormalize } from '../normalization/z-score';
import { rankBasedNormalize } from '../normalization/rank-based';
import { normalize } from '../normalization/index';

describe('minMaxNormalize', () => {
  it('normalizes [0, 5, 10] to [0, 0.5, 1]', () => {
    expect(minMaxNormalize([0, 5, 10])).toEqual([0, 0.5, 1]);
  });

  it('returns [0.5, 0.5, 0.5] when all values are the same', () => {
    expect(minMaxNormalize([7, 7, 7])).toEqual([0.5, 0.5, 0.5]);
  });

  it('returns [0.5] for a single value', () => {
    expect(minMaxNormalize([42])).toEqual([0.5]);
  });

  it('returns [] for empty input', () => {
    expect(minMaxNormalize([])).toEqual([]);
  });

  it('normalizes negative values [-10, 0, 10] to [0, 0.5, 1]', () => {
    expect(minMaxNormalize([-10, 0, 10])).toEqual([0, 0.5, 1]);
  });

  it('normalizes [100, 200] to [0, 1]', () => {
    expect(minMaxNormalize([100, 200])).toEqual([0, 1]);
  });

  it('handles descending order [10, 5, 0] to [1, 0.5, 0]', () => {
    expect(minMaxNormalize([10, 5, 0])).toEqual([1, 0.5, 0]);
  });
});

describe('zScoreNormalize', () => {
  it('produces output with mean ~0 and stddev ~1 for a known distribution', () => {
    const input = [10, 20, 30, 40, 50];
    const result = zScoreNormalize(input);

    // Verify mean is approximately 0
    const mean = result.reduce((a, b) => a + b, 0) / result.length;
    expect(mean).toBeCloseTo(0, 10);

    // Verify stddev is approximately 1
    const variance = result.reduce((sum, s) => sum + (s - mean) ** 2, 0) / result.length;
    const stddev = Math.sqrt(variance);
    expect(stddev).toBeCloseTo(1, 10);
  });

  it('returns [0, 0, 0] when all values are the same', () => {
    expect(zScoreNormalize([5, 5, 5])).toEqual([0, 0, 0]);
  });

  it('returns [] for empty input', () => {
    expect(zScoreNormalize([])).toEqual([]);
  });

  it('returns [0] for a single value (stddev is 0)', () => {
    expect(zScoreNormalize([42])).toEqual([0]);
  });

  it('produces symmetric z-scores for symmetric input', () => {
    const result = zScoreNormalize([0, 10]);
    // mean = 5, stddev = 5
    // z(0) = -1, z(10) = 1
    expect(result[0]).toBeCloseTo(-1, 10);
    expect(result[1]).toBeCloseTo(1, 10);
  });

  it('handles negative values', () => {
    const result = zScoreNormalize([-10, 0, 10]);
    // mean = 0, variance = (100+0+100)/3 = 200/3, stddev = sqrt(200/3)
    const stddev = Math.sqrt(200 / 3);
    expect(result[0]).toBeCloseTo(-10 / stddev, 10);
    expect(result[1]).toBeCloseTo(0, 10);
    expect(result[2]).toBeCloseTo(10 / stddev, 10);
  });
});

describe('rankBasedNormalize', () => {
  it('assigns 1.0 to highest, 0.5 to middle, 0.0 to lowest for [30, 10, 20]', () => {
    const result = rankBasedNormalize([30, 10, 20]);
    // 30 is highest -> rank 0 -> 1 - 0/2 = 1.0
    // 20 is middle  -> rank 1 -> 1 - 1/2 = 0.5
    // 10 is lowest  -> rank 2 -> 1 - 2/2 = 0.0
    expect(result[0]).toBeCloseTo(1.0, 10);
    expect(result[1]).toBeCloseTo(0.0, 10);
    expect(result[2]).toBeCloseTo(0.5, 10);
  });

  it('returns [1.0] for a single item', () => {
    expect(rankBasedNormalize([42])).toEqual([1.0]);
  });

  it('returns [] for empty input', () => {
    expect(rankBasedNormalize([])).toEqual([]);
  });

  it('assigns correct ranks for already sorted descending input', () => {
    const result = rankBasedNormalize([100, 75, 50, 25, 0]);
    // rank 0 -> 1.0, rank 1 -> 0.75, rank 2 -> 0.5, rank 3 -> 0.25, rank 4 -> 0.0
    expect(result[0]).toBeCloseTo(1.0, 10);
    expect(result[1]).toBeCloseTo(0.75, 10);
    expect(result[2]).toBeCloseTo(0.5, 10);
    expect(result[3]).toBeCloseTo(0.25, 10);
    expect(result[4]).toBeCloseTo(0.0, 10);
  });

  it('assigns correct ranks for ascending input', () => {
    const result = rankBasedNormalize([0, 25, 50, 75, 100]);
    // 100 is rank 0 (index 4) -> 1.0
    // 0 is rank 4 (index 0) -> 0.0
    expect(result[0]).toBeCloseTo(0.0, 10);
    expect(result[4]).toBeCloseTo(1.0, 10);
  });

  it('handles two equal scores by sort order', () => {
    const result = rankBasedNormalize([10, 10]);
    // Both have the same score; sort is stable-ish but both get mapped
    // One gets rank 0 -> 1.0, the other rank 1 -> 0.0
    expect(result[0] + result[1]).toBeCloseTo(1.0, 10);
  });
});

describe('normalize dispatcher', () => {
  it('delegates to minMaxNormalize for "min-max"', () => {
    expect(normalize([0, 5, 10], 'min-max')).toEqual([0, 0.5, 1]);
  });

  it('delegates to zScoreNormalize for "z-score"', () => {
    const result = normalize([0, 10], 'z-score');
    expect(result[0]).toBeCloseTo(-1, 10);
    expect(result[1]).toBeCloseTo(1, 10);
  });

  it('delegates to rankBasedNormalize for "rank-based"', () => {
    const result = normalize([30, 10, 20], 'rank-based');
    expect(result[0]).toBeCloseTo(1.0, 10);
    expect(result[1]).toBeCloseTo(0.0, 10);
    expect(result[2]).toBeCloseTo(0.5, 10);
  });

  it('returns a copy of the input for "none"', () => {
    const input = [3, 1, 4, 1, 5];
    const result = normalize(input, 'none');
    expect(result).toEqual([3, 1, 4, 1, 5]);
    // Verify it is a copy, not the same reference
    expect(result).not.toBe(input);
  });

  it('"none" returns empty array for empty input', () => {
    expect(normalize([], 'none')).toEqual([]);
  });
});
