"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button, IconButton } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { Dialog } from "~/components/ui/dialog";
import { EmptyState } from "~/components/ui/empty-state";
import {
  EntityPicker,
  type PickerOption,
  type PickerPage,
} from "~/components/ui/entity-picker";
import { Field, Input } from "~/components/ui/field";
import { Segmented } from "~/components/ui/segmented";
import { Skeleton } from "~/components/ui/skeleton";
import { errorMessage } from "~/lib/error-message";
import { api, type RouterOutputs } from "~/trpc/react";

import { type AssignmentDetailData } from "./sitting-card";

type Student = RouterOutputs["assignments"]["groupStudents"][number];

interface DraftTeam {
  /** Local key, stable while editing. */
  key: string;
  /** The saved team's id, so it keeps its slot. */
  id?: string;
  name: string;
  topic: string;
  studentIds: string[];
}

/** The server's limits on a presentation's teams, checked here first. */
const MAX_TEAMS = 60;
const MAX_PER_TEAM = 50;

let counter = 0;
const nextKey = () => `new-${++counter}`;

const fromDetail = (teams: AssignmentDetailData["teams"]): DraftTeam[] =>
  teams.map((t) => ({
    key: t.id,
    id: t.id,
    name: t.name,
    topic: t.topic ?? "",
    studentIds: t.members.map((m) => m.studentId),
  }));

