# fusion-rank — Task Breakdown

This file tracks all tasks required to implement the `fusion-rank` package per SPEC.md.

---

## Phase 1: Project Scaffolding and Types

- [x] **Install dev dependencies** — Add `typescript`, `vitest`, `eslint`, and `@types/node` as devDependencies in package.json. Verify `npm install` succeeds. | Status: done
- [x] **Add CLI binary entry to package.json** — Add `"bin": { "fusion-rank": "dist/cli.js" }` to package.json so the CLI is registered on install. | Status: done
- [x] **Define RankedItem interface** — Create `src/types.ts` with the `RankedItem` interface: `id: string`, `score?: number`, `rank?: number`, `metadata?: Record<string, unknown>`. | Status: done
- [x] **Define FusedResult interface** — In `src/types.ts`, define `FusedResult` with fields: `id: string`, `score: number`, `rank: number`, `sources: SourceAppearance[]`, `metadata?: Record<string, unknown>`. | Status: done
- [x] **Define SourceAppearance interface** — In `src/types.ts`, define `SourceAppearance` with fields: `listIndex: number`, `rank: number`, `score?: number`, `normalizedScore?: number`. | Status: done
- [x] **Define FusionStrategy type** — In `src/types.ts`, define the union type: `'rrf' | 'weighted' | 'combsum' | 'combmnz' | 'borda' | 'custom'`. | Status: done
- [x] **Define NormalizationMethod type** — In `src/types.ts`, define: `'min-max' | 'z-score' | 'rank-based' | 'none'`. | Status: done
- [x] **Define MissingDocStrategy type** — In `src/types.ts`, define: `'worst-rank' | 'skip' | 'default-score'`. | Status: done
- [x] **Define MetadataMerge type** — In `src/types.ts`, define: `'first' | 'deep' | 'all'`. | Status: done
- [x] **Define FuseOptions interface** — In `src/types.ts`, define the full options interface with all fields: `strategy`, `k`, `weights`, `normalization`, `missingDocStrategy`, `defaultScore`, `normalizeOutput`, `topK`, `idField`, `metadataMerge`, `customFusion`. Include defaults in JSDoc. | Status: done
- [x] **Define RRFOptions interface** — In `src/types.ts`, define `RRFOptions` extending `Omit<FuseOptions, 'strategy' | 'weights' | 'normalization'>` with `k?: number`. | Status: done
- [x] **Define WeightedFuseOptions interface** — In `src/types.ts`, define `WeightedFuseOptions` extending `Omit<FuseOptions, 'strategy' | 'weights'>` with `normalization?: NormalizationMethod`. | Status: done
- [x] **Define FuserConfig type** — In `src/types.ts`, define `FuserConfig` as `FuseOptions`. | Status: done
- [x] **Define Fuser interface** — In `src/types.ts`, define the `Fuser` interface with `fuse(resultLists: RankedItem[][], overrides?: Partial<FuseOptions>): FusedResult[]`. | Status: done
- [x] **Define CustomFusionFn type** — In `src/types.ts`, define the custom fusion function signature: `(docId: string, appearances: {...}[], context: FusionContext) => number`. | Status: done
- [x] **Define FusionContext interface** — In `src/types.ts`, define `FusionContext` with `totalLists: number`, `listLengths: number[]`, `options: FuseOptions`. | Status: done
- [x] **Define FusionRankError class** — Create `src/errors.ts` with `FusionRankError extends Error` including a `readonly code: FusionRankErrorCode` property. | Status: done
- [x] **Define FusionRankErrorCode type** — In `src/errors.ts`, define the error code union: `'TOO_FEW_LISTS' | 'EMPTY_LIST' | 'MISSING_SCORES' | 'WEIGHT_LENGTH_MISMATCH' | 'INVALID_K' | 'INVALID_WEIGHTS' | 'MISSING_CUSTOM_FN' | 'INVALID_OPTIONS'`. | Status: done
- [x] **Verify types compile** — Run `npx tsc --noEmit` to ensure all type definitions compile without errors. | Status: done

---

## Phase 2: Deduplication and Provenance

