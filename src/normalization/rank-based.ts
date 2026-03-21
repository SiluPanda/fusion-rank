export function rankBasedNormalize(scores: number[]): number[] {
  if (scores.length === 0) return [];
  if (scores.length === 1) return [1.0];
  // Create index-score pairs, sort descending by score, assign ranks
  const indexed = scores.map((s, i) => ({ index: i, score: s }));
  indexed.sort((a, b) => b.score - a.score);
  const result = new Array<number>(scores.length);
  for (let rank = 0; rank < indexed.length; rank++) {
    result[indexed[rank].index] = 1 - rank / (scores.length - 1);
  }
  return result;
}
