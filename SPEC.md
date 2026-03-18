# fusion-rank -- Specification

## 1. Overview

`fusion-rank` is a standalone result fusion library for combining ranked result lists from multiple retrievers into a single, unified ranking. It implements Reciprocal Rank Fusion (RRF), weighted score fusion, CombSUM, CombMNZ, Borda count, and custom fusion functions. It accepts two or more ranked result lists -- each a sequence of items with IDs and optional scores -- deduplicates by document ID, applies the configured fusion strategy, and returns a single ranked list with fusion scores and per-source provenance. It provides both a TypeScript/JavaScript API for programmatic use and a CLI for fusing result lists from JSON input.

The gap this package fills is specific and well-defined. Hybrid search -- combining keyword retrieval (BM25) with vector retrieval (dense embeddings) -- is the dominant strategy for production RAG pipelines. Every major vector database (Pinecone, Qdrant, Milvus, Weaviate) supports hybrid queries that return results from multiple retrieval paths. But the merge step -- combining ranked lists from heterogeneous retrievers into a single ranking -- is always reimplemented ad hoc. Teams write one-off fusion logic inline: a loop that deduplicates by ID, normalizes scores, applies weights, and sorts. This code is untested, unmaintained, and inconsistent across projects. When a third retriever is added (a cross-encoder reranker, a metadata filter, a knowledge graph traversal), the inline fusion logic becomes a tangled mess of special cases.

In Python, this problem has partial solutions. LangChain provides `EnsembleRetriever`, which implements weighted score combination across retrievers but is tightly coupled to LangChain's retriever abstraction and does not support RRF. Haystack provides a `JoinDocuments` node with basic concatenation and merge logic. Pinecone's built-in hybrid search fuses results internally using a configurable alpha parameter. Qdrant supports RRF natively in its query API. But none of these are standalone, retriever-agnostic fusion libraries. They are all embedded in larger frameworks or vendor-specific APIs.

In JavaScript, nothing exists. Searching npm for "reciprocal rank fusion", "rank fusion", "result fusion", or "hybrid search merge" returns no relevant packages. Every JavaScript team building multi-retriever RAG -- combining Pinecone dense results with `sparse-encode` BM25 results, or merging vector search with a cross-encoder reranker from `rerank-lite` -- must write their own fusion logic from scratch.

`fusion-rank` fills this gap. It provides a clean, retriever-agnostic API for combining any number of ranked result lists using well-studied fusion algorithms. It handles deduplication, score normalization, missing document handling, metadata merging, and provenance tracking. The output is a single ranked list with fusion scores normalized to [0, 1], ready to pass to `context-packer` for budget-aware chunk selection or directly to an LLM prompt.

---

## 2. Goals and Non-Goals

### Goals

- Provide a `fuse(resultLists, options?)` function that takes two or more ranked result lists and returns a single fused ranking as `FusedResult[]`.
- Provide a `rrf(resultLists, options?)` shorthand that applies Reciprocal Rank Fusion with configurable k parameter (default 60).
- Provide a `weightedFuse(resultLists, weights, options?)` shorthand that applies weighted score fusion with per-list weights and configurable score normalization.
- Provide a `createFuser(config)` factory that returns a reusable `Fuser` instance with preset fusion strategy, weights, and normalization options.
- Implement Reciprocal Rank Fusion (RRF) as defined by Cormack, Clarke, and Buettcher (2009): `RRF_score(d) = sum(1 / (k + rank_i(d)))` for each list i containing document d.
- Implement weighted score fusion with pluggable score normalization (min-max, z-score, rank-based, none).
- Implement CombSUM: sum of normalized scores across all lists.
- Implement CombMNZ: sum of normalized scores multiplied by the count of lists containing the document.
- Implement Borda count: rank-based voting where each document receives `(N - rank)` points from each list.
- Accept a custom fusion function for application-specific fusion strategies.
- Deduplicate results across lists by document ID, with a configurable ID field name.
- Merge metadata from multiple appearances of the same document across lists.
- Track provenance: each fused result includes a `sources` array recording which lists contributed it, with the rank and score from each source list.
- Handle missing documents: when a document appears in some lists but not others, apply a configurable default handling strategy (worst rank, skip, configurable default score).
- Normalize final fusion scores to the [0, 1] range for compatibility with downstream consumers (`context-packer`, `rerank-lite`).
- Provide a CLI (`fusion-rank`) for fusing result lists from JSON input.
- Zero mandatory runtime dependencies.
- Target Node.js 18 and above.

### Non-Goals

- **Not a retriever.** This package does not perform vector search, BM25 retrieval, or any other form of document retrieval. It receives pre-retrieved, pre-ranked result lists and fuses them into a single ranking. For retrieval, use a vector database SDK, `sparse-encode` for BM25 sparse vectors, or `rerank-lite` for cross-encoder reranking.
- **Not a reranker.** This package does not recompute relevance scores using a neural model. It combines existing scores and ranks from multiple sources. For learned reranking, use `rerank-lite` or a cross-encoder model.
- **Not a search engine.** This package does not maintain an index, execute queries, or manage documents. It is a pure function that takes ranked lists in and produces a fused ranked list out.
- **Not a vector database integration layer.** This package does not know about Pinecone, Qdrant, Milvus, or any other database. It operates on plain arrays of `{ id, score?, rank? }` objects. Callers are responsible for extracting results from their database SDK into this format.
- **Not a document store.** This package does not store or retrieve document content. It operates on document IDs and scores. If callers need the full document content in the fused output, they include it in the `metadata` field of the input items.
- **Not a learning-to-rank system.** This package implements unsupervised fusion algorithms (RRF, weighted combination, voting). It does not train a model to learn optimal fusion weights from labeled data. For learned fusion, train a model externally and use the custom fusion function hook.

---

## 3. Target Users and Use Cases

### Hybrid Search Pipeline Engineers

Teams building JavaScript-native RAG pipelines that combine dense retrieval (vector search) with sparse retrieval (BM25 via `sparse-encode`) and optionally other retrieval signals (metadata filters, knowledge graph lookups). They need to merge the result lists from these heterogeneous retrievers into a single ranked list before passing it to `context-packer` or directly to an LLM. Today they write inline fusion loops. With `fusion-rank`, they call `fuse([denseResults, sparseResults], { strategy: 'rrf' })` and get a properly deduplicated, scored, provenance-tracked result list.

### Multi-Retriever RAG Architects

Engineers building RAG systems that use three or more retrieval paths: a vector database for semantic similarity, a BM25 index for keyword matching, a cross-encoder reranker for precision, and possibly a metadata-based filter or knowledge graph traversal. Each path returns a ranked list. Fusing three or more lists correctly is significantly harder than fusing two -- the inline approach breaks down rapidly. `fusion-rank` handles any number of input lists with the same API.

### Search Quality Engineers

Engineers responsible for optimizing retrieval quality in production search systems. They need to compare fusion strategies (RRF vs. weighted fusion vs. CombMNZ) on their data, tune hyperparameters (RRF k, per-retriever weights, normalization method), and measure the impact on end-to-end metrics. `fusion-rank`'s provenance tracking shows exactly how each document was scored, enabling root-cause analysis when fusion degrades quality.

### Pinecone Hybrid Search Users

Pinecone's built-in hybrid search uses a simple `alpha * dense_score + (1 - alpha) * sparse_score` formula. Some teams want more control -- using RRF instead of linear combination, fusing more than two signals, or applying per-query adaptive weights. These teams retrieve dense and sparse results separately (using Pinecone's standard query API) and fuse them client-side with `fusion-rank`.

### Evaluation and Benchmarking Teams

Teams running offline retrieval evaluation who need to compare fusion strategies across a test set. They run each retriever independently, save the ranked result lists, and then apply different fusion strategies to measure precision@K, recall@K, NDCG, and MRR for each configuration. `fusion-rank` makes this a one-liner per strategy.

---

## 4. Core Concepts

### Result List

A result list is an ordered sequence of items returned by a single retriever. Each item has a document identifier and optionally a relevance score. The ordering of items in the list defines their rank: the first item has rank 1, the second has rank 2, and so on. A result list may contain 10, 50, 100, or more items.

Different retrievers produce result lists with different score distributions. A vector database returns cosine similarity scores in [0, 1]. A BM25 retriever returns raw BM25 scores in [0, ~20+] depending on the corpus. A cross-encoder reranker returns logit scores in [-10, 10]. These scores are not directly comparable -- a BM25 score of 8.5 and a cosine similarity of 0.85 do not represent the same level of relevance. Fusion algorithms must either normalize these scores to a common scale or operate on ranks alone (which are already comparable).

### Ranked Item

A ranked item is a single entry in a result list. It is represented as a `RankedItem` object:

