import { useMemo, useState } from "react";
import { TrendingUp, Zap } from "lucide-react";

export interface SceneArcData {
  sceneIndex: number;
  emotionalIntensity: number; // 0–100
  label?: string;
  mood?: string;
  act?: 1 | 2 | 3;
}

interface StoryArcPanelProps {
  scenes: SceneArcData[];
  activeScene: number;
  onSceneClick: (index: number) => void;
  totalScenes: number;
}

const ACT_COLORS = {
  1: { bg: "bg-blue-500/20", border: "border-blue-500/30", text: "text-blue-400", label: "מערכה א׳" },
  2: { bg: "bg-primary/20", border: "border-primary/30", text: "text-primary", label: "מערכה ב׳" },
  3: { bg: "bg-green-500/20", border: "border-green-500/30", text: "text-green-400", label: "מערכה ג׳" },
};

// Generate default arc if no AI data
function defaultArc(totalScenes: number): SceneArcData[] {
  return Array.from({ length: totalScenes }, (_, i) => {
    const pct = i / Math.max(totalScenes - 1, 1);
    let intensity: number;
    let act: 1 | 2 | 3;
    let mood: string;

    if (pct < 0.25) {
      // Act 1: slow build
      intensity = 20 + pct * 4 * 30;
      act = 1;
      mood = "הצגה";
    } else if (pct < 0.75) {
      // Act 2: rising with ups and downs
      const p2 = (pct - 0.25) / 0.5;
      intensity = 50 + Math.sin(p2 * Math.PI * 2) * 20 + p2 * 15;
      act = 2;
      mood = "עלייה";
    } else {
      // Act 3: climax then resolution
      const p3 = (pct - 0.75) / 0.25;
      intensity = p3 < 0.6 ? 80 + p3 * 20 : 100 - (p3 - 0.6) * 2.5 * 60;
      act = 3;
      mood = pct > 0.9 ? "פתרון" : "שיא";
    }

    return {
      sceneIndex: i,
      emotionalIntensity: Math.round(Math.max(10, Math.min(100, intensity))),
      act,
      mood,
    };
  });
}

