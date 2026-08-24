/**
 * Gemini-powered auto-categorization for Pulse Finance transactions.
 * Uses Gemini REST API directly (model: gemini-2.0-flash).
 */

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export const EXPENSE_CATEGORIES_AI = [
  'Operasional',
  'Bahan Baku',
  'Gaji',
  'Marketing',
  'Transportasi',
  'Sewa',
  'Utilitas',
  'Pajak',
  'Lainnya',
] as const;

export const INCOME_CATEGORIES_AI = [
  'Penjualan Produk',
  'Jasa / Layanan',
  'Investasi',
  'Lainnya',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES_AI)[number];
export type IncomeCategory = (typeof INCOME_CATEGORIES_AI)[number];

export async function autoCategorizeTx(
  description: string,
  type: 'income' | 'expense'
): Promise<string | null> {
  if (!GEMINI_API_KEY) {
    console.warn('[geminiFinance] VITE_GEMINI_API_KEY is not set. Skipping AI categorization.');
    return null;
  }

  if (!description || description.trim().length < 3) return null;

  const categories =
    type === 'income'
      ? INCOME_CATEGORIES_AI.join(', ')
      : EXPENSE_CATEGORIES_AI.join(', ');

  const prompt = `Kamu adalah asisten kategorisasi transaksi keuangan bisnis.
Deskripsi transaksi: "${description.trim()}"
Jenis: ${type === 'income' ? 'Pemasukan' : 'Pengeluaran'}
Pilihan kategori: ${categories}

Tentukan kategori yang paling tepat dari daftar di atas.
HANYA jawab dengan SATU nama kategori persis seperti yang ada di daftar. Tidak perlu penjelasan.`;

  try {
    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 20,
          stopSequences: ['\n'],
        },
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;

    const json = await res.json();
    const raw: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const suggested = raw.trim().replace(/[".]/g, '');

    // Validate against allowed list
    const allowed = type === 'income' ? INCOME_CATEGORIES_AI : EXPENSE_CATEGORIES_AI;
    const match = (allowed as readonly string[]).find(
      (c) => c.toLowerCase() === suggested.toLowerCase()
    );
    return match ?? null;
  } catch {
    return null;
  }
}