- [x] **Implement deduplication by document ID** — Create `src/dedup.ts`. Given multiple `RankedItem[][]`, group items by their `id` field into a `Map<string, { appearances: SourceAppearance[], metadataEntries: Record<string, unknown>[] }>`. Assign ranks to items without explicit `rank` (rank = array position + 1). | Status: done
- [x] **Implement configurable idField** — In `src/dedup.ts`, support a configurable `idField` option. When set, use `item[idField]` instead of `item.id` as the deduplication key. Throw a meaningful error if an item lacks the specified field. | Status: done
- [x] **Implement metadata merge strategy: first** — In `src/dedup.ts`, when `metadataMerge` is `'first'` (default), use the metadata from the first appearance of a document across input lists (in input order). | Status: done
- [x] **Implement metadata merge strategy: deep** — In `src/dedup.ts`, when `metadataMerge` is `'deep'`, deep-merge metadata objects from all appearances. Later values override earlier values for the same nested key. | Status: done
- [x] **Implement metadata merge strategy: all** — In `src/dedup.ts`, when `metadataMerge` is `'all'`, store an array of all metadata objects from all appearances in the `metadata` field. | Status: done
- [x] **Implement provenance tracking** — Create `src/provenance.ts`. For each unique document, build a `sources: SourceAppearance[]` array recording each list that contained the document, with `listIndex`, `rank`, `score`, and `normalizedScore`. | Status: done

---

## Phase 3: Score Normalization

- [x] **Create normalization dispatcher** — Create `src/normalization/index.ts` that accepts a `NormalizationMethod` and delegates to the correct normalizer. Export a `normalize(scores: number[], method: NormalizationMethod): number[]` function. | Status: done
- [x] **Implement min-max normalization** — Create `src/normalization/min-max.ts`. Formula: `(x - min) / (max - min)`. Edge case: when all scores are identical (`max === min`), return 0.5 for all items. | Status: done
- [x] **Implement z-score normalization** — Create `src/normalization/z-score.ts`. Formula: `(x - mean) / stddev`. Edge case: when all scores are identical (`stddev === 0`), return 0 for all items. | Status: done
- [x] **Implement rank-based normalization** — Create `src/normalization/rank-based.ts`. Formula: `1 - (rank - 1) / (N - 1)`. Edge case: when list has only one item (`N === 1`), return 1.0. | Status: done
- [x] **Implement no-normalization passthrough** — In the normalization dispatcher, when method is `'none'`, return raw scores unchanged. | Status: done

---

## Phase 4: Fusion Strategies

- [ ] **Create strategy dispatcher** — Create `src/strategies/index.ts` that accepts a `FusionStrategy` and delegates to the correct strategy implementation. | Status: not_done
- [ ] **Implement RRF strategy** — Create `src/strategies/rrf.ts`. Formula: `RRF_score(d) = sum(1 / (k + rank_i(d)))`. Default k = 60. For missing documents with `'worst-rank'`, assign `rank = listLength + 1`. For `'skip'`, only sum over lists where the document appears. | Status: not_done
- [ ] **Implement weighted score fusion strategy** — Create `src/strategies/weighted.ts`. Formula: `fused_score(d) = sum(w_i * normalize(score_i(d)))`. Auto-normalize weights to sum to 1.0. For missing documents with `'default-score'`, use the configured default (default 0). For `'skip'`, renormalize remaining weights. For `'worst-rank'`, assign normalized score for `rank = listLength + 1`. | Status: not_done
- [ ] **Implement CombSUM strategy** — Create `src/strategies/combsum.ts`. Formula: `CombSUM_score(d) = sum(normalize(score_i(d)))`. Equivalent to weighted fusion with equal weights. | Status: not_done
- [ ] **Implement CombMNZ strategy** — Create `src/strategies/combmnz.ts`. Formula: `CombMNZ_score(d) = |lists containing d| * sum(normalize(score_i(d)))`. Multiply the score sum by the count of lists containing the document. | Status: not_done
- [ ] **Implement Borda count strategy** — Create `src/strategies/borda.ts`. Formula: `Borda_score(d) = sum(N_i - rank_i(d))`. For absent documents with `'worst-rank'`, assign `rank = N_i + 1` yielding `N_i - (N_i + 1) = -1`. | Status: not_done
- [ ] **Implement custom fusion function support** — In the strategy dispatcher, when strategy is `'custom'`, call the user-supplied `customFusion` function for each unique document, passing `docId`, `appearances`, and `FusionContext`. | Status: not_done

