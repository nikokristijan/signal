import Link from "next/link";

/** Logo samo tekstom, kao SIGNAL: BOMBA + zelena točka. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" aria-label="Bomba, početna" className={`inline-flex items-baseline font-extrabold uppercase tracking-[0.22em] text-ink ${className}`}>
      Bomba<span className="text-signal">.</span>
    </Link>
  );
}
