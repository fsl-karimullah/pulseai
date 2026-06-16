import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  Search,
  Clock,
  Tag,
  FileText,
  BookOpen,
  Trash2,
  Upload,
  Eye,
  FileCheck,
  XCircle,
  Info,
  X,
} from 'lucide-react';
import type { KnowledgeArticle } from '../types';
import IngestModal from '../components/IngestModal';

// ── Module-level cache to prevent re-fetching on tab switch ───────────────
const knowledgeCache: { data: KnowledgeArticle[]; timestamp: number } = { data: [], timestamp: 0 };
const CACHE_TTL_MS = 30_000; // 30 seconds

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
  const [showGuide, setShowGuide] = useState(false);
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchKnowledge = useCallback((force = false) => {
    const now = Date.now();
    if (!force && knowledgeCache.data.length > 0 && (now - knowledgeCache.timestamp) < CACHE_TTL_MS) {
      setArticles(knowledgeCache.data);
      setLoading(false);
      return;
    }
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
            views: dbNode.chunks || 0,
            lastUpdated: dbNode.created_at,
            status: 'published',
          }));
          knowledgeCache.data = mappedArticles;
          knowledgeCache.timestamp = Date.now();
          setArticles(mappedArticles);
        }
      })
      .catch((err) => console.error('Failed to fetch knowledge nodes', err))
      .finally(() => setLoading(false));
  }, [session]);

  const handleDelete = async (id: string) => {
    if (!confirm('Yakin ingin menghapus dokumen ini? Semua pengetahuan AI terkait akan dihapus.')) return;
    try {
      const response = await fetch(`/api/knowledge/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      });
      const data = await response.json();
      if (data.success) {
        knowledgeCache.timestamp = 0; // Invalidate cache after delete
        fetchKnowledge(true);
      } else {
        alert(data.message || 'Gagal menghapus dokumen');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Terjadi kesalahan saat menghapus dokumen.');
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
          <div className="absolute inset-0 rounded-full border-4 border-t-emerald-500 animate-spin" />
        </div>
        <p className="text-sm font-medium text-slate-500">Memuat basis pengetahuan...</p>
      </div>
    );
  }

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
            onClick={() => setShowGuide(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:border-emerald-500 hover:text-emerald-600 text-slate-600 text-sm font-semibold rounded-xl transition-all duration-150 active:scale-95"
          >
            <Info size={15} />
            Panduan Dokumen
          </button>
          <button
            id="kb-add-source"
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl shadow-sm shadow-emerald-500/30 transition-all duration-150 active:scale-95"
          >
            <Upload size={15} />
            Tambah PDF
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
                    <div className="flex items-center justify-end">
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

      {/* Guide Modal Overlay */}
      {showGuide && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={(e) => { e.stopPropagation(); setShowGuide(false); }}>
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden font-sans flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()} style={{ animation: 'modalIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/80 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-sm">
                  <FileCheck size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Panduan Optimasi Dokumen</h3>
                  <p className="text-[12px] text-slate-500 font-medium mt-0.5">Agar asisten AI memberikan informasi akurat</p>
                </div>
              </div>
              <button onClick={() => setShowGuide(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              <p className="text-sm text-slate-600 leading-relaxed bg-blue-50/50 p-4 rounded-xl border border-blue-100/50">
                Mohon perhatikan ketentuan dokumen berikut agar proses "pembelajaran" AI berjalan optimal dan menghasilkan jawaban yang presisi.
              </p>

              {/* Section 1 */}
              <div>
                <h4 className="text-sm font-bold text-emerald-700 flex items-center gap-2 mb-3">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 text-xs">1</span>
                  Format Teks Digital (Wajib)
                </h4>
                <ul className="space-y-3 ml-2 border-l-2 border-emerald-50 pl-4">
                  <li className="text-sm text-slate-600 leading-relaxed"><strong className="text-slate-800">Gunakan PDF Berbasis Teks:</strong> Pastikan PDF bukan hasil foto/scan gambar. AI lebih mudah membaca teks digital langsung dari file Microsoft Word atau Canva yang di-export ke PDF.</li>
                  <li className="text-sm text-slate-600 leading-relaxed"><strong className="text-slate-800">Hindari Tulisan Tangan:</strong> Sistem tidak disarankan untuk membaca tulisan tangan karena risiko kesalahan interpretasi informasi sangat tinggi.</li>
                </ul>
              </div>

              {/* Section 2 */}
              <div>
                <h4 className="text-sm font-bold text-emerald-700 flex items-center gap-2 mb-3">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 text-xs">2</span>
                  Struktur Informasi yang Jelas
                </h4>
                <ul className="space-y-3 ml-2 border-l-2 border-emerald-50 pl-4">
                  <li className="text-sm text-slate-600 leading-relaxed"><strong className="text-slate-800">Gunakan Judul & Sub-Judul:</strong> Kelompokkan informasi berdasarkan kategori (Contoh: Daftar Menu, Cara Pemesanan, Lokasi Cabang).</li>
                  <li className="text-sm text-slate-600 leading-relaxed"><strong className="text-slate-800">Gunakan Poin (Bullet Points):</strong> Informasi dalam bentuk daftar jauh lebih mudah dipahami oleh sistem dibandingkan paragraf panjang yang berbelit-belit.</li>
                  <li className="text-sm text-slate-600 leading-relaxed"><strong className="text-slate-800">Format Tabel Sederhana:</strong> Jika ada daftar harga, gunakan tabel yang bersih dan tidak terlalu kompleks secara desain.</li>
                </ul>
              </div>

              {/* Section 3 */}
              <div>
                <h4 className="text-sm font-bold text-emerald-700 flex items-center gap-2 mb-3">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 text-xs">3</span>
                  Fokus pada Konten Relevan
                </h4>
                <ul className="space-y-3 ml-2 border-l-2 border-emerald-50 pl-4">
                  <li className="text-sm text-slate-600 leading-relaxed"><strong className="text-slate-800">Hapus Informasi Tidak Penting:</strong> Hilangkan gambar dekoratif besar, header/footer berulang, atau iklan tidak relevan agar memori AI fokus pada data inti.</li>
                  <li className="text-sm text-slate-600 leading-relaxed"><strong className="text-slate-800">Satu Dokumen, Satu Topik:</strong> Lebih baik mengunggah 3 dokumen spesifik (Menu, SOP, Kontak) daripada 1 dokumen raksasa yang mencampuradukkan semua hal.</li>
                </ul>
              </div>

              {/* Section 4 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Ukuran File Maksimal</p>
                  <p className="text-sm font-bold text-slate-800">4MB (Free) / 50MB (Pro)</p>
                  <p className="text-xs text-slate-500 mt-1">Upgrade untuk dokumen lebih besar</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Bahasa Konsisten</p>
                  <p className="text-sm font-bold text-slate-800">Indonesia atau Inggris</p>
                  <p className="text-xs text-slate-500 mt-1">Hindari mencampur bahasa berlebihan</p>
                </div>
              </div>

              {/* DON'Ts Section */}
              <div className="bg-red-50/50 rounded-xl p-5 border border-red-100">
                <h4 className="text-[11px] font-bold text-red-600 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <XCircle size={14} />
                  Yang Harus Dihindari (Don'ts)
                </h4>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <div className="mt-0.5 w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                      <XCircle size={12} className="text-red-600" />
                    </div>
                    <span className="text-sm text-slate-700 leading-relaxed"><strong className="text-slate-900">PDF Diproteksi Password:</strong> Sistem tidak akan bisa membaca dokumen jika file terkunci.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="mt-0.5 w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <XCircle size={12} className="text-amber-600" />
                    </div>
                    <span className="text-sm text-slate-700 leading-relaxed"><strong className="text-slate-900">Teks Terlalu Kecil:</strong> Gunakan ukuran font standar (minimal 10pt) agar karakter terbaca sempurna.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="mt-0.5 w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <XCircle size={12} className="text-amber-600" />
                    </div>
                    <span className="text-sm text-slate-700 leading-relaxed"><strong className="text-slate-900">Gambar Tanpa Deskripsi:</strong> Jika ada gambar penting (misal: Denah Lokasi), pastikan ada penjelasan teks di bawahnya.</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-white flex-shrink-0">
              <button 
                onClick={() => setShowGuide(false)}
                className="w-full sm:w-auto sm:min-w-[120px] sm:ml-auto block py-2.5 px-6 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-500/20 active:scale-[0.98] text-center"
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgePage;