```typescript
interface RankedItem {
  /** Unique document identifier. Used for deduplication across lists. */
  id: string;

  /** Relevance score from the retriever. Optional -- some lists may have only ranks. */
  score?: number;

  /** Explicit rank (1-based). If omitted, inferred from position in the array. */
  rank?: number;

  /** Arbitrary metadata to pass through to the fused output. */
  metadata?: Record<string, unknown>;
}
```

The `id` field is the join key. When the same document appears in multiple result lists, `fusion-rank` recognizes it by ID and combines the information from all appearances. The `score` field is optional because some fusion strategies (RRF, Borda count) operate on ranks alone and do not require scores. The `rank` field is optional because rank can be inferred from the item's position in the array (first item = rank 1). When both `score` and `rank` are provided, the fusion strategy uses whichever is relevant.

### Fusion Strategy

A fusion strategy is an algorithm that takes multiple ranked lists and produces a single fused score for each document. The strategy determines how information from different retrievers is combined. Different strategies have different properties:

- **RRF** operates on ranks only. It does not need scores and does not require score normalization. It is robust to heterogeneous score distributions.
- **Weighted score fusion** operates on scores. It requires score normalization to make scores from different retrievers comparable. It allows per-retriever importance weights.
- **CombSUM** sums normalized scores. It treats all retrievers equally unless scores are pre-weighted.
- **CombMNZ** multiplies the sum by the count of lists containing the document. It rewards documents that appear in many lists.
- **Borda count** operates on ranks. Each document receives votes proportional to its rank position in each list. Simple and interpretable.

### Score Normalization

Score normalization transforms raw scores from different retrievers onto a common scale. Without normalization, scores from different sources cannot be meaningfully combined. A BM25 score of 15.0 is not "better" than a cosine similarity of 0.92 -- they are on incomparable scales.

`fusion-rank` provides four normalization methods:

- **Min-max normalization**: maps scores to [0, 1] by `(x - min) / (max - min)`. The highest score in the list becomes 1.0, the lowest becomes 0.0.
- **Z-score normalization**: centers scores by subtracting the mean and dividing by the standard deviation: `(x - mean) / stddev`. The result has mean 0 and standard deviation 1, but no fixed range.
- **Rank-based normalization**: replaces scores with `1 - (rank - 1) / (N - 1)` where N is the list length. The top-ranked item gets 1.0, the bottom-ranked gets 0.0. Completely ignores the original score values.
- **None**: uses raw scores without transformation. Appropriate when all input lists already use the same score scale (e.g., all return cosine similarities in [0, 1]).

### Deduplication

The same document may appear in multiple result lists -- this is expected and common. A document that is both semantically similar (high dense retrieval score) and keyword-matched (high BM25 score) appears in both the vector results and the sparse results. During fusion, these duplicate appearances must be identified and merged into a single fused result. Deduplication is performed by matching on the `id` field. When a document appears in multiple lists, its scores and ranks from all lists are combined by the fusion strategy, and its metadata is merged.

### Missing Documents

Not every document appears in every list. A document that ranks highly in the vector retrieval may not appear at all in the BM25 results (because it lacks the exact query terms). This creates a "missing document" problem: when computing the fused score for a document that appears in list A but not list B, what rank or score should be assigned for list B?

`fusion-rank` provides three strategies for handling missing documents:

- **`'worst-rank'`** (default for rank-based methods): Assign the missing document a rank of `listLength + 1` in the list where it is absent. This is the standard approach for RRF and Borda count -- the document is treated as if it appeared just beyond the bottom of the list.
- **`'skip'`**: Do not include the missing list's contribution in the fusion score for that document. The document's fused score is computed only from the lists where it actually appears.
- **`'default-score'`**: Assign a configurable default score (e.g., 0) for the missing list. Useful for weighted score fusion when a missing document should receive a specific penalty.

### Provenance

Every fused result includes provenance information: which input lists contributed to the document's fused score, and what rank and score the document had in each contributing list. This enables debugging ("why did document X rank so high?"), evaluation ("which retriever contributed most to the top-10 results?"), and downstream processing (feeding per-source scores to a learned re-ranker).

---

## 5. Reciprocal Rank Fusion (RRF)

### Background

Reciprocal Rank Fusion was introduced by Cormack, Clarke, and Buettcher in their 2009 paper "Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods" (SIGIR 2009). The paper proposed RRF as a simple, parameter-light method for combining ranked lists that outperformed more complex fusion methods including Condorcet voting and several supervised rank learning approaches.

The core insight of RRF is that the reciprocal of rank is a natural score that decays quickly with rank position, giving much more weight to top-ranked results than to lower-ranked ones. By summing reciprocal ranks across multiple lists, documents that consistently rank near the top of multiple lists receive high fused scores, while documents that rank highly in only one list or rank poorly across all lists receive lower fused scores.

### Formula

For a document d appearing in result lists L_1, L_2, ..., L_m:

```
RRF_score(d) = sum_{i=1}^{m} 1 / (k + rank_i(d))
```

Where:
- `rank_i(d)` is the rank (1-based) of document d in list L_i. If d does not appear in L_i, `rank_i(d)` is set to `listLength_i + 1` (worst-rank handling) or the list is skipped (skip handling).
- `k` is a constant that controls how much the fusion favors top-ranked documents over lower-ranked ones. Default: 60.

### The k Parameter

The k parameter shifts the denominator of the reciprocal rank, controlling the shape of the score decay curve:

- **k = 0**: The fusion score is `1/rank`, a pure reciprocal rank. The top result in a list contributes 1.0, the second contributes 0.5, the third 0.33. The decay is extremely steep -- top-ranked results dominate. This is sensitive to small rank changes (moving from rank 1 to rank 2 halves the contribution).
- **k = 60** (default): The fusion score is `1/(60 + rank)`. The top result contributes `1/61 = 0.0164`, the second `1/62 = 0.0161`, the 10th `1/70 = 0.0143`. The decay is much gentler -- the difference between rank 1 and rank 10 is small in absolute terms. This makes the fusion more robust to minor rank perturbations.
- **k = 1000**: Nearly flat scoring across all ranks. The difference between rank 1 (`1/1001 = 0.000999`) and rank 100 (`1/1100 = 0.000909`) is negligible. Effectively treats all ranked documents as equally important regardless of position.

Cormack et al. tested k values from 0 to 1000. The value k = 60 performed well across a diverse set of TREC benchmarks and retrieval systems. It has since become the de facto standard for RRF. Qdrant and Elasticsearch both default to k = 60 in their RRF implementations.

**Tuning guidance**:
- Use k = 60 (default) unless you have specific evidence that a different value improves metrics on your data.
- Lower k (10-30) if you want to strongly favor documents that rank in the top 5-10 across lists and penalize lower-ranked documents more aggressively.
- Higher k (100-200) if your result lists are long (100+ items) and you want to give meaningful credit to documents ranked 50th or lower.

### Worked Example

Two retrievers, each returning 5 results:

**List 1 (vector retrieval)**:
| Rank | Document ID | Score |
|------|------------|-------|
| 1 | doc-A | 0.95 |
| 2 | doc-B | 0.89 |
| 3 | doc-C | 0.82 |
| 4 | doc-D | 0.71 |
| 5 | doc-E | 0.65 |

**List 2 (BM25 retrieval)**:
| Rank | Document ID | Score |
|------|------------|-------|
| 1 | doc-C | 12.3 |
| 2 | doc-A | 10.1 |
| 3 | doc-F | 8.7 |
| 4 | doc-G | 7.2 |
| 5 | doc-B | 6.0 |

**RRF computation (k = 60)**:

| Document | List 1 rank | List 2 rank | RRF Score |
|----------|------------|------------|-----------|
| doc-A | 1 | 2 | 1/(60+1) + 1/(60+2) = 0.01639 + 0.01613 = 0.03252 |
| doc-B | 2 | 5 | 1/(60+2) + 1/(60+5) = 0.01613 + 0.01538 = 0.03151 |
| doc-C | 3 | 1 | 1/(60+3) + 1/(60+1) = 0.01587 + 0.01639 = 0.03226 |
| doc-D | 4 | absent | 1/(60+4) + 1/(60+6) = 0.01563 + 0.01515 = 0.03078 |
| doc-E | 5 | absent | 1/(60+5) + 1/(60+6) = 0.01538 + 0.01515 = 0.03053 |
| doc-F | absent | 3 | 1/(60+6) + 1/(60+3) = 0.01515 + 0.01587 = 0.03102 |
| doc-G | absent | 4 | 1/(60+6) + 1/(60+4) = 0.01515 + 0.01563 = 0.03078 |

Note: For documents absent from a list, worst-rank handling assigns rank = listLength + 1 = 6.

**Fused ranking (sorted by RRF score descending)**:
1. doc-A: 0.03252
2. doc-C: 0.03226
3. doc-B: 0.03151
4. doc-F: 0.03102
5. doc-D: 0.03078
6. doc-G: 0.03078
7. doc-E: 0.03053

