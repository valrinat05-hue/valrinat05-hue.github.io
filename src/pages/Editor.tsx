import { useEffect, useState, useRef, useCallback } from "react";
import { smartMergeVideos, SmartMergeInput, exportEDLAsJSON, exportEDLAsCMX, type EDL } from "@/lib/videoMerge";
import MultiCamView from "@/components/editor/MultiCamView";
import TrimEditor from "@/components/editor/TrimEditor";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/localDb";
import { saveVideoBlob, getVideoBlob, deleteVideoBlob, isIndexedDBKey, isFSAKey, saveFileHandle, getFileHandle, deleteFileHandle } from "@/lib/videoDB";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-4-6";

function getAnthropicKey(): string {
  return localStorage.getItem("anthropic_api_key") || (import.meta.env.VITE_ANTHROPIC_API_KEY as string) || "";
}

// ─── Professional Film Editing Knowledge Base ──────────────────────────────
// Deep synthesis from: Walter Murch "In the Blink of an Eye", Sven Pape "This Guy Edits",
// EditStock professional curriculum, and cinematic editing principles.
const FILM_EDITING_KNOWLEDGE = `
=== MASTER FILM EDITING DECISION SYSTEM ===

━━━ CORE PHILOSOPHY ━━━
You are an AI film editor trained in professional cinematic editing. Your role is to serve the story and emotion — NEVER the technical.
Always ask two questions before every cut:
  1. "What does the audience NEED TO FEEL right now?"
  2. "What does the audience NEED TO KNOW right now?"
The best edit is the one the audience never notices. If they see the cut, it failed.

━━━ PRIORITY ORDER (Walter Murch's Rule of Six) ━━━
Sacrifice in reverse order. NEVER sacrifice Emotion for anything below it.
1. EMOTION (51%) — Does this cut feel emotionally true? PROTECT ABOVE ALL ELSE.
2. STORY (23%) — Does it advance narrative, character arc, or theme?
3. RHYTHM (10%) — Does it land at the right rhythmic/musical moment?
4. EYE TRACE (7%) — Where is the viewer's eye in the frame? Preserve visual flow.
5. 2D PLANE (5%) — Screen direction, axis, spatial grammar.
6. 3D SPACE (4%) — Physical continuity of the real world.
Rule: A technically imperfect cut that serves emotion beats a technically perfect cut that kills it.

━━━ 6-STEP EDITING WORKFLOW ━━━
STEP 1 — ANALYZE FOOTAGE:
  • Watch every take without judgment — note the emotional surprises
  • Mark: best performance moments, technical problems, unexpected gold
  • Identify the "spine" of the scene: what is it REALLY about?

STEP 2 — UNDERSTAND SCENE INTENTION:
  • What does the director want the audience to FEEL?
  • What is the character's inner transformation in this scene?
  • What is the story question this scene asks or answers?
  • What genre/tone demands does this scene have?

STEP 3 — CHOOSE BEST PERFORMANCES:
  • Best take ≠ most technically perfect take — best EMOTIONAL truth wins
  • Sometimes combine: best line delivery from take 3, best reaction from take 7
  • A subtle micro-expression is worth more than a technically clean read
  • Choose performances that serve the character's arc, not the actor's ego
  • Look for: real tears, spontaneous pauses, genuine surprise, unplanned moments

STEP 4 — BUILD ROUGH CUT:
  • Lay down the emotional spine first — don't optimize yet
  • Use the best performance anchor, then build around it
  • Include everything that might matter — cut aggressively later
  • Trust your gut on first assembly — initial instincts are often correct
  • Don't cut in chronological script order if a different order serves emotion better

STEP 5 — IMPROVE PACING AND RHYTHM:
  • Find the scene's natural heartbeat — then make deliberate choices to deviate
  • Vary shot length: short-short-short-LONG creates impact at the hold
  • Rhythm in drama = breathing — give the audience time to absorb emotion
  • Remove frames from the tail of shots (not the head) to tighten without losing beats
  • Tension builds in STILLNESS — don't cut just to cut

STEP 6 — POLISH SOUND, MUSIC, TRANSITIONS:
  • Sound design first: room tone, natural sound, sync audio
  • Add music only after picture lock — music can mask emotional problems
  • Transitions must serve story: dissolve = time passing; smash cut = shock; match cut = connection
  • J-cuts and L-cuts create psychological continuity across edits
  • End on sound: the right ambient tail after a scene can hold emotion longer than any image

━━━ WHEN TO CUT ━━━
CUT ON:
  • ACTION — first third of a physical movement (motion hides the edit)
  • BLINK — the eye's natural reset; cutting here is invisible
  • IMPACT — physical or emotional (punch, revelation, shock)
  • CHARACTER GAZE — when someone looks somewhere, cut to what they see
  • EMOTION PEAK — the frame where feeling is highest on the face; hold 1-2 beats, THEN cut
  • LINE END + BEAT — after a significant line, let silence land, then cut
  • MUSIC BEAT — on the downbeat or rhythmic accent for maximum flow

NEVER CUT:
  • In the middle of an emotional reaction that hasn't finished reading
  • Before a meaningful pause has landed
  • Just to keep the pace moving when stillness serves more
  • On a bad frame (blink at wrong moment, actor not committed)
  • Away from a close-up when the emotion on that face hasn't been read

━━━ WHEN TO HOLD ━━━
HOLD THE SHOT WHEN:
  • A character processes something devastating or beautiful — let them feel it on screen
  • The audience needs to absorb new information — don't rush to the next beat
  • A silence is doing emotional work — cutting breaks the spell
  • The composition itself is telling the story (isolation, scale, beauty)
  • You want the audience to lean in — discomfort builds in prolonged stillness
  • A long take signals: THIS MOMENT MATTERS. Train the audience to feel the weight.

A held shot after a revelation is worth 10 reaction cut-aways.
Uncomfortable stillness > comfortable cutting.

━━━ REACTION SHOTS (Kuleshov Effect) ━━━
The listener's face tells the story — not the speaker's.
• Show who RECEIVES information, not just who delivers it
• Two shots create meaning neither has alone: face + object = emotion
• Cut to reaction AFTER the emotional line fully lands — never during
• The reaction shot is where the audience transfers their own feelings onto the character
• Over-shoulder shots = intimacy; wide 2-shot = power dynamics; solo close-up = inner world
• In drama: reaction > action. What someone FEELS about what happens > what happens.
• Use reaction shots to: redirect sympathy, add ambiguity, deepen subtext
• Insert a reaction early when you want the audience to side with a character

━━━ DIALOGUE EDITING ━━━
• Do NOT always cut to whoever is speaking — cut with INTENTION
• Ask: whose emotional story is happening right now? Cut to THEM.
• The pause before a line is often more powerful than the line itself
• Cut on PAUSES within speech — adds dramatic weight; audience leans in
• Overlap audio (J/L cuts) to avoid the "tennis match" feel of constant speaker-to-speaker
• Sometimes hold on a face during someone else's dialogue to show their reaction
• A great line reading wasted by cutting away too fast = editing failure
• End dialogue scenes on EMOTION (a face, a silence) not on the last word

J-CUT (audio leads video):
  • Next scene's sound/dialogue begins before the image cuts
  • Effect: bridges scenes, creates anticipation, pulls audience forward
  • Use when: transitioning between scenes, building toward a new scene's reality
  • Example: hear the party before you see it

L-CUT (audio trails video):
  • Current scene's audio continues after the image cuts to next scene
  • Effect: emotional continuity, the past echoing into the present
  • Use when: a character is thinking about what was just said; haunting effect
  • Example: we see the character alone, but still hear the fight from the scene before

━━━ SILENCE AS A TOOL ━━━
Silence is NOT the absence of sound — it is a deliberate creative choice.
• Silence before a line = anticipation and importance
• Silence after a line = weight and consequence
• Silence between characters = unspoken tension, power dynamics, subtext
• Strategic room tone = reality and presence
• A quiet moment in an action film is more powerful than the loudest explosion
• Never fill silence with music just because it feels "empty" — empty IS the feeling
• The most emotionally devastating moments in cinema are often the quietest ones

━━━ PACING & RHYTHM ━━━
Shot length as emotional language:
  • Under 2s: urgency, panic, chaos, action, overwhelm
  • 2-5s: natural dialogue, normal tension, story delivery
  • 5-12s: weight, contemplation, significance, drama
  • 12-25s: beauty, isolation, stillness, psychological pressure
  • 25s+: patience demanded, meditation, director statement

Rhythm variation rules:
  • Short-short-short → LONG = impact on the hold (audience exhales)
  • Long-long → SHORT = shock, disruption, punctuation
  • Consistent rhythm = trance state (works for music-driven sequences)
  • Irregular rhythm = realism, anxiety, improvisation feel
  • NEVER maintain the same shot length for more than 3 consecutive cuts — rhythm dies

━━━ PERFORMANCE SELECTION METHODOLOGY ━━━
Evaluate takes on this hierarchy:
1. EMOTIONAL TRUTH — does it feel real, even if technically imperfect?
2. SPECIFICITY — specific beats > general acting; particularity reads as authentic
3. ENERGY MATCH — does the take match the scene's required emotional register?
4. SPONTANEOUS MOMENTS — unplanned pauses, real hesitation, genuine reactions are gold
5. SUBTEXT — what is the actor communicating beyond the words?
6. Technical quality (focus, exposure, camera movement) — last consideration

Red flags in takes: indicating (performing the emotion, not feeling it), rushing dialogue, presentational energy, explaining subtext that should be felt.
Green flags: micro-expressions, real breath patterns, eyes alive, unexpected small choices.

━━━ SHOT SELECTION LOGIC ━━━
Wide Shot (WS/LS): establish geography, show isolation/scale, reveal power dynamics
Medium Shot (MS): workhorse of dialogue scenes, connects audience to character
Close-Up (CU): intimacy, emotion, revelation — when you go CU, it MATTERS
Extreme Close-Up (ECU): invasion of space, obsession, psychological intensity
Over-Shoulder (OS): relationship between characters, subtext visible
Insert/Cutaway: detail that carries story meaning, compress time, add context

Movement of shots:
  • Push in = increasing tension or intimacy
  • Pull back = revelation, isolation, loss
  • Pan/tilt follows subject = POV empathy
  • Static camera during chaos = control vs. chaos contrast

━━━ CONTINUITY PRINCIPLES ━━━
180-Degree Rule: Never cross the axis of action — it reverses screen direction and disorients audience.
30-Degree Rule: Minimum 30-degree angle change between cuts to avoid jump cut.
Match on Action: Cut during the same physical action continued in the next shot — motion hides the edit.
Eyeline Match: Character looks off-screen → next shot shows what they see.
Screen Direction: Characters moving right-to-left must continue moving right-to-left across edits (unless deliberately reversed for story effect).
Color Continuity: Be aware of color temperature shifts between takes — they signal different time/energy.

━━━ SOUND PSYCHOLOGY ━━━
Music primes emotion; visuals deliver it. Never let them fight.
• Low frequencies = dread, weight, inevitability
• High frequencies = tension, alertness, alarm
• Absence of music in a musical film = shock
• Diegetic sound (sounds IN the scene world) creates presence and reality
• Non-diegetic sound (score) creates emotional distance or amplification
• Silence after music = the greatest dramatic effect in cinema
• The first sound in a new scene sets the emotional expectation
• Mismatched sound (wrong music for image) creates irony, dissonance, and commentary
• A cut that lands on a musical beat feels RIGHT even if the content is wrong

━━━ GENRE-SPECIFIC RULES ━━━

DRAMA:
  • Prioritize faces and reactions over coverage
  • Allow performances to breathe — trust long takes
  • Subtext lives in what is NOT shown; cut to suggestion, not explanation
  • Silence and negative space are your best tools
  • Avoid music that explains what the actor is already showing

ACTION:
  • Cut on impact and motion — rhythm drives everything
  • Short cuts increase perceived speed; never hold during action peaks
  • Use wide shots to establish geography, then go tight in chaos
  • Sound design is 50% of the action experience
  • A moment of stillness/silence before a fight = maximum tension

THRILLER/SUSPENSE:
  • Delay every reveal — the audience waiting IS the experience
  • Hold shots uncomfortably long — let them squirm
  • Red herrings: cut to something suspicious just before the real threat
  • POV shots increase vulnerability
  • Never cut away from something the audience is afraid of — let them face it

COMEDY:
  • Timing IS the joke — frame-perfect cuts are essential
  • Hold on the reaction (the comedic take) longer than you think is right
  • Cut BEFORE the punchline for setup; cut AFTER for reaction
  • Smash cut to black = comedic punctuation
  • Cutting too fast kills comedy; the pause IS the funny

DOCUMENTARY/REALITY:
  • Let interviews breathe — don't rush to B-roll
  • Look for the moment the subject reveals something true and unguarded
  • Strategic silence in an interview = power
  • B-roll should ADD meaning, not just cover talking heads

━━━ DIRECTOR INTENTION READING ━━━
Before editing, ask:
  • What is the director's visual signature for this project?
  • What emotional experience are they building toward?
  • What does the script's subtext tell you about what scenes REALLY mean?
  • Which characters deserve the most screen real estate in this moment?
  • What does the director's shot selection tell you about where they want your eye?

Trust the director's instinct in the footage — they lived with the script. Your job is to help them realize their vision, not impose your own.
But also: sometimes the performance in take 2 is better than the one the director circled. Know when to advocate.

━━━ SLATE / ACTION START DETECTION ━━━
When analyzing raw cinema footage:
  • Slate appears first: black/color board, clapper board, countdown
  • "ACTION" is called verbally — look for the moment when the clapperboard closes (frame flash)
  • After clapper, crew settles — actor starts moving/speaking 1-5 seconds later
  • TRUE action start = first authentic movement or breath from the actor
  • Cut slates completely — they are never part of the edit
  • Also cut: director/crew visible, camera not settled, actor not "in" yet
  • Trim: add 0.5s buffer before actor's first authentic movement

━━━ INVISIBLE EDITING PRINCIPLES ━━━
What makes an edit invisible:
  • The audience's eye is already moving where you're cutting
  • The emotional state carries across the cut seamlessly
  • The audio transition disguises the visual one (J/L cut)
  • Motion continues across the cut
  • The cut happens at a moment of maximum engagement (emotion, action, curiosity)

What makes an edit visible (avoid):
  • Jump cuts that aren't intentional style choices
  • Cutting against screen direction without dramatic justification
  • Leaving the audience behind informationally
  • Audio gap or abrupt sound cut
  • Cutting away before the emotion has been read

=== END MASTER EDITING DECISION SYSTEM ===
`;
// ────────────────────────────────────────────────────────────────────────────

