import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { PermissionFlags } from "~/lib/permissions";
import { createTRPCRouter, permissionProcedure } from "~/server/api/trpc";
import type { Db } from "~/server/services/occurrences";
import { SAMPLE_META, SAMPLE_PAPER } from "~/server/services/papers/sample";
import {
  checkLogo,
  documentSettingsFor,
  headerLines,
  TypesetError,
  typesetPaper,
  type DocumentSettings,
} from "~/server/services/papers/typeset";

/**
 * The institution's own settings that an administrator changes on screen.
 *
 * So far that is how question papers look: the lines printed at the top of
 * every paper, the line along the foot of every page, and a logo. They are
 * the institution's, not any teacher's, so changing them takes
 * ManageSettings; reading them does too, because the only screen that shows
 * them is the one that changes them.
 */

const HEADER_MAX_LINES = 6;
const HEADER_LINE_MAX = 150;
const FOOTER_MAX = 200;
/** 256 KB. A logo is printed about 2 cm tall; anything bigger is waste. */
const LOGO_MAX_BYTES = 256 * 1024;

const headerInput = z
  .string()
  .max(HEADER_MAX_LINES * (HEADER_LINE_MAX + 2))
  .superRefine((value, ctx) => {
    const lines = headerLines(value);
    if (lines.length > HEADER_MAX_LINES) {
      ctx.addIssue({
        code: "custom",
        message: `The header can have at most ${HEADER_MAX_LINES} lines. Remove some and try again.`,
      });
    }
    if (lines.some((line) => line.length > HEADER_LINE_MAX)) {
      ctx.addIssue({
        code: "custom",
        message: `Each header line can be at most ${HEADER_LINE_MAX} characters. Shorten the long ones and try again.`,
      });
    }
  });

const footerInput = z
  .string()
  .max(FOOTER_MAX, `The footer can be at most ${FOOTER_MAX} characters.`)
  .refine(
    (value) => !/[\r\n]/.test(value),
    "The footer is a single line. Remove the line breaks and try again.",
  )
  .nullable();

const logoInput = z.object({
  /** The file's bytes, base64. 256 KB of image is about 350,000 characters. */
  base64: z
    .string()
    .max(
      Math.ceil(LOGO_MAX_BYTES / 3) * 4 + 4,
      "The logo is larger than 256 KB. Save a smaller copy and upload that.",
    ),
  type: z.enum(["image/png", "image/jpeg"]),
});

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

/** The logo's bytes, after checking they are what the upload claims. */
function logoBytes(logo: z.infer<typeof logoInput>): Buffer {
  const text = logo.base64.replace(/\s+/g, "");
  // Buffer.from skips characters it does not understand, so a string that is
  // not base64 at all would quietly decode to a few stray bytes.
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 !== 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The logo did not arrive intact. Choose the file again.",
    });
  }
  const bytes = Buffer.from(text, "base64");
  if (bytes.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The logo file is empty. Choose another file.",
    });
  }
  if (bytes.length > LOGO_MAX_BYTES) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "The logo is larger than 256 KB. Save a smaller copy and upload that.",
    });
  }
  const magic = logo.type === "image/png" ? PNG_MAGIC : JPEG_MAGIC;
  if (!bytes.subarray(0, magic.length).equals(magic)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        logo.type === "image/png"
          ? "That file is not a PNG image. Upload the logo as a PNG or JPEG."
          : "That file is not a JPEG image. Upload the logo as a PNG or JPEG.",
    });
  }
  return bytes;
}

type Logo = NonNullable<DocumentSettings["logo"]>;

/**
 * A picked logo, checked all the way: what the upload claims, then that typst
 * can print it. Refusing it here is what keeps a bad file from stopping every
 * paper of the institution once it is saved.
 */
async function checkedLogo(
  logo: z.infer<typeof logoInput>,
  signal: AbortSignal | undefined,
): Promise<Logo> {
  const checked: Logo = {
    bytes: new Uint8Array(logoBytes(logo)),
    type: logo.type,
  };
  try {
    await checkLogo(checked, { signal });
  } catch (error) {
    if (error instanceof TypesetError) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
    }
    throw error;
  }
  return checked;
}