Observations:
- doc-A ranks first because it ranks highly in both lists (rank 1 and rank 2).
- doc-C is a close second: it is the top BM25 result (rank 1 in list 2) and rank 3 in list 1.
- The raw scores (0.95 vs. 12.3) are completely irrelevant -- RRF uses only ranks. This is why RRF works without score normalization.
- doc-F (absent from list 1) still ranks 4th because its strong BM25 ranking (rank 3) gives it enough RRF score.

### Why RRF Works Without Score Normalization

RRF operates entirely on ranks, which are already on a comparable scale across all lists. Rank 1 in a vector retrieval list means exactly the same thing as rank 1 in a BM25 list: the most relevant result according to that retriever. This eliminates the need to calibrate or normalize scores across heterogeneous retrievers.

Score-based fusion methods require normalization because scores from different retrievers are on different scales. A BM25 score of 8.5 and a cosine similarity of 0.85 cannot be meaningfully summed or compared without first transforming them to a common scale. Normalization introduces its own problems: min-max normalization is sensitive to outliers; z-score normalization assumes a roughly normal distribution; rank-based normalization discards the score gaps between adjacent documents. RRF sidesteps all of these issues by ignoring scores entirely.

### Advantages Over Weighted Score Fusion

- No score calibration required. Works even when one retriever returns scores in [0, 1] and another in [0, 100].
- No per-retriever weight tuning required. RRF treats all retrievers equally by default. (Weighted RRF variants exist but the unweighted form is already strong.)
- Robust to score distribution changes. If a retriever's score distribution shifts (due to index updates, model changes, or query characteristics), RRF is unaffected because it uses only the rank ordering.
- Strong empirical performance. Cormack et al. showed RRF outperformed multiple supervised fusion methods despite having only one parameter.

### When to Use RRF

- When fusing results from retrieval systems with incomparable score distributions (the most common case).
- When you have no labeled data to tune per-retriever weights.
- When you want a simple, robust default that works well without tuning.
- When you are combining two or more retrieval paths and want each retriever's top results to contribute to the final ranking.

---

## 6. Weighted Score Fusion

### Algorithm

Weighted score fusion computes the fused score for each document as a weighted sum of its normalized scores from each result list:

```
fused_score(d) = sum_{i=1}^{m} w_i * normalize(score_i(d))
```

Where:
- `w_i` is the weight for result list i. Weights must sum to 1.0 (or are auto-normalized if they do not).
- `normalize(score_i(d))` is the normalized score of document d in list i, computed using the configured normalization method.
- For documents absent from list i: the normalized score is the configured default (0 by default).

### Per-Retriever Weights

Weights express the relative importance of each retriever. A weight of 0.7 for the vector retriever and 0.3 for the BM25 retriever means dense semantic similarity is considered 2.3x more important than keyword matching. Weights are passed as an array corresponding to the result lists array:

```typescript
const fused = weightedFuse([vectorResults, bm25Results], [0.7, 0.3]);
```

If the weights do not sum to 1.0, they are automatically normalized by dividing each weight by the sum of all weights. This allows passing raw importance values (e.g., `[7, 3]`) without manual normalization.

**Weight selection guidance**:
- Start with equal weights (`[0.5, 0.5]` for two lists) and adjust based on offline evaluation.
- For most hybrid search use cases (dense + sparse), weights in the range [0.6, 0.4] to [0.8, 0.2] favoring the vector retriever work well. Dense retrieval captures semantic relevance, which is typically more important than exact keyword matching.
- When a cross-encoder reranker is one of the sources, give it higher weight (0.5-0.7) because cross-encoder scores are generally more accurate than first-stage retrieval scores.
- Per-query adaptive weights (varying weights based on query characteristics) are out of scope for `fusion-rank` but can be implemented by the caller.

### Score Normalization Methods

Weighted score fusion requires normalization because raw scores from different retrievers are on incomparable scales.

**Min-max normalization** (`'min-max'`, default):

```
normalized(x) = (x - min) / (max - min)
```

Where `min` and `max` are the minimum and maximum scores in the result list. The highest-scoring item maps to 1.0, the lowest to 0.0. All other items map linearly between 0 and 1.

Properties:
- Always produces scores in [0, 1].
- Sensitive to outliers: a single extremely high or low score compresses all other items into a narrow range.
- Preserves the relative ordering and proportional gaps between scores.

**Z-score normalization** (`'z-score'`):

```
normalized(x) = (x - mean) / stddev
```

Where `mean` is the arithmetic mean and `stddev` is the standard deviation of all scores in the result list.

Properties:
- Centers scores around 0 with unit standard deviation.
- No fixed output range -- values can be negative or greater than 1.
- Robust to outliers compared to min-max (a single outlier shifts the mean and inflates the stddev but does not compress the rest of the distribution as severely).
- After z-score normalization, a final min-max pass can be applied to map to [0, 1] if needed.

**Rank-based normalization** (`'rank-based'`):

```
normalized(x) = 1 - (rank(x) - 1) / (N - 1)
```

Where `rank(x)` is the 1-based rank of item x in the list and N is the list length. The top item gets 1.0, the bottom gets 0.0.

Properties:
- Completely discards the original score values. Only the ranking matters.
- Produces uniformly spaced scores: the gap between adjacent ranks is always `1/(N-1)`.
- Immune to score distribution differences.
- Loses information about how much better one item is than another. A result list where the top item has score 0.99 and the second has 0.98 produces the same normalized scores as a list where the top has 0.99 and the second has 0.10.

**None** (`'none'`):

Uses raw scores without transformation. Appropriate only when all input lists already produce scores on the same scale (e.g., all return cosine similarities in [0, 1]).

### Missing Document Handling

When a document appears in list A but not list B, the missing score for list B must be specified:

- **`'default-score'`** (default for score-based methods): Use `defaultScore` (default: 0) as the normalized score for the missing list. This penalizes documents that appear in fewer lists.
- **`'skip'`**: Exclude the missing list from the weighted sum for this document and renormalize the remaining weights. A document appearing in only one of three lists has its fused score computed from that one list alone (with full weight).
- **`'worst-rank'`**: Assign a normalized score corresponding to rank `listLength + 1`. This is equivalent to treating the document as the lowest-ranked item in the list.

### When to Use Weighted Score Fusion

- When you have well-calibrated scores that are meaningful in absolute terms (e.g., all retrievers return cosine similarity in [0, 1]).
- When you want explicit control over per-retriever importance through weights.
- When you have labeled data to tune weights (e.g., from offline evaluation showing that giving the reranker 60% weight and the vector retriever 40% weight maximizes NDCG).
- When the score gaps between adjacent documents carry meaningful information that should be preserved (unlike RRF, which discards score gaps).

---

## 7. Other Fusion Methods

### 7.1 CombSUM

CombSUM computes the fused score as the sum of normalized scores across all lists:

```
CombSUM_score(d) = sum_{i=1}^{m} normalize(score_i(d))
```

This is equivalent to weighted score fusion with equal weights. Documents that receive high scores from many retrievers rank highest. Documents that appear in only one list receive a lower sum (because their score from the other lists is 0 or a low default).

CombSUM does not require weight tuning, making it simpler than weighted fusion. However, it implicitly weights all retrievers equally, which may not be optimal.

### 7.2 CombMNZ

CombMNZ (Combination with Minimum Non-Zero) multiplies the CombSUM score by the count of lists containing the document:

```
CombMNZ_score(d) = |lists containing d| * sum_{i=1}^{m} normalize(score_i(d))
```

The multiplication by the count of contributing lists gives a bonus to documents that appear in multiple lists. A document appearing in all three lists with moderate scores will outrank a document appearing in only one list with a high score. This is a form of agreement-based fusion: documents that multiple retrievers agree are relevant receive a multiplicative boost.

CombMNZ was introduced by Fox and Shaw (1994) and has been widely studied in TREC evaluations. It performs well when the retrievers are diverse (using different algorithms or different data) but suffers when the retrievers are correlated (returning similar results), because the count multiplier over-rewards agreement that is not independent evidence.

### 7.3 Borda Count

Borda count is a rank-based voting method where each document receives points based on its rank position in each list:

```
Borda_score(d) = sum_{i=1}^{m} (N_i - rank_i(d))
```

Where:
- `N_i` is the number of items in list i.
- `rank_i(d)` is the 1-based rank of document d in list i (or `N_i + 1` for absent documents).

The top-ranked item in a list of 10 receives 9 points. The second-ranked receives 8 points. The last-ranked receives 0 points. Absent documents receive -1 point (or 0, depending on the missing document strategy).

