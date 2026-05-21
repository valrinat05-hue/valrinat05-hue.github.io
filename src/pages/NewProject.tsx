import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { db, LOCAL_USER } from "@/lib/localDb";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ChevronRight, Plus, Trash2 } from "lucide-react";

const typeLabels: Record<string, string> = {
  edited: "סרט ערוך",
  short: "סרט קצר",
  trailer: "טריילר",
  series: "סדרה",
};

interface EpisodeConfig {
  name: string;
  scenesCount: string;
}

const NewProject = () => {
  const [searchParams] = useSearchParams();
  const type = searchParams.get("type") || "edited";
  const navigate = useNavigate();
  const isSeries = type === "series";

  const [name, setName] = useState("");
  const [genre, setGenre] = useState("");
  const [duration, setDuration] = useState("");
  const [scenesCount, setScenesCount] = useState("");
  const [script, setScript] = useState("");
  const [loading, setLoading] = useState(false);
  const [episodes, setEpisodes] = useState<EpisodeConfig[]>([
    { name: "פרק 1", scenesCount: "5" },
  ]);

  const addEpisode = () => {
    setEpisodes(prev => [...prev, { name: `פרק ${prev.length + 1}`, scenesCount: "5" }]);
  };

  const removeEpisode = (index: number) => {
    if (episodes.length <= 1) return;
    setEpisodes(prev => prev.filter((_, i) => i !== index));
  };

  const updateEpisode = (index: number, field: keyof EpisodeConfig, value: string) => {
    setEpisodes(prev => prev.map((ep, i) => i === index ? { ...ep, [field]: value } : ep));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSeries) {
      const validEpisodes = episodes.every(ep => ep.name && parseInt(ep.scenesCount) > 0);
      if (!name || !validEpisodes) return;
    } else {
      const count = parseInt(scenesCount);
      if (!name || !count || count < 1) return;
    }

    setLoading(true);
    try {
      if (isSeries) {
        const totalScenes = episodes.reduce((sum, ep) => sum + (parseInt(ep.scenesCount) || 0), 0);

        const project = db.projects.insert({
          name,
          type: "series",
          genre: genre || null,
          duration_minutes: duration ? parseInt(duration) : null,
          scenes_count: totalScenes,
          script: JSON.stringify({
            episodes: episodes.map((ep, i) => ({
              episode_number: i + 1,
              name: ep.name,
              scenes_count: parseInt(ep.scenesCount) || 0,
            })),
          }),
          user_id: LOCAL_USER.id,
        });

        let sceneNum = 1;
        const scenesData: { project_id: string; scene_number: number }[] = [];
        for (const ep of episodes) {
          const count = parseInt(ep.scenesCount) || 0;
          for (let j = 0; j < count; j++) {
            scenesData.push({ project_id: project.id, scene_number: sceneNum++ });
          }
        }

        if (scenesData.length > 0) {
          db.scenes.insertMany(scenesData);
        }

        toast.success("הסדרה נוצרה בהצלחה!");
        navigate(`/editor/${project.id}`);
      } else {
        const count = parseInt(scenesCount);

        const project = db.projects.insert({
          name,
          type,
          genre: genre || null,
          duration_minutes: duration ? parseInt(duration) : null,
          scenes_count: count,
          script: script || null,
          user_id: LOCAL_USER.id,
        });

        const scenesData = Array.from({ length: count }, (_, i) => ({
          project_id: project.id,
          scene_number: i + 1,
        }));

        db.scenes.insertMany(scenesData);

        toast.success("הפרויקט נוצר בהצלחה!");
        navigate(`/editor/${project.id}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "שגיאה ביצירת הפרויקט";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const totalEpisodeScenes = episodes.reduce((sum, ep) => sum + (parseInt(ep.scenesCount) || 0), 0);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="px-6 py-4 border-b border-border flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1">
          <ChevronRight className="h-4 w-4" />
          חזרה
        </Button>
        <h1 className="text-lg font-bold text-foreground">
          פרויקט חדש — {typeLabels[type] || type}
        </h1>
      </div>
      <main id="main-content" className="flex-1 container max-w-xl py-12">
        <p className="text-muted-foreground mb-8 animate-fade-up stagger-1">מלא את פרטי הפרויקט</p>

        <form onSubmit={handleSubmit} className="space-y-5 animate-fade-up stagger-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">{isSeries ? "שם הסדרה" : "שם הפרויקט"}</Label>
              <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder={isSeries ? "שם הסדרה" : "שם הסרט"} autoComplete="off" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="genre">ז׳אנר</Label>
              <Input id="genre" value={genre} onChange={e => setGenre(e.target.value)} placeholder="דרמה, קומדיה..." autoComplete="off" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">{isSeries ? "משך פרק בדקות" : "משך בדקות"}</Label>
              <Input id="duration" type="number" min={1} inputMode="numeric" value={duration} onChange={e => setDuration(e.target.value)} placeholder={isSeries ? "45" : "90"} />
            </div>
            {!isSeries && (
              <div className="space-y-2">
                <Label htmlFor="scenes">מספר סצנות</Label>
                <Input id="scenes" type="number" min={1} inputMode="numeric" value={scenesCount} onChange={e => setScenesCount(e.target.value)} placeholder="12" required />
              </div>
            )}
          </div>

          {isSeries && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">פרקים</Label>
                <Button type="button" variant="outline" size="sm" onClick={addEpisode} className="gap-1">
                  <Plus className="h-3 w-3" />
                  הוסף פרק
                </Button>
              </div>
              <div className="space-y-2">
                {episodes.map((ep, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-secondary/20">
                    <span className="text-sm font-bold text-primary min-w-[24px]">{i + 1}</span>
                    <Input
                      value={ep.name}
                      onChange={e => updateEpisode(i, "name", e.target.value)}
                      placeholder={`פרק ${i + 1}`}
                      className="flex-1"
                      required
                    />
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={1}
                        inputMode="numeric"
                        value={ep.scenesCount}
                        onChange={e => updateEpisode(i, "scenesCount", e.target.value)}
                        placeholder="5"
                        className="w-20"
                        required
                      />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">סצנות</span>
                    </div>
                    {episodes.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeEpisode(i)} className="text-destructive hover:text-destructive h-8 w-8 p-0">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                סה״כ: {totalEpisodeScenes} סצנות ב-{episodes.length} פרקים
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="script">תסריט (טקסט חופשי)</Label>
            <Textarea
              id="script"
              value={script}
              onChange={e => setScript(e.target.value)}
              placeholder="הדבק כאן את התסריט..."
              className="min-h-[200px] resize-y"
            />
          </div>

          <div className="flex gap-3">
            <Button type="submit" className="flex-1" size="lg" disabled={loading} aria-busy={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              {isSeries ? "צור סדרה" : "המשך לסצנות"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => navigate("/")}
              className="gap-1"
            >
              סיום
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default NewProject;
