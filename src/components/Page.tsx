import type { ReactNode } from "react";
import { Header } from "./Header";

export function Page({ children, challengeNumber, width = "max-w-xl" }: { children: ReactNode; challengeNumber?: number; width?: string }) {
  return (
    <>
      <Header challengeNumber={challengeNumber} />
      <main className={`mx-auto w-full ${width} px-4 pb-16 pt-6`}>{children}</main>
    </>
  );
}

export function Loading() {
  return (
    <div className="grid place-items-center py-24" role="status" aria-label="Učitavanje">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-ink" />
    </div>
  );
}
