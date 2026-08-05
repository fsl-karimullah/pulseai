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
  Loader2,
  PanelRightClose,
  PanelLeftClose,
  Plus,
  X,
  Send,
  MessageSquareText,
} from 'lucide-react';
import type { BotSetting } from '../types';

const BotSettingsPage: React.FC = () => {
  const { session } = useAuth();
  const { organization, updateName, updateReplyToEmail } = useOrganization();
  const [settings, setSettings] = useState<BotSetting[]>([]);
  const [widgetPlacement, setWidgetPlacement] = useState<'bottom-right' | 'bottom-left'>('bottom-right');
  const [companyName, setCompanyName] = useState('');
  const [replyToEmail, setReplyToEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [newQuickReply, setNewQuickReply] = useState('');

  // ── Proactive & Follow-up state ───────────────────────────────────────────
  const [proactiveDelay, setProactiveDelay] = useState<number>(0);
  const [followupDelay, setFollowupDelay] = useState<number>(0);

  // ── Telegram state ────────────────────────────────────────────────────────
  const [tgBotToken, setTgBotToken]   = useState('');
  const [tgChatId, setTgChatId]       = useState('');
  const [tgMasked, setTgMasked]       = useState('');
  const [tgHasToken, setTgHasToken]   = useState(false);
  const [tgTesting, setTgTesting]     = useState(false);
  const [tgSaving, setTgSaving]       = useState(false);
  const [tgStatus, setTgStatus]       = useState<{ ok: boolean; msg: string } | null>(null);

  const adminWhatsAppVal = String(settings.find((s) => s.id === 'admin-whatsapp')?.value ?? '').trim();
  const hasWhatsAppError = adminWhatsAppVal.startsWith('08') || adminWhatsAppVal.startsWith('0') || adminWhatsAppVal.startsWith('+0');

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
        setWidgetPlacement(d.widget_placement || 'bottom-right');
        if (Array.isArray(d.quick_replies)) {
          setQuickReplies(d.quick_replies);
        }
        setProactiveDelay(d.proactive_delay || 0);
        setFollowupDelay(d.followup_delay || 0);
      }

      // ── Fetch Telegram config ────────────────────────
      const tgRes = await fetch('/api/telegram/config', {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });
      const tgJson = await tgRes.json();
      if (tgJson.success && tgJson.data) {
        setTgHasToken(tgJson.data.hasBotToken);
        setTgMasked(tgJson.data.maskedToken);
        setTgChatId(tgJson.data.chatId);
        // Don't set tgBotToken, keep it empty to show placeholder.
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
    setReplyToEmail(organization?.reply_to_email || '');
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
      body.widget_placement = widgetPlacement;
      body.quick_replies = quickReplies;
      body.proactive_delay = proactiveDelay;
      body.followup_delay = followupDelay;

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
      // Save reply-to email (candidate replies route here instead of noreply@)
      if (replyToEmail !== (organization?.reply_to_email || '')) {
        await updateReplyToEmail(replyToEmail.trim());
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

  // ── Handlers untuk Quick Replies ───────────────────────────────────────────
  const addQuickReply = () => {
    const trimmed = newQuickReply.trim();
    if (trimmed && quickReplies.length < 6 && trimmed.length <= 40) {
      setQuickReplies([...quickReplies, trimmed]);
      setNewQuickReply('');
      setSaved(false);
    }
  };

  const removeQuickReply = (index: number) => {
    setQuickReplies(quickReplies.filter((_, i) => i !== index));
    setSaved(false);
  };

  // ── Handlers untuk Telegram ────────────────────────────────────────────────
  const handleSaveTelegram = async () => {
    try {
      setTgSaving(true);
      setTgStatus(null);
      const res = await fetch('/api/telegram/save', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ botToken: tgBotToken, chatId: tgChatId })
      });
      const json = await res.json();
      if (json.success) {
        setTgStatus({ ok: true, msg: 'Konfigurasi Telegram tersimpan.' });
        if (tgBotToken) {
          setTgHasToken(true);
          setTgMasked('••••••••••' + tgBotToken.slice(-6));
          setTgBotToken('');
        }
      } else {
        setTgStatus({ ok: false, msg: json.message || 'Gagal menyimpan Telegram.' });
      }
    } catch (err: any) {
      setTgStatus({ ok: false, msg: err.message || 'Terjadi kesalahan.' });
    } finally {
      setTgSaving(false);
    }
  };

  const handleTestTelegram = async () => {
    try {
      setTgTesting(true);
      setTgStatus(null);
      // Peringatan jika belum simpan token baru: test butuh token yang diinput (kalau ada) atau yang sudah tersimpan
      if (!tgHasToken && !tgBotToken) {
        setTgStatus({ ok: false, msg: 'Masukkan Bot Token terlebih dahulu.' });
        setTgTesting(false);
        return;
      }
      if (!tgChatId) {
        setTgStatus({ ok: false, msg: 'Masukkan Chat ID terlebih dahulu.' });
        setTgTesting(false);
        return;
      }

      // We only pass botToken to test if user entered a new one, otherwise server uses saved? No, test endpoint expects it directly so we should pass what we have. Wait, the test endpoint takes botToken and chatId from body.
      // Actually, if we just pass tgBotToken (which might be empty if we rely on masked), we can't test unless we fetch the real token. But the test endpoint uses the token passed in the request body. If the user didn't enter a new token, they can't test unless we change the endpoint to use the DB token.
      // Let's just use what they type. If they type it, we use it. If not, and they want to test, we need them to input it or change backend to fallback to DB. Let's change backend to fallback to DB if not provided, but for now we just show a message or let it fail if not provided. Actually, wait. Let's just pass tgBotToken. If it's empty, backend fails if it doesn't fallback. I'll modify the backend `telegram.ts` to fallback to DB.

      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ botToken: tgBotToken, chatId: tgChatId })
      });
      const json = await res.json();
      if (json.success) {
        setTgStatus({ ok: true, msg: 'Pesan test berhasil dikirim ke Telegram!' });
      } else {
        setTgStatus({ ok: false, msg: json.message || 'Gagal mengirim pesan test.' });
      }
    } catch (err: any) {
      setTgStatus({ ok: false, msg: err.message || 'Terjadi kesalahan jaringan.' });
    } finally {
      setTgTesting(false);
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
            disabled={saving || hasWhatsAppError}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl shadow-sm transition-all duration-150 active:scale-95 ${
              saved
                ? 'bg-emerald-500 text-white shadow-emerald-500/30'
                : 'bg-slate-900 text-white hover:bg-slate-800 shadow-slate-900/20'
            } ${saving || hasWhatsAppError ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                  <>
                    <input
                      type="text"
                      value={String(setting.value)}
                      onChange={(e) => {
                        let val = e.target.value;
                        if (setting.id === 'admin-whatsapp') {
                          // Auto replace leading 08 or +08 with 628
                          const trimmed = val.trim();
                          if (trimmed.startsWith('08')) {
                            val = '628' + trimmed.substring(2);
                          } else if (trimmed.startsWith('+08')) {
                            val = '628' + trimmed.substring(3);
                          }
                        }
                        updateSetting(setting.id, val);
                      }}
                      className={`w-full px-3 py-2.5 text-sm border rounded-xl text-slate-900 bg-slate-50 focus:outline-none transition-all ${
                        setting.id === 'color-theme' ? 'pr-10' : ''
                      } ${
                        setting.id === 'admin-whatsapp' &&
                        (String(setting.value).trim().startsWith('08') ||
                          String(setting.value).trim().startsWith('0') ||
                          String(setting.value).trim().startsWith('+0'))
                          ? 'border-rose-300 focus:ring-rose-400/40 focus:border-rose-500'
                          : 'border-slate-200 focus:ring-emerald-400/40 focus:border-emerald-400'
                      }`}
                    />
                    {setting.id === 'admin-whatsapp' &&
                      (String(setting.value).trim().startsWith('08') ||
                        String(setting.value).trim().startsWith('0') ||
                        String(setting.value).trim().startsWith('+0')) && (
                        <p className="text-xs text-rose-500 mt-1.5 font-medium ml-1">
                          Nomor WhatsApp tidak boleh dimulai dengan '08' atau '0'. Silakan gunakan format kode negara '62' (misal: 628xxxxxxxx).
                        </p>
                      )}
                  </>
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

      {/* Widget Placement */}
      <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center border border-slate-200 flex-shrink-0 mt-0.5">
            <PanelRightClose size={16} className="text-slate-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Posisi Widget Chat</p>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">Pilih di sudut mana tombol chat akan muncul di website pelanggan Anda.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-2">
          {/* Bottom-Right Option */}
          <button
            id="placement-bottom-right"
            type="button"
            onClick={() => { setWidgetPlacement('bottom-right'); setSaved(false); }}
            className={`relative group rounded-2xl border-2 p-4 transition-all duration-200 text-left ${
              widgetPlacement === 'bottom-right'
                ? 'border-violet-500 bg-violet-50 shadow-md shadow-violet-100'
                : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
            }`}
          >
            {/* Mini browser mockup */}
            <div className="w-full h-20 bg-white rounded-xl border border-slate-200 relative overflow-hidden mb-3 shadow-inner">
              {/* Browser bar */}
              <div className="absolute top-0 inset-x-0 h-4 bg-slate-100 border-b border-slate-200 flex items-center px-2 gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              </div>
              {/* Chat button indicator — bottom right */}
              <div className={`absolute bottom-2 right-2 w-6 h-6 rounded-full flex items-center justify-center shadow-md transition-colors ${
                widgetPlacement === 'bottom-right' ? 'bg-violet-500' : 'bg-slate-300'
              }`}>
                <PanelRightClose size={10} className="text-white" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-xs font-bold ${ widgetPlacement === 'bottom-right' ? 'text-violet-700' : 'text-slate-700' }`}>Kanan Bawah</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Default</p>
              </div>
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                widgetPlacement === 'bottom-right' ? 'border-violet-500 bg-violet-500' : 'border-slate-300'
              }`}>
                {widgetPlacement === 'bottom-right' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
            </div>
          </button>

          {/* Bottom-Left Option */}
          <button
            id="placement-bottom-left"
            type="button"
            onClick={() => { setWidgetPlacement('bottom-left'); setSaved(false); }}
            className={`relative group rounded-2xl border-2 p-4 transition-all duration-200 text-left ${
              widgetPlacement === 'bottom-left'
                ? 'border-violet-500 bg-violet-50 shadow-md shadow-violet-100'
                : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
            }`}
          >
            {/* Mini browser mockup */}
            <div className="w-full h-20 bg-white rounded-xl border border-slate-200 relative overflow-hidden mb-3 shadow-inner">
              {/* Browser bar */}
              <div className="absolute top-0 inset-x-0 h-4 bg-slate-100 border-b border-slate-200 flex items-center px-2 gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              </div>
              {/* Chat button indicator — bottom left */}
              <div className={`absolute bottom-2 left-2 w-6 h-6 rounded-full flex items-center justify-center shadow-md transition-colors ${
                widgetPlacement === 'bottom-left' ? 'bg-violet-500' : 'bg-slate-300'
              }`}>
                <PanelLeftClose size={10} className="text-white" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-xs font-bold ${ widgetPlacement === 'bottom-left' ? 'text-violet-700' : 'text-slate-700' }`}>Kiri Bawah</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Alternatif</p>
              </div>
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                widgetPlacement === 'bottom-left' ? 'border-violet-500 bg-violet-500' : 'border-slate-300'
              }`}>
                {widgetPlacement === 'bottom-left' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
            </div>
          </button>
        </div>
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
        <div className="mt-4">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Email Kontak (Reply-To)</label>
          <input
            type="email"
            value={replyToEmail}
            onChange={(e) => setReplyToEmail(e.target.value)}
            placeholder="hrd@perusahaananda.com"
            className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 transition-all"
          />
          <p className="text-xs text-slate-400 mt-1.5">
            Email HR (keputusan CV, dll) tetap dikirim dari alamat default PulseAI, tapi saat pelamar membalas, balasannya akan masuk ke alamat email perusahaan Anda ini — bukan hilang ke alamat noreply.
          </p>
        </div>
      </div>

      {/* Proactive & Follow-up Settings */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm mt-8">
        <h3 className="text-sm font-bold text-slate-900 mb-4">Interaksi Otomatis</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Proactive Chat (Detik)</label>
            <select
              value={proactiveDelay}
              onChange={(e) => { setProactiveDelay(Number(e.target.value)); setSaved(false); }}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 transition-all"
            >
              <option value={0}>Nonaktif</option>
              <option value={5}>5 Detik</option>
              <option value={10}>10 Detik</option>
              <option value={15}>15 Detik</option>
              <option value={30}>30 Detik</option>
            </select>
            <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
              Waktu tunda sebelum widget terbuka otomatis menyapa pengunjung baru.
            </p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Idle Follow-Up (Menit)</label>
            <select
              value={followupDelay}
              onChange={(e) => { setFollowupDelay(Number(e.target.value)); setSaved(false); }}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 transition-all"
            >
              <option value={0}>Nonaktif</option>
              <option value={1}>1 Menit</option>
              <option value={2}>2 Menit</option>
              <option value={3}>3 Menit</option>
              <option value={5}>5 Menit</option>
            </select>
            <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
              Jika pengunjung diam selama batas waktu ini setelah dibalas bot, bot akan bertanya kembali.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Reply Buttons */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm mt-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center border border-violet-200">
            <MessageSquareText size={18} className="text-violet-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Quick Reply Buttons</h3>
            <p className="text-xs text-slate-500 mt-0.5">Pertanyaan cepat yang muncul di awal chat untuk memandu user.</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {quickReplies.map((qr, i) => (
              <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 text-violet-700 text-xs font-semibold rounded-full border border-violet-200">
                <span>{qr}</span>
                <button 
                  onClick={() => removeQuickReply(i)}
                  className="p-0.5 hover:bg-violet-200 rounded-full transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>

          {quickReplies.length < 6 && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newQuickReply}
                onChange={(e) => setNewQuickReply(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addQuickReply()}
                placeholder="Tambah quick reply baru... (max 40 karakter)"
                maxLength={40}
                className="flex-1 px-3 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-400 transition-all"
              />
              <button
                onClick={addQuickReply}
                disabled={!newQuickReply.trim()}
                className="px-4 py-2.5 bg-violet-100 text-violet-700 font-semibold rounded-xl hover:bg-violet-200 disabled:opacity-50 transition-colors text-sm"
              >
                Tambah
              </button>
            </div>
          )}
          <p className="text-xs text-slate-400">
            Maksimal 6 tombol. Klik Simpan Perubahan di atas untuk menyimpan.
          </p>
        </div>
      </div>

      {/* Telegram Notification Setup */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm mt-8">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center border border-blue-100">
              <Send size={18} className="text-blue-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Notifikasi Telegram</h3>
              <p className="text-xs text-slate-500 mt-0.5">Dapatkan notifikasi instan ke grup/chat Anda setiap ada lead baru masuk dari widget.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleTestTelegram}
              disabled={tgTesting || (!tgBotToken && !tgHasToken) || !tgChatId}
              className="px-3 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {tgTesting ? 'Menguji...' : 'Test Kirim'}
            </button>
            <button
              onClick={handleSaveTelegram}
              disabled={tgSaving}
              className="px-3 py-2 text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors shadow-sm shadow-blue-500/20 disabled:opacity-50"
            >
              {tgSaving ? 'Menyimpan...' : 'Simpan Config'}
            </button>
          </div>
        </div>

        {tgStatus && (
          <div className={`mb-4 px-3 py-2 rounded-lg text-xs font-medium border ${
            tgStatus.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'
          }`}>
            {tgStatus.msg}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Bot Token</label>
            <input
              type="text"
              value={tgBotToken}
              onChange={(e) => setTgBotToken(e.target.value)}
              placeholder={tgHasToken ? tgMasked : "123456789:ABCdefGHIjklmNOPqrsTUVwxyz..."}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400 transition-all font-mono"
            />
            <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
              Dapatkan token dari <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">@BotFather</a> di Telegram.
            </p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Chat ID</label>
            <input
              type="text"
              value={tgChatId}
              onChange={(e) => setTgChatId(e.target.value)}
              placeholder="contoh: -1001234567890"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400 transition-all font-mono"
            />
            <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
              ID grup (pakai -100) atau ID akun Anda. Anda bisa dapatkan ID dari bot seperti <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">@userinfobot</a>.
            </p>
          </div>
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
