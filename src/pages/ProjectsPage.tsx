import React, { useState } from 'react';
import {
  FolderKanban,
  Plus,
  BookOpen,
  MessageCircle,
  Monitor,
  Pencil,
  Trash2,
  CheckCircle2,
  X,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useProjects, type Project } from '../contexts/ProjectContext';

const ProjectsPage: React.FC = () => {
  const { projects, loading, activeProjectId, setActiveProjectId, createProject, renameProject, deleteProject } = useProjects();

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [renaming, setRenaming] = useState<Project | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState('');

  const [deleting, setDeleting] = useState<Project | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError('');
    const res = await createProject(newName.trim());
    setCreating(false);
    if (res.success) {
      setCreateOpen(false);
      setNewName('');
    } else {
      setCreateError(res.error || 'Gagal membuat project');
    }
  };

  const handleRename = async () => {
    if (!renaming || !renameValue.trim()) return;
    setRenameSaving(true);
    setRenameError('');
    const res = await renameProject(renaming.id, renameValue.trim());
    setRenameSaving(false);
    if (res.success) {
      setRenaming(null);
    } else {
      setRenameError(res.error || 'Gagal mengubah nama project');
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteSaving(true);
    setDeleteError('');
    const res = await deleteProject(deleting.id);
    setDeleteSaving(false);
    if (res.success) {
      setDeleting(null);
    } else {
      setDeleteError(res.error || 'Gagal menghapus project');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
          <div className="absolute inset-0 rounded-full border-4 border-t-emerald-500 animate-spin" />
        </div>
        <p className="text-sm font-medium text-slate-500">Memuat daftar project...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-violet-500 flex items-center justify-center">
            <FolderKanban size={16} className="text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 leading-tight">Projects</h2>
            <p className="text-xs text-slate-500">{projects.length} project — kelompokkan Knowledge Base &amp; channel per bisnis/cabang</p>
          </div>
        </div>
        <button
          onClick={() => { setCreateOpen(true); setNewName(''); setCreateError(''); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl shadow-sm shadow-emerald-500/30 transition-all duration-150 active:scale-95"
        >
          <Plus size={15} />
          Project Baru
        </button>
      </div>

      {/* Project Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((p) => {
          const isActive = p.id === activeProjectId;
          return (
            <div
              key={p.id}
              className={`bg-white rounded-3xl border shadow-sm p-5 flex flex-col gap-4 transition-all ${
                isActive ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900 truncate">{p.name}</h3>
                    {isActive && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200 flex-shrink-0">
                        <CheckCircle2 size={10} />
                        Aktif
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Dibuat {new Date(p.created_at).toLocaleDateString('id-ID', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => { setRenaming(p); setRenameValue(p.name); setRenameError(''); }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                    title="Ubah nama"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => { setDeleting(p); setDeleteError(''); }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                    title="Hapus project"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-center">
                  <BookOpen size={14} className="mx-auto text-blue-500 mb-1" />
                  <p className="text-sm font-bold text-slate-900">{p.knowledge_count}</p>
                  <p className="text-[10px] text-slate-400">KB</p>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-center">
                  <MessageCircle size={14} className="mx-auto text-emerald-500 mb-1" />
                  <p className="text-sm font-bold text-slate-900">{p.whatsapp_count}</p>
                  <p className="text-[10px] text-slate-400">WhatsApp</p>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-center">
                  <Monitor size={14} className="mx-auto text-violet-500 mb-1" />
                  <p className="text-sm font-bold text-slate-900">{p.widget_count}</p>
                  <p className="text-[10px] text-slate-400">Widget</p>
                </div>
              </div>

              <button
                onClick={() => setActiveProjectId(p.id)}
                disabled={isActive}
                className={`w-full py-2.5 text-sm font-semibold rounded-xl transition-all active:scale-[0.98] ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-600 cursor-default'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                {isActive ? 'Sedang Aktif' : 'Jadikan Aktif'}
              </button>
            </div>
          );
        })}
      </div>

      {projects.length === 0 && (
        <div className="text-center py-16 text-slate-400 bg-white rounded-2xl border border-slate-100">
          <FolderKanban size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">Belum ada project</p>
          <p className="text-xs mt-1">Buat project pertama untuk mulai mengelompokkan Knowledge Base &amp; channel</p>
        </div>
      )}

      {/* Create Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && !creating && setCreateOpen(false)}>
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Project Baru</h3>
              <button onClick={() => !creating && setCreateOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nama Project</label>
                <input
                  type="text"
                  autoFocus
                  placeholder="contoh: Cabang Bandung"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
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
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
                className="w-full py-3 text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-xl shadow-sm shadow-emerald-500/30 transition-all active:scale-[0.98]"
              >
                {creating ? (
                  <span className="flex items-center justify-center gap-2"><Loader2 size={15} className="animate-spin" /> Membuat...</span>
                ) : 'Buat Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renaming && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && !renameSaving && setRenaming(null)}>
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Ubah Nama Project</h3>
              <button onClick={() => !renameSaving && setRenaming(null)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <input
                type="text"
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                disabled={renameSaving}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 disabled:opacity-50 transition-all"
              />
              {renameError && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100">
                  <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 leading-relaxed">{renameError}</p>
                </div>
              )}
              <button
                onClick={handleRename}
                disabled={!renameValue.trim() || renameSaving}
                className="w-full py-3 text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-xl shadow-sm shadow-emerald-500/30 transition-all active:scale-[0.98]"
              >
                {renameSaving ? (
                  <span className="flex items-center justify-center gap-2"><Loader2 size={15} className="animate-spin" /> Menyimpan...</span>
                ) : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleting && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && !deleteSaving && setDeleting(null)}>
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={28} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Hapus "{deleting.name}"?</h3>
              <p className="text-sm text-slate-500 mb-4">
                Tindakan ini tidak bisa dibatalkan. Project hanya bisa dihapus jika sudah tidak berisi Knowledge Base atau channel apapun.
              </p>
              {deleteError && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 mb-4 text-left">
                  <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 leading-relaxed">{deleteError}</p>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleting(null)}
                  disabled={deleteSaving}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteSaving}
                  className="flex-1 px-4 py-3 bg-red-600 text-white font-bold rounded-2xl hover:bg-red-700 transition-all shadow-lg shadow-red-200 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deleteSaving && <Loader2 size={15} className="animate-spin" />}
                  Ya, Hapus
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectsPage;
