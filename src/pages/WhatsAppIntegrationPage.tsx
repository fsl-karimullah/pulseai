import React, { useEffect, useState } from 'react';
import { MessageCircle, Zap, ShieldCheck, Smartphone, LogOut, Loader2, RefreshCw, AlertTriangle, X, Info, Plus, FolderKanban, ChevronDown, BookOpen, Send, CheckCircle2, ExternalLink, BarChart2, List, MousePointerClick, Trash2, Lock, Radio, StopCircle, Eye, Bot, BotOff, FileText, Copy, Check, Search } from 'lucide-react';
import { useOrganization } from '../hooks/useOrganization';
import { useAuth } from '../contexts/AuthContext';
import { useProjects } from '../contexts/ProjectContext';
import { useSubscription } from '../hooks/useSubscription';

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL;
const FACEBOOK_APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID || '';

declare global {
  interface Window {
    fbAsyncInit: () => void;
    FB: any;
  }
}

type ConnectionStatus = 'checking' | 'disconnected' | 'qr' | 'open' | 'connecting';

interface WhatsAppSession {
  phone_number: string;
  org_id: string;
  phone_label: string;
  gateway_user_id: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'QR_PENDING';
  platform?: 'baileys' | 'meta';
  meta_waba_id?: string;
  meta_phone_number_id?: string;
  is_chatbot_enabled?: boolean;
  bot_settings_id?: string;
  connected_at: string | null;
  disconnected_at: string | null;
  created_at: string;
  updated_at: string;
}

interface BotProfileOption {
  id: string;
  profile_name: string;
  bot_name: string | null;
  kb_project_ids?: string[];
}

interface MetaPhoneStatus {
  phone_number_id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';
  status: 'PENDING' | 'CONNECTED' | 'DISCONNECTED' | 'FLAGGED' | 'BANNED' | 'DELETED' | 'MIGRATED' | 'UNKNOWN';
  code_verification_status: 'VERIFIED' | 'NOT_VERIFIED' | 'EXPIRED';
  name_status: string;
  waba_id: string;
}

interface BlastRecipientLog {
  phone: string;
  status: 'success' | 'failed';
  reason: string;
  timestamp: string;
}

interface ActiveBlastJob {
  id: string;
  orgId: string;
  platform: 'baileys' | 'meta';
  phoneLabel: string;
  phoneNumberId?: string;
  total: number;
  current: number;
  successCount: number;
  failedCount: number;
  delayFrom: number;
  delayTo: number;
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  startedAt: string;
  completedAt?: string;
  error?: string;
  logs?: BlastRecipientLog[];
}

