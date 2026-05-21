import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "@/lib/localDb";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Film, Trash2, Pencil, Wand2, Loader2,
  ChevronRight, Calendar, Clock, FolderOpen,
} from "lucide-react";

const typeLabels: Record<string, string> = {
  edited: "סרט ערוך",
  short: "סרט קצר",
  trailer: "טריילר",
  series: "סדרה",
};

const MyProjects = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState(db.projects.getAll());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadProjects = useCallback(() => {
    setProjects(db.projects.getAll().sort((a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    ));
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const scenes = db.scenes.getByProject(deleteId);
      const sceneIds = scenes.map(s => s.id);
      db.sceneVideos.deleteByProject(deleteId, sceneIds);
      db.scenes.deleteByProject(deleteId);
      db.projects.delete(deleteId);
      toast.success("הפרויקט נמחק בהצלחה");
      loadProjects();
    } catch {
      toast.error("שגיאה במחיקת הפרויקט");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("he-IL", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <div className="px-6 py-4 border-b border-border flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1">
          <ChevronRight className="h-4 w-4" />
          חזרה
        </Button>
        <h1 className="text-lg font-bold text-foreground">כל הפרויקטים שלי</h1>
      </div>

      <main id="main-content" className="flex-1 overflow-auto p-6">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FolderOpen className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-lg font-semibold text-foreground mb-2">אין פרויקטים עדיין</p>
            <p className="text-sm text-muted-foreground mb-6">צור פרויקט חדש כדי להתחיל</p>
            <Button onClick={() => navigate("/")} className="gap-2">
              <Film className="h-4 w-4" /> צור פרויקט חדש
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-w-7xl mx-auto">
            {projects.map((p) => (
              <div
                key={p.id}
                className="flex flex-col rounded-xl border border-border bg-card hover:border-primary/40 transition-all overflow-hidden"
              >
                <div className="h-32 bg-secondary/40 flex items-center justify-center">
                  <Film className="h-10 w-10 text-muted-foreground/40" />
                </div>

                <div className="p-4 flex flex-col gap-2 flex-1">
                  <h3 className="font-bold text-foreground text-sm truncate">{p.name}</h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      {typeLabels[p.type] || p.type}
                    </span>
                    {p.genre && (
                      <span className="text-[10px] bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">
                        {p.genre}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {p.scenes_count} סצנות
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground space-y-0.5 mt-1">
                    <p className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> נוצר: {formatDate(p.created_at)}
                    </p>
                    <p className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> עודכן: {formatDate(p.updated_at)}
                    </p>
                  </div>
                </div>

                <div className="p-3 border-t border-border flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 gap-1 text-xs"
                    onClick={() => navigate(`/editor/${p.id}`)}
                  >
                    <Pencil className="h-3 w-3" /> פתח/ערוך
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="gap-1 text-xs"
                    onClick={() => navigate(`/editor/${p.id}`)}
                  >
                    <Wand2 className="h-3 w-3" /> שפר
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-1 text-xs"
                    onClick={() => setDeleteId(p.id)}
                    aria-label={`מחיקת הפרויקט ${p.name}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת פרויקט</AlertDialogTitle>
            <AlertDialogDescription>
              האם אתה בטוח שברצונך למחוק את הפרויקט? פעולה זו בלתי הפיכה ותמחק את כל הסצנות והסרטונים.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "מחק"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MyProjects;
