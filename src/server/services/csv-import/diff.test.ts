import { describe, expect, it } from "vitest";

import { diffRows, type ExistingUser } from "./diff";
import { matchColumn, splitList } from "./schema";

const DOMAIN = "sicsr.ac.in";

const record = (line: number, values: Record<string, string | undefined>) => ({
  line,
  values,
});

const base = {
  domain: DOMAIN,
  existing: [] as ExistingUser[],
  knownRoleKeys: ["student", "faculty", "coordinator", "admin"],
  knownGroupNames: ["BCA-A", "BCA-B"],
  assignableRoleKeys: ["student", "faculty", "coordinator", "admin"],
};

const user = (over: Partial<ExistingUser> = {}): ExistingUser => ({
  id: "u1",
  email: "aanya@sicsr.ac.in",
  name: "Aanya Sharma",
  prn: "22030122001",
  hasSignedIn: false,
  roleKeys: ["student"],
  groupNames: [],
  ...over,
});

describe("column matching", () => {
  it("recognises the spellings a registry export uses", () => {
    expect(matchColumn("Full Name")).toBe("name");
    expect(matchColumn("PRN No")).toBe("prn");
    expect(matchColumn("Email Address")).toBe("email");
    expect(matchColumn("Division")).toBe("groups");
    expect(matchColumn("roll_no")).toBe("prn");
  });

  it("ignores columns it does not use", () => {
    expect(matchColumn("Phone")).toBeNull();
  });
});

describe("splitList", () => {
  it("splits on pipes, commas and semicolons", () => {
    expect(splitList("BCA-A | BCA-B")).toEqual(["BCA-A", "BCA-B"]);
    expect(splitList("a,b;c")).toEqual(["a", "b", "c"]);
  });

  it("returns an empty list for blank input", () => {
    expect(splitList(undefined)).toEqual([]);
    expect(splitList("  ")).toEqual([]);
  });
});

