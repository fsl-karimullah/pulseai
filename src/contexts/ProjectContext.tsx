/**
 * ProjectContext.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for the client's Projects (the grouping layer for
 * Knowledge Base + channels introduced alongside migrations 018/019).
 *
 * Mirrors the fetch-once-share-via-context pattern used by AppDataContext,
 * but talks to the backend REST API (not raw Supabase reads) because listing
 * needs server-computed KB/channel counts, and writes need the service-role
 * bot_settings auto-provisioning / delete-guard validation that only the
 * backend can do (RLS blocks authenticated inserts into bot_settings).
 */

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';

export interface Project {
  id: string;
  name: string;
  created_at: string;
  knowledge_count: number;
  whatsapp_count: number;
  widget_count: number;
}

interface MutationResult {
  success: boolean;
  error?: string;
}

interface ProjectContextType {
  projects: Project[];
  loading: boolean;
  activeProjectId: string | null;
  setActiveProjectId: (id: string) => void;
  refreshProjects: () => Promise<void>;
  createProject: (name: string) => Promise<MutationResult>;
  renameProject: (id: string, name: string) => Promise<MutationResult>;
  deleteProject: (id: string) => Promise<MutationResult>;
}

const STORAGE_KEY = 'pulseai_active_project_id';

const ProjectContext = createContext<ProjectContextType>({
  projects: [],
  loading: true,
  activeProjectId: null,
  setActiveProjectId: () => {},
  refreshProjects: async () => {},
  createProject: async () => ({ success: false }),
  renameProject: async () => ({ success: false }),
  deleteProject: async () => ({ success: false }),
});

export const useProjects = () => useContext(ProjectContext);

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, session } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  );

  const lastFetchedUserId = useRef<string | null>(null);

  const setActiveProjectId = (id: string) => {
    setActiveProjectIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const fetchProjects = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/projects', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (json.success) {
        setProjects(json.data);
        // Keep activeProjectId pointing at a project that still exists;
        // fall back to the first one (the org's default project) otherwise.
        setActiveProjectIdState((prev) => {
          if (prev && json.data.some((p: Project) => p.id === prev)) return prev;
          const fallback = json.data[0]?.id ?? null;
          if (fallback) localStorage.setItem(STORAGE_KEY, fallback);
          return fallback;
        });
      }
    } catch {
      // silently ignore — UI will show empty state
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (!user) {
      setProjects([]);
      setLoading(false);
      lastFetchedUserId.current = null;
      return;
    }
    if (lastFetchedUserId.current === user.id) return;
    lastFetchedUserId.current = user.id;
    fetchProjects();
  }, [user?.id, fetchProjects]);

  const createProject = async (name: string): Promise<MutationResult> => {
    if (!session?.access_token) return { success: false, error: 'Not authenticated' };
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) return { success: false, error: json.message || 'Gagal membuat project' };
      await fetchProjects();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const renameProject = async (id: string, name: string): Promise<MutationResult> => {
    if (!session?.access_token) return { success: false, error: 'Not authenticated' };
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) return { success: false, error: json.message || 'Gagal mengubah nama project' };
      await fetchProjects();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const deleteProject = async (id: string): Promise<MutationResult> => {
    if (!session?.access_token) return { success: false, error: 'Not authenticated' };
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) return { success: false, error: json.message || 'Gagal menghapus project' };
      await fetchProjects();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  return (
    <ProjectContext.Provider
      value={{
        projects,
        loading,
        activeProjectId,
        setActiveProjectId,
        refreshProjects: fetchProjects,
        createProject,
        renameProject,
        deleteProject,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
};
