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

const { removeEntryInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };

const entry = (id: string) => ({ kind: "entry" as const, entryId: id });

const withEntries = (count: number): DivisionSetup["entries"] => ({
  version: 1,
  entries: Array.from({ length: count }, (_, index) => ({
    id: `e${index + 1}`,
    participantId: `p${index + 1}`,
    seed: index,
  })),
});

const callMutate = async (current: DivisionSetup) => {
  const mutate = runDivisionSetup.mock.calls[0][1];
  return mutate({}, current);
};

beforeEach(() => {
  runDivisionSetup.mockReset();
  runDivisionSetup.mockReturnValue(
    Effect.succeed({ found: true, value: { regenerated: false } }),
  );
});

describe("removeEntryInDb", () => {
  it("エントリーを外して seed を 0 から詰め直す", async () => {
    await Effect.runPromise(removeEntryInDb(ids, { entryId: "e2" }));
    const { next } = await callMutate({
      entries: withEntries(4),
      matchingConfig: { version: 1, matches: [] },
    });

    expect(next.entries.entries.map((item: { id: string }) => item.id)).toEqual(
      ["e1", "e3", "e4"],
    );
    expect(
      next.entries.entries.map((item: { seed: number }) => item.seed),
    ).toEqual([0, 1, 2]);
  });

  it("組み合わせがあれば残りのシード順から作り直す", async () => {
    await Effect.runPromise(removeEntryInDb(ids, { entryId: "e2" }));
    const { next, value } = await callMutate({
      entries: withEntries(4),
      matchingConfig: buildFromSlots(["e1", "e2", "e3", "e4"].map(entry)),
    });

    expect(value).toEqual({ regenerated: true });
    // 残り 3 人なので 4 枠に bye が 1 つ入る形へ作り直される。
    expect(next.matchingConfig.matches[0].slots).toEqual([
      entry("e1"),
      { kind: "bye" },
    ]);
  });

  it("残りが 2 人未満になったら組み合わせを空にする", async () => {
    await Effect.runPromise(removeEntryInDb(ids, { entryId: "e2" }));
    const { next } = await callMutate({
      entries: withEntries(2),
      matchingConfig: buildFromSlots(["e1", "e2"].map(entry)),
    });

    expect(next.matchingConfig.matches).toEqual([]);
  });

  it("組み合わせが未作成なら再生成しない", async () => {
    await Effect.runPromise(removeEntryInDb(ids, { entryId: "e2" }));
    const { value } = await callMutate({
      entries: withEntries(4),
      matchingConfig: { version: 1, matches: [] },
    });

    expect(value).toEqual({ regenerated: false });
  });

  it("知らない entryId なら何も書き込まない", async () => {
    await Effect.runPromise(removeEntryInDb(ids, { entryId: "unknown" }));
    const { next, value } = await callMutate({
      entries: withEntries(4),
      matchingConfig: { version: 1, matches: [] },
    });

    // 存在を漏らさないため、無い対象の削除はエラーにせず黙って何もしない。
    expect(next).toBeNull();
    expect(value).toEqual({ regenerated: false });
  });
});