const WhatsAppIntegrationPage: React.FC = () => {
  const { organization, loading: orgLoading } = useOrganization();
  const { subscription } = useSubscription();
  const { session } = useAuth();
  const { projects, activeProjectId, setActiveProjectId } = useProjects();
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const activeProject = projects.find((p) => p.id === activeProjectId);

  const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState<boolean>(true);

  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [qrBase64, setQrBase64] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showTipsModal, setShowTipsModal] = useState<boolean>(false);
  const [metaPendingInfo, setMetaPendingInfo] = useState<{ message: string; wabaId: string } | null>(null);
  const [metaPhoneStatuses, setMetaPhoneStatuses] = useState<Record<string, MetaPhoneStatus>>({});
  const [loadingMetaStatus, setLoadingMetaStatus] = useState<boolean>(false);
  const [botProfiles, setBotProfiles] = useState<BotProfileOption[]>([]);
  const [assigningBot, setAssigningBot] = useState<string | null>(null);

  const [showMetaVerifyGuideModal, setShowMetaVerifyGuideModal] = useState<boolean>(false);
  const [metaPricingBannerDismissed, setMetaPricingBannerDismissed] = useState<boolean>(
    () => localStorage.getItem('pulse_meta_oct26_banner_dismissed') === 'true'
  );
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newLabel, setNewLabel] = useState<string>('');

  // Meta Tutorial & Official Broadcast States
  const [showTutorialModal, setShowTutorialModal] = useState<boolean>(false);
  const [showMetaBlastModal, setShowMetaBlastModal] = useState<boolean>(false);
  const [blastStep, setBlastStep] = useState<'form' | 'success'>('form');
  const [selectedMetaPhone, setSelectedMetaPhone] = useState<string>('');
  const [templateName, setTemplateName] = useState<string>('hello_world');
  const [targetNumbers, setTargetNumbers] = useState<string>('');
  const [blastLoading, setBlastLoading] = useState<boolean>(false);
  const [blastResult, setBlastResult] = useState<{ total: number; successCount: number; failedCount: number } | null>(null);

  // Meta Template Manager States
  const [showTemplatesModal, setShowTemplatesModal] = useState<boolean>(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState<boolean>(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);

  // Meta Analytics States
  const [showAnalyticsModal, setShowAnalyticsModal] = useState<boolean>(false);
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState<boolean>(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  // Interactive Message Sender States
  const [showInteractiveModal, setShowInteractiveModal] = useState<boolean>(false);
  const [interactivePhoneId, setInteractivePhoneId] = useState<string>('');
  const [interactiveTo, setInteractiveTo] = useState<string>('');
  const [interactiveType, setInteractiveType] = useState<'button' | 'list'>('button');
  const [interactiveHeader, setInteractiveHeader] = useState<string>('');
  const [interactiveBody, setInteractiveBody] = useState<string>('');
  const [interactiveFooter, setInteractiveFooter] = useState<string>('');
  const [interactiveButtons, setInteractiveButtons] = useState<{ id: string; title: string }[]>([
    { id: 'btn_1', title: 'Ya, saya tertarik' },
    { id: 'btn_2', title: 'Tidak, terima kasih' },
  ]);
  const [interactiveSections, setInteractiveSections] = useState<{ title: string; rows: { id: string; title: string; description: string }[] }[]>([
    { title: 'Pilihan Layanan', rows: [
      { id: 'row_1', title: 'Konsultasi Gratis', description: 'Bicara dengan tim kami' },
      { id: 'row_2', title: 'Lihat Demo', description: 'Demo produk 15 menit' },
    ]}
  ]);
  const [interactiveListBtn, setInteractiveListBtn] = useState<string>('Pilih Opsi');
  const [interactiveSending, setInteractiveSending] = useState<boolean>(false);
  const [interactiveSent, setInteractiveSent] = useState<boolean>(false);
  const [interactiveError, setInteractiveError] = useState<string | null>(null);

  // Baileys Gateway WA Blast States
  const [showBaileysBlastModal, setShowBaileysBlastModal] = useState<boolean>(false);
  const [baileysBlastStep, setBaileysBlastStep] = useState<'form' | 'success'>('form');
  const [selectedBaileysPhoneLabel, setSelectedBaileysPhoneLabel] = useState<string>('');
  const [baileysMessageText, setBaileysMessageText] = useState<string>('Halo {nama}, terima kasih telah menghubungi kami! Ada yang bisa kami bantu?');
  const [baileysTargetNumbers, setBaileysTargetNumbers] = useState<string>('');
  const [baileysDelayFrom, setBaileysDelayFrom] = useState<number>(60);
  const [baileysDelayTo, setBaileysDelayTo] = useState<number>(120);
  const [agreedTerms, setAgreedTerms] = useState<boolean>(false);
  const [baileysBlastLoading, setBaileysBlastLoading] = useState<boolean>(false);
  const [baileysBlastResult, setBaileysBlastResult] = useState<{ total: number; successCount: number; failedCount: number } | null>(null);

  // Background WA Blast Job States (Runs on server, non-blocking)
  const [activeBlastJob, setActiveBlastJob] = useState<ActiveBlastJob | null>(null);
  const [showActiveBlastWidget, setShowActiveBlastWidget] = useState<boolean>(true);
  const [cancellingBlast, setCancellingBlast] = useState<boolean>(false);

  // Blast Logs Modal States
  const [showBlastLogsModal, setShowBlastLogsModal] = useState<boolean>(false);
  const [blastLogsFilter, setBlastLogsFilter] = useState<'all' | 'failed' | 'success'>('all');
  const [blastLogsSearch, setBlastLogsSearch] = useState<string>('');
  const [copiedFailedNumbers, setCopiedFailedNumbers] = useState<boolean>(false);

  const handleCopyFailedNumbers = () => {
    if (!activeBlastJob?.logs) return;
    const failedNumbers = activeBlastJob.logs
      .filter((l) => l.status === 'failed')
      .map((l) => l.phone)
      .join('\n');

    if (!failedNumbers) return;
    navigator.clipboard.writeText(failedNumbers);
    setCopiedFailedNumbers(true);
    setTimeout(() => setCopiedFailedNumbers(false), 2500);
  };

  const fetchActiveBlastStatus = async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch('/api/whatsapp/blast/status', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      const data = await res.json();
      if (data.success) {
        setActiveBlastJob(data.job || null);
        if (data.job?.status === 'running') {
          setShowActiveBlastWidget(true);
        }
      }
    } catch (err) {
      console.error('Failed fetching blast status', err);
    }
  };

  const handleCancelBlast = async () => {
    if (!session?.access_token || !activeBlastJob) return;
    if (!confirm('Yakin ingin menghentikan broadcast yang sedang berjalan? Pesan yang belum terkirim akan dibatalkan.')) return;
    setCancellingBlast(true);
    try {
      const res = await fetch('/api/whatsapp/blast/cancel', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      const data = await res.json();
      if (data.success && data.job) {
        setActiveBlastJob(data.job);
      }
    } catch (err) {
      console.error('Failed cancelling blast', err);
    } finally {
      setCancellingBlast(false);
    }
  };

  const [togglingChatbot, setTogglingChatbot] = useState<string | null>(null);

  const handleToggleChatbot = async (s: WhatsAppSession) => {
    if (!session?.access_token) return;
    const targetKey = s.phone_number || s.phone_label;
    const currentEnabled = s.is_chatbot_enabled !== false;
    const nextEnabled = !currentEnabled;

    setTogglingChatbot(targetKey);
    // Optimistic UI update
    setSessions(prev =>
      prev.map(item => {
        if ((s.phone_number && item.phone_number === s.phone_number) || item.phone_label === s.phone_label) {
          return { ...item, is_chatbot_enabled: nextEnabled };
        }
        return item;
      })
    );

    try {
      const res = await fetch('/api/whatsapp/session/toggle-chatbot', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          phoneLabel: s.phone_label,
          phoneNumber: s.phone_number,
          isChatbotEnabled: nextEnabled,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        // Revert on error
        setSessions(prev =>
          prev.map(item => {
            if ((s.phone_number && item.phone_number === s.phone_number) || item.phone_label === s.phone_label) {
              return { ...item, is_chatbot_enabled: currentEnabled };
            }
            return item;
          })
        );
        setError(data.message || 'Gagal mengubah status chatbot.');
      }
    } catch {
      // Revert on network error
      setSessions(prev =>
        prev.map(item => {
          if ((s.phone_number && item.phone_number === s.phone_number) || item.phone_label === s.phone_label) {
            return { ...item, is_chatbot_enabled: currentEnabled };
          }
          return item;
        })
      );
      setError('Terjadi kendala jaringan saat mengubah status chatbot.');
    } finally {
      setTogglingChatbot(null);
    }
  };

  const fetchSessions = async () => {
    if (!organization?.id || !session?.access_token) {
      setLoadingSessions(false);
      return;
    }
    try {
      const res = await fetch('/api/whatsapp-sessions', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      const data = await res.json();
      if (data.success) {
        const loadedSessions: WhatsAppSession[] = data.sessions || [];
        setSessions(loadedSessions);
        // Auto-fetch Meta statuses for sessions that have a phone number ID
        const metaSessions = loadedSessions.filter(s => s.platform === 'meta' && s.meta_phone_number_id);
        if (metaSessions.length > 0) {
          fetchMetaPhoneStatuses(metaSessions, session.access_token);
        }
      }
    } catch (err) {
      console.error('Failed to fetch sessions', err);
    } finally {
      setLoadingSessions(false);
    }
  };

  const fetchBotProfiles = async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch('/api/bot-profiles', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setBotProfiles(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch bot profiles', err);
    }
  };

  const handleAssignBotProfile = async (phoneNumber: string, profileId: string) => {
    if (!session?.access_token) return;
    setAssigningBot(phoneNumber);
    try {
      const res = await fetch(`/api/bot-profiles/${profileId}/assign-channel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          channel_type: 'whatsapp',
          channel_id: phoneNumber,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSessions((prev) =>
          prev.map((s) =>
            s.phone_number === phoneNumber
              ? { ...s, bot_settings_id: profileId === 'none' ? undefined : profileId }
              : s
          )
        );
      } else {
        alert(data.message || 'Gagal mengubah Bot Profile');
      }
    } catch (err: any) {
      console.error('Failed to assign bot profile', err);
      alert('Terjadi kesalahan saat menghubungkan Bot Profile');
    } finally {
      setAssigningBot(null);
    }
  };

  const fetchMetaPhoneStatuses = async (metaSessions: WhatsAppSession[], accessToken: string) => {
    setLoadingMetaStatus(true);
    const statusMap: Record<string, MetaPhoneStatus> = {};
    await Promise.allSettled(
      metaSessions
        .filter(s => s.meta_phone_number_id)
        .map(async (s) => {
          try {
            const res = await fetch(
              `/api/whatsapp/meta/phone-status?phoneNumberId=${s.meta_phone_number_id}`,
              { headers: { 'Authorization': `Bearer ${accessToken}` } }
            );
            const data = await res.json();
            if (data.success) {
              statusMap[s.meta_phone_number_id!] = data as MetaPhoneStatus;
            }
          } catch {
            // silently ignore per-number errors
          }
        })
    );
    setMetaPhoneStatuses(statusMap);
    setLoadingMetaStatus(false);
  };

  useEffect(() => {
    if (orgLoading) return;
    fetchSessions();
    fetchBotProfiles();
  }, [organization, session, orgLoading, activeProjectId]);

  useEffect(() => {
    if (!session?.access_token) return;
    fetchActiveBlastStatus();
  }, [session?.access_token]);

  useEffect(() => {
    if (!session?.access_token || !activeBlastJob || activeBlastJob.status !== 'running') return;
    const interval = setInterval(() => {
      fetchActiveBlastStatus();
    }, 2500);
    return () => clearInterval(interval);
  }, [session?.access_token, activeBlastJob?.status]);

  useEffect(() => {
    const initFB = () => {
      if (window.FB) {
        window.FB.init({
          appId: FACEBOOK_APP_ID,
          cookie: true,
          xfbml: true,
          version: 'v21.0'
        });
      }
    };

    if (window.FB) {
      initFB();
    } else {
      window.fbAsyncInit = initFB;
    }
  }, []);

  const checkActiveStatus = async () => {
    if (!organization?.id || !activeSession) return;
    try {
      const res = await fetch(`${GATEWAY_URL}/api/session/status?userId=${organization.id}&phoneLabel=${activeSession}`);
      const data = await res.json();
      if (data.success) {
        setStatus(data.status);
        if (data.qrBase64) {
          setQrBase64(data.qrBase64);
        } else {
          setQrBase64(null);
        }
        
        if (data.status === 'open') {
          await fetchSessions();
          setShowAddModal(false);
          setActiveSession(null);
          setQrBase64(null);
          setNewLabel('');
          setStatus('disconnected');
        }
      }
    } catch (err) {
      console.error('Failed to check active status', err);
    }
  };

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (activeSession && status !== 'open') {
      interval = setInterval(checkActiveStatus, 3000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [activeSession, status, organization]);

  const handleStartConnection = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newLabel.trim()) return;

    if (!organization?.id) {
      setError('Organisasi belum termuat atau tidak ditemukan. Coba muat ulang halaman.');
      return;
    }

    if (!activeProjectId) {
      setError('Pilih Project tujuan terlebih dahulu.');
      return;
    }

    setLoading(true);
    setError(null);
    setStatus('connecting');
    setQrBase64(null);
    setActiveSession(newLabel.trim());

    try {
      const intentRes = await fetch('/api/whatsapp/session-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ phoneLabel: newLabel.trim(), projectId: activeProjectId }),
      });
      const intentData = await intentRes.json();
      if (!intentData.success) {
        setError(intentData.message || 'Gagal menyimpan pilihan project.');
        setActiveSession(null);
        setStatus('disconnected');
        setLoading(false);
        return;
      }

      const res = await fetch(`${GATEWAY_URL}/api/session/start?userId=${organization.id}&phoneLabel=${newLabel.trim()}`);
      const data = await res.json();
      if (data.success) {
        setStatus(data.status);
        if (data.qrBase64) setQrBase64(data.qrBase64);
      } else {
        setError(data.message || 'Gagal memulai sesi WhatsApp.');
        setActiveSession(null);
        setStatus('disconnected');
      }
    } catch {
      setError('Gateway WhatsApp tidak dapat dihubungi.');
      setActiveSession(null);
      setStatus('disconnected');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async (label: string) => {
    if (!organization?.id || !session?.access_token) return;
    if (!confirm(`Yakin ingin memutuskan koneksi sesi '${label}'?`)) return;
    
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/whatsapp/disconnect?phoneLabel=${encodeURIComponent(label)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (data.success) {
        await fetchSessions();
      } else {
        setError(data.message || 'Gagal memutuskan koneksi sesi.');
      }
    } catch {
      setError('Gagal memutuskan koneksi WhatsApp.');
    } finally {
      setLoading(false);
    }
  };

  const handleReconnect = async (label: string) => {
    if (!organization?.id || !session?.access_token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/whatsapp/reconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ phoneLabel: label })
      });
      const data = await res.json();
      if (data.success) {
        await fetchSessions();
      } else {
        setError(data.message || 'Gagal menghubungkan kembali sesi.');
      }
    } catch {
      setError('Gagal menghubungkan kembali WhatsApp.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSession = async (label: string) => {
    if (!organization?.id || !session?.access_token) return;
    if (!confirm(`Yakin ingin menghapus sesi '${label}' secara permanen? Sesi ini akan dihapus dari daftar.`)) return;
    
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/whatsapp/session?phoneLabel=${encodeURIComponent(label)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (data.success) {
        await fetchSessions();
      } else {
        setError(data.message || 'Gagal menghapus sesi.');
      }
    } catch {
      setError('Gagal menghapus sesi WhatsApp.');
    } finally {
      setLoading(false);
    }
  };

  const handleMetaLogin = () => {
    if (!window.FB) {
      setError('Facebook SDK tidak dimuat.');
      return;
    }
    if (!activeProjectId) {
      setError('Pilih Project tujuan terlebih dahulu.');
      return;
    }

    setLoading(true);
    setError(null);
    window.FB.login(
      (response: any) => {
        if (response.authResponse && response.authResponse.code) {
          const code = response.authResponse.code;
          fetch('/api/whatsapp/meta/exchange-token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token}`
            },
            body: JSON.stringify({ code, projectId: activeProjectId, phoneLabel: 'meta-official' })
          })
            .then(res => res.json())
            .then(data => {
              if (data.success) {
                fetchSessions();
                alert(`✅ Berhasil! Nomor Meta terdaftar: +${data.phone_number}`);
              } else if (data.pending) {
                // WABA terhubung tapi nomor belum di-provision Meta
                fetchSessions();
                setMetaPendingInfo({ message: data.message, wabaId: data.waba_id || '' });
              } else {
                setError(data.message || 'Gagal mendaftarkan Meta WhatsApp.');
              }
            })
            .catch(err => {
              console.error(err);
              setError('Terjadi kesalahan saat bertukar token.');
            })
            .finally(() => setLoading(false));
        } else {
          setLoading(false);
          if (response.status !== 'unknown') {
            setError('Gagal mendapatkan otorisasi dari Facebook.');
          }
        }
      },
      {
        config_id: '1806554713859655',
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: '',
          sessionInfoVersion: '3',
        }
      }
    );
  };


  const metaSessions = sessions.filter(s => s.platform === 'meta');
  const baileysSessions = sessions.filter(s => s.platform !== 'meta');
  const isStarterPlan = subscription?.plan_type === 'starter' || subscription?.plan_type === 'free';

  return (
    <div className="relative min-h-screen bg-slate-50 flex flex-col overflow-hidden">
      {/* Ambient glows */}
      <div className="absolute top-0 left-0 w-80 h-80 bg-emerald-200/25 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-200/15 rounded-full blur-3xl translate-x-1/3 translate-y-1/3 pointer-events-none" />

      {/* Main Content */}
      <div className="relative flex-1 p-5 lg:p-8 max-w-6xl mx-auto w-full z-10 space-y-6">

        {/* ── Header ─────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs font-semibold mb-2">
              <Smartphone size={12} />
              <span>Multi-Platform Integration</span>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Integrasi <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-600">WhatsApp</span>
            </h1>
            <p className="text-slate-500 text-sm mt-1">Kelola koneksi Meta Official API dan Gateway Baileys secara terpisah.</p>
          </div>

          <div className="flex items-center gap-3">
            {projects.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setProjectMenuOpen((v) => !v)}
                  className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-slate-200 hover:border-emerald-500 text-slate-700 text-sm font-semibold rounded-xl transition-all duration-150 shadow-sm"
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

            <button 
              onClick={fetchSessions} 
              className="p-2.5 bg-white border border-slate-200 text-slate-600 hover:text-slate-900 rounded-xl transition-colors shadow-sm"
              title="Refresh Sesi"
            >
              <RefreshCw size={16} className={loadingSessions ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* ── Error Banner ─────────────────────────────────── */}
        {error && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm flex items-center gap-2.5">
            <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
            <p className="flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X size={16} /></button>
          </div>
        )}

        {/* ── Active Background Broadcast Banner ──────────────────────── */}
        {activeBlastJob && showActiveBlastWidget && (
          <div className={`p-4 rounded-3xl border shadow-md transition-all ${
            activeBlastJob.status === 'running'
              ? 'bg-gradient-to-r from-emerald-50 via-teal-50 to-white border-emerald-200'
              : activeBlastJob.status === 'completed'
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-2xl flex-shrink-0 ${
                  activeBlastJob.status === 'running'
                    ? 'bg-emerald-600 text-white animate-pulse'
                    : activeBlastJob.status === 'completed'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-200 text-slate-700'
                }`}>
                  {activeBlastJob.status === 'running' ? <Radio size={20} /> : <CheckCircle2 size={20} />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wide">
                      {activeBlastJob.status === 'running' ? 'Broadcast WhatsApp Berjalan di Latar Belakang' : activeBlastJob.status === 'completed' ? 'Broadcast WhatsApp Selesai' : 'Broadcast WhatsApp Dihentikan'}
                    </h4>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-slate-200 font-bold text-slate-600">
                      {activeBlastJob.platform === 'baileys' ? `Gateway (${activeBlastJob.phoneLabel})` : 'Meta Official'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {activeBlastJob.status === 'running' ? (
                      <>Mengirim <strong>{activeBlastJob.current}</strong> dari <strong>{activeBlastJob.total}</strong> pesan ({Math.round((activeBlastJob.current / Math.max(1, activeBlastJob.total)) * 100)}%) • Delay: {activeBlastJob.delayFrom}–{activeBlastJob.delayTo} dtk • Berhasil: <span className="text-emerald-700 font-bold">{activeBlastJob.successCount}</span> • Gagal: <span className="text-rose-600 font-bold">{activeBlastJob.failedCount}</span></>
                    ) : (
                      <>Total {activeBlastJob.total} target: <strong className="text-emerald-700">{activeBlastJob.successCount} berhasil</strong>, <strong className="text-rose-600">{activeBlastJob.failedCount} gagal</strong>.</>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                {activeBlastJob.status === 'running' && (
                  <button
                    onClick={handleCancelBlast}
                    disabled={cancellingBlast}
                    className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                    title="Hentikan pengiriman broadcast"
                  >
                    <StopCircle size={13} />
                    {cancellingBlast ? 'Menghentikan...' : 'Hentikan'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowBlastLogsModal(true)}
                  className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                  title="Lihat rincian status & alasan gagal per nomor"
                >
                  <FileText size={13} />
                  Log Pengiriman
                </button>
                <button
                  onClick={() => {
                    if (activeBlastJob.platform === 'baileys') {
                      setShowBaileysBlastModal(true);
                    } else {
                      setShowMetaBlastModal(true);
                    }
                  }}
                  className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                  title="Buka dialog modal broadcast"
                >
                  <Eye size={13} />
                  Detail
                </button>
                <button
                  onClick={() => setShowActiveBlastWidget(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-white transition-colors cursor-pointer"
                  title="Sembunyikan progress bar ini"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {activeBlastJob.error && (
              <div className="mt-2.5 p-2.5 bg-rose-50/90 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
                <AlertTriangle size={15} className="text-rose-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 text-[11px] leading-relaxed">
                  <strong className="font-bold">Info Kegagalan:</strong> {activeBlastJob.error}
                </div>
              </div>
            )}

            {activeBlastJob.status === 'running' && (
              <div className="mt-3">
                <div className="w-full h-2 bg-emerald-200/60 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 transition-all duration-300 rounded-full"
                    style={{ width: `${Math.round((activeBlastJob.current / Math.max(1, activeBlastJob.total)) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 1: META OFFICIAL CLOUD API
        ════════════════════════════════════════════════════════════════════ */}
        {isStarterPlan ? (
          <div className="bg-white/90 backdrop-blur-xl rounded-3xl border border-blue-100 shadow-[0_4px_24px_-8px_rgba(24,119,242,0.12)]">
            <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-blue-50/70 via-indigo-50/30 to-white">
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-full bg-[#1877F2] text-white text-[10px] font-extrabold uppercase tracking-wider">
                  Official API
                </span>
                <h2 className="font-extrabold text-slate-900 text-base">WhatsApp Official (Meta Cloud API)</h2>
              </div>
              <p className="text-slate-500 text-xs leading-relaxed max-w-2xl">
                Koneksi resmi Meta via Embedded Signup. Bebas risiko pemblokiran, centang hijau, gratis 1.000 percakapan Service/bulan.
              </p>
            </div>
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-100 text-blue-500 rounded-2xl flex items-center justify-center mb-5">
                <Lock size={28} />
              </div>
              <h3 className="text-xl font-extrabold text-slate-900 mb-2">Fitur Eksklusif Paket Pro & Enterprise</h3>
              <p className="text-sm text-slate-500 mb-2 leading-relaxed max-w-md">
                Paket <strong className="text-slate-700">Starter</strong> Anda saat ini mendukung integrasi WhatsApp via <strong className="text-emerald-600">Baileys (Scan QR)</strong> yang sudah tersedia di bawah.
              </p>
              <p className="text-xs text-slate-400 mb-7 max-w-md">
                Upgrade untuk membuka Meta Official Cloud API — centang hijau, template blast, analitik, pesan interaktif, dan 1.000 percakapan gratis/bulan dari Meta.
              </p>
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={() => window.location.href = '/dashboard/billing'}
                  className="px-7 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-bold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg shadow-blue-600/25"
                >
                  🚀 Upgrade Sekarang
                </button>
                <span className="text-xs text-slate-400">Mulai dari Rp 199.000/3 bulan</span>
              </div>
            </div>
          </div>
        ) : (
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl border border-blue-100 shadow-[0_4px_24px_-8px_rgba(24,119,242,0.12)] overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-blue-50/70 via-indigo-50/30 to-white flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-full bg-[#1877F2] text-white text-[10px] font-extrabold uppercase tracking-wider">
                  Official API
                </span>
                <h2 className="font-extrabold text-slate-900 text-base">WhatsApp Official (Meta Cloud API)</h2>
              </div>
              <p className="text-slate-500 text-xs leading-relaxed max-w-2xl">
                Koneksi resmi Meta via Embedded Signup. Bebas risiko pemblokiran, centang hijau, gratis 1.000 percakapan Service/bulan.
              </p>
            </div>

            <div className="flex flex-wrap items-center md:justify-end gap-2.5">
              <button
                onClick={() => setShowTutorialModal(true)}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 h-9 bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer whitespace-nowrap"
              >
                <BookOpen size={13} className="text-blue-600 flex-shrink-0" />
                Panduan
              </button>
              <button
                onClick={async () => {
                  setShowTemplatesModal(true);
                  setTemplatesError(null);
                  setSelectedTemplate(null);
                  const firstMeta = metaSessions[0];
                  if (!firstMeta?.meta_phone_number_id || !session?.access_token) return;
                  setTemplatesLoading(true);
                  try {
                    const res = await fetch(`/api/whatsapp/meta/templates?phoneNumberId=${firstMeta.meta_phone_number_id}`, {
                      headers: { 'Authorization': `Bearer ${session.access_token}` }
                    });
                    const data = await res.json();
                    if (data.success) setTemplates(data.templates || []);
                    else setTemplatesError(data.message || 'Gagal memuat template');
                  } catch { setTemplatesError('Gagal terhubung ke server'); }
                  finally { setTemplatesLoading(false); }
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 h-9 bg-white border border-purple-200 text-purple-700 hover:bg-purple-50 text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer whitespace-nowrap"
              >
                <List size={13} className="flex-shrink-0" />
                Template Manager
              </button>
              <button
                onClick={async () => {
                  setShowAnalyticsModal(true);
                  setAnalyticsError(null);
                  const firstMeta = metaSessions[0];
                  if (!firstMeta?.meta_phone_number_id || !session?.access_token) return;
                  setAnalyticsLoading(true);
                  try {
                    const res = await fetch(`/api/whatsapp/meta/analytics?phoneNumberId=${firstMeta.meta_phone_number_id}`, {
                      headers: { 'Authorization': `Bearer ${session.access_token}` }
                    });
                    const data = await res.json();
                    if (data.success) setAnalyticsData(data);
                    else setAnalyticsError(data.message || 'Gagal memuat analitik');
                  } catch { setAnalyticsError('Gagal terhubung ke server'); }
                  finally { setAnalyticsLoading(false); }
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 h-9 bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer whitespace-nowrap"
              >
                <BarChart2 size={13} className="flex-shrink-0" />
                Analitik
              </button>
              <button
                onClick={() => {
                  setSelectedMetaPhone(metaSessions[0]?.meta_phone_number_id || '');
                  setBlastStep('form');
                  setBlastResult(null);
                  setShowMetaBlastModal(true);
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 h-9 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-500/20 cursor-pointer whitespace-nowrap"
              >
                <Send size={13} className="flex-shrink-0" />
                Blast Official
              </button>
              <button
                onClick={handleMetaLogin}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 px-4 h-9 bg-[#1877F2] text-white text-xs font-bold rounded-xl hover:bg-[#166fe5] transition-all whitespace-nowrap shadow-md shadow-blue-500/20 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} className="flex-shrink-0" />}
                Log in with Facebook
              </button>
            </div>
          </div>

          {/* ── Pembaruan Kebijakan Harga Meta 1 Oktober ─────── */}
          {!metaPricingBannerDismissed && (
            <div className="mx-4 mt-4 flex items-start gap-3 px-5 py-4 bg-gradient-to-r from-slate-900 to-blue-950 border border-blue-800/50 rounded-2xl relative overflow-hidden">
              {/* decorative glow */}
              <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-blue-500/15 blur-3xl pointer-events-none" />
              <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-indigo-500/10 blur-2xl pointer-events-none" />
              {/* Icon */}
              <div className="w-9 h-9 rounded-xl bg-amber-400/15 border border-amber-400/25 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-lg">📢</span>
              </div>
              {/* Content */}
              <div className="flex-1 min-w-0 relative">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/25 uppercase tracking-widest">Pembaruan 1 Oktober</span>
                  <p className="text-xs font-bold text-white">Perubahan Kebijakan Harga Meta WhatsApp API</p>
                </div>
                <p className="text-[11px] text-blue-200/90 leading-relaxed">
                  Meta kini mengenakan biaya <strong className="text-white">per-pesan</strong> untuk semua balasan dalam jendela 24 jam. Setiap nomor mendapat jatah
                  <strong className="text-amber-300"> 1.000 pesan balasan GRATIS/bulan</strong>. Selain itu, Meta{' '}
                  <strong className="text-white">mewajibkan metode pembayaran (kartu kredit)</strong> terdaftar di akun WABA Anda — nomor tanpa kartu kredit berisiko ditangguhkan.
                </p>
                <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                  <a
                    href="https://business.facebook.com/settings/payment-methods"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-300 hover:text-amber-200 bg-amber-400/10 hover:bg-amber-400/20 px-2.5 py-1 rounded-lg border border-amber-400/20 transition-colors"
                  >
                    <ExternalLink size={10} /> Tambah Kartu Kredit di Meta →
                  </a>
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={11} /> Bot PulseAI sudah dioptimasi untuk hemat kuota pesan
                  </span>
                </div>
              </div>
              {/* Dismiss */}
              <button
                onClick={() => {
                  setMetaPricingBannerDismissed(true);
                  localStorage.setItem('pulse_meta_oct26_banner_dismissed', 'true');
                }}
                className="p-1.5 text-blue-400/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors flex-shrink-0 relative"
                title="Tutup notifikasi ini"
              >
                <X size={13} />
              </button>
            </div>
          )}

          {/* Meta Sessions Table */}

          <div className="overflow-x-auto">
            {loadingSessions ? (
              <div className="p-8 text-center text-slate-400 text-xs">Memuat sesi Meta...</div>
            ) : metaSessions.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <p className="text-xs font-semibold text-slate-600">Belum ada nomor Meta Cloud API yang terhubung.</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Klik tombol di atas untuk menghubungkan via Facebook Embedded Signup.</p>
              </div>
            ) : (
              <>
                  {/* Pending warning banner */}
                  {metaSessions.some(s => {
                    const ms = metaPhoneStatuses[s.meta_phone_number_id || ''];
                    return !ms || ms.status === 'PENDING' || ms.code_verification_status === 'NOT_VERIFIED';
                  }) && (
                    <div className="mx-4 mt-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                      <div className="p-1.5 bg-amber-100 rounded-lg text-amber-600 flex-shrink-0">
                        <AlertTriangle size={15} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-amber-900 mb-0.5">Nomor Belum Terverifikasi di Meta</p>
                        <p className="text-[11px] text-amber-800 leading-relaxed">
                          Selain verifikasi nomor, Anda juga perlu <strong>melengkapi data perusahaan</strong> di Meta Business Manager agar nomor dapat diaktifkan penuh.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => setShowMetaVerifyGuideModal(true)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300 text-[11px] font-bold rounded-xl transition-colors whitespace-nowrap"
                        >
                          <Info size={11} /> Panduan Lengkap
                        </button>
                        <a
                          href="https://business.facebook.com/wa/manage/phone-numbers/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#1877F2] text-white text-[11px] font-bold rounded-xl hover:bg-[#166fe5] transition-colors whitespace-nowrap shadow-sm"
                        >
                          <MessageCircle size={12} />
                          Buka Meta Business Manager
                        </a>
                      </div>
                    </div>
                  )}

                <table className="w-full text-left border-collapse mt-2">
                  <thead>
                    <tr className="bg-slate-50/60 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="px-6 py-3.5">Nama Sesi</th>
                      <th className="px-6 py-3.5">Nomor</th>
                      <th className="px-6 py-3.5">Nama Bisnis</th>
                      <th className="px-6 py-3.5">Status Meta</th>
                      <th className="px-6 py-3.5">Chatbot AI</th>
                      <th className="px-6 py-3.5">Bot Profile & KB</th>
                      <th className="px-6 py-3.5">Kualitas</th>
                      <th className="px-6 py-3.5 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-xs">
                    {metaSessions.map((s) => {
                      const ms = s.meta_phone_number_id ? metaPhoneStatuses[s.meta_phone_number_id] : undefined;
                      const metaStatus = ms?.status || (loadingMetaStatus ? 'LOADING' : 'UNKNOWN');
                      const verifiedName = ms?.verified_name || s.phone_label;
                      const qualityRating = ms?.quality_rating || 'UNKNOWN';



                      const statusBadge = () => {
                        if (s.status === 'DISCONNECTED') {
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200 text-[10px] font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                              Terputus
                            </span>
                          );
                        }
                        if (metaStatus === 'LOADING') {
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200 text-[10px] font-medium">
                              <Loader2 size={10} className="animate-spin" /> Memeriksa...
                            </span>
                          );
                        }
                        if (metaStatus === 'PENDING') {
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-300 text-[10px] font-bold">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                              Pending Verifikasi
                            </span>
                          );
                        }
                        if (metaStatus === 'CONNECTED') {
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Aktif
                            </span>
                          );
                        }
                        if (metaStatus === 'FLAGGED') {
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 text-[10px] font-bold">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                              Ditandai Meta
                            </span>
                          );
                        }
                        if (metaStatus === 'BANNED') {
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100 text-red-800 border border-red-300 text-[10px] font-bold">
                              ⛔ Diblokir Meta
                            </span>
                          );
                        }
                        if (metaStatus === 'DELETED') {
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-300 text-[10px] font-bold">
                              ❌ Terhapus di Meta
                            </span>
                          );
                        }
                        return (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200 text-[10px] font-medium">
                            {metaStatus}
                          </span>
                        );
                      };

                      const qualityBadge = () => {
                        if (!ms) return null;
                        const map: Record<string, string> = {
                          GREEN: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                          YELLOW: 'bg-yellow-50 text-yellow-700 border-yellow-200',
                          RED: 'bg-red-50 text-red-600 border-red-200',
                          UNKNOWN: 'bg-slate-50 text-slate-500 border-slate-200',
                        };
                        return (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${map[qualityRating] || map.UNKNOWN}`}>
                            {qualityRating}
                          </span>
                        );
                      };

                      return (
                        <tr key={s.phone_number} className="hover:bg-blue-50/30 transition-colors">
                          <td className="px-6 py-4 font-bold text-slate-900 capitalize">{s.phone_label}</td>
                          <td className="px-6 py-4 font-mono text-slate-700">+{s.phone_number}</td>
                          <td className="px-6 py-4 text-slate-600 font-medium">{verifiedName}</td>
                          <td className="px-6 py-4">{statusBadge()}</td>
                          <td className="px-6 py-4">
                            <button
                              type="button"
                              disabled={togglingChatbot === (s.phone_number || s.phone_label)}
                              onClick={() => handleToggleChatbot(s)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                                s.is_chatbot_enabled !== false
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                  : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                              }`}
                              title={
                                s.is_chatbot_enabled !== false
                                  ? 'Chatbot Aktif: AI membalas pesan otomatis. Klik untuk beralih ke Mode Blast Saja (AI Nonaktif).'
                                  : 'Mode Blast Saja: AI tidak membalas. Klik untuk mengaktifkan balasan otomatis AI.'
                              }
                            >
                              {togglingChatbot === (s.phone_number || s.phone_label) ? (
                                <Loader2 size={11} className="animate-spin text-slate-500" />
                              ) : s.is_chatbot_enabled !== false ? (
                                <Bot size={12} className="text-emerald-600" />
                              ) : (
                                <BotOff size={12} className="text-slate-500" />
                              )}
                              <span>
                                {s.is_chatbot_enabled !== false ? 'AI Aktif' : 'Blast Saja (AI Off)'}
                              </span>
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5">
                              <div className="relative min-w-[160px] max-w-[210px]">
                                <select
                                  disabled={assigningBot === s.phone_number}
                                  value={s.bot_settings_id || 'none'}
                                  onChange={(e) => handleAssignBotProfile(s.phone_number, e.target.value)}
                                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50 truncate cursor-pointer shadow-sm"
                                  title="Pilih Bot Profile (Persona & Knowledge Base) untuk nomor ini"
                                >
                                  <option value="none">-- Default (Project KB) --</option>
                                  {botProfiles.map((bp) => (
                                    <option key={bp.id} value={bp.id}>
                                      🤖 {bp.profile_name} ({bp.kb_project_ids?.length || 0} KB)
                                    </option>
                                  ))}
                                </select>
                                {assigningBot === s.phone_number && (
                                  <Loader2 size={12} className="animate-spin text-blue-600 absolute right-2.5 top-2 pointer-events-none" />
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">{qualityBadge()}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-2">
                              {s.status === 'DISCONNECTED' ? (
                                <>
                                  <button
                                    onClick={() => handleReconnect(s.phone_label)}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors font-bold text-[11px] whitespace-nowrap"
                                    title="Hubungkan kembali sesi ini"
                                  >
                                    <RefreshCw size={12} /> Hubungkan
                                  </button>
                                  <button
                                    onClick={() => handleDeleteSession(s.phone_label)}
                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors inline-flex items-center gap-1 font-bold text-[11px]"
                                    title="Hapus sesi secara permanen"
                                  >
                                    <Trash2 size={13} /> Hapus
                                  </button>
                                </>
                              ) : (
                                <>
                                  {/* Verify button — shown for pending/unverified numbers */}
                                  {(metaStatus === 'PENDING' || metaStatus === 'UNKNOWN' || !ms) && (
                                    <button
                                      onClick={() => setShowMetaVerifyGuideModal(true)}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-white hover:bg-amber-600 rounded-lg transition-colors font-bold text-[11px] whitespace-nowrap"
                                      title="Panduan verifikasi nomor di Meta"
                                    >
                                      <ShieldCheck size={12} />
                                      Verifikasi di Meta
                                    </button>
                                  )}
                                  {/* WA Blast Official Button for Connected Meta numbers */}
                                  {metaStatus === 'CONNECTED' && s.meta_phone_number_id && (
                                    <>
                                      <button
                                        onClick={() => {
                                          setSelectedMetaPhone(s.meta_phone_number_id || '');
                                          setBlastStep('form');
                                          setBlastResult(null);
                                          setShowMetaBlastModal(true);
                                        }}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors font-bold text-[11px] whitespace-nowrap"
                                        title="Kirim Pesan Broadcast via Meta API"
                                      >
                                        <Send size={12} />
                                        Blast
                                      </button>
                                      <button
                                        onClick={() => {
                                          setInteractivePhoneId(s.meta_phone_number_id || '');
                                          setInteractiveTo('');
                                          setInteractiveBody('');
                                          setInteractiveHeader('');
                                          setInteractiveFooter('');
                                          setInteractiveSent(false);
                                          setInteractiveError(null);
                                          setShowInteractiveModal(true);
                                        }}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors font-bold text-[11px] whitespace-nowrap"
                                        title="Kirim Pesan Interaktif (Tombol/List)"
                                      >
                                        <MousePointerClick size={12} />
                                        Interaktif
                                      </button>
                                    </>
                                  )}
                                  {/* Refresh status button */}
                                  {s.meta_phone_number_id && (
                                    <button
                                      onClick={() => {
                                        if (session?.access_token) {
                                          fetchMetaPhoneStatuses([s], session.access_token);
                                        }
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                      title="Refresh status dari Meta"
                                    >
                                      <RefreshCw size={13} className={loadingMetaStatus ? 'animate-spin' : ''} />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleDisconnect(s.phone_label)}
                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors inline-flex items-center gap-1 font-bold text-[11px]"
                                  >
                                    <LogOut size={13} /> Putuskan
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Footer hint with direct link */}
                <div className="px-6 py-3 border-t border-slate-50 flex items-center justify-between">
                  <p className="text-[11px] text-slate-400">
                    Kelola nomor bisnis di{' '}
                    <a
                      href="https://business.facebook.com/wa/manage/phone-numbers/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:text-blue-700 font-semibold underline underline-offset-2"
                    >
                      Meta WhatsApp Manager →
                    </a>
                  </p>
                  <button
                    onClick={() => {
                      const ms2 = metaSessions.filter(s => s.meta_phone_number_id);
                      if (ms2.length > 0 && session?.access_token) {
                        fetchMetaPhoneStatuses(ms2, session.access_token);
                      }
                    }}
                    className="text-[11px] text-slate-400 hover:text-slate-700 flex items-center gap-1 transition-colors"
                  >
                    <RefreshCw size={11} className={loadingMetaStatus ? 'animate-spin' : ''} />
                    Refresh Status Meta
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 2: BAILEYS GATEWAY (SCAN QR)
        ════════════════════════════════════════════════════════════════════ */}
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl border border-emerald-100 shadow-[0_4px_24px_-8px_rgba(16,185,129,0.12)] overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-emerald-50/70 via-teal-50/30 to-white flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-extrabold uppercase tracking-wider">
                  Gateway QR
                </span>
                <h2 className="font-extrabold text-slate-900 text-base">WhatsApp Gateway (Baileys / Scan QR)</h2>
              </div>
              <p className="text-slate-500 text-xs leading-relaxed max-w-2xl">
                Bebas biaya pesan per percakapan. Hubungkan nomor WA pribadi atau bisnis Anda langsung via scan QR peranti tertaut.
              </p>
            </div>

            <div className="flex flex-wrap items-center md:justify-end gap-2.5">
              <button
                onClick={() => {
                  setSelectedBaileysPhoneLabel(baileysSessions[0]?.phone_label || '');
                  setBaileysBlastStep('form');
                  setBaileysBlastResult(null);
                  setAgreedTerms(false);
                  setShowBaileysBlastModal(true);
                }}
                className="inline-flex items-center justify-center gap-1.5 px-4 h-10 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-500/20 cursor-pointer whitespace-nowrap"
              >
                <Send size={14} className="flex-shrink-0" />
                WhatsApp Blast (Baileys)
              </button>
              <button
                onClick={() => {
                  setNewLabel('');
                  setQrBase64(null);
                  setActiveSession(null);
                  setStatus('disconnected');
                  setError(null);
                  setShowAddModal(true);
                }}
                className="inline-flex items-center justify-center gap-2 px-4 h-10 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all text-xs shadow-md whitespace-nowrap"
              >
                <Plus size={15} />
                Tambah Nomor Baru (QR Code)
              </button>
            </div>
          </div>

          {/* Baileys Sessions Table */}
          <div className="overflow-x-auto">
            {loadingSessions ? (
              <div className="p-8 text-center text-slate-400 text-xs">Memuat sesi Baileys...</div>
            ) : baileysSessions.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <p className="text-xs font-semibold text-slate-600">Belum ada nomor Gateway Baileys yang terhubung.</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Klik tombol "+ Tambah Nomor Baru" di atas untuk memindai QR Code.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/60 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-6 py-3.5">Nama Sesi</th>
                    <th className="px-6 py-3.5">Nomor WhatsApp</th>
                    <th className="px-6 py-3.5">Platform</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Chatbot AI</th>
                    <th className="px-6 py-3.5">Bot Profile & KB</th>
                    <th className="px-6 py-3.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-xs">
                  {baileysSessions.map((s) => (
                    <tr key={s.phone_number} className="hover:bg-emerald-50/30 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-900 capitalize">{s.phone_label}</td>
                      <td className="px-6 py-4 font-mono text-slate-700">+{s.phone_number}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-extrabold">
                          Baileys QR
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {s.status === 'CONNECTED' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Terhubung
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 text-[10px] font-medium">
                            Terputus
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          type="button"
                          disabled={togglingChatbot === (s.phone_number || s.phone_label)}
                          onClick={() => handleToggleChatbot(s)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                            s.is_chatbot_enabled !== false
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                          }`}
                          title={
                            s.is_chatbot_enabled !== false
                              ? 'Chatbot Aktif: AI membalas pesan otomatis. Klik untuk beralih ke Mode Blast Saja (AI Nonaktif).'
                              : 'Mode Blast Saja: AI tidak membalas. Klik untuk mengaktifkan balasan otomatis AI.'
                          }
                        >
                          {togglingChatbot === (s.phone_number || s.phone_label) ? (
                            <Loader2 size={11} className="animate-spin text-slate-500" />
                          ) : s.is_chatbot_enabled !== false ? (
                            <Bot size={12} className="text-emerald-600" />
                          ) : (
                            <BotOff size={12} className="text-slate-500" />
                          )}
                          <span>
                            {s.is_chatbot_enabled !== false ? 'AI Aktif' : 'Blast Saja (AI Off)'}
                          </span>
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          <div className="relative min-w-[160px] max-w-[210px]">
                            <select
                              disabled={assigningBot === s.phone_number}
                              value={s.bot_settings_id || 'none'}
                              onChange={(e) => handleAssignBotProfile(s.phone_number, e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all disabled:opacity-50 truncate cursor-pointer shadow-sm"
                              title="Pilih Bot Profile (Persona & Knowledge Base) untuk nomor ini"
                            >
                              <option value="none">-- Default (Project KB) --</option>
                              {botProfiles.map((bp) => (
                                <option key={bp.id} value={bp.id}>
                                  🤖 {bp.profile_name} ({bp.kb_project_ids?.length || 0} KB)
                                </option>
                              ))}
                            </select>
                            {assigningBot === s.phone_number && (
                              <Loader2 size={12} className="animate-spin text-emerald-600 absolute right-2.5 top-2 pointer-events-none" />
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {s.status === 'CONNECTED' && (
                            <button
                              onClick={() => {
                                setSelectedBaileysPhoneLabel(s.phone_label);
                                setBaileysBlastStep('form');
                                setBaileysBlastResult(null);
                                setAgreedTerms(false);
                                setShowBaileysBlastModal(true);
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors font-bold text-[11px] whitespace-nowrap"
                              title="Kirim Broadcast WA via Gateway Baileys"
                            >
                              <Send size={12} /> Kirim Blast
                            </button>
                          )}
                          <button
                            onClick={() => handleDisconnect(s.phone_label)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors inline-flex items-center gap-1 font-bold text-[11px]"
                          >
                            <LogOut size={13} /> Putuskan
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Disclaimer / Tips info */}
        <div className="bg-amber-50/80 backdrop-blur-md rounded-2xl p-4 border border-amber-200/70 shadow-sm flex items-start gap-3">
          <div className="p-1.5 bg-amber-100 rounded-lg text-amber-600 flex-shrink-0 mt-0.5">
            <AlertTriangle size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-amber-900 text-xs mb-0.5 uppercase tracking-wide">Catatan Keamanan Koneksi</h3>
            <p className="text-xs text-amber-800/90 leading-relaxed">
              Koneksi Baileys (QR Code) adalah <em>Unofficial API</em>. Jika Anda membutuhkan stabilitas enterprise tanpa risiko pemblokiran nomor, disarankan menggunakan <strong>WhatsApp Official (Meta Cloud API)</strong>.
            </p>
          </div>
          <button
            onClick={() => setShowTipsModal(true)}
            className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-900 transition-colors flex-shrink-0"
          >
            <Info size={13} /> Panduan
          </button>
        </div>
      </div>

      {/* ── Add Number Modal (QR Code Wizard) ─────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-400 to-blue-500" />
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
                <Smartphone className="text-emerald-500" size={20} />
                Hubungkan Nomor Gateway (QR Code)
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setActiveSession(null);
                  setQrBase64(null);
                }}
                className="p-1.5 bg-slate-50 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            {status === 'disconnected' ? (
              <form onSubmit={handleStartConnection} className="space-y-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Masukkan label identitas nomor Anda (misalnya: <code>default</code>, <code>sales</code>, atau <code>support</code>).
                </p>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                  <FolderKanban size={13} />
                  Akan ditambahkan ke project: {activeProject?.name || '—'}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Nama Label Sesi</label>
                  <input
                    type="text"
                    required
                    placeholder="contoh: sales"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-semibold"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full py-3 ${loading ? 'bg-slate-700 cursor-not-allowed' : 'bg-slate-900 hover:bg-slate-850'} text-white text-sm font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-2`}
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} className="text-emerald-400" />}
                  Mulai Koneksi Sesi
                </button>
              </form>
            ) : (
              <div className="flex flex-col sm:flex-row gap-6 items-center py-2">
                <div className="flex-1 text-center sm:text-left">
                  <h4 className="text-base font-extrabold text-slate-800 mb-3 capitalize">Sesi: {activeSession}</h4>
                  
                  {status === 'connecting' ? (
                    <div className="flex items-center gap-2 py-4">
                      <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
                      <span className="text-slate-600 text-sm font-medium">Memulai koneksi Baileys...</span>
                    </div>
                  ) : (
                    <div className="space-y-3 text-slate-600 text-xs mb-5">
                      {[
                        'Buka WhatsApp di ponsel Anda',
                        'Buka Pengaturan → Perangkat Tertaut',
                        'Ketuk Tautkan Perangkat & pindai kode ini',
                      ].map((step, i) => (
                        <div key={i} className="flex items-start gap-2.5">
                          <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center flex-shrink-0 text-[10px] mt-0.5">{i + 1}</div>
                          <p dangerouslySetInnerHTML={{ __html: step.replace(/→/g, '<strong>→</strong>') }} />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] px-2 py-1 rounded bg-slate-100 text-slate-500 font-bold animate-pulse uppercase tracking-wider">
                      Status: {status}
                    </span>
                  </div>
                </div>

                {/* QR Image */}
                {status === 'qr' && qrBase64 && (
                  <div className="relative flex-shrink-0 group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-emerald-400 to-teal-400 rounded-2xl blur opacity-20 group-hover:opacity-35 transition duration-700" />
                    <div className="relative w-44 h-44 p-2.5 bg-white rounded-2xl shadow-lg flex items-center justify-center border border-slate-100 overflow-hidden">
                      <img src={qrBase64} alt="WhatsApp QR Code" className="w-full h-full object-contain relative z-10" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Meta Verification Guide Modal ──────────────────── */}
      {showMetaVerifyGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setShowMetaVerifyGuideModal(false); }}>
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl relative overflow-hidden max-h-[90vh] flex flex-col">
            {/* Top gradient bar */}
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#25D366] via-[#1877F2] to-violet-500" />

            {/* Header */}
            <div className="px-7 pt-7 pb-5 border-b border-slate-100 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#1877F2] to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                  <ShieldCheck size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900">Panduan Verifikasi Nomor WhatsApp</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Ikuti langkah berikut untuk mengaktifkan nomor Anda di Meta</p>
                </div>
              </div>
              <button
                onClick={() => setShowMetaVerifyGuideModal(false)}
                className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors text-slate-500"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 px-7 py-6 space-y-6">

              {/* Alert: 2 requirements */}
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
                <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-amber-900">Ada 2 Hal yang Harus Dilengkapi</p>
                  <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                    Nomor WhatsApp di Meta tidak cukup hanya diverifikasi satu kali. Anda juga harus <strong>melengkapi profil bisnis perusahaan</strong> agar nomor bisa berjalan normal dan mendapat status <span className="bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.5 rounded">CONNECTED</span>.
                  </p>
                </div>
              </div>

              {/* PART 1: Company Data */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-lg bg-[#1877F2] flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-[10px] font-black">1</span>
                  </div>
                  <h3 className="text-sm font-black text-slate-900">Lengkapi Data Perusahaan di Meta Business Manager</h3>
                </div>
                <div className="space-y-2.5 ml-8">
                  {[
                    {
                      icon: '🏢',
                      title: 'Nama Bisnis Resmi',
                      desc: 'Masukkan nama perusahaan / bisnis yang terdaftar secara resmi (sesuai akta atau NIB).',
                      required: true,
                    },
                    {
                      icon: '🌐',
                      title: 'Website Bisnis',
                      desc: 'URL website resmi perusahaan Anda. Jika belum punya, bisa gunakan halaman media sosial resmi (Facebook Page / Instagram bisnis).',
                      required: true,
                    },
                    {
                      icon: '📂',
                      title: 'Kategori Industri',
                      desc: 'Pilih kategori industri yang paling sesuai dengan bisnis Anda (misal: Retail, Jasa, Teknologi, dll).',
                      required: true,
                    },
                    {
                      icon: '📍',
                      title: 'Alamat Bisnis',
                      desc: 'Alamat lengkap tempat usaha Anda beroperasi, termasuk kota dan negara.',
                      required: false,
                    },
                    {
                      icon: '✅',
                      title: 'Verifikasi Bisnis (Business Verification)',
                      desc: 'Proses verifikasi oleh Meta di mana Anda mengunggah dokumen resmi bisnis (KTP direktur, SIUP, NPWP, atau NIB). Ini membuka limit pengiriman pesan lebih tinggi.',
                      required: false,
                    },
                  ].map((item) => (
                    <div key={item.title} className="flex items-start gap-3 bg-slate-50 border border-slate-100 rounded-xl p-3">
                      <span className="text-base flex-shrink-0">{item.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-xs font-bold text-slate-800">{item.title}</p>
                          {item.required && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">WAJIB</span>
                          )}
                          {!item.required && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">DIREKOMENDASIKAN</span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 ml-8">
                  <a
                    href="https://business.facebook.com/settings/info"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1877F2] hover:underline"
                  >
                    <ExternalLink size={12} /> Buka Pengaturan Bisnis Meta →
                  </a>
                </div>
              </div>

              <div className="border-t border-slate-100" />

              {/* PART 2: Phone Number Verification */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-lg bg-[#25D366] flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-[10px] font-black">2</span>
                  </div>
                  <h3 className="text-sm font-black text-slate-900">Verifikasi Nomor Telepon WhatsApp</h3>
                </div>
                <div className="space-y-2 ml-8">
                  {[
                    { step: '①', text: 'Buka Meta Business Manager → pilih akun WhatsApp Business (WABA) Anda.' },
                    { step: '②', text: 'Masuk ke menu "Nomor Telepon" (Phone Numbers).' },
                    { step: '③', text: 'Klik ikon Pengaturan (⚙️) pada nomor yang berstatus Pending.' },
                    { step: '④', text: 'Pilih "Verify Phone Number" → masukkan kode OTP yang dikirim via SMS atau telepon.' },
                    { step: '⑤', text: 'Tunggu beberapa menit setelah verifikasi. Status akan berubah dari "Pending" menjadi "Connected" ✅.' },
                  ].map((item) => (
                    <div key={item.step} className="flex items-start gap-3">
                      <span className="text-base font-black text-slate-400 flex-shrink-0 w-5 text-center">{item.step}</span>
                      <p className="text-xs text-slate-700 leading-relaxed">{item.text}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 ml-8">
                  <a
                    href="https://business.facebook.com/wa/manage/phone-numbers/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#25D366] hover:underline"
                  >
                    <ExternalLink size={12} /> Buka Manajemen Nomor WhatsApp →
                  </a>
                </div>
              </div>

              <div className="border-t border-slate-100" />

              {/* Status meaning */}
              <div>
                <h3 className="text-sm font-black text-slate-900 mb-3">Arti Status Nomor</h3>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { status: 'CONNECTED', color: 'bg-emerald-50 border-emerald-200 text-emerald-700', dot: 'bg-emerald-500', desc: 'Nomor aktif & siap digunakan bot.' },
                    { status: 'PENDING', color: 'bg-amber-50 border-amber-200 text-amber-700', dot: 'bg-amber-500', desc: 'Menunggu verifikasi OTP atau data bisnis.' },
                    { status: 'FLAGGED', color: 'bg-orange-50 border-orange-200 text-orange-700', dot: 'bg-orange-500', desc: 'Kualitas rendah akibat laporan spam. Kurangi broadcast.' },
                    { status: 'BANNED', color: 'bg-red-50 border-red-200 text-red-700', dot: 'bg-red-500', desc: 'Nomor diblokir permanen oleh Meta.' },
                    { status: 'UNKNOWN', color: 'bg-slate-50 border-slate-200 text-slate-600', dot: 'bg-slate-400', desc: 'Status belum dapat diambil dari server Meta.' },
                    { status: 'DISCONNECTED', color: 'bg-slate-50 border-slate-200 text-slate-600', dot: 'bg-slate-400', desc: 'Koneksi terputus, perlu dihubungkan ulang.' },
                  ].map((s) => (
                    <div key={s.status} className={`flex items-start gap-2.5 p-3 rounded-xl border ${s.color}`}>
                      <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${s.dot}`} />
                      <div>
                        <p className="text-[11px] font-black">{s.status}</p>
                        <p className="text-[10px] opacity-80 leading-relaxed mt-0.5">{s.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pro tip */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-4 flex gap-3">
                <Zap size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-white mb-1">💡 Tips Penting</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Nomor yang belum diverifikasi bisnis (<strong className="text-slate-300">Business Verification</strong>) hanya bisa mengirim maksimal <strong className="text-amber-400">250 percakapan/hari</strong>. Setelah diverifikasi, limit naik hingga <strong className="text-emerald-400">100.000+ percakapan/hari</strong>.
                  </p>
                </div>
              </div>

            </div>

            {/* Footer actions */}
            <div className="px-7 py-5 border-t border-slate-100 flex items-center justify-between gap-3 bg-slate-50/50 flex-wrap">
              <button
                onClick={() => setShowMetaVerifyGuideModal(false)}
                className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Tutup
              </button>
              <div className="flex items-center gap-2">
                <a
                  href="https://business.facebook.com/settings/info"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-[#1877F2] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors"
                >
                  <ExternalLink size={13} /> Data Bisnis
                </a>
                <a
                  href="https://business.facebook.com/wa/manage/phone-numbers/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-[#1877F2] hover:bg-[#166fe5] rounded-xl transition-colors shadow-sm"
                >
                  <MessageCircle size={13} /> Verifikasi Nomor
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tips Modal ─────────────────────────────────────── */}
      {showTipsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full p-7 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-400 to-blue-500" />
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
                <ShieldCheck className="text-emerald-500" size={20} />
                Panduan Anti-Blokir Gateway
              </h3>
              <button
                onClick={() => setShowTipsModal(false)}
                className="p-1.5 bg-slate-50 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              {[
                { color: 'emerald', num: '1', title: 'Gunakan Nomor Khusus', desc: 'Selalu gunakan nomor sekunder untuk bot. Sangat berisiko jika memakai nomor pribadi.' },
                { color: 'blue', num: '2', title: '"Warm-Up" Nomor Baru', desc: 'Chat manual selama 3–5 hari sebelum disambungkan ke sistem AI.' },
                { color: 'rose', num: '3', title: 'Dilarang Spam', desc: 'Jangan broadcast ke orang yang tidak menyimpan nomor Anda. Laporan "Block" menyebabkan pemblokiran.' },
              ].map((tip) => (
                <div key={tip.num} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <h4 className="font-bold text-slate-800 text-sm mb-1.5 flex items-center gap-2">
                    <div className={`w-5 h-5 rounded-full bg-${tip.color}-100 text-${tip.color}-600 flex items-center justify-center text-xs font-bold`}>{tip.num}</div>
                    {tip.title}
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed pl-7">{tip.desc}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowTipsModal(false)}
              className="mt-5 w-full py-3 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 transition-colors shadow-lg"
            >
              Saya Mengerti
            </button>
          </div>
        </div>
      )}

      {/* ── Meta Pending Number Modal ─────────────────────────────────── */}
      {metaPendingInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full p-7 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-amber-400 to-orange-500" />
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
                <AlertTriangle className="text-amber-500" size={20} />
                Nomor Belum Aktif di Meta
              </h3>
              <button
                onClick={() => setMetaPendingInfo(null)}
                className="p-1.5 bg-slate-50 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5 text-xs text-amber-800 leading-relaxed">
              {metaPendingInfo.message}
            </div>

            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Langkah selanjutnya:</p>
            <div className="space-y-3 mb-5">
              {[
                { num: '1', title: 'Buka Meta Business Manager', desc: 'Kunjungi business.facebook.com → WhatsApp Manager → Phone Numbers' },
                { num: '2', title: 'Verifikasi Nomor via SMS/Telepon', desc: 'Pilih nomor Anda → klik "Verify" → Meta akan SMS atau telepon untuk kode OTP' },
                { num: '3', title: 'Hubungkan Kembali ke PulseAI', desc: 'Setelah nomor terverifikasi di Meta, kembali ke halaman ini dan klik "Log in with Facebook" kembali' },
              ].map((step) => (
                <div key={step.num} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                  <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center flex-shrink-0 text-xs">
                    {step.num}
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-xs">{step.title}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {metaPendingInfo.wabaId && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-5 flex items-center gap-2">
                <Info size={13} className="text-blue-500 flex-shrink-0" />
                <p className="text-[11px] text-blue-700">
                  WABA ID Anda: <strong className="font-mono">{metaPendingInfo.wabaId}</strong> — simpan ini untuk referensi support.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setMetaPendingInfo(null);
                  window.open('https://business.facebook.com/wa/manage/phone-numbers/', '_blank');
                }}
                className="flex-1 py-3 bg-[#1877F2] text-white text-sm font-bold rounded-xl hover:bg-[#166fe5] transition-colors shadow-md"
              >
                Buka Meta Business Manager
              </button>
              <button
                onClick={() => setMetaPendingInfo(null)}
                className="px-5 py-3 bg-slate-100 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-200 transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tutorial Modal: Panduan Hubung Meta Cloud API ──────────────────────── */}
      {showTutorialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-7 shadow-2xl relative my-8">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#1877F2] to-indigo-600" />
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 text-[#1877F2] rounded-xl font-bold">
                  <BookOpen size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">Panduan Lengkap Integrasi Meta Official API</h3>
                  <p className="text-xs text-slate-500">Langkah demi langkah menghubungkan Meta WhatsApp Cloud API tanpa error</p>
                </div>
              </div>
              <button
                onClick={() => setShowTutorialModal(false)}
                className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors text-slate-500"
              >
                <X size={18} />
              </button>
            </div>

            {/* Steps Checklist */}
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              {[
                {
                  step: 'Langkah 1',
                  title: 'Klik "Log in with Facebook"',
                  desc: 'Klik tombol biru "Log in with Facebook" di atas. Jendela Facebook Embedded Signup akan terbuka otomatis.',
                  badge: 'Di Dashboard PulseAI',
                  color: 'blue'
                },
                {
                  step: 'Langkah 2',
                  title: 'Pilih / Buat Meta Business Account',
                  desc: 'Pilih Business Account Anda di Facebook, lalu buat/pilih WhatsApp Business Account (WABA) dan masukkan nama profil bisnis Anda.',
                  badge: 'Popup Facebook',
                  color: 'indigo'
                },
                {
                  step: 'Langkah 3',
                  title: 'Masukkan Nomor HP & Masukkan Kode OTP SMS',
                  desc: 'Masukkan nomor WhatsApp bisnis baru yang belum terdaftar WA biasa. Pilih verifikasi via SMS/Telepon, lalu ketik 6 digit kode OTP.',
                  badge: 'PENTING: Harus Nomor Baru',
                  color: 'amber'
                },
                {
                  step: 'Langkah 4',
                  title: 'Penyebab Status "Pending" & Cara Mengatasinya',
                  desc: 'Jika setelah verifikasi status masih "Pending", buka Meta Business Manager → Settings (⚙) pada nomor tersebut → Cek peninjauan Display Name. Biasanya disetujui Meta dalam 5–30 menit.',
                  badge: 'Verifikasi Nama Bisnis',
                  color: 'rose'
                },
                {
                  step: 'Langkah 5',
                  title: 'Refresh Status di Dashboard',
                  desc: 'Setelah nama bisnis disetujui oleh Meta, kembali ke dashboard PulseAI dan klik tombol "Refresh Status Meta" (icon putar) di tabel.',
                  badge: 'Selesai & Aktif',
                  color: 'emerald'
                },
              ].map((item, idx) => (
                <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-extrabold flex items-center justify-center text-xs flex-shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-bold text-slate-800 text-sm">{item.title}</h4>
                      <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-bold text-slate-600">
                        {item.badge}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <a
                href="https://business.facebook.com/wa/manage/phone-numbers/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1877F2] hover:underline"
              >
                <ExternalLink size={14} /> Buka Meta Business Manager Direct Link
              </a>
              <button
                onClick={() => setShowTutorialModal(false)}
                className="w-full sm:w-auto px-6 py-2.5 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition-colors"
              >
                Tutup Panduan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Official Meta WhatsApp Blast Modal ─────────────────────────────────── */}
      {showMetaBlastModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-7 shadow-2xl relative my-8">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl font-bold">
                  <Send size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">WhatsApp Blast Official (Meta Cloud API)</h3>
                  <p className="text-xs text-slate-500">Kirim broadcast massal aman tanpa risiko nomor diblokir via Meta Official</p>
                </div>
              </div>
              <button
                onClick={() => setShowMetaBlastModal(false)}
                className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors text-slate-500"
              >
                <X size={18} />
              </button>
            </div>

            {blastStep === 'form' ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!targetNumbers.trim()) {
                    setError('Masukkan setidaknya satu nomor tujuan.');
                    return;
                  }
                  setBlastLoading(true);
                  setError(null);

                  const rawList = targetNumbers.split(/[\n,;]+/).map(n => n.trim()).filter(Boolean);
                  if (rawList.length === 0) {
                    setError('Format nomor tujuan tidak valid.');
                    setBlastLoading(false);
                    return;
                  }

                  try {
                    const res = await fetch('/api/whatsapp/blast/start', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session?.access_token}`
                      },
                      body: JSON.stringify({
                        platform: 'meta',
                        phoneNumberId: selectedMetaPhone || metaSessions[0]?.meta_phone_number_id,
                        targetNumbers: rawList,
                        templateName: templateName.trim() || 'hello_world',
                        languageCode: 'en_US',
                        delayFrom: 1,
                        delayTo: 3
                      })
                    });
                    const data = await res.json();
                    if (data.success && data.job) {
                      setActiveBlastJob(data.job);
                      setShowActiveBlastWidget(true);
                      setBlastStep('success');
                      setBlastResult({ total: data.job.total, successCount: 0, failedCount: 0 });
                    } else {
                      setError(data.message || 'Gagal memulai broadcast Meta.');
                    }
                  } catch (err: any) {
                    setError(err.message || 'Gagal menghubungi server untuk broadcast Meta.');
                  } finally {
                    setBlastLoading(false);
                  }
                }}
                className="space-y-4"
              >
                {/* Select Meta Sender Number */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Pilih Nomor Pengirim Meta Official
                  </label>
                  <select
                    value={selectedMetaPhone}
                    onChange={(e) => setSelectedMetaPhone(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-indigo-500"
                  >
                    {metaSessions.map(s => (
                      <option key={s.meta_phone_number_id} value={s.meta_phone_number_id}>
                        {s.phone_label} (+{s.phone_number})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Template Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                    <span>Nama Template Meta (HSM)</span>
                    <span className="text-[10px] text-indigo-600 font-normal">Default: hello_world</span>
                  </label>
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Contoh: hello_world, promo_diskon_september"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Meta mewajibkan pesan broadcast menggunakan template yang sudah diajukan & disetujui di Meta WhatsApp Manager.
                  </p>
                </div>

                {/* Target Numbers Textarea */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Nomor Tujuan (Pisahkan dengan baris baru atau koma)
                  </label>
                  <textarea
                    rows={4}
                    value={targetNumbers}
                    onChange={(e) => setTargetNumbers(e.target.value)}
                    placeholder="Contoh:&#10;6281234567890&#10;6289876543210"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs text-indigo-900 flex items-start gap-2">
                  <ShieldCheck size={16} className="text-indigo-600 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-relaxed">
                    Broadcast melalui Meta Official Cloud API diproses secara instan oleh server Meta. 1000 percakapan Service/bulan gratis tanpa biaya pesan dari Meta.
                  </p>
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="submit"
                    disabled={blastLoading}
                    className="flex-1 py-3 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer"
                  >
                    {blastLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    {blastLoading ? 'Mengirim Broadcast...' : 'Mulai Kirim WhatsApp Blast'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMetaBlastModal(false)}
                    className="px-5 py-3 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors"
                  >
                    Batal
                  </button>
                </div>
              </form>
            ) : (
              <div className="text-center py-4 space-y-4">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${
                  activeBlastJob?.status === 'running'
                    ? 'bg-indigo-100 text-indigo-600 animate-pulse'
                    : activeBlastJob?.status === 'completed'
                    ? 'bg-emerald-100 text-emerald-600'
                    : 'bg-slate-100 text-slate-600'
                }`}>
                  {activeBlastJob?.status === 'running' ? <Radio size={30} /> : <CheckCircle2 size={32} />}
                </div>

                <div>
                  <h4 className="text-base font-extrabold text-slate-900">
                    {activeBlastJob?.status === 'running'
                      ? 'Broadcast Meta Sedang Berjalan di Latar Belakang!'
                      : activeBlastJob?.status === 'completed'
                      ? 'Broadcast Meta Selesai!'
                      : 'Broadcast Meta Dihentikan'}
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    {activeBlastJob?.status === 'running'
                      ? 'Pesan sedang diproses oleh server di latar belakang. Anda dapat menutup modal ini kapan saja tanpa membatalkan pengiriman.'
                      : 'Seluruh antrean pesan broadcast telah selesai diproses.'}
                  </p>
                </div>

                {activeBlastJob?.status === 'running' && (
                  <div className="p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-2xl space-y-2">
                    <div className="flex justify-between text-xs font-bold text-indigo-900">
                      <span>Proses Pengiriman ({activeBlastJob.current} dari {activeBlastJob.total})</span>
                      <span>{Math.round((activeBlastJob.current / Math.max(1, activeBlastJob.total)) * 100)}%</span>
                    </div>
                    <div className="w-full h-2 bg-indigo-200/60 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-600 transition-all duration-300 rounded-full"
                        style={{ width: `${Math.round((activeBlastJob.current / Math.max(1, activeBlastJob.total)) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Total Target</p>
                    <p className="text-lg font-extrabold text-slate-800">{activeBlastJob?.total || blastResult?.total || 0}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-emerald-600 font-bold uppercase">Berhasil</p>
                    <p className="text-lg font-extrabold text-emerald-600">{activeBlastJob?.successCount ?? blastResult?.successCount ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-rose-500 font-bold uppercase">Gagal</p>
                    <p className="text-lg font-extrabold text-rose-500">{activeBlastJob?.failedCount ?? blastResult?.failedCount ?? 0}</p>
                  </div>
                </div>

                {activeBlastJob && (
                  <button
                    type="button"
                    onClick={() => setShowBlastLogsModal(true)}
                    className="w-full py-2.5 px-4 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    <FileText size={14} className="text-indigo-600" />
                    Lihat Rincian Log & Alasan Gagal per Nomor
                  </button>
                )}

                <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                  <button
                    onClick={() => setShowMetaBlastModal(false)}
                    className="flex-1 py-3 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors cursor-pointer shadow-md"
                  >
                    {activeBlastJob?.status === 'running' ? 'Jalankan di Background (Tutup Modal)' : 'Selesai & Tutup'}
                  </button>
                  {activeBlastJob?.status === 'running' && (
                    <button
                      onClick={handleCancelBlast}
                      disabled={cancellingBlast}
                      className="py-3 px-5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                    >
                      {cancellingBlast ? 'Menghentikan...' : 'Hentikan Broadcast'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Baileys Gateway WhatsApp Blast Modal ───────────────────────────────── */}
      {showBaileysBlastModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-7 shadow-2xl relative my-auto max-h-[90vh] flex flex-col overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-700" />
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl font-bold">
                  <Send size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">WhatsApp Blast Gateway (Baileys QR)</h3>
                  <p className="text-xs text-slate-500">Kirim broadcast massal menggunakan nomor WA pribadi / bisnis Anda</p>
                </div>
              </div>
              <button
                onClick={() => setShowBaileysBlastModal(false)}
                className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors text-slate-500"
              >
                <X size={18} />
              </button>
            </div>

            {baileysBlastStep === 'form' ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!agreedTerms) {
                    setError('Anda harus menyetujui Syarat & Ketentuan risiko pemblokiran WhatsApp.');
                    return;
                  }
                  if (!baileysTargetNumbers.trim()) {
                    setError('Masukkan setidaknya satu nomor tujuan.');
                    return;
                  }
                  if (!baileysMessageText.trim()) {
                    setError('Isi pesan broadcast tidak boleh kosong.');
                    return;
                  }

                  setBaileysBlastLoading(true);
                  setError(null);

                  const rawList = baileysTargetNumbers.split(/[\n,;]+/).map(n => n.trim()).filter(Boolean);
                  if (rawList.length === 0) {
                    setError('Format nomor tujuan tidak valid.');
                    setBaileysBlastLoading(false);
                    return;
                  }

                  const label = selectedBaileysPhoneLabel || baileysSessions[0]?.phone_label || 'default';

                  try {
                    const res = await fetch('/api/whatsapp/blast/start', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session?.access_token}`
                      },
                      body: JSON.stringify({
                        platform: 'baileys',
                        phoneLabel: label,
                        targetNumbers: rawList,
                        message: baileysMessageText,
                        delayFrom: baileysDelayFrom,
                        delayTo: baileysDelayTo
                      })
                    });
                    const data = await res.json();
                    if (data.success && data.job) {
                      setActiveBlastJob(data.job);
                      setShowActiveBlastWidget(true);
                      setBaileysBlastStep('success');
                      setBaileysBlastResult({ total: data.job.total, successCount: 0, failedCount: 0 });
                    } else {
                      setError(data.message || 'Gagal memulai broadcast Gateway.');
                    }
                  } catch (err: any) {
                    setError(err.message || 'Gagal menghubungi server untuk broadcast.');
                  } finally {
                    setBaileysBlastLoading(false);
                  }
                }}
                className="flex flex-col flex-1 overflow-hidden"
              >
                <div className="overflow-y-auto pr-1 space-y-4 flex-1">
                  {/* Row 1: Session & Delay (2 Columns) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Pilih Sesi WhatsApp Pengirim
                      </label>
                      <select
                        value={selectedBaileysPhoneLabel}
                        onChange={(e) => setSelectedBaileysPhoneLabel(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-emerald-500"
                      >
                        {baileysSessions.map(s => (
                          <option key={s.phone_number} value={s.phone_label}>
                            {s.phone_label} (+{s.phone_number})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                        <span>Jeda Pengiriman / Delay (Acak)</span>
                        <span className="text-[10px] text-slate-400 font-normal">Min: 1 detik</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <input
                            type="number"
                            min={1}
                            max={3600}
                            value={baileysDelayFrom}
                            onChange={(e) => {
                              const v = Math.max(1, Number(e.target.value));
                              setBaileysDelayFrom(v);
                              if (v > baileysDelayTo) setBaileysDelayTo(v);
                            }}
                            placeholder="Min"
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 pr-12"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">dari</span>
                        </div>
                        <span className="text-slate-400 font-bold text-sm">–</span>
                        <div className="relative flex-1">
                          <input
                            type="number"
                            min={baileysDelayFrom}
                            max={3600}
                            value={baileysDelayTo}
                            onChange={(e) => setBaileysDelayTo(Math.max(baileysDelayFrom, Number(e.target.value)))}
                            placeholder="Max"
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 pr-12"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">dtk</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Jeda acak antara <strong>{baileysDelayFrom}</strong>–<strong>{baileysDelayTo}</strong> detik per pesan. Disarankan ≥ 60 dtk agar tidak terdeteksi bot.
                      </p>
                    </div>
                  </div>

                  {/* Row 2: Message Text & Target Numbers (2 Columns) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Message Content */}
                    <div className="flex flex-col">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Isi Pesan Broadcast
                      </label>
                      <textarea
                        rows={5}
                        value={baileysMessageText}
                        onChange={(e) => setBaileysMessageText(e.target.value)}
                        placeholder="Tulis pesan Anda di sini..."
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500 leading-relaxed flex-1"
                      />
                      
                      {/* Formatting guide card */}
                      <div className="mt-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 text-[11px] text-slate-600 space-y-0.5">
                        <p className="font-bold text-slate-800 flex items-center gap-1 text-[11px]">
                          <Info size={12} className="text-emerald-600 shrink-0" /> Panduan Format Pesan:
                        </p>
                        <p className="text-[10px] text-slate-500 leading-snug">
                          Format WA: <code className="bg-white px-1 rounded border">*tebal*</code>, <code className="bg-white px-1 rounded border">_miring_</code>, <code className="bg-white px-1 rounded border">~coret~</code>. Berikan salam sopan &amp; opsi STOP untuk opt-out.
                        </p>
                      </div>
                    </div>

                    {/* Target Numbers */}
                    <div className="flex flex-col">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Nomor Tujuan (Pisahkan baris / koma)
                      </label>
                      <textarea
                        rows={8}
                        value={baileysTargetNumbers}
                        onChange={(e) => setBaileysTargetNumbers(e.target.value)}
                        placeholder="Contoh:&#10;081234567890&#10;6289876543210&#10;085554443330"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-emerald-500 flex-1"
                      />
                    </div>
                  </div>

                  {/* Server Background Info Banner */}
                  <div className="p-3 bg-emerald-50/70 border border-emerald-200/70 rounded-2xl flex items-center gap-2.5">
                    <Radio size={16} className="text-emerald-600 shrink-0" />
                    <p className="text-xs text-emerald-900 leading-relaxed">
                      <strong>Berjalan di Background Server:</strong> Setelah dimulai, proses pengiriman berjalan di server VPS. Anda dapat menutup modal atau browser kapan saja tanpa menunggu.
                    </p>
                  </div>

                  {/* Row 3: Tips Anti-Blokir (Full Width compact) */}
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl">
                    <p className="text-xs font-extrabold text-amber-900 flex items-center gap-1.5 mb-1">
                      <ShieldCheck size={14} className="text-amber-600 shrink-0" /> Tips Utama Agar Nomor Tidak Terblokir:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-amber-800/90 leading-relaxed">
                      <p>• <strong>Gunakan Delay ≥ 5 dtk:</strong> Hindari kirim instan agar tidak terdeteksi bot.</p>
                      <p>• <strong>Jangan Spam Kontak Baru:</strong> Prioritaskan kontak yang menyimpan nomor Anda.</p>
                      <p>• <strong>Warm-Up Nomor Baru:</strong> Jangan langsung blast masif di nomor baru.</p>
                      <p>• <strong>Variasikan Isi Pesan:</strong> Hindari pesan yang persis sama secara masif.</p>
                    </div>
                  </div>

                  {/* Terms and Conditions Checkbox */}
                  <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-2xl">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={agreedTerms}
                        onChange={(e) => setAgreedTerms(e.target.checked)}
                        className="mt-0.5 rounded border-rose-300 text-rose-600 focus:ring-rose-500 w-4 h-4 shrink-0"
                      />
                      <span className="text-xs text-rose-900 leading-relaxed">
                        Saya memahami dan menyetujui bahwa pengiriman pesan massal via Gateway QR (Unofficial API) memiliki risiko nomor diblokir oleh WhatsApp. PulseAI tidak bertanggung jawab atas pemblokiran nomor akibat pelanggaran spam.
                      </span>
                    </label>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex gap-3 shrink-0 mt-2">
                  <button
                    type="submit"
                    disabled={baileysBlastLoading || !agreedTerms}
                    className="flex-1 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {baileysBlastLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    {baileysBlastLoading ? 'Menyiapkan Broadcast...' : 'Mulai Kirim Blast di Background'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBaileysBlastModal(false)}
                    className="px-5 py-2.5 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                </div>
              </form>
            ) : (
              <div className="text-center py-4 space-y-4">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${
                  activeBlastJob?.status === 'running'
                    ? 'bg-emerald-100 text-emerald-600 animate-pulse'
                    : activeBlastJob?.status === 'completed'
                    ? 'bg-emerald-100 text-emerald-600'
                    : 'bg-slate-100 text-slate-600'
                }`}>
                  {activeBlastJob?.status === 'running' ? <Radio size={30} /> : <CheckCircle2 size={32} />}
                </div>

                <div>
                  <h4 className="text-base font-extrabold text-slate-900">
                    {activeBlastJob?.status === 'running'
                      ? 'Broadcast Gateway Sedang Berjalan di Latar Belakang!'
                      : activeBlastJob?.status === 'completed'
                      ? 'Broadcast Gateway Baileys Selesai!'
                      : 'Broadcast Gateway Dihentikan'}
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    {activeBlastJob?.status === 'running'
                      ? `Pesan sedang dikirim oleh server dengan jeda acak ${activeBlastJob.delayFrom}–${activeBlastJob.delayTo} detik per pesan. Anda dapat menutup jendela ini dan berpindah halaman tanpa membatalkan pengiriman.`
                      : 'Seluruh antrean pesan broadcast gateway telah selesai diproses.'}
                  </p>
                </div>

                {activeBlastJob?.status === 'running' && (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2">
                    <div className="flex justify-between text-xs font-bold text-emerald-800">
                      <span>Proses Pengiriman ({activeBlastJob.current} dari {activeBlastJob.total})</span>
                      <span>{Math.round((activeBlastJob.current / Math.max(1, activeBlastJob.total)) * 100)}%</span>
                    </div>
                    <div className="w-full h-2 bg-emerald-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 transition-all duration-300 rounded-full"
                        style={{ width: `${Math.round((activeBlastJob.current / Math.max(1, activeBlastJob.total)) * 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-emerald-600 text-center">
                      Jeda acak {activeBlastJob.delayFrom}–{activeBlastJob.delayTo} detik per pesan berjalan di server VPS.
                    </p>
                  </div>
                )}

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Total Target</p>
                    <p className="text-lg font-extrabold text-slate-800">{activeBlastJob?.total || baileysBlastResult?.total || 0}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-emerald-600 font-bold uppercase">Berhasil</p>
                    <p className="text-lg font-extrabold text-emerald-600">{activeBlastJob?.successCount ?? baileysBlastResult?.successCount ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-rose-500 font-bold uppercase">Gagal</p>
                    <p className="text-lg font-extrabold text-rose-500">{activeBlastJob?.failedCount ?? baileysBlastResult?.failedCount ?? 0}</p>
                  </div>
                </div>

                {activeBlastJob && (
                  <button
                    type="button"
                    onClick={() => setShowBlastLogsModal(true)}
                    className="w-full py-2.5 px-4 bg-emerald-50/80 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    <FileText size={14} className="text-emerald-700" />
                    Lihat Rincian Log & Alasan Gagal per Nomor
                  </button>
                )}

                <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                  <button
                    onClick={() => setShowBaileysBlastModal(false)}
                    className="flex-1 py-3 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-colors cursor-pointer shadow-md"
                  >
                    {activeBlastJob?.status === 'running' ? 'Jalankan di Background (Tutup Modal)' : 'Selesai & Tutup'}
                  </button>
                  {activeBlastJob?.status === 'running' && (
                    <button
                      onClick={handleCancelBlast}
                      disabled={cancellingBlast}
                      className="py-3 px-5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                    >
                      {cancellingBlast ? 'Menghentikan...' : 'Hentikan Broadcast'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Meta Template Manager Modal ──────────────────────────────────── */}
      {showTemplatesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2"><List size={18} className="text-purple-600" /> Template Manager Meta</h3>
                <p className="text-xs text-slate-500 mt-0.5">Daftar template HSM yang terdaftar di WhatsApp Business Account Anda</p>
              </div>
              <button onClick={() => setShowTemplatesModal(false)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {templatesLoading ? (
                <div className="text-center py-10"><Loader2 size={24} className="animate-spin text-purple-500 mx-auto" /></div>
              ) : templatesError ? (
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 text-xs flex items-start gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5" />{templatesError}</div>
              ) : templates.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm">Belum ada template terdaftar di WABA Anda.<br /><span className="text-xs">Buat template di <a href="https://business.facebook.com/wa/manage/message-templates/" target="_blank" rel="noopener noreferrer" className="text-purple-600 underline">Meta Business Manager</a></span></div>
              ) : selectedTemplate ? (
                <div className="space-y-4">
                  <button onClick={() => setSelectedTemplate(null)} className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1">← Kembali ke daftar</button>
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-extrabold text-slate-900 text-sm">{selectedTemplate.name}</h4>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        selectedTemplate.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' :
                        selectedTemplate.status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>{selectedTemplate.status}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                      <div><span className="text-slate-400">Kategori:</span> <span className="font-semibold text-slate-700">{selectedTemplate.category}</span></div>
                      <div><span className="text-slate-400">Bahasa:</span> <span className="font-semibold text-slate-700">{selectedTemplate.language}</span></div>
                    </div>
                    <div className="space-y-2">
                      {(selectedTemplate.components || []).map((comp: any, i: number) => (
                        <div key={i} className="bg-white rounded-lg p-3 border border-slate-100">
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{comp.type}</p>
                          <p className="text-xs text-slate-700 whitespace-pre-wrap">{comp.text || JSON.stringify(comp.buttons || comp, null, 2)}</p>
                        </div>
                      ))}
                    </div>
                    {selectedTemplate.quality_score?.score && (
                      <div className="mt-3 flex items-center gap-2 text-xs">
                        <span className="text-slate-400">Kualitas:</span>
                        <span className={`font-bold ${
                          selectedTemplate.quality_score.score === 'GREEN' ? 'text-emerald-600' :
                          selectedTemplate.quality_score.score === 'YELLOW' ? 'text-amber-600' : 'text-red-600'
                        }`}>{selectedTemplate.quality_score.score}</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setTemplateName(selectedTemplate.name);
                      setShowTemplatesModal(false);
                      setSelectedMetaPhone(metaSessions[0]?.meta_phone_number_id || '');
                      setBlastStep('form');
                      setBlastResult(null);
                      setShowMetaBlastModal(true);
                    }}
                    className="w-full py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Send size={13} /> Gunakan Template Ini untuk Blast
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {templates.map((t: any) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTemplate(t)}
                      className="w-full text-left p-3.5 bg-white hover:bg-purple-50 border border-slate-200 hover:border-purple-300 rounded-xl transition-all flex items-center justify-between gap-3 group"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-slate-900 truncate">{t.name}</p>
                        <p className="text-[11px] text-slate-400">{t.category} · {t.language}</p>
                      </div>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        t.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' :
                        t.status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>{t.status}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-between items-center">
              <a href="https://business.facebook.com/wa/manage/message-templates/" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1"><ExternalLink size={11} /> Kelola di Meta BM</a>
              <button onClick={() => setShowTemplatesModal(false)} className="px-5 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors">Tutup</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Meta Analytics Modal ─────────────────────────────────────────── */}
      {showAnalyticsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2"><BarChart2 size={18} className="text-emerald-600" /> Analitik Meta WhatsApp</h3>
                <p className="text-xs text-slate-500 mt-0.5">Statistik percakapan dari Meta Business API</p>
              </div>
              <button onClick={() => setShowAnalyticsModal(false)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {analyticsLoading ? (
                <div className="text-center py-10"><Loader2 size={24} className="animate-spin text-emerald-500 mx-auto" /><p className="text-xs text-slate-400 mt-3">Memuat data dari Meta...</p></div>
              ) : analyticsError ? (
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 text-xs flex items-start gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5" />{analyticsError}</div>
              ) : analyticsData ? (
                <div className="space-y-4">
                  <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-100">
                    <p className="text-[11px] text-emerald-700 font-bold uppercase mb-1">WABA ID</p>
                    <p className="text-sm font-mono text-slate-700">{analyticsData.wabaId}</p>
                    <p className="text-[11px] text-emerald-700 font-bold uppercase mt-3 mb-1">Phone Number ID</p>
                    <p className="text-sm font-mono text-slate-700">{analyticsData.phoneNumberId}</p>
                  </div>
                  {analyticsData.analytics && analyticsData.analytics.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-slate-500 uppercase">Data Percakapan (7 Hari Terakhir)</p>
                      {analyticsData.analytics.map((item: any, i: number) => (
                        <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="grid grid-cols-3 gap-2 text-center">
                            {item.data_points?.map((dp: any, j: number) => (
                              <div key={j}>
                                <p className="text-[10px] text-slate-400 font-bold">{dp.type || 'Percakapan'}</p>
                                <p className="text-xl font-extrabold text-slate-800">{dp.count ?? '-'}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
                      <p className="text-xs text-amber-700 font-semibold flex items-center gap-2"><Info size={13} /> Data analitik belum tersedia.</p>
                      <p className="text-[11px] text-amber-600 mt-1">Meta membutuhkan minimal beberapa hari aktivitas sebelum data percakapan tersedia di API analytics. Coba lagi setelah 24-48 jam dari pertama kali nomor aktif.</p>
                    </div>
                  )}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-[11px] font-bold text-slate-500 uppercase mb-2">Info Akun</p>
                    {analyticsData.insights?.account_alerts?.data?.length > 0 ? (
                      analyticsData.insights.account_alerts.data.map((alert: any, i: number) => (
                        <p key={i} className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-lg">{alert.type}: {alert.message}</p>
                      ))
                    ) : (
                      <p className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 size={12} /> Tidak ada peringatan aktif pada akun Anda.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-10 text-slate-400 text-sm">Tidak ada data analitik tersedia.<br /><span className="text-xs">Pastikan Anda memiliki nomor Meta yang terhubung.</span></div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-between items-center">
              <a href="https://business.facebook.com/wa/manage/" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1"><ExternalLink size={11} /> Buka Meta BM</a>
              <button onClick={() => setShowAnalyticsModal(false)} className="px-5 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors">Tutup</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Interactive Message Sender Modal ─────────────────────────────── */}
      {showInteractiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2"><MousePointerClick size={18} className="text-teal-600" /> Kirim Pesan Interaktif</h3>
                <p className="text-xs text-slate-500 mt-0.5">Kirim pesan dengan tombol pilihan atau daftar menu ke satu nomor pelanggan</p>
              </div>
              <button onClick={() => setShowInteractiveModal(false)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {interactiveSent ? (
                <div className="text-center py-8 space-y-3">
                  <div className="w-14 h-14 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center mx-auto"><CheckCircle2 size={32} /></div>
                  <h4 className="text-base font-extrabold text-slate-900">Pesan Interaktif Terkirim!</h4>
                  <p className="text-sm text-slate-500">Pesan dengan tombol berhasil dikirim ke <strong>{interactiveTo}</strong></p>
                  <button
                    onClick={() => { setInteractiveSent(false); setInteractiveTo(''); setInteractiveBody(''); }}
                    className="mt-2 px-6 py-2.5 bg-teal-600 text-white text-xs font-bold rounded-xl hover:bg-teal-700 transition-colors"
                  >Kirim Lagi</button>
                </div>
              ) : (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!interactiveTo.trim() || !interactiveBody.trim()) return;
                    setInteractiveSending(true);
                    setInteractiveError(null);
                    try {
                      const payload: any = {
                        phoneNumberId: interactivePhoneId,
                        to: interactiveTo.trim(),
                        type: interactiveType,
                        body: interactiveBody.trim(),
                      };
                      if (interactiveHeader.trim()) payload.header = interactiveHeader.trim();
                      if (interactiveFooter.trim()) payload.footer = interactiveFooter.trim();
                      if (interactiveType === 'button') payload.buttons = interactiveButtons;
                      else {
                        payload.sections = interactiveSections;
                        payload.listButtonText = interactiveListBtn;
                      }
                      const res = await fetch('/api/whatsapp/meta/send-interactive', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
                        body: JSON.stringify(payload)
                      });
                      const data = await res.json();
                      if (data.success) setInteractiveSent(true);
                      else setInteractiveError(data.message || 'Gagal mengirim pesan');
                    } catch { setInteractiveError('Tidak dapat terhubung ke server'); }
                    finally { setInteractiveSending(false); }
                  }}
                  className="space-y-4"
                >
                  {interactiveError && (
                    <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-xs flex items-start gap-2"><AlertTriangle size={13} className="shrink-0 mt-0.5" />{interactiveError}</div>
                  )}
                  {/* Nomor Tujuan */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Nomor Tujuan <span className="text-red-500">*</span></label>
                    <input type="text" value={interactiveTo} onChange={e => setInteractiveTo(e.target.value)}
                      placeholder="628123456789 (tanpa + atau 0)"
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                      required
                    />
                  </div>
                  {/* Tipe Pesan */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Tipe Interaktif</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['button', 'list'] as const).map(t => (
                        <button type="button" key={t}
                          onClick={() => setInteractiveType(t)}
                          className={`py-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                            interactiveType === t ? 'bg-teal-600 text-white border-teal-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-teal-400'
                          }`}
                        >
                          {t === 'button' ? <MousePointerClick size={12} /> : <List size={12} />}
                          {t === 'button' ? 'Tombol (Button)' : 'Daftar (List)'}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1.5">
                      {interactiveType === 'button' ? '⚡ Max 3 tombol, teks max 20 karakter per tombol' : '📋 Max 10 baris pilihan, cocok untuk menu produk/layanan'}
                    </p>
                  </div>
                  {/* Header (opsional) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Header <span className="text-slate-400 font-normal">(opsional)</span></label>
                    <input type="text" value={interactiveHeader} onChange={e => setInteractiveHeader(e.target.value)}
                      placeholder="Judul pesan (maks 60 karakter)"
                      maxLength={60}
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                    />
                  </div>
                  {/* Body */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Isi Pesan (Body) <span className="text-red-500">*</span></label>
                    <textarea value={interactiveBody} onChange={e => setInteractiveBody(e.target.value)}
                      rows={3} placeholder="Tulis isi pesan utama di sini..."
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none resize-none"
                      required
                    />
                  </div>
                  {/* Footer (opsional) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Footer <span className="text-slate-400 font-normal">(opsional)</span></label>
                    <input type="text" value={interactiveFooter} onChange={e => setInteractiveFooter(e.target.value)}
                      placeholder="Teks kecil di bawah pesan (maks 60 karakter)"
                      maxLength={60}
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                    />
                  </div>
                  {/* Buttons Config */}
                  {interactiveType === 'button' && (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Tombol Pilihan <span className="text-slate-400 font-normal">(max 3)</span></label>
                      <div className="space-y-2">
                        {interactiveButtons.map((btn, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                            <input
                              type="text" value={btn.title}
                              onChange={e => setInteractiveButtons(prev => prev.map((b, j) => j === i ? { ...b, title: e.target.value } : b))}
                              placeholder={`Tombol ${i + 1} (max 20 karakter)`}
                              maxLength={20}
                              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                            />
                            {interactiveButtons.length > 1 && (
                              <button type="button" onClick={() => setInteractiveButtons(prev => prev.filter((_, j) => j !== i))}
                                className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                              ><Trash2 size={13} /></button>
                            )}
                          </div>
                        ))}
                        {interactiveButtons.length < 3 && (
                          <button type="button"
                            onClick={() => setInteractiveButtons(prev => [...prev, { id: `btn_${prev.length + 1}`, title: '' }])}
                            className="text-xs text-teal-600 hover:text-teal-800 flex items-center gap-1 font-semibold"
                          ><Plus size={12} /> Tambah Tombol</button>
                        )}
                      </div>
                    </div>
                  )}
                  {/* List Config */}
                  {interactiveType === 'list' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">Label Tombol Daftar</label>
                        <input type="text" value={interactiveListBtn} onChange={e => setInteractiveListBtn(e.target.value)}
                          placeholder="Pilih Opsi (max 20 karakter)"
                          maxLength={20}
                          className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                        />
                      </div>
                      <label className="block text-xs font-bold text-slate-700">Item Daftar</label>
                      {interactiveSections.map((sec, si) => (
                        <div key={si} className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-2">
                          <input type="text" value={sec.title}
                            onChange={e => setInteractiveSections(prev => prev.map((s, idx) => idx === si ? { ...s, title: e.target.value } : s))}
                            placeholder="Judul seksi (maks 24 karakter)"
                            maxLength={24}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-teal-500 outline-none"
                          />
                          {sec.rows.map((row, ri) => (
                            <div key={ri} className="flex items-start gap-2">
                              <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-1.5">{ri + 1}</span>
                              <div className="flex-1 space-y-1">
                                <input type="text" value={row.title}
                                  onChange={e => setInteractiveSections(prev => prev.map((s, idx) => idx === si ? { ...s, rows: s.rows.map((r, rj) => rj === ri ? { ...r, title: e.target.value } : r) } : s))}
                                  placeholder="Judul item (max 24 karakter)"
                                  maxLength={24}
                                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-teal-500 outline-none"
                                />
                                <input type="text" value={row.description}
                                  onChange={e => setInteractiveSections(prev => prev.map((s, idx) => idx === si ? { ...s, rows: s.rows.map((r, rj) => rj === ri ? { ...r, description: e.target.value } : r) } : s))}
                                  placeholder="Deskripsi singkat (opsional, max 72 karakter)"
                                  maxLength={72}
                                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-[11px] text-slate-500 focus:ring-2 focus:ring-teal-500 outline-none"
                                />
                              </div>
                              {sec.rows.length > 1 && (
                                <button type="button" onClick={() => setInteractiveSections(prev => prev.map((s, idx) => idx === si ? { ...s, rows: s.rows.filter((_, rj) => rj !== ri) } : s))}
                                  className="p-1 text-slate-400 hover:text-red-500 transition-colors mt-1"
                                ><Trash2 size={12} /></button>
                              )}
                            </div>
                          ))}
                          {sec.rows.length < 10 && (
                            <button type="button"
                              onClick={() => setInteractiveSections(prev => prev.map((s, idx) => idx === si ? { ...s, rows: [...s.rows, { id: `row_${s.rows.length + 1}`, title: '', description: '' }] } : s))}
                              className="text-xs text-teal-600 hover:text-teal-800 flex items-center gap-1 font-semibold"
                            ><Plus size={12} /> Tambah Item</button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="pt-2 border-t border-slate-100 flex gap-3">
                    <button
                      type="submit"
                      disabled={interactiveSending}
                      className="flex-1 py-2.5 bg-teal-600 text-white text-xs font-bold rounded-xl hover:bg-teal-700 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {interactiveSending ? <Loader2 size={14} className="animate-spin" /> : <MousePointerClick size={14} />}
                      {interactiveSending ? 'Mengirim...' : 'Kirim Pesan Interaktif'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowInteractiveModal(false)}
                      className="px-5 py-2.5 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors"
                    >Batal</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Log Pengiriman WhatsApp Broadcast ──────────────────────── */}
      {showBlastLogsModal && activeBlastJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
            {/* Top accent border */}
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-600" />

            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-800">
                    Log Pengiriman WhatsApp Broadcast
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Sesi: <span className="font-semibold text-slate-700">{activeBlastJob.phoneLabel}</span> ({activeBlastJob.platform === 'baileys' ? 'Gateway Baileys' : 'Meta Cloud API'})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBlastLogsModal(false)}
                className="p-1.5 bg-slate-50 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Critical error alert if session disconnected */}
            {activeBlastJob.error && (
              <div className="mt-3 p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-start gap-2.5 shadow-sm">
                <AlertTriangle size={17} className="text-rose-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 text-[11px] leading-relaxed">
                  <strong className="block font-bold text-rose-900 mb-0.5">Penyebab Pengiriman Terhenti:</strong>
                  {activeBlastJob.error}
                </div>
              </div>
            )}

            {/* Summary counters */}
            <div className="grid grid-cols-3 gap-2.5 my-3">
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Nomor</span>
                <span className="text-base font-extrabold text-slate-800">{activeBlastJob.total}</span>
              </div>
              <div className="p-3 bg-emerald-50/70 border border-emerald-100 rounded-2xl text-center">
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">Berhasil Terkirim</span>
                <span className="text-base font-extrabold text-emerald-700">{activeBlastJob.successCount}</span>
              </div>
              <div className="p-3 bg-rose-50/70 border border-rose-100 rounded-2xl text-center">
                <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider block">Gagal Dikirim</span>
                <span className="text-base font-extrabold text-rose-600">{activeBlastJob.failedCount}</span>
              </div>
            </div>

            {/* Filter Tabs & Search & Copy Failed Numbers */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
              {/* Filter Tabs */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setBlastLogsFilter('all')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    blastLogsFilter === 'all'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Semua ({activeBlastJob.logs?.length || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setBlastLogsFilter('failed')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    blastLogsFilter === 'failed'
                      ? 'bg-rose-500 text-white shadow-sm'
                      : 'text-rose-600 hover:text-rose-700'
                  }`}
                >
                  Gagal ({activeBlastJob.logs?.filter((l) => l.status === 'failed').length ?? activeBlastJob.failedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setBlastLogsFilter('success')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    blastLogsFilter === 'success'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-emerald-700 hover:text-emerald-800'
                  }`}
                >
                  Berhasil ({activeBlastJob.logs?.filter((l) => l.status === 'success').length ?? activeBlastJob.successCount})
                </button>
              </div>

              {/* Action Buttons: Search & Copy Failed */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-44">
                  <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari nomor..."
                    value={blastLogsSearch}
                    onChange={(e) => setBlastLogsSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {activeBlastJob.failedCount > 0 && (
                  <button
                    type="button"
                    onClick={handleCopyFailedNumbers}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-sm"
                    title="Salin semua nomor yang gagal ke clipboard untuk blast ulang"
                  >
                    {copiedFailedNumbers ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                    {copiedFailedNumbers ? 'Tersalin!' : 'Salin Nomor Gagal'}
                  </button>
                )}
              </div>
            </div>

            {/* Logs List Table */}
            <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[350px] divide-y divide-slate-100 mt-2 pr-1">
              {(() => {
                const logs = activeBlastJob.logs || [];
                const filtered = logs.filter((l) => {
                  if (blastLogsFilter === 'failed' && l.status !== 'failed') return false;
                  if (blastLogsFilter === 'success' && l.status !== 'success') return false;
                  if (blastLogsSearch.trim() && !l.phone.includes(blastLogsSearch.trim())) return false;
                  return true;
                });

                if (logs.length === 0) {
                  return (
                    <div className="py-12 text-center text-slate-400 text-xs">
                      {activeBlastJob.failedCount > 0 || activeBlastJob.successCount > 0
                        ? 'Rincian nomor tersimpan pada log pengiriman sesi berikutnya.'
                        : 'Belum ada data pengiriman untuk broadcast ini.'}
                    </div>
                  );
                }

                if (filtered.length === 0) {
                  return (
                    <div className="py-12 text-center text-slate-400 text-xs">
                      Tidak ada log yang cocok dengan filter pencarian.
                    </div>
                  );
                }

                return (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider sticky top-0 bg-white shadow-xs">
                        <th className="py-2.5 px-2">#</th>
                        <th className="py-2.5 px-2">Nomor WhatsApp</th>
                        <th className="py-2.5 px-2">Status</th>
                        <th className="py-2.5 px-2">Penyebab / Keterangan</th>
                        <th className="py-2.5 px-2 text-right">Waktu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filtered.map((item, idx) => {
                        const isSuccess = item.status === 'success';
                        return (
                          <tr key={`${item.phone}-${idx}`} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-2.5 px-2 text-[11px] text-slate-400 font-mono">{idx + 1}</td>
                            <td className="py-2.5 px-2 font-mono font-semibold text-slate-800 whitespace-nowrap">
                              +{item.phone}
                            </td>
                            <td className="py-2.5 px-2 whitespace-nowrap">
                              {isSuccess ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                                  <Check size={10} /> Sukses
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold">
                                  <X size={10} /> Gagal
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-2">
                              <span className={`text-[11px] leading-snug block ${
                                isSuccess ? 'text-slate-600' : 'text-rose-600 font-medium'
                              }`}>
                                {item.reason || (isSuccess ? 'Pesan berhasil terkirim' : 'Gagal mengirim')}
                              </span>
                            </td>
                            <td className="py-2.5 px-2 text-right text-[10px] text-slate-400 font-mono whitespace-nowrap">
                              {item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <p className="text-[11px] text-slate-400">
                Log disimpan otomatis selama proses broadcast berlangsung.
              </p>
              <button
                type="button"
                onClick={() => setShowBlastLogsModal(false)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-sm"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WhatsAppIntegrationPage;
