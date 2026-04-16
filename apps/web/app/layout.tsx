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

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
