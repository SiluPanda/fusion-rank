export type FusionRankErrorCode =
  | 'TOO_FEW_LISTS'
  | 'EMPTY_LIST'
  | 'MISSING_SCORES'
  | 'WEIGHT_LENGTH_MISMATCH'
  | 'INVALID_K'
  | 'INVALID_WEIGHTS'
  | 'MISSING_CUSTOM_FN'
  | 'INVALID_OPTIONS';

export class FusionRankError extends Error {
  readonly name = 'FusionRankError';
  constructor(
    message: string,
    readonly code: FusionRankErrorCode,
  ) {
    super(message);
    Object.setPrototypeOf(this, FusionRankError.prototype);
  }
}