Borda count is simple, interpretable, and robust. Like RRF, it operates on ranks only and does not require score normalization. Unlike RRF, it assigns linearly decreasing points (1 point per rank position) rather than hyperbolically decreasing points (reciprocal rank). This means Borda count gives proportionally more weight to mid-ranked documents compared to RRF, which concentrates weight at the top.

**When to use**: When interpretability is valued -- "document X received 47 votes" is more intuitive than "document X has an RRF score of 0.03252." When the mid-ranked results matter as much as the top results.

### 7.4 Custom Fusion Function

The caller supplies a function that receives all result lists (with metadata about each list) and returns a fused score for each document:

```typescript
type CustomFusionFn = (
  docId: string,
  appearances: {
    listIndex: number;
    rank: number;
    score?: number;
    normalizedScore?: number;
  }[],
  context: FusionContext,
) => number;

interface FusionContext {
  totalLists: number;
  listLengths: number[];
  options: FuseOptions;
}
```

The custom function is called once per unique document. It receives all of that document's appearances across the input lists and returns a single fused score. The library handles deduplication, provenance tracking, and sorting; the custom function handles only the score computation.

**When to use**: When the built-in strategies do not capture the application's fusion logic. Examples: a strategy that discounts results from a known-unreliable retriever; a strategy that applies a boosting function based on document metadata (e.g., boost recent documents); a strategy that uses Condorcet voting or another algorithm not built into the library.

---

## 8. Score Normalization

Score normalization is a prerequisite for score-based fusion methods (weighted score fusion, CombSUM, CombMNZ). It transforms raw scores from heterogeneous retrievers onto a common scale so they can be meaningfully combined.

### Min-Max Normalization

```
normalized(x) = (x - min) / (max - min)
```

Transforms all scores in a list to the range [0, 1]. The highest score maps to 1.0, the lowest to 0.0.

**Edge case**: When all scores in a list are identical (`max = min`), the denominator is 0. In this case, all items receive a normalized score of 0.5 (the midpoint).

**Example**:

BM25 scores: [12.3, 10.1, 8.7, 7.2, 6.0]
- min = 6.0, max = 12.3, range = 6.3
- 12.3 -> (12.3 - 6.0) / 6.3 = 1.000
- 10.1 -> (10.1 - 6.0) / 6.3 = 0.651
- 8.7 -> (8.7 - 6.0) / 6.3 = 0.429
- 7.2 -> (7.2 - 6.0) / 6.3 = 0.190
- 6.0 -> (6.0 - 6.0) / 6.3 = 0.000

### Z-Score Normalization

```
normalized(x) = (x - mean) / stddev
```

Centers scores around 0 with unit standard deviation.

**Edge case**: When all scores are identical (`stddev = 0`), all items receive a normalized score of 0.

**Example**:

BM25 scores: [12.3, 10.1, 8.7, 7.2, 6.0]
- mean = 8.86, stddev = 2.37
- 12.3 -> (12.3 - 8.86) / 2.37 = 1.453
- 10.1 -> (10.1 - 8.86) / 2.37 = 0.524
- 8.7 -> (8.7 - 8.86) / 2.37 = -0.068
- 7.2 -> (7.2 - 8.86) / 2.37 = -0.700
- 6.0 -> (6.0 - 8.86) / 2.37 = -1.207

Note: z-score normalized values can be negative and can exceed 1.0. When used with weighted score fusion, the final fused scores may also be negative or exceed 1.0. A final min-max pass can be applied to the fused output to rescale to [0, 1] if needed (`normalizeOutput: true`, the default).

### Rank-Based Normalization

```
normalized(x) = 1 - (rank(x) - 1) / (N - 1)
```

Where `rank(x)` is the 1-based rank and N is the list length.

**Edge case**: When the list has only one item (`N = 1`), the denominator is 0. The single item receives a normalized score of 1.0.

**Example**:

5 items ranked 1 through 5:
- rank 1 -> 1 - (1 - 1) / (5 - 1) = 1.000
- rank 2 -> 1 - (2 - 1) / (5 - 1) = 0.750
- rank 3 -> 1 - (3 - 1) / (5 - 1) = 0.500
- rank 4 -> 1 - (4 - 1) / (5 - 1) = 0.250
- rank 5 -> 1 - (5 - 1) / (5 - 1) = 0.000

### No Normalization

Raw scores are passed through unchanged. Use only when all input lists produce scores on the same scale.

---

## 9. Deduplication

### Deduplicate by Document ID

The same document may appear in multiple result lists. During fusion, all appearances of the same document (identified by the `id` field) are grouped together. The fusion strategy combines information from all appearances into a single fused score. The output contains exactly one `FusedResult` per unique document ID.

### Configurable ID Field

By default, deduplication uses the `id` field of each `RankedItem`. For data formats where the identifier has a different name, the `idField` option specifies which field to use:

```typescript
const fused = fuse([list1, list2], {
  idField: 'documentId',  // use item.documentId instead of item.id
});
```

When `idField` is set, each item's deduplication key is `item[idField]`. The output `FusedResult.id` is also set from this field.

### Metadata Merging

When the same document appears in multiple lists, it may carry different metadata in each appearance (e.g., different snippets, highlight positions, or debug information). `fusion-rank` merges metadata from all appearances:

- For each metadata key, the value from the first list (in input order) that contains the document takes precedence.
- If `metadataMerge: 'deep'` is configured, metadata objects are deep-merged (later values override earlier values for the same nested key).
- If `metadataMerge: 'first'` is configured (default), the metadata from the first appearance is used without merging.
- If `metadataMerge: 'all'` is configured, the `FusedResult.metadata` contains an array of all metadata objects from all appearances.

---

## 10. API Surface

### Installation

```bash
npm install fusion-rank
```

### Primary Export: `fuse`

```typescript
import { fuse } from 'fusion-rank';

const fusedResults = fuse([vectorResults, bm25Results], {
  strategy: 'rrf',
  k: 60,
});

// fusedResults is FusedResult[], sorted by fused score descending
```

**Signature**:

```typescript
function fuse(resultLists: RankedItem[][], options?: FuseOptions): FusedResult[];
```

The function is synchronous. All computation (normalization, deduplication, fusion, sorting) is performed in a single call. No I/O, no async operations.

**Behavior**:
1. Validate inputs (at least 2 result lists, each non-empty).
2. Assign ranks to items that do not have an explicit `rank` field (rank = position + 1).
3. Normalize scores if the strategy requires it.
4. Identify all unique document IDs across all lists.
5. For each unique document, compute the fused score using the configured strategy.
6. Build `FusedResult` objects with provenance.
7. Sort by fused score descending.
8. Optionally normalize output scores to [0, 1].
9. Optionally limit to top K results.
10. Return `FusedResult[]`.

### Shorthand: `rrf`

```typescript
import { rrf } from 'fusion-rank';

const fusedResults = rrf([vectorResults, bm25Results], { k: 60 });
```

**Signature**:

```typescript
function rrf(resultLists: RankedItem[][], options?: RRFOptions): FusedResult[];
```

Equivalent to `fuse(resultLists, { strategy: 'rrf', ...options })`.

### Shorthand: `weightedFuse`

```typescript
import { weightedFuse } from 'fusion-rank';

const fusedResults = weightedFuse(
  [vectorResults, bm25Results],
  [0.7, 0.3],
  { normalization: 'min-max' },
);
```

**Signature**:

```typescript
function weightedFuse(
  resultLists: RankedItem[][],
  weights: number[],
  options?: WeightedFuseOptions,
): FusedResult[];
```

Equivalent to `fuse(resultLists, { strategy: 'weighted', weights, ...options })`.

### Factory: `createFuser`

```typescript
import { createFuser } from 'fusion-rank';

const fuser = createFuser({
  strategy: 'rrf',
  k: 60,
  topK: 20,
  normalizeOutput: true,
});

// Reuse across many queries
const result1 = fuser.fuse([queryResults1Dense, queryResults1Sparse]);
const result2 = fuser.fuse([queryResults2Dense, queryResults2Sparse]);
```

**Signature**:

```typescript
function createFuser(config: FuserConfig): Fuser;

interface Fuser {
  fuse(resultLists: RankedItem[][], overrides?: Partial<FuseOptions>): FusedResult[];
}
```

`createFuser` validates the configuration at construction time. The returned `Fuser` instance is reusable and stateless across calls -- each `fuse()` call is independent.

### TypeScript Type Definitions

