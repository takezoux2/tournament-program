import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DivisionSetup } from "../setup-store";
import { buildFromSlots } from "../single-elimination/build";

const runDivisionSetup = vi.fn();
const memberFindFirst = vi.fn();
const memberCreate = vi.fn();
const participantFindFirst = vi.fn();
const participantCreate = vi.fn();

vi.mock("../setup-store", () => ({
  runDivisionSetup: (
    ids: unknown,
    mutate: (tx: unknown, current: DivisionSetup) => Promise<unknown>,
  ) => runDivisionSetup(ids, mutate),
}));

const { addEntryInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };

const tx = {
  member: {
    findFirst: (args: unknown) => memberFindFirst(args),
    create: (args: unknown) => memberCreate(args),
  },
  participant: {
    findFirst: (args: unknown) => participantFindFirst(args),
    create: (args: unknown) => participantCreate(args),
  },
};

const empty: DivisionSetup = {
  entries: { version: 1, entries: [] },
  matchingConfig: { version: 1, matches: [] },
};

const callMutate = async (current: DivisionSetup) => {
  const mutate = runDivisionSetup.mock.calls[0][1];
  return mutate(tx, current);
};

beforeEach(() => {
  runDivisionSetup.mockReset();
  memberFindFirst.mockReset();
  memberCreate.mockReset();
  participantFindFirst.mockReset();
  participantCreate.mockReset();
  runDivisionSetup.mockReturnValue(
    Effect.succeed({ found: true, value: null }),
  );
  participantFindFirst.mockResolvedValue(null);
  participantCreate.mockResolvedValue({ id: "p1" });
});

describe("addEntryInDb", () => {
  it("既存メンバーは組織を条件に入れて引く", async () => {
    memberFindFirst.mockResolvedValue({ id: "m1" });

    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );
    await callMutate(empty);

    expect(memberFindFirst).toHaveBeenCalledWith({
      where: { id: "m1", organizationId: "o1" },
      select: { id: true },
    });
  });

  it("組織に無いメンバーを指定したら拒否する", async () => {
    memberFindFirst.mockResolvedValue(null);

    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    await expect(callMutate(empty)).rejects.toMatchObject({
      _tag: "DivisionMemberNotFoundError",
    });
  });

  it("新規登録なら Member を作る", async () => {
    memberCreate.mockResolvedValue({ id: "m9" });

    await Effect.runPromise(
      addEntryInDb(ids, {
        mode: "new",
        name: "山田太郎",
        nameKana: "やまだたろう",
      }),
    );
    await callMutate(empty);

    expect(memberCreate).toHaveBeenCalledWith({
      data: {
        organizationId: "o1",
        name: "山田太郎",
        nameKana: "やまだたろう",
      },
      select: { id: true },
    });
  });

  it("Participant が無ければ seed を付けずに作る", async () => {
    memberFindFirst.mockResolvedValue({ id: "m1" });

    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );
    await callMutate(empty);

    // Participant.seed は @@unique([tournamentId, seed]) を持つ。自動採番すると
    // 衝突するので null のままにし、部門内の順序は DivisionEntry.seed が持つ。
    expect(participantCreate).toHaveBeenCalledWith({
      data: { tournamentId: "t1", memberId: "m1" },
      select: { id: true },
    });
  });

  it("Participant が既にあれば作らず使い回す", async () => {
    memberFindFirst.mockResolvedValue({ id: "m1" });
    participantFindFirst.mockResolvedValue({ id: "p7" });

    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );
    const { next } = await callMutate(empty);

    expect(participantCreate).not.toHaveBeenCalled();
    expect(next.entries.entries[0].participantId).toBe("p7");
  });

  it("エントリーを末尾の seed で足す", async () => {
    memberFindFirst.mockResolvedValue({ id: "m1" });
    participantCreate.mockResolvedValue({ id: "p3" });

    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );
    const { next } = await callMutate({
      ...empty,
      entries: {
        version: 1,
        entries: [
          { id: "e1", participantId: "p1", seed: 0 },
          { id: "e2", participantId: "p2", seed: 1 },
        ],
      },
    });

    expect(next.entries.entries).toHaveLength(3);
    expect(next.entries.entries[2].seed).toBe(2);
    expect(next.entries.entries[2].participantId).toBe("p3");
  });

  it("組み合わせがあれば一番下の bye を埋める", async () => {
    memberFindFirst.mockResolvedValue({ id: "m1" });
    participantCreate.mockResolvedValue({ id: "p3" });

    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );
    const { next } = await callMutate({
      entries: {
        version: 1,
        entries: [
          { id: "e1", participantId: "p1", seed: 0 },
          { id: "e2", participantId: "p2", seed: 1 },
        ],
      },
      matchingConfig: buildFromSlots([
        { kind: "entry", entryId: "e1" },
        { kind: "bye" },
        { kind: "entry", entryId: "e2" },
        { kind: "bye" },
      ]),
    });

    const added = next.entries.entries[2].id;
    expect(next.matchingConfig.matches[1].slots[1]).toEqual({
      kind: "entry",
      entryId: added,
    });
  });

  it("組み合わせが未作成なら組み合わせは空のまま", async () => {
    memberFindFirst.mockResolvedValue({ id: "m1" });

    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );
    const { next } = await callMutate(empty);

    expect(next.matchingConfig.matches).toEqual([]);
  });

  it("同じ参加者の二重エントリーを拒否する", async () => {
    memberFindFirst.mockResolvedValue({ id: "m1" });
    participantFindFirst.mockResolvedValue({ id: "p1" });

    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    await expect(
      callMutate({
        ...empty,
        entries: {
          version: 1,
          entries: [{ id: "e1", participantId: "p1", seed: 0 }],
        },
      }),
    ).rejects.toMatchObject({ _tag: "DivisionDuplicateEntryError" });
  });

  it("上限に達していたら拒否する", async () => {
    memberFindFirst.mockResolvedValue({ id: "m1" });

    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    await expect(
      callMutate({
        ...empty,
        entries: {
          version: 1,
          entries: Array.from({ length: 128 }, (_, index) => ({
            id: `e${index}`,
            participantId: `p${index}`,
            seed: index,
          })),
        },
      }),
    ).rejects.toMatchObject({ _tag: "DivisionEntryLimitError" });
  });
});