/** What the Documents screen shows: the stored text, and the logo's size. */
async function documentsOf(db: Db, orgId: string) {
  const org = await db.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: {
      name: true,
      settings: {
        select: {
          documentHeader: true,
          documentFooter: true,
          documentLogo: true,
          documentLogoType: true,
        },
      },
    },
  });
  const s = org.settings;
  const type = s?.documentLogoType;
  return {
    orgName: org.name,
    header: s?.documentHeader ?? "",
    footer: s?.documentFooter ?? null,
    logo:
      s?.documentLogo && (type === "image/png" || type === "image/jpeg")
        ? { type, bytes: s.documentLogo.length }
        : null,
  };
}

export const settingsRouter = createTRPCRouter({
  /** The paper header, footer and logo as they are saved. */
  documents: permissionProcedure(PermissionFlags.ManageSettings).query(
    ({ ctx }) => documentsOf(ctx.db, ctx.orgId),
  ),

  /**
   * Saves the paper header and footer, and the logo when `logo` is given:
   * null removes it, and leaving it out keeps the one there is. Papers already
   * sealed keep the header they were set with; this changes papers set from
   * now on.
   */
  setDocuments: permissionProcedure(PermissionFlags.ManageSettings)
    .input(
      z.object({
        header: headerInput,
        footer: footerInput,
        logo: logoInput.nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input, signal }) => {
      const header = headerLines(input.header).join("\n");
      const footer = input.footer?.trim() ?? "";
      const picked = input.logo ? await checkedLogo(input.logo, signal) : null;
      const logo =
        input.logo === undefined
          ? {}
          : picked === null
            ? { documentLogo: null, documentLogoType: null }
            : {
                documentLogo: new Uint8Array(picked.bytes),
                documentLogoType: picked.type,
              };
      const data = {
        documentHeader: header.length > 0 ? header : null,
        documentFooter: footer.length > 0 ? footer : null,
        ...logo,
      };
      await ctx.db.orgSettings.upsert({
        where: { orgId: ctx.orgId },
        update: data,
        create: { orgId: ctx.orgId, ...data },
      });
      return documentsOf(ctx.db, ctx.orgId);
    }),

  /**
   * A short sample paper set with this header, footer and logo (the saved
   * ones where left out; a null logo prints none), so the screen can show the
   * result before it is saved. Small enough to return as base64. A mutation,
   * though it changes nothing, because a logo is too big for a query string,
   * and so that a preview is never answered from a cache.
   */
  previewDocuments: permissionProcedure(PermissionFlags.ManageSettings)
    .input(
      z
        .object({
          header: headerInput.optional(),
          footer: footerInput.optional(),
          logo: logoInput.nullable().optional(),
        })
        .default({}),
    )
    .mutation(async ({ ctx, input, signal }) => {
      const saved = await documentSettingsFor(ctx.db, ctx.orgId);
      const logo =
        input.logo === undefined
          ? saved.logo
          : input.logo === null
            ? null
            : await checkedLogo(input.logo, signal);
      const header =
        input.header === undefined ? saved.header : headerLines(input.header);
      // An empty footer, like a missing one, prints none.
      const typedFooter = input.footer?.trim();
      const footer =
        input.footer === undefined
          ? saved.footer
          : typedFooter && typedFooter.length > 0
            ? typedFooter
            : null;
      try {
        const { pdf } = await typesetPaper(
          {
            content: SAMPLE_PAPER,
            meta: SAMPLE_META,
            doc: {
              ...saved,
              header: header.length > 0 ? header : [saved.orgName],
              footer,
              logo,
            },
          },
          { signal },
        );
        return { pdfBase64: Buffer.from(pdf).toString("base64") };
      } catch (error) {
        if (error instanceof TypesetError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw error;
      }
    }),
});
