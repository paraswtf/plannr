import "~/styles/globals.css";

import { type Metadata } from "next";
import {
  Instrument_Sans,
  JetBrains_Mono,
  Space_Grotesk,
} from "next/font/google";

import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "Plannr — room scheduling",
  description: "Timetables and room booking for the whole campus.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

// Display face: headings, room numerals, stat values.
const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

// UI and body copy.
const body = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
});

// Times, room codes, PRNs and counts.
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
      <body>
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
