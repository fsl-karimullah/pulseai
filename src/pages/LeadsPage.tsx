import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOrganization } from '../hooks/useOrganization';
import {
  Users, Search, Edit2, Trash2, MessageCircle, Mail, X, Save,
  Clock, User, ChevronLeft, ChevronRight, Download, Flame,
  TrendingUp, Send, Bot, RefreshCw, Building2, Phone,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Lead {
  id: string;
  name: string;
  whatsapp: string;
  last_message: string | null;
  metadata: any;
  created_at: string;
}

interface ChatLog {
  id: string;
  sender: 'customer' | 'bot';
  message_text: string;
  created_at: string;
  bot_number: string;
}

type FilterTab = 'all' | 'hot' | 'new' | 'whatsapp' | 'widget';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isHotLead(lead: Lead): boolean {
  return lead.metadata?.source === 'whatsapp_handover';
}

function isNewLead(lead: Lead): boolean {
  const created = new Date(lead.created_at);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return created > sevenDaysAgo;
}

function getLeadSource(lead: Lead): string {
  return lead.metadata?.source || 'whatsapp_chat';
}

function isLidNumber(num: string): boolean {
  if (num.length < 14) return false;
  if (num.startsWith('62') || num.startsWith('0')) return false;
  return true;
}

function cleanWaNumber(whatsapp: string): string {
  let clean = whatsapp.replace(/\D/g, '');
  if (clean.startsWith('0')) clean = '62' + clean.substring(1);
  return clean;
}

function exportToCSV(leads: Lead[]) {
  const headers = ['Nama', 'WhatsApp', 'Perusahaan', 'Email', 'Sumber', 'Pesan Terakhir', 'Tanggal'];
  const rows = leads.map(l => [
    `"${l.name}"`,
    `"${l.whatsapp}"`,
    `"${l.metadata?.company || ''}"`,
    `"${l.metadata?.email || ''}"`,
    `"${getLeadSource(l)}"`,
    `"${(l.last_message || '').replace(/"/g, "'")}"`,
    `"${new Date(l.created_at).toLocaleString('id-ID')}"`,
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `leads-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: number | string;
  sub?: string; color: string;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4`}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-black text-slate-900 leading-tight mt-0.5">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function LeadBadge({ lead }: { lead: Lead }) {
  if (isHotLead(lead)) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-xs font-bold border border-red-100">
        <Flame size={10} />
        Hot
      </span>
    );
  }
  if (isNewLead(lead)) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-xs font-bold border border-emerald-100">
        <TrendingUp size={10} />
        Baru
      </span>
    );
  }
  return null;
}

