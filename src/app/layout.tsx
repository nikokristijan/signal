import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { BombProvider } from "@/components/BombProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bomba — dnevna igra riječi",
  description: "Upiši riječ sa slogom prije nego bomba eksplodira. Svaki dan isti slogovi za sve, usporedi se s prijateljima.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#15131a", viewportFit: "cover" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="hr">
      <body>
        <BombProvider>{children}</BombProvider>
      </body>
    </html>
  );
}
