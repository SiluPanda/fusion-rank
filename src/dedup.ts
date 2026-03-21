import type { RankedItem, SourceAppearance, MetadataMerge } from './types';

export interface DeduplicatedDoc {
  id: string;
  appearances: SourceAppearance[];
  metadata?: Record<string, unknown>;
}

/**
 * Deep-merge two plain objects. Later values override earlier values
 * for the same key. Arrays and non-plain-object values are replaced,
 * not merged.
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };
  for (const key of Object.keys(source)) {
    const targetVal = target[key];
    const sourceVal = source[key];
    if (
      isPlainObject(targetVal) &&
      isPlainObject(sourceVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else {
      result[key] = sourceVal;
    }
  }
  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Group items across multiple ranked lists by document ID.
 * Assigns rank = array position + 1 for items missing explicit rank.
 */
export function deduplicateResults(
  resultLists: RankedItem[][],
  options: { idField?: string; metadataMerge?: MetadataMerge } = {},
): Map<string, DeduplicatedDoc> {
  const { idField = 'id', metadataMerge = 'first' } = options;
  const docs = new Map<string, DeduplicatedDoc>();

  for (let listIndex = 0; listIndex < resultLists.length; listIndex++) {
    const list = resultLists[listIndex];
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const id = (item as unknown as Record<string, unknown>)[idField] as string;
      const rank = item.rank ?? i + 1;
      const appearance: SourceAppearance = {
        listIndex,
        rank,
        score: item.score,
      };

      const existing = docs.get(id);
      if (existing) {
        existing.appearances.push(appearance);
        if (metadataMerge === 'deep' && item.metadata) {
          existing.metadata = deepMerge(existing.metadata ?? {}, item.metadata);
        } else if (metadataMerge === 'all' && item.metadata) {
          const current = existing.metadata as Record<string, unknown> | undefined;
          if (!Array.isArray(current?._all)) {
            existing.metadata = {
              _all: [existing.metadata, item.metadata].filter(Boolean),
            };
          } else {
            (current!._all as unknown[]).push(item.metadata);
          }
        }
        // 'first' = keep existing metadata, do nothing
      } else {
        docs.set(id, {
          id,
          appearances: [appearance],
          metadata: item.metadata ? { ...item.metadata } : undefined,
        });
      }
    }
  }

  return docs;
}
