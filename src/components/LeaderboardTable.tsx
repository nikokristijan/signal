import type { LeaderboardEntry } from "@/lib/game/types";
import { Avatar } from "./Avatar";

interface Props {
  rows: LeaderboardEntry[];
  /** Friends view shows today's and total points side by side. */
  friends?: boolean;
  limit?: number;
}

export function LeaderboardTable({ rows, friends = false, limit = 10 }: Props) {
  const top = rows.slice(0, limit);
  const me = rows.find((r) => r.isMe);
  const meOutside = me && !top.includes(me) ? me : null;

  return (
    <div className="tile overflow-hidden" data-testid="leaderboard">
      <div className="flex items-center gap-3 border-b border-line bg-soft/60 px-4 py-2">
        <span className="label w-6">#</span>
        <span className="label flex-1">Player</span>
        {friends && <span className="label w-16 text-right">Today</span>}
        <span className="label w-20 text-right">{friends ? "Total" : "Points"}</span>
      </div>
      <ol>
        {top.map((r) => (
          <Row key={r.userId} r={r} friends={friends} />
        ))}
        {meOutside && (
          <>
            <li aria-hidden className="border-t border-line px-4 py-1 text-center text-muted">
              ⋯
            </li>
            <Row r={meOutside} friends={friends} />
          </>
        )}
      </ol>
    </div>
  );
}

function Row({ r, friends }: { r: LeaderboardEntry; friends: boolean }) {
  return (
    <li
      data-testid="leaderboard-row"
      data-me={r.isMe ? "true" : undefined}
      className={`flex items-center gap-3 border-t border-line/70 px-4 py-2.5 first:border-t-0 ${r.isMe ? "bg-signal-tint" : ""}`}
    >
      <span className="w-6 text-sm font-bold tabular-nums text-muted">{r.rank}</span>
      <span className="flex min-w-0 flex-1 items-center gap-2.5">
        <Avatar username={r.username} avatar={r.avatar} size={30} />
        <span className="truncate font-medium">{r.username}</span>
        {r.isMe && <span className="rounded-full bg-signal px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-white">You</span>}
      </span>
      {friends && <span className="w-16 text-right tabular-nums text-muted">{r.today === null || r.today === undefined ? "—" : r.today}</span>}
      <span className="w-20 text-right font-bold tabular-nums">{r.points.toLocaleString()}</span>
    </li>
  );
}
