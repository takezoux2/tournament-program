import { describe, expect, it } from "vitest";
import type { DivisionFormat } from "@/generated/prisma/enums";
import {
  BROKEN_SOURCE_LABEL,
  type EntrySourceDivision,
  entrySourceLabels,
  entrySourceWarnings,
  resolveEntrySources,
  unresolvedEntryIds,
} from "./entry-source";
import type { BracketMatch, DivisionEntry, MatchResultRecord } from "./types";

const entryMatch = (
  id: string,
  left: string,
  right: string,
  round = 1,
  order = 0,
): BracketMatch => ({
  id,
  bracket: "winners",
  round,
  order,
  matchName: id,
  slots: [
    { kind: "entry", entryId: left },
    { kind: "entry", entryId: right },
  ],
});

const division = (
  id: string,
  name: string,
  format: DivisionFormat,
  entries: DivisionEntry[],
  matches: BracketMatch[],
  records: MatchResultRecord[] = [],
): EntrySourceDivision => ({
  id,
  name,
  format,
  entries: { version: 1, entries },
  matchingConfig: { version: 1, matches },
  results: { version: 1, matches: records },
});

/** 予選トーナメント: e1 vs e2 の 1 試合だけ。 */
const qualifier = (records: MatchResultRecord[] = []) =>
  division(
    "d1",
    "予選トーナメント",
    "SINGLE_ELIMINATION",
    [
      { id: "e1", participantId: "p1", seed: 0 },
      { id: "e2", participantId: "p2", seed: 1 },
    ],
    [entryMatch("m1", "e1", "e2")],
    records,
  );

/** 予選リーグA: 3 人総当たり。 */
const league = (records: MatchResultRecord[] = []) =>
  division(
    "d2",
    "予選リーグA",
    "ROUND_ROBIN",
    [
      { id: "l1", participantId: "p1", seed: 0 },
      { id: "l2", participantId: "p2", seed: 1 },
      { id: "l3", participantId: "p3", seed: 2 },
    ],
    [
      entryMatch("n1", "l1", "l2"),
      entryMatch("n2", "l1", "l3"),
      entryMatch("n3", "l2", "l3"),
    ],
    records,
  );

/** 決勝トーナメント: 参照エントリーだけを持つ。 */
const finalDivision = (entries: DivisionEntry[]) =>
  division("d9", "決勝トーナメント", "SINGLE_ELIMINATION", entries, [
    entryMatch("f1", entries[0].id, entries[1].id),
  ]);