function ChatDrawer({ lead, session, onClose }: {
  lead: Lead; session: any; onClose: () => void;
}) {
  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // botNumber is optional — stored in metadata after recent messages.
  // For older leads without bot_number in metadata, we send customerNumber only
  // and the server will search across ALL bot numbers for this org.
  const botNumber: string = lead.metadata?.bot_number || '';
  const customerNumber = lead.whatsapp;

  const fetchLogs = useCallback(async () => {
    if (!customerNumber) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      // Build params — omit botNumber if empty so server auto-resolves it
      const params = new URLSearchParams({ customerNumber });
      if (botNumber) params.set('botNumber', botNumber);

      const res = await fetch(`/api/chats?${params}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (data.success) {
        setLogs(data.messages || []);
      } else {
        setError(data.message || 'Gagal memuat riwayat chat.');
      }
    } catch {
      setError('Gagal terhubung ke server.');
    } finally {
      setLoading(false);
    }
  }, [botNumber, customerNumber, session]);


  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const cleanWa = cleanWaNumber(lead.whatsapp);
  const isLid = isLidNumber(cleanWa);
  const company = lead.metadata?.company;
  const email = lead.metadata?.email;

  const formatTime = (ts: string) =>
    new Date(ts).toLocaleString('id-ID', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });

  return (
    <div className="fixed inset-0 z-50 flex" onClick={(e) => e.target === e.currentTarget && onClose()}>
      {/* Backdrop */}
      <div className="flex-1 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div
        className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300"
        style={{ minWidth: '360px' }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-white flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
          <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
            <User size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-bold text-slate-900 text-sm truncate">{lead.name}</p>
              <LeadBadge lead={lead} />
            </div>
            <p className="text-xs text-slate-500 truncate">
              {isLid ? 'Nomor WA disembunyikan (LID)' : lead.whatsapp}
            </p>
          </div>
          <button
            onClick={fetchLogs}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={15} />
          </button>
        </div>

        {/* Profile Info */}
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/80 flex flex-wrap gap-3">
          {!isLid ? (
            <a
              href={`https://wa.me/${cleanWa}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors text-xs font-semibold border border-emerald-100"
            >
              <MessageCircle size={13} />
              Buka WhatsApp
            </a>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 text-xs font-semibold border border-orange-200">
              <Phone size={13} />
              Menunggu user memberikan nomor WA
            </span>
          )}
          {email && (
            <a
              href={`mailto:${email}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors text-xs font-semibold"
            >
              <Mail size={13} />
              {email}
            </a>
          )}
          {company && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold">
              <Building2 size={13} />
              {company}
            </span>
          )}
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-slate-50/50 to-white">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
              <div className="w-8 h-8 border-3 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
              <p className="text-xs">Memuat riwayat chat...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
              <MessageCircle size={32} className="opacity-30" />
              <p className="text-xs text-center">{error}</p>
              {error.includes('Akses') && (
                <p className="text-xs text-center text-slate-400">
                  Pastikan <strong>Bot Number</strong> sudah terhubung ke akun ini.
                </p>
              )}
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
              <MessageCircle size={32} className="opacity-30" />
              <p className="text-xs">Belum ada riwayat chat yang tersimpan</p>
            </div>
          ) : (
            <>
              {logs.map((log) => {
                const isBot = log.sender === 'bot';
                return (
                  <div
                    key={log.id}
                    className={`flex gap-2 ${!isBot ? 'flex-row' : 'flex-row-reverse'}`}
                  >
                    {/* Avatar */}
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${
                      isBot ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'
                    }`}>
                      {isBot ? <Bot size={12} /> : <User size={12} />}
                    </div>

                    {/* Bubble */}
                    <div className={`max-w-[78%] ${!isBot ? 'items-start' : 'items-end'} flex flex-col gap-1`}>
                      <div className={`px-3 py-2 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap break-words shadow-sm ${
                        isBot
                          ? 'bg-emerald-500 text-white rounded-tr-none'
                          : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none'
                      }`}>
                        {log.message_text}
                      </div>
                      <p className="text-[10px] text-slate-400 px-1">
                        {formatTime(log.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center gap-2">
          <Send size={12} className="text-slate-400" />
          <p className="text-xs text-slate-400">
            {logs.length > 0
              ? `${logs.length} pesan • Balasan hanya via WhatsApp`
              : 'Riwayat chat ditampilkan dari database'}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const LeadsPage: React.FC = () => {
  const { session } = useAuth();
  const { organization } = useOrganization();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [currentEdit, setCurrentEdit] = useState<Lead | null>(null);
  const [editName, setEditName] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [chatLead, setChatLead] = useState<Lead | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // ─── Data fetching ──────────────────────────────────────────────────────────

  const fetchLeads = async () => {
    try {
      const res = await fetch('/api/leads', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (data.success) setLeads(data.data || []);
    } catch (err) {
      console.error('Failed to fetch leads', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLeads(); }, [organization, session]);

  // ─── Stats ─────────────────────────────────────────────────────────────────

  const totalLeads = leads.length;
  const hotLeads = leads.filter(isHotLead).length;
  const newThisWeek = leads.filter(isNewLead).length;

  // ─── Filtering ─────────────────────────────────────────────────────────────

  const filtered = leads.filter(l => {
    const matchSearch =
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.whatsapp.includes(search) ||
      (l.metadata?.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (l.metadata?.company || '').toLowerCase().includes(search.toLowerCase());

    if (!matchSearch) return false;

    switch (activeFilter) {
      case 'hot':      return isHotLead(l);
      case 'new':      return isNewLead(l);
      case 'whatsapp': return getLeadSource(l).includes('whatsapp');
      case 'widget':   return getLeadSource(l).includes('widget');
      default:         return true;
    }
  });

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginatedLeads = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    if (!confirm('Yakin ingin menghapus data lead ini?')) return;
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (data.success) setLeads(leads.filter(l => l.id !== id));
      else alert(data.message || 'Gagal menghapus');
    } catch (err) { console.error(err); }
  };

  const openEditModal = (lead: Lead) => {
    setCurrentEdit(lead);
    setEditName(lead.name);
    setEditWhatsapp(lead.whatsapp);
    setEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!currentEdit) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/leads/${currentEdit.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ name: editName, whatsapp: editWhatsapp }),
      });
      const data = await res.json();
      if (data.success) {
        setLeads(leads.map(l => l.id === currentEdit.id ? { ...l, name: editName, whatsapp: editWhatsapp } : l));
        setEditModalOpen(false);
      } else {
        alert(data.message || 'Gagal menyimpan');
      }
    } catch (err) { console.error(err); }
    finally { setIsSaving(false); }
  };

  const FILTER_TABS: { key: FilterTab; label: string; count?: number }[] = [
    { key: 'all',      label: 'Semua',    count: totalLeads },
    { key: 'hot',      label: '🔥 Hot',   count: hotLeads },
    { key: 'new',      label: '✨ Baru',  count: newThisWeek },
    { key: 'whatsapp', label: 'WhatsApp' },
    { key: 'widget',   label: 'Widget' },
  ];

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 relative">

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
            <Users size={20} className="text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 leading-tight">Data Leads</h2>
            <p className="text-xs text-slate-500 mt-0.5">Kelola prospek dan pantau riwayat percakapan</p>
          </div>
        </div>
        <button
          onClick={() => exportToCSV(filtered)}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors"
        >
          <Download size={15} />
          Export CSV
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={<Users size={22} className="text-emerald-600" />}
          label="Total Leads"
          value={totalLeads}
          sub="semua prospek"
          color="bg-emerald-50"
        />
        <StatCard
          icon={<Flame size={22} className="text-red-500" />}
          label="Hot Leads"
          value={hotLeads}
          sub="diteruskan ke admin"
          color="bg-red-50"
        />
        <StatCard
          icon={<TrendingUp size={22} className="text-blue-500" />}
          label="Leads Minggu Ini"
          value={newThisWeek}
          sub="7 hari terakhir"
          color="bg-blue-50"
        />
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">

        {/* Toolbar */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama, nomor, perusahaan, atau email..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 transition-all"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-1.5 flex-wrap">
            {FILTER_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => { setActiveFilter(tab.key); setCurrentPage(1); }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                  activeFilter === tab.key
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-white text-slate-500 border border-slate-200 hover:border-emerald-300 hover:text-emerald-600'
                }`}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    activeFilter === tab.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center p-12">
              <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Users size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Tidak ada leads ditemukan</p>
              <p className="text-xs mt-1">Coba ubah filter atau kata kunci pencarian</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-5 py-3.5">Nama Prospek</th>
                  <th className="px-5 py-3.5">Kontak</th>
                  <th className="px-5 py-3.5 hidden md:table-cell">Pesan Terakhir</th>
                  <th className="px-5 py-3.5 hidden lg:table-cell">Tanggal</th>
                  <th className="px-5 py-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginatedLeads.map(lead => {
                  const cleanWa = cleanWaNumber(lead.whatsapp);
                  const isLid = isLidNumber(cleanWa);
                  const waLink = `https://wa.me/${cleanWa}`;
                  const email = lead.metadata?.email;
                  const company = lead.metadata?.company;
                  const date = new Date(lead.created_at).toLocaleDateString('id-ID', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  });

                  return (
                    <tr
                      key={lead.id}
                      className="hover:bg-emerald-50/30 transition-colors group cursor-pointer"
                      onClick={() => setChatLead(lead)}
                    >
                      {/* Name */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white flex items-center justify-center flex-shrink-0 text-xs font-bold shadow-sm">
                            {lead.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-sm">{lead.name}</span>
                              <LeadBadge lead={lead} />
                            </div>
                            {company && (
                              <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                                <Building2 size={10} />
                                {company}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-2 flex-wrap">
                          {!isLid ? (
                            <a
                              href={waLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors text-xs font-semibold border border-emerald-100"
                            >
                              <MessageCircle size={13} />
                              WA
                            </a>
                          ) : (
                            <span
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-orange-50 text-orange-600 text-xs font-bold border border-orange-100"
                              title="WhatsApp menyembunyikan nomor (LID). AI sedang meminta kontak user."
                            >
                              <Phone size={13} />
                              Pending WA
                            </span>
                          )}
                          {email && (
                            <a
                              href={`mailto:${email}`}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors text-xs font-semibold"
                            >
                              <Mail size={13} />
                              Email
                            </a>
                          )}
                        </div>
                      </td>

                      {/* Last message */}
                      <td className="px-5 py-4 hidden md:table-cell">
                        <p className="text-xs text-slate-500 line-clamp-2 max-w-xs italic" title={lead.last_message || ''}>
                          {lead.last_message ? `"${lead.last_message}"` : (
                            <span className="not-italic text-slate-300">—</span>
                          )}
                        </p>
                      </td>

                      {/* Date */}
                      <td className="px-5 py-4 hidden lg:table-cell whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                          <Clock size={11} />
                          {date}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setChatLead(lead)}
                            className="p-1.5 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Riwayat Chat"
                          >
                            <MessageCircle size={15} />
                          </button>
                          <button
                            onClick={() => openEditModal(lead)}
                            className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            onClick={() => handleDelete(lead.id)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Hapus"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {filtered.length > itemsPerPage && (
          <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">
              {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filtered.length)} dari {filtered.length} leads
            </span>
            <div className="flex gap-1.5">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={15} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .map((p, idx, arr) => (
                  <React.Fragment key={p}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && (
                      <span className="w-8 h-8 flex items-center justify-center text-slate-400 text-xs">…</span>
                    )}
                    <button
                      onClick={() => setCurrentPage(p)}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-colors ${
                        p === currentPage
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {p}
                    </button>
                  </React.Fragment>
                ))}
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Chat History Drawer */}
      {chatLead && (
        <ChatDrawer
          lead={chatLead}
          session={session}
          onClose={() => setChatLead(null)}
        />
      )}

      {/* Edit Modal */}
      {editModalOpen && currentEdit && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-900">Edit Lead</h3>
              <button onClick={() => setEditModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nama Prospek</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nomor WhatsApp</label>
                <input
                  type="tel"
                  value={editWhatsapp}
                  onChange={e => setEditWhatsapp(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => setEditModalOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors disabled:opacity-50"
              >
                {isSaving
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Save size={15} />}
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeadsPage;