```typescript
// -- Input Types ----------------------------------------------------------

/** A single item in a ranked result list from one retriever. */
interface RankedItem {
  /**
   * Unique document identifier. Used as the join key for deduplication across lists.
   * Required unless idField option specifies an alternative field.
   */
  id: string;

  /**
   * Relevance score from the retriever. Optional.
   * Required for score-based fusion strategies (weighted, combsum, combmnz).
   * Not needed for rank-based strategies (rrf, borda).
   */
  score?: number;

  /**
   * Explicit 1-based rank. Optional.
   * If omitted, rank is inferred from the item's position in the array (first = rank 1).
   */
  rank?: number;

  /**
   * Arbitrary metadata. Passed through to the fused output.
   * When the same document appears in multiple lists, metadata is merged
   * according to the metadataMerge option.
   */
  metadata?: Record<string, unknown>;
}

// -- Strategy Types -------------------------------------------------------

/** Built-in fusion strategy identifiers. */
type FusionStrategy =
  | 'rrf'        // Reciprocal Rank Fusion
  | 'weighted'   // Weighted score fusion with normalization
  | 'combsum'    // Sum of normalized scores
  | 'combmnz'    // Sum of normalized scores * count of lists
  | 'borda'      // Borda count (rank-based voting)
  | 'custom';    // Caller-supplied fusion function

/** Score normalization method for score-based strategies. */
type NormalizationMethod =
  | 'min-max'      // (x - min) / (max - min) -> [0, 1]
  | 'z-score'      // (x - mean) / stddev -> centered, no fixed range
  | 'rank-based'   // 1 - (rank - 1) / (N - 1) -> [0, 1]
  | 'none';        // Raw scores, no transformation

/** Missing document handling strategy. */
type MissingDocStrategy =
  | 'worst-rank'     // Assign rank = listLength + 1
  | 'skip'           // Exclude the missing list from the fusion for this document
  | 'default-score'; // Use a configurable default score

/** Metadata merge strategy. */
type MetadataMerge =
  | 'first'  // Use metadata from first appearance (default)
  | 'deep'   // Deep-merge all metadata objects
  | 'all';   // Store array of all metadata objects

// -- Options --------------------------------------------------------------

/** Options for the fuse() function. */
interface FuseOptions {
  /**
   * Fusion strategy.
   * Default: 'rrf'.
   */
  strategy?: FusionStrategy;

  /**
   * RRF k parameter. Only applies when strategy is 'rrf'.
   * Higher values produce gentler rank decay.
   * Default: 60.
   */
  k?: number;

  /**
   * Per-list weights for weighted fusion.
   * Must have the same length as resultLists.
   * Automatically normalized to sum to 1.0.
   * Only applies when strategy is 'weighted'.
   */
  weights?: number[];

  /**
   * Score normalization method for score-based strategies.
   * Default: 'min-max'.
   */
  normalization?: NormalizationMethod;

  /**
   * How to handle documents that appear in some lists but not others.
   * Default: 'worst-rank' for rank-based strategies (rrf, borda),
   *          'default-score' for score-based strategies (weighted, combsum, combmnz).
   */
  missingDocStrategy?: MissingDocStrategy;

  /**
   * Default score to assign for missing documents.
   * Only applies when missingDocStrategy is 'default-score'.
   * Default: 0.
   */
  defaultScore?: number;

  /**
   * Whether to normalize the final fused scores to [0, 1] using min-max.
   * Default: true.
   */
  normalizeOutput?: boolean;

  /**
   * Maximum number of results to return. Results beyond topK are discarded.
   * Default: Infinity (return all fused results).
   */
  topK?: number;

  /**
   * Field name to use as the document identifier for deduplication.
   * Default: 'id'.
   */
  idField?: string;

  /**
   * Metadata merge strategy when the same document appears in multiple lists.
   * Default: 'first'.
   */
  metadataMerge?: MetadataMerge;

  /**
   * Custom fusion function. Required when strategy is 'custom'.
   */
  customFusion?: CustomFusionFn;
}

/** Options specific to the rrf() shorthand. */
interface RRFOptions extends Omit<FuseOptions, 'strategy' | 'weights' | 'normalization'> {
  k?: number;
}

/** Options specific to the weightedFuse() shorthand. */
interface WeightedFuseOptions extends Omit<FuseOptions, 'strategy' | 'weights'> {
  normalization?: NormalizationMethod;
}

/** Configuration for createFuser(). Same shape as FuseOptions. */
type FuserConfig = FuseOptions;

// -- Output Types ---------------------------------------------------------

/** Information about a document's appearance in one source list. */
interface SourceAppearance {
  /** Index of the source result list (0-based). */
  listIndex: number;

  /** Rank of the document in this list (1-based). */
  rank: number;

  /** Raw score from this list. Undefined if the list did not provide scores. */
  score?: number;

  /** Normalized score from this list. Undefined for rank-only strategies. */
  normalizedScore?: number;
}

/** A single document in the fused result set. */
interface FusedResult {
  /** Document identifier. */
  id: string;

  /**
   * Fused score. When normalizeOutput is true (default), this is in [0, 1].
   * Higher is more relevant.
   */
  score: number;

  /**
   * Rank in the fused result set (1-based).
   */
  rank: number;

  /**
   * Provenance: which source lists contributed to this document's fused score,
   * with the rank and score from each source.
   */
  sources: SourceAppearance[];

  /**
   * Merged metadata from all appearances, according to the metadataMerge option.
   */
  metadata?: Record<string, unknown>;
}

// -- Function Types -------------------------------------------------------

/** Custom fusion function type. */
type CustomFusionFn = (
  docId: string,
  appearances: {
    listIndex: number;
    rank: number;
    score?: number;
    normalizedScore?: number;
  }[],
  context: FusionContext,
) => number;

/** Context provided to custom fusion functions. */
interface FusionContext {
  /** Total number of input result lists. */
  totalLists: number;

  /** Length of each input result list. */
  listLengths: number[];

  /** The full options object. */
  options: FuseOptions;
}

// -- Error ----------------------------------------------------------------

class FusionRankError extends Error {
  readonly code: FusionRankErrorCode;
}

type FusionRankErrorCode =
  | 'TOO_FEW_LISTS'          // Fewer than 2 result lists provided
  | 'EMPTY_LIST'             // One or more result lists are empty
  | 'MISSING_SCORES'         // Score-based strategy but items lack scores
  | 'WEIGHT_LENGTH_MISMATCH' // Weights array length != result lists length
  | 'INVALID_K'              // k parameter is not a positive number
  | 'INVALID_WEIGHTS'        // Weights contain non-positive values
  | 'MISSING_CUSTOM_FN'      // strategy='custom' but no customFusion provided
  | 'INVALID_OPTIONS';       // Other configuration errors
```

---

## 11. Configuration Reference

All options with their defaults, types, and descriptions:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `strategy` | `FusionStrategy` | `'rrf'` | Fusion algorithm. |
| `k` | `number` | `60` | RRF k parameter. RRF only. |
| `weights` | `number[]` | equal weights | Per-list weights. Weighted only. |
| `normalization` | `NormalizationMethod` | `'min-max'` | Score normalization for score-based strategies. |
| `missingDocStrategy` | `MissingDocStrategy` | `'worst-rank'` (rank-based) / `'default-score'` (score-based) | Handling for documents absent from some lists. |
| `defaultScore` | `number` | `0` | Default normalized score for missing documents. |
| `normalizeOutput` | `boolean` | `true` | Normalize final fused scores to [0, 1]. |
| `topK` | `number` | `Infinity` | Maximum number of results to return. |
| `idField` | `string` | `'id'` | Field name for document identifier. |
| `metadataMerge` | `MetadataMerge` | `'first'` | Metadata merge strategy. |
| `customFusion` | `CustomFusionFn` | (none) | Custom fusion function. Required when strategy='custom'. |

---

## 12. CLI

### Installation and Invocation

```bash
# Global install
npm install -g fusion-rank
fusion-rank --strategy rrf --k 60 < results.json

# npx (no install)
npx fusion-rank --strategy rrf < results.json

# As a pipeline stage
retriever-dense --query "..." > dense.json && \
retriever-sparse --query "..." > sparse.json && \
fusion-rank --strategy rrf dense.json sparse.json | context-packer --budget 4000
```

### CLI Binary Name

`fusion-rank`

### Input Format

The CLI accepts input in two forms:

**Stdin**: A JSON array of result lists (array of arrays):

```json
[
  [
    { "id": "doc-A", "score": 0.95 },
    { "id": "doc-B", "score": 0.89 },
    { "id": "doc-C", "score": 0.82 }
  ],
  [
    { "id": "doc-C", "score": 12.3 },
    { "id": "doc-A", "score": 10.1 },
    { "id": "doc-F", "score": 8.7 }
  ]
]
```

**File arguments**: Two or more file paths, each containing a JSON array of ranked items (one list per file):

```bash
fusion-rank --strategy rrf dense_results.json sparse_results.json rerank_results.json
```

### Output Format

By default, the CLI writes a JSON array of `FusedResult` objects to stdout:

