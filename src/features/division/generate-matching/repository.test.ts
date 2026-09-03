import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DivisionSetup } from "../setup-store";

const runDivisionSetup = vi.fn();

vi.mock("../setup-store", () => ({
  runDivisionSetup: (
    ids: unknown,
    mutate: (tx: unknown, current: DivisionSetup) => Promise<unknown>,
  ) => runDivisionSetup(ids, mutate),
}));

const { generateMatchingInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };

const setup = (count: number): DivisionSetup => ({
  entries: {
    version: 1,
    entries: Array.from({ length: count }, (_, index) => ({
      id: `e${index + 1}`,
      participantId: `p${index + 1}`,
      seed: index,
    })),
  },
  matchingConfig: { version: 1, matches: [] },
});

/** runDivisionSetup に渡された mutate を取り出して直接呼ぶ。 */
const callMutate = async (current: DivisionSetup) => {
  const mutate = runDivisionSetup.mock.calls[0][1];
  return mutate({}, current);
};

beforeEach(() => {
  runDivisionSetup.mockReset();
  runDivisionSetup.mockReturnValue(
    Effect.succeed({ found: true, value: null }),
  );
});

describe("generateMatchingInDb", () => {
  it("エントリーのシード順から木を組み立てる", async () => {
    await Effect.runPromise(generateMatchingInDb(ids));
    const { next } = await callMutate(setup(4));

    expect(next.matchingConfig.matches).toHaveLength(3);
    expect(next.matchingConfig.matches[0].slots).toEqual([
      { kind: "entry", entryId: "e1" },
      { kind: "entry", entryId: "e4" },
    ]);
  });

  it("エントリーはそのまま持ち越す", async () => {
    await Effect.runPromise(generateMatchingInDb(ids));
    const current = setup(4);
    const { next } = await callMutate(current);

    expect(next.entries).toBe(current.entries);
  });

  it("2 人未満なら拒否する", async () => {
    await Effect.runPromise(generateMatchingInDb(ids));

    await expect(callMutate(setup(1))).rejects.toMatchObject({
      _tag: "DivisionNotEnoughEntriesError",
    });
  });
});
