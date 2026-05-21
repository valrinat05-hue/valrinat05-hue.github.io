import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Palette, Sun, Contrast, Droplets, Thermometer,
  Scissors, FlipHorizontal, FlipVertical, RotateCcw,
  Maximize, Crop, SlidersHorizontal, ChevronLeft,
} from "lucide-react";

export interface ColorAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  temperature: number;
  exposure: number;
}

export const defaultAdjustments: ColorAdjustments = {
  brightness: 50,
  contrast: 50,
  saturation: 50,
  temperature: 50,
  exposure: 50,
};

const colorPresets: { name: string; adjustments: Partial<ColorAdjustments> }[] = [
  { name: "טבעי", adjustments: { brightness: 50, contrast: 50, saturation: 50, temperature: 50, exposure: 50 } },
  { name: "סינמטי", adjustments: { brightness: 40, contrast: 65, saturation: 35, temperature: 40, exposure: 45 } },
  { name: "וינטאג׳", adjustments: { brightness: 55, contrast: 45, saturation: 30, temperature: 65, exposure: 50 } },
  { name: "קר", adjustments: { brightness: 52, contrast: 50, saturation: 45, temperature: 30, exposure: 50 } },
  { name: "חם", adjustments: { brightness: 52, contrast: 48, saturation: 55, temperature: 70, exposure: 52 } },
  { name: "מונוכרום", adjustments: { brightness: 50, contrast: 60, saturation: 0, temperature: 50, exposure: 50 } },
];

const presetColors: Record<string, string[]> = {
  "טבעי": ["#e8d5b7", "#a67c52", "#4a6741", "#2d4a7a"],
  "סינמטי": ["#1a1a2e", "#16213e", "#0f3460", "#e94560"],
  "וינטאג׳": ["#d4a574", "#c4956a", "#8b7355", "#5c4a32"],
  "קר": ["#a8d8ea", "#aa96da", "#fcbad3", "#ffffd2"],
  "חם": ["#ff6b35", "#f7c59f", "#efefd0", "#004e89"],
  "מונוכרום": ["#ffffff", "#c0c0c0", "#808080", "#000000"],
};

const sliderControls = [
  { key: "brightness" as const, label: "בהירות", icon: Sun },
  { key: "contrast" as const, label: "ניגודיות", icon: Contrast },
  { key: "saturation" as const, label: "רוויה", icon: Droplets },
  { key: "temperature" as const, label: "טמפרטורה", icon: Thermometer },
  { key: "exposure" as const, label: "חשיפה", icon: SlidersHorizontal },
];

/** Convert our 0-100 adjustments to a CSS filter string */
export function adjustmentsToCssFilter(adj: ColorAdjustments): string {
  const brightness = adj.brightness / 50; // 0-2
  const contrast = adj.contrast / 50;
  const saturate = adj.saturation / 50;
  // temperature → hue-rotate: 50=0deg, 0=-30deg, 100=+30deg
  const hueRotate = ((adj.temperature - 50) / 50) * 30;
  // exposure as extra brightness multiplier
  const exposureMul = adj.exposure / 50;
  const totalBrightness = brightness * exposureMul;

  return `brightness(${totalBrightness.toFixed(2)}) contrast(${contrast.toFixed(2)}) saturate(${saturate.toFixed(2)}) hue-rotate(${hueRotate.toFixed(1)}deg)`;
}

interface ManualEditingPanelProps {
  activeScene: number;
  hasVideo: boolean;
  adjustments: ColorAdjustments;
  onAdjustmentsChange: (adj: ColorAdjustments) => void;
}

const ManualEditingPanel = ({ activeScene, hasVideo, adjustments, onAdjustmentsChange }: ManualEditingPanelProps) => {
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const updateAdjustment = useCallback((key: keyof ColorAdjustments, value: number[]) => {
    const next = { ...adjustments, [key]: value[0] };
    onAdjustmentsChange(next);
    setActivePreset(null);
  }, [adjustments, onAdjustmentsChange]);

  const applyPreset = useCallback((preset: typeof colorPresets[0]) => {
    const next = { ...defaultAdjustments, ...preset.adjustments };
    onAdjustmentsChange(next);
    setActivePreset(preset.name);
  }, [onAdjustmentsChange]);

  const resetAll = useCallback(() => {
    onAdjustmentsChange(defaultAdjustments);
    setActivePreset(null);
  }, [onAdjustmentsChange]);

  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center py-3 px-1 border-r border-border bg-card">
        <button
          onClick={() => setIsCollapsed(false)}
          className="flex flex-col items-center gap-1 text-muted-foreground hover:text-primary transition-colors p-2 rounded-lg hover:bg-primary/10"
          title="פתח עריכה ידנית"
        >
          <Palette className="h-4 w-4" />
          <span className="text-[9px] writing-mode-vertical" style={{ writingMode: "vertical-rl" }}>עריכה ידנית</span>
        </button>
      </div>
    );
  }

  return (
    <div className="w-[280px] flex flex-col border-r border-border bg-card">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-bold flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" />
          עריכה ידנית
          <span className="text-[10px] text-muted-foreground font-normal">— סצנה {activeScene + 1}</span>
        </h2>
        <button
          onClick={() => setIsCollapsed(true)}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-secondary"
          title="מזער"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-5">
          {/* Color Presets */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
              <Palette className="h-3 w-3" />
              פלטת צבעים
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              {colorPresets.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => applyPreset(preset)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all text-[11px] ${
                    activePreset === preset.name
                      ? "bg-primary/15 border border-primary/40 text-primary"
                      : "bg-secondary/60 border border-border hover:bg-secondary text-foreground"
                  }`}
                >
                  <div className="flex gap-0.5">
                    {(presetColors[preset.name] || []).map((c, i) => (
                      <div key={i} className="w-4 h-4 rounded-sm" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <span>{preset.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Adjustment Sliders */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
              <Sun className="h-3 w-3" />
              התאמות צבע
            </h3>
            <div className="space-y-4">
              {sliderControls.map(({ key, label, icon: Icon }) => (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-foreground flex items-center gap-1.5">
                      <Icon className="h-3 w-3 text-muted-foreground" />
                      {label}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">{adjustments[key]}</span>
                  </div>
                  <Slider
                    value={[adjustments[key]]}
                    onValueChange={(v) => updateAdjustment(key, v)}
                    min={0}
                    max={100}
                    step={1}
                    disabled={!hasVideo}
                    className="w-full"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Crop & Transform */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
              <Crop className="h-3 w-3" />
              חיתוך וטרנספורם
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { icon: Crop, label: "חיתוך" },
                { icon: Maximize, label: "מסגור" },
                { icon: FlipHorizontal, label: "היפוך אופקי" },
                { icon: FlipVertical, label: "היפוך אנכי" },
                { icon: RotateCcw, label: "סיבוב" },
                { icon: Scissors, label: "גזירה" },
              ].map(({ icon: Icon, label }) => (
                <button
                  key={label}
                  disabled={!hasVideo}
                  className="flex items-center gap-1.5 text-[11px] px-2.5 py-2 rounded-lg bg-secondary/60 border border-border text-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Reset */}
          <Button variant="outline" size="sm" onClick={resetAll} className="w-full text-xs gap-1.5">
            <RotateCcw className="h-3 w-3" />
            אפס הכל
          </Button>
        </div>
      </ScrollArea>
    </div>
  );
};

export default ManualEditingPanel;
