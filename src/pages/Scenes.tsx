import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Upload, X, ChevronDown, ChevronUp, ArrowLeft } from "lucide-react";

interface ProjectData {
  name: string;
  genre: string;
  duration: string;
  scenesCount: number;
  script: string;
  type: string;
}

interface SceneVideo {
  file: File;
  url: string;
  angle: string;
}

const Scenes = () => {
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [sceneVideos, setSceneVideos] = useState<Record<number, SceneVideo[]>>({});
  const [expandedScene, setExpandedScene] = useState<number | null>(0);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  useEffect(() => {
    const data = sessionStorage.getItem("currentProject");
    if (!data) {
      navigate("/");
      return;
    }
    setProject(JSON.parse(data));
  }, [navigate]);

  if (!project) return null;

  const handleFileUpload = (sceneIndex: number, files: FileList | null) => {
    if (!files) return;
    const newVideos: SceneVideo[] = Array.from(files).map((file, i) => ({
      file,
      url: URL.createObjectURL(file),
      angle: `זווית ${(sceneVideos[sceneIndex]?.length || 0) + i + 1}`,
    }));
    setSceneVideos(prev => ({
      ...prev,
      [sceneIndex]: [...(prev[sceneIndex] || []), ...newVideos],
    }));
  };

  const removeVideo = (sceneIndex: number, videoIndex: number) => {
    setSceneVideos(prev => {
      const updated = [...(prev[sceneIndex] || [])];
      URL.revokeObjectURL(updated[videoIndex].url);
      updated.splice(videoIndex, 1);
      return { ...prev, [sceneIndex]: updated };
    });
  };

  const totalVideos = Object.values(sceneVideos).reduce((sum, v) => sum + v.length, 0);

  const handleContinueToEditor = () => {
    // Store video URLs for the editor (can't pass File objects via sessionStorage)
    const videosForStorage: Record<number, { url: string; angle: string }[]> = {};
    for (const [key, videos] of Object.entries(sceneVideos)) {
      videosForStorage[Number(key)] = videos.map(v => ({ url: v.url, angle: v.angle }));
    }
    sessionStorage.setItem("sceneVideos", JSON.stringify(videosForStorage));
    navigate("/editor");
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container max-w-3xl py-12">
        <div className="mb-8 animate-fade-up">
          <h1 className="text-2xl font-bold mb-1">{project.name}</h1>
          <p className="text-muted-foreground text-sm">
            {project.genre && `${project.genre} · `}{project.duration && `${project.duration} דק׳ · `}{project.scenesCount} סצנות
          </p>
        </div>

        <div className="space-y-3">
          {Array.from({ length: project.scenesCount }, (_, i) => {
            const isExpanded = expandedScene === i;
            const videos = sceneVideos[i] || [];

            return (
              <div
                key={i}
                className="rounded-lg border border-border bg-card overflow-hidden animate-fade-up"
                style={{ animationDelay: `${Math.min(i * 60, 400)}ms` }}
              >
                <button
                  onClick={() => setExpandedScene(isExpanded ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-right hover:bg-secondary/40 transition-colors active:scale-[0.995]"
                >
                  <span className="font-semibold">סצנה {i + 1}</span>
                  <div className="flex items-center gap-2">
                    {videos.length > 0 && (
                      <span className="text-xs bg-primary/15 text-primary px-2 py-0.5 rounded-full">
                        {videos.length} סרטונים
                      </span>
                    )}
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-5 pb-5 pt-2 border-t border-border">
                    {videos.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                        {videos.map((video, vi) => (
                          <div key={vi} className="relative group rounded-md overflow-hidden bg-muted aspect-video">
                            <video
                              src={video.url}
                              className="w-full h-full object-cover"
                              controls
                              preload="metadata"
                            />
                            <div className="absolute top-1 left-1 flex gap-1">
                              <span className="text-[10px] bg-background/80 backdrop-blur-sm text-foreground px-1.5 py-0.5 rounded">
                                {video.angle}
                              </span>
                              <button
                                onClick={() => removeVideo(i, vi)}
                                className="h-5 w-5 flex items-center justify-center rounded bg-destructive/90 text-destructive-foreground hover:bg-destructive transition-colors"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <input
                      ref={el => { fileInputRefs.current[i] = el; }}
                      type="file"
                      accept="video/*"
                      multiple
                      className="hidden"
                      onChange={e => handleFileUpload(i, e.target.files)}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRefs.current[i]?.click()}
                      className="gap-2"
                    >
                      <Upload className="h-4 w-4" />
                      העלה סרטונים
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Continue to editor */}
        {totalVideos > 0 && (
          <div className="mt-8 flex justify-center animate-fade-up">
            <Button
              size="lg"
              onClick={handleContinueToEditor}
              className="gap-2 text-base px-8"
            >
              <ArrowLeft className="h-5 w-5" />
              המשך לעריכה
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};

export default Scenes;
