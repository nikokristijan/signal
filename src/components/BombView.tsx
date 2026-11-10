"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";

export interface BombHandle {
  /** p = preostalo vrijeme 0..1. Poziva se iz requestAnimationFrame petlje: direktno mijenja DOM, bez React renderiranja. */
  update(p: number, seconds: string): void;
}

/** Fitilj je kubična Bézierova krivulja; vraća točku na udaljenosti u (0 = baza, 1 = vrh). */
const FUSE = [120, 46, 120, 24, 150, 20, 170, 4] as const;
const FUSE_PATH = `M${FUSE[0]} ${FUSE[1]} C ${FUSE[2]} ${FUSE[3]} ${FUSE[4]} ${FUSE[5]} ${FUSE[6]} ${FUSE[7]}`;
function fusePoint(u: number): [number, number] {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = FUSE;
  const m = 1 - u;
  return [m ** 3 * x0 + 3 * m * m * u * x1 + 3 * m * u * u * x2 + u ** 3 * x3, m ** 3 * y0 + 3 * m * m * u * y1 + 3 * m * u * u * y2 + u ** 3 * y3];
}

/** Zvjezdica iskre: 8 zraka. */
const SPARK = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? 11 : 4;
    const a = (Math.PI * i) / 8;
    pts.push(`${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`);
  }
  return pts.join(" ");
})();

/** Nepravilna eksplozija (različite duljine šiljaka), jedna veličina po šiljku; zakrenuta po kutu `rot`. */
const SPIKES = [100, 58, 90, 54, 108, 62, 82, 56, 98, 60, 92, 52, 106, 64, 86, 56, 96, 58, 110, 62, 88, 54, 94, 60];
function burst(scale: number, rot: number): string {
  return SPIKES.map((r, i) => {
    const a = (Math.PI * i) / 12 - Math.PI / 2 + (rot * Math.PI) / 180;
    return `${(120 + Math.cos(a) * r * scale).toFixed(1)},${(120 + Math.sin(a) * r * scale).toFixed(1)}`;
  }).join(" ");
}
const BURST_OUTER = burst(1, 0);
const BURST_MID = burst(0.66, 9);
const BURST_CORE = burst(0.3, 21);

/** Krhotine bombe i iskre oko eksplozije: [kut°, udaljenost, polumjer, boja]. */
const DEBRIS: Array<[number, number, number, string]> = [
  [-70, 112, 5, "#2d2d32"],
  [-20, 116, 3.5, "#e8833a"],
  [18, 110, 6, "#2d2d32"],
  [52, 114, 4, "#f2b25d"],
  [96, 112, 5.5, "#2d2d32"],
  [138, 116, 3.5, "#e8833a"],
  [172, 110, 6, "#2d2d32"],
  [212, 114, 4, "#f2b25d"],
  [248, 110, 4.5, "#2d2d32"],
];

interface Props {
  syllable: string;
  /** Prikaži eksploziju umjesto bombe. */
  exploding?: boolean;
}

/**
 * Bomba: fitilj gori i skraćuje se kako vrijeme ističe, rub tijela postupno poprima crvenkastu boju,
 * a otkucaji se ubrzavaju. Sve se animira izravno u DOM-u (ref) radi tečnosti.
 */
