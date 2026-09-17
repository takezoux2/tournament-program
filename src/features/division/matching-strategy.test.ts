import { describe, expect, it } from "vitest";
import type { DivisionEntry, MatchingConfig } from "@/lib/division/types";
import { buildDoubleElimination } from "./double-elimination/build";
import {
  applyEntryAdded,
  applyEntryReordered,
  buildSlotBracket,
  isEditableFormat,
  isSlotBracketFormat,
  matchesSlotBracketShape,
  maxEntries,
  minEntries,
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
  it("全形式が編集画面を持つ", () => {
    expect(isEditableFormat("SINGLE_ELIMINATION")).toBe(true);
    expect(isEditableFormat("ROUND_ROBIN")).toBe(true);
    expect(isEditableFormat("DOUBLE_ELIMINATION_GRAND_FINAL")).toBe(true);
    expect(isEditableFormat("DOUBLE_ELIMINATION_THIRD_PLACE")).toBe(true);
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

  it("リーグは上限を超えたエントリー数だと空を返す", () => {
    // 128 人のトーナメントを /edit で ROUND_ROBIN に切り替えた部門は、
    // 生成ボタンを経由せずここへ来ることがある。8128 試合の Json を
    // 黙って書かないよう、ここでも弾く。
    expect(regenerateMatching("ROUND_ROBIN", entriesOf(17))).toEqual(EMPTY);
  });

  it("リーグは上限ちょうどの 16 人なら通常どおり全試合を作る", () => {
    // 17 人（超過）のすぐ下の境界。比較が > ではなく >= になっていると
    // ちょうど 16 人のリーグまで巻き込んで空にしてしまう。
    // n(n-1)/2 = 16*15/2 = 120 試合が作られるはず。
    const result = regenerateMatching("ROUND_ROBIN", entriesOf(16));
    expect(result.matches).toHaveLength(120);
    expect(result).toEqual(buildRoundRobin(entriesOf(16)));
  });
});

describe("applyEntryAdded", () => {
  it("トーナメントは末尾の bye を埋め、既存のカードを壊さない", () => {
    // 8 人（フルブラケット、bye 無し）に 9 人目を足すと 1 段拡張されて
    // 16 席になる。2 人だと 2 回戦以降が存在せず、この先で確かめたい
    // isSingleEliminationShape の判定を素通りさせてしまうため、
    // 実際に複数ラウンドを持つ大きさで確かめる。
    const current = buildFromSlots(generateSlots(entriesOf(8)));
    const next = applyEntryAdded(
      "SINGLE_ELIMINATION",
      current,
      entriesOf(9),
      "e9",
    );
    expect(next.matches.filter((match) => match.round === 1)).toHaveLength(8);
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
    // 形が正しいときの挙動まで変えてはいけない。2 人ぶんの木だと
    // 2 回戦以降が存在せず isSingleEliminationShape の every が空配列に
    // なって何を判定しても true になってしまい、判定が壊れていても
    // このテストは気づけない。2 回戦・3 回戦を実際に持つ 8 人の
    // フルブラケットで確かめる。
    const bracketShaped = buildFromSlots(generateSlots(entriesOf(8)));
    const next = applyEntryAdded(
      "SINGLE_ELIMINATION",
      bracketShaped,
      entriesOf(9),
      "e9",
    );
    expect(next).not.toBe(bracketShaped);
    expect(next.matches.filter((match) => match.round === 1)).toHaveLength(8);
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

  it("リーグは上限を超えたエントリー数だと並べ替えても空になる", () => {
    // 並べ替え自体はエントリー数を変えないので、これは /edit で
    // トーナメントから切り替わった直後で上限超過のエントリーを残した
    // リーグでだけ起こる。8128 試合ぶんの Json を書かせないためのガード。
    const current = buildFromSlots(generateSlots(entriesOf(17)));
    expect(applyEntryReordered("ROUND_ROBIN", current, entriesOf(17))).toEqual(
      EMPTY,
    );
  });

  it("リーグは上限ちょうどの 16 人なら並べ替えても全試合を保つ", () => {
    // 17 人テストの境界を挟んで反対側を確認する。比較が > ではなく
    // >= になっていると、並べ替えのたびにちょうど 16 人のリーグが
    // 消えてしまう。n(n-1)/2 = 16*15/2 = 120 試合を保つはず。
    const current = buildRoundRobin(entriesOf(16));
    const result = applyEntryReordered("ROUND_ROBIN", current, entriesOf(16));
    expect(result.matches).toHaveLength(120);
    expect(result).toEqual(buildRoundRobin(entriesOf(16)));
  });
});

describe("maxEntries / minEntries（ダブルエリミネーション）", () => {
  it("DE は 3 人から 64 人まで", () => {
    for (const format of [
      "DOUBLE_ELIMINATION_GRAND_FINAL",
      "DOUBLE_ELIMINATION_THIRD_PLACE",
    ] as const) {
      expect(maxEntries(format)).toBe(64);
      expect(minEntries(format)).toBe(3);
    }
    expect(minEntries("SINGLE_ELIMINATION")).toBe(2);
    expect(minEntries("ROUND_ROBIN")).toBe(2);
  });
});

describe("ダブルエリミネーションの組み合わせ", () => {
  it("regenerateMatching はバリアントに応じて作る", () => {
    const slots = generateSlots(entriesOf(5));
    expect(
      regenerateMatching("DOUBLE_ELIMINATION_GRAND_FINAL", entriesOf(5)),
    ).toEqual(buildDoubleElimination(slots, "grandFinal"));
    expect(
      regenerateMatching("DOUBLE_ELIMINATION_THIRD_PLACE", entriesOf(5)),
    ).toEqual(buildDoubleElimination(slots, "thirdPlace"));
  });

  it("applyEntryAdded は空き枠を埋めて作り直す", () => {
    const current = regenerateMatching(
      "DOUBLE_ELIMINATION_GRAND_FINAL",
      entriesOf(5),
    );
    const next = applyEntryAdded(
      "DOUBLE_ELIMINATION_GRAND_FINAL",
      current,
      entriesOf(6),
      "e6",
    );
    expect(
      next.matches.some((match) =>
        match.slots.some(
          (slot) => slot.kind === "entry" && slot.entryId === "e6",
        ),
      ),
    ).toBe(true);
    expect(
      matchesSlotBracketShape("DOUBLE_ELIMINATION_GRAND_FINAL", next),
    ).toBe(true);
  });

  it("applyEntryAdded は形が違えば触らない", () => {
    const league = buildRoundRobin(entriesOf(4));
    expect(
      applyEntryAdded(
        "DOUBLE_ELIMINATION_THIRD_PLACE",
        league,
        entriesOf(5),
        "e5",
      ),
    ).toBe(league);
  });

  it("applyEntryReordered は触らない", () => {
    const current = regenerateMatching(
      "DOUBLE_ELIMINATION_THIRD_PLACE",
      entriesOf(4),
    );
    expect(
      applyEntryReordered(
        "DOUBLE_ELIMINATION_THIRD_PLACE",
        current,
        entriesOf(4),
      ),
    ).toBe(current);
  });

  it("regenerateMatching は上限（64人）を超えたエントリー数だと空を返す", () => {
    // /edit は format を無条件に書き換えられるため、SINGLE_ELIMINATION（128人まで）の
    // 部門がそのまま DOUBLE_ELIMINATION_GRAND_FINAL になり、生成ボタンを経由せず
    // remove-entry / reorder から regenerateMatching が呼ばれることがある。
    // ROUND_ROBIN と同じく、DE でも上限超過なら空を返して肥大化した
    // ブラケットの再構築を防ぐ。
    expect(
      regenerateMatching("DOUBLE_ELIMINATION_GRAND_FINAL", entriesOf(65)),
    ).toEqual(EMPTY);
    expect(
      regenerateMatching("DOUBLE_ELIMINATION_THIRD_PLACE", entriesOf(65)),
    ).toEqual(EMPTY);
  });

  it("regenerateMatching は上限ちょうどの 64 人なら通常どおり作る", () => {
    const slots = generateSlots(entriesOf(64));
    expect(
      regenerateMatching("DOUBLE_ELIMINATION_GRAND_FINAL", entriesOf(64)),
    ).toEqual(buildDoubleElimination(slots, "grandFinal"));
  });
});

describe("スロット型ブラケットのディスパッチ", () => {
  it("リーグ以外がスロット型", () => {
    expect(isSlotBracketFormat("SINGLE_ELIMINATION")).toBe(true);
    expect(isSlotBracketFormat("DOUBLE_ELIMINATION_GRAND_FINAL")).toBe(true);
    expect(isSlotBracketFormat("DOUBLE_ELIMINATION_THIRD_PLACE")).toBe(true);
    expect(isSlotBracketFormat("ROUND_ROBIN")).toBe(false);
  });

  it("buildSlotBracket と matchesSlotBracketShape は形式ごとの builder に委ねる", () => {
    const slots = generateSlots(entriesOf(4));
    expect(buildSlotBracket("SINGLE_ELIMINATION", slots)).toEqual(
      buildFromSlots(slots),
    );
    const de = buildSlotBracket("DOUBLE_ELIMINATION_GRAND_FINAL", slots);
    expect(de).toEqual(buildDoubleElimination(slots, "grandFinal"));
    expect(matchesSlotBracketShape("DOUBLE_ELIMINATION_GRAND_FINAL", de)).toBe(
      true,
    );
    expect(matchesSlotBracketShape("SINGLE_ELIMINATION", de)).toBe(false);
  });
});
