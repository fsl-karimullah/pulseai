import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOrganization } from '../hooks/useOrganization';
import { Users, Search, Edit2, Trash2, MessageCircle, Mail, X, Save, Clock, User } from 'lucide-react';

interface Lead {
  id: string;
  name: string;
  whatsapp: string;
  last_message: string | null;
  metadata: any;
  created_at: string;
}


const LeadsPage: React.FC = () => {
  const { session } = useAuth();
  const { organization } = useOrganization();
  
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [currentEdit, setCurrentEdit] = useState<Lead | null>(null);
  const [editName, setEditName] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const fetchLeads = async () => {
    try {
      const res = await fetch('/api/leads', {
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      });
      const data = await res.json();
      if (data.success) {
        setLeads(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch leads', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [organization, session]);

  const handleDelete = async (id: string) => {
    if (!confirm('Yakin ingin menghapus data lead ini?')) return;
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      });
      const data = await res.json();
      if (data.success) {
        setLeads(leads.filter(l => l.id !== id));
      } else {
        alert(data.message || 'Gagal menghapus');
      }
    } catch (err) {
      console.error(err);
    }
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
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ name: editName, whatsapp: editWhatsapp })
      });
      const data = await res.json();
      if (data.success) {
        setLeads(leads.map(l => l.id === currentEdit.id ? { ...l, name: editName, whatsapp: editWhatsapp } : l));
        setEditModalOpen(false);
      } else {
        alert(data.message || 'Gagal menyimpan');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const filtered = leads.filter(l => 
    l.name.toLowerCase().includes(search.toLowerCase()) || 
    l.whatsapp.includes(search)
  );

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginatedLeads = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
            <Users size={20} className="text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 leading-tight">Data Leads</h2>
            <p className="text-xs text-slate-500 mt-0.5">Kelola prospek dan pantau percakapan real-time dengan asisten AI</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Cari nama atau nomor WhatsApp..." 
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center p-12">
              <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Users size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Belum ada data leads</p>
              <p className="text-xs mt-1">Data akan muncul setelah user mengisi form di widget</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-4">Nama Prospek</th>
                  <th className="px-6 py-4">Kontak / Live Chat</th>
                  <th className="px-6 py-4 hidden md:table-cell">Pesan Terakhir</th>
                  <th className="px-6 py-4">Tanggal</th>
                  <th className="px-6 py-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginatedLeads.map(lead => {
                  let cleanWa = lead.whatsapp.replace(/\D/g, '');
                  if (cleanWa.startsWith('0')) cleanWa = '62' + cleanWa.substring(1);
                  const isLid = cleanWa.startsWith('8') && cleanWa.length >= 14;
                  const waLink = `https://wa.me/${cleanWa}`;
                  const email = lead.metadata?.email;
                  const date = new Date(lead.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

                  return (
                    <tr key={lead.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
                            <User size={14} />
                          </div>
                          <span className="font-bold text-slate-900 text-sm">{lead.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          {!isLid ? (
                            <a href={waLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 transition-colors text-xs font-semibold">
                              <MessageCircle size={14} />
                              WhatsApp
                            </a>
                          ) : (
                            <span 
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 text-slate-400 text-xs font-medium cursor-not-allowed select-none" 
                              title="Nomor WhatsApp belum terdeteksi."
                            >
                              <MessageCircle size={14} />
                              WhatsApp (N/A)
                            </span>
                          )}
                          
                          {email && (
                            <a href={`mailto:${email}`} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-700 transition-colors text-xs font-semibold">
                              <Mail size={14} />
                              Email
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell">
                        <p className="text-sm text-slate-600 line-clamp-2 max-w-xs" title={lead.last_message || 'Tidak ada pesan'}>
                          {lead.last_message ? `"${lead.last_message}"` : '-'}
                        </p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500">
                        <div className="flex items-center gap-1.5">
                          <Clock size={12} className="text-slate-400" />
                          {date}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEditModal(lead)} className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="Edit">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => handleDelete(lead.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Hapus">
                            <Trash2 size={16} />
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

        {/* Pagination Controls */}
        {filtered.length > itemsPerPage && (
          <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">
              Menampilkan {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filtered.length)} dari {filtered.length} leads
            </span>
            <div className="flex gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Sebelumnya
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
      </div>

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
              <button onClick={() => setEditModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors">Batal</button>
              <button onClick={handleSaveEdit} disabled={isSaving} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors disabled:opacity-50">
                {isSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={16} />}
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
