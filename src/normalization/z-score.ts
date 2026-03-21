export function zScoreNormalize(scores: number[]): number[] {
  if (scores.length === 0) return [];
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
  const stddev = Math.sqrt(variance);
  if (stddev === 0) return scores.map(() => 0);
  return scores.map(s => (s - mean) / stddev);
}
