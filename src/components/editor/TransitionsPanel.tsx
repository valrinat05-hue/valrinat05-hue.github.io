import { useState } from "react";
import { Layers, ChevronRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

export type TransitionType =
  | "cut"
  | "dissolve"
  | "fade_black"
  | "fade_white"
  | "crossfade"
  | "match_cut"
  | "jump_cut"
  | "wipe";

interface Transition {
  id: TransitionType;
  label: string;
  labelEn: string;
  emoji: string;
  description: string;
  mood: string;
  moodColor: string;
  bestFor: string;
}

const transitions: Transition[] = [
  {
    id: "cut",
    label: "חיתוך ישיר",
    labelEn: "Hard Cut",
    emoji: "✂️",
    description: "מעבר מיידי בין שני קליפים",
    mood: "מתח / אנרגיה",
    moodColor: "text-orange-400",
    bestFor: "דיאלוגים, אקשן, קצב מהיר",
  },
  {
    id: "dissolve",
    label: "המסה",
    labelEn: "Dissolve",
    emoji: "🌊",
    description: "מעבר הדרגתי שבו הקליפ הראשון נמס לשני",
    mood: "חלום / עומק",
    moodColor: "text-blue-400",
    bestFor: "פלאשבקים, מעבר זמן, רגשות עמוקים",
  },
  {
    id: "fade_black",
    label: "דהייה לשחור",
    labelEn: "Fade to Black",
    emoji: "⚫",
    description: "הסצנה נדהית לשחור לפני הסצנה הבאה",
    mood: "סיום / מעבר גדול",
    moodColor: "text-gray-400",
    bestFor: "סיום פרק, מעבר בין עלילות, דרמה",
  },
  {
    id: "fade_white",
    label: "דהייה ללבן",
    labelEn: "Fade to White",
    emoji: "⚪",
    description: "הסצנה נדהית ללבן — תחושת אור ותקווה",
    mood: "תקווה / זיכרון",
    moodColor: "text-yellow-200",
    bestFor: "זיכרונות חיוביים, סיומות אופטימיות",
  },
  {
    id: "crossfade",
    label: "קרוספייד",
    labelEn: "Cross Fade",
    emoji: "🔀",
    description: "שני קליפים נחפכים בו-זמנית — חלק מאוד",
    mood: "זרימה / רגש",
    moodColor: "text-purple-400",
    bestFor: "מוזיקה, רגעים אינטימיים, מעברים חלקים",
  },
  {
    id: "match_cut",
    label: "חיתוך תואם",
    labelEn: "Match Cut",
    emoji: "🔗",
    description: "חיתוך על פעולה או צורה תואמת בין שני קליפים",
    mood: "קישור / משמעות",
    moodColor: "text-green-400",
    bestFor: "2001 A Space Odyssey, קישור בין עידנים",
  },
  {
    id: "jump_cut",
    label: "חיתוך קפיצה",
    labelEn: "Jump Cut",
    emoji: "⚡",
    description: "קפיצה בתוך אותה סצנה — מכוון, לא טעות",
    mood: "זמן / לא נוח",
    moodColor: "text-red-400",
    bestFor: "Godard, YouTube vlogs, קצב אורבני",
  },
  {
    id: "wipe",
    label: "מחיקה",
    labelEn: "Wipe",
    emoji: "➡️",
    description: "הקליפ הבא מחליף את הקודם בתנועה",
    mood: "דינמי / כיפי",
    moodColor: "text-cyan-400",
    bestFor: "Star Wars, מעברים כיפיים, פרזנטציות",
  },
];

interface TransitionsPanelProps {
  /** Map from scene index to the transition that follows it */
  sceneTransitions: Record<number, TransitionType>;
  onTransitionChange: (sceneIndex: number, type: TransitionType) => void;
  sceneCount: number;
  activeScene: number;
}

const TransitionsPanel = ({
  sceneTransitions,
  onTransitionChange,
  sceneCount,
  activeScene,
}: TransitionsPanelProps) => {
  const [showInfo, setShowInfo] = useState<TransitionType | null>(null);

  const current = sceneTransitions[activeScene] ?? "cut";
  const currentDef = transitions.find((t) => t.id === current) ?? transitions[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">מעברים</span>
        <span className="text-xs text-muted-foreground mr-auto">אחרי סצנה {activeScene + 1}</span>
      </div>

      {/* Current selection badge */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
        <span className="text-lg">{currentDef.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground">{currentDef.label}</div>
          <div className={`text-xs ${currentDef.moodColor}`}>{currentDef.mood}</div>
        </div>
        <ChevronRight className="h-3 w-3 text-muted-foreground" />
      </div>

      {/* Grid of transitions */}
      <div className="grid grid-cols-2 gap-2">
        {transitions.map((t) => (
          <button
            key={t.id}
            onClick={() => onTransitionChange(activeScene, t.id)}
            onMouseEnter={() => setShowInfo(t.id)}
            onMouseLeave={() => setShowInfo(null)}
            className={`relative flex flex-col items-start gap-1 px-3 py-2 rounded-lg border text-left transition-all ${
              current === t.id
                ? "bg-primary/15 border-primary/50 shadow-sm"
                : "bg-card border-border hover:border-primary/30 hover:bg-muted/50"
            }`}
          >
            <div className="flex items-center gap-2 w-full">
              <span className="text-base">{t.emoji}</span>
              <span className="text-xs font-semibold text-foreground truncate">{t.label}</span>
              {current === t.id && (
                <span className="ml-auto text-[9px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full font-bold">
                  פעיל
                </span>
              )}
            </div>
            <span className={`text-[10px] ${t.moodColor}`}>{t.mood}</span>
          </button>
        ))}
      </div>

      {/* Info tooltip */}
      {showInfo && (() => {
        const t = transitions.find((x) => x.id === showInfo);
        if (!t) return null;
        return (
          <div className="px-3 py-2 rounded-lg bg-muted/60 border border-border text-xs space-y-1">
            <div className="font-semibold text-foreground flex items-center gap-1">
              <Info className="h-3 w-3" /> {t.label} ({t.labelEn})
            </div>
            <p className="text-muted-foreground">{t.description}</p>
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">הכי טוב ל: </span>
              {t.bestFor}
            </p>
          </div>
        );
      })()}

      {/* Apply to all scenes */}
      {sceneCount > 1 && (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={() => {
            for (let i = 0; i < sceneCount - 1; i++) {
              onTransitionChange(i, current);
            }
          }}
        >
          החל "{currentDef.label}" על כל הסצנות
        </Button>
      )}
    </div>
  );
};

export default TransitionsPanel;
