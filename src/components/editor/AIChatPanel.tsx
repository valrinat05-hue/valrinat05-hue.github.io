import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send, RefreshCw, Scissors, Wand2, Layers, Volume2,
  Camera, Sparkles, Check, X, ChevronRight, Film, Heart, Zap,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

interface ChatMessage {
  role: "user" | "ai";
  content: string;
  actions?: AIAction[];
}

interface AIAction {
  label: string;
  description?: string;
  type: "apply" | "reject" | "info";
  onAction?: () => void;
}

const directorModes = [
  {
    label: "מצב דרמטי",
    icon: Film,
    prompt: "החל סגנון דרמטי מלא: צבע סינמטי כהה עם ניגודיות גבוהה ורוויה מופחתת, הדק קצב באגרסיביות והסר זמן מת, הוסף מעברי dissolve בין סצנות, האט מעט את הסצנה הדרמטית ביותר, ומיקס אודיו דרמטי.",
    accent: "amber",
  },
  {
    label: "מצב רגשי",
    icon: Heart,
    prompt: "החל סגנון רגשי מלא: צבע חמים ורך, קצב נושם עם פאוזות אותנטיות, מעברי crossfade רכים בין סצנות, האטה עדינה ברגעים אינטימיים, ומיקס אודיו שמדגיש דיאלוג ופסקול עדין.",
    accent: "rose",
  },
  {
    label: "מצב TikTok",
    icon: Zap,
    prompt: "החל סגנון TikTok מהיר ואנרגטי: צבעים חיים וזוהרים עם ניגודיות גבוהה, חיתוכים אגרסיביים והסרת כל זמן מת, hard cuts בלבד בין סצנות, האץ סצנות ארוכות, ופסקול חזק.",
    accent: "cyan",
  },
];

const quickActions = [
  { label: "סנכרן זוויות", icon: RefreshCw },
  { label: "חיתוך אוטומטי", icon: Scissors },
  { label: "הסר חלקים משעממים", icon: Scissors },
  { label: "שיפור צבע", icon: Wand2 },
  { label: "נרמול שמע", icon: Volume2 },
];

interface AIChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (msg: string) => void;
  onQuickAction: (label: string) => void;
  activeScene?: number;
  stage: string;
  videoCount?: number;
  onApplyAICut?: () => void;
}

