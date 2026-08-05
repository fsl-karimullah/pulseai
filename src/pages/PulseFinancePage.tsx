import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  PlusCircle,
  Wallet,
  BarChart3,
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  Calculator,
  ChevronRight,
  X,
  Check,
  Loader2,
  AlertCircle,
  Banknote,
  ShoppingCart,
  Coffee,
  Megaphone,
  Users,
  Home,
  Package,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';

// ── Types ──────────────────────────────────────────────────────────────────────
type TransactionType = 'income' | 'expense';

interface Transaction {
  id: string;
  type: TransactionType;
  category: string;
  description: string;
  amount: number;
  date: string;
  notes?: string;
  created_at: string;
}

interface Summary {
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  transactionCount: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const INCOME_CATEGORIES = [
  { label: 'Penjualan Produk', icon: ShoppingCart, color: 'text-emerald-500' },
  { label: 'Jasa / Layanan', icon: Banknote, color: 'text-blue-500' },
  { label: 'Investasi', icon: TrendingUp, color: 'text-violet-500' },
  { label: 'Lainnya', icon: Receipt, color: 'text-slate-500' },
];

const EXPENSE_CATEGORIES = [
  { label: 'Gaji Karyawan', icon: Users, color: 'text-rose-500' },
  { label: 'Sewa & Utilitas', icon: Home, color: 'text-orange-500' },
  { label: 'Pemasaran', icon: Megaphone, color: 'text-amber-500' },
  { label: 'Pembelian Barang', icon: Package, color: 'text-blue-500' },
  { label: 'Operasional', icon: Coffee, color: 'text-teal-500' },
  { label: 'Pajak', icon: Calculator, color: 'text-red-500' },
  { label: 'Lainnya', icon: Receipt, color: 'text-slate-500' },
];

// PPh Final UMKM: 0.5% dari omzet bruto (PP 23/2018)
const PPH_FINAL_RATE = 0.005;
// Batas omzet UMKM yang kena PPh Final (Rp 4.8 miliar/tahun)
const UMKM_THRESHOLD = 4_800_000_000;

const formatRp = (val: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

// ── Modal Tambah Transaksi ─────────────────────────────────────────────────────
interface AddTxModalProps {
  onClose: () => void;
  onSaved: () => void;
  orgId: string;
}

const AddTxModal: React.FC<AddTxModalProps> = ({ onClose, onSaved, orgId }) => {
  const [type, setType] = useState<TransactionType>('income');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category) { setError('Pilih kategori terlebih dahulu.'); return; }
    const numAmount = parseFloat(amount.replace(/\D/g, ''));
    if (!numAmount || numAmount <= 0) { setError('Nominal harus lebih dari 0.'); return; }

    setLoading(true);
    setError(null);
    try {
      const { error: dbErr } = await supabase.from('finance_transactions').insert({
        org_id: orgId,
        type,
        category,
        description,
        amount: numAmount,
        date,
        notes: notes || null,
      });
      if (dbErr) throw dbErr;
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan transaksi.');
    } finally {
      setLoading(false);
    }
  };

