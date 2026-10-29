import { describe, expect, it } from "vitest";

import { NotificationCategory as PrismaCategory } from "../../generated/prisma";
import {
  categoriesFor,
  CATEGORY_META,
  DEFAULT_PREFERENCE,
  NOTIFICATION_CATEGORIES,
} from "./notifications";
import { SYSTEM_ROLES } from "./permissions";

const permissionsOf = (key: string) =>
  SYSTEM_ROLES.find((role) => role.key === key)!.permissions;

const offeredTo = (key: string) =>
  categoriesFor(permissionsOf(key)).map((meta) => meta.category);

describe("the notification categories", () => {
  /** The list is spelled out twice, here and in the schema, so hold them together. */
  it("are exactly the ones the database enum has", () => {
    expect([...NOTIFICATION_CATEGORIES].sort()).toEqual(
      Object.values(PrismaCategory).sort(),
    );
  });

  it("each have a label, a description and an icon", () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      const meta = CATEGORY_META[category];
      expect(meta.category).toBe(category);
      expect(meta.label.trim()).not.toBe("");
      expect(meta.description.trim()).not.toBe("");
      expect(meta.icon).toBeTruthy();
    }
  });

  it("have no em or en dashes in what people read", () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      const { label, description } = CATEGORY_META[category];
      expect(`${label} ${description}`).not.toMatch(/[\u2013\u2014]/);
    }
  });

  it("default to everything on", () => {
    expect(DEFAULT_PREFERENCE).toEqual({ inApp: true, push: true });
  });
});

describe("categoriesFor", () => {
  it("offers a student only changes to their classes", () => {
    expect(offeredTo("student")).toEqual(["CLASS_CHANGES"]);
  });

  it("offers faculty their classes and their requests", () => {
    expect(offeredTo("faculty")).toEqual(["CLASS_CHANGES", "REQUESTS"]);
  });

  it("offers a coordinator all four", () => {
    expect(offeredTo("coordinator")).toEqual([...NOTIFICATION_CATEGORIES]);
  });

  it("offers an admin all four", () => {
    expect(offeredTo("admin")).toEqual([...NOTIFICATION_CATEGORIES]);
  });

  it("offers nothing beyond classes to somebody with no permissions", () => {
    expect(categoriesFor(0n).map((meta) => meta.category)).toEqual([
      "CLASS_CHANGES",
    ]);
  });
});
