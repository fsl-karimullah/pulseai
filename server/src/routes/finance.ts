import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { supabase } from '../config/supabase';
import { authenticate } from '../middleware/auth';

/**
 * Finance Transactions Routes
 * 
 * GET    /api/finance/transactions        — List transaksi (dengan filter bulan/status)
 * POST   /api/finance/transactions        — Tambah transaksi manual (status=approved)
 * PATCH  /api/finance/transactions/:id    — Edit transaksi
 * DELETE /api/finance/transactions/:id    — Hapus transaksi
 * POST   /api/finance/transactions/:id/approve  — Admin setujui pending transaksi
 * POST   /api/finance/transactions/:id/reject   — Admin tolak pending transaksi
 * POST   /api/finance/checkout-notify    — Bot AI mencatat checkout baru (status=pending)
 */

async function getOrgId(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('organizations')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.id || null;
}

export default async function financeRoutes(fastify: FastifyInstance) {

  // ── GET /api/finance/transactions ─────────────────────────────────────────
  fastify.get('/finance/transactions', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req as any).user?.id;
    if (!userId) return reply.status(401).send({ success: false, message: 'Unauthorized' });

    const orgId = await getOrgId(userId);
    if (!orgId) return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan' });

    const query = req.query as Record<string, string>;
    const { month, year, status, startDate, endDate } = query;

    let dbQuery = supabase
      .from('finance_transactions')
      .select('*')
      .eq('org_id', orgId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    // Filter by date range
    if (startDate && endDate) {
      dbQuery = dbQuery.gte('date', startDate).lte('date', endDate);
    } else if (month && year) {
      const m = parseInt(month);
      const y = parseInt(year);
      const start = new Date(y, m - 1, 1).toISOString().split('T')[0];
      const end = new Date(y, m, 0).toISOString().split('T')[0];
      dbQuery = dbQuery.gte('date', start).lte('date', end);
    }

    // Filter by status
    if (status && status !== 'all') {
      dbQuery = dbQuery.eq('status', status);
    }

    const { data, error } = await dbQuery.limit(500);
    if (error) return reply.status(500).send({ success: false, message: error.message });

    return reply.send({ success: true, data: data || [] });
  });

  // ── POST /api/finance/transactions ────────────────────────────────────────
  fastify.post('/finance/transactions', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req as any).user?.id;
    if (!userId) return reply.status(401).send({ success: false, message: 'Unauthorized' });

    const orgId = await getOrgId(userId);
    if (!orgId) return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan' });

    const { type, category, description, amount, date, notes } = req.body as any;

    if (!type || !category || !description || !amount || !date) {
      return reply.status(400).send({ success: false, message: 'Field wajib: type, category, description, amount, date' });
    }

    const { data, error } = await supabase
      .from('finance_transactions')
      .insert({
        org_id: orgId,
        type,
        category,
        description,
        amount: Number(amount),
        date,
        notes: notes || null,
        status: 'approved',  // Manual input = langsung approved
        source: 'manual',
        approved_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return reply.status(500).send({ success: false, message: error.message });
    return reply.send({ success: true, data });
  });

  // ── PATCH /api/finance/transactions/:id ───────────────────────────────────
  fastify.patch('/finance/transactions/:id', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req as any).user?.id;
    if (!userId) return reply.status(401).send({ success: false, message: 'Unauthorized' });

    const orgId = await getOrgId(userId);
    if (!orgId) return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan' });

    const { id } = req.params as any;
    const { type, category, description, amount, date, notes } = req.body as any;

    const { data, error } = await supabase
      .from('finance_transactions')
      .update({ type, category, description, amount: Number(amount), date, notes: notes || null })
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) return reply.status(500).send({ success: false, message: error.message });
    return reply.send({ success: true, data });
  });

  // ── DELETE /api/finance/transactions/:id ──────────────────────────────────
  fastify.delete('/finance/transactions/:id', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req as any).user?.id;
    if (!userId) return reply.status(401).send({ success: false, message: 'Unauthorized' });

    const orgId = await getOrgId(userId);
    if (!orgId) return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan' });

    const { id } = req.params as any;

    const { error } = await supabase
      .from('finance_transactions')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId);

    if (error) return reply.status(500).send({ success: false, message: error.message });
    return reply.send({ success: true });
  });

  // ── POST /api/finance/transactions/:id/approve ────────────────────────────
  fastify.post('/finance/transactions/:id/approve', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req as any).user?.id;
    if (!userId) return reply.status(401).send({ success: false, message: 'Unauthorized' });

    const orgId = await getOrgId(userId);
    if (!orgId) return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan' });

    const { id } = req.params as any;

    const { data, error } = await supabase
      .from('finance_transactions')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) return reply.status(500).send({ success: false, message: error.message });
    return reply.send({ success: true, data });
  });

  // ── POST /api/finance/transactions/:id/reject ─────────────────────────────
  fastify.post('/finance/transactions/:id/reject', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req as any).user?.id;
    if (!userId) return reply.status(401).send({ success: false, message: 'Unauthorized' });

    const orgId = await getOrgId(userId);
    if (!orgId) return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan' });

    const { id } = req.params as any;

    const { data, error } = await supabase
      .from('finance_transactions')
      .update({ status: 'rejected' })
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) return reply.status(500).send({ success: false, message: error.message });
    return reply.send({ success: true, data });
  });

  // ── POST /api/finance/checkout-notify ────────────────────────────────────
  // Dipanggil oleh AI Bot saat mendeteksi ada pelanggan yang checkout / konfirmasi pembayaran
  // Transaksi masuk dengan status='pending' — harus di-approve admin terlebih dahulu
  fastify.post('/finance/checkout-notify', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req as any).user?.id;
    if (!userId) return reply.status(401).send({ success: false, message: 'Unauthorized' });

    const orgId = await getOrgId(userId);
    if (!orgId) return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan' });

    const {
      description,
      amount,
      customer_name,
      customer_contact,
      notes,
    } = req.body as any;

    if (!description || !amount) {
      return reply.status(400).send({ success: false, message: 'Field wajib: description, amount' });
    }

    const { data, error } = await supabase
      .from('finance_transactions')
      .insert({
        org_id: orgId,
        type: 'income',
        category: 'Penjualan Produk',
        description,
        amount: Number(amount),
        date: new Date().toISOString().split('T')[0],
        notes: notes || null,
        status: 'pending',     // ← Bot checkout = PENDING, harus di-approve admin
        source: 'bot',
        customer_name: customer_name || null,
        customer_contact: customer_contact || null,
      })
      .select()
      .single();

    if (error) return reply.status(500).send({ success: false, message: error.message });

    return reply.send({
      success: true,
      data,
      message: `Transaksi checkout sebesar Rp ${Number(amount).toLocaleString('id-ID')} telah dicatat dengan status PENDING. Admin perlu verifikasi pembayaran sebelum konfirmasi.`,
    });
  });

  // ── GET /api/finance/summary ──────────────────────────────────────────────
  // Ringkasan cepat: total approved income/expense bulan ini + jumlah pending
  fastify.get('/finance/summary', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req as any).user?.id;
    if (!userId) return reply.status(401).send({ success: false, message: 'Unauthorized' });

    const orgId = await getOrgId(userId);
    if (!orgId) return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan' });

    const query = req.query as Record<string, string>;
    const month = parseInt(query.month || String(new Date().getMonth() + 1));
    const year  = parseInt(query.year  || String(new Date().getFullYear()));

    const start = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const end   = new Date(year, month, 0).toISOString().split('T')[0];

    const { data } = await supabase
      .from('finance_transactions')
      .select('type, amount, status')
      .eq('org_id', orgId)
      .gte('date', start)
      .lte('date', end);

    const txs = data || [];
    const approved = txs.filter(t => t.status === 'approved');
    const pendingCount = txs.filter(t => t.status === 'pending').length;

    const totalIncome  = approved.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const totalExpense = approved.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

    return reply.send({
      success: true,
      data: {
        totalIncome,
        totalExpense,
        netProfit: totalIncome - totalExpense,
        transactionCount: approved.length,
        pendingCount,
      },
    });
  });
}
