import { describe, it, expect } from 'vitest';
import { FusionRankError } from '../errors';
import type { FusionRankErrorCode } from '../errors';

describe('FusionRankError', () => {
  it('extends Error', () => {
    const err = new FusionRankError('test', 'TOO_FEW_LISTS');
    expect(err instanceof Error).toBe(true);
  });

  it('is an instanceof FusionRankError', () => {
    const err = new FusionRankError('test', 'TOO_FEW_LISTS');
    expect(err instanceof FusionRankError).toBe(true);
  });

  it('has name === "FusionRankError"', () => {
    const err = new FusionRankError('test message', 'EMPTY_LIST');
    expect(err.name).toBe('FusionRankError');
  });

  it('has the correct message', () => {
    const err = new FusionRankError('something went wrong', 'INVALID_K');
    expect(err.message).toBe('something went wrong');
  });

  it('has accessible code equal to the passed code', () => {
    const err = new FusionRankError('test', 'MISSING_SCORES');
    expect(err.code).toBe('MISSING_SCORES');
  });

  it('prototype chain is correct', () => {
    const err = new FusionRankError('test', 'INVALID_WEIGHTS');
    expect(Object.getPrototypeOf(err)).toBe(FusionRankError.prototype);
  });

  it('instanceof checks pass for both Error and FusionRankError', () => {
    const err = new FusionRankError('test', 'WEIGHT_LENGTH_MISMATCH');
    expect(err instanceof Error).toBe(true);
    expect(err instanceof FusionRankError).toBe(true);
  });

  const allCodes: FusionRankErrorCode[] = [
    'TOO_FEW_LISTS',
    'EMPTY_LIST',
    'MISSING_SCORES',
    'WEIGHT_LENGTH_MISMATCH',
    'INVALID_K',
    'INVALID_WEIGHTS',
    'MISSING_CUSTOM_FN',
    'INVALID_OPTIONS',
  ];

  it.each(allCodes)('constructs correctly with code %s', (code) => {
    const err = new FusionRankError(`error for ${code}`, code);
    expect(err.code).toBe(code);
    expect(err.message).toBe(`error for ${code}`);
    expect(err instanceof FusionRankError).toBe(true);
    expect(err instanceof Error).toBe(true);
    expect(err.name).toBe('FusionRankError');
  });
});
