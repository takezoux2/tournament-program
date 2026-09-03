import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DivisionSetup } from "../setup-store";
import { buildFromSlots } from "../single-elimination/build";

const runDivisionSetup = vi.fn();

vi.mock("../setup-store", () => ({
  runDivisionSetup: (
    ids: unknown,
    mutate: (tx: unknown, current: DivisionSetup) => Promise<unknown>,
  ) => runDivisionSetup(ids, mutate),
}));

const { reorderEntryInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };

const current: DivisionSetup = {
  entries: {
    version: 1,
    entries: [
      { id: "e1", participantId: "p1", seed: 0 },
      { id: "e2", participantId: "p2", seed: 1 },
    ],
  },
  matchingConfig: buildFromSlots([
    { kind: "entry", entryId: "e1" },
    { kind: "entry", entryId: "e2" },
  ]),
};

const callMutate = async (setup: DivisionSetup) => {
  const mutate = runDivisionSetup.mock.calls[0][1];
  return mutate({}, setup);
};

beforeEach(() => {
  runDivisionSetup.mockReset();
  runDivisionSetup.mockReturnValue(
    Effect.succeed({ found: true, value: { moved: true } }),
  );
});

describe("reorderEntryInDb", () => {
  it("シード順を入れ替える", async () => {
    await Effect.runPromise(
      reorderEntryInDb(ids, { entryId: "e2", direction: "up" }),
    );
    const { next, value } = await callMutate(current);

    expect(value).toEqual({ moved: true });
    expect(
      next.entries.entries.map((entry: { id: string }) => entry.id),
    ).toEqual(["e2", "e1"]);
  });

  it("組み合わせには手を触れない", async () => {
    await Effect.runPromise(
      reorderEntryInDb(ids, { entryId: "e2", direction: "up" }),
    );
    const { next } = await callMutate(current);

    // スロットは entryId を直接持つので、seed を変えても壊れない。
    expect(next.matchingConfig).toBe(current.matchingConfig);
  });

  it("端まで来ていたら書き込まない", async () => {
    await Effect.runPromise(
      reorderEntryInDb(ids, { entryId: "e1", direction: "up" }),
    );
    const { next, value } = await callMutate(current);

    expect(next).toBeNull();
    expect(value).toEqual({ moved: false });
  });
});
