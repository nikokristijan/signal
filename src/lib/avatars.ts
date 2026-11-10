import type { AvatarSpec } from "./game/types";

export const AVATAR_COLORS: Record<string, string> = {
  green: "#4b8b5a",
  blue: "#4a74a8",
  amber: "#c08a2b",
  rose: "#b8566b",
  violet: "#7a62a8",
  teal: "#3f8f8a",
  slate: "#5d6672",
  clay: "#b0694a",
};
export const AVATAR_KEYS = Object.keys(AVATAR_COLORS);
export const avatarColor = (a: AvatarSpec) => AVATAR_COLORS[a.color] ?? AVATAR_COLORS.slate;
