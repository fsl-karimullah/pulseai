export type NavItem = {
  id: string;
  label: string;
  icon: string;
  badge?: number;
};

export type MetricCard = {
  id: string;
  title: string;
  value: string;
  change: number;
  changeLabel: string;
  icon: string;
  color: 'emerald' | 'blue' | 'violet' | 'amber';
};

export type Lead = {
  id: string;
  name: string;
  company: string;
  email: string;
  whatsapp?: string;
  status: 'hot' | 'warm' | 'cold' | 'converted';
  value: number;
  date: string;
  avatar: string;
};

export type KnowledgeArticle = {
  id: string;
  title: string;
  category: string;
  views: number;
  lastUpdated: string;
  status: 'published' | 'draft';
};

export type BotSetting = {
  id: string;
  label: string;
  description: string;
  type: 'toggle' | 'select' | 'input' | 'range';
  value: string | boolean | number;
  options?: string[];
};

export type Page = 'dashboard' | 'knowledge' | 'bot-settings' | 'leads' | 'widget' | 'whatsapp' | 'billing' | 'pulse-internal' | 'pulse-hr' | 'cv-screening';
