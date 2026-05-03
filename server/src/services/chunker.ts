/**
 * Text Chunker
 *
 * Splits long text into overlapping chunks suitable for embedding.
 * The text-embedding-004 model has a 2048-token limit (~1500 words),
 * so we target ~800 words per chunk with a ~100-word overlap to preserve
 * semantic continuity across chunk boundaries.
 */

export type TextChunk = {
  text: string;
  index: number;
  wordCount: number;
};

const CHUNK_WORD_SIZE = 800;
const OVERLAP_WORD_SIZE = 100;
const MIN_CHUNK_WORDS = 20; // Skip chunks that are too short to be meaningful

/**
 * Splits text into overlapping word-based chunks.
 */
export function chunkText(text: string): TextChunk[] {
  // Split on word boundaries, preserving structure
  const words = text.split(/\s+/).filter((w) => w.length > 0);

  if (words.length === 0) return [];

  // If text is short enough, return as a single chunk
  if (words.length <= CHUNK_WORD_SIZE) {
    return [
      {
        text: words.join(' '),
        index: 0,
        wordCount: words.length,
      },
    ];
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < words.length) {
    const end = Math.min(start + CHUNK_WORD_SIZE, words.length);
    const chunkWords = words.slice(start, end);

    if (chunkWords.length >= MIN_CHUNK_WORDS) {
      chunks.push({
        text: chunkWords.join(' '),
        index,
        wordCount: chunkWords.length,
      });
      index++;
    }

    // Move start forward by (CHUNK_WORD_SIZE - OVERLAP)
    start += CHUNK_WORD_SIZE - OVERLAP_WORD_SIZE;

    // Prevent infinite loop on very last chunk
    if (start >= words.length) break;
  }

  return chunks;
}

/**
 * Creates a context-enriched version of a chunk for better embedding quality.
 * Prepends the document title so the model has broader context.
 */
export function enrichChunk(chunk: TextChunk, title: string): string {
  return `Title: ${title}\n\n${chunk.text}`;
}
