import "~/styles/globals.css";

import { type Metadata, type Viewport } from "next";
import {
  Instrument_Sans,
  JetBrains_Mono,
  Space_Grotesk,
} from "next/font/google";

export const metadata: Metadata = {
  title: "Presenting Plannr — a design thinking study",
  description:
    "How four students researched the people who use, run and maintain a college timetable — and the system we designed from it.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon.svg", type: "image/svg+xml", sizes: "any" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
  themeColor: "#0d1117",
};

// The app's three faces, loaded the same way the app loads them.
const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});
const body = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
