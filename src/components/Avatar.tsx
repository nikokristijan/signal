import { avatarColor } from "@/lib/avatars";
import type { AvatarSpec } from "@/lib/game/types";

export function Avatar({ username, avatar, size = 32 }: { username: string; avatar: AvatarSpec; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-full font-bold uppercase text-white"
      style={{ width: size, height: size, background: avatarColor(avatar), fontSize: Math.round(size * 0.44) }}
    >
      {username.slice(0, 1)}
    </span>
  );
}