---

## Phase 5: Core fuse() Function

- [ ] **Implement input validation** — In `src/fuse.ts`, validate inputs before processing: at least 2 result lists (`TOO_FEW_LISTS`); no empty lists (`EMPTY_LIST`); score-based strategies require scores on all items (`MISSING_SCORES`); weights length must match list count (`WEIGHT_LENGTH_MISMATCH`); k must be a positive number (`INVALID_K`); weights must be positive numbers (`INVALID_WEIGHTS`); custom strategy requires `customFusion` function (`MISSING_CUSTOM_FN`). | Status: not_done
- [ ] **Implement default option resolution** — In `src/fuse.ts`, resolve defaults for all options: `strategy` defaults to `'rrf'`, `k` defaults to 60, `normalization` defaults to `'min-max'`, `missingDocStrategy` defaults to `'worst-rank'` for rank-based strategies and `'default-score'` for score-based, `defaultScore` defaults to 0, `normalizeOutput` defaults to true, `topK` defaults to Infinity, `idField` defaults to `'id'`, `metadataMerge` defaults to `'first'`. | Status: not_done
- [ ] **Implement the fuse() function** — In `src/fuse.ts`, implement the main pipeline: (1) validate inputs, (2) assign ranks to items missing explicit rank, (3) normalize scores if needed, (4) deduplicate and group by document ID, (5) compute fused scores via the selected strategy, (6) build FusedResult objects with provenance, (7) sort by score descending, (8) optionally normalize output to [0, 1], (9) optionally limit to topK, (10) assign final 1-based ranks, (11) return FusedResult[]. | Status: not_done
- [ ] **Implement output score normalization** — In `src/fuse.ts`, when `normalizeOutput` is true (default), apply min-max normalization to the final fused scores so the highest maps to 1.0 and lowest to 0.0. Handle edge case when all fused scores are identical (return 0.5 or 1.0). | Status: not_done
- [ ] **Implement topK limiting** — In `src/fuse.ts`, after sorting, truncate the result array to `topK` items if `topK` is finite. | Status: not_done
- [ ] **Implement rrf() shorthand** — In `src/fuse.ts` (or alongside), implement `rrf(resultLists, options?)` as `fuse(resultLists, { strategy: 'rrf', ...options })`. | Status: not_done
- [ ] **Implement weightedFuse() shorthand** — In `src/fuse.ts` (or alongside), implement `weightedFuse(resultLists, weights, options?)` as `fuse(resultLists, { strategy: 'weighted', weights, ...options })`. | Status: not_done
- [ ] **Implement createFuser() factory** — In `src/fuse.ts`, implement `createFuser(config)` that validates the config at construction time and returns a `Fuser` object with a `fuse(resultLists, overrides?)` method. Each call merges overrides with the preset config and delegates to the main `fuse()` function. The Fuser must be stateless across calls. | Status: not_done

---

## Phase 6: Public API Exports

- [ ] **Wire up src/index.ts** — Export from `src/index.ts`: `fuse`, `rrf`, `weightedFuse`, `createFuser`, all types (`RankedItem`, `FusedResult`, `SourceAppearance`, `FuseOptions`, `RRFOptions`, `WeightedFuseOptions`, `FuserConfig`, `Fuser`, `FusionStrategy`, `NormalizationMethod`, `MissingDocStrategy`, `MetadataMerge`, `CustomFusionFn`, `FusionContext`, `FusionRankError`, `FusionRankErrorCode`). | Status: not_done
- [ ] **Verify build succeeds** — Run `npm run build` (tsc) and verify `dist/` output includes `index.js`, `index.d.ts`, and all sub-modules. | Status: not_done

---

## Phase 7: CLI