const StoryArcPanel = ({ scenes, activeScene, onSceneClick, totalScenes }: StoryArcPanelProps) => {
  const [hoveredScene, setHoveredScene] = useState<number | null>(null);

  const arcData = useMemo(() => {
    if (scenes.length >= totalScenes) return scenes;
    const base = defaultArc(totalScenes);
    return base.map((d, i) => scenes[i] ? { ...d, ...scenes[i] } : d);
  }, [scenes, totalScenes]);

  const svgW = 320;
  const svgH = 100;
  const padX = 12;
  const padY = 10;

  const points = arcData.map((d, i) => {
    const x = padX + (i / Math.max(arcData.length - 1, 1)) * (svgW - padX * 2);
    const y = padY + (1 - d.emotionalIntensity / 100) * (svgH - padY * 2);
    return { x, y, data: d };
  });

  // Build SVG path
  const pathD = points.length > 1
    ? points.reduce((acc, p, i) => {
        if (i === 0) return `M ${p.x} ${p.y}`;
        const prev = points[i - 1];
        const cpX = (prev.x + p.x) / 2;
        return `${acc} C ${cpX} ${prev.y} ${cpX} ${p.y} ${p.x} ${p.y}`;
      }, "")
    : "";

  // Area under curve
  const areaD = pathD
    ? `${pathD} L ${points[points.length - 1].x} ${svgH - padY} L ${points[0].x} ${svgH - padY} Z`
    : "";

  const act1End = Math.floor(totalScenes * 0.25);
  const act2End = Math.floor(totalScenes * 0.75);

  const displayScene = hoveredScene ?? activeScene;
  const displayData = arcData[displayScene];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">עקומת הסיפור</span>
      </div>

      {/* SVG Arc */}
      <div className="relative bg-muted/20 rounded-xl border border-border overflow-hidden">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ height: 100 }}>
          {/* Act zones */}
          <rect x={padX} y={0} width={(act1End / totalScenes) * (svgW - padX * 2)} height={svgH} fill="rgba(59,130,246,0.05)" />
          <rect x={padX + (act1End / totalScenes) * (svgW - padX * 2)} y={0}
            width={((act2End - act1End) / totalScenes) * (svgW - padX * 2)} height={svgH} fill="rgba(124,58,237,0.05)" />
          <rect x={padX + (act2End / totalScenes) * (svgW - padX * 2)} y={0}
            width={((totalScenes - act2End) / totalScenes) * (svgW - padX * 2)} height={svgH} fill="rgba(34,197,94,0.05)" />

          {/* Horizontal grid lines */}
          {[25, 50, 75].map(pct => (
            <line key={pct}
              x1={padX} y1={padY + (1 - pct / 100) * (svgH - padY * 2)}
              x2={svgW - padX} y2={padY + (1 - pct / 100) * (svgH - padY * 2)}
              stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="3,4"
            />
          ))}

          {/* Area fill */}
          {areaD && (
            <path d={areaD} fill="url(#arcGrad)" opacity="0.3" />
          )}
          <defs>
            <linearGradient id="arcGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(124,58,237)" />
              <stop offset="100%" stopColor="rgb(124,58,237)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Curve */}
          {pathD && (
            <path d={pathD} fill="none" stroke="rgb(124,58,237)" strokeWidth="2" strokeLinecap="round" />
          )}

          {/* Scene dots */}
          {points.map((p, i) => {
            const isActive = i === activeScene;
            const isHovered = i === hoveredScene;
            return (
              <circle
                key={i}
                cx={p.x} cy={p.y}
                r={isActive || isHovered ? 5 : 3}
                fill={isActive ? "rgb(124,58,237)" : isHovered ? "rgb(167,139,250)" : "rgba(124,58,237,0.5)"}
                stroke={isActive ? "white" : "transparent"}
                strokeWidth="1.5"
                className="cursor-pointer transition-all"
                onClick={() => onSceneClick(i)}
                onMouseEnter={() => setHoveredScene(i)}
                onMouseLeave={() => setHoveredScene(null)}
              />
            );
          })}
        </svg>

        {/* Act labels */}
        <div className="absolute bottom-1 left-0 right-0 flex text-[9px] font-medium px-3">
          <span className="text-blue-400" style={{ width: `${(act1End / totalScenes) * 100}%` }}>מערכה א׳</span>
          <span className="text-purple-400 text-center" style={{ width: `${((act2End - act1End) / totalScenes) * 100}%` }}>מערכה ב׳</span>
          <span className="text-green-400 text-right flex-1">מערכה ג׳</span>
        </div>
      </div>

      {/* Scene info */}
      {displayData && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/30 border border-border">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
            ${displayData.emotionalIntensity >= 75 ? "bg-red-500/20 text-red-400" :
              displayData.emotionalIntensity >= 50 ? "bg-primary/20 text-primary" :
              "bg-blue-500/20 text-blue-400"}`}>
            {displayData.emotionalIntensity}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-foreground">
              סצנה {displayData.sceneIndex + 1}
              {displayData.act && (
                <span className={`mr-2 text-[10px] ${ACT_COLORS[displayData.act].text}`}>
                  {ACT_COLORS[displayData.act].label}
                </span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground">{displayData.mood ?? "—"}</div>
          </div>
          {displayData.emotionalIntensity >= 85 && (
            <Zap className="h-3.5 w-3.5 text-yellow-400" />
          )}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {([1, 2, 3] as const).map(act => {
          const actScenes = arcData.filter(d => d.act === act);
          const avgIntensity = actScenes.length
            ? Math.round(actScenes.reduce((s, d) => s + d.emotionalIntensity, 0) / actScenes.length)
            : 0;
          const c = ACT_COLORS[act];
          return (
            <div key={act} className={`rounded-lg px-2 py-1.5 border ${c.bg} ${c.border}`}>
              <div className={`text-[10px] font-semibold ${c.text}`}>{c.label}</div>
              <div className="text-xs font-bold text-foreground">{actScenes.length} סצנות</div>
              <div className="text-[9px] text-muted-foreground">עצימות {avgIntensity}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StoryArcPanel;
