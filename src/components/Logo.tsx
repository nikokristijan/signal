import Link from "next/link";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" aria-label="SIGNAL home" className={`inline-flex items-baseline font-extrabold tracking-[0.22em] text-ink ${className}`}>
      SIGNAL<span className="text-signal">.</span>
    </Link>
  );
}