describe("resolveEntrySources", () => {
  it("試合の勝者が決まっていれば参加者に解決する", () => {
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "matchWinner", divisionId: "d1", matchId: "m1" },
      },
      { id: "x2", participantId: "p3", seed: 1 },
    ]);
    const resolved = resolveEntrySources([
      qualifier([{ matchId: "m1", winnerEntryId: "e2" }]),
      final,
    ]);

    expect(resolved.get("d9")?.get("x1")).toEqual({
      state: "resolved",
      participantId: "p2",
      label: "予選トーナメント 1回戦 (1)の勝者",
    });
    // 参加者エントリーは表に載せない
    expect(resolved.get("d9")?.has("x2")).toBe(false);
  });

  it("勝者が未記録なら pending で仮名を返す", () => {
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "matchWinner", divisionId: "d1", matchId: "m1" },
      },
      { id: "x2", participantId: "p3", seed: 1 },
    ]);
    const resolved = resolveEntrySources([qualifier(), final]);

    expect(resolved.get("d9")?.get("x1")).toEqual({
      state: "pending",
      label: "予選トーナメント 1回戦 (1)の勝者",
    });
  });

  it("matchLoser で勝者が未記録なら pending になること", () => {
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "matchLoser", divisionId: "d1", matchId: "m1" },
      },
      { id: "x2", participantId: "p3", seed: 1 },
    ]);
    const resolved = resolveEntrySources([qualifier(), final]);

    expect(resolved.get("d9")?.get("x1")).toEqual({
      state: "pending",
      label: "予選トーナメント 1回戦 (1)の敗者",
    });
  });

  it("敗者も解決する", () => {
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "matchLoser", divisionId: "d1", matchId: "m1" },
      },
      { id: "x2", participantId: "p3", seed: 1 },
    ]);
    const resolved = resolveEntrySources([
      qualifier([{ matchId: "m1", winnerEntryId: "e1" }]),
      final,
    ]);

    expect(resolved.get("d9")?.get("x1")).toMatchObject({
      state: "resolved",
      participantId: "p2",
    });
  });

  it("BYE を含む試合には敗者が生まれないので broken にする", () => {
    const withBye = division(
      "d1",
      "予選トーナメント",
      "SINGLE_ELIMINATION",
      [{ id: "e1", participantId: "p1", seed: 0 }],
      [
        {
          id: "m1",
          bracket: "winners",
          round: 1,
          order: 0,
          matchName: "m1",
          slots: [{ kind: "entry", entryId: "e1" }, { kind: "bye" }],
        },
      ],
    );
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "matchLoser", divisionId: "d1", matchId: "m1" },
      },
      { id: "x2", participantId: "p3", seed: 1 },
    ]);

    expect(resolveEntrySources([withBye, final]).get("d9")?.get("x1")).toEqual({
      state: "broken",
      label: "予選トーナメント 1回戦 (1)の敗者",
    });
  });

  it("BYE の不戦勝で勝ち上がった人を勝者参照が解決すること", () => {
    // 片側だけ BYE の試合。「両側 BYE は broken」というガード
    // （resolved.slots.every(slot => slot.state === "bye")）が、将来
    // every → some に書き換わっても気づけるようにする回帰テスト。
    const withBye = division(
      "d1",
      "予選トーナメント",
      "SINGLE_ELIMINATION",
      [{ id: "e1", participantId: "p1", seed: 0 }],
      [
        {
          id: "m1",
          bracket: "winners",
          round: 1,
          order: 0,
          matchName: "m1",
          slots: [{ kind: "entry", entryId: "e1" }, { kind: "bye" }],
        },
      ],
    );
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "matchWinner", divisionId: "d1", matchId: "m1" },
      },
      { id: "x2", participantId: "p3", seed: 1 },
    ]);

    expect(resolveEntrySources([withBye, final]).get("d9")?.get("x1")).toEqual({
      state: "resolved",
      participantId: "p1",
      label: "予選トーナメント 1回戦 (1)の勝者",
    });
  });

  it("両スロットが BYE の試合には勝者も居ないので勝者参照は broken にする", () => {
    const bothBye = division(
      "d1",
      "予選トーナメント",
      "SINGLE_ELIMINATION",
      [],
      [
        {
          id: "m1",
          bracket: "winners",
          round: 1,
          order: 0,
          matchName: "m1",
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
      ],
    );
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "matchWinner", divisionId: "d1", matchId: "m1" },
      },
      { id: "x2", participantId: "p3", seed: 1 },
    ]);

    expect(resolveEntrySources([bothBye, final]).get("d9")?.get("x1")).toEqual({
      state: "broken",
      label: "予選トーナメント 1回戦 (1)の勝者",
    });
  });

  it("リーグの全試合が終わっていれば N 位を解決する", () => {
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "leagueRank", divisionId: "d2", rank: 1 },
      },
      { id: "x2", participantId: "p9", seed: 1 },
    ]);
    const resolved = resolveEntrySources([
      league([
        { matchId: "n1", winnerEntryId: "l1" },
        { matchId: "n2", winnerEntryId: "l1" },
        { matchId: "n3", winnerEntryId: "l2" },
      ]),
      final,
    ]);

    expect(resolved.get("d9")?.get("x1")).toEqual({
      state: "resolved",
      participantId: "p1",
      label: "予選リーグA 1位",
    });
  });

  it("リーグの試合が残っていれば pending にする", () => {
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "leagueRank", divisionId: "d2", rank: 1 },
      },
      { id: "x2", participantId: "p9", seed: 1 },
    ]);
    const resolved = resolveEntrySources([
      league([{ matchId: "n1", winnerEntryId: "l1" }]),
      final,
    ]);

    expect(resolved.get("d9")?.get("x1")).toEqual({
      state: "pending",
      label: "予選リーグA 1位",
    });
  });

  it("同順位で絞れなければ ambiguous にする", () => {
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "leagueRank", divisionId: "d2", rank: 1 },
      },
      { id: "x2", participantId: "p9", seed: 1 },
    ]);
    // 全員 1 勝 1 敗で巴戦になり 3 人が同じ 1 位になる
    const resolved = resolveEntrySources([
      league([
        { matchId: "n1", winnerEntryId: "l1" },
        { matchId: "n2", winnerEntryId: "l3" },
        { matchId: "n3", winnerEntryId: "l2" },
      ]),
      final,
    ]);

    expect(resolved.get("d9")?.get("x1")).toEqual({
      state: "ambiguous",
      label: "予選リーグA 1位",
      reason: "tie",
    });
  });

  it("同順位で飛ばされた順位は broken ではなく ambiguous にする", () => {
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "leagueRank", divisionId: "d2", rank: 2 },
      },
      { id: "x2", participantId: "p9", seed: 1 },
    ]);
    // 全員 1 勝 1 敗で巴戦になり 3 人が同じ 1 位になる（2 位は飛ばされる）
    const resolved = resolveEntrySources([
      league([
        { matchId: "n1", winnerEntryId: "l1" },
        { matchId: "n2", winnerEntryId: "l3" },
        { matchId: "n3", winnerEntryId: "l2" },
      ]),
      final,
    ]);

    expect(resolved.get("d9")?.get("x1")).toEqual({
      state: "ambiguous",
      label: "予選リーグA 2位",
      reason: "tie",
    });
  });

  it("エントリー数より大きい順位は broken にする", () => {
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "leagueRank", divisionId: "d2", rank: 9 },
      },
      { id: "x2", participantId: "p9", seed: 1 },
    ]);
    const resolved = resolveEntrySources([
      league([
        { matchId: "n1", winnerEntryId: "l1" },
        { matchId: "n2", winnerEntryId: "l1" },
        { matchId: "n3", winnerEntryId: "l2" },
      ]),
      final,
    ]);

    expect(resolved.get("d9")?.get("x1")?.state).toBe("broken");
  });

  it("参照先の部門が無ければ broken にする", () => {
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "leagueRank", divisionId: "missing", rank: 1 },
      },
      { id: "x2", participantId: "p9", seed: 1 },
    ]);

    expect(resolveEntrySources([final]).get("d9")?.get("x1")).toEqual({
      state: "broken",
      label: BROKEN_SOURCE_LABEL,
    });
  });

  it("参照先がリーグでなければ順位を引けないので broken にする", () => {
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "leagueRank", divisionId: "d1", rank: 1 },
      },
      { id: "x2", participantId: "p9", seed: 1 },
    ]);

    expect(
      resolveEntrySources([qualifier(), final]).get("d9")?.get("x1")?.state,
    ).toBe("broken");
  });

  it("多段の参照（予選 → 中間 → 決勝）を辿る", () => {
    const middle = division(
      "d5",
      "中間トーナメント",
      "SINGLE_ELIMINATION",
      [
        {
          id: "y1",
          seed: 0,
          source: { kind: "matchWinner", divisionId: "d1", matchId: "m1" },
        },
        { id: "y2", participantId: "p7", seed: 1 },
      ],
      [entryMatch("g1", "y1", "y2")],
      [{ matchId: "g1", winnerEntryId: "y1" }],
    );
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "matchWinner", divisionId: "d5", matchId: "g1" },
      },
      { id: "x2", participantId: "p9", seed: 1 },
    ]);
    const resolved = resolveEntrySources([
      qualifier([{ matchId: "m1", winnerEntryId: "e1" }]),
      middle,
      final,
    ]);

    expect(resolved.get("d9")?.get("x1")).toEqual({
      state: "resolved",
      participantId: "p1",
      label: "中間トーナメント 1回戦 (1)の勝者",
    });
  });

  it("循環していても止まらず cycle を返す", () => {
    const a = division(
      "da",
      "部門A",
      "SINGLE_ELIMINATION",
      [
        {
          id: "a1",
          seed: 0,
          source: { kind: "matchWinner", divisionId: "db", matchId: "mb" },
        },
        { id: "a2", participantId: "p1", seed: 1 },
      ],
      [entryMatch("ma", "a1", "a2")],
      [{ matchId: "ma", winnerEntryId: "a1" }],
    );
    const b = division(
      "db",
      "部門B",
      "SINGLE_ELIMINATION",
      [
        {
          id: "b1",
          seed: 0,
          source: { kind: "matchWinner", divisionId: "da", matchId: "ma" },
        },
        { id: "b2", participantId: "p2", seed: 1 },
      ],
      [entryMatch("mb", "b1", "b2")],
      [{ matchId: "mb", winnerEntryId: "b1" }],
    );

    const resolved = resolveEntrySources([a, b]);

    expect(resolved.get("da")?.get("a1")).toEqual({
      state: "ambiguous",
      label: "部門B 1回戦 (1)の勝者",
      reason: "cycle",
    });
  });

  it("展開済みの試合名があれば仮名に使う", () => {
    const named: EntrySourceDivision = {
      ...qualifier([{ matchId: "m1", winnerEntryId: "e1" }]),
      matchNames: new Map([["m1", "第5試合"]]),
    };
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "matchWinner", divisionId: "d1", matchId: "m1" },
      },
      { id: "x2", participantId: "p9", seed: 1 },
    ]);

    expect(
      resolveEntrySources([named, final]).get("d9")?.get("x1")?.label,
    ).toBe("予選トーナメント 第5試合の勝者");
  });

  it("展開済みの試合名が空文字なら位置ラベルを使うこと", () => {
    const named: EntrySourceDivision = {
      ...qualifier(),
      matchNames: new Map([["m1", ""]]),
    };
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "matchWinner", divisionId: "d1", matchId: "m1" },
      },
      { id: "x2", participantId: "p9", seed: 1 },
    ]);

    expect(
      resolveEntrySources([named, final]).get("d9")?.get("x1")?.label,
    ).toBe("予選トーナメント 1回戦 (1)の勝者");
  });

  it("参照先の試合が引き分けなら ambiguous(draw) にする", () => {
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "matchWinner", divisionId: "d2", matchId: "n1" },
      },
      { id: "x2", participantId: "p9", seed: 1 },
    ]);
    const resolved = resolveEntrySources([
      league([{ matchId: "n1", winnerEntryId: null }]),
      final,
    ]);

    expect(resolved.get("d9")?.get("x1")).toEqual({
      state: "ambiguous",
      label: "予選リーグA n1の勝者",
      reason: "draw",
    });
  });

  it("引き分けの試合の matchLoser 参照も ambiguous(draw) にする", () => {
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "matchLoser", divisionId: "d2", matchId: "n1" },
      },
      { id: "x2", participantId: "p9", seed: 1 },
    ]);
    const resolved = resolveEntrySources([
      league([{ matchId: "n1", winnerEntryId: null }]),
      final,
    ]);

    expect(resolved.get("d9")?.get("x1")).toEqual({
      state: "ambiguous",
      label: "予選リーグA n1の敗者",
      reason: "draw",
    });
  });

  it("記録が無いだけなら（引き分けではなく）pending のままにする", () => {
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "matchWinner", divisionId: "d2", matchId: "n1" },
      },
      { id: "x2", participantId: "p9", seed: 1 },
    ]);
    const resolved = resolveEntrySources([league(), final]);

    expect(resolved.get("d9")?.get("x1")).toEqual({
      state: "pending",
      label: "予選リーグA n1の勝者",
    });
  });

  it("リーグの試合を参照した仮名は位置が無いので matchName をそのまま使う", () => {
    const final = finalDivision([
      {
        id: "x1",
        seed: 0,
        source: { kind: "matchWinner", divisionId: "d2", matchId: "n1" },
      },
      { id: "x2", participantId: "p9", seed: 1 },
    ]);
    const resolved = resolveEntrySources([
      league([
        { matchId: "n1", winnerEntryId: "l1" },
        { matchId: "n2", winnerEntryId: "l1" },
        { matchId: "n3", winnerEntryId: "l2" },
      ]),
      final,
    ]);

    expect(resolved.get("d9")?.get("x1")).toEqual({
      state: "resolved",
      participantId: "p1",
      label: "予選リーグA n1の勝者",
    });
  });
});

