import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
// ... existing imports ...
import {
  Users,
  Search,
  Filter,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Phone,
  Mail,
  MoreHorizontal,
  TrendingUp,
  Flame,
  Snowflake,
  Sun,
  CheckCircle,
  Trash2,
} from 'lucide-react';
import { useCallback } from 'react';
import type { Lead } from '../types';

const statusConfig = {
  hot: {
    label: 'Hot',
    icon: Flame,
    bg: 'bg-red-50',
    text: 'text-red-600',
    border: 'border-red-200',
    dot: 'bg-red-500',
  },
  warm: {
    label: 'Warm',
    icon: Sun,
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    border: 'border-amber-200',
    dot: 'bg-amber-400',
  },
  cold: {
    label: 'Cold',
    icon: Snowflake,
    bg: 'bg-blue-50',
    text: 'text-blue-500',
    border: 'border-blue-200',
    dot: 'bg-blue-400',
  },
  converted: {
    label: 'Konversi',
    icon: CheckCircle,
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
  },
};

const avatarColors: Record<string, string> = {
  SC: 'from-pink-400 to-rose-500',
  MR: 'from-blue-400 to-indigo-500',
  PN: 'from-violet-400 to-purple-500',
  JE: 'from-amber-400 to-orange-500',
  AO: 'from-emerald-400 to-teal-500',
  TB: 'from-cyan-400 to-blue-500',
  LS: 'from-fuchsia-400 to-pink-500',
  DK: 'from-slate-400 to-slate-600',
};

