import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { GameProvider } from "@/components/GameProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "SIGNAL — dnevni zoom izazov",
  description: "Prepoznaješ li što gledaš? Jedna fotografija, pet razina zooma, nova zagonetka svaki dan.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#faf8f4" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="hr">
      <body>
        <GameProvider>{children}</GameProvider>
      </body>
    </html>
  );
}