describe("entrySourceLabels", () => {
  it("解決済みは参加者名、未確定は仮名を返す", () => {
    const resolved = new Map([
      [
        "x1",
        { state: "resolved" as const, participantId: "p1", label: "仮名1" },
      ],
      ["x2", { state: "pending" as const, label: "予選リーグA 2位" }],
    ]);

    expect(entrySourceLabels(resolved, new Map([["p1", "山田太郎"]]))).toEqual(
      new Map([
        ["x1", "山田太郎"],
        ["x2", "予選リーグA 2位"],
      ]),
    );
  });
});

describe("unresolvedEntryIds", () => {
  it("解決できていない entryId だけを返す", () => {
    const resolved = new Map([
      [
        "x1",
        { state: "resolved" as const, participantId: "p1", label: "仮名1" },
      ],
      ["x2", { state: "pending" as const, label: "仮名2" }],
      ["x3", { state: "broken" as const, label: "仮名3" }],
    ]);

    expect(unresolvedEntryIds(resolved)).toEqual(new Set(["x2", "x3"]));
  });
});

describe("entrySourceWarnings", () => {
  it("同順位・引き分け・循環・参照先なしを文言にする", () => {
    const entries = {
      version: 1 as const,
      entries: [
        {
          id: "x1",
          seed: 0,
          source: {
            kind: "leagueRank" as const,
            divisionId: "d2",
            rank: 1,
          },
        },
        {
          id: "x2",
          seed: 1,
          source: {
            kind: "matchWinner" as const,
            divisionId: "d3",
            matchId: "m1",
          },
        },
        {
          id: "x3",
          seed: 2,
          source: {
            kind: "matchWinner" as const,
            divisionId: "d4",
            matchId: "m2",
          },
        },
        {
          id: "x4",
          seed: 3,
          source: {
            kind: "matchWinner" as const,
            divisionId: "d2",
            matchId: "n1",
          },
        },
      ],
    };
    const resolved = new Map([
      [
        "x1",
        {
          state: "ambiguous" as const,
          label: "予選リーグA 1位",
          reason: "tie" as const,
        },
      ],
      ["x2", { state: "broken" as const, label: BROKEN_SOURCE_LABEL }],
      [
        "x3",
        {
          state: "ambiguous" as const,
          label: BROKEN_SOURCE_LABEL,
          reason: "cycle" as const,
        },
      ],
      [
        "x4",
        {
          state: "ambiguous" as const,
          label: "予選リーグA n1の勝者",
          reason: "draw" as const,
        },
      ],
    ]);

    expect(entrySourceWarnings(entries, resolved, new Map())).toEqual([
      "予選リーグA 1位 は同順位のため決まりません",
      "予選リーグA n1の勝者 は引き分けのため決まりません",
      "参照が循環しているため、選手が決まりません",
      "参照先が見つからない枠があります",
    ]);
  });

  it("スロットに置かれていないエントリーは警告に出さない", () => {
    const entries = {
      version: 1 as const,
      entries: [
        {
          id: "x1",
          seed: 0,
          source: {
            kind: "leagueRank" as const,
            divisionId: "d2",
            rank: 1,
          },
        },
        { id: "x2", participantId: "p1", seed: 1 },
      ],
    };
    const resolved = new Map([
      [
        "x1",
        {
          state: "ambiguous" as const,
          label: "予選リーグA 1位",
          reason: "tie" as const,
        },
      ],
    ]);

    // x1 も x2 もスロットに置かれていない（placedEntryIds が空）ので、
    // 同順位の警告も、山田が 2 つの枠に入っている警告も出ない。
    expect(
      entrySourceWarnings(
        entries,
        resolved,
        new Map([["p1", "山田太郎"]]),
        new Set(),
      ),
    ).toEqual([]);
  });

  it("重複の警告も、置かれていないエントリーは対象から外す", () => {
    const entries = {
      version: 1 as const,
      entries: [
        { id: "x1", participantId: "p1", seed: 0 },
        {
          id: "x2",
          seed: 1,
          source: {
            kind: "leagueRank" as const,
            divisionId: "d2",
            rank: 1,
          },
        },
      ],
    };
    const resolved = new Map([
      [
        "x2",
        {
          state: "resolved" as const,
          participantId: "p1",
          label: "予選リーグA 1位",
        },
      ],
    ]);

    // x1 はスロットに置かれた直接エントリー、x2 は旧画面などで残った
    // 置かれていない参照エントリー。ブラケット上は x1 の 1 枠しか無いので、
    // x2 を対象から外すと重複警告は出ない。
    expect(
      entrySourceWarnings(
        entries,
        resolved,
        new Map([["p1", "山田太郎"]]),
        new Set(["x1"]),
      ),
    ).toEqual([]);
  });

  it("同じ人が 2 つの枠に入っていたら知らせる", () => {
    const entries = {
      version: 1 as const,
      entries: [
        { id: "x1", participantId: "p1", seed: 0 },
        {
          id: "x2",
          seed: 1,
          source: {
            kind: "leagueRank" as const,
            divisionId: "d2",
            rank: 1,
          },
        },
      ],
    };
    const resolved = new Map([
      [
        "x2",
        {
          state: "resolved" as const,
          participantId: "p1",
          label: "予選リーグA 1位",
        },
      ],
    ]);

    expect(
      entrySourceWarnings(entries, resolved, new Map([["p1", "山田太郎"]])),
    ).toEqual(["山田太郎 が 2 つの枠に入っています"]);
  });

  it("問題が無ければ空を返す", () => {
    expect(
      entrySourceWarnings({ version: 1, entries: [] }, new Map(), new Map()),
    ).toEqual([]);
  });
});
