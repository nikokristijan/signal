import { STAGE_COUNT } from "@/lib/game/scoring";

export function StageProgress({ stage }: { stage: number }) {
  return (
    <div className="flex items-center gap-3" role="progressbar" aria-valuemin={1} aria-valuemax={STAGE_COUNT} aria-valuenow={stage} aria-label="Zoom stage">
      <span className="w-9 text-sm font-bold tabular-nums" data-testid="stage-label">
        {stage}/{STAGE_COUNT}
      </span>
      <div className="flex flex-1 gap-1.5">
        {Array.from({ length: STAGE_COUNT }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${i < stage ? "bg-signal" : "bg-line"}`} />
        ))}
      </div>
    </div>
  );
}
