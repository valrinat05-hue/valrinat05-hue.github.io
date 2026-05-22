// localStorage-based database replacing Supabase

const USER_ID_KEY = "studio_user_id";

// Generate a stable unique ID per browser/device on first visit
const CURRENT_USER_ID: string = (() => {
  let id = localStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID
      ? crypto.randomUUID()
      : `user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(USER_ID_KEY, id);
  }
  return id;
})();

export const LOCAL_USER = {
  id: CURRENT_USER_ID,
  email: "local@studio.app",
  user_metadata: { full_name: "Studio User" },
};

// --- Storage helpers ---

function getKey(table: string) {
  return `studio_db_${table}`;
}

function getAll<T>(table: string): T[] {
  try {
    const raw = localStorage.getItem(getKey(table));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAll<T>(table: string, rows: T[]) {
  try {
    localStorage.setItem(getKey(table), JSON.stringify(rows));
  } catch {
    // localStorage full — silently ignore metadata writes
  }
}

function uuid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

// --- Types ---

export interface ProjectRow {
  id: string;
  name: string;
  type: string;
  genre: string | null;
  duration_minutes: number | null;
  scenes_count: number;
  script: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
  edit_instructions: any;
  color_adjustments: any;
}

export interface SceneRow {
  id: string;
  project_id: string;
  scene_number: number;
  status: string;
  created_at: string;
}

export interface SceneVideoRow {
  id: string;
  scene_id: string;
  file_name: string;
  file_url: string;
  angle_label: string;
  created_at: string;
}

// --- Projects ---

export const db = {
  projects: {
    getAll(): ProjectRow[] {
      return getAll<ProjectRow>("projects").filter(p => p.user_id === CURRENT_USER_ID);
    },

    getById(id: string): ProjectRow | null {
      return getAll<ProjectRow>("projects").find(p => p.id === id && p.user_id === CURRENT_USER_ID) || null;
    },

    insert(data: Omit<ProjectRow, "id" | "created_at" | "updated_at" | "edit_instructions" | "color_adjustments">): ProjectRow {
      const rows = getAll<ProjectRow>("projects");
      const now = nowIso();
      const row: ProjectRow = {
        id: uuid(),
        created_at: now,
        updated_at: now,
        edit_instructions: null,
        color_adjustments: null,
        ...data,
      };
      rows.push(row);
      saveAll("projects", rows);
      return row;
    },

    update(id: string, data: Partial<ProjectRow>): ProjectRow | null {
      const rows = getAll<ProjectRow>("projects");
      const idx = rows.findIndex(p => p.id === id);
      if (idx < 0) return null;
      rows[idx] = { ...rows[idx], ...data, updated_at: nowIso() };
      saveAll("projects", rows);
      return rows[idx];
    },

    delete(id: string) {
      const rows = getAll<ProjectRow>("projects").filter(p => p.id !== id);
      saveAll("projects", rows);
    },
  },

  scenes: {
    getByProject(projectId: string): SceneRow[] {
      return getAll<SceneRow>("scenes")
        .filter(s => s.project_id === projectId)
        .sort((a, b) => a.scene_number - b.scene_number);
    },

    insertMany(items: Omit<SceneRow, "id" | "created_at" | "status">[]): SceneRow[] {
      const rows = getAll<SceneRow>("scenes");
      const created: SceneRow[] = items.map(item => ({
        id: uuid(),
        created_at: nowIso(),
        status: "pending",
        ...item,
      }));
      saveAll("scenes", [...rows, ...created]);
      return created;
    },

    update(id: string, data: Partial<SceneRow>) {
      const rows = getAll<SceneRow>("scenes");
      const idx = rows.findIndex(s => s.id === id);
      if (idx >= 0) {
        rows[idx] = { ...rows[idx], ...data };
        saveAll("scenes", rows);
      }
    },

    deleteByProject(projectId: string) {
      const rows = getAll<SceneRow>("scenes").filter(s => s.project_id !== projectId);
      saveAll("scenes", rows);
    },
  },

  sceneVideos: {
    getByScene(sceneId: string): SceneVideoRow[] {
      return getAll<SceneVideoRow>("scene_videos").filter(v => v.scene_id === sceneId);
    },

    getByScenes(sceneIds: string[]): SceneVideoRow[] {
      const set = new Set(sceneIds);
      return getAll<SceneVideoRow>("scene_videos").filter(v => set.has(v.scene_id));
    },

    insert(data: Omit<SceneVideoRow, "id" | "created_at">): SceneVideoRow {
      const rows = getAll<SceneVideoRow>("scene_videos");
      const row: SceneVideoRow = { id: uuid(), created_at: nowIso(), ...data };
      rows.push(row);
      saveAll("scene_videos", rows);
      return row;
    },

    delete(id: string) {
      const rows = getAll<SceneVideoRow>("scene_videos").filter(v => v.id !== id);
      saveAll("scene_videos", rows);
    },

    deleteByScene(sceneId: string) {
      const rows = getAll<SceneVideoRow>("scene_videos").filter(v => v.scene_id !== sceneId);
      saveAll("scene_videos", rows);
    },

    deleteByProject(_projectId: string, sceneIds: string[]) {
      const set = new Set(sceneIds);
      const rows = getAll<SceneVideoRow>("scene_videos").filter(v => !set.has(v.scene_id));
      saveAll("scene_videos", rows);
    },
  },
};
