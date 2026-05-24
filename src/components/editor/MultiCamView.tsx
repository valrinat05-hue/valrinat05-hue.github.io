import { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw, Circle, Square, Wand2, Check, Keyboard } from "lucide-react";

interface SceneVideo {
  id?: string;
  url: string;
  angle: string;
  file?: File;
}

export interface CutPoint {
  timeSec: number;
  angleIndex: number;
  angleLabel: string;
}

interface MultiCamViewProps {
  videos: SceneVideo[];
  onAngleSelect: (index: number) => void;
  activeAngle: number;
  sceneIndex: number;
  onCutPlanReady?: (cuts: CutPoint[]) => void;
}

const ANGLE_COLORS = [
  "border-blue-500 ring-blue-500",
  "border-green-500 ring-green-500",
  "border-amber-500 ring-amber-500",
  "border-purple-500 ring-purple-500",
  "border-rose-500 ring-rose-500",
  "border-cyan-500 ring-cyan-500",
];

const ANGLE_BG = [
  "bg-blue-500",
  "bg-green-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-rose-500",
  "bg-cyan-500",
];

const MultiCamView = ({
  videos,
  onAngleSelect,
  activeAngle,
  sceneIndex,
  onCutPlanReady,
}: MultiCamViewProps) => {
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [cutPoints, setCutPoints] = useState<CutPoint[]>([]);
  const [showCutPlan, setShowCutPlan] = useState(false);
  const [showKeyHints, setShowKeyHints] = useState(false);
  const animFrameRef = useRef<number>();
  const recordingStartRef = useRef<number>(0);

  const gridCols = videos.length <= 2 ? 2 : videos.length <= 4 ? 2 : 3;

  // Sync all videos to master (video[0])
  const syncPlayback = useCallback(() => {
    const master = videoRefs.current[0];
    if (!master) return;
    const t = master.currentTime;
    setCurrentTime(t);
    videoRefs.current.forEach((v, i) => {
      if (i > 0 && v && Math.abs(v.currentTime - t) > 0.25) v.currentTime = t;
    });
    if (!master.paused) animFrameRef.current = requestAnimationFrame(syncPlayback);
  }, []);

  useEffect(() => {
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, []);

  const togglePlay = useCallback(() => {
    const master = videoRefs.current[0];
    if (!master) return;
    if (isPlaying) {
      videoRefs.current.forEach(v => v?.pause());
      setIsPlaying(false);
    } else {
      videoRefs.current.forEach((v) => {
        if (v) { v.currentTime = master.currentTime; v.play(); }
      });
      setIsPlaying(true);
      animFrameRef.current = requestAnimationFrame(syncPlayback);
    }
  }, [isPlaying, syncPlayback]);

  const resetAll = useCallback(() => {
    videoRefs.current.forEach(v => { if (v) { v.pause(); v.currentTime = 0; } });
    setIsPlaying(false);
    setCurrentTime(0);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
  }, []);

  // Switch angle — record cut if in recording mode
  const switchAngle = useCallback((index: number) => {
    onAngleSelect(index);
    if (isRecording) {
      const t = videoRefs.current[0]?.currentTime ?? currentTime;
      setCutPoints(prev => [...prev, {
        timeSec: Math.round(t * 100) / 100,
        angleIndex: index,
        angleLabel: videos[index]?.angle ?? `זווית ${index + 1}`,
      }]);
    }
  }, [isRecording, currentTime, onAngleSelect, videos]);

  // Keyboard shortcuts: 1-6 = angles, Space = play/pause
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") { e.preventDefault(); togglePlay(); return; }
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= videos.length) switchAngle(num - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, switchAngle, videos.length]);

  const startRecording = () => {
    setCutPoints([{
      timeSec: 0,
      angleIndex: activeAngle,
      angleLabel: videos[activeAngle]?.angle ?? "זווית 1",
    }]);
    setIsRecording(true);
    recordingStartRef.current = currentTime;
    if (!isPlaying) togglePlay();
  };

  const stopRecording = () => {
    setIsRecording(false);
    videoRefs.current.forEach(v => v?.pause());
    setIsPlaying(false);
    setShowCutPlan(true);
    onCutPlanReady?.(cutPoints);
  };

  const applyCutPlan = () => {
    if (cutPoints.length > 0) {
      onAngleSelect(cutPoints[cutPoints.length - 1].angleIndex);
    }
    setShowCutPlan(false);
  };

  // Auto-generate AI cut plan
  const generateAICutPlan = useCallback(() => {
    if (videos.length === 0) return;
    const dur = duration || 30;
    const plan: CutPoint[] = [];
    const patterns = [
      { angle: 0, pct: 0, label: "פתיחה רחבה" },
      { angle: Math.min(1, videos.length - 1), pct: 0.18, label: "מדיום שוט" },
      { angle: Math.min(2, videos.length - 1), pct: 0.35, label: "תקריב רגש" },
      { angle: Math.min(1, videos.length - 1), pct: 0.52, label: "מדיום — המשך" },
      { angle: 0, pct: 0.68, label: "ריאקשן רחב" },
      { angle: Math.min(2, videos.length - 1), pct: 0.82, label: "תקריב — שיא" },
      { angle: 0, pct: 0.93, label: "סיום רחב" },
    ];
    patterns.forEach(p => {
      if (p.angle < videos.length) {
        plan.push({
          timeSec: Math.round(p.pct * dur * 100) / 100,
          angleIndex: p.angle,
          angleLabel: videos[p.angle]?.angle ?? `זווית ${p.angle + 1}`,
        });
      }
    });
    setCutPoints(plan);
    setShowCutPlan(true);
    onCutPlanReady?.(plan);
  }, [videos, duration, onCutPlanReady]);

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  if (videos.length <= 1) return null;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          🎥 Multi-Cam — סצנה {sceneIndex + 1}
          <span className="text-xs text-muted-foreground font-normal">({videos.length} זוויות)</span>
        </h3>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowKeyHints(h => !h)} className="h-7 w-7 p-0 text-muted-foreground">
            <Keyboard className="h-3.5 w-3.5" />
          </Button>
          {!isRecording ? (
            <Button variant="outline" size="sm" onClick={generateAICutPlan} className="gap-1.5 text-xs h-7">
              <Wand2 className="h-3 w-3" /> AI חיתוך
            </Button>
          ) : null}
          {!isRecording ? (
            <Button size="sm" onClick={startRecording} className="gap-1.5 text-xs h-7 bg-red-600 hover:bg-red-700">
              <Circle className="h-3 w-3 fill-current" /> הקלט עריכה
            </Button>
          ) : (
            <Button size="sm" onClick={stopRecording} className="gap-1.5 text-xs h-7 bg-red-600 hover:bg-red-700 animate-pulse">
              <Square className="h-3 w-3 fill-current" /> עצור הקלטה
            </Button>
          )}
        </div>
      </div>

      {/* Keyboard hints */}
      {showKeyHints && (
        <div className="px-4 py-2 bg-muted/30 border-b border-border flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>⌨️ קיצורים:</span>
          {videos.map((v, i) => (
            <span key={i} className="bg-muted px-1.5 py-0.5 rounded font-mono">{i + 1} = {v.angle}</span>
          ))}
          <span className="bg-muted px-1.5 py-0.5 rounded font-mono">רווח = נגן/עצור</span>
        </div>
      )}

      {/* Recording indicator */}
      {isRecording && (
        <div className="px-4 py-1.5 bg-red-500/10 border-b border-red-500/20 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs text-red-400 font-medium">מקליט עריכה — לחץ על זווית לחיתוך</span>
          <span className="text-xs text-red-300 mr-auto">{cutPoints.length} חיתוכים</span>
        </div>
      )}

      {/* Video Grid */}
      <div
        className="grid gap-1 p-1"
        style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}
      >
        {videos.map((video, i) => {
          const isActive = activeAngle === i;
          const colorClass = ANGLE_COLORS[i % ANGLE_COLORS.length];
          return (
            <div
              key={i}
              onClick={() => switchAngle(i)}
              className={`relative cursor-pointer rounded-lg overflow-hidden aspect-video transition-all duration-150
                ${isActive
                  ? `ring-2 ${colorClass} shadow-lg scale-[1.02] z-10`
                  : `ring-1 ring-border hover:ring-2 ${colorClass} hover:scale-[1.01]`
                }`}
            >
              <video
                ref={el => { videoRefs.current[i] = el; }}
                src={video.url}
                className="w-full h-full object-cover"
                preload="metadata"
                muted={true}
                playsInline
                onLoadedMetadata={(e) => {
                  if (i === 0) setDuration((e.target as HTMLVideoElement).duration || 0);
                }}
                onEnded={() => { if (i === 0) { setIsPlaying(false); if (isRecording) stopRecording(); } }}
              />

              {/* Angle badge */}
              <div className="absolute bottom-1 right-1 left-1 flex items-end justify-between">
                <span className={`text-[10px] ${ANGLE_BG[i % ANGLE_BG.length]} text-white px-1.5 py-0.5 rounded font-semibold`}>
                  {i + 1}
                </span>
                <span className="text-[10px] bg-background/80 backdrop-blur-sm text-foreground px-1.5 py-0.5 rounded truncate max-w-[70%]">
                  {video.angle}
                </span>
              </div>

              {/* Active overlay */}
              {isActive && (
                <div className={`absolute top-1 left-1 ${ANGLE_BG[i % ANGLE_BG.length]} text-white text-[10px] px-1.5 py-0.5 rounded font-bold`}>
                  LIVE
                </div>
              )}

              {/* Keyboard hint */}
              <div className="absolute top-1 right-1 bg-background/60 text-foreground text-[10px] w-4 h-4 rounded flex items-center justify-center font-mono opacity-60">
                {i + 1}
              </div>
            </div>
          );
        })}
      </div>

      {/* Playback controls */}
      <div className="px-4 py-2 border-t border-border flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={togglePlay} className="gap-1.5 h-7">
          {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {isPlaying ? "עצור" : "נגן הכל"}
        </Button>
        <Button variant="ghost" size="sm" onClick={resetAll} className="gap-1.5 h-7">
          <RotateCcw className="h-3.5 w-3.5" /> אפס
        </Button>

        {/* Progress bar */}
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden cursor-pointer"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            const t = pct * duration;
            videoRefs.current.forEach(v => { if (v) v.currentTime = t; });
            setCurrentTime(t);
          }}
        >
          <div
            className="h-full bg-primary rounded-full transition-none"
            style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
          />
        </div>

        <span className="text-xs text-muted-foreground tabular-nums">
          {fmtTime(currentTime)} / {fmtTime(duration)}
        </span>
      </div>

      {/* Cut plan timeline */}
      {cutPoints.length > 0 && (
        <div className="px-4 pb-3 border-t border-border pt-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-foreground">תוכנית חיתוכים ({cutPoints.length})</span>
            <div className="flex gap-2">
              <button onClick={() => { setCutPoints([]); setShowCutPlan(false); }} className="text-[10px] text-muted-foreground hover:text-foreground">נקה</button>
              {showCutPlan && (
                <button onClick={applyCutPlan} className="text-[10px] text-primary font-semibold flex items-center gap-0.5">
                  <Check className="h-3 w-3" /> החל
                </button>
              )}
            </div>
          </div>

          {/* Visual timeline */}
          <div className="relative h-6 bg-muted/40 rounded-lg overflow-hidden">
            {duration > 0 && cutPoints.map((cut, idx) => {
              const nextCut = cutPoints[idx + 1];
              const leftPct = (cut.timeSec / duration) * 100;
              const widthPct = nextCut
                ? ((nextCut.timeSec - cut.timeSec) / duration) * 100
                : 100 - leftPct;
              const bgClass = ANGLE_BG[cut.angleIndex % ANGLE_BG.length];
              return (
                <div
                  key={idx}
                  className={`absolute top-0 h-full ${bgClass} opacity-70 flex items-center justify-center`}
                  style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 0.5)}%` }}
                  title={`${cut.angleLabel} @ ${fmtTime(cut.timeSec)}`}
                >
                  <span className="text-[9px] text-white font-bold px-0.5 truncate">
                    {cut.angleIndex + 1}
                  </span>
                </div>
              );
            })}
            {/* Current time cursor */}
            {duration > 0 && (
              <div
                className="absolute top-0 w-0.5 h-full bg-white/80 z-10"
                style={{ left: `${(currentTime / duration) * 100}%` }}
              />
            )}
          </div>

          {/* Cut list */}
          <div className="flex flex-wrap gap-1 mt-1.5">
            {cutPoints.map((cut, idx) => (
              <div key={idx} className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${ANGLE_BG[cut.angleIndex % ANGLE_BG.length]} text-white`}>
                <span className="font-bold">{fmtTime(cut.timeSec)}</span>
                <span>→ {cut.angleLabel}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiCamView;
