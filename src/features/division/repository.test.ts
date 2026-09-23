import { beforeEach, describe, expect, it, vi } from "vitest";
import { overallSeqKey } from "@/lib/division/overall-order";

const findMany = vi.fn();
const findFirst = vi.fn();
const participantFindMany = vi.fn();
const scheduleItemFindMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    division: {
      findMany: (args: unknown) => findMany(args),
      findFirst: (args: unknown) => findFirst(args),
    },
    participant: {
      findMany: (args: unknown) => participantFindMany(args),
    },
    scheduleItem: {
      findMany: (args: unknown) => scheduleItemFindMany(args),
    },
  },
}));

const {
  findDivisionInTournament,
  listDivisionDetailsInTournament,
  listDivisionsInTournament,
  listOverallOrderSources,
  listParticipantsInTournament,
  loadEntrySourceContext,
} = await import("./repository");

beforeEach(() => {
  findMany.mockReset();
  findFirst.mockReset();
  participantFindMany.mockReset();
  scheduleItemFindMany.mockReset();
});

describe("listDivisionsInTournament", () => {
  it("組織と大会の両方を where に入れ、order 昇順で引く", async () => {
    findMany.mockResolvedValue([]);

    await listDivisionsInTournament("o1", "t1");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournament: { id: "t1", organizationId: "o1" } },
        orderBy: { order: "asc" },
      }),
    );
  });
});

describe("findDivisionInTournament", () => {
  // 所有権を where から外して「引いてから弾く」形に後退すると、
  // 弾き忘れた経路がそのまま越境アクセスの穴になる。
  it("組織・大会・部門の 3 つを where に入れる", async () => {
    findFirst.mockResolvedValue(null);

    await findDivisionInTournament("o1", "t1", "d1");

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d1", tournament: { id: "t1", organizationId: "o1" } },
      }),
    );
  });

  it("Json 3 列と作成日時も select する", async () => {
    findFirst.mockResolvedValue(null);

    await findDivisionInTournament("o1", "t1", "d1");

    const args = findFirst.mock.calls[0][0] as { select: Record<string, true> };
    expect(args.select).toMatchObject({
      id: true,
      name: true,
      order: true,
      format: true,
      entries: true,
      matchingConfig: true,
      results: true,
      createdAt: true,
    });
  });
});

describe("listParticipantsInTournament", () => {
  it("組織と大会を where に入れ、表示名を Member から解決する", async () => {
    participantFindMany.mockResolvedValue([
      {
        id: "p1",
        team: "青葉クラブ",
        playerNumber: "1",
        member: { id: "m1", name: "佐藤 蓮", nameKana: "サトウ レン" },
      },
      {
        id: "p2",
        team: null,
        playerNumber: "2",
        member: { id: "m2", name: "鈴木 陽菜", nameKana: "スズキ ハルナ" },
      },
    ]);

    const participants = await listParticipantsInTournament("o1", "t1");

    expect(participantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournament: { id: "t1", organizationId: "o1" } },
      }),
    );
    // team は bracket 側で省略可能なプロパティなので、null は undefined に畳む。
    expect(participants).toEqual([
      {
        id: "p1",
        name: "佐藤 蓮",
        nameKana: "サトウ レン",
        playerNumber: "1",
        team: "青葉クラブ",
        memberId: "m1",
      },
      {
        id: "p2",
        name: "鈴木 陽菜",
        nameKana: "スズキ ハルナ",
        playerNumber: "2",
        team: undefined,
        memberId: "m2",
      },
    ]);
  });
});

describe("listOverallOrderSources", () => {
  it("大会 id だけで部門と進行順を読み、通し番号の対照表を返す", async () => {
    findMany.mockResolvedValue([
      {
        id: "d1",
        order: 0,
        matchingConfig: {
          version: 1,
          matches: [
            {
              id: "m1",
              bracket: "winners",
              round: 1,
              order: 0,
              matchName: "1",
              slots: [{ kind: "bye" }, { kind: "bye" }],
            },
          ],
        },
      },
    ]);
    scheduleItemFindMany.mockResolvedValue([
      { divisionId: "d1", matchId: "m1" },
    ]);

    const overallSeq = await listOverallOrderSources("t1");

    // 大会 id だけを where に入れる。所有権の絞り込みは呼び出し側のページが
    // 既に確立しているため、ここでは持たない。
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournamentId: "t1" },
        orderBy: { order: "asc" },
      }),
    );
    expect(scheduleItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournamentId: "t1", kind: "MATCH" },
        orderBy: { order: "asc" },
      }),
    );
    expect(overallSeq.get(overallSeqKey("d1", "m1"))).toBe(1);
  });

  it("matchingConfig が壊れている部門は試合ゼロとして扱い、他の部門は落とさない", async () => {
    findMany.mockResolvedValue([
      { id: "d1", order: 0, matchingConfig: "壊れた値" },
      {
        id: "d2",
        order: 1,
        matchingConfig: {
          version: 1,
          matches: [
            {
              id: "m1",
              bracket: "winners",
              round: 1,
              order: 0,
              matchName: "1",
              slots: [{ kind: "bye" }, { kind: "bye" }],
            },
          ],
        },
      },
    ]);
    scheduleItemFindMany.mockResolvedValue([]);

    const overallSeq = await listOverallOrderSources("t1");

    expect(overallSeq.get(overallSeqKey("d1", "m1"))).toBeUndefined();
    expect(overallSeq.get(overallSeqKey("d2", "m1"))).toBe(1);
  });

  it("divisionId か matchId が null の進行順の行は落とす", async () => {
    findMany.mockResolvedValue([
      {
        id: "d1",
        order: 0,
        matchingConfig: {
          version: 1,
          matches: [
            {
              id: "m1",
              bracket: "winners",
              round: 1,
              order: 0,
              matchName: "1",
              slots: [{ kind: "bye" }, { kind: "bye" }],
            },
          ],
        },
      },
    ]);
    // DIVIDER 行はこの select には出てこないはずだが、防御的に null も混ぜる。
    scheduleItemFindMany.mockResolvedValue([
      { divisionId: null, matchId: null },
    ]);

    const overallSeq = await listOverallOrderSources("t1");

    // 保存された並びを使わない場合でも、部門内の実施順から末尾に足されるので
    // 通し番号自体は付く。
    expect(overallSeq.get(overallSeqKey("d1", "m1"))).toBe(1);
  });
});

