import { describe, expect, it } from "vitest";

import {
  ALL_GRANTABLE_BITS,
  bitsToScopes,
  denyScopeGrant,
  GRANTABLE_SCOPES,
  impliedScopes,
  isScopeName,
  scopeCatalog,
  scopeDenialMessage,
  scopesToBits,
  type ScopeName,
} from "./api-scopes";
import {
  ALL_PERMISSIONS,
  expandPermissions,
  PERMISSION_CATEGORIES,
  PERMISSION_NAMES,
  PermissionFlags as F,
} from "./permissions";

/**
 * What a key may be granted, and by whom.
 *
 * The module under test is thirty lines of set arithmetic, which is exactly why
 * it is worth testing hard: every rule about how much authority an institution
 * can hand to a piece of software it does not control passes through here, and
 * a rule expressed as a filter is a rule that fails silently when somebody
 * inverts it.
 *
 * Three properties carry the weight. `Administrator` is never grantable, so no
 * key inherits the permissions of releases nobody has written yet. Nobody
 * grants what they do not hold, so a key can never be a way around the ceiling
 * of the person who minted it. And what a key can do is reported with the
 * implications applied, so "this key can read the whole timetable" is never a
 * surprise somebody discovers afterwards.
 */

/** A coordinator: real bits, well short of an administrator's. */
const COORDINATOR = F.ManageAllEvents | F.ManageRooms | F.ManageRoles;

describe("the scope vocabulary", () => {
  it("is the permission vocabulary, minus Administrator", () => {
    expect(GRANTABLE_SCOPES).toEqual(
      PERMISSION_NAMES.filter((name) => name !== "Administrator"),
    );
    expect(GRANTABLE_SCOPES).not.toContain("Administrator");
    expect(isScopeName("Administrator")).toBe(false);
    expect(isScopeName("ManageRooms")).toBe(true);
    expect(isScopeName("ManageEverything")).toBe(false);
  });

  it("has a mask that stops just short of every permission", () => {
    expect(ALL_GRANTABLE_BITS & F.Administrator).toBe(0n);
    expect(ALL_GRANTABLE_BITS).toBe(ALL_PERMISSIONS & ~F.Administrator);
  });
});

describe("scopesToBits", () => {
  it("turns names into the bits the app already runs on", () => {
    expect(scopesToBits(["ManageRooms", "ViewUsers"])).toBe(
      F.ManageRooms | F.ViewUsers,
    );
    expect(scopesToBits([])).toBe(0n);
  });

  it("is a set, so a name repeated is a name granted once", () => {
    expect(scopesToBits(["BookRoom", "BookRoom"])).toBe(F.BookRoom);
  });

  /**
   * The failure mode this avoids is a key minted against a build whose scope
   * list has since shrunk. Throwing would take that key offline at the
   * authenticator — every request, not just the one naming the vanished scope —
   * on the strength of a name nobody uses any more.
   */
  it("drops a name it does not recognise rather than throwing", () => {
    expect(() => scopesToBits(["ManageWeather"])).not.toThrow();
    expect(scopesToBits(["ManageWeather"])).toBe(0n);
    expect(scopesToBits(["ManageRooms", "ManageWeather", ""])).toBe(
      F.ManageRooms,
    );
  });

  it("drops Administrator too, so no path to it goes through here", () => {
    expect(scopesToBits(["Administrator"])).toBe(0n);
    expect(scopesToBits(["Administrator", "ViewRooms"])).toBe(F.ViewRooms);
  });
});

describe("bitsToScopes", () => {
  it("reports what the key can do, not what somebody ticked", () => {
    const scopes = bitsToScopes(F.ManageAllEvents);
    // The implication chain in permissions.ts, seen from the other side.
    expect(scopes).toContain("ManageAllEvents");
    expect(scopes).toContain("ViewAllEvents");
    expect(scopes).toContain("ManageOwnEvents");
    expect(scopes).toContain("ViewOwnEvents");
    expect(scopes).not.toContain("ManageRooms");
  });

  it("never names Administrator, even for a row that somehow holds it", () => {
    // Nothing in the app can put this bit on a key. If a hand-written row ever
    // does, the console must still describe it in the vocabulary it offers.
    const scopes = bitsToScopes(F.Administrator);
    expect(scopes).not.toContain("Administrator");
    expect(scopes).toEqual(GRANTABLE_SCOPES);
  });

  it("round-trips a grant, and adds only what the grant implies", () => {
    const granted: ScopeName[] = ["MarkAttendance", "ManageRooms"];
    const effective = bitsToScopes(scopesToBits(granted));

    for (const scope of granted) expect(effective).toContain(scope);
    expect(effective).toEqual(
      GRANTABLE_SCOPES.filter(
        (name) =>
          (expandPermissions(scopesToBits(granted)) & F[name]) === F[name],
      ),
    );
  });

  it("answers nothing for nothing", () => {
    expect(bitsToScopes(0n)).toEqual([]);
  });
});

