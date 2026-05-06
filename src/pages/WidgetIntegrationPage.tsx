import React, { useState } from 'react';
import { useOrganization } from '../hooks/useOrganization';
import { useSubscription } from '../hooks/useSubscription';
import { 
  Copy, 
  Check, 
  Globe, 
  ShieldCheck, 
  Code2, 
  ExternalLink, 
  Loader2,
  Plus,
  X,
  BadgeCheck,
  ShieldAlert
} from 'lucide-react';

const WidgetIntegrationPage: React.FC = () => {
  const { organization, loading, updateDomains } = useOrganization();
  const { subscription } = useSubscription();
  const [copied, setCopied] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const botName = organization?.name || 'Aria';
  const company = 'PulseAI'; 
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const scriptTag = `<script src="${apiBase}/api/widget.js?orgId=${organization?.id}&botName=${encodeURIComponent(botName)}&company=${encodeURIComponent(company)}"></script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(scriptTag);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain || !organization) return;
    
    // Simple domain validation
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(newDomain)) {
      alert('Mohon masukkan domain yang valid (contoh: myshop.com)');
      return;
    }

    if (organization.allowed_domains.includes(newDomain)) {
      setNewDomain('');
      return;
    }

    setIsUpdating(true);
    const updated = [...organization.allowed_domains, newDomain];
    await updateDomains(updated);
    setIsUpdating(false);
    setNewDomain('');
  };

  const handleRemoveDomain = async (domain: string) => {
    if (!organization) return;
    setIsUpdating(true);
    const updated = organization.allowed_domains.filter(d => d !== domain);
    await updateDomains(updated);
    setIsUpdating(false);
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
        <div>
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
              <p className="text-sm text-slate-700 font-medium leading-relaxed">Salin kode snippet di bawah ini.</p>
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

        <div className="p-8">
          <div className="relative group">
            <div className="absolute -top-3 left-4 px-2 py-0.5 bg-slate-900 text-slate-400 text-[10px] font-bold uppercase tracking-widest rounded border border-slate-800">
              Snippet Widget
            </div>
            <div className="bg-slate-900 rounded-2xl p-6 pt-8 font-mono text-sm leading-relaxed border border-slate-800 shadow-inner group-hover:border-slate-700 transition-colors">
              <code className="text-emerald-400 break-all">{scriptTag}</code>
            </div>
            <button
              onClick={handleCopy}
              className={`absolute top-4 right-4 flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-lg ${
                copied 
                ? 'bg-emerald-500 text-white' 
                : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-md border border-white/10'
              }`}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Tersalin!' : 'Salin Kode'}
            </button>
          </div>

          <div className="mt-6 flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck size={14} className="text-emerald-500" />
            Snippet ini unik untuk organisasi Anda dan aman untuk digunakan secara publik.
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
            <Globe size={20} />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Domain Berizin</h2>
        </div>
        <p className="text-slate-500 text-sm mb-8 ml-13">
          Batasi penggunaan chatbot Anda hanya pada domain yang Anda percayai. Ini mencegah orang lain menggunakan chatbot Anda di website mereka tanpa izin.
        </p>

        <div className="space-y-6">
          <form onSubmit={handleAddDomain} className="flex gap-3">
            <input
              type="text"
              placeholder="contoh: myshop.com"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
            <button
              type="submit"
              disabled={isUpdating}
              className="px-6 py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 disabled:opacity-50 flex items-center gap-2"
            >
              {isUpdating ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
              Tambah Domain
            </button>
          </form>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {organization?.allowed_domains.map((domain) => (
              <div 
                key={domain}
                className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200 group hover:border-emerald-200 transition-all"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-emerald-500 transition-colors">
                    <ExternalLink size={14} />
                  </div>
                  <span className="text-sm font-medium text-slate-700 truncate">{domain}</span>
                </div>
                <button 
                  onClick={() => handleRemoveDomain(domain)}
                  className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            ))}
            {organization?.allowed_domains.length === 0 && (
              <div className="col-span-full py-12 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-3xl">
                <Globe className="text-slate-200 mb-3" size={40} />
                <p className="text-slate-400 text-sm">Belum ada domain yang didaftarkan.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WidgetIntegrationPage;
