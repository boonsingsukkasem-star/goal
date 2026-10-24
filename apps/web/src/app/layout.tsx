import type { Metadata, Viewport } from "next";

import "@fontsource/archivo-narrow/400.css";
import "@fontsource/archivo-narrow/500.css";
import "@fontsource/archivo-narrow/600.css";
import "@fontsource/archivo-narrow/700.css";
import "@fontsource/anton/400.css";
import "@fontsource/hanken-grotesk/400.css";
import "@fontsource/hanken-grotesk/500.css";
import "@fontsource/hanken-grotesk/600.css";
import "@fontsource/hanken-grotesk/700.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/noto-sans-thai/400.css";
import "@fontsource/noto-sans-thai/500.css";
import "@fontsource/noto-sans-thai/600.css";
import "@fontsource/noto-sans-thai/700.css";

import "./globals.css";

import { AppChrome } from "@/components/score/score-shell";
import { SiteFooter } from "@/components/site/site-footer";

export const metadata: Metadata = {
  metadataBase: new URL("https://goal.co.th"),
  description: "Football live scores, AI match intelligence, community, and news.",
  title: {
    default: "Goal",
    template: "%s | Goal",
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#121212",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className="dark" lang="th">
      <body>
        <AppChrome>{children}</AppChrome>
        <SiteFooter />
      </body>
    </html>
  );
}
