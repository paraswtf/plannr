import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { PermissionFlags } from "~/lib/permissions";
import { appRouter } from "~/server/api/root";
import { createCallerFactory } from "~/server/api/trpc";
import { db } from "~/server/db";
import { documentSettingsFor } from "~/server/services/papers/typeset";
import { stopTypesetter } from "~/server/services/papers/typesetter";

/**
 * Settings > Documents: what the institution prints on its question papers.
 *
 * The things worth protecting are that only somebody who may change the
 * institution's settings can, that a file claiming to be a picture is one
 * (and a small one), and that what is saved is what the papers then use.
 *
 * Run with `npm run test:integration` (needs `npm run db:start`).
 */

const ORG = "settings-docs-itest";
const ADMIN_EMAIL = "settings-docs-admin@plannr-demo.invalid";
const TEACHER_EMAIL = "settings-docs-teacher@plannr-demo.invalid";
const createCaller = createCallerFactory(appRouter);

/** The smallest valid PNG: one pixel. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

let orgId: string;
let admin: ReturnType<typeof callerFor>;
let teacher: ReturnType<typeof callerFor>;

function callerFor(user: { id: string; orgId: string; permissions: bigint }) {
  return createCaller({
    db,
    headers: new Headers(),
    session: {
      expires: new Date(Date.now() + 3_600_000).toISOString(),
      user: {
        id: user.id,
        orgId: user.orgId,
        roles: [],
        permissions: user.permissions.toString(),
        isActive: true,
        isServiceAccount: false,
        viaApiKey: false,
      },
    },
  });
}

afterAll(() => stopTypesetter());

beforeEach(async () => {
  const org = await db.organization.upsert({
    where: { slug: ORG },
    update: { name: "Documents Institute" },
    create: { slug: ORG, name: "Documents Institute" },
  });
  orgId = org.id;

  await db.orgSettings.deleteMany({ where: { orgId } });
  await db.user.deleteMany({
    where: { email: { in: [ADMIN_EMAIL, TEACHER_EMAIL] } },
  });

  const adminUser = await db.user.create({
    data: { orgId, email: ADMIN_EMAIL, name: "Admin" },
  });
  const teacherUser = await db.user.create({
    data: { orgId, email: TEACHER_EMAIL, name: "Teacher" },
  });
  admin = callerFor({
    id: adminUser.id,
    orgId,
    permissions: PermissionFlags.ManageSettings,
  });
  teacher = callerFor({
    id: teacherUser.id,
    orgId,
    permissions:
      PermissionFlags.ManageOwnAssignments | PermissionFlags.ViewGroups,
  });
});

describe("settings.documents", () => {
  it("starts empty, with the institution's name to fall back on", async () => {
    expect(await admin.settings.documents()).toEqual({
      orgName: "Documents Institute",
      header: "",
      footer: null,
      logo: null,
    });
    // An institution that never saved anything prints its name alone.
    expect(await documentSettingsFor(db, orgId)).toEqual({
      orgName: "Documents Institute",
      header: ["Documents Institute"],
      footer: null,
      logo: null,
    });
  });

  it("is only for those who manage the institution's settings", async () => {
    await expect(teacher.settings.documents()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      teacher.settings.setDocuments({ header: "Mine now", footer: null }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(teacher.settings.previewDocuments({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("settings.setDocuments", () => {
  it("saves the header without blank lines, and the footer and logo", async () => {
    const saved = await admin.settings.setDocuments({
      header: "  Documents Institute \n\n Department of Computing\n",
      footer: " Confidential until the test begins ",
      logo: { base64: PNG.toString("base64"), type: "image/png" },
    });
    expect(saved).toEqual({
      orgName: "Documents Institute",
      header: "Documents Institute\nDepartment of Computing",
      footer: "Confidential until the test begins",
      logo: { type: "image/png", bytes: PNG.length },
    });

    const doc = await documentSettingsFor(db, orgId);
    expect(doc.header).toEqual([
      "Documents Institute",
      "Department of Computing",
    ]);
    expect(doc.footer).toBe("Confidential until the test begins");
    expect(doc.logo?.type).toBe("image/png");
    expect(Buffer.from(doc.logo!.bytes).equals(PNG)).toBe(true);
  });

  it("leaves the logo out of every read that does not ask for it by name", async () => {
    await admin.settings.setDocuments({
      header: "Documents Institute",
      footer: null,
      logo: { base64: PNG.toString("base64"), type: "image/png" },
    });
    // The timetable grid and the plan workspace read this row whole and send
    // it to every open tab; the picture must not ride along.
    const row = await db.orgSettings.findUnique({ where: { orgId } });
    expect(row).not.toBeNull();
    expect(row).not.toHaveProperty("documentLogo");
    expect(row?.documentLogoType).toBe("image/png");
    // The two readers that print or report it still get it.
    expect((await admin.settings.documents()).logo).toEqual({
      type: "image/png",
      bytes: PNG.length,
    });
    const doc = await documentSettingsFor(db, orgId);
    expect(Buffer.from(doc.logo!.bytes).equals(PNG)).toBe(true);
  });

  /**
   * The client's type for a whole row still lists the logo (see db.ts for
   * why), so code reading it from such a row would compile and quietly get
   * nothing. Only these files may name it.
   */
  it("is read only where it is selected by name", () => {
    const root = path.resolve(__dirname, "../../..");
    const allowed = new Set([
      "server/api/routers/settings.ts",
      "server/services/papers/typeset.ts",
      "server/db.ts",
    ]);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (
          /\.tsx?$/.test(entry.name) &&
          !/\.test\.tsx?$/.test(entry.name) &&
          /\bdocumentLogo\b/.test(readFileSync(full, "utf8"))
        ) {
          const relative = path.relative(root, full).split(path.sep).join("/");
          if (!allowed.has(relative)) offenders.push(relative);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });

  it("keeps the logo when it is left out, and removes it for null", async () => {
    await admin.settings.setDocuments({
      header: "One",
      footer: null,
      logo: { base64: PNG.toString("base64"), type: "image/png" },
    });
    const kept = await admin.settings.setDocuments({
      header: "Two",
      footer: null,
    });
    expect(kept.logo).toEqual({ type: "image/png", bytes: PNG.length });
    const removed = await admin.settings.setDocuments({
      header: "Two",
      footer: null,
      logo: null,
    });
    expect(removed.logo).toBeNull();
    expect((await documentSettingsFor(db, orgId)).logo).toBeNull();
  });

  it("refuses a file that is not the picture it claims to be", async () => {
    await expect(
      admin.settings.setDocuments({
        header: "",
        footer: null,
        logo: { base64: PNG.toString("base64"), type: "image/jpeg" },
      }),
    ).rejects.toThrow(/not a JPEG image/);
    await expect(
      admin.settings.setDocuments({
        header: "",
        footer: null,
        logo: {
          base64: Buffer.from("<svg onload=alert(1)>").toString("base64"),
          type: "image/png",
        },
      }),
    ).rejects.toThrow(/not a PNG image/);
    await expect(
      admin.settings.setDocuments({
        header: "",
        footer: null,
        logo: { base64: "not base64 at all!", type: "image/png" },
      }),
    ).rejects.toThrow(/did not arrive intact/);
  });

  it("refuses a picture typst cannot print, and saves nothing", async () => {
    // Right signature and header, but cut off before its pixels: before this
    // was checked, it saved, and every paper of the institution failed after.
    const cut = PNG.subarray(0, 40);
    await expect(
      admin.settings.setDocuments({
        header: "Kept out",
        footer: null,
        logo: { base64: cut.toString("base64"), type: "image/png" },
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringMatching(/could not be read/) as unknown,
    });

    // A header claiming 5000 pixels across is refused before typst sees it.
    const wide = Buffer.from(PNG);
    wide.writeUInt32BE(5000, 16);
    await expect(
      admin.settings.setDocuments({
        header: "Kept out",
        footer: null,
        logo: { base64: wide.toString("base64"), type: "image/png" },
      }),
    ).rejects.toThrow(/5000 by 1 pixels/);
    expect(await admin.settings.documents()).toMatchObject({
      header: "",
      logo: null,
    });
  }, 30_000);

  it("refuses a logo over 256 KB", async () => {
    // Just over, which gets past the length of the text and is caught on the
    // bytes, and far over, which never gets that far.
    for (const extra of [256 * 1024 + 1 - PNG.length, 1024 * 1024]) {
      const big = Buffer.concat([PNG, Buffer.alloc(extra)]);
      await expect(
        admin.settings.setDocuments({
          header: "",
          footer: null,
          logo: { base64: big.toString("base64"), type: "image/png" },
        }),
      ).rejects.toThrow(/larger than 256 KB/);
    }
  });

  it("refuses a footer of more than one line, and a header of too many", async () => {
    await expect(
      admin.settings.setDocuments({ header: "", footer: "one\ntwo" }),
    ).rejects.toThrow(/single line/);
    await expect(
      admin.settings.setDocuments({
        header: Array.from({ length: 7 }, (_, i) => `Line ${i}`).join("\n"),
        footer: null,
      }),
    ).rejects.toThrow(/at most 6 lines/);
  });
});

