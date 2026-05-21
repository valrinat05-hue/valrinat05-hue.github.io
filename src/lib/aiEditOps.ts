import type { ColorAdjustments } from "@/components/editor/ManualEditingPanel";
import { defaultAdjustments } from "@/components/editor/ManualEditingPanel";

export type EditOperation =
  | { type: "color_grade"; brightness?: number; contrast?: number; saturation?: number; temperature?: number; exposure?: number }
  | { type: "color_preset"; preset: string }
  | { type: "trim_scene"; scene_number: number; trim_start_sec?: number; trim_end_sec?: number }
  | { type: "speed_scene"; scene_number: number; playback_speed: number }
  | { type: "reorder_scenes"; order: number[] }
  | { type: "reject_scene"; scene_number: number; reason?: string }
  | { type: "set_transition"; after_scene: number; transition: "cut" | "crossfade" | "fade" | "dissolve"; duration_ms?: number }
  | { type: "audio_mix"; music_volume?: number; dialog_volume?: number }
  | { type: "tighten_pacing"; aggressiveness: "light" | "medium" | "aggressive" };

const PRESET_MAP: Record<string, Partial<ColorAdjustments>> = {
  "טבעי": { brightness: 50, contrast: 50, saturation: 50, temperature: 50, exposure: 50 },
  "סינמטי": { brightness: 40, contrast: 65, saturation: 35, temperature: 40, exposure: 45 },
  "וינטאג׳": { brightness: 55, contrast: 45, saturation: 30, temperature: 65, exposure: 50 },
  "קר": { brightness: 52, contrast: 50, saturation: 45, temperature: 30, exposure: 50 },
  "חם": { brightness: 52, contrast: 48, saturation: 55, temperature: 70, exposure: 52 },
  "מונוכרום": { brightness: 50, contrast: 60, saturation: 0, temperature: 50, exposure: 50 },
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export interface ScenePlanEntry {
  scene_number: number;
  selected_angle: string | null;
  reason: string;
  trim_start_sec?: number;
  trim_end_sec?: number | null;
  playback_speed?: number;
  transition: string;
  transition_in?: string;
  transition_out?: string;
  transition_duration_ms?: number;
  notes: string;
}

export interface AppliedSummary {
  color: ColorAdjustments | null;
  scenePlanUpdates: ScenePlanEntry[];   // merged into editPlan.scene_plan
  rejectedScenes: number[];             // scene_number
  reorder: number[] | null;
  audio: { music_volume?: number; dialog_volume?: number } | null;
  humanLabels: string[];                // short Hebrew labels per applied op
}

/**
 * Pure reducer. Takes current color + a list of ops and returns:
 *  - the new color object (or null if unchanged)
 *  - per-scene updates for edit_instructions.scene_plan
 *  - human-readable Hebrew labels for the chat
 *
 * The caller (Editor.tsx) is responsible for committing color to state/DB,
 * merging scene_plan updates into edit_instructions, and updating audio UI.
 */
export function applyEditOperations(
  ops: EditOperation[],
  currentColor: ColorAdjustments,
  totalScenes: number,
): AppliedSummary {
  let color: ColorAdjustments | null = null;
  const updates = new Map<number, ScenePlanEntry>();
  const rejected: number[] = [];
  let reorder: number[] | null = null;
  let audio: AppliedSummary["audio"] = null;
  const labels: string[] = [];

  const ensureSceneUpdate = (sceneNumber: number): ScenePlanEntry => {
    let u = updates.get(sceneNumber);
    if (!u) {
      u = {
        scene_number: sceneNumber,
        selected_angle: null,
        reason: "AI edit",
        transition: "cut",
        notes: "",
      };
      updates.set(sceneNumber, u);
    }
    return u;
  };

  const validScene = (n: number) => Number.isInteger(n) && n >= 1 && n <= totalScenes;

  for (const op of ops) {
    switch (op.type) {
      case "color_grade": {
        const base = color ?? { ...currentColor };
        const next: ColorAdjustments = {
          brightness: clamp(op.brightness ?? base.brightness, 0, 100),
          contrast: clamp(op.contrast ?? base.contrast, 0, 100),
          saturation: clamp(op.saturation ?? base.saturation, 0, 100),
          temperature: clamp(op.temperature ?? base.temperature, 0, 100),
          exposure: clamp(op.exposure ?? base.exposure, 0, 100),
        };
        color = next;
        labels.push("✓ ערכי צבע עודכנו");
        break;
      }
      case "color_preset": {
        const preset = PRESET_MAP[op.preset];
        if (preset) {
          color = { ...defaultAdjustments, ...preset } as ColorAdjustments;
          labels.push(`✓ הוחל פלטה "${op.preset}"`);
        }
        break;
      }
      case "trim_scene": {
        if (!validScene(op.scene_number)) break;
        const u = ensureSceneUpdate(op.scene_number);
        if (typeof op.trim_start_sec === "number") u.trim_start_sec = Math.max(0, op.trim_start_sec);
        if (typeof op.trim_end_sec === "number") u.trim_end_sec = Math.max(0, op.trim_end_sec);
        labels.push(`✂️ סצנה ${op.scene_number} — חיתוך ${u.trim_start_sec ?? 0}s→${u.trim_end_sec ?? "סוף"}`);
        break;
      }
      case "speed_scene": {
        if (!validScene(op.scene_number)) break;
        const u = ensureSceneUpdate(op.scene_number);
        u.playback_speed = clamp(op.playback_speed, 0.5, 2.0);
        labels.push(`⏩ סצנה ${op.scene_number} — מהירות x${u.playback_speed!.toFixed(2)}`);
        break;
      }
      case "reorder_scenes": {
        const valid = (op.order || []).filter(validScene);
        if (valid.length > 0) {
          reorder = valid;
          labels.push(`🔀 סדר סצנות חדש: ${valid.join(" → ")}`);
        }
        break;
      }
      case "reject_scene": {
        if (!validScene(op.scene_number)) break;
        rejected.push(op.scene_number);
        labels.push(`🗑️ סצנה ${op.scene_number} הוסרה (${op.reason || "AI"})`);
        break;
      }
      case "set_transition": {
        if (!validScene(op.after_scene)) break;
        const u = ensureSceneUpdate(op.after_scene);
        u.transition = op.transition;
        u.transition_out = op.transition;
        if (typeof op.duration_ms === "number") u.transition_duration_ms = op.duration_ms;
        labels.push(`🎞️ מעבר אחרי סצנה ${op.after_scene}: ${op.transition}`);
        break;
      }
      case "audio_mix": {
        audio = { ...(audio || {}), ...op };
        const parts: string[] = [];
        if (typeof op.music_volume === "number") parts.push(`מוזיקה ${op.music_volume}`);
        if (typeof op.dialog_volume === "number") parts.push(`דיאלוג ${op.dialog_volume}`);
        if (parts.length) labels.push(`🔊 מיקס: ${parts.join(", ")}`);
        break;
      }
      case "tighten_pacing": {
        const trimMap = { light: 0.3, medium: 0.6, aggressive: 1.0 } as const;
        const t = trimMap[op.aggressiveness] ?? 0.5;
        for (let s = 1; s <= totalScenes; s++) {
          const u = ensureSceneUpdate(s);
          u.trim_start_sec = (u.trim_start_sec ?? 0) + t;
          u.playback_speed = u.playback_speed ?? (1 + t * 0.15);
        }
        labels.push(`⚡ הקצב הודק (${op.aggressiveness}) על כל הסצנות`);
        break;
      }
    }
  }

  return {
    color,
    scenePlanUpdates: Array.from(updates.values()),
    rejectedScenes: rejected,
    reorder,
    audio,
    humanLabels: labels,
  };
}
