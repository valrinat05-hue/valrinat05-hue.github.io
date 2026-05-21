import { forwardRef } from "react";

const FilmStrip = forwardRef<HTMLDivElement>((_, ref) => {
  const frameCount = 8;
  const frameW = 80;
  const frameH = 56;
  const gap = 8;
  const sprocketSize = 6;
  const stripH = 80;
  const totalW = (frameW + gap) * frameCount;

  return (
    <div ref={ref} className="w-full overflow-hidden py-8 opacity-60">
      <div className="film-strip-scroll flex" style={{ width: `${totalW * 4}px` }}>
        {[0, 1, 2, 3].map((copy) => (
          <svg
            key={copy}
            width={totalW}
            height={stripH}
            viewBox={`0 0 ${totalW} ${stripH}`}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="flex-shrink-0"
          >
            <rect x={0} y={0} width={totalW} height={stripH} rx={4} fill="hsl(var(--primary))" fillOpacity={0.15} />
            <rect x={0} y={0} width={totalW} height={8} fill="hsl(var(--primary))" fillOpacity={0.3} />
            <rect x={0} y={stripH - 8} width={totalW} height={8} fill="hsl(var(--primary))" fillOpacity={0.3} />
            {Array.from({ length: frameCount * 3 }, (_, i) => {
              const x = i * (totalW / (frameCount * 3)) + 10;
              return (
                <g key={`s${i}`}>
                  <rect x={x} y={1} width={sprocketSize} height={sprocketSize} rx={1} fill="hsl(var(--background))" />
                  <rect x={x} y={stripH - sprocketSize - 1} width={sprocketSize} height={sprocketSize} rx={1} fill="hsl(var(--background))" />
                </g>
              );
            })}
            {Array.from({ length: frameCount }, (_, i) => {
              const x = i * (frameW + gap) + gap / 2;
              const y = (stripH - frameH) / 2;
              return (
                <rect
                  key={`f${i}`}
                  x={x}
                  y={y}
                  width={frameW}
                  height={frameH}
                  rx={2}
                  fill="hsl(var(--background))"
                  stroke="hsl(var(--primary))"
                  strokeOpacity={0.25}
                  strokeWidth={1}
                />
              );
            })}
          </svg>
        ))}
      </div>
    </div>
  );
});

FilmStrip.displayName = "FilmStrip";

export default FilmStrip;
