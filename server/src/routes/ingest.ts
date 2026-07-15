import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { extractTextFromPdf } from '../services/pdfExtractor';
import { scrapeUrl } from '../services/urlScraper';
import { chunkText, enrichChunk } from '../services/chunker';
import { generateEmbeddingsBatch } from '../services/embeddings';
import { insertKnowledgeNodes, supabase } from '../config/supabase';
import { authenticate } from '../middleware/auth';
import { resolveDefaultProjectId } from '../services/projects';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UrlIngestBody {
  url: string;
  title?: string;
  projectId?: string;
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
      let projectIdField: string | undefined;

      // Parse multipart fields
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file' && part.fieldname === 'file') {
          fileBuffer = await part.toBuffer();
          fileName = part.filename;
          mimeType = part.mimetype;
        } else if (part.type === 'field' && part.fieldname === 'title') {
          titleOverride = part.value as string;
        } else if (part.type === 'field' && part.fieldname === 'projectId') {
          projectIdField = part.value as string;
        }
      }

      // Resolve the Project this document belongs to. Defaults to the org's
      // default project when the client doesn't specify one (older/plain
      // upload flows), so knowledge_nodes.project_id (NOT NULL) is always set.
      const resolvedProjectId = projectIdField || (await resolveDefaultProjectId(org.id));
      if (!resolvedProjectId) {
        return reply.status(500).send({ success: false, message: 'Tidak dapat menentukan Project untuk dokumen ini.' });
      }

      if (!fileBuffer || !fileName || !mimeType) {
        return reply.status(400).send({
          success: false,
          message: 'No file uploaded. Send a PDF in a form field named "file".',
        });
      }

      const { data: sub } = await supabase
        .from('subscriptions')
        .select('plan_type, credits')
        .eq('org_id', org.id)
        .maybeSingle();

      const plan = sub?.plan_type || 'free';
      const currentCredits = sub?.credits ?? 0;

      // ── Credit Check: 1 PDF = 10 credits ──────────────────────────────────
      const PDF_CREDIT_COST = 10;
      if (currentCredits < PDF_CREDIT_COST) {
        return reply.status(403).send({
          success: false,
          message: `Kredit tidak cukup. Upload 1 PDF membutuhkan ${PDF_CREDIT_COST} kredit, saldo Anda saat ini ${currentCredits} kredit. Silakan top-up atau tunggu reset kredit bulanan Anda.`,
          data: { required_credits: PDF_CREDIT_COST, current_credits: currentCredits },
        });
      }

      // 2. File Size Limit
      // Free plan: 4MB. Paid plans: 50MB.
      const FREE_SIZE_LIMIT = 4 * 1024 * 1024;   // 4 MB
      const PAID_SIZE_LIMIT = 50 * 1024 * 1024;  // 50 MB
      const isFree = plan === 'free';
      const currentSizeLimit = isFree ? FREE_SIZE_LIMIT : PAID_SIZE_LIMIT;

      if (fileBuffer.length > currentSizeLimit) {
        const limitMB = currentSizeLimit / (1024 * 1024);
        return reply.status(400).send({
          success: false,
          message: `Ukuran file terlalu besar. Paket ${isFree ? 'Free' : plan} Anda hanya mendukung maksimal ${limitMB}MB. ${
            isFree ? 'Upgrade ke paket berbayar untuk batas 50MB.' : ''
          }`.trim(),
        });
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
        projectId: resolvedProjectId,
        sourceType: 'pdf',
        fileName: fileName,
        metadata: { pages, mime: mimeType },
      });

      // ── Deduct credits after successful ingestion ──────────────────────────
      const newCredits = currentCredits - PDF_CREDIT_COST;
      await supabase
        .from('subscriptions')
        .update({ credits: newCredits })
        .eq('org_id', org.id);

      await supabase.from('credit_transactions').insert({
        org_id: org.id,
        amount: -PDF_CREDIT_COST,
        type: 'usage',
        description: `Upload PDF: "${finalTitle}"`,
      });

      fastify.log.info(
        { title: finalTitle, chunksInserted: result.chunks_inserted, creditsRemaining: newCredits },
        'PDF ingestion complete'
      );

      return reply.status(201).send({
        success: true,
        message: `"${finalTitle}" berhasil diproses. ${PDF_CREDIT_COST} kredit dipotong, sisa ${newCredits} kredit.`,
        data: { ...result, credits_used: PDF_CREDIT_COST, credits_remaining: newCredits },
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
  fastify.post<{ Body: UrlIngestBody }>(
    '/ingest/url',
    { preHandler: [authenticate] },
    async (
      request,
      reply
    ): Promise<IngestResult> => {
      const userId = (request as any).user?.id;
      
      // 1. Get user's organization
      const { data: org } = await supabase.from('organizations').select('id').eq('user_id', userId).maybeSingle();
      if (!org) {
        return reply.status(404).send({ success: false, message: 'Organization not found' });
      }

      const { url, title: titleOverride, projectId } = request.body;

      if (!url || typeof url !== 'string' || url.trim().length === 0) {
        return reply.status(400).send({
          success: false,
          message: 'Request body must include a non-empty "url" string.',
        });
      }

      const resolvedProjectId = projectId || (await resolveDefaultProjectId(org.id));
      if (!resolvedProjectId) {
        return reply.status(500).send({ success: false, message: 'Tidak dapat menentukan Project untuk dokumen ini.' });
      }

      const { data: sub } = await supabase
        .from('subscriptions')
        .select('plan_type, credits')
        .eq('org_id', org.id)
        .maybeSingle();

      const plan = sub?.plan_type || 'free';
      const currentCredits = sub?.credits ?? 0;

      // ── Credit Check: 1 URL = 10 credits ──────────────────────────────────
      const URL_CREDIT_COST = 10;
      if (currentCredits < URL_CREDIT_COST) {
        return reply.status(403).send({
          success: false,
          message: `Kredit tidak cukup. Proses 1 URL membutuhkan ${URL_CREDIT_COST} kredit, saldo Anda saat ini ${currentCredits} kredit. Silakan top-up atau tunggu reset kredit bulanan Anda.`,
          data: { required_credits: URL_CREDIT_COST, current_credits: currentCredits },
        });
      }

      fastify.log.info({ url }, 'URL ingest started');

      const { text, title: scrapedTitle, url: resolvedUrl } = await scrapeUrl(url);
      const finalTitle = titleOverride?.trim() || scrapedTitle;

      const result = await processAndStore({
        text,
        title: finalTitle,
        orgId: org.id,
        projectId: resolvedProjectId,
        sourceType: 'url',
        sourceUrl: resolvedUrl,
        metadata: { originalUrl: url },
      });

      // ── Deduct credits after successful ingestion ──────────────────────────
      const newCredits = currentCredits - URL_CREDIT_COST;
      await supabase
        .from('subscriptions')
        .update({ credits: newCredits })
        .eq('org_id', org.id);

      await supabase.from('credit_transactions').insert({
        org_id: org.id,
        amount: -URL_CREDIT_COST,
        type: 'usage',
        description: `Scrape URL: "${finalTitle}"`,
      });

      fastify.log.info(
        { title: finalTitle, chunksInserted: result.chunks_inserted, creditsRemaining: newCredits },
        'URL ingestion complete'
      );

      return reply.status(201).send({
        success: true,
        message: `"${finalTitle}" berhasil diproses. ${URL_CREDIT_COST} kredit dipotong, sisa ${newCredits} kredit.`,
        data: { ...result, credits_used: URL_CREDIT_COST, credits_remaining: newCredits },
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
  projectId: string;
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
  const { text, title, orgId, projectId, sourceType, fileName, sourceUrl, metadata = {} } = opts;

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
    project_id: projectId,
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