  const handleAmountInput = (val: string) => {
    const digits = val.replace(/\D/g, '');
    setAmount(digits ? parseInt(digits).toLocaleString('id-ID') : '');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-300 max-h-[92vh] overflow-y-auto">
        
        {/* Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur px-6 py-5 border-b border-slate-100 flex items-center justify-between rounded-t-3xl z-10">
          <h2 className="text-lg font-black text-slate-900">Tambah Transaksi</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-5">
          {/* Type Toggle */}
          <div className="flex rounded-2xl bg-slate-100 p-1 gap-1">
            {(['income', 'expense'] as TransactionType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setType(t); setCategory(''); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  type === t
                    ? t === 'income'
                      ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25'
                      : 'bg-rose-500 text-white shadow-md shadow-rose-500/25'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t === 'income' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                {t === 'income' ? 'Pemasukan' : 'Pengeluaran'}
              </button>
            ))}
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">Kategori</label>
            <div className="grid grid-cols-2 gap-2">
              {categories.map(({ label, icon: Icon, color }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setCategory(label)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all text-left ${
                    category === label
                      ? type === 'income'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-rose-500 bg-rose-50 text-rose-700'
                      : 'border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-200'
                  }`}
                >
                  <Icon size={15} className={category === label ? '' : color} />
                  <span className="truncate text-xs leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Keterangan *</label>
            <input
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={type === 'income' ? 'Contoh: Pembayaran klien A' : 'Contoh: Bayar gaji tim'}
              className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Nominal (Rp) *</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">Rp</span>
              <input
                required
                value={amount}
                onChange={(e) => handleAmountInput(e.target.value)}
                placeholder="0"
                inputMode="numeric"
                className="w-full pl-10 pr-4 py-3 text-sm border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-semibold"
              />
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Tanggal</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>

          {/* Notes (optional) */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Catatan (Opsional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan tambahan..."
              rows={2}
              className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">
              <AlertCircle size={16} className="flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98] ${
              type === 'income'
                ? 'bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/20'
                : 'bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-500/20'
            } disabled:opacity-60`}
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : (
              <><Check size={16} /> Simpan Transaksi</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

// ── Main Page ──────────────────────────────────────────────────────────────────
const PulseFinancePage: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalIncome: 0, totalExpense: 0, netProfit: 0, transactionCount: 0 });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear] = useState(new Date().getFullYear());

  // Derive activeView dari URL path — sehingga klik sidebar langsung ganti tab
  const activeView: 'overview' | 'tax' =
    location.pathname === '/finance/tax' ? 'tax' : 'overview';