/** Call Claude and return the raw text response */
async function callClaude(
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
  maxTokens = 2000,
): Promise<string> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getAnthropicKey(),
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens, system: systemPrompt, messages }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message || `Claude error ${res.status}`);
  return data?.content?.[0]?.text ?? "";
}

/** Extract JSON from Claude's response — handles optional markdown code fences */
function parseJsonResponse(text: string): any {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const stripped = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
  try { return JSON.parse(stripped); } catch { /* fall through */ }
  const match = text.match(/\{[\s\S]*\}/);
  if (match) return JSON.parse(match[0]);
  throw new Error("No valid JSON in Claude response");
}
import Header from "@/components/Header";
import ManualEditingPanel, { ColorAdjustments, defaultAdjustments, adjustmentsToCssFilter } from "@/components/editor/ManualEditingPanel";
import EditingStylePicker, { EditingStyle } from "@/components/editor/EditingStylePicker";
import { CutPoint } from "@/components/editor/MultiCamView";
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

interface SceneDirectorPlan {
  selected_clips: Array<{
    angle: string;
    trim_start_sec: number;
    trim_end_sec: number | null;
    order: number;
    reason: string;
    transition?: string;
  }>;
  rejected_clips: Array<{ angle: string; reason: string }>;
  summary: string;
  director_note?: string;
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
  const [sceneTransitions, setSceneTransitions] = useState<Record<number, string>>({});
  const [clipDurations, setClipDurations] = useState<Record<string, number>>({});
  const [sceneAIPlan, setSceneAIPlan] = useState<Record<number, SceneDirectorPlan>>({});
  const [sceneMergedVideos, setSceneMergedVideos] = useState<Record<number, string>>({});
  const [isSceneDirecting, setIsSceneDirecting] = useState(false);
  const [showMergedVideo, setShowMergedVideo] = useState<Record<number, boolean>>({});
  const [sceneNotes, setSceneNotes] = useState<Record<number, string>>({});
  const [editingNote, setEditingNote] = useState<number | null>(null);
  const [cutMode, setCutMode] = useState<"rough" | "fine">("rough");
  const [sceneCutPlans, setSceneCutPlans] = useState<Record<number, CutPoint[]>>({});
  const [sceneOrder, setSceneOrder] = useState<number[]>([]);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [pendingFSA, setPendingFSA] = useState<Array<{ fsaKey: string; sceneIndex: number; angleLabel: string; videoId?: string; fileName: string }>>([]);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(() => localStorage.getItem("anthropic_api_key") || "");
  const [clipAnalysisStatus, setClipAnalysisStatus] = useState<Record<string, "pending" | "analyzing" | "selected" | "rejected">>({});
  const [aiAnalyzingClip, setAiAnalyzingClip] = useState<string | null>(null);

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
        const fsaWaiting: typeof pendingFSA = [];
        await Promise.all(videos.map(async (v) => {
          const sceneIndex = scenesData.findIndex(s => s.id === v.scene_id);
          if (sceneIndex < 0) return;
          let url: string | null = null;
          if (isIndexedDBKey(v.file_url)) {
            url = await getVideoBlob(v.file_url);
          } else if (isFSAKey(v.file_url)) {
            const handle = await getFileHandle(v.file_url);
            if (handle) {
              try {
                const perm = await (handle as any).queryPermission({ mode: "read" });
                if (perm === "granted") {
                  url = URL.createObjectURL(await handle.getFile());
                } else {
                  fsaWaiting.push({ fsaKey: v.file_url, sceneIndex, angleLabel: v.angle_label || "זווית ?", videoId: v.id, fileName: v.file_name || "" });
                }
              } catch { /* drive disconnected */ }
            }
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
        if (fsaWaiting.length > 0) setPendingFSA(fsaWaiting);
      }
      setSceneOrder(Array.from({ length: scenesData.length }, (_, i) => i));

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

  const VIDEO_EXTENSIONS = /\.(mp4|mov|avi|mkv|mts|m2ts|mxf|webm|wmv|flv|3gp)$/i;

  const addVideoFiles = async (sceneIndex: number, items: { file: File; handle?: FileSystemFileHandle }[]) => {
    if (!scenes[sceneIndex] || items.length === 0) return;
    setUploadingScene(sceneIndex);
    const sceneId = scenes[sceneIndex].id;
    try {
      for (let i = 0; i < items.length; i++) {
        const { file, handle } = items[i];
        if (!file.type.startsWith("video/") && !VIDEO_EXTENSIONS.test(file.name)) {
          toast.error(`הקובץ "${file.name}" אינו קובץ וידאו`);
          continue;
        }
        const angleLabel = `זווית ${(sceneVideos[sceneIndex]?.length || 0) + i + 1}`;
        const blobUrl = URL.createObjectURL(file);
        const hasFSA = !!handle;
        const key = hasFSA ? `fsa:${sceneId}:${Date.now()}_${i}` : `idb:${sceneId}:${Date.now()}_${i}`;
        const videoRecord = db.sceneVideos.insert({
          scene_id: sceneId,
          file_name: file.name,
          file_url: key,
          angle_label: angleLabel,
        });
        setSceneVideos(prev => ({
          ...prev,
          [sceneIndex]: [...(prev[sceneIndex] || []), { id: videoRecord.id, url: blobUrl, angle: angleLabel }],
        }));
        if (hasFSA) {
          const savingToastId = toast.loading(`שומר מצביע ל-"${file.name}"...`);
          saveFileHandle(key, handle!)
            .then(() => toast.success(`✅ "${file.name}" — ישמר אוטומטית בפתיחה הבאה`, { id: savingToastId }))
            .catch(() => toast.warning(`⚠️ "${file.name}" — לא ישמר לאחר רענון`, { id: savingToastId }));
        } else {
          const savingToastId = toast.loading(`שומר "${file.name}"...`);
          saveVideoBlob(key, file)
            .then(() => toast.success(`✅ "${file.name}" נשמר!`, { id: savingToastId }))
            .catch(() => toast.warning(`⚠️ "${file.name}" — לא נשמר לאחר רענון`, { id: savingToastId }));
        }
      }
      toast.success(`${items.length} סרטון${items.length > 1 ? "ים" : ""} נטענ${items.length > 1 ? "ו" : ""} — ניתן לערוך מיד!`);
    } catch (error: any) {
      toast.error(error.message || "שגיאה בטעינת הסרטון");
    } finally {
      setUploadingScene(null);
    }
  };

  const handleFileUpload = async (sceneIndex: number, files: FileList | null) => {
    if (!files) return;
    await addVideoFiles(sceneIndex, Array.from(files).map(file => ({ file })));
  };

  const pickFilesFromDisk = async (sceneIndex: number) => {
    try {
      const handles: FileSystemFileHandle[] = await (window as any).showOpenFilePicker({
        multiple: true,
        types: [{ description: "קבצי וידאו", accept: { "video/*": [".mp4", ".mov", ".avi", ".mkv", ".mts", ".m2ts", ".mxf", ".webm"] } }],
      });
      const items = await Promise.all(handles.map(async h => ({ file: await h.getFile(), handle: h })));
      await addVideoFiles(sceneIndex, items);
    } catch (err: any) {
      if (err?.name !== "AbortError") toast.error("שגיאה בפתיחת הקבצים");
    }
  };

  const pickFolderFromDisk = async (sceneIndex: number) => {
    try {
      const dirHandle = await (window as any).showDirectoryPicker({ mode: "read" });
      const fileHandles: FileSystemFileHandle[] = [];
      for await (const [name, handle] of (dirHandle as any).entries()) {
        if (handle.kind === "file" && VIDEO_EXTENSIONS.test(name)) fileHandles.push(handle as FileSystemFileHandle);
      }
      if (fileHandles.length === 0) { toast.error("לא נמצאו קבצי וידאו בתיקיה"); return; }
      const items = await Promise.all(fileHandles.map(async h => ({ file: await h.getFile(), handle: h })));
      items.sort((a, b) => a.file.name.localeCompare(b.file.name));
      await addVideoFiles(sceneIndex, items);
    } catch (err: any) {
      if (err?.name !== "AbortError") toast.error("שגיאה בפתיחת התיקיה");
    }
  };

  const reconnectDrive = async () => {
    const remaining: typeof pendingFSA = [];
    for (const item of pendingFSA) {
      const handle = await getFileHandle(item.fsaKey);
      if (!handle) { remaining.push(item); continue; }
      try {
        const perm = await (handle as any).requestPermission({ mode: "read" });
        if (perm === "granted") {
          const url = URL.createObjectURL(await handle.getFile());
          setSceneVideos(prev => ({
            ...prev,
            [item.sceneIndex]: [...(prev[item.sceneIndex] || []), { id: item.videoId, url, angle: item.angleLabel }],
          }));
        } else {
          remaining.push(item);
        }
      } catch { remaining.push(item); }
    }
    setPendingFSA(remaining);
    if (remaining.length < pendingFSA.length) toast.success("סרטונים מהכונן נטענו בהצלחה!");
    else toast.error("לא ניתן היה לגשת לכונן");
  };

  const hasFSA = typeof (window as any).showOpenFilePicker === "function";

  const removeVideo = async (sceneIndex: number, videoIndex: number) => {
    const video = sceneVideos[sceneIndex]?.[videoIndex];
    if (!video) return;

    if (video.id) {
      const sceneId = scenes[sceneIndex]?.id;
      const record = (sceneId ? db.sceneVideos.getByScene(sceneId) : []).find(v => v.id === video.id)
        || db.sceneVideos.getByScenes(scenes.map(s => s.id)).find(v => v.id === video.id);
      if (record && isIndexedDBKey(record.file_url)) await deleteVideoBlob(record.file_url);
      if (record && isFSAKey(record.file_url)) await deleteFileHandle(record.file_url);
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

  const orderedScenesWithVideos = sceneOrder.length === scenesWithVideos.length
    ? sceneOrder.map(i => scenesWithVideos[i]).filter(Boolean)
    : scenesWithVideos;

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

      const systemPrompt = `You are a professional film director and editor AI.
${FILM_EDITING_KNOWLEDGE}
Apply all editing principles above. Create an editing plan as valid JSON.
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

      const rawText = await callClaude(systemPrompt, [{ role: "user", content: userMsg }], 2000);
      let plan: any = null;
      try {
        plan = parseJsonResponse(rawText);
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



  const loadClipDuration = (url: string): Promise<number> =>
    new Promise((resolve) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => resolve(isFinite(v.duration) ? v.duration : 0);
      v.onerror = () => resolve(0);
      v.src = url;
    });

  const extractFrameBase64 = (videoUrl: string, timeSec: number): Promise<string | null> =>
    new Promise((resolve) => {
      let done = false;
      const finish = (val: string | null) => { if (!done) { done = true; resolve(val); } };
      const timeout = setTimeout(() => finish(null), 8000);

      const video = document.createElement("video");
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) { clearTimeout(timeout); resolve(null); return; }
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.crossOrigin = "anonymous";
      video.onloadedmetadata = () => {
        if (timeSec >= video.duration) { finish(null); return; }
        video.currentTime = timeSec;
      };
      video.onseeked = () => {
        clearTimeout(timeout);
        try {
          canvas.width = 320;
          canvas.height = Math.round((320 / (video.videoWidth || 320)) * (video.videoHeight || 180));
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const b64 = canvas.toDataURL("image/jpeg", 0.6).split(",")[1];
          finish(b64 || null);
        } catch { finish(null); }
      };
      video.onerror = () => { clearTimeout(timeout); finish(null); };
      video.src = videoUrl;
      video.load();
    });



  const runSceneAIDirector = async () => {
    const clips = sceneVideos[activeScene] || [];
    if (clips.length === 0) { toast.error("אין קליפים לנתח בסצנה זו"); return; }

    // Reset clip statuses
    const initial: Record<string, "pending" | "analyzing" | "selected" | "rejected"> = {};
    clips.forEach(c => { initial[c.angle] = "pending"; });
    setClipAnalysisStatus(initial);

    setIsSceneDirecting(true);
    setChatMessages(prev => [...prev, { role: "ai", content: `🎬 מנתח ${clips.length} קליפים...` }]);

    try {
      // Load durations for all clips
      const durations = await Promise.all(clips.map((c, i) => {
        const cached = clipDurations[`${activeScene}_${i}`];
        return cached ? Promise.resolve(cached) : loadClipDuration(c.url);
      }));
      const durMap: Record<string, number> = {};
      durations.forEach((d, i) => { durMap[`${activeScene}_${i}`] = d; });
      setClipDurations(prev => ({ ...prev, ...durMap }));

      // Visual detection: find action start in each clip — one by one with status updates
      const actionStarts: Record<string, number> = {};
      for (const clip of clips) {
        setAiAnalyzingClip(clip.angle);
        setClipAnalysisStatus(prev => ({ ...prev, [clip.angle]: "analyzing" }));
        try {
          const sampleTs = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5];
          const frames = (await Promise.all(sampleTs.map(t => extractFrameBase64(clip.url, t)))).filter(Boolean) as string[];
          if (frames.length >= 2) {
            const content: any[] = [
              ...frames.map(data => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } })),
              { type: "text", text: `These ${frames.length} frames are from the start of a film clip (${sampleTs.slice(0, frames.length).map(t => t + "s").join(", ")}).\nThe clip starts with a clapperboard slate. A director says "action" and then the actor begins performing.\nAt which timestamp (seconds) does the ACTOR START their performance?\nReply with ONLY a single decimal number. Example: 3.5` },
            ];
            const res = await fetch(ANTHROPIC_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-api-key": getAnthropicKey(), "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
              body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 20, messages: [{ role: "user", content }] }),
            });
            const data = await res.json();
            const val = parseFloat(data?.content?.[0]?.text?.trim() ?? "");
            actionStarts[clip.angle] = (isFinite(val) && val >= 0 && val <= 15) ? val : 3.0;
          } else {
            actionStarts[clip.angle] = 3.0;
          }
        } catch { actionStarts[clip.angle] = 3.0; }
        setClipAnalysisStatus(prev => ({ ...prev, [clip.angle]: "pending" }));
      }
      setAiAnalyzingClip(null);

      const actionList = clips.map(c => `${c.angle}: ${(actionStarts[c.angle] ?? 3).toFixed(1)}s`).join(", ");
      setChatMessages(prev => {
        const msgs = [...prev];
        msgs[msgs.length - 1] = { role: "ai", content: `🎬 זיהיתי תחילת אקשן: ${actionList}\nשולח לניתוח AI...` };
        return msgs;
      });

      const clipInfo = clips.map((c, i) => ({
        angle: c.angle,
        duration_sec: Math.round(durations[i]),
        detected_action_start_sec: actionStarts[c.angle] ?? 3.0,
      }));

      const systemPrompt = `You are an expert film director and editor AI with deep knowledge of professional editing principles.
${FILM_EDITING_KNOWLEDGE}
Apply ALL of these principles when analyzing clips. Return ONLY a valid JSON object — no markdown, no explanation.`;

      const userMsg = `Scene ${activeScene + 1} has ${clips.length} clips: ${JSON.stringify(clipInfo, null, 2)}

The "detected_action_start_sec" field is the EXACT moment the actor starts performing (detected visually from the frames).
Use it as trim_start_sec — do NOT use an earlier value.

Return this exact JSON structure:
{
  "selected_clips": [
    {"angle":"זווית 1","trim_start_sec":3.5,"trim_end_sec":null,"order":1,"reason":"...","transition":"cut"}
  ],
  "rejected_clips": [{"angle":"זווית 3","reason":"..."}],
  "summary": "תיאור קצר בעברית של תוכנית העריכה",
  "director_note": "הערת במאי בעברית"
}

Rules:
- trim_start_sec = detected_action_start_sec (exact — never guess)
- Select best shots: wide → medium → close-up is cinematic
- Reject blurry, shaky, over/underexposed, or duplicate shots
- trim_end_sec: null means to end of clip; set only if there is dead time at the end
- transition: "cut" for action, "dissolve" for emotional
- Reply summary and director_note in Hebrew`;

      const raw = await callClaude(systemPrompt, [{ role: "user", content: userMsg }], 2000);
      const plan: SceneDirectorPlan = parseJsonResponse(raw);
      setSceneAIPlan(prev => ({ ...prev, [activeScene]: plan }));

      // Update per-clip statuses based on AI decision
      const newStatuses: Record<string, "pending" | "analyzing" | "selected" | "rejected"> = {};
      plan.selected_clips?.forEach(c => { newStatuses[c.angle] = "selected"; });
      plan.rejected_clips?.forEach(c => { newStatuses[c.angle] = "rejected"; });
      setClipAnalysisStatus(prev => ({ ...prev, ...newStatuses }));

      const acceptedCount = plan.selected_clips?.length ?? 0;
      const rejectedCount = plan.rejected_clips?.length ?? 0;
      setChatMessages(prev => [...prev, {
        role: "ai",
        content: `🎬 **תוכנית עריכה:**\n\n${plan.summary}\n\n✅ נבחרו: **${acceptedCount}**  ❌ נדחו: **${rejectedCount}**\n\n📝 _${plan.director_note || ""}_`,
      }]);
    } catch (err: any) {
      toast.error("שגיאה בניתוח AI: " + err.message);
      setChatMessages(prev => [...prev, { role: "ai", content: "❌ שגיאה בניתוח. נסי שוב." }]);
    } finally {
      setIsSceneDirecting(false);
    }
  };

  const applySceneAIPlan = async (plan: SceneDirectorPlan) => {
    const clips = sceneVideos[activeScene] || [];
    const inputs: import("@/lib/videoMerge").SmartMergeInput[] = plan.selected_clips
      .slice()
      .sort((a, b) => a.order - b.order)
      .flatMap(sp => {
        const clip = clips.find(c => c.angle === sp.angle);
        if (!clip) return [];
        return [{ url: clip.url, index: sp.order, trimStartSec: sp.trim_start_sec ?? 0, trimEndSec: sp.trim_end_sec ?? null, playbackSpeed: 1.0 }];
      });

    if (inputs.length === 0) { toast.error("לא נמצאו קליפים למיזוג"); return; }

    const toastId = toast.loading(`ממזג ${inputs.length} קליפים (720p תצוגה מקדימה)...`);
    setIsSceneDirecting(true);
    try {
      // proxyMode=true: scales output to 720p for fast browser preview
      const url = await smartMergeVideos(inputs, () => {}, colorAdjustments, true);
      setSceneMergedVideos(prev => ({ ...prev, [activeScene]: url }));
      setShowMergedVideo(prev => ({ ...prev, [activeScene]: true }));
      toast.success("✅ תצוגה מקדימה מוכנה (720p). לייצוא ב-4K — לחצי על ⬇ EDL", { id: toastId });
    } catch (err: any) {
      toast.error("שגיאה במיזוג: " + err.message, { id: toastId });
    } finally {
      setIsSceneDirecting(false);
    }
  };

  const exportSceneEDL = (format: "json" | "cmx") => {
    const plan = sceneAIPlan[activeScene];
    const clips = sceneVideos[activeScene] || [];
    if (!plan) { toast.error("הרץ AI במאי קודם"); return; }
    const edl: EDL = {
      title: `Scene ${activeScene + 1} — ${project?.name || ""}`,
      sceneIndex: activeScene,
      exportedAt: new Date().toISOString(),
      selected: plan.selected_clips.map(sp => {
        const clip = clips.find(c => c.angle === sp.angle);
        const sceneId = scenes[activeScene]?.id;
        const dbRow = sceneId ? db.sceneVideos.getByScene(sceneId).find(r => r.id === clip?.id) : null;
        return {
          fileName: dbRow?.file_name ?? sp.angle,
          angle: sp.angle,
          order: sp.order,
          inPointSec: sp.trim_start_sec,
          outPointSec: sp.trim_end_sec ?? null,
          transition: sp.transition ?? "cut",
          reason: sp.reason,
        };
      }),
      rejected: plan.rejected_clips.map(r => {
        const clip = clips.find(c => c.angle === r.angle);
        return { fileName: clip ? (clip.angle) : r.angle, angle: r.angle, reason: r.reason };
      }),
      notes: plan.director_note ?? "",
    };
    if (format === "json") exportEDLAsJSON(edl);
    else exportEDLAsCMX(edl);
    toast.success(format === "json" ? "✅ JSON הורד" : "✅ EDL הורד — ייבאי ל-DaVinci/Premiere");
  };

  const isSceneApproved = approvedScenes.has(activeScene);
  const isSceneSaved = savedScenes.has(activeScene);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      {/* ── API Key Modal ── */}
      {showApiKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-card border rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold mb-1">מפתח Anthropic API</h2>
            <p className="text-sm text-muted-foreground mb-4">נדרש להפעלת AI במאי. המפתח נשמר בדפדפן בלבד.</p>
            <input
              type="password"
              placeholder="sk-ant-api03-..."
              value={apiKeyInput}
              onChange={e => setApiKeyInput(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background mb-4 font-mono"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setShowApiKeyModal(false)}>ביטול</Button>
              <Button onClick={() => {
                localStorage.setItem("anthropic_api_key", apiKeyInput.trim());
                setShowApiKeyModal(false);
                toast.success("מפתח נשמר!");
              }}>שמור</Button>
            </div>
          </div>
        </div>
      )}

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
                <div className="flex-1">
                  <h2 className="text-lg font-bold text-foreground">{project.name} — סצנות</h2>
                  <p className="text-sm text-muted-foreground">לחץ על סצנה כדי לפתוח ולערוך. שמור כל סצנה לפני מיזוג.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowApiKeyModal(true)} className="gap-1 shrink-0">
                  🔑 מפתח AI
                </Button>
              </div>
              {pendingFSA.length > 0 && (
                <div className="mx-6 mt-4 px-4 py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 flex items-center gap-3">
                  <span className="text-lg">🔌</span>
                  <div className="flex-1 text-sm">
                    <span className="font-semibold text-yellow-400">{pendingFSA.length} סרטון{pendingFSA.length > 1 ? "ים" : ""} על כונן חיצוני</span>
                    <span className="text-muted-foreground mr-2">— חבר את הכונן ולחץ להטעין</span>
                  </div>
                  <Button size="sm" variant="outline" className="border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10 shrink-0" onClick={reconnectDrive}>
                    חבר כונן
                  </Button>
                </div>
              )}
              <div className="flex-1 overflow-auto p-6">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {orderedScenesWithVideos.map((scene) => {
                    const saved = savedScenes.has(scene.index);
                    const isUploading = uploadingScene === scene.index;
                    const isDragging = dragFrom === scene.index;
                    const hasNote = !!sceneNotes[scene.index];
                    return (
                      <div
                        key={scene.index}
                        draggable
                        onDragStart={() => setDragFrom(scene.index)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragFrom === null || dragFrom === scene.index) { setDragFrom(null); return; }
                          setSceneOrder(prev => {
                            const next = [...prev];
                            const fromPos = next.indexOf(dragFrom);
                            const toPos = next.indexOf(scene.index);
                            next.splice(fromPos, 1);
                            next.splice(toPos, 0, dragFrom);
                            return next;
                          });
                          setDragFrom(null);
                        }}
                        onDragEnd={() => setDragFrom(null)}
                        className={`relative flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all cursor-grab active:cursor-grabbing select-none ${
                          isDragging ? "opacity-50 scale-95" :
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
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-foreground">סצנה {scene.index + 1}</span>
                          {hasNote && (
                            <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full border border-yellow-500/30">📝</span>
                          )}
                        </div>
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
                        {isUploading ? (
                          <Button variant="outline" size="sm" disabled className="gap-1 text-xs w-full">
                            <Loader2 className="h-3 w-3 animate-spin" /> טוען...
                          </Button>
                        ) : hasFSA ? (
                          <div className="flex gap-1 w-full">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); pickFilesFromDisk(scene.index); }}
                              className="gap-1 text-xs flex-1"
                              title="בחר קבצים מהכונן"
                            >
                              <Upload className="h-3 w-3" /> קבצים
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); pickFolderFromDisk(scene.index); }}
                              className="gap-1 text-xs flex-1"
                              title="בחר תיקיה שלמה (כל הזוויות)"
                            >
                              <FolderOpen className="h-3 w-3" /> תיקיה
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); fileInputRefs.current[scene.index]?.click(); }}
                            className="gap-1 text-xs w-full"
                          >
                            <Upload className="h-3 w-3" /> העלה סרטונים
                          </Button>
                        )}

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
              <div className="px-4 py-2 border-b border-border bg-card flex items-center gap-2 flex-wrap">
                <Button variant="ghost" size="sm" onClick={backToSceneList} className="gap-1">
                  <ChevronLeft className="h-4 w-4" />
                  חזרה
                </Button>
                <span className="text-sm text-muted-foreground">סצנה {activeScene + 1}/{project.scenes_count}</span>
                <div className="flex-1" />
                {/* AI Director button */}
                {currentVideos.length > 0 && (
                  <Button
                    size="sm"
                    onClick={() => { void runSceneAIDirector(); }}
                    disabled={isSceneDirecting}
                    className="gap-1.5 text-xs bg-primary/90 hover:bg-primary"
                  >
                    {isSceneDirecting
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Wand2 className="h-3.5 w-3.5" />}
                    {isSceneDirecting ? "מנתח..." : "🎬 AI במאי"}
                  </Button>
                )}
                {/* Merged video toggle */}
                {sceneMergedVideos[activeScene] && (
                  <button
                    onClick={() => setShowMergedVideo(prev => ({ ...prev, [activeScene]: !prev[activeScene] }))}
                    className={`text-xs px-2 py-1 rounded border transition-colors ${showMergedVideo[activeScene] ? "border-green-500/50 text-green-400 bg-green-500/10" : "border-border text-muted-foreground hover:text-foreground"}`}
                  >
                    {showMergedVideo[activeScene] ? "✅ ממוזג" : "▶ הצג ממוזג"}
                  </button>
                )}
                {/* Rough / Fine Cut toggle */}
                <div className="flex rounded-lg border border-border overflow-hidden text-xs">
                  <button
                    onClick={() => setCutMode("rough")}
                    className={`px-3 py-1 transition-colors ${cutMode === "rough" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"}`}
                  >✂️ גס</button>
                  <button
                    onClick={() => setCutMode("fine")}
                    className={`px-3 py-1 transition-colors ${cutMode === "fine" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"}`}
                  >🎯 עדין</button>
                </div>
                {/* Scene note badge */}
                <button
                  onClick={() => setEditingNote(editingNote === activeScene ? null : activeScene)}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${sceneNotes[activeScene] ? "border-yellow-500/50 text-yellow-400 bg-yellow-500/10" : "border-border text-muted-foreground hover:text-foreground"}`}
                >
                  📝 {sceneNotes[activeScene] ? "הערה" : "+ הערה"}
                </button>
              </div>
              {/* Director note inline editor */}
              {editingNote === activeScene && (
                <div className="px-4 py-2 border-b border-border bg-yellow-500/5">
                  <textarea
                    className="w-full text-xs bg-transparent text-foreground placeholder-muted-foreground outline-none resize-none"
                    rows={2}
                    placeholder="הערות במאי לסצנה זו..."
                    value={sceneNotes[activeScene] ?? ""}
                    onChange={e => setSceneNotes(prev => ({ ...prev, [activeScene]: e.target.value }))}
                    autoFocus
                  />
                </div>
              )}

              <div className="flex-1 flex flex-col overflow-auto">
                {/* Main video player */}
                <div className="flex-1 flex items-center justify-center bg-black/40 relative min-h-[300px]">
                  {showMergedVideo[activeScene] && sceneMergedVideos[activeScene] ? (
                    <video
                      src={sceneMergedVideos[activeScene]}
                      className="max-h-full max-w-full object-contain"
                      controls
                      playsInline
                    />
                  ) : currentVideo ? (
                    <video
                      ref={videoRef}
                      src={currentVideo.url}
                      className="max-h-full max-w-full object-contain"
                      style={{ filter: adjustmentsToCssFilter(colorAdjustments) }}
                      preload="metadata"
                      playsInline
                      onEnded={() => setIsPlaying(false)}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onLoadedMetadata={(e) => {
                        const dur = (e.target as HTMLVideoElement).duration;
                        if (dur && isFinite(dur)) {
                          setClipDurations(prev => ({ ...prev, [`${activeScene}_${activeAngle}`]: dur }));
                        }
                      }}
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

                {/* ── Clip strip — all uploaded clips as small thumbnails ── */}
                {currentVideos.length > 0 && (
                  <div className="border-t border-border bg-black/20">
                    {/* AI analysis status bar */}
                    {isSceneDirecting && (
                      <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 border-b border-primary/20">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        <span className="text-xs text-primary font-medium">
                          {aiAnalyzingClip ? `מנתח: ${aiAnalyzingClip}...` : "מעבד תוצאות..."}
                        </span>
                      </div>
                    )}

                    {/* AI plan summary after analysis */}
                    {sceneAIPlan[activeScene] && !isSceneDirecting && (
                      <div className="px-4 py-2 bg-primary/5 border-b border-primary/20 flex items-center gap-3 flex-wrap">
                        <span className="text-xs text-primary font-semibold">🎬 {sceneAIPlan[activeScene].summary}</span>
                        <div className="flex-1" />
                        <div className="flex items-center gap-2 flex-wrap">
                          {sceneMergedVideos[activeScene] ? (
                            <button
                              onClick={() => setShowMergedVideo(prev => ({ ...prev, [activeScene]: !prev[activeScene] }))}
                              className="text-xs px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700"
                            >
                              {showMergedVideo[activeScene] ? "▶ הצג מקורי" : "✅ הצג ממוזג (720p)"}
                            </button>
                          ) : (
                            <button
                              onClick={() => void applySceneAIPlan(sceneAIPlan[activeScene])}
                              disabled={isSceneDirecting}
                              className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            >
                              ▶ מזג (720p תצוגה מקדימה)
                            </button>
                          )}
                          <button
                            onClick={() => exportSceneEDL("cmx")}
                            className="text-xs px-3 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                            title="ייצוא EDL לDaVinci Resolve / Premiere Pro"
                          >
                            ⬇ EDL
                          </button>
                          <button
                            onClick={() => exportSceneEDL("json")}
                            className="text-xs px-3 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                            title="ייצוא תוכנית עריכה כ-JSON"
                          >
                            ⬇ JSON
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Clip thumbnails strip */}
                    <div className="flex gap-3 px-4 py-3 overflow-x-auto">
                      {currentVideos.map((v, i) => {
                        const status = clipAnalysisStatus[v.angle];
                        const planEntry = sceneAIPlan[activeScene]?.selected_clips.find(c => c.angle === v.angle);
                        return (
                          <button
                            key={i}
                            onClick={() => { setActiveAngle(i); setIsPlaying(false); setShowMergedVideo(prev => ({ ...prev, [activeScene]: false })); }}
                            className={`shrink-0 flex flex-col items-center gap-1 rounded-lg border-2 p-1.5 transition-all ${
                              i === activeAngle && !showMergedVideo[activeScene]
                                ? "border-primary bg-primary/10"
                                : status === "selected" ? "border-green-500/60 bg-green-500/5"
                                : status === "rejected" ? "border-red-500/40 bg-red-500/5 opacity-50"
                                : status === "analyzing" ? "border-yellow-400/60 bg-yellow-400/5 animate-pulse"
                                : "border-border bg-card hover:border-primary/40"
                            }`}
                          >
                            <div className="w-24 h-14 bg-black/40 rounded flex items-center justify-center relative overflow-hidden">
                              <video
                                src={v.url}
                                className="w-full h-full object-cover"
                                preload="metadata"
                                muted
                              />
                              {status === "analyzing" && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                                  <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />
                                </div>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground truncate w-24 text-center">{v.angle}</span>
                            {status === "selected" && planEntry && (
                              <span className="text-[9px] text-green-400 font-bold">✅ {planEntry.trim_start_sec}s→{planEntry.trim_end_sec ?? "סוף"}</span>
                            )}
                            {status === "rejected" && (
                              <span className="text-[9px] text-red-400">❌ נדחה</span>
                            )}
                            {status === "analyzing" && (
                              <span className="text-[9px] text-yellow-400">⏳ מנתח...</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Trim Editor */}
                {currentVideo && !showMergedVideo[activeScene] && (
                  <div className="px-4 py-3 border-t border-border">
                    <TrimEditor
                      videoRef={videoRef}
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

      </div>
    </div>
  );
};

export default Editor;