- [ ] **Implement CLI entry point** — Create `src/cli.ts` with a `#!/usr/bin/env node` shebang. Parse command-line flags using manual argv parsing (no external deps). Support all flags from the spec: `--strategy/-s`, `--k/-k`, `--weights/-w`, `--normalization/-n`, `--missing/-m`, `--default-score`, `--top-k`, `--id-field`, `--no-normalize-output`, `--ids-only`, `--pretty/-p`. | Status: not_done
- [ ] **Implement stdin input reading** — In `src/cli.ts`, when no file arguments are provided, read JSON from stdin. Parse as `RankedItem[][]` (array of arrays). | Status: not_done
- [ ] **Implement file input reading** — In `src/cli.ts`, when file arguments are provided, read each file as a JSON array of `RankedItem[]`. Each file = one result list. | Status: not_done
- [ ] **Implement JSON output** — In `src/cli.ts`, write the `FusedResult[]` array to stdout as JSON. Support `--pretty` for indented output. | Status: not_done
- [ ] **Implement --ids-only output** — In `src/cli.ts`, when `--ids-only` is set, write only document IDs to stdout, one per line. | Status: not_done
- [ ] **Implement CLI exit codes** — Exit with 0 on success, 1 on fusion errors (empty lists, missing scores), 2 on configuration errors (invalid flags, missing required options). Write errors to stderr. | Status: not_done
- [ ] **Implement --weights parsing** — Parse comma-separated weight string (e.g., `"0.7,0.3"`) into a `number[]`. Validate that all values are positive numbers. | Status: not_done

---

## Phase 8: Unit Tests — RRF

- [ ] **Test RRF basic computation** — Verify RRF score for a document appearing in all lists matches the hand-computed formula: `sum(1/(k + rank))`. | Status: not_done
- [ ] **Test RRF with k = 0** — Verify k=0 produces pure reciprocal rank: `sum(1/rank)`. | Status: not_done
- [ ] **Test RRF with large k (1000)** — Verify large k produces nearly equal scores for all ranked documents. | Status: not_done
- [ ] **Test RRF missing document with worst-rank** — Verify absent document receives `rank = listLength + 1`. | Status: not_done
- [ ] **Test RRF missing document with skip** — Verify absent document's fused score comes only from lists where it appears. | Status: not_done
- [ ] **Test RRF worked example from spec** — Verify the exact scores and ranking from the worked example in Section 5 of the spec (doc-A = 0.03252, doc-C = 0.03226, etc.). | Status: not_done
- [ ] **Test RRF ignores scores** — Verify that changing scores without changing ranks produces identical RRF output. | Status: not_done

---

## Phase 9: Unit Tests — Weighted Score Fusion

- [ ] **Test weighted fusion with equal weights matches CombSUM** — Verify equal weights produce the same result as CombSUM. | Status: not_done
- [ ] **Test weight auto-normalization** — Verify weights that don't sum to 1.0 (e.g., `[7, 3]`) are auto-normalized. | Status: not_done
- [ ] **Test min-max normalization** — Verify highest score maps to 1.0 and lowest to 0.0. | Status: not_done
- [ ] **Test z-score normalization** — Verify output has mean approximately 0 and stddev approximately 1. | Status: not_done
- [ ] **Test rank-based normalization** — Verify rank 1 maps to 1.0 and last rank maps to 0.0. | Status: not_done
- [ ] **Test missing document with default score 0** — Verify absent documents receive score 0 in weighted computation. | Status: not_done
- [ ] **Test score-based strategy throws when items lack scores** — Verify `MISSING_SCORES` error when using weighted/combsum/combmnz on scoreless items. | Status: not_done

---

## Phase 10: Unit Tests — CombSUM, CombMNZ, Borda

- [ ] **Test CombSUM equals sum of normalized scores** — Verify CombSUM output matches manual sum of min-max normalized scores. | Status: not_done
- [ ] **Test CombSUM: document in all lists scores higher** — Verify a document present in all lists scores higher than one in a single list (given comparable raw scores). | Status: not_done
- [ ] **Test CombMNZ equals CombSUM times count** — Verify CombMNZ = CombSUM_score * number_of_lists_containing_document. | Status: not_done
- [ ] **Test CombMNZ multiplier** — Verify a document in 3/3 lists with sum S scores 3S, while a document in 1/3 lists with the same sum scores 1S. | Status: not_done
- [ ] **Test Borda score for rank 1** — Verify rank 1 in a list of N items receives N-1 points. | Status: not_done
- [ ] **Test Borda score for last rank** — Verify the last-ranked item receives 0 points. | Status: not_done
- [ ] **Test Borda absent documents with worst-rank** — Verify absent documents receive `N - (N + 1) = -1` points. | Status: not_done

---

## Phase 11: Unit Tests — Deduplication and Metadata

