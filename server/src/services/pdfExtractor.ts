import pdfParse from 'pdf-parse';

export type PdfExtractionResult = {
  text: string;
  pages: number;
  title: string;
};

/**
 * Extracts clean, normalized plain text from a PDF buffer.
 * Uses pdf-parse which wraps the same PDF.js library used in browsers.
 *
 * @param buffer - Raw PDF file bytes
 * @param fileName - Used as fallback title if the PDF has no metadata title
 */
export async function extractTextFromPdf(
  buffer: Buffer,
  fileName: string
): Promise<PdfExtractionResult> {
  let data: Awaited<ReturnType<typeof pdfParse>>;

  try {
    data = await pdfParse(buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown PDF parsing error';
    throw new Error(`Failed to parse PDF "${fileName}": ${message}`);
  }

  if (!data.text || data.text.trim().length === 0) {
    throw new Error(
      `PDF "${fileName}" appears to be empty or image-only (no extractable text layer).`
    );
  }

  // Normalize whitespace: collapse multiple newlines / spaces
  const cleaned = data.text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  // Attempt to extract a title from PDF metadata; fall back to filename
  const rawTitle: string =
    (data.info as Record<string, unknown>)?.Title as string ||
    fileName.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');

  return {
    text: cleaned,
    pages: data.numpages,
    title: rawTitle,
  };
}
