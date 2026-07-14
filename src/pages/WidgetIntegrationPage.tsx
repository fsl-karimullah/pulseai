import React, { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '../hooks/useOrganization';
import { useSubscription } from '../hooks/useSubscription';
import { useAuth } from '../contexts/AuthContext';
import { useProjects } from '../contexts/ProjectContext';
import {
  Copy,
  Check,
  ShieldCheck,
  Code2,
  Loader2,
  BadgeCheck,
  ShieldAlert,
  FolderKanban,
  ChevronDown,
  Plus,
  Trash2,
  Monitor,
  X,
  AlertCircle,
} from 'lucide-react';

interface WidgetChannel {
  id: string;
  project_id: string;
  name: string;
  domain: string | null;
  is_active: boolean;
  created_at: string;
}

const WidgetIntegrationPage: React.FC = () => {
  const { organization, loading } = useOrganization();
  const { subscription } = useSubscription();
  const { session } = useAuth();
  const { projects, activeProjectId, setActiveProjectId } = useProjects();
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const activeProject = projects.find((p) => p.id === activeProjectId);

  const [channels, setChannels] = useState<WidgetChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDomain, setNewChannelDomain] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  const fetchChannels = useCallback(async () => {
    if (!activeProjectId || !session?.access_token) return;
    setLoadingChannels(true);
    try {
      const res = await fetch(`/api/projects/${activeProjectId}/widget-channels`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (json.success) setChannels(json.data || []);
    } catch (err) {
      console.error('Failed to fetch widget channels', err);
    } finally {
      setLoadingChannels(false);
    }
  }, [activeProjectId, session]);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const buildScriptTag = () => {
    const botName = activeProject?.name || organization?.name || 'Aria';
    const company = activeProject?.name || organization?.name || 'PulseAI';
    return `<script src="${apiBase}/api/widget.js?orgId=${organization?.id}&projectId=${activeProjectId}&botName=${encodeURIComponent(botName)}&company=${encodeURIComponent(company)}"></script>`;
  };

  const handleCopy = (channelId: string) => {
    navigator.clipboard.writeText(buildScriptTag());
    setCopiedId(channelId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreateChannel = async () => {
    if (!activeProjectId || !session?.access_token) return;
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch(`/api/projects/${activeProjectId}/widget-channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ name: newChannelName.trim() || undefined, domain: newChannelDomain.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setCreateError(json.message || 'Gagal membuat widget');
      } else {
        setCreateOpen(false);
        setNewChannelName('');
        setNewChannelDomain('');
        await fetchChannels();
      }
    } catch (err: any) {
      setCreateError(err.message || 'Gagal membuat widget');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteChannel = async (id: string) => {
    if (!session?.access_token) return;
    if (!confirm('Hapus widget ini? Snippet yang sudah terpasang di website akan berhenti berfungsi.')) return;
    try {
      const res = await fetch(`/api/widget-channels/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (json.success) {
        await fetchChannels();
      } else {
        alert(json.message || 'Gagal menghapus widget');
      }
    } catch (err) {
      console.error('Delete widget channel error', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-emerald-600" size={32} />
      </div>
    );
  }

  const isBusiness = subscription?.plan_type === 'business';

  return (
    <div className="max-w-4xl mx-auto space-y-8 font-sans pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Integrasi Website</h1>
          <p className="text-slate-500 text-sm mt-1">Hubungkan PulseAI ke website Anda dalam hitungan detik.</p>
        </div>
        <div className="flex items-center gap-2">
          {projects.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setProjectMenuOpen((v) => !v)}
                className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-slate-200 hover:border-emerald-500 text-slate-700 text-sm font-semibold rounded-xl transition-all duration-150"
              >
                <FolderKanban size={15} className="text-emerald-500" />
                {activeProject?.name || 'Pilih Project'}
                <ChevronDown size={14} className="text-slate-400" />
              </button>
              {projectMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setProjectMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl border border-slate-200 shadow-lg z-20 py-1.5 max-h-72 overflow-y-auto">
                    {projects.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => { setActiveProjectId(p.id); setProjectMenuOpen(false); }}
                        className={`w-full text-left px-3.5 py-2 text-sm font-medium flex items-center justify-between gap-2 hover:bg-slate-50 ${
                          p.id === activeProjectId ? 'text-emerald-600' : 'text-slate-700'
                        }`}
                      >
                        <span className="truncate">{p.name}</span>
                        {p.id === activeProjectId && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {isBusiness ? (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm font-semibold">
              <BadgeCheck size={18} />
              White-label Aktif
            </div>
          ) : (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-sm font-medium">
              <ShieldAlert size={18} />
              Branding PulseAI Aktif
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-200">
              <Code2 size={20} />
            </div>
            <h2 className="text-lg font-bold text-slate-900">3 Langkah Mudah Integrasi</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-2">
              <div className="text-emerald-600 font-bold text-xl">01</div>
              <p className="text-sm text-slate-700 font-medium leading-relaxed">Salin kode snippet widget di bawah ini.</p>
            </div>
            <div className="space-y-2">
              <div className="text-emerald-600 font-bold text-xl">02</div>
              <p className="text-sm text-slate-700 font-medium leading-relaxed">Tempelkan kode di dalam tag <span className="font-mono text-emerald-700 bg-emerald-50 px-1 rounded">&lt;head&gt;</span> website Anda.</p>
            </div>
            <div className="space-y-2">
              <div className="text-emerald-600 font-bold text-xl">03</div>
              <p className="text-sm text-slate-700 font-medium leading-relaxed">Simpan dan publikasikan website Anda.</p>
            </div>
          </div>
        </div>

        <div className="p-8 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Widget di project "{activeProject?.name || '—'}"</h3>
              <p className="text-xs text-slate-500 mt-0.5">Satu project bisa punya lebih dari satu widget (misal: website utama & landing page promo).</p>
            </div>
            <button
              onClick={() => { setCreateOpen(true); setNewChannelName(''); setNewChannelDomain(''); setCreateError(''); }}
              disabled={!activeProjectId}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl shadow-sm shadow-emerald-500/30 transition-all duration-150 active:scale-95 flex-shrink-0"
            >
              <Plus size={15} />
              Tambah Widget
            </button>
          </div>

          {loadingChannels ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="animate-spin text-emerald-500" size={24} />
            </div>
          ) : channels.length === 0 ? (
            <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-2xl border border-slate-100">
              <Monitor size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">Belum ada widget di project ini</p>
              <p className="text-xs mt-1">Klik "Tambah Widget" untuk membuat snippet pertama Anda</p>
            </div>
          ) : (
            channels.map((ch) => (
              <div key={ch.id} className="rounded-2xl border border-slate-200 p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{ch.name}</p>
                    {ch.domain && <p className="text-xs text-slate-400 truncate">{ch.domain}</p>}
                  </div>
                  <button
                    onClick={() => handleDeleteChannel(ch.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0"
                    title="Hapus widget"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="relative group">
                  <div className="bg-slate-900 rounded-xl p-4 font-mono text-xs leading-relaxed border border-slate-800 overflow-x-auto">
                    <code className="text-emerald-400 break-all">{buildScriptTag()}</code>
                  </div>
                  <button
                    onClick={() => handleCopy(ch.id)}
                    className={`absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-lg ${
                      copiedId === ch.id
                        ? 'bg-emerald-500 text-white'
                        : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-md border border-white/10'
                    }`}
                  >
                    {copiedId === ch.id ? <Check size={13} /> : <Copy size={13} />}
                    {copiedId === ch.id ? 'Tersalin!' : 'Salin'}
                  </button>
                </div>
              </div>
            ))
          )}

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck size={14} className="text-emerald-500" />
            Snippet ini unik untuk project Anda dan aman untuk digunakan secara publik.
          </div>
        </div>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && !creating && setCreateOpen(false)}>
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Widget Baru</h3>
              <button onClick={() => !creating && setCreateOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nama Widget <span className="text-slate-400 font-normal">(opsional)</span></label>
                <input
                  type="text"
                  autoFocus
                  placeholder="contoh: Website Utama"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  disabled={creating}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 disabled:opacity-50 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Domain <span className="text-slate-400 font-normal">(opsional, untuk catatan Anda)</span></label>
                <input
                  type="text"
                  placeholder="contoh: tokoutama.com"
                  value={newChannelDomain}
                  onChange={(e) => setNewChannelDomain(e.target.value)}
                  disabled={creating}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 disabled:opacity-50 transition-all"
                />
              </div>
              {createError && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100">
                  <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 leading-relaxed">{createError}</p>
                </div>
              )}
              <button
                onClick={handleCreateChannel}
                disabled={creating}
                className="w-full py-3 text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-xl shadow-sm shadow-emerald-500/30 transition-all active:scale-[0.98]"
              >
                {creating ? (
                  <span className="flex items-center justify-center gap-2"><Loader2 size={15} className="animate-spin" /> Membuat...</span>
                ) : 'Buat Widget'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WidgetIntegrationPage;
