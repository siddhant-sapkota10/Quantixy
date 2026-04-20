import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap"
});

export const metadata = {
  title: "Quantixy",
  description: "Real-time multiplayer math game",
  icons: {
    icon: "/assets/quantixytransparent.png",
    shortcut: "/assets/quantixytransparent.png",
    apple: "/assets/quantixytransparent.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#070b18",
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
        {children}
      </body>
    </html>
  );
}