- [ ] **Test deduplication: one FusedResult per unique ID** — Verify a document appearing in 3 lists produces exactly 1 FusedResult. | Status: not_done
- [ ] **Test idField option** — Verify `idField: 'documentId'` uses that field for deduplication instead of `id`. | Status: not_done
- [ ] **Test missing ID field throws** — Verify items without the specified ID field throw a meaningful error. | Status: not_done
- [ ] **Test metadataMerge: first** — Verify metadata from the first list containing the document is used. | Status: not_done
- [ ] **Test metadataMerge: deep** — Verify deep-merging of metadata from all appearances, with later values overriding. | Status: not_done
- [ ] **Test metadataMerge: all** — Verify metadata is stored as an array of all metadata objects from all appearances. | Status: not_done

---

## Phase 12: Unit Tests — Normalization Edge Cases

- [ ] **Test min-max with all identical scores** — Verify all items receive normalized score 0.5 when all scores are equal. | Status: not_done
- [ ] **Test z-score with all identical scores** — Verify all items receive normalized score 0 when all scores are equal. | Status: not_done
- [ ] **Test rank-based normalization with single-item list** — Verify the single item receives normalized score 1.0. | Status: not_done

---

## Phase 13: Unit Tests — Output Normalization and Provenance

- [ ] **Test normalizeOutput: true** — Verify the highest fused score maps to 1.0 and the lowest to 0.0 in the final output. | Status: not_done
- [ ] **Test normalizeOutput: false** — Verify raw fused scores are preserved without normalization. | Status: not_done
- [ ] **Test provenance: sources array has one entry per contributing list** — Verify each FusedResult's `sources` array has the correct number of entries. | Status: not_done
- [ ] **Test provenance: sources[i].rank matches document rank** — Verify each source entry's rank matches the document's rank in that input list. | Status: not_done
- [ ] **Test provenance: sources[i].score matches raw score** — Verify each source entry's score matches the raw score from that list. | Status: not_done
- [ ] **Test provenance: sources[i].normalizedScore** — Verify normalized scores are recorded in provenance for score-based strategies. | Status: not_done

---

## Phase 14: Unit Tests — Error Handling

- [ ] **Test TOO_FEW_LISTS error** — Verify error when fewer than 2 lists are provided (0 lists, 1 list). | Status: not_done
- [ ] **Test EMPTY_LIST error** — Verify error when one or more lists are empty arrays. | Status: not_done
- [ ] **Test MISSING_SCORES error** — Verify error when using a score-based strategy (weighted, combsum, combmnz) with items that lack scores. | Status: not_done
- [ ] **Test WEIGHT_LENGTH_MISMATCH error** — Verify error when weights array length does not match the number of result lists. | Status: not_done
- [ ] **Test INVALID_K error** — Verify error when k is 0 or negative. | Status: not_done
- [ ] **Test INVALID_WEIGHTS error** — Verify error when weights contain non-positive values. | Status: not_done
- [ ] **Test MISSING_CUSTOM_FN error** — Verify error when strategy is 'custom' but no `customFusion` function is provided. | Status: not_done

---

## Phase 15: Integration Tests

- [ ] **Test end-to-end RRF with 3 lists of 50 items** — Fuse 3 lists with known overlap patterns. Verify top-10 contains documents that rank highly across multiple lists. | Status: not_done
- [ ] **Test end-to-end weighted fusion with dominant weight** — Fuse 2 lists with weights [0.8, 0.2]. Verify the ranking is dominated by the heavily-weighted list. | Status: not_done
- [ ] **Test createFuser round-trip** — Create a fuser, fuse multiple independent query results, verify each call is independent (no state leakage between calls). | Status: not_done
- [ ] **Test large-scale fusion** — Fuse 5 lists of 1000 items each. Verify correctness against a naive reference implementation. Verify completion within performance targets (<5ms). | Status: not_done
- [ ] **Test CLI end-to-end with stdin** — Pipe JSON through the CLI binary via stdin. Verify stdout matches the expected fused output. | Status: not_done
- [ ] **Test CLI end-to-end with file arguments** — Provide file paths as CLI arguments. Verify output matches expected fused result. | Status: not_done
- [ ] **Test CLI --ids-only flag** — Verify only document IDs are printed, one per line. | Status: not_done
- [ ] **Test CLI --pretty flag** — Verify JSON output is pretty-printed with indentation. | Status: not_done
- [ ] **Test CLI exit code 1 on fusion error** — Verify exit code 1 when fusion fails (e.g., empty lists). | Status: not_done
- [ ] **Test CLI exit code 2 on config error** — Verify exit code 2 when invalid flags are passed. | Status: not_done
- [ ] **Test custom fusion function end-to-end** — Verify a user-supplied custom fusion function is called correctly and produces expected output. | Status: not_done

