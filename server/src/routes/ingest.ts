import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { extractTextFromPdf } from '../services/pdfExtractor';
import { scrapeUrl } from '../services/urlScraper';
import { chunkText, enrichChunk } from '../services/chunker';
import { generateEmbeddingsBatch } from '../services/embeddings';
import { insertKnowledgeNodes, supabase } from '../config/supabase';
import { authenticate } from '../middleware/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UrlIngestBody {
  url: string;
  title?: string;
}

interface IngestResult {
  success: boolean;
  message: string;
  data: {
    title: string;
    source_type: 'pdf' | 'url';
    chunks_inserted: number;
    total_words: number;
  };
}

// ─── Route Plugin ─────────────────────────────────────────────────────────────

export default async function ingestRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/ingest/pdf
   *
   * Accepts a multipart/form-data request with a single PDF file field named "file".
   * Optional field: "title" (string) to override the extracted PDF title.
   *
   * Flow:
   *  1. Receive & buffer the uploaded PDF
   *  2. Extract plain text using pdf-parse
   *  3. Split into overlapping chunks
   *  4. Generate embeddings for each chunk via text-embedding-004
   *  5. Bulk-insert chunks + vectors into knowledge_nodes
   */
  fastify.post(
    '/ingest/pdf',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply): Promise<IngestResult> => {
      const userId = (request as any).user?.id;
      
      // 1. Get user's organization
      const { data: org } = await supabase.from('organizations').select('id').eq('user_id', userId).maybeSingle();
      if (!org) {
        return reply.status(404).send({ success: false, message: 'Organization not found' });
      }

      let fileBuffer: Buffer | undefined;
      let fileName: string | undefined;
      let mimeType: string | undefined;
      let titleOverride: string | undefined;

      // Parse multipart fields
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file' && part.fieldname === 'file') {
          fileBuffer = await part.toBuffer();
          fileName = part.filename;
          mimeType = part.mimetype;
        } else if (part.type === 'field' && part.fieldname === 'title') {
          titleOverride = part.value as string;
        }
      }

      if (!fileBuffer || !fileName || !mimeType) {
        return reply.status(400).send({
          success: false,
          message: 'No file uploaded. Send a PDF in a form field named "file".',
        });
      }

      if (org) {
        const { data: sub } = await supabase.from('subscriptions').select('plan_type').eq('org_id', org.id).maybeSingle();
        const plan = sub?.plan_type || 'free';
        
        // Count unique documents (by title) for THIS organization
        const { data: existingDocs } = await supabase.from('knowledge_nodes').select('title').eq('org_id', org.id);
        const uniqueTitles = new Set(existingDocs?.map(d => d.title));
        
        if (plan === 'free' && uniqueTitles.size >= 1) {
          return reply.status(403).send({
            success: false,
            message: 'Upgrade to Business to upload more than 1 document.',
          });
        }
        if (plan === 'business' && uniqueTitles.size >= 20) {
          return reply.status(403).send({
            success: false,
            message: 'Upgrade to Enterprise to upload more than 20 documents.',
          });
        }
      }

      // Validate MIME type
      if (mimeType !== 'application/pdf' && !fileName.endsWith('.pdf')) {
        return reply.status(400).send({
          success: false,
          message: `Invalid file type "${mimeType}". Only PDF files are accepted.`,
        });
      }

      fastify.log.info(
        { fileName, sizeBytes: fileBuffer.length },
        'PDF received'
      );

      // Extract text
      const { text, pages, title: pdfTitle } = await extractTextFromPdf(
        fileBuffer,
        fileName
      );
      const finalTitle = titleOverride?.trim() || pdfTitle;

      // Chunk + embed + store
      const result = await processAndStore({
        text,
        title: finalTitle,
        orgId: org.id,
        sourceType: 'pdf',
        fileName: fileName,
        metadata: { pages, mime: mimeType },
      });

      fastify.log.info(
        { title: finalTitle, chunksInserted: result.chunks_inserted },
        'PDF ingestion complete'
      );

      return reply.status(201).send({
        success: true,
        message: `"${finalTitle}" ingested successfully.`,
        data: result,
      });
    }
  );

  /**
   * POST /api/ingest/url
   *
   * Accepts a JSON body: { url: string, title?: string }
   *
   * Flow:
   *  1. Validate & scrape the URL with axios + cheerio
   *  2. Split content into overlapping chunks
   *  3. Generate embeddings for each chunk via text-embedding-004
   *  4. Bulk-insert chunks + vectors into knowledge_nodes
   */
  fastify.post(
    '/ingest/url',
    { preHandler: [authenticate] },
    async (
      request: FastifyRequest<{ Body: UrlIngestBody }>,
      reply: FastifyReply
    ): Promise<IngestResult> => {
      const userId = (request as any).user?.id;
      
      // 1. Get user's organization
      const { data: org } = await supabase.from('organizations').select('id').eq('user_id', userId).maybeSingle();
      if (!org) {
        return reply.status(404).send({ success: false, message: 'Organization not found' });
      }

      const { url, title: titleOverride } = request.body;

      if (!url || typeof url !== 'string' || url.trim().length === 0) {
        return reply.status(400).send({
          success: false,
          message: 'Request body must include a non-empty "url" string.',
        });
      }

      if (org) {
        const { data: sub } = await supabase.from('subscriptions').select('plan_type').eq('org_id', org.id).maybeSingle();
        const plan = sub?.plan_type || 'free';
        
        const { data: existingDocs } = await supabase.from('knowledge_nodes').select('title').eq('org_id', org.id);
        const uniqueTitles = new Set(existingDocs?.map(d => d.title));
        
        if (plan === 'free' && uniqueTitles.size >= 1) {
          return reply.status(403).send({
            success: false,
            message: 'Upgrade to Business to upload more than 1 document.',
          });
        }
        if (plan === 'business' && uniqueTitles.size >= 20) {
          return reply.status(403).send({
            success: false,
            message: 'Upgrade to Enterprise to upload more than 20 documents.',
          });
        }
      }

      fastify.log.info({ url }, 'URL ingest started');

      const { text, title: scrapedTitle, url: resolvedUrl } = await scrapeUrl(url);
      const finalTitle = titleOverride?.trim() || scrapedTitle;

      const result = await processAndStore({
        text,
        title: finalTitle,
        orgId: org.id,
        sourceType: 'url',
        sourceUrl: resolvedUrl,
        metadata: { originalUrl: url },
      });

      fastify.log.info(
        { title: finalTitle, chunksInserted: result.chunks_inserted },
        'URL ingestion complete'
      );

      return reply.status(201).send({
        success: true,
        message: `"${finalTitle}" scraped and ingested successfully.`,
        data: result,
      });
    }
  );

  /**
   * GET /api/ingest/health
   * Simple liveness check for the ingest service.
   */
  fastify.get('/ingest/health', async (_req, reply) => {
    return reply.send({ status: 'ok', service: 'ingest', timestamp: new Date().toISOString() });
  });

}

