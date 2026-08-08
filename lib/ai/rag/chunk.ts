/**
 * Content-aware chunking.
 *
 * Splitting every N characters is the default everywhere and it is wrong for
 * this corpus specifically. Tripistic's knowledge is structured: itinerary
 * days, FAQ pairs, policy clauses, meeting instructions. A fixed-width split
 * routinely cuts an answer away from its question, or day 3 away from its
 * heading — and the retrieved fragment then reads as authoritative while
 * missing the part that made it true. "Cancellations are free" is a very
 * different statement from "Cancellations are free more than 48 hours before
 * departure", and a naive splitter produces the first from the second.
 *
 * So: split on structure first, and only fall back to size when a structural
 * unit is genuinely too large. Every chunk carries the heading path it came
 * from, which is both better retrieval and an honest citation.
 */

export type Chunk = {
  index: number;
  text: string;
  /** Heading trail, e.g. `["Cancellation policy", "Group bookings"]`. */
  headings: string[];
  tokenCount: number;
};

export type ChunkOptions = {
  /** Target size in estimated tokens. */
  targetTokens?: number;
  /** Hard ceiling; anything larger is split by sentence. */
  maxTokens?: number;
  /**
   * Overlap in estimated tokens, applied only when a unit had to be split by
   * size. Structural chunks do not overlap: they are already self-contained,
   * and overlapping them would duplicate whole FAQ answers in the index.
   */
  overlapTokens?: number;
};

const DEFAULTS: Required<ChunkOptions> = {
  targetTokens: 320,
  maxTokens: 512,
  overlapTokens: 48,
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

type Block = { headings: string[]; text: string };

/**
 * Splits markdown-ish text into heading-scoped blocks.
 *
 * Recognises ATX headings (`#`…`######`) and, because operator-written content
 * frequently is not markdown at all, treats a short line followed by a blank
 * line as a heading too. That heuristic is deliberately conservative — under 80
 * characters, no terminal punctuation — because misreading a sentence as a
 * heading loses it from the chunk body.
 */
export function splitIntoBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let headings: string[] = [];
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text) blocks.push({ headings: [...headings], text });
    buffer = [];
  };

  const setHeading = (level: number, title: string) => {
    flush();
    headings = headings.slice(0, Math.max(0, level - 1));
    headings[level - 1] = title;
    headings = headings.filter((value) => typeof value === "string" && value.length > 0);
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const atx = /^(#{1,6})\s+(.*\S)\s*$/.exec(line);
    if (atx) {
      setHeading(atx[1].length, atx[2]);
      continue;
    }

    const trimmed = line.trim();
    const looksLikeHeading =
      trimmed.length > 0 &&
      trimmed.length < 80 &&
      !/[.!?,;:]$/.test(trimmed) &&
      buffer.length === 0 &&
      (lines[index + 1] ?? "").trim() === "" &&
      (lines[index + 2] ?? "").trim() !== "";
    if (looksLikeHeading) {
      setHeading(Math.max(1, headings.length || 1), trimmed);
      continue;
    }

    buffer.push(line);
  }
  flush();
  return blocks;
}

/** Sentence-ish split used only when one block exceeds `maxTokens`. */
function splitBySentence(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function packSentences(
  sentences: string[],
  options: Required<ChunkOptions>,
): string[] {
  const packed: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  for (const sentence of sentences) {
    const tokens = estimateTokens(sentence);
    // A single sentence over the ceiling is emitted whole rather than cut
    // mid-clause. A truncated sentence is worse than a slightly oversized one.
    if (tokens >= options.maxTokens) {
      if (current.length) packed.push(current.join(" "));
      packed.push(sentence);
      current = [];
      currentTokens = 0;
      continue;
    }
    if (currentTokens + tokens > options.targetTokens && current.length) {
      packed.push(current.join(" "));
      // Carry the tail forward so a fact split across the boundary is
      // retrievable from either side.
      const overlap: string[] = [];
      let overlapTokens = 0;
      for (let index = current.length - 1; index >= 0; index -= 1) {
        const size = estimateTokens(current[index]);
        if (overlapTokens + size > options.overlapTokens) break;
        overlap.unshift(current[index]);
        overlapTokens += size;
      }
      current = overlap;
      currentTokens = overlapTokens;
    }
    current.push(sentence);
    currentTokens += tokens;
  }
  if (current.length) packed.push(current.join(" "));
  return packed;
}

export function chunkText(source: string, options: ChunkOptions = {}): Chunk[] {
  const settings = { ...DEFAULTS, ...options };
  const blocks = splitIntoBlocks(source);
  const chunks: Chunk[] = [];

  let pending: Block | null = null;

  const emit = (block: Block) => {
    const text = block.headings.length
      ? `${block.headings.join(" › ")}\n\n${block.text}`
      : block.text;
    chunks.push({
      index: chunks.length,
      text,
      headings: block.headings,
      tokenCount: estimateTokens(text),
    });
  };

  for (const block of blocks) {
    const tokens = estimateTokens(block.text);

    if (tokens > settings.maxTokens) {
      if (pending) {
        emit(pending);
        pending = null;
      }
      for (const part of packSentences(splitBySentence(block.text), settings)) {
        emit({ headings: block.headings, text: part });
      }
      continue;
    }

    // Merge consecutive small blocks that share a heading trail, so a list of
    // one-line bullets does not become one vector each.
    if (
      pending &&
      pending.headings.join("›") === block.headings.join("›") &&
      estimateTokens(pending.text) + tokens <= settings.targetTokens
    ) {
      pending = { headings: block.headings, text: `${pending.text}\n\n${block.text}` };
      continue;
    }

    if (pending) emit(pending);
    pending = block;
  }

  if (pending) emit(pending);
  return chunks;
}

/**
 * Chunks an FAQ list, one question-and-answer per chunk.
 *
 * Kept separate from `chunkText` because the structure is known rather than
 * inferred: an FAQ is already the ideal chunk boundary, and running it through
 * a text splitter can only make it worse.
 */
export function chunkFaq(items: Array<{ question: string; answer: string }>): Chunk[] {
  return items.map((item, index) => {
    const text = `Q: ${item.question}\nA: ${item.answer}`;
    return { index, text, headings: [item.question], tokenCount: estimateTokens(text) };
  });
}

/** First ~200 characters, for a source reference in the UI. */
export function chunkPreview(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= 200 ? flat : `${flat.slice(0, 197)}…`;
}