---

## Phase 16: Property-Based Tests

- [ ] **Test idempotency** — Fusing the same list with itself produces the original ranking (up to score scaling). | Status: not_done
- [ ] **Test monotonicity** — If document d has a higher rank than document e in every list, d has a higher fused score than e. | Status: not_done
- [ ] **Test symmetry** — Swapping the order of input lists (without weights) does not change the fused ranking. | Status: not_done
- [ ] **Test score bounds** — When `normalizeOutput: true`, all fused scores are in [0, 1]. | Status: not_done
- [ ] **Test deduplication invariant** — The output contains exactly as many items as there are unique document IDs across all input lists. | Status: not_done
- [ ] **Test provenance completeness** — Every FusedResult's `sources` array has one entry per list that contained the document. | Status: not_done

---

## Phase 17: Performance Benchmarks

- [ ] **Create benchmark harness** — Create `src/__benchmarks__/fusion-throughput.ts` with a benchmark that measures time for common fusion scenarios. | Status: not_done
- [ ] **Benchmark: 2 lists x 50 items (typical hybrid search)** — Verify RRF completes in under 0.5ms. | Status: not_done
- [ ] **Benchmark: 3 lists x 100 items (three-retriever fusion)** — Verify completes in under 1ms. | Status: not_done
- [ ] **Benchmark: 5 lists x 1000 items (large-scale evaluation)** — Verify completes in under 5ms. | Status: not_done
- [ ] **Benchmark: 10 lists x 1000 items (stress test)** — Verify completes in under 15ms. | Status: not_done

---

## Phase 18: Documentation

- [ ] **Write README.md** — Create README.md with: overview, installation, quickstart example, API reference for `fuse`, `rrf`, `weightedFuse`, `createFuser`, explanation of all fusion strategies (RRF, weighted, CombSUM, CombMNZ, Borda, custom), options table, CLI usage, integration examples with `sparse-encode`, `context-packer`, `embed-cache`, `rerank-lite`. | Status: not_done
- [ ] **Add JSDoc comments to all public exports** — Ensure all exported functions and types have JSDoc comments describing parameters, return values, defaults, and usage. | Status: not_done
- [ ] **Document error codes** — In README.md, list all `FusionRankErrorCode` values with descriptions and common causes. | Status: not_done
- [ ] **Document normalization methods** — In README.md, explain each normalization method with examples and guidance on when to use each. | Status: not_done
- [ ] **Document missing document strategies** — In README.md, explain `worst-rank`, `skip`, and `default-score` with examples. | Status: not_done
- [ ] **Document CLI flags** — In README.md, include a table of all CLI flags with types, defaults, and descriptions. | Status: not_done

---

## Phase 19: Final Validation and Publishing Prep

- [ ] **Run full test suite** — Execute `npm run test` and verify all tests pass. | Status: not_done
- [ ] **Run linter** — Execute `npm run lint` and verify no lint errors. | Status: not_done
- [ ] **Run build** — Execute `npm run build` and verify dist/ output is correct and complete. | Status: not_done
- [ ] **Verify zero runtime dependencies** — Confirm `package.json` has no `dependencies` field (only `devDependencies`). | Status: not_done
- [ ] **Verify CLI works via npx** — Test `npx fusion-rank --strategy rrf < input.json` produces correct output. | Status: not_done
- [ ] **Verify package.json metadata** — Ensure `name`, `version`, `description`, `main`, `types`, `files`, `bin`, `engines`, `license`, `keywords`, and `publishConfig` are all correctly set. | Status: not_done
- [ ] **Bump version to target release** — Update `version` in package.json to the target release version per the roadmap (e.g., `0.5.0` for full feature set, or incremental versions per phase). | Status: not_done
