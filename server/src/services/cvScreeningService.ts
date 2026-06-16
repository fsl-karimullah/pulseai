/**
 * cvScreeningService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AI-powered CV analysis using Google Gemini 2.5 Flash Lite with Structured
 * Output (responseSchema). Gemini performs a deep contextual analysis of the
 * uploaded CV against the job description and returns a strict JSON object —
 * no markdown fencing, no extra prose.
 *
 * Architecture: Service Layer only — no HTTP concerns here.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  GoogleGenerativeAI,
  SchemaType,
  type GenerationConfig,
} from '@google/generative-ai';

// ─── Constants ────────────────────────────────────────────────────────────────

// ─── Constants ────────────────────────────────────────────────────────────────

const apiKey = process.env.GOOGLE_AI_API_KEY;
if (!apiKey) {
  console.error('[CVScreening] CRITICAL: GOOGLE_AI_API_KEY is not set.');
}

const genai = new GoogleGenerativeAI(apiKey || 'MISSING_KEY');

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApplicantStatus = 'LOLOS_INTERVIEW' | 'TALENT_POOL' | 'TOLAK';

/**
 * Structured output schema — exactly what Gemini must return.
 * This mirrors the Supabase `applicants.analysis_result` JSONB column.
 */
export interface CVAnalysisResult {
  /** True if the document is actually a CV/resume, false if it's a menu, receipt, random text, etc. */
  is_valid_cv: boolean;
  /** Full name extracted from CV */
  nama_pelamar: string;
  /** Email address extracted from CV */
  email: string;
  /** WhatsApp / phone number extracted from CV (digits only, no spaces) */
  whatsapp: string;
  /** Highest educational qualification (e.g. "S1 Teknik Informatika — ITB") */
  pendidikan_terakhir: string;
  /**
   * ATS compatibility score 0–100 measuring how well the CV matches the
   * job description. Factors: keyword density, skills overlap, experience
   * relevance, formatting clarity.
   */
  ats_score: number;
  /** Key strengths of the applicant relevant to the role */
  kelebihan: string[];
  /** Weaknesses or gaps compared to job requirements */
  kekurangan: string[];
  /**
   * Red flags detected during contextual analysis, e.g.:
   * - Extreme career jumps (e.g. accountant → software engineer in 6 months)
   * - Frequent job-hopping (< 1 year per role across 3+ jobs)
   * - Unexplained employment gaps > 6 months
   * - Irrelevant degree for a highly technical role
   */
  red_flags: string[];
  /** AI recommendation for HR decision */
  rekomendasi_status: ApplicantStatus;
  /**
   * Ready-to-send WhatsApp message draft in warm, professional Bahasa Indonesia.
   * - If LOLOS_INTERVIEW: invitation message with interview schedule placeholder.
   * - If TALENT_POOL: polite thank-you noting they're in the talent pool.
   * - If TOLAK: empathetic rejection with encouragement to apply again.
   */
  draft_whatsapp: string;
}

// ─── Response Schema (Structured Output) ─────────────────────────────────────

/**
 * Gemini responseSchema — enforces strict JSON output.
 * SchemaType enum maps to OpenAPI-compatible type strings.
 */
