import type { LeaderboardEntry } from "@/lib/game/types";
import { Avatar } from "./Avatar";

export function LeaderboardTable({ rows, limit = 10 }: { rows: LeaderboardEntry[]; limit?: number }) {
  const top = rows.slice(0, limit);
  const me = rows.find((r) => r.isMe);
  const meOutside = me && !top.includes(me) ? me : null;

  return (
    <div className="tile overflow-hidden" data-testid="leaderboard">
      <div className="flex items-center gap-2.5 border-b border-line bg-raised/50 px-3.5 py-2">
        <span className="label w-7">#</span>
        <span className="label flex-1">Igrač</span>
        <span className="label w-11 text-right">Riječi</span>
        <span className="label w-16 text-right">Bodovi</span>
      </div>
      <ol>
        {top.map((r) => (
          <Row key={r.userId} r={r} />
        ))}
        {meOutside && (
          <>
            <li aria-hidden className="border-t border-line px-4 py-1 text-center text-muted">
              ⋯
            </li>
            <Row r={meOutside} />
          </>
        )}
      </ol>
    </div>
  );
}

function Row({ r }: { r: LeaderboardEntry }) {
  return (
    <li
      data-testid="leaderboard-row"
      data-me={r.isMe ? "true" : undefined}
      className={`flex items-center gap-2.5 border-t border-line/70 px-3.5 py-2.5 first:border-t-0 ${r.isMe ? "bg-signal-tint" : ""}`}
    >
      <span className="w-7 text-sm font-extrabold tabular-nums text-muted">{r.rank}</span>
      <span className="flex min-w-0 flex-1 items-center gap-2.5">
        <Avatar username={r.username} avatar={r.avatar} size={28} />
        <span className="truncate font-semibold">{r.username}</span>
        {r.isMe && <span className="shrink-0 rounded-full bg-signal px-1.5 py-px text-[10px] font-extrabold uppercase tracking-wide text-white">Ti</span>}
      </span>
      <span className="w-11 text-right tabular-nums text-muted">{r.words}</span>
      <span className="w-16 text-right font-extrabold tabular-nums">{r.points.toLocaleString("hr")}</span>
    </li>
  );
}
