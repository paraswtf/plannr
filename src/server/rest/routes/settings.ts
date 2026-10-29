import { type RouteDef } from "../types";

/**
 * The institution's own settings: so far, how question papers look.
 *
 * The reads are `person` so that a service key, which is nobody, is refused:
 * it has no business choosing what the institution prints. They also need
 * `ManageSettings`, which a personal key cannot hold, so today only a
 * signed-in browser reaches them. Saving is `session`, because it carries an
 * image file and is done from the Documents screen; an app has no reason to
 * change the letterhead.
 */
export const settingsRoutes: RouteDef[] = [
  {
    method: "GET",
    path: "/settings/documents",
    procedure: "settings.documents",
    summary: "Get the header, footer and logo printed on question papers",
    description:
      "`header` is the saved text, one line each; the first line is printed largest. Empty means papers carry the institution's name alone (`orgName`). `logo` gives the image type and its size in bytes, not the image.",
    tag: "Settings",
    scopes: ["ManageSettings"],
    actor: "person",
    input: "none",
  },
  {
    method: "PUT",
    path: "/settings/documents",
    procedure: "settings.setDocuments",
    summary: "Save the header, footer and logo printed on question papers",
    description:
      "Browser only. `logo` is `{ base64, type }` with a PNG or JPEG of at most 256 KB and at most 4000 pixels on each side, which is typeset once before it is saved and refused if it cannot be; `null` removes the logo and leaving it out keeps it. Papers already set keep the header they were printed with.",
    tag: "Settings",
    scopes: ["ManageSettings"],
    actor: "session",
  },
  {
    method: "POST",
    path: "/settings/documents/preview",
    procedure: "settings.previewDocuments",
    summary: "Typeset a sample paper with a header, footer and logo",
    description:
      "Returns `{ pdfBase64 }`: a one-page sample paper set with the `header`, `footer` and `logo` given (the saved ones where left out; `logo: null` prints none). `logo` is `{ base64, type }`, checked as `PUT /settings/documents` checks it. Nothing is saved. A POST because a logo is too big for a query string.",
    tag: "Settings",
    scopes: ["ManageSettings"],
    actor: "person",
  },
];
