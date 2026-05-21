import { Film, Zap, Heart } from "lucide-react";

export type EditingStyle = "cinematic" | "tiktok" | "emotional";

interface Props {
  selected: EditingStyle;
  onChange: (style: EditingStyle) => void;
}

const styles: { id: EditingStyle; label: string; desc: string; icon: typeof Film }[] = [
  { id: "cinematic", label: "קולנועי", desc: "שוטים ארוכים, מעברים חלקים, דרמה", icon: Film },
  { id: "tiktok", label: "TikTok מהיר", desc: "חיתוכים מהירים, אנרגיה גבוהה", icon: Zap },
  { id: "emotional", label: "סיפור רגשי", desc: "בניית עלילה, רגעים אינטימיים", icon: Heart },
];

const EditingStylePicker = ({ selected, onChange }: Props) => (
  <div className="flex gap-3">
    {styles.map(({ id, label, desc, icon: Icon }) => (
      <button
        key={id}
        onClick={() => onChange(id)}
        className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center ${
          selected === id
            ? "bg-primary/10 border-primary/50 shadow-md"
            : "bg-card border-border hover:border-primary/30"
        }`}
      >
        <Icon className={`h-7 w-7 ${selected === id ? "text-primary" : "text-muted-foreground"}`} />
        <span className={`font-semibold text-sm ${selected === id ? "text-primary" : "text-foreground"}`}>{label}</span>
        <span className="text-[11px] text-muted-foreground">{desc}</span>
      </button>
    ))}
  </div>
);

export default EditingStylePicker;
