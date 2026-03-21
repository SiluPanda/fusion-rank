# fusion-rank

Reciprocal Rank Fusion (RRF) and multi-strategy score fusion for combining results from multiple retrievers. Zero runtime dependencies.

## Installation

```bash
npm install fusion-rank
```

## Quick Start

```typescript
import { fuse, rrf, weightedFuse, createFuser } from 'fusion-rank';

// Two ranked result lists from different retrievers
const vectorResults = [
  { id: 'doc-A', score: 0.95 },
  { id: 'doc-B', score: 0.82 },
  { id: 'doc-C', score: 0.71 },
];

const bm25Results = [
  { id: 'doc-C', score: 12.5 },
  { id: 'doc-A', score: 11.2 },
  { id: 'doc-D', score: 10.1 },
];

// Fuse with RRF (default strategy)
const results = fuse([vectorResults, bm25Results]);
// => [{ id: 'doc-A', score: 1.0, rank: 1, sources: [...] }, ...]

// RRF shorthand
const rrfResults = rrf([vectorResults, bm25Results], { k: 60 });

// Weighted score fusion
const weightedResults = weightedFuse(
  [vectorResults, bm25Results],
  [0.7, 0.3],
  { normalization: 'min-max' },
);

// Reusable fuser instance
const fuser = createFuser({ strategy: 'combmnz', normalization: 'z-score' });
const fused = fuser.fuse([vectorResults, bm25Results]);
```

## Available Exports

### Functions

- `fuse(resultLists, options?)` - Main fusion function supporting all strategies
- `rrf(resultLists, options?)` - RRF shorthand
- `weightedFuse(resultLists, weights, options?)` - Weighted fusion shorthand
- `createFuser(config)` - Factory for reusable fuser instances
- `deduplicateResults(resultLists, options?)` - Group items across lists by document ID

### Types

- `RankedItem` - Input item with `id`, optional `score`, `rank`, `metadata`
- `FusedResult` - Output item with `id`, `score`, `rank`, `sources`, optional `metadata`
- `SourceAppearance` - Provenance record for each list a document appeared in
- `FuseOptions` - Full configuration options
- `DeduplicatedDoc` - Deduplicated document with appearances and merged metadata
- `FusionStrategy` - `'rrf' | 'weighted' | 'combsum' | 'combmnz' | 'borda' | 'custom'`
- `NormalizationMethod` - `'min-max' | 'z-score' | 'rank-based' | 'none'`
- `MissingDocStrategy` - `'worst-rank' | 'skip' | 'default-score'`
- `MetadataMerge` - `'first' | 'deep' | 'all'`
- `FusionRankError` - Error class with typed error codes
- `FusionRankErrorCode` - Union of all error code strings

## Supported Strategies

| Strategy | Description |
|----------|-------------|
| `rrf` | Reciprocal Rank Fusion. Score = sum(1 / (k + rank)). Default k = 60. |
| `weighted` | Weighted score fusion. Normalize scores then apply per-list weights. |
| `combsum` | CombSUM. Sum of normalized scores across all lists. |
| `combmnz` | CombMNZ. CombSUM multiplied by the number of lists containing the document. |
| `borda` | Borda count. Score = sum(N - rank) across lists. |
| `custom` | User-supplied fusion function via `customFusion` option. |

## License

MIT
