import { useEffect, useState, useRef, useCallback } from "react";
import { smartMergeVideos, SmartMergeInput } from "@/lib/videoMerge";
import MultiCamView from "@/components/editor/MultiCamView";
import TrimEditor from "@/components/editor/TrimEditor";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/localDb";
import { saveVideoBlob, getVideoBlob, deleteVideoBlob, isIndexedDBKey } from "@/lib/videoDB";

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY as string;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
import Header from "@/components/Header";
import ManualEditingPanel, { ColorAdjustments, defaultAdjustments, adjustmentsToCssFilter } from "@/components/editor/ManualEditingPanel";
import AIChatPanel from "@/components/editor/AIChatPanel";
import EditingStylePicker, { EditingStyle } from "@/components/editor/EditingStylePicker";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Play, Pause, SkipForward, SkipBack,
  Check, Film, Loader2, Music, Save, X,
  FolderOpen, ChevronLeft, Volume2, Subtitles, Upload,
  Download, Palette, Scissors, Wand2, ArrowRight,
} from "lucide-react";

interface ProjectData {
  id: string;
  name: string;
  genre: string | null;
  duration_minutes: number | null;
  scenes_count: number;
  script: string | null;
  type: string;
  edit_instructions?: any;
  color_adjustments?: any;
}

interface SceneRecord {
  id: string;
  scene_number: number;
  status: string;
}

interface SceneVideo {
  id?: string;
  url: string;
  angle: string;
  file?: File;
}

interface ChatAction {
  label: string;
  description?: string;
  type: "apply" | "reject" | "info";
  onAction?: () => void;
}
interface ChatMessage {
  role: "user" | "ai";
  content: string;
  actions?: ChatAction[];
}

interface EditPlan {
  summary: string;
  mood: string;
  pacing: string;
  editing_style?: string;
  total_estimated_duration_sec?: number;
  scene_plan: Array<{
    scene_number: number;
    selected_video_id?: string;
    selected_angle: string | null;
    quality_score?: number;
    reason: string;
    trim_start_sec?: number;
    trim_end_sec?: number | null;
    highlight_description?: string;
    suggested_trim?: { start_sec: number; end_sec: number | null };
    transition: string;
    transition_in?: string;
    transition_out?: string;
    transition_duration_ms?: number;
    playback_speed?: number;
    notes: string;
  }>;
  rejected_clips?: Array<{ scene_number: number; video_id?: string; reason: string; quality_score?: number }>;
  story_arc?: { act1_scenes: number[]; act2_scenes: number[]; act3_scenes: number[]; climax_scene: number };
  cut_points: Array<{ after_scene: number; type: string; reason: string }>;
  overall_notes: string;
}

type ProjectEditInstructions = Partial<EditPlan> & {
  merged_video_path?: string;
  merge_signature?: string;
  workflow_stage?: PersistedWorkflowStage;
  soundtrack_track_id?: number | null;
  scene_trims?: Record<number, { start: number; end: number | null }>;
};

type EditorStage =
  | "loading"
  | "scene-list"
  | "ai-directing"
  | "editing"
  | "merging"
  | "merged"
  | "options"
  | "soundtrack"
  | "sound-sync"
  | "subtitles"
  | "download";

type PersistedWorkflowStage = "merged" | "soundtrack" | "download";

const persistedWorkflowStages: PersistedWorkflowStage[] = ["merged", "soundtrack", "download"];

const isPersistedWorkflowStage = (value: unknown): value is PersistedWorkflowStage =>
  typeof value === "string" && persistedWorkflowStages.includes(value as PersistedWorkflowStage);

const hashString = async (value: string) => {
  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(value);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }

  return `fallback-${Math.abs(hash)}`;
};

const computeProjectMergeSignature = async (
  projectId: string,
  scenes: SceneRecord[],
  sceneVideos: Record<number, SceneVideo[]>,
  editPlan: EditPlan | null,
) => {
  const signaturePayload = {
    projectId,
    scenes: scenes.map((scene, index) => ({
      id: scene.id,
      scene_number: scene.scene_number,
      videos: (sceneVideos[index] || []).map((video) => ({
        id: video.id || video.url,
        angle: video.angle,
      })),
    })),
    plan: (editPlan?.scene_plan || []).map((scenePlan) => ({
      scene_number: scenePlan.scene_number,
      selected_video_id: scenePlan.selected_video_id || null,
      selected_angle: scenePlan.selected_angle || null,
      trim_start_sec: scenePlan.trim_start_sec ?? scenePlan.suggested_trim?.start_sec ?? 0,
      trim_end_sec: scenePlan.trim_end_sec ?? scenePlan.suggested_trim?.end_sec ?? null,
      playback_speed: scenePlan.playback_speed ?? 1,
      transition: scenePlan.transition_out || scenePlan.transition || "cut",
    })),
  };

  return hashString(JSON.stringify(signaturePayload));
};

const sunoTracks = [
  { id: 1, name: "Cinematic Emotional", genre: "Orchestral", duration: "3:24", free: true },
  { id: 2, name: "Epic Adventure", genre: "Action", duration: "2:58", free: true },
  { id: 3, name: "Soft Piano Dreams", genre: "Ambient", duration: "4:12", free: true },
  { id: 4, name: "Urban Beat", genre: "Hip-Hop", duration: "3:01", free: true },
  { id: 5, name: "Dramatic Tension", genre: "Thriller", duration: "2:45", free: false },
];