```json
[
  {
    "id": "doc-A",
    "score": 1.0,
    "rank": 1,
    "sources": [
      { "listIndex": 0, "rank": 1, "score": 0.95 },
      { "listIndex": 1, "rank": 2, "score": 10.1 }
    ]
  },
  {
    "id": "doc-C",
    "score": 0.87,
    "rank": 2,
    "sources": [
      { "listIndex": 0, "rank": 3, "score": 0.82 },
      { "listIndex": 1, "rank": 1, "score": 12.3 }
    ]
  }
]
```

With `--ids-only`, only the document IDs are written (one per line), useful for piping to downstream tools.

### Flags

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--strategy` | `-s` | string | `rrf` | Fusion strategy: rrf, weighted, combsum, combmnz, borda. |
| `--k` | `-k` | number | `60` | RRF k parameter. |
| `--weights` | `-w` | string | equal | Comma-separated weights (e.g., "0.7,0.3"). |
| `--normalization` | `-n` | string | `min-max` | Normalization: min-max, z-score, rank-based, none. |
| `--missing` | `-m` | string | (auto) | Missing doc handling: worst-rank, skip, default-score. |
| `--default-score` | | number | `0` | Default score for missing documents. |
| `--top-k` | | number | (all) | Maximum results to return. |
| `--id-field` | | string | `id` | Field name for document identifier. |
| `--no-normalize-output` | | boolean | `false` | Disable output score normalization. |
| `--ids-only` | | boolean | `false` | Output only document IDs, one per line. |
| `--pretty` | `-p` | boolean | `false` | Pretty-print JSON output. |

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Fusion completed successfully. |
| `1` | Fusion failed (empty lists, missing scores for score-based strategy). |
| `2` | Configuration error (invalid flags, missing required options). |

### CLI Examples

```bash
# RRF fusion of two result files
fusion-rank dense.json sparse.json

# Weighted fusion with 70/30 split, top 20 results
fusion-rank --strategy weighted --weights "0.7,0.3" --top-k 20 dense.json sparse.json

# Three-way RRF fusion from stdin
cat three_lists.json | fusion-rank --strategy rrf --k 60 --pretty

# CombMNZ with z-score normalization
fusion-rank --strategy combmnz --normalization z-score dense.json sparse.json rerank.json

# Borda count, IDs only, for evaluation scripts
fusion-rank --strategy borda --ids-only dense.json sparse.json > fused_ids.txt
```

---

## 13. Integration

### With `sparse-encode`

`sparse-encode` generates BM25 sparse vectors for keyword-based retrieval. In a hybrid search pipeline, the vector database returns dense retrieval results and sparse retrieval results separately. `fusion-rank` merges them:

```typescript
import { createBM25 } from 'sparse-encode';
import { rrf } from 'fusion-rank';

const bm25 = createBM25();
bm25.fit(corpus);

async function hybridSearch(query: string, topK = 10) {
  const denseQuery = await embedder.embed(query);
  const sparseQuery = bm25.encodeQuery(query);

  const [denseResults, sparseResults] = await Promise.all([
    vectorDb.searchDense(denseQuery, { topK: 50 }),
    vectorDb.searchSparse(sparseQuery, { topK: 50 }),
  ]);

  // Fuse using RRF -- no score normalization needed
  const fused = rrf([
    denseResults.map(r => ({ id: r.id, score: r.score, metadata: r.metadata })),
    sparseResults.map(r => ({ id: r.id, score: r.score, metadata: r.metadata })),
  ], { k: 60, topK });

  return fused;
}
```

### With `context-packer`

`context-packer` selects and orders chunks for LLM context windows. `fusion-rank`'s output feeds directly into it as scored chunks:

```typescript
import { rrf } from 'fusion-rank';
import { pack } from 'context-packer';

const fused = rrf([denseResults, sparseResults, rerankResults]);

const scoredChunks = fused.map(item => ({
  id: item.id,
  content: item.metadata?.content as string,
  score: item.score,  // RRF score, normalized to [0, 1]
  embedding: item.metadata?.embedding as number[] | undefined,
  metadata: item.metadata,
}));

const packed = pack(scoredChunks, {
  budget: 4000,
  strategy: 'mmr',
  ordering: 'u-shaped',
});
```

### With `embed-cache`

`embed-cache` provides cached dense embeddings. In a hybrid search pipeline, `embed-cache` handles the dense path while `sparse-encode` handles the sparse path, and `fusion-rank` merges the results:

```typescript
import { createCache } from 'embed-cache';
import { createBM25 } from 'sparse-encode';
import { rrf } from 'fusion-rank';

const embedCache = createCache({
  model: 'text-embedding-3-small',
  embedder: openaiEmbedder,
});
const bm25 = createBM25();
bm25.fit(corpus);

async function search(query: string) {
  const denseQuery = await embedCache.embed(query);
  const sparseQuery = bm25.encodeQuery(query);

  const [dense, sparse] = await Promise.all([
    pinecone.query({ vector: denseQuery, topK: 50 }),
    pinecone.query({ sparseVector: sparseQuery, topK: 50 }),
  ]);

  return rrf([
    dense.matches.map(m => ({ id: m.id, score: m.score })),
    sparse.matches.map(m => ({ id: m.id, score: m.score })),
  ]);
}
```

### With `rerank-lite`

`rerank-lite` provides cross-encoder reranking. A common pattern is three-stage retrieval: (1) broad retrieval from multiple sources, (2) fusion to combine, (3) reranking the fused top-K with a cross-encoder for precision. Alternatively, the reranker's output can be treated as a third result list and fused alongside the original retrieval results:

```typescript
import { rrf } from 'fusion-rank';
import { rerank } from 'rerank-lite';

// Three-way fusion: dense + sparse + reranked
const denseResults = await vectorDb.searchDense(denseQuery, { topK: 50 });
const sparseResults = await vectorDb.searchSparse(sparseQuery, { topK: 50 });

// Rerank the top dense results with a cross-encoder
const reranked = await rerank(
  query,
  denseResults.slice(0, 20).map(r => r.text),
  { model: 'cross-encoder' },
);

