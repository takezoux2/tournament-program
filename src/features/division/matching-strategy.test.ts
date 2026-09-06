import { describe, expect, it } from "vitest";
import type { DivisionEntry, MatchingConfig } from "@/lib/division/types";
import {
  applyEntryAdded,
  applyEntryReordered,
  isEditableFormat,
  maxEntries,
  regenerateMatching,
} from "./matching-strategy";
import { buildRoundRobin } from "./round-robin/build";
import { buildFromSlots } from "./single-elimination/build";
import { generateSlots } from "./single-elimination/edit";

const entriesOf = (count: number): DivisionEntry[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `e${index + 1}`,
    participantId: `p${index + 1}`,
    seed: index,
  }));

const EMPTY: MatchingConfig = { version: 1, matches: [] };

describe("isEditableFormat", () => {
  it("編集画面のある 2 形式だけを通す", () => {
    expect(isEditableFormat("SINGLE_ELIMINATION")).toBe(true);
    expect(isEditableFormat("ROUND_ROBIN")).toBe(true);
    expect(isEditableFormat("DOUBLE_ELIMINATION_GRAND_FINAL")).toBe(false);
    expect(isEditableFormat("DOUBLE_ELIMINATION_THIRD_PLACE")).toBe(false);
  });
});

describe("maxEntries", () => {
  it("リーグは試合数が二乗で増えるため小さい上限にする", () => {
    expect(maxEntries("ROUND_ROBIN")).toBe(16);
  });

  it("トーナメントは従来どおり 128 人", () => {
    expect(maxEntries("SINGLE_ELIMINATION")).toBe(128);
  });
});

describe("regenerateMatching", () => {
  it("トーナメントはシード順から木を作る", () => {
    expect(regenerateMatching("SINGLE_ELIMINATION", entriesOf(4))).toEqual(
      buildFromSlots(generateSlots(entriesOf(4))),
    );
  });

  it("リーグはシード順から総当たりを作る", () => {
    expect(regenerateMatching("ROUND_ROBIN", entriesOf(4))).toEqual(
      buildRoundRobin(entriesOf(4)),
    );
  });

  it("どちらも 2 人未満なら空を返す", () => {
    expect(regenerateMatching("SINGLE_ELIMINATION", entriesOf(1))).toEqual(
      EMPTY,
    );
    expect(regenerateMatching("ROUND_ROBIN", entriesOf(1))).toEqual(EMPTY);
  });
});

describe("applyEntryAdded", () => {
  it("トーナメントは末尾の bye を埋め、既存のカードを壊さない", () => {
    // 2 人ぶんの木に 3 人目を足すと 1 段拡張されて 4 席になる。
    const current = buildFromSlots(generateSlots(entriesOf(2)));
    const next = applyEntryAdded(
      "SINGLE_ELIMINATION",
      current,
      entriesOf(3),
      "e3",
    );
    expect(next.matches.filter((match) => match.round === 1)).toHaveLength(2);
  });

  it("リーグは丸ごと作り直す。1 人増えれば全員の試合が増えるため", () => {
    const current = buildRoundRobin(entriesOf(3));
    expect(applyEntryAdded("ROUND_ROBIN", current, entriesOf(4), "e4")).toEqual(
      buildRoundRobin(entriesOf(4)),
    );
  });

  it("組み合わせが未作成ならどちらの形式でも空のまま", () => {
    // 生成は運営者が明示的にボタンを押したときだけ起きる。
    // 後続の処理が参照比較で「再生成されたか」を判定するため、
    // 同じオブジェクト参照を返すことが必須。
    expect(applyEntryAdded("ROUND_ROBIN", EMPTY, entriesOf(4), "e4")).toBe(
      EMPTY,
    );
    expect(
      applyEntryAdded("SINGLE_ELIMINATION", EMPTY, entriesOf(4), "e4"),
    ).toBe(EMPTY);
  });

  it("SINGLE_ELIMINATION でもリーグの星取表を持ったままなら触らず、エントリーを消さない", () => {
    // /edit でリーグからトーナメントへ切り替えた直後の部門は、リーグの
    // 星取表（複数節ぶんの試合）をそのまま持つ。toSlots は 1 回戦しか見ないため、
    // ここでガードせずに buildFromSlots へ通すと 2 節目以降が消え、
    // 3 人なら休みの e1 がどの試合にも現れず行方不明になる。
    const leagueShaped = buildRoundRobin(entriesOf(3));
    const next = applyEntryAdded(
      "SINGLE_ELIMINATION",
      leagueShaped,
      entriesOf(4),
      "e4",
    );

    // 触らない＝参照も内容も変わらない。「rebuild this」の案内が
    // 消えないことの前提でもある。
    expect(next).toBe(leagueShaped);
    const entryIds = next.matches
      .flatMap((match) => match.slots)
      .filter((slot) => slot.kind === "entry")
      .map((slot) => (slot as { entryId: string }).entryId);
    expect(entryIds).toContain("e1");
  });

  it("SINGLE_ELIMINATION で本当にブラケット形なら従来どおり足す", () => {
    // 形が正しいときの挙動まで変えてはいけない。
    const bracketShaped = buildFromSlots(generateSlots(entriesOf(2)));
    const next = applyEntryAdded(
      "SINGLE_ELIMINATION",
      bracketShaped,
      entriesOf(3),
      "e3",
    );
    expect(next).not.toBe(bracketShaped);
    expect(next.matches.filter((match) => match.round === 1)).toHaveLength(2);
  });
});

describe("applyEntryReordered", () => {
  it("トーナメントは組み合わせに触らない", () => {
    const current = buildFromSlots(generateSlots(entriesOf(4)));
    expect(
      applyEntryReordered("SINGLE_ELIMINATION", current, entriesOf(4)),
    ).toBe(current);
  });

  it("リーグは新しいシード順で作り直す", () => {
    // 円卓法の出力はシード順から決まるので、並べ替えたのに古い対戦表が
    // 残ると画面の 2 箇所が食い違う。
    const swapped = [
      { id: "e2", participantId: "p2", seed: 0 },
      { id: "e1", participantId: "p1", seed: 1 },
      { id: "e3", participantId: "p3", seed: 2 },
      { id: "e4", participantId: "p4", seed: 3 },
    ];
    const current = buildRoundRobin(entriesOf(4));
    expect(applyEntryReordered("ROUND_ROBIN", current, swapped)).toEqual(
      buildRoundRobin(swapped),
    );
  });

  it("組み合わせが未作成ならリーグでも空のまま", () => {
    // 後続の処理が参照比較で「再生成されたか」を判定するため、
    // 同じオブジェクト参照を返すことが必須。
    expect(applyEntryReordered("ROUND_ROBIN", EMPTY, entriesOf(4))).toBe(EMPTY);
  });
});
