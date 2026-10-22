import "~/styles/globals.css";

import { type Metadata, type Viewport } from "next";
import {
  Instrument_Sans,
  JetBrains_Mono,
  Space_Grotesk,
} from "next/font/google";

export const metadata: Metadata = {
  title: "Plannr under the hood",
  description: "The 13 features of Plannr and the web methods behind them.",
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
  colorScheme: "light",
  themeColor: "#f2f3f6",
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