const fused = rrf([
  denseResults.map(r => ({ id: r.id, score: r.score })),
  sparseResults.map(r => ({ id: r.id, score: r.score })),
  reranked.map(r => ({ id: r.id, score: r.score })),
]);
```

---

## 14. Testing Strategy

### Unit Tests

Each fusion algorithm is tested independently with deterministic inputs and analytically verifiable outputs.

**RRF tests:**
- Verify RRF score for a document appearing in all lists matches the hand-computed formula: `sum(1/(k + rank))`.
- Verify RRF score with k = 0 produces pure reciprocal rank: `sum(1/rank)`.
- Verify RRF score with a large k (1000) produces nearly equal scores for all ranked documents.
- Verify missing document handling with `worst-rank`: absent document receives rank = listLength + 1.
- Verify missing document handling with `skip`: absent document's fused score comes from only the lists where it appears.
- Verify the worked example from Section 5 produces the exact expected scores and ranking.
- Verify RRF ignores scores (changing scores without changing ranks produces identical output).

**Weighted score fusion tests:**
- Verify weighted score with equal weights produces the same result as CombSUM.
- Verify weights are auto-normalized to sum to 1.0.
- Verify min-max normalization maps highest score to 1.0 and lowest to 0.0.
- Verify z-score normalization produces mean ~0 and stddev ~1.
- Verify rank-based normalization maps rank 1 to 1.0 and last rank to 0.0.
- Verify missing document handling with default score 0.
- Verify score-based strategy throws when items lack scores.

**CombSUM tests:**
- Verify CombSUM equals the sum of min-max normalized scores.
- Verify a document in all lists scores higher than one in a single list (given comparable scores).

**CombMNZ tests:**
- Verify CombMNZ equals CombSUM * count of contributing lists.
- Verify the multiplier: a document in 3 of 3 lists with sum S scores 3S; a document in 1 of 3 lists with the same sum scores 1S.

**Borda count tests:**
- Verify Borda score for rank 1 in a list of N items is N - 1.
- Verify Borda score for the last-ranked item is 0.
- Verify absent documents with worst-rank handling receive N - (N + 1) = -1 (or 0, depending on configuration).

**Deduplication tests:**
- Verify a document appearing in 3 lists produces exactly 1 FusedResult.
- Verify `idField` option uses the specified field for deduplication.
- Verify items without the specified ID field throw a meaningful error.

**Metadata merging tests:**
- Verify `metadataMerge: 'first'` uses metadata from the first list containing the document.
- Verify `metadataMerge: 'deep'` deep-merges metadata from all appearances.
- Verify `metadataMerge: 'all'` stores an array of all metadata objects.

**Normalization edge case tests:**
- Verify min-max normalization with all identical scores returns 0.5 for all items.
- Verify z-score normalization with all identical scores returns 0 for all items.
- Verify rank-based normalization with a single-item list returns 1.0.

**Output normalization tests:**
- Verify `normalizeOutput: true` maps the highest fused score to 1.0 and the lowest to 0.0.
- Verify `normalizeOutput: false` preserves raw fused scores.

**Provenance tests:**
- Verify each FusedResult's `sources` array contains one entry per contributing list.
- Verify `sources[i].rank` matches the document's rank in that list.
- Verify `sources[i].score` matches the raw score from that list.
- Verify `sources[i].normalizedScore` matches the normalized score (for score-based strategies).

**Error handling tests:**
- Verify `TOO_FEW_LISTS` when fewer than 2 lists are provided.
- Verify `EMPTY_LIST` when a list is empty.
- Verify `MISSING_SCORES` when using a score-based strategy with score-less items.
- Verify `WEIGHT_LENGTH_MISMATCH` when weights array length differs from list count.
- Verify `INVALID_K` when k is 0 or negative.
- Verify `MISSING_CUSTOM_FN` when strategy is 'custom' but no function is provided.

### Integration Tests

- **End-to-end RRF**: Fuse 3 lists of 50 items each with known overlap patterns. Verify the top-10 contains documents that rank highly across multiple lists.
- **End-to-end weighted fusion**: Fuse 2 lists with weights [0.8, 0.2]. Verify the ranking is dominated by the heavily-weighted list.
- **createFuser round-trip**: Create a fuser, fuse multiple independent query results, verify each call is independent (no state leakage).
- **Large-scale fusion**: Fuse 5 lists of 1000 items each. Verify correctness against a naive reference implementation and verify completion within performance targets.
- **CLI end-to-end**: Pipe JSON through the CLI binary, verify stdout matches the expected fused output.

### Property-Based Tests

Using a property-based testing framework (fast-check):

- **Idempotency**: Fusing the same list with itself produces the original ranking (up to score scaling).
- **Monotonicity**: If document d has a higher rank than document e in every list, d has a higher fused score than e.
- **Symmetry**: Swapping the order of input lists (without weights) does not change the fused ranking.
- **Score bounds**: When `normalizeOutput: true`, all fused scores are in [0, 1].
- **Deduplication invariant**: The output contains exactly as many items as there are unique document IDs across all input lists.
- **Provenance completeness**: Every FusedResult's `sources` array has one entry per list that contained the document.

---

## 15. Performance

### Time Complexity

| Operation | Time Complexity | Notes |
|-----------|----------------|-------|
| RRF | O(N * M) | N = total unique documents, M = number of lists. |
| Weighted score fusion | O(N * M) | Plus O(L) per list for normalization, where L = list length. |
| CombSUM | O(N * M) | Same as weighted with equal weights. |
| CombMNZ | O(N * M) | Same as CombSUM plus a count lookup. |
| Borda count | O(N * M) | Same structure as RRF. |
| Deduplication | O(T) | T = total items across all lists. Uses Map for O(1) lookups. |
| Output sorting | O(N log N) | Final sort of fused results by score. |

Where:
- T = total items across all lists (e.g., 5 lists of 100 items = 500).
- N = unique documents after deduplication (e.g., 350 unique out of 500 total).
- M = number of result lists.

### Expected Latency

| Scenario | Lists | Items per list | Total items | Expected time |
|----------|-------|---------------|-------------|---------------|
| Typical hybrid search | 2 | 50 | 100 | < 0.5ms |
| Three-retriever fusion | 3 | 100 | 300 | < 1ms |
| Large-scale evaluation | 5 | 1000 | 5000 | < 5ms |
| Stress test | 10 | 1000 | 10000 | < 15ms |

Fusion is CPU-bound and fast. Even the largest realistic inputs (10 lists of 1000 items) complete in under 15ms. Fusion is never the bottleneck in a retrieval pipeline -- the retrieval calls themselves take 10-100ms each.

### Memory Footprint

The primary memory cost is the deduplication map, which stores one entry per unique document. Each entry holds the document ID, fused score, and source appearances. For 1000 unique documents, this is approximately 50-100 KB. Fusion adds negligible memory overhead to a RAG pipeline.

---

## 16. Dependencies

### Runtime Dependencies

**Zero mandatory runtime dependencies.** All fusion algorithms, normalization methods, and utility functions are implemented in pure TypeScript. No external packages are used at runtime.

This means `fusion-rank` works in any JavaScript runtime: Node.js 18+, Deno, Bun, Cloudflare Workers, and modern browsers (with a bundler).

### Dev Dependencies

| Package | Purpose |
|---------|---------|
| `typescript` | TypeScript compiler |
| `vitest` | Test runner |
| `eslint` | Linting |
| `@types/node` | Node.js type definitions |

### Peer Dependencies

None. `fusion-rank` is a standalone utility. It does not depend on or require any retrieval framework, vector database SDK, or other packages from this monorepo.

---

## 17. File Structure

```
fusion-rank/
├── package.json
├── tsconfig.json
├── SPEC.md
├── README.md
├── src/
│   ├── index.ts              # Public API: exports fuse, rrf, weightedFuse, createFuser, types
│   ├── types.ts              # All TypeScript interfaces and type aliases
│   ├── fuse.ts               # Core fuse() function and createFuser() factory
│   ├── strategies/
│   │   ├── index.ts          # Strategy dispatcher (selects strategy based on options)
│   │   ├── rrf.ts            # Reciprocal Rank Fusion implementation
│   │   ├── weighted.ts       # Weighted score fusion implementation
│   │   ├── combsum.ts        # CombSUM implementation
│   │   ├── combmnz.ts        # CombMNZ implementation
│   │   └── borda.ts          # Borda count implementation
│   ├── normalization/
│   │   ├── index.ts          # Normalization dispatcher
│   │   ├── min-max.ts        # Min-max normalization
│   │   ├── z-score.ts        # Z-score normalization
│   │   └── rank-based.ts     # Rank-based normalization
│   ├── dedup.ts              # Deduplication and metadata merging
│   ├── provenance.ts         # Source provenance tracking
│   ├── errors.ts             # FusionRankError class and error codes
│   └── cli.ts                # CLI entry point
├── src/__tests__/
│   ├── rrf.test.ts           # RRF unit tests
│   ├── weighted.test.ts      # Weighted fusion unit tests
│   ├── combsum.test.ts       # CombSUM unit tests
│   ├── combmnz.test.ts       # CombMNZ unit tests
│   ├── borda.test.ts         # Borda count unit tests
│   ├── normalization.test.ts # Normalization method unit tests
│   ├── dedup.test.ts         # Deduplication and metadata merge tests
│   ├── fuse.test.ts          # Integration tests for fuse() and createFuser()
│   ├── cli.test.ts           # CLI end-to-end tests
│   └── properties.test.ts    # Property-based tests (fast-check)
├── src/__benchmarks__/
│   └── fusion-throughput.ts  # Performance benchmarks
└── dist/                     # Build output (gitignored)
    ├── index.js
    ├── index.d.ts
    └── ...
```

---

## 18. Implementation Roadmap

### Phase 1: Core RRF (v0.1.0)

1. Define all TypeScript types (`types.ts`, `errors.ts`).
2. Implement deduplication by document ID (`dedup.ts`).
3. Implement RRF algorithm (`strategies/rrf.ts`).
4. Implement provenance tracking (`provenance.ts`).
5. Implement output score normalization (min-max on fused scores).
6. Implement `fuse()` function with RRF strategy (`fuse.ts`).
7. Implement `rrf()` shorthand.
8. Wire up `index.ts` exports.
9. Write unit tests for RRF with worked example verification.
10. Write deduplication tests.

### Phase 2: Score Normalization and Weighted Fusion (v0.2.0)

11. Implement min-max normalization (`normalization/min-max.ts`).
12. Implement z-score normalization (`normalization/z-score.ts`).
13. Implement rank-based normalization (`normalization/rank-based.ts`).
14. Implement normalization dispatcher (`normalization/index.ts`).
15. Implement weighted score fusion (`strategies/weighted.ts`).
16. Implement `weightedFuse()` shorthand.
17. Write normalization unit tests with edge cases.
18. Write weighted fusion unit tests.

### Phase 3: Additional Strategies (v0.3.0)

19. Implement CombSUM (`strategies/combsum.ts`).
20. Implement CombMNZ (`strategies/combmnz.ts`).
21. Implement Borda count (`strategies/borda.ts`).
22. Implement custom fusion function support.
23. Implement strategy dispatcher (`strategies/index.ts`).
24. Write unit tests for all new strategies.
25. Write property-based tests (`properties.test.ts`).

### Phase 4: Factory, Metadata, and CLI (v0.4.0)

26. Implement `createFuser()` factory with configuration validation.
27. Implement metadata merge strategies (first, deep, all).
28. Implement configurable `idField` option.
29. Implement CLI (`cli.ts`): parse flags, read stdin/files, call `fuse()`, write stdout.
30. Add CLI binary to `package.json` (`"bin": { "fusion-rank": "dist/cli.js" }`).
31. Write CLI integration tests.
32. Write `createFuser` integration tests.

### Phase 5: Polish and Integration (v0.5.0)

33. Write integration tests: end-to-end multi-list fusion, large-scale correctness.
34. Write performance benchmarks.
35. Document integration patterns with `sparse-encode`, `context-packer`, `embed-cache`, `rerank-lite`.
36. Write `README.md` with quickstart, examples, and API reference.
37. Publish v0.5.0 to npm.

---

## 19. Example Use Cases

### Example 1: Pinecone Hybrid Search Fusion

A RAG pipeline retrieves dense and sparse results separately from Pinecone and fuses them client-side with RRF for more control than Pinecone's built-in alpha parameter:

```typescript
import { rrf } from 'fusion-rank';
import { createBM25 } from 'sparse-encode';
import { createCache } from 'embed-cache';
import { Pinecone } from '@pinecone-database/pinecone';

