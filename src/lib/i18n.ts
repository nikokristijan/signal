// Croatian labels for values that are stored as English keys (dataset + database).

const CATEGORY_HR: Record<string, string> = {
  Landmark: "Znamenitost",
  "Famous building": "Poznata građevina",
  Animal: "Životinja",
  Food: "Hrana",
  Car: "Vozilo",
  "Everyday item": "Svakodnevni predmet",
  Technology: "Tehnologija",
  "Historical object": "Povijesni predmet",
  Nature: "Priroda",
  Object: "Predmet",
};

const DIFFICULTY_HR: Record<string, string> = { easy: "lako", medium: "srednje", hard: "teško" };

export const categoryLabel = (c: string) => CATEGORY_HR[c] ?? c;
export const difficultyLabel = (d: string) => DIFFICULTY_HR[d] ?? d;

/** Messages raised by the Postgres game functions (supabase/migrations/0001_init.sql). */
export function translateDbError(message: string): string {
  let m: RegExpMatchArray | null;
  if ((m = message.match(/^No player named (.+)$/))) return `Ne postoji igrač „${m[1]}”.`;
  if ((m = message.match(/^(.+) is already your friend\.$/))) return `${m[1]} ti je već prijatelj.`;
  if (message === "That's you!") return "To si ti!";
  if (message === "Unknown challenge") return "Nepoznat izazov.";
  if (message === "Challenge not available yet") return "Izazov još nije dostupan.";
  if (message === "Attempt not started") return "Izazov još nije započet.";
  return message;
}
