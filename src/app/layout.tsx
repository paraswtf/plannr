import "~/styles/globals.css";

import { type Metadata, type Viewport } from "next";
import {
  Instrument_Sans,
  JetBrains_Mono,
  Space_Grotesk,
} from "next/font/google";

import { env } from "~/env";
import { TRPCReactProvider } from "~/trpc/react";

const APP_NAME = "Plannr";
const APP_TITLE = "Plannr — campus timetables & room booking";
/** One sentence, under 160 characters, so previews never truncate it. */
const APP_DESCRIPTION =
  "Clash-free timetables, live room availability, one-tap room bookings and class attendance — one scheduling system for the whole campus.";

/**
 * `metadataBase` turns every relative asset below into an absolute URL, which
 * is the one thing link-preview scrapers will not do for us.
 */
export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: { default: APP_TITLE, template: "%s · Plannr" },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  category: "education",
  keywords: [
    "timetable",
    "class schedule",
    "room booking",
    "campus",
    "college",
    "attendance",
    "scheduling",
  ],
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/favicon-96x96.png", type: "image/png", sizes: "96x96" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: APP_TITLE,
    description: APP_DESCRIPTION,
    url: "/",
    locale: "en_IN",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        type: "image/png",
        alt: APP_TITLE,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: APP_TITLE,
    description: APP_DESCRIPTION,
    images: [{ url: "/og.png", alt: APP_TITLE }],
  },
  // Room codes and PRNs are full of digits; Safari should not turn them into
  // phone links.
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef0f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1117" },
  ],
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
