# fusion-rank

Reciprocal Rank Fusion and multi-strategy score fusion for combining results from multiple retrievers. Zero runtime dependencies.

[![npm version](https://img.shields.io/npm/v/fusion-rank.svg)](https://www.npmjs.com/package/fusion-rank)
[![license](https://img.shields.io/npm/l/fusion-rank.svg)](https://github.com/SiluPanda/fusion-rank/blob/master/LICENSE)
[![node](https://img.shields.io/node/v/fusion-rank.svg)](https://nodejs.org/)
[![types](https://img.shields.io/npm/types/fusion-rank.svg)](https://www.npmjs.com/package/fusion-rank)

---

## Description

Hybrid search -- combining keyword retrieval (BM25) with vector retrieval (dense embeddings) -- is the dominant strategy for production RAG pipelines. Every major vector database supports hybrid queries that return results from multiple retrieval paths, but the merge step is always reimplemented ad hoc. Teams write one-off fusion logic inline that is untested, unmaintained, and inconsistent across projects.

`fusion-rank` provides a clean, retriever-agnostic API for combining any number of ranked result lists using well-studied fusion algorithms. It handles deduplication, score normalization, missing document handling, metadata merging, and provenance tracking. The output is a single ranked list with fusion scores normalized to [0, 1], ready for downstream consumption.

Key properties:

- **Six fusion strategies**: RRF, weighted score fusion, CombSUM, CombMNZ, Borda count, and custom functions.
- **Four normalization methods**: min-max, z-score, rank-based, and none.
- **Provenance tracking**: every fused result records which input lists contributed to it and the rank/score from each source.
- **Zero runtime dependencies**: only devDependencies for build and test tooling.
- **TypeScript-first**: full type definitions with strict mode, shipped as declaration files.

---

## Installation

```bash
npm install fusion-rank
```

Requires Node.js 18 or later.

---

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

---

## Features

### Fusion Strategies

| Strategy | Description | Requires Scores |
|----------|-------------|:---------------:|
| `rrf` | Reciprocal Rank Fusion. `score = sum(1 / (k + rank))`. Default k = 60. | No |
| `weighted` | Weighted score fusion. Normalize scores then apply per-list weights. | Yes |
| `combsum` | CombSUM. Sum of normalized scores across all lists. | Yes |
| `combmnz` | CombMNZ. CombSUM multiplied by the number of lists containing the document. | Yes |
| `borda` | Borda count. `score = sum(N - rank)` across lists. | No |
| `custom` | User-supplied fusion function via the `customFusion` option. | Depends |

### Score Normalization Methods

| Method | Formula | Output Range | Notes |
|--------|---------|:------------:|-------|
| `min-max` | `(x - min) / (max - min)` | [0, 1] | Default. Sensitive to outliers. |
| `z-score` | `(x - mean) / stddev` | Unbounded | Centers scores at mean 0, stddev 1. |
| `rank-based` | `1 - (rank - 1) / (N - 1)` | [0, 1] | Ignores original score magnitudes. |
| `none` | Identity | Raw | Use when all lists share the same score scale. |

### Missing Document Strategies

When a document appears in some lists but not others, the missing entries are handled by one of three strategies:

| Strategy | Behavior | Best For |
|----------|----------|----------|
| `worst-rank` | Assign rank = `listLength + 1` in the missing list. | RRF, Borda (default for rank-based strategies) |
| `skip` | Omit the missing list from the score computation entirely. | When absence should not penalize. |
| `default-score` | Assign a configurable default score (default 0) for the missing list. | Weighted, CombSUM, CombMNZ (default for score-based strategies) |

### Metadata Merging

When the same document appears in multiple lists with different metadata, the merge behavior is configurable:

| Mode | Behavior |
|------|----------|
| `first` | Keep metadata from the first appearance (default). |
| `deep` | Deep-merge all metadata objects. Later values override earlier values for the same key. |
| `all` | Collect all metadata objects into a `{ _all: [...] }` array. |

### Provenance Tracking

Every `FusedResult` includes a `sources` array recording which input lists contributed to the document's fused score:

```typescript
interface SourceAppearance {
  listIndex: number;       // Index of the input list (0-based)
  rank: number;            // Rank in that list (1-based)
  score?: number;          // Raw score from that list
  normalizedScore?: number; // Normalized score (when applicable)
}
```

---

## API Reference

### `fuse(resultLists, options?)`

Main fusion function. Combines two or more ranked result lists into a single ranked list.

```typescript
function fuse(resultLists: RankedItem[][], options?: Partial<FuseOptions>): FusedResult[];
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `resultLists` | `RankedItem[][]` | Two or more ranked result lists to fuse. |
| `options` | `Partial<FuseOptions>` | Configuration options (all optional). |

**Returns:** `FusedResult[]` -- sorted by fused score descending, with 1-based ranks assigned.

**Default option values:**

| Option | Default | Description |
|--------|---------|-------------|
| `strategy` | `'rrf'` | Fusion strategy to use. |
| `k` | `60` | RRF constant k. Only used with `rrf` strategy. |
| `weights` | `undefined` | Per-list weights for `weighted` strategy. Auto-normalized to sum to 1.0. |
| `normalization` | `'min-max'` | Score normalization method for score-based strategies. |
| `missingDocStrategy` | `'worst-rank'` (rank-based) / `'default-score'` (score-based) | How to handle documents missing from some lists. |
| `defaultScore` | `0` | Default score when `missingDocStrategy` is `'default-score'`. |
| `normalizeOutput` | `true` | Normalize final fused scores to [0, 1] via min-max. |
| `topK` | `Infinity` | Return only the top K results. |
| `idField` | `'id'` | Field name to use as the document identifier for deduplication. |
| `metadataMerge` | `'first'` | Metadata merge strategy: `'first'`, `'deep'`, or `'all'`. |
| `customFusion` | `undefined` | Custom fusion function. Required when strategy is `'custom'`. |

---

### `rrf(resultLists, options?)`

Shorthand for RRF fusion. Equivalent to `fuse(resultLists, { strategy: 'rrf', ...options })`.

```typescript
function rrf(resultLists: RankedItem[][], options?: Partial<RRFOptions>): FusedResult[];
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `resultLists` | `RankedItem[][]` | Two or more ranked result lists. |
| `options` | `Partial<RRFOptions>` | RRF-specific options. Supports `k`, `topK`, `idField`, `metadataMerge`, `missingDocStrategy`, `defaultScore`, `normalizeOutput`. Does not accept `strategy`, `weights`, or `normalization`. |

---

### `weightedFuse(resultLists, weights, options?)`

Shorthand for weighted score fusion. Equivalent to `fuse(resultLists, { strategy: 'weighted', weights, ...options })`.

```typescript
function weightedFuse(
  resultLists: RankedItem[][],
  weights: number[],
  options?: Partial<WeightedFuseOptions>,
): FusedResult[];
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `resultLists` | `RankedItem[][]` | Two or more ranked result lists. |
| `weights` | `number[]` | Per-list importance weights. Auto-normalized to sum to 1.0. Length must match the number of lists. |
| `options` | `Partial<WeightedFuseOptions>` | Options. Supports `normalization`, `topK`, `idField`, `metadataMerge`, `missingDocStrategy`, `defaultScore`, `normalizeOutput`. Does not accept `strategy` or `weights`. |

**Example:**

```typescript
// Weights [7, 3] are auto-normalized to [0.7, 0.3]
const results = weightedFuse([vectorResults, bm25Results], [7, 3]);
```

---

### `createFuser(config)`

Factory that returns a reusable `Fuser` instance with preset configuration. The fuser is stateless across calls.

```typescript
function createFuser(config: Partial<FuseOptions>): Fuser;
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `config` | `Partial<FuseOptions>` | Preset configuration applied to every `fuse()` call. |

**Returns:** A `Fuser` object:

```typescript
interface Fuser {
  fuse(resultLists: RankedItem[][], overrides?: Partial<FuseOptions>): FusedResult[];
}
```

**Example:**

```typescript
const fuser = createFuser({ strategy: 'combmnz', normalization: 'z-score', topK: 10 });

// Each call merges overrides with the preset config
const results1 = fuser.fuse([listA, listB]);
const results2 = fuser.fuse([listC, listD], { topK: 5 }); // override topK for this call
```

---

### `deduplicateResults(resultLists, options?)`

Groups items across multiple ranked lists by document ID. Used internally by `fuse()` but exported for direct use.

```typescript
function deduplicateResults(
  resultLists: RankedItem[][],
  options?: { idField?: string; metadataMerge?: MetadataMerge },
): Map<string, DeduplicatedDoc>;
```

**Returns:** A `Map` keyed by document ID, where each value is:

```typescript
interface DeduplicatedDoc {
  id: string;
  appearances: SourceAppearance[];
  metadata?: Record<string, unknown>;
}
```

---

### Normalization Functions

Low-level normalization functions, exported for direct use:

#### `normalize(scores, method)`

Dispatcher that delegates to the correct normalizer based on the method string.

```typescript
function normalize(scores: number[], method: NormalizationMethod): number[];
```

#### `minMaxNormalize(scores)`

```typescript
function minMaxNormalize(scores: number[]): number[];
```

Maps scores to [0, 1]. Returns 0.5 for all items when all scores are identical.

#### `zScoreNormalize(scores)`

```typescript
function zScoreNormalize(scores: number[]): number[];
```

Centers scores at mean 0 with standard deviation 1. Returns 0 for all items when all scores are identical.

#### `rankBasedNormalize(scores)`

```typescript
function rankBasedNormalize(scores: number[]): number[];
```

Replaces scores with rank-based values in [0, 1]. The highest score gets 1.0, the lowest gets 0.0. Returns 1.0 for a single-item input.

---

### Strategy Score Functions

Low-level scoring functions for individual documents, exported for direct use:

#### `computeScore(strategy, doc, context)`

Dispatcher that delegates to the correct strategy scorer.

```typescript
function computeScore(strategy: FusionStrategy, doc: DeduplicatedDoc, context: FusionContext): number;
```

#### `rrfScore(doc, totalLists, listLengths, k, missingDocStrategy)`

```typescript
function rrfScore(
  doc: DeduplicatedDoc,
  totalLists: number,
  listLengths: number[],
  k: number,
  missingDocStrategy: MissingDocStrategy,
): number;
```

Computes `sum(1 / (k + rank_i))` across all lists.

#### `bordaScore(doc, totalLists, listLengths, missingDocStrategy)`

```typescript
function bordaScore(
  doc: DeduplicatedDoc,
  totalLists: number,
  listLengths: number[],
  missingDocStrategy: MissingDocStrategy,
): number;
```

Computes `sum(N_i - rank_i)` across all lists.

#### `combSumScore(doc)`

```typescript
function combSumScore(doc: DeduplicatedDoc): number;
```

Computes the sum of normalized scores across all appearances.

#### `combMnzScore(doc)`

```typescript
function combMnzScore(doc: DeduplicatedDoc): number;
```

Computes `appearances.length * sum(normalizedScores)`.

---

### Types

All types are exported for use in consumer code:

```typescript
import type {
  RankedItem,
  FusedResult,
  SourceAppearance,
  FuseOptions,
  FuserConfig,
  RRFOptions,
  WeightedFuseOptions,
  Fuser,
  FusionStrategy,
  NormalizationMethod,
  MissingDocStrategy,
  MetadataMerge,
  CustomFusionFn,
  FusionContext,
  DeduplicatedDoc,
  FusionRankErrorCode,
} from 'fusion-rank';

import { FusionRankError } from 'fusion-rank';
```

#### `RankedItem`

Input item representing a single document in a ranked list.

```typescript
interface RankedItem {
  id: string;                         // Unique document identifier
  score?: number;                     // Relevance score (optional for rank-based strategies)
  rank?: number;                      // 1-based rank (inferred from array position if omitted)
  metadata?: Record<string, unknown>; // Arbitrary metadata passed through to output
}
```

#### `FusedResult`

Output item representing a document in the fused ranking.

```typescript
interface FusedResult {
  id: string;                         // Document identifier
  score: number;                      // Fused score (normalized to [0,1] by default)
  rank: number;                       // 1-based rank in the fused output
  sources: SourceAppearance[];        // Provenance: which input lists contributed
  metadata?: Record<string, unknown>; // Merged metadata from input appearances
}
```

#### `CustomFusionFn`

Signature for user-supplied custom fusion functions:

```typescript
type CustomFusionFn = (
  docId: string,
  appearances: Array<{ listIndex: number; rank: number; score?: number; normalizedScore?: number }>,
  context: FusionContext,
) => number;
```

#### `FusionContext`

Context object passed to custom fusion functions:

```typescript
interface FusionContext {
  totalLists: number;
  listLengths: number[];
  options: FuseOptions;
}
```

---

## Configuration

### Choosing a Strategy

**Use RRF when:**
- Fusing results from retrievers with incomparable score distributions (the most common case).
- You have no labeled data to tune per-retriever weights.
- You want a robust default that works well without tuning.

**Use weighted fusion when:**
- You know the relative importance of each retriever (e.g., vector search is 2x more important than BM25).
- You have offline evaluation data to tune weights.

**Use CombSUM when:**
- You want equal-weight score combination without explicit weight management.

**Use CombMNZ when:**
- You want to reward documents that appear across many retrieval paths.

**Use Borda count when:**
- You want a rank-based voting method that is simple and interpretable.

**Use custom when:**
- You need application-specific fusion logic not covered by the built-in strategies.

### Tuning the RRF k Parameter

The k parameter controls how steeply the RRF score decays with rank:

| k value | Behavior |
|---------|----------|
| `0` | Pure reciprocal rank (`1/rank`). Extremely steep decay; top-ranked items dominate. |
| `10-30` | Strongly favors documents in the top 5-10 across lists. |
| `60` | Default. Gentle decay; robust to minor rank perturbations. Used by Qdrant and Elasticsearch. |
| `100-200` | Meaningful credit to documents ranked 50th or lower. Useful for long result lists. |
| `1000` | Nearly flat scoring. Treats all ranked documents as equally important. |

---

## Error Handling

All errors thrown by `fusion-rank` are instances of `FusionRankError`, which extends `Error` and includes a typed `code` property for programmatic error handling.

```typescript
import { fuse, FusionRankError } from 'fusion-rank';

try {
  const results = fuse([singleList]);
} catch (err) {
  if (err instanceof FusionRankError) {
    console.error(`Fusion error [${err.code}]: ${err.message}`);
  }
}
```

### Error Codes

| Code | Thrown When |
|------|-----------|
| `TOO_FEW_LISTS` | Fewer than 2 result lists are provided. |
| `EMPTY_LIST` | One or more input lists are empty arrays. |
| `MISSING_SCORES` | A score-based strategy is used but items lack scores. |
| `WEIGHT_LENGTH_MISMATCH` | The `weights` array length does not match the number of result lists. |
| `INVALID_K` | The `k` parameter is zero or negative. |
| `INVALID_WEIGHTS` | Weights contain non-positive values. |
| `MISSING_CUSTOM_FN` | Strategy is `'custom'` but no `customFusion` function is provided. |
| `INVALID_OPTIONS` | General options validation failure. |

---

## Advanced Usage

### Custom Fusion Function

Supply your own scoring logic when the built-in strategies do not fit your use case:

```typescript
import { fuse } from 'fusion-rank';
import type { CustomFusionFn } from 'fusion-rank';

const myFusion: CustomFusionFn = (docId, appearances, context) => {
  // Reward documents that appear in all lists
  const coverageBonus = appearances.length / context.totalLists;
  const avgRank = appearances.reduce((sum, a) => sum + a.rank, 0) / appearances.length;
  return coverageBonus * (1 / avgRank);
};

const results = fuse([listA, listB, listC], {
  strategy: 'custom',
  customFusion: myFusion,
});
```

### Custom ID Field

When your documents use a field other than `id` for identification:

```typescript
const results = fuse([vectorResults, bm25Results], {
  idField: 'documentId',
});
```

### Disabling Output Normalization

By default, final fused scores are normalized to [0, 1]. To preserve raw fusion scores:

```typescript
const results = fuse([listA, listB], {
  normalizeOutput: false,
});
```

### Limiting Results

Return only the top K results:

```typescript
const top5 = fuse([listA, listB], { topK: 5 });
```

### Multi-Retriever Pipeline

Combine three or more retrieval paths:

```typescript
import { fuse } from 'fusion-rank';

const vectorResults = await vectorDb.query(embedding);
const bm25Results = await bm25Index.search(query);
const rerankerResults = await reranker.rerank(query, candidates);

const fused = fuse(
  [vectorResults, bm25Results, rerankerResults],
  { strategy: 'rrf', k: 60, topK: 20 },
);
```

### Reusable Fuser with Overrides

Create a fuser with shared defaults, then override per call:

```typescript
import { createFuser } from 'fusion-rank';

const fuser = createFuser({
  strategy: 'rrf',
  k: 60,
  topK: 20,
  normalizeOutput: true,
});

// Use defaults
const results1 = fuser.fuse([listA, listB]);

// Override topK for this specific call
const results2 = fuser.fuse([listC, listD], { topK: 5 });
```

### Inspecting Provenance

Use the `sources` array on each result to understand how the ranking was formed:

```typescript
const results = fuse([vectorResults, bm25Results]);

for (const result of results) {
  console.log(`${result.id} (rank ${result.rank}, score ${result.score.toFixed(4)})`);
  for (const source of result.sources) {
    console.log(`  List ${source.listIndex}: rank ${source.rank}, score ${source.score}`);
  }
}
```

### Deep Metadata Merging

When documents carry metadata from multiple retrievers, use deep merging to combine them:

```typescript
const vectorResults = [
  { id: 'doc-A', score: 0.95, metadata: { scores: { vector: 0.95 }, source: 'pinecone' } },
];

const bm25Results = [
  { id: 'doc-A', score: 12.5, metadata: { scores: { bm25: 12.5 }, source: 'elasticsearch' } },
];

const results = fuse([vectorResults, bm25Results], { metadataMerge: 'deep' });
// results[0].metadata => { scores: { vector: 0.95, bm25: 12.5 }, source: 'elasticsearch' }
```

---

## TypeScript

`fusion-rank` is written in TypeScript with strict mode enabled. Type declarations are shipped in the `dist/` directory alongside the compiled JavaScript.

All public types are exported from the package entry point:

```typescript
import { fuse, rrf, weightedFuse, createFuser, FusionRankError } from 'fusion-rank';
import type {
  RankedItem,
  FusedResult,
  SourceAppearance,
  FuseOptions,
  FuserConfig,
  RRFOptions,
  WeightedFuseOptions,
  Fuser,
  FusionStrategy,
  NormalizationMethod,
  MissingDocStrategy,
  MetadataMerge,
  CustomFusionFn,
  FusionContext,
  DeduplicatedDoc,
  FusionRankErrorCode,
} from 'fusion-rank';
```

Compilation targets ES2022 with CommonJS module output. The `tsconfig.json` enables `declaration`, `declarationMap`, and `sourceMap` for full IDE support and source-level debugging.

---

## License

MIT