  // Fetch org_id dari tabel organizations
  useEffect(() => {
    if (!user) return;
    supabase
      .from('organizations')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)
      .single()
      .then(({ data }) => { if (data) setOrgId(data.id); });
  }, [user]);

  const fetchData = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const startDate = new Date(selectedYear, selectedMonth, 1).toISOString().split('T')[0];
      const endDate   = new Date(selectedYear, selectedMonth + 1, 0).toISOString().split('T')[0];

      const { data } = await supabase
        .from('finance_transactions')
        .select('*')
        .eq('org_id', orgId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false });

      const txs = data || [];
      setTransactions(txs);

      const totalIncome  = txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
      const totalExpense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
      setSummary({
        totalIncome,
        totalExpense,
        netProfit: totalIncome - totalExpense,
        transactionCount: txs.length,
      });
    } catch (err) {
      console.error('Error fetching finance data:', err);
    } finally {
      setLoading(false);
    }
  }, [orgId, selectedMonth, selectedYear]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Hitung estimasi pajak
  // PPh Final UMKM: 0.5% x omzet (income)
  const annualIncomeEstimate = summary.totalIncome * 12; // estimasi setahun dari bulan ini
  const isUMKM = annualIncomeEstimate <= UMKM_THRESHOLD;
  const monthlyTaxEstimate = summary.totalIncome * PPH_FINAL_RATE;
  const annualTaxEstimate  = annualIncomeEstimate * PPH_FINAL_RATE;

  return (
    <div className="space-y-6 pb-8">
      
      {/* ── Hero Header ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 border border-slate-700">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-transparent to-emerald-500/10 pointer-events-none" />
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl bg-amber-400/5 pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">
                <Wallet size={11} /> Pulse Finance — MVP
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Beta
              </span>
            </div>
            <h1 className="text-2xl font-black text-white">Keuangan Bisnis</h1>
            <p className="text-slate-400 text-sm mt-1">Catat pemasukan & pengeluaran, pantau kesehatan bisnis Anda secara real-time.</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-500/25 transition-all active:scale-[0.97] flex-shrink-0 self-start sm:self-auto"
          >
            <PlusCircle size={16} /> Tambah Transaksi
          </button>
        </div>
      </div>

      {/* ── Month Filter ── */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {MONTHS.map((m, i) => (
          <button
            key={i}
            onClick={() => setSelectedMonth(i)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              selectedMonth === i
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-500 border border-slate-100 hover:border-slate-200'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* ── Tab View ── */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl w-fit">
        {([['overview', BarChart3, 'Ringkasan', '/finance'], ['tax', Calculator, 'Estimasi Pajak', '/finance/tax']] as const).map(([view, Icon, label, path]) => (
          <button
            key={view}
            onClick={() => navigate(path)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeView === view
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════
          VIEW: RINGKASAN
      ══════════════════════════════════════════ */}
      {activeView === 'overview' && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Pemasukan */}
            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
                  <ArrowUpRight size={18} className="text-white" />
                </div>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                  +{MONTHS[selectedMonth]}
                </span>
              </div>
              <p className="text-2xl font-black text-slate-900 leading-tight">
                {loading ? '—' : formatRp(summary.totalIncome)}
              </p>
              <p className="text-sm font-medium text-slate-500 mt-0.5">Total Pemasukan</p>
            </div>

            {/* Pengeluaran */}
            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500 flex items-center justify-center">
                  <ArrowDownRight size={18} className="text-white" />
                </div>
                <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-full">
                  -{MONTHS[selectedMonth]}
                </span>
              </div>
              <p className="text-2xl font-black text-slate-900 leading-tight">
                {loading ? '—' : formatRp(summary.totalExpense)}
              </p>
              <p className="text-sm font-medium text-slate-500 mt-0.5">Total Pengeluaran</p>
            </div>

            {/* Laba Bersih */}
            <div className={`rounded-2xl p-5 border shadow-sm hover:shadow-md transition-all ${
              summary.netProfit >= 0
                ? 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-100'
                : 'bg-gradient-to-br from-rose-50 to-pink-50 border-rose-100'
            }`}>
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  summary.netProfit >= 0 ? 'bg-emerald-500' : 'bg-rose-500'
                }`}>
                  <TrendingUp size={18} className="text-white" />
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                  summary.netProfit >= 0 ? 'text-emerald-700 bg-emerald-100' : 'text-rose-700 bg-rose-100'
                }`}>
                  Laba / Rugi
                </span>
              </div>
              <p className={`text-2xl font-black leading-tight ${
                summary.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}>
                {loading ? '—' : formatRp(Math.abs(summary.netProfit))}
              </p>
              <p className="text-sm font-medium text-slate-500 mt-0.5">
                {summary.netProfit >= 0 ? 'Laba Bersih' : 'Rugi Bersih'} {MONTHS[selectedMonth]}
              </p>
            </div>
          </div>

          {/* Daftar Transaksi */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900">Transaksi {MONTHS[selectedMonth]} {selectedYear}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{summary.transactionCount} transaksi dicatat</p>
              </div>
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                <PlusCircle size={13} /> Tambah
              </button>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="relative w-8 h-8">
                  <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
                  <div className="absolute inset-0 rounded-full border-4 border-t-emerald-500 animate-spin" />
                </div>
                <p className="text-sm text-slate-400">Memuat data keuangan...</p>
              </div>
            ) : transactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center">
                  <Receipt size={28} className="text-slate-300" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-slate-700">Belum ada transaksi</p>
                  <p className="text-sm text-slate-400 mt-1">Klik "Tambah Transaksi" untuk mulai mencatat</p>
                </div>
                <button
                  onClick={() => setShowModal(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-md shadow-emerald-500/20 transition-all hover:bg-emerald-700"
                >
                  <PlusCircle size={15} /> Tambah Transaksi Pertama
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {transactions.map((tx) => {
                  const isIncome = tx.type === 'income';
                  return (
                    <div key={tx.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/60 transition-colors group">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        isIncome ? 'bg-emerald-50' : 'bg-rose-50'
                      }`}>
                        {isIncome ? (
                          <ArrowUpRight size={16} className="text-emerald-500" />
                        ) : (
                          <ArrowDownRight size={16} className="text-rose-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{tx.description}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isIncome ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                          }`}>{tx.category}</span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(tx.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                      </div>
                      <p className={`text-sm font-black flex-shrink-0 ${isIncome ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isIncome ? '+' : '-'}{formatRp(Number(tx.amount))}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════
          VIEW: ESTIMASI PAJAK
      ══════════════════════════════════════════ */}
      {activeView === 'tax' && (
        <div className="space-y-5">
          
          {/* Info Banner */}
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 flex gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0">
              <Calculator size={18} className="text-white" />
            </div>
            <div>
              <h3 className="font-bold text-blue-900">Estimasi Berdasarkan Data Anda</h3>
              <p className="text-sm text-blue-700 mt-1 leading-relaxed">
                Perhitungan otomatis berdasarkan <strong>PP 23/2018</strong> — PPh Final UMKM sebesar <strong>0,5% dari omzet bruto</strong> untuk bisnis dengan omzet di bawah Rp 4,8 miliar/tahun.
              </p>
            </div>
          </div>

          {/* Kalkulasi Pajak */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Bulan {MONTHS[selectedMonth]}</p>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Omzet (Pemasukan)</span>
                  <span className="text-sm font-bold text-slate-900">{formatRp(summary.totalIncome)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Tarif PPh Final UMKM</span>
                  <span className="text-sm font-bold text-slate-900">0,5%</span>
                </div>
                <div className="h-px bg-slate-100" />
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-800">Estimasi Pajak Bulan Ini</span>
                  <span className="text-lg font-black text-amber-600">{formatRp(monthlyTaxEstimate)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Proyeksi Tahunan</p>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Estimasi Omzet Setahun</span>
                  <span className="text-sm font-bold text-slate-900">{formatRp(annualIncomeEstimate)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Status UMKM</span>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                    isUMKM ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                  }`}>
                    {isUMKM ? '✓ Kena Tarif UMKM' : '⚠ Konsultasi Akuntan'}
                  </span>
                </div>
                <div className="h-px bg-slate-100" />
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-800">Estimasi Pajak Setahun</span>
                  <span className="text-lg font-black text-amber-600">{formatRp(annualTaxEstimate)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Catatan SPT */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 border border-slate-700">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                <Receipt size={18} className="text-amber-400" />
              </div>
              <div>
                <h3 className="font-bold text-white mb-2">Deadline Pelaporan Pajak 2025</h3>
                <div className="space-y-2">
                  {[
                    { label: 'PPh Final Masa (Bulanan)', date: 'Setiap tgl 15 bulan berikutnya', color: 'text-amber-400' },
                    { label: 'SPT Tahunan OP (1770S)', date: '31 Maret 2026', color: 'text-emerald-400' },
                    { label: 'SPT Tahunan Badan (1771)', date: '30 April 2026', color: 'text-blue-400' },
                  ].map(({ label, date, color }) => (
                    <div key={label} className="flex items-center justify-between py-2 border-b border-slate-700/50 last:border-0">
                      <span className="text-sm text-slate-300">{label}</span>
                      <span className={`text-xs font-bold ${color}`}>{date}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-start gap-2 bg-white/5 rounded-xl p-3">
                  <AlertCircle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Estimasi ini bersifat informatif. Untuk pelaporan resmi, pastikan konsultasi dengan konsultan pajak atau gunakan platform DJP Online (e-Filing).
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="font-bold text-slate-900">Butuh Bantuan Lapor SPT?</h3>
              <p className="text-sm text-slate-500 mt-0.5">AI SPT Assistant sedang dalam pengembangan — segera hadir!</p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-amber-50 text-amber-700 border border-amber-200">
              Coming Soon <ChevronRight size={14} />
            </span>
          </div>
        </div>
      )}

      {/* ── Add Transaction Modal ── */}
      {showModal && orgId && (
        <AddTxModal
          orgId={orgId}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); fetchData(); }}
        />
      )}
    </div>
  );
};

export default PulseFinancePage;
