import { describe, it, expect } from 'vitest';
import { deduplicateResults } from '../dedup';
import type { DeduplicatedDoc } from '../dedup';
import type { RankedItem } from '../types';

describe('deduplicateResults', () => {
  it('groups the same item from 2 lists into 1 entry with 2 appearances', () => {
    const list1: RankedItem[] = [{ id: 'doc-A', score: 0.9, rank: 1 }];
    const list2: RankedItem[] = [{ id: 'doc-A', score: 0.8, rank: 1 }];

    const result = deduplicateResults([list1, list2]);

    expect(result.size).toBe(1);
    const doc = result.get('doc-A')!;
    expect(doc.id).toBe('doc-A');
    expect(doc.appearances).toHaveLength(2);
    expect(doc.appearances[0]).toEqual({ listIndex: 0, rank: 1, score: 0.9 });
    expect(doc.appearances[1]).toEqual({ listIndex: 1, rank: 1, score: 0.8 });
  });

  it('assigns position-based rank when items lack explicit rank', () => {
    const list1: RankedItem[] = [
      { id: 'doc-A', score: 0.9 },
      { id: 'doc-B', score: 0.7 },
      { id: 'doc-C', score: 0.5 },
    ];

    const result = deduplicateResults([list1]);

    expect(result.get('doc-A')!.appearances[0].rank).toBe(1);
    expect(result.get('doc-B')!.appearances[0].rank).toBe(2);
    expect(result.get('doc-C')!.appearances[0].rank).toBe(3);
  });

  it('keeps different items as separate entries', () => {
    const list1: RankedItem[] = [{ id: 'doc-A', rank: 1 }];
    const list2: RankedItem[] = [{ id: 'doc-B', rank: 1 }];

    const result = deduplicateResults([list1, list2]);

    expect(result.size).toBe(2);
    expect(result.has('doc-A')).toBe(true);
    expect(result.has('doc-B')).toBe(true);
    expect(result.get('doc-A')!.appearances).toHaveLength(1);
    expect(result.get('doc-B')!.appearances).toHaveLength(1);
  });

  it('supports custom idField option', () => {
    const list1 = [
      { id: 'ignore', documentId: 'real-A', score: 0.9, rank: 1 },
      { id: 'ignore', documentId: 'real-B', score: 0.7, rank: 2 },
    ] as unknown as RankedItem[];
    const list2 = [
      { id: 'ignore', documentId: 'real-A', score: 0.8, rank: 1 },
    ] as unknown as RankedItem[];

    const result = deduplicateResults([list1, list2], { idField: 'documentId' });

    expect(result.size).toBe(2);
    expect(result.has('real-A')).toBe(true);
    expect(result.has('real-B')).toBe(true);
    expect(result.get('real-A')!.appearances).toHaveLength(2);
  });

  it('keeps first metadata when metadataMerge is "first" (default)', () => {
    const list1: RankedItem[] = [
      { id: 'doc-A', rank: 1, metadata: { source: 'vector', quality: 'high' } },
    ];
    const list2: RankedItem[] = [
      { id: 'doc-A', rank: 2, metadata: { source: 'bm25', quality: 'low' } },
    ];

    const result = deduplicateResults([list1, list2]);
    const doc = result.get('doc-A')!;

    expect(doc.metadata).toEqual({ source: 'vector', quality: 'high' });
  });

  it('keeps first metadata even without explicit metadataMerge option', () => {
    const list1: RankedItem[] = [
      { id: 'doc-A', rank: 1, metadata: { first: true } },
    ];
    const list2: RankedItem[] = [
      { id: 'doc-A', rank: 1, metadata: { first: false } },
    ];

    const result = deduplicateResults([list1, list2], { metadataMerge: 'first' });

    expect(result.get('doc-A')!.metadata).toEqual({ first: true });
  });

  it('deep-merges metadata when metadataMerge is "deep"', () => {
    const list1: RankedItem[] = [
      { id: 'doc-A', rank: 1, metadata: { scores: { bm25: 0.8 }, source: 'list1' } },
    ];
    const list2: RankedItem[] = [
      { id: 'doc-A', rank: 2, metadata: { scores: { vector: 0.9 }, source: 'list2' } },
    ];

    const result = deduplicateResults([list1, list2], { metadataMerge: 'deep' });
    const doc = result.get('doc-A')!;

    expect(doc.metadata).toEqual({
      scores: { bm25: 0.8, vector: 0.9 },
      source: 'list2',
    });
  });

  it('deep merge: later values override earlier for same nested key', () => {
    const list1: RankedItem[] = [
      { id: 'doc-A', rank: 1, metadata: { nested: { a: 1, b: 2 } } },
    ];
    const list2: RankedItem[] = [
      { id: 'doc-A', rank: 1, metadata: { nested: { b: 99, c: 3 } } },
    ];

    const result = deduplicateResults([list1, list2], { metadataMerge: 'deep' });

    expect(result.get('doc-A')!.metadata).toEqual({
      nested: { a: 1, b: 99, c: 3 },
    });
  });

  it('deep merge: handles items without metadata gracefully', () => {
    const list1: RankedItem[] = [
      { id: 'doc-A', rank: 1, metadata: { key: 'val' } },
    ];
    const list2: RankedItem[] = [
      { id: 'doc-A', rank: 1 },
    ];

    const result = deduplicateResults([list1, list2], { metadataMerge: 'deep' });

    expect(result.get('doc-A')!.metadata).toEqual({ key: 'val' });
  });

  it('collects all metadata when metadataMerge is "all"', () => {
    const list1: RankedItem[] = [
      { id: 'doc-A', rank: 1, metadata: { source: 'vector' } },
    ];
    const list2: RankedItem[] = [
      { id: 'doc-A', rank: 2, metadata: { source: 'bm25' } },
    ];
    const list3: RankedItem[] = [
      { id: 'doc-A', rank: 3, metadata: { source: 'reranker' } },
    ];

    const result = deduplicateResults([list1, list2, list3], { metadataMerge: 'all' });
    const doc = result.get('doc-A')!;

    expect(doc.metadata).toEqual({
      _all: [
        { source: 'vector' },
        { source: 'bm25' },
        { source: 'reranker' },
      ],
    });
  });

  it('"all" strategy skips items without metadata', () => {
    const list1: RankedItem[] = [
      { id: 'doc-A', rank: 1, metadata: { source: 'vector' } },
    ];
    const list2: RankedItem[] = [
      { id: 'doc-A', rank: 2 },
    ];
    const list3: RankedItem[] = [
      { id: 'doc-A', rank: 3, metadata: { source: 'reranker' } },
    ];

    const result = deduplicateResults([list1, list2, list3], { metadataMerge: 'all' });
    const doc = result.get('doc-A')!;

    expect(doc.metadata).toEqual({
      _all: [
        { source: 'vector' },
        { source: 'reranker' },
      ],
    });
  });

  it('handles empty lists', () => {
    const result = deduplicateResults([]);
    expect(result.size).toBe(0);
  });

  it('handles lists with no items', () => {
    const result = deduplicateResults([[], []]);
    expect(result.size).toBe(0);
  });

  it('preserves scores in appearances', () => {
    const list1: RankedItem[] = [
      { id: 'doc-A', score: 0.95, rank: 1 },
      { id: 'doc-B', score: 0.6, rank: 2 },
    ];
    const list2: RankedItem[] = [
      { id: 'doc-A', score: 12.5, rank: 1 },
    ];

    const result = deduplicateResults([list1, list2]);

    const docA = result.get('doc-A')!;
    expect(docA.appearances[0].score).toBe(0.95);
    expect(docA.appearances[1].score).toBe(12.5);

    const docB = result.get('doc-B')!;
    expect(docB.appearances[0].score).toBe(0.6);
  });

  it('records undefined score when item has no score', () => {
    const list1: RankedItem[] = [{ id: 'doc-A', rank: 1 }];

    const result = deduplicateResults([list1]);

    expect(result.get('doc-A')!.appearances[0].score).toBeUndefined();
  });

  it('handles many items across many lists', () => {
    const lists: RankedItem[][] = [];
    for (let listIdx = 0; listIdx < 5; listIdx++) {
      const list: RankedItem[] = [];
      for (let i = 0; i < 20; i++) {
        list.push({ id: `doc-${i}`, score: Math.random(), rank: i + 1 });
      }
      lists.push(list);
    }

    const result = deduplicateResults(lists);

    expect(result.size).toBe(20);
    for (let i = 0; i < 20; i++) {
      const doc = result.get(`doc-${i}`)!;
      expect(doc.appearances).toHaveLength(5);
      doc.appearances.forEach((a, idx) => {
        expect(a.listIndex).toBe(idx);
        expect(a.rank).toBe(i + 1);
      });
    }
  });

  it('handles partial overlap across lists', () => {
    const list1: RankedItem[] = [
      { id: 'doc-A', rank: 1 },
      { id: 'doc-B', rank: 2 },
    ];
    const list2: RankedItem[] = [
      { id: 'doc-B', rank: 1 },
      { id: 'doc-C', rank: 2 },
    ];
    const list3: RankedItem[] = [
      { id: 'doc-A', rank: 1 },
      { id: 'doc-C', rank: 2 },
    ];

    const result = deduplicateResults([list1, list2, list3]);

    expect(result.size).toBe(3);
    expect(result.get('doc-A')!.appearances).toHaveLength(2);
    expect(result.get('doc-B')!.appearances).toHaveLength(2);
    expect(result.get('doc-C')!.appearances).toHaveLength(2);
  });

  it('uses explicit rank when provided, even if it differs from position', () => {
    const list1: RankedItem[] = [
      { id: 'doc-A', rank: 5 },
      { id: 'doc-B', rank: 10 },
    ];

    const result = deduplicateResults([list1]);

    expect(result.get('doc-A')!.appearances[0].rank).toBe(5);
    expect(result.get('doc-B')!.appearances[0].rank).toBe(10);
  });

  it('does not mutate the original metadata object', () => {
    const originalMeta = { key: 'value' };
    const list1: RankedItem[] = [
      { id: 'doc-A', rank: 1, metadata: originalMeta },
    ];

    const result = deduplicateResults([list1]);
    const doc = result.get('doc-A')!;

    // Modifying the doc metadata should not affect the original
    (doc.metadata as Record<string, unknown>).newKey = 'new';
    expect(originalMeta).toEqual({ key: 'value' });
  });

  it('DeduplicatedDoc type is correctly shaped', () => {
    const doc: DeduplicatedDoc = {
      id: 'test',
      appearances: [{ listIndex: 0, rank: 1 }],
      metadata: { hello: 'world' },
    };
    expect(doc.id).toBe('test');
    expect(doc.appearances).toHaveLength(1);
    expect(doc.metadata).toEqual({ hello: 'world' });
  });
});
