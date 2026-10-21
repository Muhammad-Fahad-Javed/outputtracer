import * as Y from "yjs";

export const AUTHOR_STAMP_ORIGIN = "author-stamp";

export interface AuthorshipSpan {
  start: number;
  end: number;
  authorId: string;
}

export interface AuthorshipShare {
  authorId: string;
  characters: number;
  percent: number;
}

export interface AuthorshipReport {
  spans: AuthorshipSpan[];
  shares: AuthorshipShare[];
  attributed: number;
  starter: number;
}

interface DeltaOp {
  insert?: unknown;
  delete?: number;
  retain?: number;
  attributes?: { author?: unknown };
}

function authorOf(attributes: DeltaOp["attributes"]): string | null {
  const author = attributes?.author;
  return typeof author === "string" && author.length > 0 ? author : null;
}

/** Character spans and whole-number percentages. Starter text has no author and is not part of the percentage. */
export function authorshipFromDelta(delta: readonly DeltaOp[]): AuthorshipReport {
  const spans: AuthorshipSpan[] = [];
  const counts = new Map<string, number>();
  let index = 0;
  let starter = 0;

  for (const op of delta) {
    if (typeof op.insert !== "string") {
      if (typeof op.retain === "number") index += op.retain;
      continue;
    }
    const length = op.insert.length;
    const authorId = authorOf(op.attributes);
    if (!authorId) {
      starter += length;
    } else if (length > 0) {
      const previous = spans[spans.length - 1];
      if (previous && previous.authorId === authorId && previous.end === index) {
        previous.end += length;
      } else {
        spans.push({ start: index, end: index + length, authorId });
      }
      counts.set(authorId, (counts.get(authorId) || 0) + length);
    }
    index += length;
  }

  const attributed = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const shares = sharePercents(counts, attributed);
  return { spans, shares, attributed, starter };
}

export function authorshipOfText(text: Y.Text): AuthorshipReport {
  return authorshipFromDelta(text.toDelta() as DeltaOp[]);
}

export function authorshipOfDoc(doc: Y.Doc): AuthorshipReport {
  const spans: AuthorshipSpan[] = [];
  const counts = new Map<string, number>();
  let starter = 0;
  doc.getMap("files").forEach((value) => {
    if (!(value instanceof Y.Text)) return;
    const report = authorshipOfText(value);
    starter += report.starter;
    for (const share of report.shares) {
      counts.set(share.authorId, (counts.get(share.authorId) || 0) + share.characters);
    }
  });
  const attributed = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return { spans, shares: sharePercents(counts, attributed), attributed, starter };
}

function sharePercents(counts: Map<string, number>, attributed: number): AuthorshipShare[] {
  const rows = [...counts.entries()]
    .filter(([, characters]) => characters > 0)
    .map(([authorId, characters]) => ({ authorId, characters }));
  if (rows.length === 0 || attributed <= 0) return [];

  const exact = rows.map((row) => (row.characters / attributed) * 100);
  const percents = exact.map((value) => Math.floor(value));
  let leftover = 100 - percents.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let step = 0; leftover > 0 && step < order.length; step += 1) {
    percents[order[step].index] += 1;
    leftover -= 1;
    if (step === order.length - 1 && leftover > 0) step = -1;
  }

  return rows
    .map((row, index) => ({ ...row, percent: percents[index] }))
    .sort((a, b) => b.percent - a.percent || a.authorId.localeCompare(b.authorId));
}

/**
 * Mark characters a local editor just inserted. Remote updates and starter
 * text applied with the "remote" origin stay unattributed.
 */
export function watchLocalAuthorship(doc: Y.Doc, authorId: () => string | null): () => void {
  const onDeep = (events: Y.YEvent<Y.AbstractType<unknown>>[]) => {
    const id = authorId();
    if (!id) return;
    const pending: { text: Y.Text; start: Y.RelativePosition; end: Y.RelativePosition }[] = [];
    for (const event of events) {
      if (!(event.target instanceof Y.Text)) continue;
      const origin = event.transaction.origin;
      if (!event.transaction.local || origin === AUTHOR_STAMP_ORIGIN || origin === "remote" || origin === "hydrate") {
        continue;
      }
      let index = 0;
      for (const op of event.delta as DeltaOp[]) {
        if (typeof op.retain === "number") {
          index += op.retain;
        } else if (typeof op.insert === "string") {
          const length = op.insert.length;
          // An insert next to colored text inherits that color. Claim it for
          // the person who actually typed when the inherited author differs.
          if (length > 0 && authorOf(op.attributes) !== id) {
            pending.push({
              text: event.target,
              start: Y.createRelativePositionFromTypeIndex(event.target, index),
              end: Y.createRelativePositionFromTypeIndex(event.target, index + length),
            });
          }
          index += length;
        }
      }
    }
    if (pending.length === 0) return;
    queueMicrotask(() => {
      try {
        doc.transact(() => {
          for (const item of pending) {
            const start = Y.createAbsolutePositionFromRelativePosition(item.start, doc);
            const end = Y.createAbsolutePositionFromRelativePosition(item.end, doc);
            if (!start || !end || start.type !== item.text || end.type !== item.text) continue;
            const length = end.index - start.index;
            if (length > 0) item.text.format(start.index, length, { author: id });
          }
        }, AUTHOR_STAMP_ORIGIN);
      } catch {
        // The document was closed before the stamp landed.
      }
    });
  };

  const files = doc.getMap("files");
  files.observeDeep(onDeep);
  return () => files.unobserveDeep(onDeep);
}
