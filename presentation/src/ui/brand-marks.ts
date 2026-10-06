/*
 * The marks of the apps people use today, as data, so every slide that shows
 * them draws the same thing: the intro slide's app icons
 * (visuals/opening/_app-icons.tsx), the three-apps slide's Gmail
 * (visuals/opening/_gmail-page.tsx) and the merge on the closing slide
 * (templates/MergeApps.tsx). They keep their brands' colours: they are the
 * apps, not the slide.
 *
 * WhatsApp's and Moodle's marks are the brands' own path data, from Simple
 * Icons (CC0): WhatsApp's from Meta's brand resources, Moodle's from
 * moodle.com/trademarks, cut into its two parts so the cap and the "m" can
 * take their own colours, as on the app's icon. Gmail's is the gradient M
 * from Google's May 2026 icon refresh (Wikimedia Commons, "Gmail icon
 * (2026).svg").
 */

/** A part of a mark: its path, and its fill as stops along a line in the
 * mark's own units (a flat colour is one stop). */
export interface MarkPart {
  d: string;
  stops: readonly (readonly [offset: number, color: string])[];
  line: readonly [x1: number, y1: number, x2: number, y2: number];
}

/**
 * The M as data, three parts in an 800 x 636 box, in paint order: the right
 * leg, the left leg, the chevron over both. The file draws its gradients in
 * the 2020 logo's units under a gradientTransform; their lines here are
 * already carried into the 800 box.
 */
export const GMAIL_M: {
  width: number;
  height: number;
  parts: readonly MarkPart[];
} = {
  width: 800,
  height: 636.36322,
  parts: [
    {
      d: "M627.27 81.82H800v500c0 30.12-24.42 54.54-54.55 54.54h-90.9a27.27 27.27 0 0 1-27.28-27.27z",
      stops: [
        [0, "#60d673"],
        [0.17, "#42c868"],
        [0.39, "#0ebc5f"],
        [0.62, "#00a9bb"],
        [0.86, "#3c90ff"],
        [1, "#3186ff"],
      ],
      line: [713.64, 81.82, 713.64, 636.36],
    },
    {
      d: "M172.73 81.82H0v500c0 30.12 24.42 54.54 54.55 54.54h90.9a27.27 27.27 0 0 0 27.28-27.27z",
      stops: [[0, "#fc413d"]],
      line: [0, 81.82, 0, 636.36],
    },
    {
      d: "M141.94 20.26C105.42-10.44 50.95-5.72 20.26 30.8c-30.7 36.5-25.98 90.99 10.54 121.68l345.8 290.68a36.36 36.36 0 0 0 46.8 0l345.8-290.68c36.51-30.7 41.23-85.17 10.54-121.69-30.69-36.5-85.17-41.22-121.68-10.53L400 237.18Z",
      stops: [
        [0.08, "#ff63a0"],
        [0.3, "#fc413d"],
        [0.65, "#fc413d"],
        [0.72, "#fc5c30"],
        [0.86, "#feb10c"],
        [0.91, "#fec700"],
        [0.96, "#ffdb0f"],
      ],
      line: [0, 91.5, 800, 91.5],
    },
  ],
};

/** WhatsApp's bubble and handset in a 24 x 24 box: the handset, then the
 * ring's inner edge, then its outer edge. */
export const WHATSAPP =
  "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z";

/** Moodle's mortarboard, its tassel hanging on the left. */
export const MOODLE_CAP =
  "M13.1348 5.7402l.0351.123-2.7363 1.9903c.3694.2606.7968.609 1.0078.8438l.0762.1035c-1.2878 2.2571-3.737 3.0557-6.3164 2.1816l.0195-.1601h-.002c-.0784-.5679-.0962-1.0524-.0585-1.463-.7507-.003-1.5298-.0402-2.2832-.0663l-.5157.0175c-.0994.8449-.0351 2.135-.0254 2.3223.3492 1.2819.2977 2.2907.295 3.5293-.4134-1.0028-.8995-2.097-.416-3.4668l-.0098-.3183c-.0007-.0143-.0683-1.1532.037-2.0625l-.4081.0136-.0371-.1191C5.7922 6.8402 8.5032 6.218 13.1348 5.7402Z";

/** Moodle's "m", under the cap. */
export const MOODLE_M =
  "M14.7578 8.2539c1.2202 0 2.1885.2691 2.9043.8066.8138.601 1.2207 1.4866 1.2207 2.6582v5.6856h-2.7344v-5.3691c0-1.1225-.4634-1.6836-1.3906-1.6836-.9278 0-1.3906.561-1.3906 1.6836v5.3691h-2.7344v-5.3691c0-.5183-.0986-.9144-.293-1.1934.6172-.435 1.1534-1.0124 1.5723-1.7246.0297.029.0597.0574.0879.0879.5044-.6349 1.4233-.9512 2.7578-.9512zm-9.6094 3.2344c.932.3 1.8614.393 2.7364.287a3.5455 3.5455 0 0 0-.0098.2599v5.3691H5.1426v-5.6855c0-.0787.0022-.1544.0058-.2305z";

/**
 * The Moodle mark's bounds in its path's units, and where the app's own icon
 * places it: its left, top and width as fractions of the tile.
 */
export const MOODLE_BOUNDS = { x: 1.797, y: 5.74, width: 17.086 };
export const MOODLE_PLACE = { left: 0.062, top: 0.23, width: 0.743 };
export const MOODLE_VIEWBOX = (() => {
  const tile = MOODLE_BOUNDS.width / MOODLE_PLACE.width;
  const x = MOODLE_BOUNDS.x - MOODLE_PLACE.left * tile;
  const y = MOODLE_BOUNDS.y - MOODLE_PLACE.top * tile;
  return `${x} ${y} ${tile} ${tile}`;
})();

/** How wide Gmail's and WhatsApp's marks sit, as fractions of the tile. */
export const MARK_SIZE = {
  gmail: 0.768,
  whatsapp: 0.71,
  timetable: 0.66,
} as const;

/** The tile each app's icon sits on, as the App Store shows it. */
export const APP_TILE = {
  timetable: "#ffffff",
  gmail: "#ffffff",
  whatsapp: "linear-gradient(180deg, #00ec71, #00db41)",
  moodle: "#ffffff",
} as const;