const AIChatPanel = ({ messages, onSendMessage, onQuickAction, stage, activeScene, videoCount, onApplyAICut }: AIChatPanelProps) => {
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    if (!chatInput.trim()) return;
    onSendMessage(chatInput);
    setChatInput("");
  };

  const stageLabel = (() => {
    switch (stage) {
      case "editing": return "— עריכת סצנה";
      case "merged": return "— חידוד הסרט";
      case "soundtrack": return "— פסקול";
      case "sound-sync": return "— סאונד";
      case "subtitles": return "— כתוביות";
      case "done": return "— סרט מוכן";
      case "options": return "— אופציות";
      case "ai-directing": return "— תכנון AI";
      case "scene-list": return "— סצנות";
      default: return "";
    }
  })();

  return (
    <div className="w-[360px] flex flex-col border-l border-border bg-card">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-gradient-to-l from-primary/5 to-transparent">
        <h2 className="text-sm font-bold flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-primary/15 flex items-center justify-center">
            <Wand2 className="h-3.5 w-3.5 text-primary" />
          </div>
          AI Director
          <span className="text-[10px] text-muted-foreground font-normal">{stageLabel}</span>
        </h2>
        {stage === "editing" && activeScene !== undefined && (
          <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
            <Camera className="h-3 w-3" />
            סצנה {(activeScene ?? 0) + 1} · {videoCount || 0} זוויות מזוהות
          </p>
        )}
      </div>

      {/* Scene-specific AI Director actions */}
      {stage === "editing" && videoCount && videoCount > 1 && (
        <div className="px-3 py-2.5 border-b border-border bg-primary/5 space-y-2">
          <p className="text-[11px] font-semibold text-primary flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" />
            המלצות AI Director
          </p>
          <div className="space-y-1.5">
            <button
              onClick={onApplyAICut}
              className="w-full flex items-center gap-2 text-right text-[11px] px-3 py-2 rounded-lg bg-card border border-primary/20 hover:border-primary/50 hover:bg-primary/5 transition-all group"
            >
              <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20">
                <Scissors className="h-3 w-3 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-medium text-foreground">החל חיתוך אוטומטי</span>
                <p className="text-[10px] text-muted-foreground">AI יבחר את הזוויות הטובות ויחתוך</p>
              </div>
              <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            </button>
            <button
              onClick={() => onQuickAction("סנכרן זוויות")}
              className="w-full flex items-center gap-2 text-right text-[11px] px-3 py-2 rounded-lg bg-card border border-border hover:border-primary/30 hover:bg-primary/5 transition-all group"
            >
              <div className="h-6 w-6 rounded-md bg-secondary flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10">
                <RefreshCw className="h-3 w-3 text-muted-foreground group-hover:text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-medium text-foreground">סנכרן זוויות</span>
                <p className="text-[10px] text-muted-foreground">התאם את כל הזוויות לאותו ציר זמן</p>
              </div>
              <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            </button>
          </div>
        </div>
      )}

      {/* Director preset modes */}
      {(stage === "editing" || stage === "merged" || stage === "done") && (
        <div className="px-3 py-2.5 border-b border-border bg-gradient-to-l from-primary/5 to-transparent space-y-2">
          <p className="text-[11px] font-semibold text-primary flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" />
            מצבי במאי — combo עריכה אוטומטי
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {directorModes.map((mode) => (
              <button
                key={mode.label}
                onClick={() => onSendMessage(mode.prompt)}
                className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg bg-card border border-border hover:border-primary/50 hover:bg-primary/5 transition-all active:scale-95 group"
              >
                <mode.icon className="h-4 w-4 text-primary group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-medium text-foreground text-center leading-tight">{mode.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions bar */}
      {(stage === "editing" || stage === "merged" || stage === "done") && (
        <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-border">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => onQuickAction(action.label)}
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-full bg-secondary text-secondary-foreground hover:bg-primary/15 hover:text-primary transition-colors active:scale-95"
            >
              <action.icon className="h-3 w-3" />
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Chat messages */}
      <ScrollArea className="flex-1 px-3 py-3">
        <div className="space-y-3">
          {messages.map((msg, i) => (
            <div key={i}>
              <div className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[90%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-secondary text-secondary-foreground rounded-bl-sm"
                  }`}
                >
                  {msg.role === "ai" ? (
                    <div className="prose prose-sm prose-invert max-w-none [&_p]:m-0 [&_ul]:m-0 [&_li]:m-0">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>

              {/* Action buttons from AI message */}
              {msg.actions && msg.actions.length > 0 && (
                <div className="flex gap-1.5 mt-1.5 justify-end">
                  {msg.actions.map((action, ai) => (
                    <button
                      key={ai}
                      onClick={action.onAction}
                      className={`flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg transition-colors ${
                        action.type === "apply"
                          ? "bg-primary/15 text-primary hover:bg-primary/25 border border-primary/20"
                          : action.type === "reject"
                            ? "bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20"
                            : "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border"
                      }`}
                    >
                      {action.type === "apply" && <Check className="h-3 w-3" />}
                      {action.type === "reject" && <X className="h-3 w-3" />}
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      </ScrollArea>

      {/* Chat input */}
      <div className="p-3 border-t border-border">
        <form
          onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
          className="flex gap-2"
        >
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="בקש מה-AI Director..."
            className="flex-1 bg-secondary rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <Button type="submit" size="icon" variant="default" disabled={!chatInput.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
};

export default AIChatPanel;