describe("diffRows", () => {
  it("plans a create for someone new", () => {
    const result = diffRows({
      ...base,
      records: [
        record(2, {
          name: "New Person",
          email: "new@sicsr.ac.in",
          prn: "22030122099",
        }),
      ],
    });
    expect(result.summary).toMatchObject({ create: 1, error: 0 });
    expect(result.rows[0]!.data.roles).toEqual(["student"]);
  });

  it("defaults to the student role when none is given", () => {
    const result = diffRows({
      ...base,
      records: [record(2, { name: "A", email: "a@sicsr.ac.in" })],
    });
    expect(result.rows[0]!.data.roles).toEqual(["student"]);
  });

  it("accepts several roles in one cell", () => {
    const result = diffRows({
      ...base,
      records: [
        record(2, {
          name: "A",
          email: "a@sicsr.ac.in",
          roles: "faculty | coordinator",
        }),
      ],
    });
    expect(result.rows[0]!.data.roles).toEqual(["faculty", "coordinator"]);
    expect(result.rows[0]!.status).toBe("create");
  });

  it("rejects an address outside the institution's domain", () => {
    const result = diffRows({
      ...base,
      records: [record(2, { name: "A", email: "a@gmail.com" })],
    });
    expect(result.rows[0]!.status).toBe("error");
    expect(result.rows[0]!.errors[0]).toMatch(/@sicsr\.ac\.in/);
  });

  it("rejects a malformed PRN", () => {
    const result = diffRows({
      ...base,
      records: [record(2, { name: "A", email: "a@sicsr.ac.in", prn: "123" })],
    });
    expect(result.rows[0]!.status).toBe("error");
    expect(result.rows[0]!.errors[0]).toMatch(/11 digits/);
  });

  it("treats a blank PRN as absent rather than invalid", () => {
    const result = diffRows({
      ...base,
      records: [record(2, { name: "A", email: "a@sicsr.ac.in", prn: "" })],
    });
    expect(result.rows[0]!.status).toBe("create");
    expect(result.rows[0]!.data.prn).toBeNull();
  });

  it("flags a duplicate email on the later line only", () => {
    const result = diffRows({
      ...base,
      records: [
        record(2, { name: "A", email: "a@sicsr.ac.in" }),
        record(3, { name: "A again", email: "a@sicsr.ac.in" }),
      ],
    });
    expect(result.rows[0]!.status).toBe("create");
    expect(result.rows[1]!.status).toBe("error");
    expect(result.rows[1]!.errors[0]).toMatch(/line 2/);
  });

  it("flags a duplicate PRN inside the file", () => {
    const result = diffRows({
      ...base,
      records: [
        record(2, { name: "A", email: "a@sicsr.ac.in", prn: "22030122001" }),
        record(3, { name: "B", email: "b@sicsr.ac.in", prn: "22030122001" }),
      ],
    });
    expect(result.rows[1]!.errors[0]).toMatch(/same PRN/);
  });

  it("updates an existing person matched by email", () => {
    const result = diffRows({
      ...base,
      existing: [user({ name: "Old Name" })],
      records: [
        record(2, {
          name: "Aanya Sharma",
          email: "aanya@sicsr.ac.in",
          prn: "22030122001",
        }),
      ],
    });
    expect(result.rows[0]!.status).toBe("update");
    expect(result.rows[0]!.matchedUserId).toBe("u1");
    expect(result.rows[0]!.changes[0]).toMatch(/name: Old Name/);
  });

  it("skips a row that matches the database exactly", () => {
    const result = diffRows({
      ...base,
      existing: [user()],
      records: [
        record(2, {
          name: "Aanya Sharma",
          email: "aanya@sicsr.ac.in",
          prn: "22030122001",
          roles: "student",
        }),
      ],
    });
    expect(result.rows[0]!.status).toBe("skip");
    expect(result.rows[0]!.changes).toEqual([]);
  });

  it("corrects the email of a PRN match who has never signed in", () => {
    const result = diffRows({
      ...base,
      existing: [user({ email: "typo@sicsr.ac.in", hasSignedIn: false })],
      records: [
        record(2, {
          name: "Aanya Sharma",
          email: "aanya@sicsr.ac.in",
          prn: "22030122001",
        }),
      ],
    });
    expect(result.rows[0]!.status).toBe("update");
    expect(result.rows[0]!.changes.join(" ")).toMatch(/email: typo/);
  });

  it("refuses to change the email of someone who has signed in", () => {
    // Their account is live; silently repointing it is not an import's call.
    const result = diffRows({
      ...base,
      existing: [user({ email: "real@sicsr.ac.in", hasSignedIn: true })],
      records: [
        record(2, {
          name: "Aanya Sharma",
          email: "different@sicsr.ac.in",
          prn: "22030122001",
        }),
      ],
    });
    expect(result.rows[0]!.status).toBe("error");
    expect(result.rows[0]!.errors[0]).toMatch(/already signed in/);
  });

  it("errors when the email and PRN point at different people", () => {
    const result = diffRows({
      ...base,
      existing: [
        user({ id: "u1", email: "one@sicsr.ac.in", prn: "11111111111" }),
        user({ id: "u2", email: "two@sicsr.ac.in", prn: "22222222222" }),
      ],
      records: [
        record(2, {
          name: "Confused",
          email: "one@sicsr.ac.in",
          prn: "22222222222",
        }),
      ],
    });
    expect(result.rows[0]!.status).toBe("error");
    expect(result.rows[0]!.errors[0]).toMatch(/PRN belongs to/);
  });

  it("reports groups that would have to be created", () => {
    const result = diffRows({
      ...base,
      records: [
        record(2, {
          name: "A",
          email: "a@sicsr.ac.in",
          groups: "BCA-A | BCA-Z",
        }),
      ],
    });
    expect(result.newGroups).toEqual(["BCA-Z"]);
  });

  it("rejects a role the importer is not allowed to hand out", () => {
    const result = diffRows({
      ...base,
      assignableRoleKeys: ["student"],
      records: [
        record(2, { name: "A", email: "a@sicsr.ac.in", roles: "admin" }),
      ],
    });
    expect(result.rows[0]!.status).toBe("error");
    expect(result.rows[0]!.errors[0]).toMatch(/cannot assign/);
  });

  it("reports an unrecognised role", () => {
    const result = diffRows({
      ...base,
      records: [
        record(2, { name: "A", email: "a@sicsr.ac.in", roles: "wizard" }),
      ],
    });
    expect(result.rows[0]!.status).toBe("error");
    expect(result.unknownRoles).toContain("wizard");
  });

  it("counts each outcome in the summary", () => {
    const result = diffRows({
      ...base,
      existing: [user()],
      records: [
        record(2, {
          name: "Aanya Sharma",
          email: "aanya@sicsr.ac.in",
          prn: "22030122001",
        }),
        record(3, { name: "New", email: "new@sicsr.ac.in" }),
        record(4, { name: "Bad", email: "nope@gmail.com" }),
      ],
    });
    expect(result.summary).toEqual({ create: 1, update: 0, skip: 1, error: 1 });
  });
});