const LeadsPage: React.FC = () => {
  const { session } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Lead['status'] | 'all'>('all');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLeads = useCallback(() => {
    setLoading(true);
    fetch('/api/leads', {
      headers: {
        'Authorization': `Bearer ${session?.access_token}`
      }
    })
      .then((res) => res.json())
      .then((res) => {
        if (res.success && res.data) {
          const mappedLeads: Lead[] = res.data.map((dbLead: any) => ({
            id: dbLead.id,
            name: dbLead.name,
            company: dbLead.metadata?.company || 'Calon Pelanggan',
            email: dbLead.metadata?.email || '-',
            whatsapp: dbLead.whatsapp || '-',
            status: dbLead.metadata?.status || 'hot', 
            value: dbLead.metadata?.value || 0,
            date: dbLead.created_at,
            avatar: dbLead.name.substring(0, 2).toUpperCase(),
          }));
          setLeads(mappedLeads);
        }
      })
      .catch((err) => console.error('Gagal mengambil data lead', err))
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleDelete = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus lead ini?')) return;

    try {
      const response = await fetch(`/api/leads/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });
      const data = await response.json();
      if (data.success) {
        fetchLeads();
      } else {
        alert(data.message || 'Gagal menghapus lead');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Terjadi kesalahan saat menghapus lead.');
    }
  };

  const filtered = leads.filter((l) => {
    const matchSearch =
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.company.toLowerCase().includes(search.toLowerCase()) ||
      l.email.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || l.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalValue = leads.reduce((s, l) => s + l.value, 0);
  const hotLeads = leads.filter((l) => l.status === 'hot').length;
  const converted = leads.filter((l) => l.status === 'converted').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-rose-500 flex items-center justify-center">
            <Users size={16} className="text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 leading-tight">Leads</h2>
            <p className="text-xs text-slate-500">{loading ? 'Memuat...' : `${leads.length} total lead dalam pipeline`}</p>
          </div>
        </div>
        <button
          id="leads-add"
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl shadow-sm shadow-emerald-500/30 transition-all duration-150 active:scale-95"
        >
          <Plus size={15} />
          Tambah Lead
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-sm shadow-emerald-500/30">
            <TrendingUp size={18} className="text-white" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Total Pipeline</p>
            <p className="text-xl font-bold text-slate-900">
              Rp {(totalValue / 1000).toFixed(0)}rb
            </p>
            <div className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
              <ArrowUpRight size={11} /> 18.4% bulan ini
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-red-500 flex items-center justify-center shadow-sm shadow-red-500/30">
            <Flame size={18} className="text-white" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Hot Leads</p>
            <p className="text-xl font-bold text-slate-900">{hotLeads}</p>
            <p className="text-xs text-slate-400">Butuh tindak lanjut segera</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-violet-500 flex items-center justify-center shadow-sm shadow-violet-500/30">
            <CheckCircle size={18} className="text-white" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Konversi</p>
            <p className="text-xl font-bold text-slate-900">{converted}</p>
            <div className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
              <ArrowUpRight size={11} /> {leads.length > 0 ? Math.round((converted / leads.length) * 100) : 0}% rasio
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filter Row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="leads-search"
            type="text"
            placeholder="Cari berdasarkan nama, perusahaan, atau whatsapp..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-slate-400" />
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            {([{ key: 'all', label: 'Semua' }, { key: 'hot', label: 'Hot' }, { key: 'warm', label: 'Warm' }, { key: 'cold', label: 'Cold' }, { key: 'converted', label: 'Konversi' }] as const).map((s) => (
              <button
                key={s.key}
                id={`leads-filter-${s.key}`}
                onClick={() => setStatusFilter(s.key as any)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  statusFilter === s.key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Lead</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Kontak</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Nilai</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Tanggal</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((lead) => {
                const cfg = statusConfig[lead.status] || statusConfig.hot;
                const StatusIcon = cfg.icon;
                return (
                  <tr key={lead.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarColors[lead.avatar] || 'from-slate-400 to-slate-600'} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}
                        >
                          {lead.avatar}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900 group-hover:text-emerald-600 transition-colors leading-tight">
                            {lead.name}
                          </p>
                          <p className="text-xs text-slate-400 leading-tight">{lead.company}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 hidden md:table-cell">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Mail size={11} className="text-slate-400" />
                          {lead.email}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                          <Phone size={11} className="text-slate-400" />
                          {lead.whatsapp}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                        <StatusIcon size={11} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="py-4 px-4 hidden lg:table-cell">
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-semibold text-slate-900">
                          Rp {lead.value.toLocaleString()}
                        </span>
                        {lead.status === 'converted' && (
                          <ArrowUpRight size={13} className="text-emerald-500" />
                        )}
                        {lead.status === 'cold' && (
                          <ArrowDownRight size={13} className="text-slate-400" />
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4 hidden lg:table-cell">
                      <span className="text-xs text-slate-500">
                        {new Date(lead.date).toLocaleDateString('id-ID', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center justify-end gap-1">
                        <button className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all">
                          <Phone size={14} />
                        </button>
                        <button className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all">
                          <Mail size={14} />
                        </button>
                        <button 
                          onClick={() => handleDelete(lead.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                          title="Hapus lead"
                        >
                          <Trash2 size={14} />
                        </button>
                        <button className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
                          <MoreHorizontal size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-16 text-slate-400">
              <Users size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Lead tidak ditemukan</p>
              <p className="text-xs mt-1">Coba cari dengan kata kunci atau filter lain</p>
            </div>
          )}
        </div>
        {/* Table Footer */}
        <div className="border-t border-slate-100 px-4 py-3 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            Menampilkan <span className="font-semibold text-slate-700">{filtered.length}</span> dari{' '}
            <span className="font-semibold text-slate-700">{leads.length}</span> lead
          </p>
          <div className="flex items-center gap-1">
            <button className="px-3 py-1 text-xs text-slate-500 font-medium rounded-lg border border-slate-200 hover:bg-slate-50 transition-all">
              Sebelumnya
            </button>
            <button className="px-3 py-1 text-xs text-white font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 transition-all">
              1
            </button>
            <button className="px-3 py-1 text-xs text-slate-500 font-medium rounded-lg border border-slate-200 hover:bg-slate-50 transition-all">
              Selanjutnya
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeadsPage;