describe("listDivisionDetailsInTournament", () => {
  it("組織と大会を where に入れ、order 昇順で Json 列まで引く", async () => {
    findMany.mockResolvedValue([]);

    await listDivisionDetailsInTournament("o1", "t1");

    expect(findMany).toHaveBeenCalledWith({
      where: { tournament: { id: "t1", organizationId: "o1" } },
      orderBy: { order: "asc" },
      select: {
        id: true,
        name: true,
        order: true,
        format: true,
        entries: true,
        matchingConfig: true,
        results: true,
        resultConfig: true,
        createdAt: true,
      },
    });
  });
});

describe("loadEntrySourceContext", () => {
  it("部門ごとの仮名と警告を返す", async () => {
    // 予選リーグA（全試合終了）と、その 1 位を参照する決勝トーナメント
    findMany.mockResolvedValue([
      {
        id: "d2",
        name: "予選リーグA",
        order: 0,
        format: "ROUND_ROBIN",
        createdAt: new Date(),
        entries: {
          version: 1,
          entries: [
            { id: "l1", participantId: "p1", seed: 0 },
            { id: "l2", participantId: "p2", seed: 1 },
          ],
        },
        matchingConfig: {
          version: 1,
          matches: [
            {
              id: "n1",
              bracket: "winners",
              round: 1,
              order: 0,
              matchName: "第1試合",
              slots: [
                { kind: "entry", entryId: "l1" },
                { kind: "entry", entryId: "l2" },
              ],
            },
          ],
        },
        results: {
          version: 1,
          matches: [{ matchId: "n1", winnerEntryId: "l1" }],
        },
        resultConfig: {
          version: 1,
          winReason: { enabled: false, options: [] },
          score: { enabled: false, count: 3, aggregation: "sum" },
          note: { enabled: false },
        },
      },
      {
        id: "d9",
        name: "決勝トーナメント",
        order: 1,
        format: "SINGLE_ELIMINATION",
        createdAt: new Date(),
        entries: {
          version: 1,
          entries: [
            {
              id: "x1",
              seed: 0,
              source: { kind: "leagueRank", divisionId: "d2", rank: 1 },
            },
          ],
        },
        matchingConfig: { version: 1, matches: [] },
        results: { version: 1, matches: [] },
        resultConfig: {
          version: 1,
          winReason: { enabled: false, options: [] },
          score: { enabled: false, count: 3, aggregation: "sum" },
          note: { enabled: false },
        },
      },
    ]);

    const { views } = await loadEntrySourceContext("o1", "t1", new Map(), [
      { id: "p1", name: "山田太郎" },
      { id: "p2", name: "佐藤" },
    ]);

    expect(views.get("d9")?.labels).toEqual(new Map([["x1", "山田太郎"]]));
    expect(views.get("d9")?.warnings).toEqual([]);
  });

  it("壊れた Json を持つ部門は除いて続け、他の部門の仮名は出す", async () => {
    findMany.mockResolvedValue([
      {
        id: "d1",
        name: "壊れた部門",
        order: 0,
        format: "SINGLE_ELIMINATION",
        createdAt: new Date(),
        entries: "壊れた値",
        matchingConfig: { version: 1, matches: [] },
        results: { version: 1, matches: [] },
        resultConfig: null,
      },
      {
        id: "d2",
        name: "無事な部門",
        order: 1,
        format: "SINGLE_ELIMINATION",
        createdAt: new Date(),
        entries: {
          version: 1,
          entries: [{ id: "e1", participantId: "p1", seed: 0 }],
        },
        matchingConfig: { version: 1, matches: [] },
        results: { version: 1, matches: [] },
        resultConfig: null,
      },
    ]);

    const { views, divisions } = await loadEntrySourceContext(
      "o1",
      "t1",
      new Map(),
      [{ id: "p1", name: "山田太郎" }],
    );

    expect(views.has("d1")).toBe(false);
    expect(views.get("d2")?.labels).toEqual(new Map());
    expect(divisions.map((division) => division.id)).toEqual(["d2"]);
  });
});