describe("settings.previewDocuments", () => {
  it("typesets a sample paper with the header given, without saving it", async () => {
    await admin.settings.setDocuments({
      header: "Saved header",
      footer: "Saved footer",
      logo: { base64: PNG.toString("base64"), type: "image/png" },
    });
    const { pdfBase64 } = await admin.settings.previewDocuments({
      header: "A header not yet saved\nSecond line",
      footer: null,
    });
    const pdf = Buffer.from(pdfBase64, "base64");
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect((await admin.settings.documents()).header).toBe("Saved header");
  }, 30_000);

  it("prints the logo picked on screen, or none, without saving either", async () => {
    const size = async (
      input: Parameters<typeof admin.settings.previewDocuments>[0],
    ) =>
      Buffer.from(
        (await admin.settings.previewDocuments(input)).pdfBase64,
        "base64",
      ).length;
    const picked = {
      base64: PNG.toString("base64"),
      type: "image/png" as const,
    };

    // Nothing saved: a picked logo makes the sample carry a picture.
    const plain = await size({ header: "Header" });
    expect(await size({ header: "Header", logo: picked })).toBeGreaterThan(
      plain,
    );
    expect((await admin.settings.documents()).logo).toBeNull();

    // A saved logo: a pending removal previews without it.
    await admin.settings.setDocuments({
      header: "Header",
      footer: null,
      logo: picked,
    });
    expect(await size({ header: "Header", logo: null })).toBe(plain);
    expect(await size({ header: "Header" })).toBeGreaterThan(plain);
    expect((await admin.settings.documents()).logo).not.toBeNull();

    // A picked logo is checked as a saved one is.
    await expect(
      admin.settings.previewDocuments({
        logo: {
          base64: PNG.subarray(0, 40).toString("base64"),
          type: "image/png",
        },
      }),
    ).rejects.toThrow(/could not be read/);
  }, 60_000);

  it("uses the saved settings for what is left out", async () => {
    const { pdfBase64 } = await admin.settings.previewDocuments({});
    expect(
      Buffer.from(pdfBase64, "base64").subarray(0, 5).toString("latin1"),
    ).toBe("%PDF-");
  }, 30_000);
});