describe("impliedScopes", () => {
  it("names the boxes the editor should tick but lock", () => {
    const implied = impliedScopes(F.MarkAttendance);
    expect(implied).toContain("ViewAttendance");
    expect(implied).toContain("ViewGroups");
    // The one actually granted is not implied by anything else here.
    expect(implied).not.toContain("MarkAttendance");
  });

  it("is empty for a grant that implies nothing", () => {
    expect(impliedScopes(F.ManageSettings)).toEqual([]);
  });

  it("partitions the effective set with the granted one, exactly", () => {
    const bits = F.ManageSchedulePlans | F.ImportUsers;
    const granted = GRANTABLE_SCOPES.filter(
      (name) => (bits & F[name]) === F[name],
    );
    expect([...granted, ...impliedScopes(bits)].sort()).toEqual(
      [...bitsToScopes(bits)].sort(),
    );
  });
});

describe("denyScopeGrant", () => {
  it("refuses the empty grant", () => {
    // A key that can do nothing is not a credential, it is a secret somebody
    // now has to look after.
    expect(denyScopeGrant([], F.Administrator)).toEqual({ reason: "EMPTY" });
  });

  /**
   * The rule with the longest shadow. `Administrator` means "and everything
   * added in future releases too" — a promise nobody can make on behalf of a
   * third-party integration they will not be maintaining.
   */
  it("refuses Administrator to anybody, including an administrator", () => {
    expect(denyScopeGrant(["Administrator"], F.Administrator)).toEqual({
      reason: "ADMINISTRATOR",
    });
    expect(
      denyScopeGrant(["ViewRooms", "Administrator"], ALL_PERMISSIONS),
    ).toEqual({ reason: "ADMINISTRATOR" });
    // Refused as itself, before "is this a scope at all?" gets a chance to
    // answer — otherwise the message would be the unhelpful one.
    expect(denyScopeGrant(["Administrator"], 0n)).toEqual({
      reason: "ADMINISTRATOR",
    });
  });

  it("lets an administrator grant everything else", () => {
    expect(denyScopeGrant(GRANTABLE_SCOPES, F.Administrator)).toBeNull();
  });

  it("refuses a scope the granter does not hold", () => {
    expect(denyScopeGrant(["ManageSettings"], COORDINATOR)).toEqual({
      reason: "NOT_HELD",
      scope: "ManageSettings",
    });
    // And names the first offender rather than the last, so the message points
    // at a box the person can see.
    expect(
      denyScopeGrant(["ImportUsers", "ManageSettings"], COORDINATOR),
    ).toEqual({ reason: "NOT_HELD", scope: "ImportUsers" });
  });

  it("lets a granter grant what they hold, directly or by implication", () => {
    expect(
      denyScopeGrant(["ManageAllEvents", "ManageRooms"], COORDINATOR),
    ).toBeNull();
    // Held only through ManageAllEvents → ViewAllEvents → ViewOwnEvents, and a
    // granter cannot be asked to tick a box they were never shown.
    expect(denyScopeGrant(["ViewOwnEvents"], COORDINATOR)).toBeNull();
    expect(denyScopeGrant(["ViewRooms"], COORDINATOR)).toBeNull();
  });

  it("refuses a name this build does not know", () => {
    expect(denyScopeGrant(["ManageWeather"], F.Administrator)).toEqual({
      reason: "UNKNOWN_SCOPE",
      scope: "ManageWeather",
    });
  });

  /**
   * The property that matters more than any single case: a key can never end
   * up able to do something the person who minted it could not.
   */
  it("never lets a grant exceed the granter", () => {
    for (const scope of GRANTABLE_SCOPES) {
      const allowed = denyScopeGrant([scope], COORDINATOR) === null;
      const held = (expandPermissions(COORDINATOR) & F[scope]) === F[scope];
      expect(allowed, `${scope} was ${allowed ? "allowed" : "refused"}`).toBe(
        held,
      );
    }
  });

  it("explains every refusal in words a person can act on", () => {
    const denials = [
      denyScopeGrant([], F.Administrator)!,
      denyScopeGrant(["Administrator"], F.Administrator)!,
      denyScopeGrant(["ManageWeather"], F.Administrator)!,
      denyScopeGrant(["ManageSettings"], COORDINATOR)!,
    ];
    for (const denial of denials) {
      const message = scopeDenialMessage(denial);
      expect(message.length).toBeGreaterThan(20);
      expect(message.trim()).toBe(message);
    }
    expect(
      scopeDenialMessage({ reason: "NOT_HELD", scope: "ManageSettings" }),
    ).toContain("ManageSettings");
    expect(
      scopeDenialMessage({ reason: "UNKNOWN_SCOPE", scope: "ManageWeather" }),
    ).toContain("ManageWeather");
  });
});

describe("scopeCatalog", () => {
  it("offers every grantable scope, once, and Administrator never", () => {
    const offered = scopeCatalog().flatMap((group) =>
      group.scopes.map((scope) => scope.name),
    );
    expect(offered).toEqual(GRANTABLE_SCOPES);
    expect(offered).not.toContain("Administrator");
    expect(new Set(offered).size).toBe(offered.length);
  });

  it("groups them in the order the permission editor uses", () => {
    const categories = scopeCatalog().map((group) => group.category);
    expect(categories).toEqual(
      PERMISSION_CATEGORIES.filter((name) => categories.includes(name)),
    );
    expect(new Set(categories).size).toBe(categories.length);
  });

  it("gives every checkbox something to render", () => {
    for (const group of scopeCatalog()) {
      expect(group.scopes.length).toBeGreaterThan(0);
      for (const scope of group.scopes) {
        expect(scope.label.length).toBeGreaterThan(0);
        expect(scope.description.length).toBeGreaterThan(0);
      }
    }
  });
});
