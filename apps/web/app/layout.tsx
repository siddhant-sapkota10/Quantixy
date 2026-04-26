import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";
import { GlobalBackground } from "@/components/global-background";
import { DailyRewardsPopup } from "@/components/daily-rewards-popup";

const inter = Inter({
  subsets: ["latin"],
  display: "swap"
});

export const metadata = {
  title: "Quantixy",
  description: "Real-time multiplayer math game",
  manifest: "/manifest.json",
  applicationName: "Quantixy",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Quantixy",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/assets/quantixytransparent.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/assets/quantixytransparent.png",
    apple: "/assets/quantixytransparent.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#020617",
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full overflow-x-hidden">
      <body
        className={`${inter.className} min-h-[100dvh] min-h-screen touch-manipulation antialiased`}
      >
        <GlobalBackground />
        <div
          className="q-bg-readability pointer-events-none fixed inset-0 z-[1]"
          aria-hidden="true"
        />
        <div className="relative z-10 min-h-[100dvh] min-h-screen">
          {children}
        </div>
        <DailyRewardsPopup />
      </body>
    </html>
  );
}
