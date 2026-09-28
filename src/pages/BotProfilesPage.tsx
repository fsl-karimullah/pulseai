import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useProjects } from '../contexts/ProjectContext';
import {
  Bot, Plus, Pencil, Trash2, CheckCircle2, X, Loader2, BookOpen,
  MessageCircle, Monitor, Save,
  Sparkles, Layers, AlertCircle, ToggleLeft, ToggleRight,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface BotProfile {
  id: string;
  org_id: string;
  project_id: string | null;
  profile_name: string;
  kb_project_ids: string[];
  bot_name: string | null;
  instructions: string | null;
  tone: string | null;
  is_active: boolean;
  admin_whatsapp: string | null;
  logo_url: string | null;
  whatsapp_channel_count: number;
  widget_channel_count: number;
  created_at: string;
}

interface Project {
  id: string;
  name: string;
  knowledge_count: number;
}

const TONE_OPTIONS = ['Profesional', 'Ramah', 'Casual / Santai', 'Singkat & Padat', 'Jenaka / Humor'];

const PROFILE_COLORS = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-cyan-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-red-500',
  'from-pink-500 to-rose-600',
  'from-amber-500 to-yellow-600',
];

// ─── Sub-components ─────────────────────────────────────────────────────────────

interface ProfileCardProps {
  profile: BotProfile;
  colorClass: string;
  projects: Project[];
  onEdit: (p: BotProfile) => void;
  onDelete: (p: BotProfile) => void;
}