const CV_ANALYSIS_SCHEMA = {
  type: SchemaType.OBJECT,
  description: 'Hasil analisis CV pelamar kerja terhadap lowongan yang tersedia.',
  required: [
    'is_valid_cv',
    'nama_pelamar',
    'email',
    'whatsapp',
    'pendidikan_terakhir',
    'ats_score',
    'kelebihan',
    'kekurangan',
    'red_flags',
    'rekomendasi_status',
    'draft_whatsapp',
  ],
  properties: {
    is_valid_cv: {
      type: SchemaType.BOOLEAN,
      description: 'True jika dokumen yang diunggah adalah benar sebuah CV/Resume. False jika dokumen adalah hal lain (misal: struk, menu makanan, dokumen acak) yang tidak relevan.',
    },
    nama_pelamar: {
      type: SchemaType.STRING,
      description: 'Nama lengkap pelamar yang diekstrak dari CV.',
    },
    email: {
      type: SchemaType.STRING,
      description: 'Alamat email pelamar. Kosongkan ("") jika tidak ada.',
    },
    whatsapp: {
      type: SchemaType.STRING,
      description: 'Nomor WhatsApp/telepon pelamar. Hanya angka, tanpa spasi atau tanda hubung. Kosongkan ("") jika tidak ada.',
    },
    pendidikan_terakhir: {
      type: SchemaType.STRING,
      description: 'Pendidikan terakhir pelamar, termasuk jurusan dan institusi jika tersedia. Contoh: "S1 Teknik Informatika — Universitas Indonesia".',
    },
    ats_score: {
      type: SchemaType.NUMBER,
      description: 'Skor kesesuaian CV dengan lowongan, skala 0–100. Faktor: kepadatan kata kunci, relevansi pengalaman, kejelasan format, kesesuaian skill.',
    },
    kelebihan: {
      type: SchemaType.ARRAY,
      description: 'Daftar kelebihan pelamar yang relevan dengan posisi yang dilamar.',
      items: { type: SchemaType.STRING },
    },
    kekurangan: {
      type: SchemaType.ARRAY,
      description: 'Daftar kekurangan atau gap yang dimiliki pelamar dibanding kebutuhan lowongan.',
      items: { type: SchemaType.STRING },
    },
    red_flags: {
      type: SchemaType.ARRAY,
      description: 'Daftar red flag hasil analisis kontekstual mendalam. Deteksi: loncatan karier ekstrem, job-hopping (< 1 tahun di 3+ tempat), gap kerja > 6 bulan tanpa penjelasan, gelar tidak relevan untuk posisi teknis tinggi. Kosong jika tidak ada.',
      items: { type: SchemaType.STRING },
    },
    rekomendasi_status: {
      type: SchemaType.STRING,
      description: 'Rekomendasi keputusan HR berdasarkan total analisis.',
      enum: ['LOLOS_INTERVIEW', 'TALENT_POOL', 'TOLAK'],
    },
    draft_whatsapp: {
      type: SchemaType.STRING,
      description: 'Draf pesan WhatsApp siap kirim dalam Bahasa Indonesia yang hangat dan profesional. Jika LOLOS_INTERVIEW: undangan wawancara. Jika TALENT_POOL: ucapan terima kasih dan notifikasi talent pool. Jika TOLAK: penolakan empatik dengan semangat untuk melamar lagi.',
    },
  },
};

// ─── Generation Config ────────────────────────────────────────────────────────

const GENERATION_CONFIG: GenerationConfig = {
  responseMimeType: 'application/json',
  responseSchema: CV_ANALYSIS_SCHEMA as any,
  temperature: 0.3,     // Lower = more deterministic / consistent scoring
  topP: 0.85,
  maxOutputTokens: 2048,
};

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_INSTRUCTION = `
Anda adalah sistem ATS (Applicant Tracking System) bertenaga AI yang bertugas melakukan screening CV secara mendalam dan objektif.

MISI UTAMA:
Pertama, periksa apakah dokumen yang dilampirkan benar-benar sebuah CV atau Resume (is_valid_cv). Jika bukan CV (misalnya brosur, tagihan, tugas sekolah, atau dokumen acak), atur is_valid_cv menjadi false dan isi sisa field dengan nilai default/kosong. JANGAN BERHALUSINASI membuat profil pelamar dari dokumen yang salah.
Jika dokumen adalah CV yang valid, lakukan analisis secara kontekstual terhadap deskripsi lowongan kerja yang diberikan. Berikan penilaian profesional, jujur, dan akurat.

PANDUAN PENILAIAN ATS SCORE (0–100):
- 90–100: Sangat sesuai. Semua persyaratan terpenuhi, pengalaman sangat relevan.
- 70–89:  Sesuai. Sebagian besar persyaratan terpenuhi, ada minor gap.
- 50–69:  Cukup sesuai. Ada gap signifikan tapi kandidat berpotensi.
- 30–49:  Kurang sesuai. Gap besar, perlu banyak training.
- 0–29:   Tidak sesuai. Latar belakang sangat jauh dari kebutuhan.

DETEKSI RED FLAGS (analisis kontekstual mendalam):
1. Loncatan Karier Ekstrem: Berpindah bidang secara drastis dalam waktu singkat (misal: 6 bulan dari akuntan ke software engineer) tanpa sertifikasi/pendidikan pendukung.
2. Job-Hopping: Berpindah tempat kerja < 1 tahun di 3 atau lebih perusahaan berturut-turut.
3. Gap Kerja Tidak Wajar: Jeda bekerja > 6 bulan tanpa penjelasan (izin cuti/pendidikan/sakit tidak termasuk red flag).
4. Gelar Tidak Relevan: Latar belakang pendidikan sangat jauh dari posisi yang dilamar (misal: sarjana seni melamar posisi DevOps tanpa sertifikasi teknis).
5. Inkonsistensi Data: Tanggal pekerjaan yang tumpang tindih atau tidak logis.
6. Klaim Tidak Terverifikasi: Klaim keahlian yang terlalu muluk tanpa bukti konkret (proyek, sertifikat, angka pencapaian).

PANDUAN REKOMENDASI:
- LOLOS_INTERVIEW: ATS Score ≥ 70 DAN tidak ada red flag kritis ATAU ada 1–2 red flag minor yang masih dapat diterima.
- TALENT_POOL: ATS Score 45–69 ATAU ada red flag yang perlu klarifikasi lebih lanjut.
- TOLAK: ATS Score < 45 ATAU ada red flag kritis yang tidak bisa diabaikan.

PANDUAN DRAFT WHATSAPP:
- Gunakan Bahasa Indonesia yang hangat, sopan, dan profesional.
- Sapa dengan nama pelamar.
- LOLOS_INTERVIEW: "Selamat! Anda lolos ke tahap wawancara. Jadwal akan kami konfirmasi segera."
- TALENT_POOL: "Terima kasih atas lamaran Anda. Profil Anda kami simpan untuk kesempatan mendatang."
- TOLAK: "Terima kasih atas lamaran Anda. Saat ini kami belum bisa melanjutkan, tetapi jangan menyerah!"
- Jangan gunakan nama perusahaan spesifik — gunakan "[Nama Perusahaan]" sebagai placeholder.
`.trim();

