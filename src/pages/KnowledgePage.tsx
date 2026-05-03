import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
// ... existing imports ...
import {
  Search,
  Plus,
  Eye,
  Clock,
  Tag,
  FileText,
  BookOpen,
  ChevronRight,
  Edit3,
  Trash2,
  Upload,
} from 'lucide-react';
import type { KnowledgeArticle } from '../types';
import IngestModal from '../components/IngestModal';

const categoryColors: Record<string, string> = {
  Onboarding: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Bot Settings': 'bg-blue-50 text-blue-700 border-blue-200',
  Integrations: 'bg-violet-50 text-violet-700 border-violet-200',
  Analytics: 'bg-amber-50 text-amber-700 border-amber-200',
};

const statusColors = {
  published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  draft: 'bg-slate-100 text-slate-500 border-slate-200',
};

const KnowledgePage: React.FC = () => {
  const { session } = useAuth();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchKnowledge = useCallback(() => {
    setLoading(true);
    fetch('/api/knowledge', {
      headers: {
        'Authorization': `Bearer ${session?.access_token}`
      }
    })
      .then((res) => res.json())
      .then((res) => {
        if (res.success && res.data) {
          const mappedArticles: KnowledgeArticle[] = res.data.map((dbNode: any) => ({
            id: dbNode.id,
            title: dbNode.title,
            category: dbNode.source_type === 'pdf' ? 'Onboarding' : 'Integrations',
            views: dbNode.chunks || 0, // Using chunks as mock views
            lastUpdated: dbNode.created_at,
            status: 'published',
          }));
          setArticles(mappedArticles);
        }
      })
      .catch((err) => console.error('Failed to fetch knowledge nodes', err))
      .finally(() => setLoading(false));
  }, [session]);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document? All associated AI knowledge will be removed.')) return;

    try {
      const response = await fetch(`/api/knowledge/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });
      const data = await response.json();
      if (data.success) {
        fetchKnowledge();
      } else {
        alert(data.message || 'Failed to delete document');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('An error occurred while deleting the document.');
    }
  };

  useEffect(() => {
    fetchKnowledge();
  }, [fetchKnowledge]);

  const filtered = articles.filter((a: KnowledgeArticle) => {
    const matchSearch =
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.category.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || a.status === filter;
    return matchSearch && matchFilter;
  });

  const categories = Array.from(new Set(articles.map((a) => a.category)));

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-500 flex items-center justify-center">
            <BookOpen size={16} className="text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 leading-tight">Basis Pengetahuan</h2>
            <p className="text-xs text-slate-500">{loading ? 'Memuat...' : `${articles.length} total dokumen`}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="kb-add-source"
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl shadow-sm shadow-emerald-500/30 transition-all duration-150 active:scale-95"
          >
            <Upload size={15} />
            Tambah Sumber
          </button>
          <button
            id="kb-new-article"
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all"
          >
            <Plus size={15} />
            Artikel Baru
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {categories.map((cat) => {
          const count = articles.filter((a) => a.category === cat).length;
          const totalViews = articles
            .filter((a) => a.category === cat)
            .reduce((s, a) => s + a.views, 0);
          return (
            <div key={cat} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm hover:shadow-md transition-all">
              <div className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border mb-2 ${categoryColors[cat] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                <Tag size={10} />
                {cat}
              </div>
              <p className="text-xl font-bold text-slate-900">{count}</p>
              <p className="text-xs text-slate-400">{totalViews.toLocaleString()} kunjungan</p>
            </div>
          );
        })}
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="kb-search"
            type="text"
            placeholder="Cari artikel berdasarkan judul atau kategori..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 transition-all"
          />
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          {([{ key: 'all', label: 'Semua' }, { key: 'published', label: 'Terbit' }, { key: 'draft', label: 'Draf' }] as const).map((f) => (
            <button
              key={f.key}
              id={`kb-filter-${f.key}`}
              onClick={() => setFilter(f.key as any)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                filter === f.key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Articles Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Artikel
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">
                  Kategori
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">
                  Kunjungan
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">
                  Pembaruan Terakhir
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((article) => (
                <tr
                  key={article.id}
                  className="hover:bg-slate-50/50 transition-colors group"
                >
                  <td className="py-4 px-4">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <FileText size={14} className="text-slate-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900 group-hover:text-emerald-600 transition-colors leading-tight">
                          {article.title}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1 md:hidden">
                          <Tag size={9} />
                          {article.category}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4 hidden md:table-cell">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${categoryColors[article.category] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      {article.category}
                    </span>
                  </td>
                  <td className="py-4 px-4 hidden lg:table-cell">
                    <div className="flex items-center gap-1 text-sm text-slate-600">
                      <Eye size={13} className="text-slate-400" />
                      {article.views.toLocaleString()}
                    </div>
                  </td>
                  <td className="py-4 px-4 hidden lg:table-cell">
                    <div className="flex items-center gap-1 text-sm text-slate-500">
                      <Clock size={13} className="text-slate-400" />
                      {new Date(article.lastUpdated).toLocaleDateString('id-ID', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border capitalize ${statusColors[article.status]}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${article.status === 'published' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      {article.status === 'published' ? 'Terbit' : 'Draf'}
                    </span>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex items-center justify-end gap-1">
                      <button className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all">
                        <Edit3 size={14} />
                      </button>
                      <button className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
                        <ChevronRight size={14} />
                      </button>
                      <button 
                        onClick={() => handleDelete(article.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                        title="Hapus sumber"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-16 text-slate-400">
              <BookOpen size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Dokumen tidak ditemukan</p>
              <p className="text-xs mt-1">Coba cari dengan kata kunci atau filter lain</p>
            </div>
          )}
        </div>
      </div>

      <IngestModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => {
          fetchKnowledge();
        }}
      />
    </div>
  );
};

export default KnowledgePage;