const ProfileCard: React.FC<ProfileCardProps> = ({ profile, colorClass, projects, onEdit, onDelete }) => {
  const kbNames = profile.kb_project_ids
    .map((id) => projects.find((p) => p.id === id)?.name)
    .filter(Boolean);

  const totalChannels = profile.whatsapp_channel_count + profile.widget_channel_count;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group">
      {/* Header gradient bar */}
      <div className={`h-2 bg-gradient-to-r ${colorClass}`} />

      <div className="p-5">
        {/* Top row */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colorClass} flex items-center justify-center flex-shrink-0 shadow-sm`}>
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-800 truncate">{profile.profile_name}</h3>
              <p className="text-xs text-slate-500 truncate">{profile.bot_name || 'Aria'}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onEdit(profile)}
              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
              title="Edit"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(profile)}
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
              title="Hapus"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tone badge */}
        <div className="mb-4">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">
            <Sparkles className="w-3 h-3" />
            {profile.tone || 'Profesional'}
          </span>
          {profile.is_active ? (
            <span className="ml-2 inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium">
              <CheckCircle2 className="w-3 h-3" />
              Aktif
            </span>
          ) : (
            <span className="ml-2 inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-500 rounded-full text-xs font-medium">
              Nonaktif
            </span>
          )}
        </div>

        {/* KB sources */}
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <BookOpen className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs font-medium text-slate-500">Knowledge Base</span>
          </div>
          {kbNames.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {kbNames.map((name, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-50 text-violet-700 rounded-full text-xs border border-violet-100">
                  <Layers className="w-2.5 h-2.5" />
                  {name}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-slate-400 italic">Belum ada KB dipilih</span>
          )}
        </div>

        {/* Channel stats */}
        <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-slate-500">
            <MessageCircle className="w-3.5 h-3.5" />
            <span className="text-xs">{profile.whatsapp_channel_count} WA</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-500">
            <Monitor className="w-3.5 h-3.5" />
            <span className="text-xs">{profile.widget_channel_count} Widget</span>
          </div>
          <div className="ml-auto">
            <span className={`text-xs font-semibold ${totalChannels > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
              {totalChannels} Channel
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Edit / Create Modal ─────────────────────────────────────────────────────────

interface ProfileModalProps {
  profile: BotProfile | null; // null = create new
  projects: Project[];
  token: string;
  onClose: () => void;
  onSaved: () => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ profile, projects, token, onClose, onSaved }) => {
  const isNew = !profile;
  const [profileName, setProfileName] = useState(profile?.profile_name ?? '');
  const [botName, setBotName] = useState(profile?.bot_name ?? '');
  const [tone, setTone] = useState(profile?.tone ?? 'Profesional');
  const [instructions, setInstructions] = useState(profile?.instructions ?? '');
  const [adminWA, setAdminWA] = useState(profile?.admin_whatsapp ?? '');
  const [isActive, setIsActive] = useState(profile?.is_active ?? true);
  const [selectedKBs, setSelectedKBs] = useState<string[]>(profile?.kb_project_ids ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleKB = (projectId: string) => {
    setSelectedKBs((prev) =>
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId]
    );
  };

  const handleSave = async () => {
    if (!profileName.trim()) {
      setError('Nama Bot Profile wajib diisi');
      return;
    }
    setSaving(true);
    setError('');

    const payload = {
      profile_name: profileName.trim(),
      bot_name: botName.trim() || null,
      tone,
      instructions: instructions.trim() || null,
      admin_whatsapp: adminWA.trim() || null,
      is_active: isActive,
      kb_project_ids: selectedKBs,
    };

    try {
      const url = isNew ? '/api/bot-profiles' : `/api/bot-profiles/${profile!.id}`;
      const method = isNew ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Gagal menyimpan');
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Modal header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800">{isNew ? 'Buat Bot Profile Baru' : 'Edit Bot Profile'}</h2>
              <p className="text-xs text-slate-500">Konfigurasi kepribadian dan sumber Knowledge Base</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Profile Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Nama Profile <span className="text-red-500">*</span>
            </label>
            <input
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
              placeholder="cth: Bot CS Toko, Bot HRD, Bot Sales"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
            />
            <p className="text-xs text-slate-400 mt-1">Nama untuk membedakan antar profile di dashboard.</p>
          </div>

          {/* Bot Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Nama Bot (ditampilkan ke user)</label>
            <input
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
              placeholder="cth: Aria, Maya, Budi"
              value={botName}
              onChange={(e) => setBotName(e.target.value)}
            />
          </div>

          {/* Tone */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Nada / Kepribadian Bot</label>
            <div className="grid grid-cols-2 gap-2">
              {TONE_OPTIONS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTone(t)}
                  className={`px-3 py-2 rounded-xl text-sm font-medium border transition-all text-left ${
                    tone === t
                      ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-violet-300 hover:bg-violet-50'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Instruksi Kustom (Prompt)</label>
            <textarea
              rows={3}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all resize-none"
              placeholder="cth: Kamu adalah asisten CS Toko Maju. Jawab dengan ramah, selalu tawarkan promo bulan ini..."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>

          {/* Knowledge Base Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-violet-500" />
                Knowledge Base yang Digunakan
              </div>
            </label>
            <p className="text-xs text-slate-400 mb-2">Pilih satu atau beberapa Knowledge Base (Project) untuk Bot ini.</p>
            <div className="space-y-2 max-h-40 overflow-y-auto border border-slate-100 rounded-xl p-2">
              {projects.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-3">Belum ada Project/KB dibuat.</p>
              ) : (
                projects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => toggleKB(project.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all text-left ${
                      selectedKBs.includes(project.id)
                        ? 'bg-violet-50 border border-violet-200 text-violet-700'
                        : 'bg-slate-50 border border-transparent hover:border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 flex-shrink-0" />
                      <span className="font-medium">{project.name}</span>
                      <span className="text-xs text-slate-400">({project.knowledge_count} dokumen)</span>
                    </div>
                    {selectedKBs.includes(project.id) && <CheckCircle2 className="w-4 h-4 text-violet-600 flex-shrink-0" />}
                  </button>
                ))
              )}
            </div>
            {selectedKBs.length > 0 && (
              <p className="text-xs text-emerald-600 mt-1.5 font-medium">{selectedKBs.length} KB dipilih — bot akan query semua ini sekaligus.</p>
            )}
          </div>

          {/* Admin WA */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Nomor Admin WhatsApp</label>
            <input
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
              placeholder="cth: +6281234567890"
              value={adminWA}
              onChange={(e) => setAdminWA(e.target.value)}
            />
            <p className="text-xs text-slate-400 mt-1">Notifikasi hot lead dikirim ke nomor ini.</p>
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-100">
            <div>
              <p className="text-sm font-medium text-slate-700">Status Bot Profile</p>
              <p className="text-xs text-slate-400">Bot nonaktif tidak akan membalas pesan</p>
            </div>
            <button onClick={() => setIsActive(!isActive)} className="flex-shrink-0">
              {isActive ? (
                <ToggleRight className="w-8 h-8 text-emerald-500" />
              ) : (
                <ToggleLeft className="w-8 h-8 text-slate-400" />
              )}
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div className="flex items-center gap-3 p-5 border-t border-slate-100">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-xl text-sm font-semibold hover:from-violet-700 hover:to-purple-700 transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Menyimpan...' : isNew ? 'Buat Profile' : 'Simpan Perubahan'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Delete Confirm Modal ────────────────────────────────────────────────────────

interface DeleteModalProps {
  profile: BotProfile;
  token: string;
  onClose: () => void;
  onDeleted: () => void;
}

const DeleteModal: React.FC<DeleteModalProps> = ({ profile, token, onClose, onDeleted }) => {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      const res = await fetch(`/api/bot-profiles/${profile.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Gagal menghapus');
      onDeleted();
    } catch (err: any) {
      setError(err.message);
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Trash2 className="w-6 h-6 text-red-500" />
        </div>
        <h3 className="text-center font-bold text-slate-800 mb-2">Hapus Bot Profile?</h3>
        <p className="text-center text-sm text-slate-500 mb-2">
          <span className="font-semibold text-slate-700">"{profile.profile_name}"</span> akan dihapus permanen.
        </p>
        {(profile.whatsapp_channel_count + profile.widget_channel_count) > 0 && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-xs mb-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            Profile ini digunakan oleh {profile.whatsapp_channel_count + profile.widget_channel_count} channel. Pindahkan channel tersebut ke profile lain terlebih dahulu.
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs mb-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all">
            Batal
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {deleting ? 'Menghapus...' : 'Ya, Hapus'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Page ──────────────────────────────────────────────────────────────────

const BotProfilesPage: React.FC = () => {
  const { session } = useAuth();
  const { projects } = useProjects();

  const [profiles, setProfiles] = useState<BotProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState<BotProfile | null | undefined>(undefined); // undefined = closed, null = create new
  const [deletingProfile, setDeletingProfile] = useState<BotProfile | null>(null);

  const fetchProfiles = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/bot-profiles', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (json.success) setProfiles(json.data);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const handleSaved = () => {
    setEditingProfile(undefined);
    fetchProfiles();
  };

  const handleDeleted = () => {
    setDeletingProfile(null);
    fetchProfiles();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-sm">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">Bot Profiles</h1>
          </div>
          <p className="text-slate-500 text-sm ml-13">
            Kelola kepribadian AI dan sumber Knowledge Base untuk setiap channel Anda
          </p>
        </div>
        <button
          onClick={() => setEditingProfile(null)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-xl text-sm font-semibold hover:from-violet-700 hover:to-purple-700 transition-all shadow-sm hover:shadow-md flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          Buat Bot Profile Baru
        </button>
      </div>

      {/* Info banner */}
      <div className="bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200 rounded-2xl p-4 mb-6 flex gap-3">
        <Sparkles className="w-5 h-5 text-violet-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-violet-800 mb-0.5">Cara Kerja Bot Profiles</p>
          <p className="text-xs text-violet-700 leading-relaxed">
            Setiap Bot Profile memiliki kepribadian, instruksi, dan daftar Knowledge Base tersendiri.
            Setelah membuat profile, assign nomor WhatsApp atau Widget ke profile tersebut di halaman Integrasi.
            Satu profile bisa digunakan oleh banyak channel.
          </p>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
              <div className="absolute inset-0 rounded-full border-4 border-t-violet-500 animate-spin" />
            </div>
            <p className="text-sm text-slate-400">Memuat Bot Profiles...</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && profiles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
            <Bot className="w-10 h-10 text-slate-300" />
          </div>
          <h3 className="text-lg font-semibold text-slate-600 mb-2">Belum ada Bot Profile</h3>
          <p className="text-sm text-slate-400 mb-6 max-w-sm">
            Buat Bot Profile pertama Anda dan pilih Knowledge Base yang akan digunakan.
          </p>
          <button
            onClick={() => setEditingProfile(null)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-xl text-sm font-semibold hover:from-violet-700 hover:to-purple-700 transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Buat Bot Profile Pertama
          </button>
        </div>
      )}

      {/* Profile grid */}
      {!loading && profiles.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {profiles.map((profile, idx) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              colorClass={PROFILE_COLORS[idx % PROFILE_COLORS.length]}
              projects={projects}
              onEdit={(p) => setEditingProfile(p)}
              onDelete={(p) => setDeletingProfile(p)}
            />
          ))}

          {/* Add new card */}
          <button
            onClick={() => setEditingProfile(null)}
            className="border-2 border-dashed border-slate-200 rounded-2xl p-5 flex flex-col items-center justify-center gap-3 text-slate-400 hover:border-violet-300 hover:text-violet-500 hover:bg-violet-50/50 transition-all group min-h-[200px]"
          >
            <div className="w-12 h-12 rounded-full bg-slate-100 group-hover:bg-violet-100 flex items-center justify-center transition-colors">
              <Plus className="w-6 h-6" />
            </div>
            <span className="text-sm font-medium">Tambah Bot Profile</span>
          </button>
        </div>
      )}

      {/* Edit/Create Modal */}
      {editingProfile !== undefined && (
        <ProfileModal
          profile={editingProfile}
          projects={projects}
          token={session?.access_token ?? ''}
          onClose={() => setEditingProfile(undefined)}
          onSaved={handleSaved}
        />
      )}

      {/* Delete Modal */}
      {deletingProfile && (
        <DeleteModal
          profile={deletingProfile}
          token={session?.access_token ?? ''}
          onClose={() => setDeletingProfile(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
};

export default BotProfilesPage;