// ─── Main Service Function ────────────────────────────────────────────────────

/**
 * Analyzes a CV (PDF buffer) against a job description using Gemini's
 * multimodal capability + structured output (responseSchema).
 *
 * @param jobDescription - Combined job title, description, and requirements.
 * @param pdfBuffer      - Raw PDF file bytes from the uploaded file.
 * @param mimeType       - MIME type of the file (should be 'application/pdf').
 * @returns              - Parsed CVAnalysisResult or throws on failure.
 */
export async function analyzeCVWithGemini(
  jobDescription: string,
  pdfBuffer: Buffer,
  mimeType: string
): Promise<CVAnalysisResult> {
  const pdfBase64 = pdfBuffer.toString('base64');

  const userPrompt = `
Berikut adalah deskripsi lengkap lowongan kerja:

---
${jobDescription}
---

CV pelamar telah dilampirkan sebagai file PDF di bawah ini. Lakukan analisis mendalam dan kembalikan hasil dalam format JSON yang diminta.
`.trim();

  /**
   * Try primary model first; fall back to the next if 503 / quota / rate-limit hit.
   * Pattern matches the existing gemini.ts retry approach in the codebase.
   */
  const modelsToTry = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.1-flash-lite-preview'];

  for (const modelId of modelsToTry) {
    try {
      const model = genai.getGenerativeModel({
        model: modelId,
        systemInstruction: SYSTEM_INSTRUCTION,
        generationConfig: GENERATION_CONFIG,
      });

      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: pdfBase64,
                },
              },
              {
                text: userPrompt,
              },
            ],
          },
        ],
      });

      const rawText = result.response.text();

      // Gemini with responseMimeType='application/json' should return pure JSON.
      // We still parse defensively in case of minor whitespace wrapping.
      const parsed: CVAnalysisResult = JSON.parse(rawText);

      // Sanitize ats_score to be safely within 0–100
      parsed.ats_score = Math.max(0, Math.min(100, Math.round(parsed.ats_score)));

      if (parsed.is_valid_cv === false) {
        throw new Error('DOKUMEN_BUKAN_CV');
      }

      return parsed;
    } catch (err: any) {
      if (err?.message === 'DOKUMEN_BUKAN_CV') {
        throw new Error('Dokumen yang diunggah tidak terdeteksi sebagai CV atau Resume yang valid. Mohon unggah dokumen yang benar.');
      }

      const isLastModel = modelId === modelsToTry[modelsToTry.length - 1];

      console.warn(`[CVScreening] Model ${modelId} failed:`, err?.message ?? err);

      if (isLastModel) {
        // We've exhausted all fallbacks → bubble up
        throw new Error(
          `Gemini CV analysis failed on all models. Last error from ${modelId}: ${err?.message ?? 'Unknown error'}`
        );
      }

      // Try next model
      console.info(`[CVScreening] Error on ${modelId}, trying ${modelsToTry[modelsToTry.indexOf(modelId) + 1]}...`);
    }
  }

  // This line is unreachable but satisfies TypeScript's control flow analysis.
  throw new Error('[CVScreening] All Gemini models exhausted.');
}
