import { describe, expect, it } from "vitest";

import { SYSTEM_ROLES } from "./permissions";
import {
  describeClass,
  detailFor,
  perspectivesFor,
  resolvePerspective,
} from "./schedule-views";

const permsFor = (...keys: string[]) =>
  keys.reduce(
    (bits, key) =>
      bits | (SYSTEM_ROLES.find((r) => r.key === key)?.permissions ?? 0n),
    0n,
  );

describe("perspectivesFor", () => {
  it("offers nothing to someone with no profile and no powers", () => {
    expect(
      perspectivesFor({
        hasStudentProfile: false,
        hasFacultyProfile: false,
        permissions: permsFor("student"),
      }),
    ).toEqual([]);
  });

  it("offers a plain student only their own", () => {
    expect(
      perspectivesFor({
        hasStudentProfile: true,
        hasFacultyProfile: false,
        permissions: permsFor("student"),
      }),
    ).toEqual(["student"]);
  });

  it("offers a lecturer who also coordinates both angles", () => {
    expect(
      perspectivesFor({
        hasStudentProfile: false,
        hasFacultyProfile: true,
        permissions: permsFor("faculty", "coordinator"),
      }),
    ).toEqual(["faculty", "coordinator"]);
  });

  it("puts the personal angle first for a student who administers", () => {
    // Which is the case that matters here: the admin is a final-year student.
    expect(
      perspectivesFor({
        hasStudentProfile: true,
        hasFacultyProfile: false,
        permissions: permsFor("student", "admin"),
      }),
    ).toEqual(["student", "coordinator", "admin"]);
  });

  it("does not offer a role somebody merely has the profile shape of", () => {
    // No teaching profile means no faculty view, whatever the permissions say.
    const views = perspectivesFor({
      hasStudentProfile: false,
      hasFacultyProfile: false,
      permissions: permsFor("admin"),
    });
    expect(views).not.toContain("faculty");
    expect(views).not.toContain("student");
  });
});

describe("resolvePerspective", () => {
  it("honours a choice the person is entitled to", () => {
    expect(resolvePerspective(["student", "admin"], "admin")).toBe("admin");
  });

  it("refuses one they are not, falling back to their first", () => {
    // The dropdown cannot be used to look at somebody else's day.
    expect(resolvePerspective(["student"], "faculty")).toBe("student");
  });

  it("has nothing to show when they are entitled to nothing", () => {
    expect(resolvePerspective([], "admin")).toBeNull();
  });
});

describe("detailFor", () => {
  it("shows a student who is teaching, not who is attending", () => {
    expect(detailFor("student")).toMatchObject({
      teaching: true,
      cohort: false,
      scope: "attending",
      modify: false,
    });
  });

  it("shows a lecturer the room rather than themselves", () => {
    expect(detailFor("faculty")).toMatchObject({
      cohort: true,
      teaching: false,
      scope: "teaching",
    });
  });

  it("gives whoever runs the timetable both, and the means to change it", () => {
    for (const view of ["coordinator", "admin"] as const) {
      expect(detailFor(view)).toMatchObject({
        cohort: true,
        teaching: true,
        scope: "both",
        modify: true,
      });
    }
  });
});

describe("describeClass", () => {
  const lecture = {
    facultyName: "Dr. Shilpa Sardesai",
    course: "BCA · Bachelor of Computer Applications",
    cohorts: [{ name: "BCA (VII) - Honours Div. A", batch: "23-27 BCA", size: 36 }],
    headcount: 36,
  };

  it("tells a student what it is and who takes it", () => {
    expect(describeClass(lecture, detailFor("student"))).toEqual([
      "Dr. Shilpa Sardesai",
      "BCA · Bachelor of Computer Applications",
    ]);
  });

  it("tells a lecturer who will be in the room first, and how many", () => {
    expect(describeClass(lecture, detailFor("faculty"))).toEqual([
      "23-27 BCA · BCA (VII) - Honours Div. A · 36 students",
      "BCA · Bachelor of Computer Applications",
    ]);
  });

  it("tells a coordinator both, the room before the lecturer", () => {
    expect(describeClass(lecture, detailFor("coordinator"))).toEqual([
      "23-27 BCA · BCA (VII) - Honours Div. A · 36 students",
      "Dr. Shilpa Sardesai",
      "BCA · Bachelor of Computer Applications",
    ]);
  });

  it("names every cohort of a combined lecture, and adds them up", () => {
    const combined = {
      cohorts: [
        { name: "BCA (VII) - Honours with Research", batch: "23-27 BCA", size: 7 },
        { name: "BBA-IT (VII) - Honours with Research", batch: "23-27 BBA-IT", size: 4 },
      ],
      headcount: 11,
    };
    expect(describeClass(combined, detailFor("faculty"))).toEqual([
      "23-27 BCA BCA (VII) - Honours with Research + 23-27 BBA-IT BBA-IT (VII) - Honours with Research · 11 students",
    ]);
  });

  it("says nothing it does not know", () => {
    expect(describeClass({}, detailFor("coordinator"))).toEqual([]);
    expect(
      describeClass({ facultyName: null, course: null }, detailFor("student")),
    ).toEqual([]);
  });

  it("does not claim a cohort of nobody", () => {
    const empty = { cohorts: [{ name: "BCA (VII) - Minor Courses", batch: null, size: 0 }] };
    expect(describeClass(empty, detailFor("faculty"))).toEqual([
      "BCA (VII) - Minor Courses",
    ]);
  });
});
