import React, { useEffect, useState, useCallback } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import { supabase } from '../../lib/supabase';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpRight,
  ArrowDownRight,
  Trophy,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────
interface MonthSummary {
  month: string;       // e.g. "Jan"
  income: number;
  expense: number;
}

interface CategoryBreakdown {
  category: string;
  total: number;
}

interface Props {
  orgId: string;
  selectedMonth: number;
  selectedYear: number;
}

// ── Colors for chart ───────────────────────────────────────────────────────────
const PIE_COLORS = [
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f97316', // orange
  '#ec4899', // pink
  '#64748b', // slate
  '#6366f1', // indigo
];

// ── Number formatter ───────────────────────────────────────────────────────────
const formatRpShort = (val: number): string => {
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)}M`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}jt`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(0)}rb`;
  return `${val}`;
};

const formatRp = (val: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(val);

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// ── Custom Pie Tooltip ─────────────────────────────────────────────────────────
const CustomPieTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="bg-white shadow-xl border border-slate-100 rounded-2xl px-4 py-3 text-sm">
      <p className="font-bold text-slate-800">{name}</p>
      <p className="text-rose-600 font-black mt-0.5">{formatRp(value)}</p>
    </div>
  );
};

// ── Custom Line Tooltip ────────────────────────────────────────────────────────
const CustomLineTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white shadow-xl border border-slate-100 rounded-2xl px-4 py-3 text-sm min-w-[160px]">
      <p className="font-bold text-slate-600 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span style={{ color: p.color }} className="font-semibold">{p.name}</span>
          <span className="font-black text-slate-800">{formatRpShort(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

// ── Delta badge ───────────────────────────────────────────────────────────────
const DeltaBadge: React.FC<{ current: number; previous: number; isExpense?: boolean }> = ({
  current,
  previous,
  isExpense = false,
}) => {
  if (previous === 0 && current === 0) return <span className="text-xs text-slate-400">—</span>;
  const pct = previous === 0 ? 100 : Math.round(((current - previous) / previous) * 100);
  const isUp = pct > 0;
  const isBad = isExpense ? isUp : !isUp;

  const color = pct === 0 ? 'text-slate-500 bg-slate-50' : isBad ? 'text-rose-600 bg-rose-50' : 'text-emerald-600 bg-emerald-50';
  const Icon = pct === 0 ? Minus : isUp ? TrendingUp : TrendingDown;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${color}`}>
      <Icon size={11} />
      {pct === 0 ? 'Sama' : `${isUp ? '+' : ''}${pct}% vs bln lalu`}
    </span>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
