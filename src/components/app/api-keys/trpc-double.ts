/**
 * A stand-in for `~/trpc/react`, and the rows the console draws from.
 *
 * Every component on this screen reaches the server through `api.apiKeys.*`,
 * so mounting the real provider would mean a query client, a fetch and a
 * server — which is an integration test, and there is already one of those in
 * `src/server/api/routers/api-keys.integration.test.ts`. What is left for the
 * component tests is the half that file cannot see: what a person is shown,
 * and what they have to do before a credential moves.
 *
 * So the double is deliberately dumb. A mutation writes down what it was asked
 * to do and then calls the caller's own `onSuccess` or `onError` there and
 * then — no retries, no cache, no invalidation — because every behaviour under
 * test is the console's reaction to an answer, never how the answer arrived.
 * The one piece of real machinery it keeps is `reset`, because a console that
 * forgets to call it leaves a plaintext token in the mutation cache, and that
 * is a thing worth failing a test over.
 */

import { vi, type Mock } from "vitest";

import { bitsToScopes } from "~/lib/api-scopes";
import { PermissionFlags } from "~/lib/permissions";
import type { ApiKey, ApiKeyPage } from "./key-dialog";

/** One mutation's behaviour, and its record of what the console asked for. */
export interface MutationDouble {
  /** Every input `mutate` was handed, oldest first. */
  calls: unknown[];
  /** What the server answers with, when it answers at all. */
  result: unknown;
  /** Set this and the mutation fails instead of succeeding. */
  error: { message: string } | null;
  /** Whether the console should be drawing its in-flight state. */
  pending: boolean;
  /** What React Query would use to drop a result from its cache. */
  reset: Mock;
}

interface Handlers {
  onSuccess?: (data: unknown, variables: unknown, context: unknown) => unknown;
  onError?: (error: unknown) => unknown;
}

const newMutation = (): MutationDouble => ({
  calls: [],
  result: undefined,
  error: null,
  pending: false,
  reset: vi.fn(),
});

export const mutations = {
  create: newMutation(),
  update: newMutation(),
  roll: newMutation(),
  revoke: newMutation(),
  delete: newMutation(),
};

/**
 * What `apiKeys.list` answers with, or null to fall back to the seed.
 *
 * Kept as a plain list even though the procedure returns a page: a test setting
 * `queries.keys` is saying what keys exist, and `onePage` below puts them in
 * the envelope on the way out. Paging is not a thing this console does — it
 * asks for one page and the procedure's default holds every key — so making
 * every fixture spell out four counters would buy nothing.
 */
export const queries: {
  keys: ApiKey[] | null;
  usage: { data: unknown; error: { message: string } | null };
} = {
  keys: null,
  usage: { data: undefined, error: null },
};

const onePage = (rows: ApiKey[]): ApiKeyPage => ({
  rows,
  total: rows.length,
  page: 1,
  pageSize: rows.length,
  pageCount: 1,
});

export const invalidateList = vi.fn(async () => undefined);

const mutationHook = (double: MutationDouble) => (handlers?: Handlers) => ({
  mutate: (input: unknown) => {
    double.calls.push(input);
    if (double.error) {
      void handlers?.onError?.(double.error);
      return;
    }
    void handlers?.onSuccess?.(double.result, input, undefined);
  },
  reset: double.reset,
  isPending: double.pending,
});

export const apiDouble = {
  useUtils: () => ({ apiKeys: { list: { invalidate: invalidateList } } }),
  apiKeys: {
    list: {
      useQuery: (
        _input: undefined,
        options?: { initialData?: ApiKeyPage },
      ) => ({
        data: queries.keys
          ? onePage(queries.keys)
          : (options?.initialData ?? onePage([])),
      }),
    },
    usage: { useQuery: (_input: { id: string }) => queries.usage },
    create: { useMutation: mutationHook(mutations.create) },
    update: { useMutation: mutationHook(mutations.update) },
    roll: { useMutation: mutationHook(mutations.roll) },
    revoke: { useMutation: mutationHook(mutations.revoke) },
    delete: { useMutation: mutationHook(mutations.delete) },
  },
};

/** Between tests, so one test's answers cannot become the next one's. */
export function resetTrpcDouble() {
  for (const double of Object.values(mutations)) {
    double.calls.length = 0;
    double.result = undefined;
    double.error = null;
    double.pending = false;
    double.reset.mockClear();
  }
  queries.keys = null;
  queries.usage = { data: undefined, error: null };
  invalidateList.mockClear();
  ids = 0;
}

let ids = 0;

/**
 * A key as `apiKeys.list` serialises one — scopes expanded, secret absent.
 *
 * `scopes` defaults through `bitsToScopes` rather than to a literal array so a
 * fixture cannot claim a combination the server would never produce, such as
 * `ManageAllEvents` without the `ViewAllEvents` it implies.
 */
export function apiKeyFixture(overrides: Partial<ApiKey> = {}): ApiKey {
  ids += 1;
  return {
    id: `ckkey00000000000000000${ids}`,
    name: `Key ${ids}`,
    description: null,
    prefix: `7fa3c${ids}`,
    last4: "9d2b",
    scopes: bitsToScopes(PermissionFlags.ViewAllEvents),
    status: "active",
    createdBy: { id: "ckuser0000000000000001", name: "Ada Rao" },
    createdAt: new Date("2026-01-05T09:00:00.000Z"),
    expiresAt: null,
    revokedAt: null,
    lastUsedAt: null,
    requestCount: 0,
    rateLimitPerMinute: 120,
    ...overrides,
  };
}
