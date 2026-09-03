import type { Metadata } from "next";
import "./globals.css";
import { Baloo_2, Inter } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const baloo = Baloo_2({ subsets: ["latin"], variable: "--font-baloo", weight: ["500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "Gacha Pulse",
  description: "Sentiment and review trends across gacha games, live and EoS'd.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("dark font-sans", inter.variable, baloo.variable)}>
      <body>{children}</body>
    </html>
  );
}
