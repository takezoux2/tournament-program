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

const { swapSlotsInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };

const entry = (id: string) => ({ kind: "entry" as const, entryId: id });

const current: DivisionSetup = {
  entries: {
    version: 1,
    entries: ["e1", "e2", "e3", "e4"].map((id, index) => ({
      id,
      participantId: `p${index + 1}`,
      seed: index,
    })),
  },
  matchingConfig: buildFromSlots(["e1", "e2", "e3", "e4"].map(entry)),
};

const callMutate = async (setup: DivisionSetup) => {
  const mutate = runDivisionSetup.mock.calls[0][1];
  return mutate({}, setup);
};

beforeEach(() => {
  runDivisionSetup.mockReset();
  runDivisionSetup.mockReturnValue(
    Effect.succeed({ found: true, value: { swapped: true } }),
  );
});

describe("swapSlotsInDb", () => {
  it("指定した 2 スロットを入れ替えて木を組み立て直す", async () => {
    await Effect.runPromise(swapSlotsInDb(ids, { indexA: 0, indexB: 3 }));
    const { next, value } = await callMutate(current);

    expect(value).toEqual({ swapped: true });
    expect(next.matchingConfig.matches[0].slots).toEqual([
      entry("e4"),
      entry("e2"),
    ]);
    expect(next.matchingConfig.matches[1].slots).toEqual([
      entry("e3"),
      entry("e1"),
    ]);
  });

  it("エントリーには手を触れない", async () => {
    await Effect.runPromise(swapSlotsInDb(ids, { indexA: 0, indexB: 1 }));
    const { next } = await callMutate(current);

    expect(next.entries).toBe(current.entries);
  });

  it("範囲外の添字なら書き込まない", async () => {
    await Effect.runPromise(swapSlotsInDb(ids, { indexA: 0, indexB: 99 }));
    const { next, value } = await callMutate(current);

    expect(next).toBeNull();
    expect(value).toEqual({ swapped: false });
  });

  it("同じ添字なら書き込まない", async () => {
    await Effect.runPromise(swapSlotsInDb(ids, { indexA: 2, indexB: 2 }));
    const { next, value } = await callMutate(current);

    expect(next).toBeNull();
    expect(value).toEqual({ swapped: false });
  });
});