// ─── Shared Pipeline ──────────────────────────────────────────────────────────

interface ProcessOptions {
  text: string;
  title: string;
  orgId: string;
  sourceType: 'pdf' | 'url';
  fileName?: string;
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Shared pipeline: chunk → embed → store.
 * Used by both the PDF and URL routes.
 */
async function processAndStore(opts: ProcessOptions): Promise<{
  title: string;
  source_type: 'pdf' | 'url';
  chunks_inserted: number;
  total_words: number;
}> {
  const { text, title, orgId, sourceType, fileName, sourceUrl, metadata = {} } = opts;

  // 1. Chunk the text
  const textChunks = chunkText(text);
  if (textChunks.length === 0) {
    throw new Error('No meaningful text content could be extracted from the source.');
  }

  // 2. Enrich each chunk with document title context then embed
  const enrichedTexts = textChunks.map((c) => enrichChunk(c, title));
  const embeddings = await generateEmbeddingsBatch(enrichedTexts);

  // 3. Build Supabase rows
  const totalWords = textChunks.reduce((sum, c) => sum + c.wordCount, 0);

  const nodes = textChunks.map((chunk, i) => ({
    org_id: orgId,
    title,
    content: chunk.text,
    embedding: embeddings[i],
    source_type: sourceType,
    source_url: sourceUrl ?? null,
    file_name: fileName ?? null,
    chunk_index: chunk.index,
    total_chunks: textChunks.length,
    metadata: {
      ...metadata,
      word_count: chunk.wordCount,
    },
  }));

  // 4. Insert into Supabase
  const { inserted } = await insertKnowledgeNodes(nodes);

  // 5. Log Telemetry
  await supabase.from('analytics_events').insert({
    org_id: orgId,
    event_type: 'document_ingested',
    metadata: {
      title,
      sourceType,
      chunksInserted: inserted,
      totalWords
    }
  });

  return {
    title,
    source_type: sourceType,
    chunks_inserted: inserted,
    total_words: totalWords,
  };
}
