import "~/styles/globals.css";

import { type Metadata, type Viewport } from "next";
import {
  Instrument_Sans,
  JetBrains_Mono,
  Roboto,
  Space_Grotesk,
} from "next/font/google";
import localFont from "next/font/local";

import { DeckLock } from "~/lock/DeckLock";

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
// The faces the three-apps slide draws Gmail and WhatsApp Web in. Google Sans
// is open source (OFL, src/fonts/GoogleSans-OFL.txt) but not in next/font's
// Google catalogue yet, so a subset (printable ASCII and the ellipsis) is
// loaded from the repo.
const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
});
const googleSans = localFont({
  src: "../fonts/GoogleSans-subset.woff2",
  weight: "400 700",
  variable: "--font-google-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable} ${roboto.variable} ${googleSans.variable}`}
    >
      <body>
        <DeckLock>{children}</DeckLock>
      </body>
    </html>
  );
}