export const BombView = forwardRef<BombHandle, Props>(function BombView({ syllable, exploding = false }, ref) {
  const fuse = useRef<SVGPathElement>(null);
  const rope = useRef<SVGPathElement>(null);
  const spark = useRef<SVGGElement>(null);
  const heatRef = useRef<SVGCircleElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const seconds = useRef<HTMLSpanElement>(null);
  const lastBeat = useRef(0);

  useImperativeHandle(ref, () => ({
    update(p, text) {
      const u = Math.max(0, Math.min(1, p));
      if (fuse.current) fuse.current.style.strokeDasharray = `${u} 2`;
      if (rope.current) rope.current.style.strokeDasharray = `${u} 2`;
      if (spark.current) {
        const [x, y] = fusePoint(u);
        spark.current.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      }
      const heat = Math.pow(1 - u, 1.5);
      if (heatRef.current) heatRef.current.style.opacity = (heat * 0.9).toFixed(2);
      if (seconds.current) {
        seconds.current.textContent = text;
        seconds.current.style.color = u < 0.3 ? "#b4443c" : "#1a1a1b";
      }
      // brzina otkucaja: 1,1 s → 0,4 s (blago, da ne djeluje nervozno); mijenja se rijetko da se animacija ne trza
      const beat = Math.round((1.1 - 0.7 * heat) * 20) / 20;
      if (wrap.current && beat !== lastBeat.current) {
        lastBeat.current = beat;
        wrap.current.style.setProperty("--beat", `${beat}s`);
      }
    },
  }));

  const size = "w-[min(40dvh,80vw,310px)]";

  if (exploding) {
    return (
      <div className={`relative mx-auto aspect-square ${size}`} data-testid="explosion" aria-hidden>
        <svg viewBox="0 0 240 240" className="absolute inset-0 animate-burst overflow-visible">
          <polygon points={BURST_OUTER} fill="#ea9246" stroke="#ea9246" strokeWidth="5" strokeLinejoin="round" />
          <polygon points={BURST_MID} fill="#f5bf6b" stroke="#f5bf6b" strokeWidth="4" strokeLinejoin="round" />
          <polygon points={BURST_CORE} fill="#fff3d6" stroke="#fff3d6" strokeWidth="3" strokeLinejoin="round" />
          {DEBRIS.map(([deg, dist, r, color], i) => (
            <circle key={i} cx={120 + Math.cos((deg * Math.PI) / 180) * dist} cy={120 + Math.sin((deg * Math.PI) / 180) * dist} r={r} fill={color} />
          ))}
        </svg>
      </div>
    );
  }

  return (
    <div className="mx-auto flex flex-col items-center">
      <div ref={wrap} className={`bomb-beat animate-bomb-in ${size}`} data-testid="bomb">
        <svg viewBox="0 0 240 262" className="block h-auto w-full overflow-visible" role="img" aria-label={`Slog ${syllable.toUpperCase()}`}>
          <defs>
            <radialGradient id="bmBody" cx="34%" cy="28%" r="85%">
              <stop offset="0%" stopColor="#52525a" />
              <stop offset="45%" stopColor="#2d2d32" />
              <stop offset="100%" stopColor="#151517" />
            </radialGradient>
            <radialGradient id="bmHeat" cx="50%" cy="50%" r="50%">
              <stop offset="55%" stopColor="#c0392b" stopOpacity="0" />
              <stop offset="100%" stopColor="#d4432f" stopOpacity="0.95" />
            </radialGradient>
            <linearGradient id="bmCap" x1="0" x2="1">
              <stop offset="0%" stopColor="#4b4b52" />
              <stop offset="45%" stopColor="#7c7c85" />
              <stop offset="100%" stopColor="#3a3a40" />
            </linearGradient>
            <radialGradient id="bmHalo">
              <stop offset="0%" stopColor="#f6a13f" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#f6a13f" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* sjena na podlozi */}
          <ellipse cx="120" cy="254" rx="70" ry="6" fill="#1a1a1b" opacity="0.1" />

          {/* fitilj: izgoreni dio (blijedo) + preostalo uže */}
          <path d={FUSE_PATH} fill="none" stroke="#e1ddd4" strokeWidth="5" strokeLinecap="round" pathLength={1} />
          <path ref={fuse} d={FUSE_PATH} fill="none" stroke="#a88f68" strokeWidth="5" strokeLinecap="round" pathLength={1} style={{ strokeDasharray: "1 2" }} />
          <path ref={rope} d={FUSE_PATH} fill="none" stroke="#6f5a3c" strokeWidth="5" strokeLinecap="butt" pathLength={1} opacity="0.35" style={{ strokeDasharray: "1 2" }} strokeDashoffset="0" />

          {/* tijelo */}
          <circle cx="120" cy="160" r="88" fill="url(#bmBody)" />
          <circle ref={heatRef} cx="120" cy="160" r="88" fill="url(#bmHeat)" style={{ opacity: 0 }} />
          <circle cx="120" cy="160" r="87" fill="none" stroke="#fff" strokeOpacity="0.07" strokeWidth="2" />

          {/* vrat bombe */}
          <rect x="94" y="62" width="52" height="20" rx="5" fill="url(#bmCap)" />
          <rect x="94" y="62" width="52" height="3" rx="1.5" fill="#fff" opacity="0.18" />
          <rect x="102" y="46" width="36" height="18" rx="4" fill="url(#bmCap)" />
          <line x1="102" y1="55" x2="138" y2="55" stroke="#1a1a1b" strokeOpacity="0.25" />

          {/* odsjaj */}
          <ellipse cx="80" cy="118" rx="30" ry="15" fill="#fff" opacity="0.13" transform="rotate(-32 80 118)" />
          <circle cx="66" cy="132" r="4" fill="#fff" opacity="0.28" />

          {/* slog */}
          <text
            x="120"
            y="184"
            textAnchor="middle"
            fontSize={syllable.length > 2 ? 62 : 74}
            fontWeight={800}
            fill="#ffffff"
            style={{ letterSpacing: 3 }}
            data-testid="syllable"
          >
            {syllable.toUpperCase()}
          </text>

          {/* iskra */}
          <g ref={spark} transform={`translate(${FUSE[6]} ${FUSE[7]})`}>
            <circle r="20" fill="url(#bmHalo)" />
            <polygon points={SPARK} fill="#f5b04a" className="spark" />
            <circle r="3.2" fill="#fff6d6" />
          </g>
        </svg>
      </div>
      <div className="mt-3 inline-flex min-w-[92px] justify-center rounded-full border border-line bg-white px-4 py-1 text-xl font-bold tabular-nums shadow-sm" aria-live="off">
        <span ref={seconds} data-testid="seconds">
          {" "}
        </span>
      </div>
    </div>
  );
});