const bm25 = createBM25();
bm25.fit(corpus);
const embedCache = createCache({ model: 'text-embedding-3-small', embedder });
const pinecone = new Pinecone();
const index = pinecone.index('knowledge-base');

async function search(query: string, topK = 10) {
  const denseQuery = await embedCache.embed(query);
  const sparseQuery = bm25.encodeQuery(query);

  // Retrieve separately for client-side fusion control
  const [denseHits, sparseHits] = await Promise.all([
    index.query({ vector: denseQuery, topK: 50, includeMetadata: true }),
    index.query({ sparseVector: sparseQuery, topK: 50, includeMetadata: true }),
  ]);

  const fused = rrf([
    denseHits.matches.map(m => ({
      id: m.id,
      score: m.score,
      metadata: { ...m.metadata, content: m.metadata?.text },
    })),
    sparseHits.matches.map(m => ({
      id: m.id,
      score: m.score,
      metadata: { ...m.metadata, content: m.metadata?.text },
    })),
  ], { topK });

  return fused;
}

// "CUDA 12.4 memory error" retrieves:
// - Dense: articles about GPU memory issues (semantic match)
// - Sparse: articles mentioning exact terms "CUDA", "12.4" (keyword match)
// - Fused: articles that both discuss GPU memory AND mention CUDA 12.4 rank highest
```

### Example 2: Multi-Retriever RAG with Three Sources

A document Q&A system combines vector retrieval, BM25 retrieval, and cross-encoder reranking into a single fused ranking:

```typescript
import { fuse } from 'fusion-rank';
import { rerank } from 'rerank-lite';
import { pack } from 'context-packer';

async function ragPipeline(query: string) {
  // Stage 1: Broad retrieval from two sources
  const [denseResults, sparseResults] = await Promise.all([
    vectorDb.searchDense(query, { topK: 50 }),
    vectorDb.searchSparse(query, { topK: 50 }),
  ]);

  // Stage 2: Rerank the top dense results for precision
  const topDenseTexts = denseResults.slice(0, 20);
  const reranked = await rerank(query, topDenseTexts.map(r => r.text));
  const rerankResults = reranked.map((r, i) => ({
    id: topDenseTexts[i].id,
    score: r.score,
    metadata: topDenseTexts[i].metadata,
  }));

  // Stage 3: Three-way RRF fusion
  const fused = fuse(
    [
      denseResults.map(r => ({ id: r.id, score: r.score, metadata: r.metadata })),
      sparseResults.map(r => ({ id: r.id, score: r.score, metadata: r.metadata })),
      rerankResults,
    ],
    { strategy: 'rrf', k: 60, topK: 20 },
  );

  // Stage 4: Pack into context window
  const packed = pack(
    fused.map(item => ({
      id: item.id,
      content: item.metadata?.content as string,
      score: item.score,
    })),
    { budget: 4000, strategy: 'mmr', ordering: 'u-shaped' },
  );

  return packed;
}
```

### Example 3: Comparing Fusion Strategies

An evaluation engineer compares RRF, weighted fusion, and CombMNZ across a test set to select the best strategy:

```typescript
import { fuse } from 'fusion-rank';

const strategies = [
  { strategy: 'rrf' as const, k: 60 },
  { strategy: 'weighted' as const, weights: [0.6, 0.4], normalization: 'min-max' as const },
  { strategy: 'combmnz' as const, normalization: 'min-max' as const },
  { strategy: 'borda' as const },
];

for (const testQuery of evalDataset) {
  for (const config of strategies) {
    const fused = fuse([testQuery.denseResults, testQuery.sparseResults], config);
    const topKIds = fused.slice(0, 10).map(r => r.id);

    // Compute precision@10 against ground truth
    const relevant = new Set(testQuery.relevantDocIds);
    const precision = topKIds.filter(id => relevant.has(id)).length / 10;

    results.push({ strategy: config.strategy, query: testQuery.id, precision });
  }
}

// Aggregate results
for (const s of strategies) {
  const avg = average(results.filter(r => r.strategy === s.strategy).map(r => r.precision));
  console.log(`${s.strategy}: avg precision@10 = ${avg.toFixed(3)}`);
}
// rrf:      avg precision@10 = 0.72
// weighted: avg precision@10 = 0.69
// combmnz:  avg precision@10 = 0.74
// borda:    avg precision@10 = 0.68
```

### Example 4: Search Quality A/B Testing

A production search system uses `fusion-rank` to A/B test different fusion configurations without changing the retrieval infrastructure:

```typescript
import { createFuser } from 'fusion-rank';

// Configuration A: RRF (current production)
const fuserA = createFuser({ strategy: 'rrf', k: 60 });

// Configuration B: Weighted fusion with reranker emphasis
const fuserB = createFuser({
  strategy: 'weighted',
  weights: [0.3, 0.2, 0.5],  // dense, sparse, reranker
  normalization: 'min-max',
});

async function search(query: string, userId: string) {
  const [dense, sparse, reranked] = await retrieveAll(query);
  const lists = [dense, sparse, reranked];

  // Route to A or B based on user bucket
  const fuser = isInBucketB(userId) ? fuserB : fuserA;
  const fused = fuser.fuse(lists, { topK: 10 });

  // Log provenance for offline analysis
  logFusionResult({ query, userId, bucket: isInBucketB(userId) ? 'B' : 'A', fused });

  return fused;
}
```

### Example 5: Custom Fusion with Recency Boost

A news search application applies a custom fusion function that boosts recent documents:

```typescript
import { fuse } from 'fusion-rank';

const fused = fuse([denseResults, sparseResults], {
  strategy: 'custom',
  customFusion: (docId, appearances, context) => {
    // Base: RRF-like score
    const k = 60;
    let score = 0;
    for (const app of appearances) {
      score += 1 / (k + app.rank);
    }

    // Boost: multiply by recency factor
    const metadata = appearances[0]; // metadata from first appearance
    // Assume metadata has a publishedAt timestamp
    // This is illustrative -- the actual metadata access depends on the input format

    return score;
  },
  normalizeOutput: true,
});
```

---

## 20. Prior Art and Alternatives

### Qdrant Built-In RRF

Qdrant supports RRF natively in its query API via the `fusion: 'rrf'` parameter in multi-stage queries. This is convenient for Qdrant users but is vendor-specific and cannot be used with other databases, cannot fuse results from different databases, and does not support weighted fusion, CombMNZ, or other strategies. `fusion-rank` is database-agnostic and strategy-configurable.

### Pinecone Built-In Hybrid Search

Pinecone's hybrid search uses `alpha * dense_score + (1 - alpha) * sparse_score` with a single `alpha` parameter. This is a simple weighted linear combination with no normalization (Pinecone normalizes internally). It supports only two inputs (dense and sparse) and only one fusion formula. `fusion-rank` supports any number of inputs and multiple fusion strategies.

### Elasticsearch RRF

Elasticsearch 8.8+ supports RRF as a retriever type in its query DSL. Like Qdrant, this is vendor-specific. It uses k = 60 by default and supports window_size for limiting the number of results per sub-query. `fusion-rank` provides the same algorithm in a standalone package usable with any retrieval system.

### LangChain `EnsembleRetriever` (Python)

LangChain's `EnsembleRetriever` combines results from multiple retrievers using weighted score combination. It is tightly coupled to LangChain's `BaseRetriever` interface and is Python-only. It does not support RRF, CombMNZ, or Borda count. It does not track provenance. `fusion-rank` is framework-independent, JavaScript-native, and supports six fusion strategies with provenance tracking.

### Manual Implementation Patterns

The most common approach in JavaScript is inline fusion: a for-loop that iterates over result lists, builds a Map of document IDs to aggregated scores, and sorts. This is typically 20-40 lines of ad hoc code with no normalization, no configurable strategy, no error handling, no provenance, and no tests. `fusion-rank` replaces this pattern with a tested, documented, configurable package.
