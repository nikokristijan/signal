import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { GameProvider } from "@/components/GameProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "SIGNAL — Daily Zoom Challenge",
  description: "Can you recognize what you're looking at? One photograph, five zoom levels, a new puzzle every day.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#faf8f4" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <GameProvider>{children}</GameProvider>
      </body>
    </html>
  );
}
