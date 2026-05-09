import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOrganization } from '../hooks/useOrganization';
import {
  Settings2,
  Save,
  RotateCcw,
  Bot,
  ToggleLeft,
  ToggleRight,
  CheckCircle2,
  Code2,
  Copy,
  Loader2
} from 'lucide-react';
import type { BotSetting } from '../types';

const BotSettingsPage: React.FC = () => {
  const { session } = useAuth();
  const { organization, updateName } = useOrganization();
  const [settings, setSettings] = useState<BotSetting[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/settings/bot', {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });
      const json = await res.json();
      
      if (json.success && json.data) {
        const d = json.data;
        const mappedSettings: BotSetting[] = [
          {
            id: 'bot-name',
            label: 'Nama Bot',
            description: 'Bagaimana AI mengidentifikasi dirinya dalam percakapan.',
            type: 'input',
            value: d.bot_name
          },
          {
            id: 'is-active',
            label: 'Status Bot',
            description: 'Aktifkan atau nonaktifkan asisten AI secara global.',
            type: 'toggle',
            value: d.is_active
          },
          {
            id: 'color-theme',
            label: 'Warna Tema Utama',
            description: 'Warna brand untuk widget chat dan antarmuka.',
            type: 'input',
            value: d.color_theme || '#10b981'
          },
          {
            id: 'logo-url',
            label: 'Logo Avatar Bot (URL)',
            description: 'Link langsung ke gambar logo perusahaan atau bot Anda.',
            type: 'input',
            value: d.logo_url || ''
          },
          {
            id: 'tone',
            label: 'Nada Percakapan',
            description: 'Kepribadian dan gaya bahasa dalam memberikan respons.',
            type: 'select',
            value: d.tone,
            options: ['Profesional', 'Ramah', 'Singkat', 'Jenaka']
          },
          {
            id: 'collect-leads',
            label: 'Pengumpulan Lead Otomatis',
            description: 'Minta informasi kontak jika pengguna terlihat tertarik.',
            type: 'toggle',
            value: d.collect_leads
          },
          {
            id: 'custom-instructions',
            label: 'Instruksi Dasar Kustom',
            description: 'Prompt global yang memandu setiap respons bot.',
            type: 'input',
            value: d.custom_instructions || ''
          },
          {
            id: 'admin-whatsapp',
            label: 'Nomor WhatsApp Admin',
            description: 'Nomor yang akan dihubungi jika AI tidak bisa menjawab atau saat diminta admin (contoh: +628123...)',
            type: 'input',
            value: d.admin_whatsapp || ''
          }
        ];
        setSettings(mappedSettings);
      }
    } catch (err) {
      console.error('Gagal mengambil pengaturan:', err);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (organization?.name) {
      setCompanyName(organization.name);
    }
  }, [organization]);

  const updateSetting = (id: string, value: BotSetting['value']) => {
    setSettings((prev) => prev.map((s) => (s.id === id ? { ...s, value } : s)));
    setSaved(false);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      // Map back to DB structure
      const body: any = {};
      settings.forEach(s => {
        if (s.id === 'bot-name') body.bot_name = s.value;
        if (s.id === 'is-active') body.is_active = s.value;
        if (s.id === 'color-theme') body.color_theme = s.value;
        if (s.id === 'logo-url') body.logo_url = s.value;
        if (s.id === 'tone') body.tone = s.value;
        if (s.id === 'collect-leads') body.collect_leads = s.value;
        if (s.id === 'custom-instructions') body.custom_instructions = s.value;
        if (s.id === 'admin-whatsapp') body.admin_whatsapp = s.value;
      });

      const res = await fetch('/api/settings/bot', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify(body)
      });

      const json = await res.json();
      
      // Save organization name
      if (companyName && companyName !== organization?.name) {
        await updateName(companyName);
      }

      if (json.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } catch (err) {
      console.error('Kesalahan simpan:', err);
      alert('Gagal menyimpan pengaturan');
    } finally {
      setSaving(false);
    }
  };

  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const botName = String(settings.find((s) => s.id === 'bot-name')?.value ?? 'Aria');
  const company = 'PulseAI';

  const handleCopyCode = () => {
    const scriptTag = `<script src="${apiBase}/api/widget.js?orgId=${organization?.id}&botName=${encodeURIComponent(botName)}&company=${encodeURIComponent(company)}"></script>`;
    navigator.clipboard.writeText(scriptTag);
    alert('Kode embed berhasil disalin!');
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
          <div className="absolute inset-0 rounded-full border-4 border-t-violet-500 animate-spin" />
        </div>
        <p className="text-sm font-medium text-slate-500">Memuat konfigurasi bot...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-violet-500 flex items-center justify-center">
            <Settings2 size={16} className="text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 leading-tight">Pengaturan Bot</h2>
            <p className="text-xs text-slate-500">Konfigurasi perilaku asisten AI Anda</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="bot-reset"
            onClick={fetchSettings}
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 font-medium rounded-xl border border-slate-200 hover:bg-slate-50 transition-all"
          >
            <RotateCcw size={14} />
            Reset
          </button>
          <button
            id="bot-save"
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl shadow-sm transition-all duration-150 active:scale-95 ${
              saved
                ? 'bg-emerald-500 text-white shadow-emerald-500/30'
                : 'bg-slate-900 text-white hover:bg-slate-800 shadow-slate-900/20'
            } ${saving ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {saving ? <Loader2 className="animate-spin" size={14} /> : (saved ? <CheckCircle2 size={14} /> : <Save size={14} />)}
            {saved ? 'Tersimpan!' : (saving ? 'Menyimpan...' : 'Simpan Perubahan')}
          </button>
        </div>
      </div>

      {/* Bot Preview Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 p-5 border border-slate-700">
        <div className="absolute inset-0 bg-gradient-to-r from-violet-600/15 to-transparent" />
        <div className="relative flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg flex-shrink-0 overflow-hidden">
            {settings.find(s => s.id === 'logo-url')?.value ? (
              <img 
                src={String(settings.find(s => s.id === 'logo-url')?.value)} 
                alt="Logo Bot" 
                className="w-full h-full object-cover"
              />
            ) : (
              <Bot size={26} className="text-white" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Bot yang aktif saat ini</p>
                <h3 className="text-lg font-bold text-white">
                  {String(settings.find((s) => s.id === 'bot-name')?.value ?? 'Aria')}
                </h3>
              </div>
              <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${settings.find(s => s.id === 'is-active')?.value ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-700 text-slate-400'}`}>
                {settings.find(s => s.id === 'is-active')?.value ? 'Aktif' : 'Tidak Aktif'}
              </div>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                Online
              </span>
              <span className="text-xs text-slate-500">
                Model: {String(settings.find((s) => s.id === 'ai-model')?.value ?? 'Gemini 1.5 Flash')}
              </span>
              <span className="text-xs text-slate-500">
                Nada: {String(settings.find((s) => s.id === 'tone')?.value ?? 'Profesional')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {settings.map((setting) => (
          <div
            key={setting.id}
            id={`setting-${setting.id}`}
            className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900">{setting.label}</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{setting.description}</p>
              </div>

              {/* Toggle */}
              {setting.type === 'toggle' && (
                <button
                  onClick={() => updateSetting(setting.id, !setting.value)}
                  className={`flex-shrink-0 transition-colors duration-200 ${
                    setting.value ? 'text-emerald-500' : 'text-slate-300'
                  }`}
                >
                  {setting.value ? (
                    <ToggleRight size={36} />
                  ) : (
                    <ToggleLeft size={36} />
                  )}
                </button>
              )}
            </div>

            {/* Input */}
            {setting.type === 'input' && (
              <div className="mt-3 relative">
                {setting.id === 'color-theme' && (
                  <div 
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md border border-slate-200 shadow-sm"
                    style={{ backgroundColor: String(setting.value) }}
                  />
                )}
                {setting.id === 'custom-instructions' ? (
                  <textarea
                    rows={3}
                    value={String(setting.value)}
                    onChange={(e) => updateSetting(setting.id, e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 transition-all resize-none"
                    placeholder="contoh: Anda adalah asisten penjualan yang ramah untuk PulseAI..."
                  />
                ) : (
                  <input
                    type="text"
                    value={String(setting.value)}
                    onChange={(e) => updateSetting(setting.id, e.target.value)}
                    className={`w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 transition-all ${setting.id === 'color-theme' ? 'pr-10' : ''}`}
                  />
                )}
              </div>
            )}

            {/* Select */}
            {setting.type === 'select' && (
              <div className="mt-3 relative">
                <select
                  value={String(setting.value)}
                  onChange={(e) => updateSetting(setting.id, e.target.value)}
                  className="w-full appearance-none px-3 py-2.5 pr-9 text-sm border border-slate-200 rounded-xl text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 transition-all cursor-pointer"
                >
                  {setting.options?.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <svg className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Company Info */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center border border-slate-200">
            <Bot size={18} className="text-slate-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Informasi Perusahaan</h3>
            <p className="text-xs text-slate-500 mt-0.5">Nama ini akan muncul di greeting awal widget chat.</p>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Nama Perusahaan</label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Contoh: PulseAI"
            className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 transition-all"
          />
        </div>
      </div>

      {/* Integration Code */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm mt-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center border border-slate-200">
            <Code2 size={18} className="text-slate-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Pasang di website Anda</h3>
            <p className="text-xs text-slate-500 mt-0.5">Salin dan tempel tag script ini tepat sebelum penutup tag &lt;/body&gt; di website Anda.</p>
          </div>
        </div>
        
        <div className="relative">
          <div className="bg-slate-900 rounded-xl p-4 pr-12 overflow-x-auto">
            <code className="text-xs text-emerald-400 whitespace-nowrap font-mono">
              &lt;script src="{apiBase}/api/widget.js?orgId={organization?.id}&amp;botName={encodeURIComponent(String(settings.find((s) => s.id === 'bot-name')?.value ?? 'Aria'))}&amp;company={encodeURIComponent(company)}"&gt;&lt;/script&gt;
            </code>
          </div>
          <button 
            onClick={handleCopyCode}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            title="Salin ke papan klip"
          >
            <Copy size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default BotSettingsPage;
