"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  stages: string[];
  /** Highest stage revealed (1-based). Earlier stages stay mounted so going deeper is instant. */
  stage: number;
  celebrate?: boolean;
  alt?: string;
}

/**
 * Shows the current crop of today's photograph. Every stage URL is a different
 * crop of the SAME master photo; only stages already revealed are ever requested.
 */
export function ZoomImage({ stages, stage, celebrate = false, alt = "Uvećana fotografija. Što je na njoj?" }: Props) {
  const [loaded, setLoaded] = useState<Record<number, boolean>>({});
  const prev = useRef(stage);
  const [animateStage, setAnimateStage] = useState<number | null>(null);

  useEffect(() => {
    if (stage !== prev.current) {
      setAnimateStage(stage);
      prev.current = stage;
    }
  }, [stage]);

  return (
    <div
      className={`relative mx-auto aspect-[4/3] w-full overflow-hidden rounded-lg border bg-soft ${
        celebrate ? "animate-ring border-signal" : "border-line"
      }`}
      data-testid="zoom-image"
      data-stage={stage}
    >
      {stages.slice(0, stage).map((src, i) => {
        const n = i + 1;
        const active = n === stage;
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src}
            src={src}
            alt={active ? alt : ""}
            aria-hidden={!active}
            draggable={false}
            onLoad={() => setLoaded((l) => ({ ...l, [n]: true }))}
            className={`absolute inset-0 h-full w-full select-none object-cover ${active && animateStage === n ? "stage-in" : ""} ${
              active ? "opacity-100" : "opacity-0"
            } transition-opacity duration-300`}
            style={{ visibility: active || loaded[n] ? "visible" : "hidden" }}
          />
        );
      })}
      {!loaded[stage] && <div className="absolute inset-0 animate-pulse bg-soft" aria-hidden />}
      <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/55 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
        Zoom {stage}/{stages.length}
      </span>
    </div>
  );
}