/** Splits `items` into `n` runs whose lengths differ by at most one. */
function chunk<T>(items: T[], n: number): T[][] {
  const out: T[][] = Array.from({ length: n }, () => []);
  const base = Math.floor(items.length / n);
  const extra = items.length % n;
  let at = 0;
  for (let i = 0; i < n; i++) {
    const size = base + (i < extra ? 1 : 0);
    out[i] = items.slice(at, at + size);
    at += size;
  }
  return out;
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const toOption = (s: Student): PickerOption => ({
  id: s.studentId,
  label: s.name,
  hint: s.prn,
});

/**
 * A presentation's teams, edited as a whole and saved in one go. The server
 * checks that everybody is in the group and in one team only, and its message
 * is shown as it comes.
 */
export function TeamsEditor({ detail }: { detail: AssignmentDetailData }) {
  const students = api.assignments.groupStudents.useQuery({ id: detail.id });

  if (students.isLoading) {
    return (
      <Card title="Teams">
        <div role="status" aria-label="Loading the group's students">
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        </div>
      </Card>
    );
  }

  if (students.error || !students.data) {
    return (
      <Card title="Teams">
        <Callout
          tone="bad"
          action={
            <Button size="sm" onClick={() => void students.refetch()}>
              Try again
            </Button>
          }
        >
          The group&apos;s students could not be loaded.{" "}
          {errorMessage(students.error, "")}
        </Callout>
      </Card>
    );
  }

  return (
    <TeamsForm
      // A fresh form whenever the saved teams change, so a save lands cleanly.
      key={detail.teams
        .map((t) => `${t.id}:${t.name}:${t.members.length}`)
        .join("|")}
      detail={detail}
      students={students.data}
    />
  );
}

function TeamsForm({
  detail,
  students,
}: {
  detail: AssignmentDetailData;
  students: Student[];
}) {
  const utils = api.useUtils();
  const [teams, setTeams] = useState<DraftTeam[]>(() =>
    fromDetail(detail.teams),
  );
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);

  const byId = useMemo(
    () => new Map(students.map((s) => [s.studentId, s])),
    [students],
  );
  const teamOf = useMemo(() => {
    const map = new Map<string, DraftTeam>();
    for (const t of teams) for (const s of t.studentIds) map.set(s, t);
    return map;
  }, [teams]);
  const unassigned = students.filter((s) => !teamOf.has(s.studentId));

  const change = (next: DraftTeam[]) => {
    setTeams(next);
    setDirty(true);
    setError(null);
  };
  const patch = (key: string, part: Partial<DraftTeam>) =>
    change(teams.map((t) => (t.key === key ? { ...t, ...part } : t)));

  const save = api.assignments.saveTeams.useMutation({
    onSuccess: async () => {
      toast.success("Teams saved.");
      setDirty(false);
      // A team dropped takes its slot with it, which the timetable shows.
      await Promise.all([
        utils.assignments.byId.invalidate({ id: detail.id }),
        utils.assignments.list.invalidate(),
        utils.assignments.sittingsFor.invalidate(),
        utils.timetable.invalidate(),
      ]);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const submit = () => {
    const unnamed = teams.findIndex((t) => !t.name.trim());
    if (unnamed >= 0) {
      setError(`Team ${unnamed + 1} needs a name.`);
      return;
    }
    if (teams.length > MAX_TEAMS) {
      setError(
        `A presentation can have at most ${MAX_TEAMS} teams. Remove ${teams.length - MAX_TEAMS}.`,
      );
      return;
    }
    const crowded = teams.find((t) => t.studentIds.length > MAX_PER_TEAM);
    if (crowded) {
      setError(
        `${crowded.name.trim()} has ${crowded.studentIds.length} students. A team can have at most ${MAX_PER_TEAM}.`,
      );
      return;
    }
    save.mutate({
      id: detail.id,
      teams: teams.map((t) => ({
        ...(t.id ? { id: t.id } : {}),
        name: t.name.trim(),
        topic: t.topic.trim() || undefined,
        studentIds: t.studentIds,
      })),
    });
  };

  const addTeam = () =>
    change([
      ...teams,
      {
        key: nextKey(),
        name: `Team ${teams.length + 1}`,
        topic: "",
        studentIds: [],
      },
    ]);

  const split = (count: number, order: "alpha" | "random") => {
    const pool =
      order === "alpha"
        ? [...unassigned].sort((a, b) => a.name.localeCompare(b.name))
        : shuffle(unassigned);
    const groups = chunk(pool, count);
    change([
      ...teams,
      ...groups.map((g, i) => ({
        key: nextKey(),
        name: `Team ${teams.length + i + 1}`,
        topic: "",
        studentIds: g.map((s) => s.studentId),
      })),
    ]);
    setSplitOpen(false);
  };

  return (
    <Card
      title="Teams"
      action={
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon="users"
            disabled={unassigned.length === 0}
            onClick={() => setSplitOpen(true)}
          >
            Split into teams
          </Button>
          <Button size="sm" variant="secondary" icon="plus" onClick={addTeam}>
            Add a team
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-muted text-sm">
          <span className="font-mono tabular-nums">
            {students.length - unassigned.length}
          </span>{" "}
          of <span className="font-mono tabular-nums">{students.length}</span>{" "}
          students are in a team.
          {unassigned.length > 0 &&
            ` ${unassigned.length} ${unassigned.length === 1 ? "is" : "are"} not in one yet.`}
        </p>

        {students.length === 0 ? (
          <EmptyState compact icon="users" title="No students in this group">
            Teams are made from the group&apos;s students. Once students join{" "}
            {detail.group.label}, they can be put in teams here.
          </EmptyState>
        ) : teams.length === 0 ? (
          <EmptyState
            compact
            icon="users"
            title="No teams yet"
            action={
              <Button
                variant="secondary"
                icon="users"
                onClick={() => setSplitOpen(true)}
              >
                Split into teams
              </Button>
            }
          >
            Split the group into teams, or add them one at a time.
          </EmptyState>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {teams.map((team, index) => (
              <TeamCard
                key={team.key}
                team={team}
                index={index}
                students={students}
                byId={byId}
                teamOf={teamOf}
                onChange={(part) => patch(team.key, part)}
                onRemove={() => change(teams.filter((t) => t.key !== team.key))}
              />
            ))}
          </div>
        )}

        {error && (
          <Callout tone="bad" role="alert">
            {error}
          </Callout>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          {dirty && (
            <span className="text-faint text-xs">
              Unsaved changes. Slots can be booked for saved teams only.
            </span>
          )}
          {dirty && (
            <Button
              variant="ghost"
              onClick={() => {
                setTeams(fromDetail(detail.teams));
                setDirty(false);
                setError(null);
              }}
            >
              Undo changes
            </Button>
          )}
          <Button
            variant="primary"
            disabled={!dirty || save.isPending}
            onClick={submit}
          >
            {save.isPending ? "Saving..." : "Save teams"}
          </Button>
        </div>
      </div>

      {splitOpen && (
        <SplitDialog
          available={unassigned.length}
          existing={teams.length}
          onClose={() => setSplitOpen(false)}
          onSplit={split}
        />
      )}
    </Card>
  );
}

function TeamCard({
  team,
  index,
  students,
  byId,
  teamOf,
  onChange,
  onRemove,
}: {
  team: DraftTeam;
  index: number;
  students: Student[];
  byId: Map<string, Student>;
  teamOf: Map<string, DraftTeam>;
  onChange: (part: Partial<DraftTeam>) => void;
  onRemove: () => void;
}) {
  const [query, setQuery] = useState("");

  const page: PickerPage = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = students
      .filter(
        (s) =>
          !q ||
          s.name.toLowerCase().includes(q) ||
          (s.prn ?? "").toLowerCase().includes(q),
      )
      .map((s) => {
        const other = teamOf.get(s.studentId);
        const elsewhere = other && other.key !== team.key;
        return {
          ...toOption(s),
          hint: elsewhere
            ? `In ${other.name || "another team"}`
            : (s.prn ?? null),
          disabled: !!elsewhere,
        };
      });
    return { rows, total: rows.length, hasMore: false };
  }, [query, students, teamOf, team.key]);

  const selected = team.studentIds
    .map((id) => byId.get(id))
    .filter((s): s is Student => !!s)
    .map(toOption);

  return (
    <div className="bg-paper flex flex-col gap-3 rounded-[12px] p-3 shadow-[inset_0_0_0_1px_var(--hair)]">
      <div className="flex items-start gap-2">
        <Field label="Team name" className="flex-1">
          {(id) => (
            <Input
              id={id}
              value={team.name}
              maxLength={80}
              invalid={!team.name.trim()}
              onChange={(e) => onChange({ name: e.target.value })}
            />
          )}
        </Field>
        <IconButton
          icon="trash"
          variant="danger"
          label={`Remove ${team.name || `team ${index + 1}`}`}
          onClick={onRemove}
          className="mt-6"
        />
      </div>
      <Field label="Topic" optional>
        {(id) => (
          <Input
            id={id}
            value={team.topic}
            maxLength={200}
            onChange={(e) => onChange({ topic: e.target.value })}
          />
        )}
      </Field>
      <Field
        label={
          <>
            Members{" "}
            <span className="text-faint font-mono font-normal tabular-nums">
              {team.studentIds.length}
            </span>
          </>
        }
      >
        {(id) => (
          <EntityPicker
            id={id}
            selected={selected}
            onChange={(ids) => onChange({ studentIds: ids })}
            page={page}
            query={query}
            onQueryChange={setQuery}
            placeholder="Search by name or PRN"
            emptyLabel="Nobody in this team yet"
          />
        )}
      </Field>
    </div>
  );
}

function SplitDialog({
  available,
  existing,
  onClose,
  onSplit,
}: {
  available: number;
  /** Teams there already, which count towards the limit on teams. */
  existing: number;
  onClose: () => void;
  onSplit: (count: number, order: "alpha" | "random") => void;
}) {
  // Enough teams that none has more than the server allows, and no more than
  // there are students or than the limit on teams leaves room for.
  const fewest = Math.max(1, Math.ceil(available / MAX_PER_TEAM));
  const most = Math.min(available, MAX_TEAMS - existing);
  const [raw, setRaw] = useState(() =>
    String(Math.min(Math.max(4, fewest), Math.max(1, most))),
  );
  const [order, setOrder] = useState<"alpha" | "random">("alpha");
  const count = Number(raw);
  const possible = fewest <= most;
  const valid =
    possible && Number.isInteger(count) && count >= fewest && count <= most;
  const per = valid ? Math.ceil(available / count) : 0;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Split into teams"
      subtitle={`${available} ${available === 1 ? "student is" : "students are"} not in a team yet.`}
      icon="users"
      width={440}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() => onSplit(count, order)}
          >
            Make {valid ? count : ""} {count === 1 ? "team" : "teams"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Number of teams"
          hint={
            valid
              ? `About ${per} ${per === 1 ? "student" : "students"} in each.`
              : undefined
          }
          error={
            valid
              ? undefined
              : possible
                ? `Give a number from ${fewest} to ${most}. A team can have at most ${MAX_PER_TEAM} students, and a presentation at most ${MAX_TEAMS} teams.`
                : `There is room for ${Math.max(0, most)} more ${most === 1 ? "team" : "teams"}, too few for ${available} students at ${MAX_PER_TEAM} a team. Add students to the teams there are instead.`
          }
        >
          {(id) => (
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={fewest}
              max={Math.max(fewest, most)}
              value={raw}
              invalid={!valid}
              onChange={(e) => setRaw(e.target.value)}
            />
          )}
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-title text-xs font-semibold">Order</span>
          <Segmented
            ariaLabel="Order"
            items={[
              { value: "alpha", label: "Alphabetical" },
              { value: "random", label: "Random" },
            ]}
            value={order}
            onChange={setOrder}
          />
        </div>
        <p className="text-muted text-sm">
          Only students not yet in a team are placed. The teams are not saved
          until you choose Save teams.
        </p>
      </div>
    </Dialog>
  );
}
