import { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Wand2, Play, Pause, RotateCcw } from "lucide-react";

interface SceneVideo {
  id?: string;
  url: string;
  angle: string;
  file?: File;
}

interface AIRecommendation {
  angleIndex: number;
  startSec: number;
  endSec: number;
  reason: string;
}

interface MultiCamViewProps {
  videos: SceneVideo[];
  onAngleSelect: (index: number) => void;
  activeAngle: number;
  sceneIndex: number;
}

// Simple AI Director logic — selects best angle per time segment
const generateRecommendations = (videos: SceneVideo[]): AIRecommendation[] => {
  if (videos.length === 0) return [];
  const recs: AIRecommendation[] = [];
  const segmentLength = 5; // seconds per segment
  const totalSegments = 6; // analyze 30 seconds

  const patterns = [
    { angle: 0, reason: "פתיחה רחבה — מציגה את הסצנה" },
    { angle: Math.min(1, videos.length - 1), reason: "מעבר למדיום — מתמקד בפעולה" },
    { angle: Math.min(2, videos.length - 1), reason: "תקריב — לכידת רגש" },
    { angle: Math.min(1, videos.length - 1), reason: "חזרה למדיום — המשך פעולה" },
    { angle: Math.min(2, videos.length - 1), reason: "תקריב — רגע מפתח" },
    { angle: 0, reason: "סיום רחב — סוגר את הסצנה" },
  ];

  for (let i = 0; i < totalSegments; i++) {
    const pattern = patterns[i % patterns.length];
    recs.push({
      angleIndex: pattern.angle,
      startSec: i * segmentLength,
      endSec: (i + 1) * segmentLength,
      reason: pattern.reason,
    });
  }

  return recs;
};

const MultiCamView = ({ videos, onAngleSelect, activeAngle, sceneIndex }: MultiCamViewProps) => {
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const animFrameRef = useRef<number>();

  const gridCols = videos.length <= 1 ? 1 : videos.length <= 4 ? 2 : 3;

  useEffect(() => {
    setRecommendations(generateRecommendations(videos));
  }, [videos]);

  const syncPlayback = useCallback(() => {
    const master = videoRefs.current[0];
    if (!master) return;
    setCurrentTime(master.currentTime);

    // Sync all videos to master time
    videoRefs.current.forEach((v, i) => {
      if (i > 0 && v && Math.abs(v.currentTime - master.currentTime) > 0.3) {
        v.currentTime = master.currentTime;
      }
    });

    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(syncPlayback);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(syncPlayback);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, syncPlayback]);

  const togglePlay = () => {
    if (isPlaying) {
      videoRefs.current.forEach(v => v?.pause());
      setIsPlaying(false);
    } else {
      videoRefs.current.forEach(v => v?.play());
      setIsPlaying(true);
    }
  };

  const resetAll = () => {
    videoRefs.current.forEach(v => {
      if (v) {
        v.currentTime = 0;
        v.pause();
      }
    });
    setIsPlaying(false);
    setCurrentTime(0);
  };

  // Find the AI-recommended angle for the current time
  const currentRec = recommendations.find(
    r => currentTime >= r.startSec && currentTime < r.endSec
  );

  if (videos.length <= 1) return null;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          🎥 Multi-Cam — סצנה {sceneIndex + 1}
          <span className="text-xs text-muted-foreground font-normal">({videos.length} זוויות)</span>
        </h3>
        <div className="flex items-center gap-2">
          <Button
            variant={showAI ? "default" : "outline"}
            size="sm"
            onClick={() => setShowAI(!showAI)}
            className="gap-1.5 text-xs h-7"
          >
            <Wand2 className="h-3 w-3" />
            {showAI ? "AI פעיל" : "הפעל AI"}
          </Button>
        </div>
      </div>

      {/* Video Grid */}
      <div className={`grid gap-1 p-1`} style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}>
        {videos.map((video, i) => {
          const isAIRecommended = showAI && currentRec?.angleIndex === i;
          const isActive = activeAngle === i;

          return (
            <div
              key={i}
              onClick={() => onAngleSelect(i)}
              className={`relative cursor-pointer rounded-lg overflow-hidden aspect-video transition-all duration-300 ${
                isAIRecommended
                  ? "ring-2 ring-primary shadow-lg shadow-primary/20 scale-[1.02] z-10"
                  : isActive
                    ? "ring-2 ring-accent"
                    : "ring-1 ring-border hover:ring-primary/40"
              }`}
            >
              <video
                ref={el => { videoRefs.current[i] = el; }}
                src={video.url}
                className="w-full h-full object-cover"
                preload="metadata"
                muted={i > 0}
                playsInline
                onEnded={() => setIsPlaying(false)}
              />

              {/* Angle label */}
              <div className="absolute bottom-1 right-1 flex gap-1">
                <span className="text-[10px] bg-background/80 backdrop-blur-sm text-foreground px-1.5 py-0.5 rounded">
                  {video.angle}
                </span>
              </div>

              {/* AI Highlight */}
              {isAIRecommended && (
                <div className="absolute top-1 left-1 right-1">
                  <div className="flex items-center gap-1 bg-primary/90 backdrop-blur-sm text-primary-foreground px-2 py-1 rounded-md">
                    <Wand2 className="h-3 w-3 flex-shrink-0" />
                    <span className="text-[10px] font-medium truncate">{currentRec.reason}</span>
                  </div>
                </div>
              )}

              {/* Active marker */}
              {isActive && !isAIRecommended && (
                <div className="absolute top-1 left-1">
                  <span className="text-[10px] bg-accent/90 text-accent-foreground px-1.5 py-0.5 rounded">
                    נבחר
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Controls */}
      <div className="px-4 py-2 border-t border-border flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={togglePlay} className="gap-1.5 h-7">
          {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {isPlaying ? "עצור" : "נגן הכל"}
        </Button>
        <Button variant="ghost" size="sm" onClick={resetAll} className="gap-1.5 h-7">
          <RotateCcw className="h-3.5 w-3.5" />
          אפס
        </Button>

        <div className="flex-1" />

        {showAI && currentRec && (
          <div className="text-xs text-muted-foreground">
            ⏱ {Math.floor(currentTime)}s — AI ממליץ: <span className="text-primary font-medium">{videos[currentRec.angleIndex]?.angle}</span>
          </div>
        )}
      </div>

      {/* AI Timeline visualization */}
      {showAI && recommendations.length > 0 && (
        <div className="px-4 pb-3">
          <div className="flex gap-0.5 h-6 rounded-md overflow-hidden">
            {recommendations.map((rec, i) => {
              const isCurrent = currentTime >= rec.startSec && currentTime < rec.endSec;
              const colors = [
                "bg-blue-500/60", "bg-green-500/60", "bg-amber-500/60",
                "bg-purple-500/60", "bg-rose-500/60", "bg-cyan-500/60",
              ];
              return (
                <div
                  key={i}
                  className={`flex-1 flex items-center justify-center text-[9px] font-medium transition-all ${
                    colors[rec.angleIndex % colors.length]
                  } ${isCurrent ? "ring-2 ring-primary scale-y-110" : "opacity-70"}`}
                  title={rec.reason}
                >
                  {videos[rec.angleIndex]?.angle?.replace("זווית ", "")}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
            <span>0s</span>
            <span>30s</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiCamView;