const Editor = () => {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  useAuth(); // keeps AuthContext connected

  const [project, setProject] = useState<ProjectData | null>(null);
  const [scenes, setScenes] = useState<SceneRecord[]>([]);
  const [sceneVideos, setSceneVideos] = useState<Record<number, SceneVideo[]>>({});
  const [activeScene, setActiveScene] = useState(0);
  const [activeAngle, setActiveAngle] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [approvedScenes, setApprovedScenes] = useState<Set<number>>(new Set());
  const [savedScenes, setSavedScenes] = useState<Set<number>>(new Set());
  const [stage, setStage] = useState<EditorStage>("loading");
  const [mergeProgress, setMergeProgress] = useState(0);
  const [selectedTrack, setSelectedTrack] = useState<number | null>(null);
  const [uploadingScene, setUploadingScene] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "ai", content: "שלום! אני עוזר העריכה שלך. העלה סרטונים לסצנות ולחץ על תיקייה כדי להתחיל לערוך." },
  ]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mergedVideoRef = useRef<HTMLVideoElement>(null);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const mergeInFlightRef = useRef(false);
  const projectInstructionsRef = useRef<ProjectEditInstructions>({});
  const [colorAdjustments, setColorAdjustments] = useState<ColorAdjustments>(defaultAdjustments);
  const [sceneTrimData, setSceneTrimData] = useState<Record<number, { start: number; end: number | null }>>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trimSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null);
  const [editPlan, setEditPlan] = useState<EditPlan | null>(null);
  const [isDirecting, setIsDirecting] = useState(false);
  const [editingStyle, setEditingStyle] = useState<EditingStyle>("cinematic");
  const [projectInstructions, setProjectInstructions] = useState<ProjectEditInstructions>({});
  const [currentMergeSignature, setCurrentMergeSignature] = useState<string | null>(null);
  const [savedMergeSignature, setSavedMergeSignature] = useState<string | null>(null);

  const handleAdjustmentsChange = useCallback((adj: ColorAdjustments) => {
    setColorAdjustments(adj);
    // Apply CSS filter to video in real time
    if (videoRef.current) {
      videoRef.current.style.filter = adjustmentsToCssFilter(adj);
    }
    // Debounce save to DB
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (!projectId) return;
      db.projects.update(projectId, { color_adjustments: adj });
    }, 1000);
  }, [projectId]);

  useEffect(() => {
    projectInstructionsRef.current = projectInstructions;
  }, [projectInstructions]);

  const persistProjectInstructions = useCallback(async (
    updater: Partial<ProjectEditInstructions> | ((prev: ProjectEditInstructions) => ProjectEditInstructions),
  ) => {
    if (!projectId) return projectInstructionsRef.current;

    const nextInstructions = typeof updater === "function"
      ? updater(projectInstructionsRef.current)
      : { ...projectInstructionsRef.current, ...updater };

    projectInstructionsRef.current = nextInstructions;
    setProjectInstructions(nextInstructions);
    setProject((prev) => prev ? { ...prev, edit_instructions: nextInstructions } : prev);

    db.projects.update(projectId, { edit_instructions: nextInstructions });
    return nextInstructions;
  }, [projectId]);

  const handleTrimChange = useCallback((sceneIndex: number, start: number, end: number | null) => {
    setSceneTrimData(prev => ({ ...prev, [sceneIndex]: { start, end } }));
    if (trimSaveTimerRef.current) clearTimeout(trimSaveTimerRef.current);
    trimSaveTimerRef.current = setTimeout(() => {
      if (!projectId) return;
      void persistProjectInstructions(prev => ({
        ...prev,
        scene_trims: { ...((prev as any).scene_trims || {}), [sceneIndex]: { start, end } },
      }));
    }, 800);
  }, [projectId, persistProjectInstructions]);

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;
    void computeProjectMergeSignature(projectId, scenes, sceneVideos, editPlan).then((signature) => {
      if (!cancelled) setCurrentMergeSignature(signature);
    });

    return () => {
      cancelled = true;
    };
  }, [projectId, scenes, sceneVideos, editPlan]);

  useEffect(() => {
    if (!mergedVideoUrl || !currentMergeSignature || savedMergeSignature || !projectId) return;

    void persistProjectInstructions({ merge_signature: currentMergeSignature }).then(() => {
      setSavedMergeSignature(currentMergeSignature);
    }).catch((error) => {
      console.warn("Failed to backfill merge signature:", error);
    });
  }, [currentMergeSignature, mergedVideoUrl, persistProjectInstructions, projectId, savedMergeSignature]);

  // Load project, scenes, and videos from localStorage + IndexedDB
  useEffect(() => {
    if (!projectId) return;

    const load = async () => {
      const proj = db.projects.getById(projectId);
      if (!proj) {
        toast.error("פרויקט לא נמצא");
        navigate("/");
        return;
      }

      setProject(proj as unknown as ProjectData);
      const ca = proj.color_adjustments;
      if (ca && typeof ca === "object") setColorAdjustments(ca as ColorAdjustments);
      const instructions = (proj.edit_instructions && typeof proj.edit_instructions === "object"
        ? proj.edit_instructions
        : {}) as ProjectEditInstructions;
      setProjectInstructions(instructions);
      projectInstructionsRef.current = instructions;
      setSavedMergeSignature(typeof instructions.merge_signature === "string" ? instructions.merge_signature : null);
      setSelectedTrack(typeof instructions.soundtrack_track_id === "number" ? instructions.soundtrack_track_id : null);
      if (instructions.scene_trims && typeof instructions.scene_trims === "object") {
        const trims: Record<number, { start: number; end: number | null }> = {};
        for (const [k, v] of Object.entries(instructions.scene_trims)) {
          trims[Number(k)] = v as { start: number; end: number | null };
        }
        setSceneTrimData(trims);
      }
      if (Array.isArray((instructions as EditPlan).scene_plan)) {
        setEditPlan(instructions as EditPlan);
      }

      const scenesData = db.scenes.getByProject(projectId);
      setScenes(scenesData);

      const approved = new Set<number>();
      const saved = new Set<number>();
      scenesData.forEach((s, i) => {
        if (s.status === "approved" || s.status === "saved") approved.add(i);
        if (s.status === "saved") saved.add(i);
      });
      setApprovedScenes(approved);
      setSavedScenes(saved);

      // Load video metadata from localStorage, actual blobs from IndexedDB
      const videos = db.sceneVideos.getByScenes(scenesData.map(s => s.id));
      if (videos.length > 0) {
        const videoMap: Record<number, SceneVideo[]> = {};
        await Promise.all(videos.map(async (v) => {
          const sceneIndex = scenesData.findIndex(s => s.id === v.scene_id);
          if (sceneIndex < 0) return;
          let url: string | null = null;
          if (isIndexedDBKey(v.file_url)) {
            url = await getVideoBlob(v.file_url);
          } else if (v.file_url.startsWith("blob:")) {
            url = v.file_url;
          }
          if (!url) return;
          if (!videoMap[sceneIndex]) videoMap[sceneIndex] = [];
          videoMap[sceneIndex].push({
            id: v.id,
            url,
            angle: v.angle_label || `זווית ${videoMap[sceneIndex].length + 1}`,
          });
        }));
        Object.keys(videoMap).forEach(k => {
          videoMap[+k].sort((a, b) => a.angle.localeCompare(b.angle));
        });
        setSceneVideos(videoMap);
      }

      setStage("scene-list");
    };

    void load();
  }, [projectId, navigate]);

  if (stage === "loading" || !project) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

  const handleFileUpload = async (sceneIndex: number, files: FileList | null) => {
    if (!files || !scenes[sceneIndex]) return;

    setUploadingScene(sceneIndex);
    const sceneId = scenes[sceneIndex].id;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (file.size > MAX_FILE_SIZE) {
          toast.error(`הקובץ "${file.name}" גדול מדי (מקסימום 500MB)`);
          continue;
        }

        if (!file.type.startsWith("video/")) {
          toast.error(`הקובץ "${file.name}" אינו קובץ וידאו`);
          continue;
        }

        const angleLabel = `זווית ${(sceneVideos[sceneIndex]?.length || 0) + i + 1}`;
        const idbKey = `idb:${sceneId}:${Date.now()}_${i}`;

        await saveVideoBlob(idbKey, file);

        const videoRecord = db.sceneVideos.insert({
          scene_id: sceneId,
          file_name: file.name,
          file_url: idbKey,
          angle_label: angleLabel,
        });

        const blobUrl = URL.createObjectURL(file);
        setSceneVideos(prev => ({
          ...prev,
          [sceneIndex]: [...(prev[sceneIndex] || []), {
            id: videoRecord.id,
            url: blobUrl,
            angle: angleLabel,
          }],
        }));
      }

      toast.success("סרטונים הועלו בהצלחה!");
    } catch (error: any) {
      toast.error(error.message || "שגיאה בהעלאת הסרטון");
    } finally {
      setUploadingScene(null);
    }
  };

  const removeVideo = async (sceneIndex: number, videoIndex: number) => {
    const video = sceneVideos[sceneIndex]?.[videoIndex];
    if (!video) return;

    if (video.id) {
      const record = db.sceneVideos.getByScene(sceneIndex.toString()).find(v => v.id === video.id)
        || db.sceneVideos.getByScenes(scenes.map(s => s.id)).find(v => v.id === video.id);
      if (record && isIndexedDBKey(record.file_url)) await deleteVideoBlob(record.file_url);
      db.sceneVideos.delete(video.id);
    }
    if (video.url.startsWith("blob:")) URL.revokeObjectURL(video.url);

    setSceneVideos(prev => {
      const updated = [...(prev[sceneIndex] || [])];
      updated.splice(videoIndex, 1);
      return { ...prev, [sceneIndex]: updated };
    });
  };

  const currentVideos = sceneVideos[activeScene] || [];
  const currentVideo = currentVideos[activeAngle];
  const scenesWithVideos = Array.from({ length: project.scenes_count }, (_, i) => ({
    index: i,
    hasVideos: (sceneVideos[i] || []).length > 0,
    videoCount: (sceneVideos[i] || []).length,
  }));

  const allScenesSaved = scenesWithVideos
    .filter((s) => s.hasVideos)
    .every((s) => savedScenes.has(s.index));

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) videoRef.current.pause(); else videoRef.current.play();
    setIsPlaying(!isPlaying);
  };

  const skipScene = (dir: number) => {
    const next = activeScene + dir;
    if (next >= 0 && next < project.scenes_count) {
      setActiveScene(next);
      setActiveAngle(0);
      setIsPlaying(false);
    }
  };

  const openScene = (index: number) => {
    setActiveScene(index);
    setActiveAngle(0);
    setIsPlaying(false);
    setStage("editing");
    const vids = sceneVideos[index] || [];
    const angleCount = vids.length;
    const analysisMsg = angleCount > 1
      ? `📂 נפתחה סצנה ${index + 1}.\n\n🎥 זיהיתי **${angleCount} זוויות** — ${vids.map(v => v.angle).join(", ")}.\n\nהפעל את תצוגת ה-**Multi-Cam** כדי לראות את כולן במקביל, או לחץ על **"החל חיתוך אוטומטי"** כדי שאבחר עבורך את הזוויות הטובות ביותר.`
      : `📂 נפתחה סצנה ${index + 1}. ${angleCount === 1 ? "זווית אחת זמינה." : "אין סרטונים עדיין."} ערוך ואשר כשאתה מרוצה.`;
    setChatMessages((prev) => [...prev, { role: "ai", content: analysisMsg }]);
  };

  const approveScene = () => {
    setApprovedScenes((prev) => new Set(prev).add(activeScene));
    setChatMessages((prev) => [
      ...prev,
      { role: "ai", content: `✅ סצנה ${activeScene + 1} אושרה! כעת תוכל לשמור או לבטל.` },
    ]);
  };

  const saveScene = async () => {
    const scene = scenes[activeScene];
    if (!scene) return;

    try {
      db.scenes.update(scene.id, { status: "saved" });

      setSavedScenes((prev) => new Set(prev).add(activeScene));
      setChatMessages((prev) => [
        ...prev,
        { role: "ai", content: `💾 סצנה ${activeScene + 1} נשמרה! חוזרים לרשימת הסצנות.` },
      ]);
      setTimeout(() => setStage("scene-list"), 600);
    } catch {
      toast.error("שגיאה בשמירה");
    }
  };

  const cancelScene = async () => {
    const scene = scenes[activeScene];
    if (!scene) return;

    db.scenes.update(scene.id, { status: "pending" });

    setApprovedScenes((prev) => { const n = new Set(prev); n.delete(activeScene); return n; });
    setSavedScenes((prev) => { const n = new Set(prev); n.delete(activeScene); return n; });
    setChatMessages((prev) => [
      ...prev,
      { role: "ai", content: `↩️ העריכה של סצנה ${activeScene + 1} בוטלה. ניתן לערוך מחדש.` },
    ]);
  };

  const backToSceneList = () => {
    setStage("scene-list");
    setIsPlaying(false);
  };

  const persistMergedVideo = async (blobUrl: string): Promise<string> => {
    if (!projectId) return blobUrl;
    try {
      await persistProjectInstructions((prev) => ({
        ...prev,
        merge_signature: currentMergeSignature || prev.merge_signature,
        workflow_stage: "merged",
      }));
    } catch (e) {
      console.warn("persistMergedVideo failed:", e);
    }
    return blobUrl;
  };

  const deleteMergedVideo = async () => {
    if (!projectId) return;
    await persistProjectInstructions((prev) => {
      const next = { ...prev };
      delete next.merged_video_path;
      delete next.merge_signature;
      delete next.workflow_stage;
      return next;
    });
    setMergedVideoUrl(null);
    setSavedMergeSignature(null);
    setStage("scene-list");
    toast.success("המיזוג נמחק. ניתן למזג מחדש.");
    setChatMessages(prev => [...prev, { role: "ai", content: "🗑️ המיזוג נמחק. אתה יכול לשנות סצנות ולמזג מחדש." }]);
  };

  const startMerge = async (force = false) => {
    if (mergeInFlightRef.current) {
      toast.info("כבר מתבצע מיזוג עבור הפרויקט הזה.");
      return;
    }

    const canReuseExisting = !!mergedVideoUrl && !force && !!currentMergeSignature && currentMergeSignature === savedMergeSignature;
    if (canReuseExisting) {
      setStage("merged");
      setChatMessages((prev) => [
        ...prev,
        { role: "ai", content: "✅ הווידאו הממוזג כבר מוכן." },
      ]);
      return;
    }

    mergeInFlightRef.current = true;
    setStage("merging");
    setMergeProgress(0);
    const hasAIPlan = !!editPlan && Array.isArray(editPlan.scene_plan) && editPlan.scene_plan.length > 0;
    setChatMessages((prev) => [
      ...prev,
      { role: "ai", content: hasAIPlan
        ? "🎬 ממזג לפי תוכנית AI Director — חותך, מסדר ומייצר סרט מקצועי..."
        : "🎬 ממזג את כל הסצנות לסרט אחד..." },
    ]);

    try {
      if (hasAIPlan) {
        // Smart merge using AI plan
        const smartInputs: SmartMergeInput[] = [];
        for (const sp of editPlan!.scene_plan) {
          const sceneIdx = sp.scene_number - 1;
          const vids = sceneVideos[sceneIdx];
          if (!vids || vids.length === 0) continue;

          // Find selected video by ID or angle, fallback to first
          let vid = vids[0];
          if (sp.selected_video_id) {
            const found = vids.find(v => v.id === sp.selected_video_id);
            if (found) vid = found;
          } else if (sp.selected_angle) {
            const found = vids.find(v => v.angle === sp.selected_angle);
            if (found) vid = found;
          }

          const trimOverride = sceneTrimData[sceneIdx];
          smartInputs.push({
            url: vid.url,
            index: sceneIdx,
            trimStartSec: trimOverride !== undefined ? trimOverride.start : sp.trim_start_sec ?? sp.suggested_trim?.start_sec ?? 0,
            trimEndSec: trimOverride !== undefined ? trimOverride.end : sp.trim_end_sec ?? sp.suggested_trim?.end_sec ?? null,
            playbackSpeed: sp.playback_speed ?? 1.0,
          });
        }

        if (smartInputs.length === 0) {
          toast.error("אין סרטונים למיזוג");
          setStage("scene-list");
          return;
        }

        const url = await smartMergeVideos(smartInputs, (percent) => {
          setMergeProgress(Math.round(percent));
        }, colorAdjustments);
        const persistedUrl = await persistMergedVideo(url);
        setMergedVideoUrl(persistedUrl);
      } else {
        // Basic merge (no AI plan) — still respects manual trims and color grading
        const smartBasicInputs: SmartMergeInput[] = [];
        for (let i = 0; i < scenes.length; i++) {
          const vids = sceneVideos[i];
          if (vids && vids.length > 0) {
            const trimOverride = sceneTrimData[i];
            smartBasicInputs.push({
              url: vids[0].url,
              index: i,
              trimStartSec: trimOverride?.start ?? 0,
              trimEndSec: trimOverride?.end ?? null,
              playbackSpeed: 1.0,
            });
          }
        }
        if (smartBasicInputs.length === 0) {
          toast.error("אין סרטונים למיזוג");
          setStage("scene-list");
          return;
        }
        const url = await smartMergeVideos(smartBasicInputs, (percent) => {
          setMergeProgress(Math.round(percent));
        }, colorAdjustments);
        const persistedUrl = await persistMergedVideo(url);
        setMergedVideoUrl(persistedUrl);
      }

      setStage("merged");
      if (currentMergeSignature) setSavedMergeSignature(currentMergeSignature);
      setChatMessages((prev) => [
        ...prev,
        { role: "ai", content: "✅ הסרט ערוך ומוכן! צפה בתוצאה. ניתן לבקש שינויים בצ'אט — חיתוך, שיפור, תיקונים. כשאתה מרוצה, המשך לפסקול." },
      ]);
    } catch (err: any) {
      console.error("Merge failed:", err);
      toast.error("שגיאה במיזוג הסרטונים: " + (err.message || "שגיאה לא ידועה"));
      setStage("scene-list");
    } finally {
      mergeInFlightRef.current = false;
    }
  };

  const runAIDirector = async () => {
    setIsDirecting(true);
    setStage("ai-directing");
    setChatMessages(prev => [
      ...prev,
      { role: "ai", content: "🎬 מפעיל AI Director... מנתח את הסרטונים, בוחר קליפים, מגדיר קצב ואווירה." },
    ]);

    try {
      const proj = db.projects.getById(projectId!);
      const scenesData = db.scenes.getByProject(projectId!);
      const sceneCount = scenesData.length;

      const styleDesc: Record<string, string> = {
        cinematic: "cinematic and dramatic",
        tiktok: "fast-paced TikTok style",
        emotional: "emotional and story-driven",
        documentary: "documentary style",
      };

      const systemPrompt = `You are a professional film editor AI. Create an editing plan as valid JSON.
Return ONLY a JSON object with this structure (no markdown):
{
  "summary": "brief description",
  "mood": "mood/atmosphere",
  "pacing": "fast/medium/slow",
  "editing_style": "${editingStyle}",
  "total_estimated_duration_sec": number,
  "scene_plan": [
    {
      "scene_number": 1,
      "selected_angle": "זווית 1",
      "quality_score": 8,
      "reason": "why this scene works",
      "trim_start_sec": 0,
      "trim_end_sec": null,
      "playback_speed": 1.0,
      "highlight_description": "key moment",
      "transition": "cut",
      "transition_out": "cut",
      "transition_duration_ms": 0,
      "notes": ""
    }
  ],
  "cut_points": [],
  "overall_notes": "editing notes",
  "story_arc": {
    "act1_scenes": [1],
    "act2_scenes": [2,3],
    "act3_scenes": [4],
    "climax_scene": 3
  }
}`;

      const userMsg = `Project: "${proj?.name || "untitled"}", genre: "${proj?.genre || "general"}", style: ${styleDesc[editingStyle] || editingStyle}, ${sceneCount} scenes. Create an editing plan.`;

      const response = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMsg },
          ],
          response_format: { type: "json_object" },
          max_tokens: 2000,
          temperature: 0.7,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error?.message || "AI Director failed");

      let plan: any = null;
      try {
        const content = data?.choices?.[0]?.message?.content;
        plan = typeof content === "string" ? JSON.parse(content) : content;
      } catch {
        throw new Error("Failed to parse AI response");
      }
      if (!plan) throw new Error("No plan returned");

      setEditPlan(plan);
      setChatMessages(prev => [
        ...prev,
        { role: "ai", content: `✅ תוכנית העריכה מוכנה!\n\n🎭 אווירה: ${plan.mood}\n⏱️ קצב: ${plan.pacing}\n\n${plan.summary}` },
      ]);
    } catch (err: any) {
      console.error("AI Director error:", err);
      toast.error("שגיאה בניתוח AI: " + (err.message || "שגיאה לא ידועה"));
      setStage("scene-list");
    } finally {
      setIsDirecting(false);
    }
  };

  const startSoundtrack = () => {
    void persistProjectInstructions({ workflow_stage: "soundtrack" }).catch(() => {});
    setStage("soundtrack");
    setChatMessages((prev) => [
      ...prev,
      { role: "ai", content: "🎵 בחר פסקול לסרט מתוך האופציות החינמיות מ-Suno. בחר את הסגנון שמתאים לאווירת הסרט." },
    ]);
  };

  const confirmSoundtrack = async () => {
    if (!selectedTrack) return;
    await persistProjectInstructions({ soundtrack_track_id: selectedTrack, workflow_stage: "download" });
    setStage("download");
    setChatMessages((prev) => [
      ...prev,
      { role: "ai", content: "🎵 הפסקול נשמר. ממשיכים לעמוד ההורדה." },
    ]);
  };

  const finishProject = () => {
    setStage("download");
    setChatMessages((prev) => [
      ...prev,
      { role: "ai", content: "🎬 הסרט מוכן! כל הרכיבים — עריכה, פסקול, סאונד וכתוביות — מתואמים. הסרט שלך מוכן לייצוא!" },
    ]);
  };

  const applyAIPrompt = async (prompt: string) => {
    if (!projectId) return;
    setChatMessages((prev) => [...prev, { role: "user", content: prompt }]);
    setChatMessages((prev) => [...prev, { role: "ai", content: "🤔 חושב על העריכה הטובה ביותר..." }]);

    try {
      const history = chatMessages.slice(-8).map((m) => ({
        role: m.role === "ai" ? "assistant" as const : "user" as const,
        content: m.content,
      }));

      const systemPrompt = `You are a professional film editor AI assistant. The user is editing a film project.
Current stage: ${stage}. Active scene index: ${activeScene}. Color adjustments: ${JSON.stringify(colorAdjustments)}.

Respond with a JSON object (no markdown) containing:
{
  "reply": "Hebrew response to user",
  "summary": "short action label in Hebrew",
  "operations": []
}

Operations can be:
- {"type":"color_grade","brightness":50,"contrast":55,"saturation":45,"temperature":45,"exposure":50}
- {"type":"color_preset","preset":"סינמטי"}
- {"type":"trim_scene","scene_number":1,"trim_start_sec":2,"trim_end_sec":10}
- {"type":"speed_scene","scene_number":1,"playback_speed":1.5}
- {"type":"reorder_scenes","order":[3,1,2,4]}
- {"type":"reject_scene","scene_number":2,"reason":"weak footage"}
- {"type":"set_transition","after_scene":1,"transition":"crossfade","duration_ms":500}
- {"type":"audio_mix","music_volume":70,"dialog_volume":100}
- {"type":"tighten_pacing","aggressiveness":"medium"}

Reply in Hebrew. Keep reply concise and helpful. If no edit operation is needed, return empty operations array.`;

      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          max_tokens: 1000,
          temperature: 0.7,
        }),
      });

      if (!res.ok) {
        if (res.status === 429) toast.error("יותר מדי בקשות, נסה שוב בעוד רגע");
        else toast.error("שגיאה בקריאה ל-AI Editor");
        setChatMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "ai", content: "❌ לא הצלחתי לבצע את הבקשה. נסה שוב." };
          return next;
        });
        return;
      }

      const data = await res.json().catch(() => null);
      let opsPayload: { reply?: string; summary?: string; operations?: any[] } | null = null;
      try {
        const content = data?.choices?.[0]?.message?.content;
        opsPayload = typeof content === "string" ? JSON.parse(content) : content;
      } catch {
        opsPayload = { reply: "בוצע.", summary: "עריכה", operations: [] };
      }

      const operations = (opsPayload?.operations || []) as import("@/lib/aiEditOps").EditOperation[];
      const reply: string = opsPayload?.reply || "בוצע.";
      const summary: string = opsPayload?.summary || "עריכה";

      // Snapshot for undo
      const prevColor = { ...colorAdjustments };
      const prevEditPlan = editPlan ? JSON.parse(JSON.stringify(editPlan)) : null;

      const { applyEditOperations } = await import("@/lib/aiEditOps");
      const result = applyEditOperations(operations, colorAdjustments, project?.scenes_count || scenes.length || 1);

      // 1. Apply color
      if (result.color) handleAdjustmentsChange(result.color);

      // 2. Merge scene_plan updates into editPlan + persist
      let nextPlan: EditPlan | null = editPlan;
      if (result.scenePlanUpdates.length > 0 || result.rejectedScenes.length > 0 || result.reorder) {
        const existingPlan: EditPlan = editPlan ?? {
          summary: "",
          mood: "",
          pacing: "medium",
          scene_plan: [],
          cut_points: [],
          overall_notes: "",
        };
        const planMap = new Map<number, any>();
        existingPlan.scene_plan.forEach((p) => planMap.set(p.scene_number, p));
        result.scenePlanUpdates.forEach((u) => {
          const existing = planMap.get(u.scene_number) || { scene_number: u.scene_number, selected_angle: null, reason: "AI", transition: "cut", notes: "" };
          planMap.set(u.scene_number, { ...existing, ...u });
        });
        // Remove rejected
        result.rejectedScenes.forEach((s) => planMap.delete(s));
        let scene_plan = Array.from(planMap.values()).sort((a, b) => a.scene_number - b.scene_number);
        // Reorder if present
        if (result.reorder) {
          const ordered: any[] = [];
          result.reorder.forEach((sn) => {
            const found = scene_plan.find((p) => p.scene_number === sn);
            if (found) ordered.push(found);
          });
          if (ordered.length === scene_plan.length) scene_plan = ordered;
        }
        nextPlan = { ...existingPlan, summary: summary || existingPlan.summary, scene_plan } as EditPlan;
        setEditPlan(nextPlan);
        if (projectId) db.projects.update(projectId, { edit_instructions: nextPlan });
      }

      // 3. Audio mix → adjust merged video volume immediately if playing
      if (result.audio && mergedVideoRef.current && typeof result.audio.music_volume === "number") {
        mergedVideoRef.current.volume = Math.max(0, Math.min(1, result.audio.music_volume / 100));
      }

      // 4. Speed for active scene preview
      const speedOp = operations.find((o) => o.type === "speed_scene" && o.scene_number === activeScene + 1);
      if (speedOp && speedOp.type === "speed_scene" && videoRef.current) {
        videoRef.current.playbackRate = Math.max(0.5, Math.min(2, speedOp.playback_speed));
      }

      const labelsBlock = result.humanLabels.length > 0 ? `\n\n${result.humanLabels.map((l) => `- ${l}`).join("\n")}` : "";
      const aiContent = `${reply}${labelsBlock}`;

      const undo = async () => {
        handleAdjustmentsChange(prevColor);
        setEditPlan(prevEditPlan);
        if (projectId) db.projects.update(projectId, { edit_instructions: prevEditPlan });
        if (videoRef.current) videoRef.current.playbackRate = 1;
        setChatMessages((prev) => [...prev, { role: "ai", content: "↩️ העריכה בוטלה — חזרנו למצב הקודם." }]);
      };

      setChatMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          role: "ai",
          content: aiContent,
          actions: operations.length > 0 ? [{ label: "ביטול", type: "reject", onAction: undo }] : undefined,
        };
        return next;
      });

      if (operations.length > 0) toast.success(summary || "העריכה הוחלה");
    } catch (e: any) {
      console.error("applyAIPrompt error:", e);
      toast.error(e?.message || "שגיאה בעריכה");
      setChatMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "ai", content: "❌ שגיאה בעריכה. נסה שוב." };
        return next;
      });
    }
  };

  const handleSendMessage = (msg: string) => {
    void applyAIPrompt(msg);
  };

  const handleQuickAction = (label: string) => {
    void applyAIPrompt(label);
  };

  const isSceneApproved = approvedScenes.has(activeScene);
  const isSceneSaved = savedScenes.has(activeScene);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT — Manual Editing Panel (only in scene editing) */}
        {stage === "editing" && (
          <ManualEditingPanel activeScene={activeScene} hasVideo={!!currentVideo} adjustments={colorAdjustments} onAdjustmentsChange={handleAdjustmentsChange} />
        )}

        {/* CENTER */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* ======= SCENE LIST VIEW ======= */}
          {stage === "scene-list" && (
            <div className="flex-1 flex flex-col">
              <div className="px-6 py-4 border-b border-border flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1">
                  <ChevronLeft className="h-4 w-4" />
                  חזרה
                </Button>
                <div>
                  <h2 className="text-lg font-bold text-foreground">{project.name} — סצנות</h2>
                  <p className="text-sm text-muted-foreground">לחץ על סצנה כדי לפתוח ולערוך. שמור כל סצנה לפני מיזוג.</p>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-6">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {scenesWithVideos.map((scene) => {
                    const saved = savedScenes.has(scene.index);
                    const isUploading = uploadingScene === scene.index;
                    return (
                      <div
                        key={scene.index}
                        className={`relative flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all ${
                          saved
                            ? "bg-green-500/10 border-green-500/40"
                            : scene.hasVideos
                              ? "bg-card border-border hover:border-primary/50"
                              : "bg-card border-dashed border-border"
                        }`}
                      >
                        {saved && (
                          <div className="absolute top-2 left-2 bg-green-500 text-white rounded-full p-1">
                            <Check className="h-3 w-3" />
                          </div>
                        )}
                        <FolderOpen className={`h-10 w-10 ${saved ? "text-green-400" : scene.hasVideos ? "text-primary" : "text-muted-foreground"}`} />
                        <span className="text-sm font-semibold text-foreground">סצנה {scene.index + 1}</span>
                        {scene.hasVideos && (
                          <span className="text-[11px] text-muted-foreground mb-1">{scene.videoCount} זוויות</span>
                        )}

                        <input
                          ref={el => { fileInputRefs.current[scene.index] = el; }}
                          type="file"
                          accept="video/*"
                          multiple
                          className="hidden"
                          onChange={e => handleFileUpload(scene.index, e.target.files)}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); fileInputRefs.current[scene.index]?.click(); }}
                          className="gap-1 text-xs"
                          disabled={isUploading}
                        >
                          {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                          {isUploading ? "מעלה..." : "העלה סרטונים"}
                        </Button>

                        {scene.hasVideos && (
                          <Button
                            size="sm"
                            onClick={() => openScene(scene.index)}
                            className="gap-1 text-xs w-full"
                          >
                            ערוך סצנה
                          </Button>
                        )}

                        {scene.hasVideos && (
                          <div className="flex gap-1 flex-wrap justify-center mt-1">
                            {(sceneVideos[scene.index] || []).map((v, vi) => (
                              <div key={vi} className="relative group">
                                <video src={v.url} className="w-12 h-8 object-cover rounded" preload="metadata" />
                                <button
                                  onClick={(e) => { e.stopPropagation(); removeVideo(scene.index, vi); }}
                                  className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="px-6 py-4 border-t border-border bg-card flex items-center gap-3">
                <Button variant="outline" onClick={() => navigate("/")} className="gap-1">
                  <ChevronLeft className="h-4 w-4" />
                  חזרה לפרויקטים
                </Button>
                <div className="flex-1" />
                {scenesWithVideos.some((s) => s.hasVideos) && (
                  <Button
                    variant="outline"
                    onClick={runAIDirector}
                    disabled={isDirecting}
                    className="gap-2"
                  >
                    {isDirecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                    AI Director
                  </Button>
                )}
                {allScenesSaved && scenesWithVideos.some((s) => s.hasVideos) ? (
                  mergedVideoUrl ? (
                    <div className="flex items-center gap-2">
                      <Button onClick={() => setStage("merged")} className="gap-2 text-base py-5 px-8" size="lg">
                        <Film className="h-5 w-5" />
                        הצג סרט מוכן
                      </Button>
                      <Button variant="outline" onClick={() => startMerge(true)} className="gap-2">
                        <Wand2 className="h-4 w-4" />
                        מזג מחדש
                      </Button>
                      <Button variant="destructive" onClick={deleteMergedVideo} className="gap-2">
                        <X className="h-4 w-4" />
                        מחק מיזוג
                      </Button>
                    </div>
                  ) : (
                    <Button onClick={() => startMerge()} className="gap-2 text-base py-5 px-8" size="lg">
                      <Film className="h-5 w-5" />
                      מזג את כל הסצנות לסרט
                    </Button>
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">שמור את כל הסצנות כדי למזג לסרט</p>
                )}
              </div>
            </div>
          )}

          {/* ======= AI DIRECTING ======= */}
          {stage === "ai-directing" && (
            <div className="flex-1 flex flex-col">
              <div className="px-6 py-4 border-b border-border flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => setStage("scene-list")} className="gap-1">
                  <ChevronLeft className="h-4 w-4" />
                  חזרה
                </Button>
                <Wand2 className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">AI Director — עריכה חכמה</h2>
              </div>

              <div className="flex-1 overflow-auto p-6">
                {/* Style Picker - shown before and after directing */}
                {!isDirecting && (
                  <div className="max-w-3xl mx-auto mb-6">
                    <h3 className="text-sm font-semibold text-muted-foreground mb-3">בחר סגנון עריכה</h3>
                    <EditingStylePicker selected={editingStyle} onChange={setEditingStyle} />
                    {!editPlan && (
                      <div className="mt-6 text-center">
                        <Button onClick={runAIDirector} size="lg" className="gap-2 px-8">
                          <Wand2 className="h-5 w-5" />
                          התחל ניתוח AI Director
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {isDirecting ? (
                  <div className="flex flex-col items-center justify-center h-64 gap-4">
                    <Loader2 className="h-16 w-16 text-primary animate-spin" />
                    <p className="text-lg font-semibold text-foreground">מנתח את הסרטונים...</p>
                    <p className="text-sm text-muted-foreground">
                      {editingStyle === "tiktok" ? "בוחר רגעי שיא, חותך מהר..." :
                       editingStyle === "emotional" ? "מזהה רגעים רגשיים, בונה עלילה..." :
                       "מנתח קומפוזיציה, בוחר שוטים קולנועיים..."}
                    </p>
                  </div>
                ) : editPlan ? (
                  <div className="max-w-3xl mx-auto space-y-6">
                    {/* Summary */}
                    <div className="bg-card rounded-xl border border-border p-5 space-y-3">
                      <h3 className="font-bold text-foreground flex items-center gap-2">
                        <Film className="h-4 w-4 text-primary" /> סיכום כללי
                      </h3>
                      <p className="text-sm text-foreground leading-relaxed">{editPlan.summary}</p>
                      <div className="flex gap-3 text-sm flex-wrap">
                        <span className="bg-primary/10 text-primary px-3 py-1 rounded-full">🎭 {editPlan.mood}</span>
                        <span className="bg-secondary text-secondary-foreground px-3 py-1 rounded-full">⏱️ קצב: {editPlan.pacing}</span>
                        <span className="bg-secondary text-secondary-foreground px-3 py-1 rounded-full">🎬 סגנון: {editPlan.editing_style || editingStyle}</span>
                        {editPlan.total_estimated_duration_sec && (
                          <span className="bg-secondary text-secondary-foreground px-3 py-1 rounded-full">
                            ⏳ {Math.round(editPlan.total_estimated_duration_sec)}s
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Story Arc */}
                    {editPlan.story_arc && (
                      <div className="bg-card rounded-xl border border-border p-5 space-y-3">
                        <h3 className="font-bold text-foreground flex items-center gap-2">📖 מבנה סיפורי</h3>
                        <div className="grid grid-cols-3 gap-3 text-center text-sm">
                          <div className="bg-secondary/40 rounded-lg p-3">
                            <p className="text-xs text-muted-foreground mb-1">מערכה 1 — פתיחה</p>
                            <p className="font-semibold text-foreground">סצנות {editPlan.story_arc.act1_scenes?.join(", ") || "—"}</p>
                          </div>
                          <div className="bg-primary/10 rounded-lg p-3 border border-primary/20">
                            <p className="text-xs text-muted-foreground mb-1">מערכה 2 — עלייה</p>
                            <p className="font-semibold text-foreground">סצנות {editPlan.story_arc.act2_scenes?.join(", ") || "—"}</p>
                            {editPlan.story_arc.climax_scene && (
                              <p className="text-xs text-primary mt-1">🔥 שיא: סצנה {editPlan.story_arc.climax_scene}</p>
                            )}
                          </div>
                          <div className="bg-secondary/40 rounded-lg p-3">
                            <p className="text-xs text-muted-foreground mb-1">מערכה 3 — סיום</p>
                            <p className="font-semibold text-foreground">סצנות {editPlan.story_arc.act3_scenes?.join(", ") || "—"}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Scene Plan - Enhanced */}
                    <div className="bg-card rounded-xl border border-border p-5 space-y-4">
                      <h3 className="font-bold text-foreground flex items-center gap-2">
                        <Scissors className="h-4 w-4 text-primary" /> תוכנית סצנות ({editPlan.scene_plan.length} קליפים נבחרו)
                      </h3>
                      <div className="space-y-3">
                        {editPlan.scene_plan.map((sp, i) => (
                          <div key={i} className="bg-secondary/40 rounded-lg p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-foreground text-sm">סצנה {sp.scene_number}</span>
                                {sp.quality_score && (
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                                    sp.quality_score >= 8 ? "bg-primary/20 text-primary" :
                                    sp.quality_score >= 6 ? "bg-secondary text-secondary-foreground" :
                                    "bg-destructive/20 text-destructive"
                                  }`}>
                                    ⭐ {sp.quality_score}/10
                                  </span>
                                )}
                              </div>
                              <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                                מעבר: {sp.transition_out || sp.transition}
                              </span>
                            </div>
                            {sp.selected_angle && (
                              <p className="text-xs text-muted-foreground">📷 זווית: {sp.selected_angle}</p>
                            )}
                            {(sp.trim_start_sec != null || sp.trim_end_sec != null) && (
                              <p className="text-xs text-muted-foreground">
                                ✂️ חיתוך: {sp.trim_start_sec ?? 0}s — {sp.trim_end_sec ? `${sp.trim_end_sec}s` : "סוף"}
                                {sp.playback_speed && sp.playback_speed !== 1.0 && ` · מהירות: ${sp.playback_speed}x`}
                              </p>
                            )}
                            {sp.highlight_description && (
                              <p className="text-xs text-primary/80">✨ {sp.highlight_description}</p>
                            )}
                            <p className="text-sm text-foreground">{sp.reason}</p>
                            {sp.notes && <p className="text-xs text-muted-foreground italic">{sp.notes}</p>}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Rejected Clips */}
                    {editPlan.rejected_clips && editPlan.rejected_clips.length > 0 && (
                      <div className="bg-card rounded-xl border border-border p-5 space-y-3">
                        <h3 className="font-bold text-foreground flex items-center gap-2">
                          🚫 קליפים שנדחו ({editPlan.rejected_clips.length})
                        </h3>
                        {editPlan.rejected_clips.map((rc, i) => (
                          <div key={i} className="flex items-center gap-3 text-sm bg-destructive/5 rounded-lg p-3">
                            <span className="text-xs bg-destructive/10 text-destructive px-2 py-1 rounded">
                              סצנה {rc.scene_number} {rc.quality_score && `· ${rc.quality_score}/10`}
                            </span>
                            <span className="text-foreground">{rc.reason}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Cut Points */}
                    {editPlan.cut_points && editPlan.cut_points.length > 0 && (
                      <div className="bg-card rounded-xl border border-border p-5 space-y-3">
                        <h3 className="font-bold text-foreground flex items-center gap-2">✂️ נקודות חיתוך</h3>
                        {editPlan.cut_points.map((cp, i) => (
                          <div key={i} className="flex items-center gap-3 text-sm">
                            <span className="bg-secondary text-secondary-foreground px-2 py-1 rounded text-xs">
                              אחרי סצנה {cp.after_scene}
                            </span>
                            <span className="text-muted-foreground">→ {cp.type}</span>
                            <span className="text-foreground">{cp.reason}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Overall Notes */}
                    {editPlan.overall_notes && (
                      <div className="bg-card rounded-xl border border-border p-5 space-y-2">
                        <h3 className="font-bold text-foreground">📝 הערות כלליות</h3>
                        <p className="text-sm text-foreground leading-relaxed">{editPlan.overall_notes}</p>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              {editPlan && !isDirecting && (
                <div className="px-6 py-4 border-t border-border bg-card flex items-center gap-3 justify-end">
                  <Button variant="outline" onClick={runAIDirector} className="gap-2">
                    <Wand2 className="h-4 w-4" />
                    נתח מחדש
                  </Button>
                  <Button onClick={() => setStage("scene-list")} className="gap-2">
                    <ArrowRight className="h-4 w-4" />
                    חזור לסצנות
                  </Button>
                  <Button onClick={() => startMerge()} className="gap-2" size="lg">
                    <Film className="h-5 w-5" />
                    {mergedVideoUrl ? "הצג סרט מוכן" : "מזג לפי התוכנית"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ======= SCENE EDITING VIEW ======= */}
          {stage === "editing" && (
            <>
              <div className="px-4 py-2 border-b border-border bg-card flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={backToSceneList} className="gap-1">
                  <ChevronLeft className="h-4 w-4" />
                  חזרה לסצנות
                </Button>
                <span className="text-sm text-muted-foreground">סצנה {activeScene + 1} מתוך {project.scenes_count}</span>
              </div>

              <div className="flex-1 flex flex-col overflow-auto">
                {/* Main video player */}
                <div className="flex-1 flex items-center justify-center bg-black/40 relative min-h-[300px]">
                  {currentVideo ? (
                    <video
                      ref={videoRef}
                      src={currentVideo.url}
                      className="max-h-full max-w-full object-contain"
                      style={{ filter: adjustmentsToCssFilter(colorAdjustments) }}
                      onEnded={() => setIsPlaying(false)}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                    />
                  ) : (
                    <div className="text-muted-foreground text-center">
                      <p className="text-lg mb-1">אין סרטון לסצנה הזו</p>
                    </div>
                  )}
                  <div className="absolute top-3 right-3 flex gap-2">
                    <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded-full backdrop-blur-sm">
                      סצנה {activeScene + 1}
                    </span>
                    {isSceneApproved && (
                      <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-full backdrop-blur-sm flex items-center gap-1">
                        <Check className="h-3 w-3" /> מאושר
                      </span>
                    )}
                    {isSceneSaved && (
                      <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full backdrop-blur-sm flex items-center gap-1">
                        <Save className="h-3 w-3" /> נשמר
                      </span>
                    )}
                    {currentVideo && (
                      <span className="text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded-full backdrop-blur-sm">
                        {currentVideo.angle}
                      </span>
                    )}
                  </div>
                </div>

                {/* Multi-Cam View */}
                {currentVideos.length > 1 && (
                  <div className="px-4 py-3">
                    <MultiCamView
                      videos={currentVideos}
                      onAngleSelect={(i) => { setActiveAngle(i); setIsPlaying(false); }}
                      activeAngle={activeAngle}
                      sceneIndex={activeScene}
                    />
                  </div>
                )}

                {/* Trim Editor — set in/out points for this scene */}
                {currentVideo && (
                  <div className="px-4 py-3 border-t border-border">
                    <TrimEditor
                      videoUrl={currentVideo.url}
                      trimStart={sceneTrimData[activeScene]?.start ?? 0}
                      trimEnd={sceneTrimData[activeScene]?.end ?? null}
                      onTrimChange={(start, end) => handleTrimChange(activeScene, start, end)}
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-3 py-3 bg-card border-t border-border flex-wrap">
                <Button variant="ghost" size="icon" onClick={() => skipScene(-1)} disabled={activeScene === 0}>
                  <SkipForward className="h-4 w-4" />
                </Button>
                <Button variant="default" size="icon" onClick={togglePlay} disabled={!currentVideo} className="h-10 w-10 rounded-full">
                  {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => skipScene(1)} disabled={activeScene === project.scenes_count - 1}>
                  <SkipBack className="h-4 w-4" />
                </Button>

                {currentVideos.length > 0 && !isSceneApproved && (
                  <Button size="sm" onClick={approveScene} className="gap-2 mr-4">
                    <Check className="h-4 w-4" /> אשר סצנה
                  </Button>
                )}
                {isSceneApproved && !isSceneSaved && (
                  <>
                    <Button size="sm" onClick={saveScene} className="gap-2 mr-4 bg-green-600 hover:bg-green-700">
                      <Save className="h-4 w-4" /> שמור עריכה
                    </Button>
                    <Button size="sm" variant="outline" onClick={cancelScene} className="gap-2">
                      <X className="h-4 w-4" /> בטל עריכה
                    </Button>
                  </>
                )}
              </div>

              {currentVideos.length > 1 && (
                <div className="flex items-center gap-2 px-4 py-2 bg-card border-t border-border overflow-x-auto">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">זוויות:</span>
                  {currentVideos.map((v, i) => (
                    <button
                      key={i}
                      onClick={() => { setActiveAngle(i); setIsPlaying(false); }}
                      className={`text-xs px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
                        i === activeAngle
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      }`}
                    >
                      {v.angle}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ======= MERGING PROGRESS ======= */}
          {stage === "merging" && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4 max-w-md">
                <Loader2 className="h-16 w-16 text-primary animate-spin mx-auto" />
                <h2 className="text-xl font-bold text-foreground">ממזג סצנות...</h2>
                <div className="h-3 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all duration-200" style={{ width: `${mergeProgress}%` }} />
                </div>
                <span className="text-sm text-muted-foreground font-mono">{mergeProgress}%</span>
              </div>
            </div>
          )}

          {/* ======= MERGED — AI fine-tuning ======= */}
          {stage === "merged" && (
            <div className="flex-1 flex flex-col">
              <div className="bg-green-500/10 border-b border-green-500/30 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setStage("scene-list")} className="gap-1">
                    <ChevronLeft className="h-4 w-4" />
                    חזרה
                  </Button>
                  <Check className="h-5 w-5 text-green-400" />
                  <p className="text-sm font-semibold text-green-400">תצוגה מקדימה — כל האפקטים והחיתוכים הוחלו על הווידאו. הורד כדי לשמור.</p>
                </div>
              </div>
              <div className="flex-1 flex items-center justify-center bg-black/40 p-4">
                {mergedVideoUrl ? (
                  <video
                    ref={mergedVideoRef}
                    src={mergedVideoUrl}
                    controls
                    className="max-w-full max-h-full rounded-lg shadow-xl"
                  />
                ) : (
                  <div className="text-center text-muted-foreground">
                    <Film className="h-20 w-20 mx-auto mb-4 text-primary/40" />
                    <p className="text-lg">הסרט הערוך מוכן לצפייה</p>
                    <p className="text-sm">פנה ל-AI בצ'אט לחידוד ותיקונים</p>
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-border bg-card flex items-center gap-3 justify-end flex-wrap">
                {mergedVideoUrl && (
                  <p className="text-sm text-green-400 mr-auto">✅ הסרט הממוזג שלך מוכן ושמור.</p>
                )}
                {mergedVideoUrl && (
                  <Button variant="outline" className="gap-2" asChild>
                    <a href={mergedVideoUrl} download="merged-video.mp4">
                      <Download className="h-4 w-4" />
                      הורד סרט
                    </a>
                  </Button>
                )}
                {mergedVideoUrl && (
                  <Button variant="outline" className="gap-2" onClick={() => startMerge(true)}>
                    <Wand2 className="h-4 w-4" />
                    מזג מחדש
                  </Button>
                )}
                {mergedVideoUrl && (
                  <Button variant="destructive" className="gap-2" onClick={deleteMergedVideo}>
                    <X className="h-4 w-4" />
                    מחק מיזוג
                  </Button>
                )}
                <Button onClick={() => {
                  void persistProjectInstructions({ workflow_stage: "soundtrack" }).catch(() => {});
                  setStage("options");
                  setChatMessages(prev => [...prev, { role: "ai", content: "🎬 הסרט ערוך! בחר: הורד את הסרט או המשך עריכה עם אופציות נוספות." }]);
                }} className="gap-2" size="lg" disabled={!mergedVideoUrl}>
                  <ArrowRight className="h-5 w-5" />
                  שמור והמשך
                </Button>
              </div>
            </div>
          )}

          {/* ======= OPTIONS ======= */}
          {stage === "options" && (
            <div className="flex-1 flex flex-col">
              <div className="bg-primary/10 border-b border-primary/30 px-4 py-3 flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setStage("merged")} className="gap-1">
                  <ChevronLeft className="h-4 w-4" />
                  חזרה
                </Button>
                <Film className="h-5 w-5 text-primary" />
                <p className="text-sm font-semibold text-primary">הסרט ערוך — מה תרצה לעשות?</p>
              </div>
              <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
                <div className="max-w-2xl w-full space-y-6">
                  <button
                    onClick={() => {
                      void persistProjectInstructions({ workflow_stage: "download" }).catch(() => {});
                      setChatMessages(prev => [...prev, { role: "ai", content: "⬇️ מכין את הסרט להורדה..." }]);
                      setStage("download");
                    }}
                    className="w-full flex items-center gap-5 p-6 rounded-2xl border-2 border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all text-right"
                  >
                    <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Download className="h-7 w-7 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-lg font-bold text-foreground">הורד את הסרט</p>
                      <p className="text-sm text-muted-foreground">הסרט מוכן — הורד אותו כעת</p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                  </button>

                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground px-1">המשך עריכה</h3>
                    {[
                      { label: "הוסף פסקול", desc: "בחר מוזיקת רקע מתוך אופציות חינמיות", icon: Music, action: () => startSoundtrack() },
                      { label: "שפר צבע", desc: "בצע תיקוני צבע גלובליים על הסרט", icon: Palette, action: () => { setStage("merged"); setChatMessages(prev => [...prev, { role: "ai", content: "🎨 חזרנו למסך הסרט. פנה אליי בצ'אט כדי לשפר צבעים, ניגודיות ועוד." }]); } },
                      { label: "חיתוך וגזירה", desc: "חתוך קטעים מיותרים או שנה סדר", icon: Scissors, action: () => { setStage("merged"); setChatMessages(prev => [...prev, { role: "ai", content: "✂️ חזרנו למסך הסרט. ספר לי מה לחתוך או לשנות." }]); } },
                      { label: "שיפור AI", desc: "תן ל-AI לשפר אוטומטית את הסרט", icon: Wand2, action: () => { setStage("merged"); setChatMessages(prev => [...prev, { role: "ai", content: "✨ מפעיל שיפור AI אוטומטי... מנתח ומשפר את הסרט. ✅" }]); } },
                      { label: "התאמת סאונד", desc: "התאם עוצמות מוזיקה, דיאלוגים ואפקטים", icon: Volume2, action: () => { setStage("sound-sync"); setChatMessages(prev => [...prev, { role: "ai", content: "🔊 בוא נתאים את עוצמות הסאונד בסרט." }]); } },
                      { label: "כתוביות", desc: "הוסף כתוביות בשפות שונות", icon: Subtitles, action: () => { setStage("subtitles"); setChatMessages(prev => [...prev, { role: "ai", content: "📝 בחר שפת כתוביות לסרט." }]); } },
                    ].map(({ label, desc, icon: Icon, action }) => (
                      <button
                        key={label}
                        onClick={action}
                        className="w-full flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all text-right"
                      >
                        <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-foreground text-sm">{label}</p>
                          <p className="text-xs text-muted-foreground">{desc}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======= SOUNDTRACK ======= */}
          {stage === "soundtrack" && (
            <div className="flex-1 flex flex-col">
              <div className="bg-primary/10 border-b border-primary/30 px-4 py-3 flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setStage("options")} className="gap-1">
                  <ChevronLeft className="h-4 w-4" />
                  חזרה
                </Button>
                <Music className="h-5 w-5 text-primary" />
                <p className="text-sm font-semibold text-primary">בחר פסקול לסרט — אופציות חינמיות מ-Suno</p>
              </div>
              <div className="flex-1 overflow-auto p-6">
                <div className="max-w-2xl mx-auto space-y-3">
                  {sunoTracks.map((track) => (
                    <button
                      key={track.id}
                      onClick={() => track.free && setSelectedTrack(track.id)}
                      disabled={!track.free}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-right ${
                        selectedTrack === track.id
                          ? "bg-primary/10 border-primary/50"
                          : track.free
                            ? "bg-card border-border hover:border-primary/30"
                            : "bg-muted/20 border-border/40 opacity-50"
                      }`}
                    >
                      <Music className={`h-8 w-8 flex-shrink-0 ${selectedTrack === track.id ? "text-primary" : "text-muted-foreground"}`} />
                      <div className="flex-1">
                        <p className="font-semibold text-foreground">{track.name}</p>
                        <p className="text-xs text-muted-foreground">{track.genre} · {track.duration}</p>
                      </div>
                      {track.free ? (
                        <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-full">חינם</span>
                      ) : (
                        <span className="text-xs bg-secondary text-muted-foreground px-2 py-1 rounded-full">פרימיום</span>
                      )}
                      {selectedTrack === track.id && <Check className="h-5 w-5 text-primary" />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="px-6 py-4 border-t border-border bg-card flex flex-col sm:flex-row gap-3">
                <Button onClick={confirmSoundtrack} disabled={!selectedTrack} className="flex-1 gap-2" size="lg">
                  <Save className="h-5 w-5" /> שמור והמשך להורדה
                </Button>
                {mergedVideoUrl && (
                  <Button
                    variant="outline"
                    className="flex-1 gap-2"
                    size="lg"
                    asChild
                  >
                    <a href={mergedVideoUrl} download="final-video.mp4">
                      <Download className="h-5 w-5" /> הורד עכשיו
                    </a>
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* ======= SOUND SYNC ======= */}
          {stage === "sound-sync" && (
            <div className="flex-1 flex flex-col">
              <div className="bg-primary/10 border-b border-primary/30 px-4 py-3 flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setStage("options")} className="gap-1">
                  <ChevronLeft className="h-4 w-4" />
                  חזרה
                </Button>
                <Volume2 className="h-5 w-5 text-primary" />
                <p className="text-sm font-semibold text-primary">התאמת סאונד</p>
              </div>
              <div className="flex-1 overflow-auto p-6">
                <div className="max-w-lg mx-auto space-y-6">
                  <div className="bg-card rounded-xl border border-border p-5 space-y-4">
                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                      <Volume2 className="h-4 w-4 text-primary" /> עוצמת שמע
                    </h3>
                    {["מוזיקה", "דיאלוגים", "אפקטים"].map((label) => (
                      <div key={label} className="flex items-center gap-3">
                        <span className="text-sm text-foreground w-20">{label}</span>
                        <input type="range" min="0" max="100" defaultValue="70" className="flex-1 accent-[hsl(var(--primary))]" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-border bg-card">
                <Button onClick={() => { setStage("options"); setChatMessages(prev => [...prev, { role: "ai", content: "🔊 הסאונד הותאם! חוזרים לאופציות." }]); }} className="w-full gap-2" size="lg">
                  <Check className="h-5 w-5" /> שמור הגדרות סאונד
                </Button>
              </div>
            </div>
          )}

          {/* ======= SUBTITLES ======= */}
          {stage === "subtitles" && (
            <div className="flex-1 flex flex-col">
              <div className="bg-primary/10 border-b border-primary/30 px-4 py-3 flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setStage("options")} className="gap-1">
                  <ChevronLeft className="h-4 w-4" />
                  חזרה
                </Button>
                <Subtitles className="h-5 w-5 text-primary" />
                <p className="text-sm font-semibold text-primary">כתוביות</p>
              </div>
              <div className="flex-1 overflow-auto p-6">
                <div className="max-w-lg mx-auto space-y-6">
                  <div className="bg-card rounded-xl border border-border p-5 space-y-4">
                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                      <Subtitles className="h-4 w-4 text-primary" /> בחר שפת כתוביות
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {["עברית", "אנגלית", "ערבית", "ללא כתוביות"].map((lang) => (
                        <button
                          key={lang}
                          className="text-sm px-4 py-2.5 rounded-lg border border-border bg-secondary/60 text-foreground hover:border-primary/40 hover:bg-primary/10 transition-all"
                        >
                          {lang}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-border bg-card">
                <Button onClick={() => { setStage("options"); setChatMessages(prev => [...prev, { role: "ai", content: "📝 כתוביות נוספו! חוזרים לאופציות." }]); }} className="w-full gap-2" size="lg">
                  <Check className="h-5 w-5" /> שמור כתוביות
                </Button>
              </div>
            </div>
          )}

          {/* ======= DOWNLOAD ======= */}
          {stage === "download" && (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center space-y-6 max-w-md">
                <div className="h-20 w-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
                  <Film className="h-10 w-10 text-green-400" />
                </div>
                <h2 className="text-2xl font-bold text-foreground">🎬 הסרט מוכן!</h2>
                {mergedVideoUrl ? (
                  <p className="text-sm text-green-400">✅ סטטוס: הושלם — הגרסה האחרונה שמורה ומוכנה להורדה.</p>
                ) : (
                  <p className="text-sm text-yellow-400">⚠️ אין כרגע סרט ממוזג. חזור ומזג את הסצנות.</p>
                )}
                <div className="flex flex-col gap-3">
                  {mergedVideoUrl && (
                    <Button className="gap-2 w-full" size="lg" asChild>
                      <a href={mergedVideoUrl} download="final-video.mp4">
                        <Download className="h-5 w-5" /> הורד סרט
                      </a>
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => { void persistProjectInstructions({ workflow_stage: "soundtrack" }).catch(() => {}); setStage("soundtrack"); }} className="gap-2 w-full">
                    <ChevronLeft className="h-4 w-4" /> חזור לפסקול
                  </Button>
                  {mergedVideoUrl && (
                    <Button variant="outline" onClick={() => startMerge(true)} className="gap-2 w-full">
                      <Wand2 className="h-4 w-4" /> מזג מחדש
                    </Button>
                  )}
                  {mergedVideoUrl && (
                    <Button variant="destructive" onClick={deleteMergedVideo} className="gap-2 w-full">
                      <X className="h-4 w-4" /> מחק גרסה
                    </Button>
                  )}
                  {!mergedVideoUrl && (
                    <Button onClick={() => setStage("scene-list")} className="gap-2 w-full" size="lg">
                      <Film className="h-4 w-4" /> חזור לסצנות ומזג
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => navigate("/")} className="gap-2 w-full">
                    חזרה לפרויקטים
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — AI Chat Panel (all stages except scene-list and loading) */}
        {stage !== "scene-list" && (
          <AIChatPanel
            messages={chatMessages}
            onSendMessage={handleSendMessage}
            onQuickAction={handleQuickAction}
            stage={stage}
            activeScene={activeScene}
            videoCount={currentVideos.length}
            onApplyAICut={() => {
              setChatMessages(prev => [
                ...prev,
                { role: "ai", content: `🎬 זיהיתי ${currentVideos.length} זוויות בסצנה ${activeScene + 1}.\n\nאני ממליץ:\n- **פתיחה** עם ${currentVideos[0]?.angle || "זווית 1"} (שוט רחב)\n- **חיתוך ב-00:15** ל${currentVideos[Math.min(1, currentVideos.length - 1)]?.angle || "זווית 2"} כשהשחקן זז\n${currentVideos.length > 2 ? `- **תקריב ב-00:22** ל${currentVideos[2]?.angle} ללכידת רגש\n` : ""}\nהאם להחיל את החיתוך הזה?`,
                  actions: [
                    { label: "החל חיתוך", type: "apply" as const, onAction: () => {
                      setChatMessages(p => [...p, { role: "ai", content: "✅ חיתוך אוטומטי הוחל! הזוויות מסודרות לפי המלצת ה-AI." }]);
                      approveScene();
                    }},
                    { label: "דחה", type: "reject" as const, onAction: () => {
                      setChatMessages(p => [...p, { role: "ai", content: "בסדר, לא הוחל. תוכל לבחור ידנית מה-Multi-Cam." }]);
                    }},
                  ],
                },
              ]);
            }}
          />
        )}
      </div>
    </div>
  );
};

export default Editor;
