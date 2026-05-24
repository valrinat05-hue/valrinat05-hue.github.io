import { useMemo } from "react";
import { Activity, Clock, TrendingUp } from "lucide-react";

interface SceneClip {
  sceneIndex: number;
  durationSec: number;
  label?: string;
}

interface PacingPanelProps {
  clips: SceneClip[];
  activeScene: number;
  onSceneClick: (index: number) => void;
}

type PaceCategory = "very-short" | "short" | "medium" | "long" | "very-long";

interface PaceInfo {
  category: PaceCategory;
  label: string;
  emotion: string;
  color: string;
  bgColor: string;
  borderColor: string;
  minSec: number;
  maxSec: number;
}

const PACE_TIERS: PaceInfo[] = [
  {
    category: "very-short",
    label: "מהיר מאוד",
    emotion: "אדרנלין / מתח קיצוני",
    color: "text-red-400",
    bgColor: "bg-red-500",
    borderColor: "border-red-500/50",
    minSec: 0,
    maxSec: 2,
  },
  {
    category: "short",
    label: "מהיר",
    emotion: "אנרגיה / ריגוש",
    color: "text-orange-400",
    bgColor: "bg-orange-500",
    borderColor: "border-orange-500/50",
    minSec: 2,
    maxSec: 5,
  },
  {
    category: "medium",
    label: "בינוני",
    emotion: "זרימה טבעית",
    color: "text-green-400",
    bgColor: "bg-green-500",
    borderColor: "border-green-500/50",
    minSec: 5,
    maxSec: 12,
  },
  {
    category: "long",
    label: "איטי",
    emotion: "עומק / דרמה",
    color: "text-blue-400",
    bgColor: "bg-blue-500",
    borderColor: "border-blue-500/50",
    minSec: 12,
    maxSec: 25,
  },
  {
    category: "very-long",
    label: "איטי מאוד",
    emotion: "חינון / קולנועי",
    color: "text-purple-400",
    bgColor: "bg-purple-500",
    borderColor: "border-purple-500/50",
    minSec: 25,
    maxSec: Infinity,
  },
];

function getPaceInfo(durationSec: number): PaceInfo {
  return PACE_TIERS.find((t) => durationSec >= t.minSec && durationSec < t.maxSec) ?? PACE_TIERS[2];
}

function fmtSec(s: number): string {
  if (s < 60) return `${Math.round(s)}ש'`;
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

const PacingPanel = ({ clips, activeScene, onSceneClick }: PacingPanelProps) => {
  const stats = useMemo(() => {
    if (clips.length === 0) return null;
    const durations = clips.map((c) => c.durationSec).filter((d) => d > 0);
    if (durations.length === 0) return null;
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const total = durations.reduce((a, b) => a + b, 0);
    const counts: Record<PaceCategory, number> = {
      "very-short": 0,
      short: 0,
      medium: 0,
      long: 0,
      "very-long": 0,
    };
    durations.forEach((d) => counts[getPaceInfo(d).category]++);
    const dominant = (Object.keys(counts) as PaceCategory[]).reduce((a, b) =>
      counts[a] >= counts[b] ? a : b
    );
    return { avg, total, counts, dominant };
  }, [clips]);

  const maxDur = useMemo(
    () => Math.max(...clips.map((c) => c.durationSec), 1),
    [clips]
  );

  if (clips.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">ניתוח קצב</span>
        </div>
        <p className="text-xs text-muted-foreground text-center py-4">
          טען קליפים כדי לראות את הקצב
        </p>
      </div>
    );
  }

  const dominantInfo = stats ? PACE_TIERS.find((t) => t.category === stats.dominant) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">ניתוח קצב</span>
      </div>

      {/* Overall stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-muted/40 rounded-lg px-2 py-2">
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Clock className="h-3 w-3" /> סה"כ
            </div>
            <div className="text-sm font-bold text-foreground mt-0.5">{fmtSec(stats.total)}</div>
          </div>
          <div className="bg-muted/40 rounded-lg px-2 py-2">
            <div className="text-xs text-muted-foreground">ממוצע</div>
            <div className="text-sm font-bold text-foreground mt-0.5">{fmtSec(stats.avg)}</div>
          </div>
          <div className="bg-muted/40 rounded-lg px-2 py-2">
            <div className="text-xs text-muted-foreground">קצב שולט</div>
            <div className={`text-xs font-bold mt-0.5 ${dominantInfo?.color ?? ""}`}>
              {dominantInfo?.label ?? "—"}
            </div>
          </div>
        </div>
      )}

      {/* Mood summary */}
      {dominantInfo && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${dominantInfo.borderColor} bg-muted/20`}>
          <TrendingUp className={`h-4 w-4 ${dominantInfo.color}`} />
          <div>
            <div className="text-xs font-semibold text-foreground">
              הסרט מרגיש: {dominantInfo.emotion}
            </div>
            <div className="text-[10px] text-muted-foreground">
              לפי קצב ממוצע של {fmtSec(stats?.avg ?? 0)} לסצנה
            </div>
          </div>
        </div>
      )}

      {/* Timeline bars */}
      <div className="space-y-1">
        <div className="text-[10px] text-muted-foreground mb-2">לחץ על סצנה לעריכה</div>
        {clips.map((clip, i) => {
          const paceInfo = getPaceInfo(clip.durationSec);
          const widthPct = Math.max(8, (clip.durationSec / maxDur) * 100);
          const isActive = i === activeScene;
          return (
            <button
              key={i}
              onClick={() => onSceneClick(i)}
              className={`w-full flex items-center gap-2 group rounded transition-all ${
                isActive ? "ring-1 ring-primary/60" : ""
              }`}
            >
              <span className="text-[10px] text-muted-foreground w-4 shrink-0 text-right">
                {i + 1}
              </span>
              <div className="flex-1 h-4 bg-muted/30 rounded overflow-hidden">
                <div
                  className={`h-full rounded transition-all ${paceInfo.bgColor} ${
                    isActive ? "opacity-100" : "opacity-60 group-hover:opacity-80"
                  }`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground w-10 shrink-0">
                {clip.durationSec > 0 ? fmtSec(clip.durationSec) : "—"}
              </span>
              <span className={`text-[9px] w-14 shrink-0 text-right ${paceInfo.color}`}>
                {paceInfo.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 border-t border-border">
        {PACE_TIERS.map((t) => (
          <div key={t.category} className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${t.bgColor} opacity-70`} />
            <span className="text-[9px] text-muted-foreground">{t.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PacingPanel;
