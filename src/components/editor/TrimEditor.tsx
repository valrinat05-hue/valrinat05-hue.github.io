import { useRef, useState, useCallback } from "react";
import { Scissors } from "lucide-react";

interface Props {
  videoUrl: string;
  trimStart: number;
  trimEnd: number | null;
  onTrimChange: (start: number, end: number | null) => void;
}

export default function TrimEditor({ videoUrl, trimStart, trimEnd, onTrimChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const draggingRef = useRef<"start" | "end" | null>(null);

  const startFrac = duration > 0 ? Math.max(0, Math.min(trimStart / duration, 1)) : 0;
  const endFrac = duration > 0 ? Math.max(startFrac, Math.min((trimEnd ?? duration) / duration, 1)) : 1;

  const getFrac = useCallback((clientX: number) => {
    if (!barRef.current) return 0;
    const rect = barRef.current.getBoundingClientRect();
    return Math.max(0, Math.min((clientX - rect.left) / rect.width, 1));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent, which: "start" | "end") => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = which;
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current || !duration) return;
    const effEnd = trimEnd ?? duration;
    const sec = getFrac(e.clientX) * duration;
    if (draggingRef.current === "start") {
      const newStart = Math.max(0, Math.min(sec, effEnd - 0.5));
      onTrimChange(newStart, trimEnd);
      if (videoRef.current) videoRef.current.currentTime = newStart;
    } else {
      const newEnd = Math.max(trimStart + 0.5, Math.min(sec, duration));
      const endVal = newEnd >= duration - 0.1 ? null : newEnd;
      onTrimChange(trimStart, endVal);
      if (videoRef.current) videoRef.current.currentTime = Math.min(newEnd, duration - 0.01);
    }
  }, [duration, trimStart, trimEnd, onTrimChange, getFrac]);

  const handlePointerUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const effEnd = trimEnd ?? duration;
  const selectedSec = Math.max(0, effEnd - trimStart);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Scissors className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">עורך חיתוך</span>
        {duration > 0 && (
          <span className="text-xs text-muted-foreground mr-auto">
            {fmt(trimStart)} — {fmt(effEnd)} · {fmt(selectedSec)} שניות
          </span>
        )}
      </div>

      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full max-h-28 object-contain bg-black rounded-lg"
        preload="metadata"
        onLoadedMetadata={() => videoRef.current && setDuration(videoRef.current.duration)}
        onTimeUpdate={() => videoRef.current && setCurrentTime(videoRef.current.currentTime)}
        controls
      />

      {duration > 0 && (
        <>
          <div
            ref={barRef}
            className="relative h-8 bg-secondary/50 rounded-lg select-none overflow-visible"
          >
            {/* Dimmed left region (before trim start) */}
            <div
              className="absolute inset-y-0 left-0 bg-black/40 rounded-l-lg pointer-events-none"
              style={{ width: `${startFrac * 100}%` }}
            />
            {/* Dimmed right region (after trim end) */}
            <div
              className="absolute inset-y-0 right-0 bg-black/40 rounded-r-lg pointer-events-none"
              style={{ width: `${(1 - endFrac) * 100}%` }}
            />
            {/* Active range highlight */}
            <div
              className="absolute inset-y-0 border-y-2 border-primary/60 pointer-events-none"
              style={{ left: `${startFrac * 100}%`, right: `${(1 - endFrac) * 100}%` }}
            />
            {/* Playhead */}
            <div
              className="absolute inset-y-0 w-px bg-white/70 pointer-events-none"
              style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            />
            {/* Start handle */}
            <div
              className="absolute inset-y-0 w-4 -translate-x-1/2 bg-primary rounded cursor-ew-resize z-10 flex items-center justify-center touch-none shadow-md"
              style={{ left: `${startFrac * 100}%` }}
              onPointerDown={(e) => handlePointerDown(e, "start")}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              <div className="w-0.5 h-5 bg-white/60 rounded-full" />
            </div>
            {/* End handle */}
            <div
              className="absolute inset-y-0 w-4 -translate-x-1/2 bg-primary rounded cursor-ew-resize z-10 flex items-center justify-center touch-none shadow-md"
              style={{ left: `${endFrac * 100}%` }}
              onPointerDown={(e) => handlePointerDown(e, "end")}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              <div className="w-0.5 h-5 bg-white/60 rounded-full" />
            </div>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground px-1">
            <span>0:00</span>
            <span className="text-primary font-medium">✂️ {fmt(selectedSec)} שניות נבחרו</span>
            <span>{fmt(duration)}</span>
          </div>
        </>
      )}
    </div>
  );
}