const FinanceDashboard: React.FC<Props> = ({ orgId, selectedMonth, selectedYear }) => {
  const [trendData, setTrendData] = useState<MonthSummary[]>([]);
  const [pieData, setPieData] = useState<CategoryBreakdown[]>([]);
  const [prevSummary, setPrevSummary] = useState({ totalIncome: 0, totalExpense: 0, netProfit: 0 });
  const [currSummary, setCurrSummary] = useState({ totalIncome: 0, totalExpense: 0, netProfit: 0 });
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      // ── 6-month trend ──
      const trendMonths: MonthSummary[] = [];
      for (let i = 5; i >= 0; i--) {
        let m = selectedMonth - i;
        let y = selectedYear;
        if (m < 0) { m += 12; y -= 1; }

        const startDate = new Date(y, m, 1).toISOString().split('T')[0];
        const endDate   = new Date(y, m + 1, 0).toISOString().split('T')[0];

        const { data } = await supabase
          .from('finance_transactions')
          .select('type, amount')
          .eq('org_id', orgId)
          .gte('date', startDate)
          .lte('date', endDate);

        const txs = data || [];
        trendMonths.push({
          month: MONTHS_SHORT[m],
          income:  txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0),
          expense: txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0),
        });
      }
      setTrendData(trendMonths);

      // ── Current month category breakdown (expense) ──
      const startCurr = new Date(selectedYear, selectedMonth, 1).toISOString().split('T')[0];
      const endCurr   = new Date(selectedYear, selectedMonth + 1, 0).toISOString().split('T')[0];

      const { data: currData } = await supabase
        .from('finance_transactions')
        .select('type, amount, category')
        .eq('org_id', orgId)
        .gte('date', startCurr)
        .lte('date', endCurr);

      const currTxs = currData || [];
      const totalIncome  = currTxs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
      const totalExpense = currTxs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
      setCurrSummary({ totalIncome, totalExpense, netProfit: totalIncome - totalExpense });

      // Pie: group expenses by category
      const catMap: Record<string, number> = {};
      currTxs.filter(t => t.type === 'expense').forEach(t => {
        catMap[t.category] = (catMap[t.category] || 0) + Number(t.amount);
      });
      const pie = Object.entries(catMap)
        .map(([category, total]) => ({ category, total }))
        .sort((a, b) => b.total - a.total);
      setPieData(pie);

      // ── Previous month summary ──
      let prevM = selectedMonth - 1;
      let prevY = selectedYear;
      if (prevM < 0) { prevM = 11; prevY -= 1; }
      const startPrev = new Date(prevY, prevM, 1).toISOString().split('T')[0];
      const endPrev   = new Date(prevY, prevM + 1, 0).toISOString().split('T')[0];

      const { data: prevData } = await supabase
        .from('finance_transactions')
        .select('type, amount')
        .eq('org_id', orgId)
        .gte('date', startPrev)
        .lte('date', endPrev);

      const prevTxs = prevData || [];
      const prevIncome  = prevTxs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
      const prevExpense = prevTxs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
      setPrevSummary({ totalIncome: prevIncome, totalExpense: prevExpense, netProfit: prevIncome - prevExpense });
    } catch (err) {
      console.error('[FinanceDashboard] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [orgId, selectedMonth, selectedYear]);

  useEffect(() => { fetchDashboardData(); }, [fetchDashboardData]);

  const top3 = pieData.slice(0, 3);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
          <div className="absolute inset-0 rounded-full border-4 border-t-amber-500 animate-spin" />
        </div>
        <p className="text-sm text-slate-400">Memuat dashboard analitik...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Summary Cards: bulan ini vs bulan lalu ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Pemasukan */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
              <ArrowUpRight size={18} className="text-white" />
            </div>
            <DeltaBadge current={currSummary.totalIncome} previous={prevSummary.totalIncome} />
          </div>
          <p className="text-2xl font-black text-slate-900 leading-tight">{formatRp(currSummary.totalIncome)}</p>
          <p className="text-sm text-slate-500 mt-0.5">Total Pemasukan</p>
        </div>

        {/* Pengeluaran */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500 flex items-center justify-center">
              <ArrowDownRight size={18} className="text-white" />
            </div>
            <DeltaBadge current={currSummary.totalExpense} previous={prevSummary.totalExpense} isExpense />
          </div>
          <p className="text-2xl font-black text-slate-900 leading-tight">{formatRp(currSummary.totalExpense)}</p>
          <p className="text-sm text-slate-500 mt-0.5">Total Pengeluaran</p>
        </div>

        {/* Laba/Rugi */}
        <div className={`rounded-2xl p-5 border shadow-sm ${
          currSummary.netProfit >= 0
            ? 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-100'
            : 'bg-gradient-to-br from-rose-50 to-pink-50 border-rose-100'
        }`}>
          <div className="flex items-start justify-between mb-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              currSummary.netProfit >= 0 ? 'bg-emerald-500' : 'bg-rose-500'
            }`}>
              <TrendingUp size={18} className="text-white" />
            </div>
            <DeltaBadge current={currSummary.netProfit} previous={prevSummary.netProfit} />
          </div>
          <p className={`text-2xl font-black leading-tight ${
            currSummary.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
          }`}>
            {formatRp(Math.abs(currSummary.netProfit))}
          </p>
          <p className="text-sm text-slate-500 mt-0.5">
            {currSummary.netProfit >= 0 ? 'Laba Bersih' : 'Rugi Bersih'}
          </p>
        </div>
      </div>

      {/* ── Top 3 Kategori Pengeluaran ── */}
      {top3.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center">
              <Trophy size={15} className="text-amber-600" />
            </div>
            <h3 className="font-bold text-slate-900">Top 3 Pengeluaran Terbesar</h3>
          </div>
          <div className="space-y-3">
            {top3.map((item, idx) => {
              const pct = currSummary.totalExpense > 0
                ? Math.round((item.total / currSummary.totalExpense) * 100)
                : 0;
              const medals = ['🥇', '🥈', '🥉'];
              return (
                <div key={item.category}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{medals[idx]}</span>
                      <span className="text-sm font-semibold text-slate-800">{item.category}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-black text-rose-600">{formatRp(item.total)}</span>
                      <span className="text-xs text-slate-400 ml-1.5">{pct}%</span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all duration-700"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: PIE_COLORS[idx],
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Pie Chart — Distribusi Pengeluaran */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="font-bold text-slate-900 mb-5">
            Distribusi Pengeluaran — {MONTHS_SHORT[selectedMonth]}
          </h3>
          {pieData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
              <div className="w-16 h-16 rounded-full bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center text-2xl">📊</div>
              <p className="text-sm">Belum ada pengeluaran bulan ini</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="total"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomPieTooltip />} />
                <Legend
                  formatter={(value) => (
                    <span className="text-xs text-slate-600 font-medium">{value}</span>
                  )}
                  iconType="circle"
                  iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Line Chart — Tren 6 Bulan */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="font-bold text-slate-900 mb-5">
            Tren Pemasukan vs Pengeluaran — 6 Bulan
          </h3>
          {trendData.every(d => d.income === 0 && d.expense === 0) ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
              <div className="w-16 h-16 rounded-full bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center text-2xl">📈</div>
              <p className="text-sm">Belum ada data untuk grafik tren</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={formatRpShort}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  width={55}
                />
                <Tooltip content={<CustomLineTooltip />} />
                <Legend
                  formatter={(value) => (
                    <span className="text-xs text-slate-600 font-medium">{value}</span>
                  )}
                />
                <Line
                  type="monotone"
                  dataKey="income"
                  name="Pemasukan"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={{ fill: '#10b981', strokeWidth: 0, r: 4 }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
                <Line
                  type="monotone"
                  dataKey="expense"
                  name="Pengeluaran"
                  stroke="#ef4444"
                  strokeWidth={2.5}
                  dot={{ fill: '#ef4444', strokeWidth: 0, r: 4 }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};

export default FinanceDashboard;
