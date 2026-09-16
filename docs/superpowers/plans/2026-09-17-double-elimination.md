# Double Elimination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `DOUBLE_ELIMINATION_GRAND_FINAL` / `DOUBLE_ELIMINATION_THIRD_PLACE` の部門で、組み合わせの自動生成・編集画面・ブラケット描画を使えるようにする。

**Architecture:** 勝者側 1 回戦の `SlotSource[]` を唯一の情報源とし、純粋関数 `buildDoubleElimination` が勝者側（既存 `buildFromSlots`）＋敗者側＋決勝を決定的に生成する。resolver 2 つに「どのエントリーも到達しえないスロットは bye」の規則を足し、描画側は `loserOf` と `bracket` を扱えるよう型・変換・レイアウトを拡張する。編集画面は SE の画面・スライスを形式ディスパッチで再利用する。

**Tech Stack:** Next.js (App Router, Server Actions), TypeScript, Effect, Vitest + Testing Library (jsdom), @xyflow/react, pnpm, Biome

**Spec:** `docs/superpowers/specs/2026-09-17-double-elimination-design.md`

## Global Constraints

- パッケージ管理・スクリプトは `pnpm`（`pnpm test`, `pnpm typecheck`, `pnpm lint`）
- 実装はサブエージェント＋ git worktree で行う（AGENTS.md）。新しい worktree では `pnpm exec next typegen` を実行し、`.env` をメインのチェックアウトからコピーする
- Windows チェックアウトでは Biome が CRLF 由来のエラーを全体に出す。lint は内容で判断する
- 決勝は常に 1 試合（ブラケットリセットなし）
- DE の最小エントリー数 3、最大 64
- 試合 id: 勝者側 `m{round}-{order}`（既存 `buildFromSlots` のまま）、敗者側 `l{L}-{order}`、決勝 `f`
- `round` は全ブラケット通し: 勝者側 r → `r`、敗者側 L → `L + 1`、決勝 → `2k`
- 試合番号・`sequence` は 勝者側 → 敗者側 → 決勝、各ブラケット内 round → order の順
- コメント・テスト名は既存コードに合わせて日本語

---

## File Structure

| File | 責務 |
| --- | --- |
| Create `src/features/division/double-elimination/build.ts` | DE の組み合わせ生成と形状判定（純粋関数） |
| Create `src/features/division/double-elimination/build.test.ts` | 上記のテスト |
| Modify `src/lib/division/resolve.ts` (+test) | bye 伝播 |
| Modify `src/lib/division/label.ts` (+test) | 敗者側・決勝の位置ラベル |
| Modify `src/features/division/matching-strategy.ts` (+test) | DE を編集可能形式に追加、スロット型ブラケットの共通ディスパッチ、最小エントリー数 |
| Modify `src/features/division/errors.ts`, `messages.ts`, `generate-matching/repository.ts` (+tests) | エントリー不足エラーに最小人数を持たせる |
| Modify `src/features/division/swap-slots/repository.ts` | DE でも入れ替え可能に |
| Modify `src/features/division/format.ts` (+test), `src/components/division/DivisionDetail.tsx`, `setup/page.tsx`, `src/components/division/DivisionSetup.tsx` | 編集画面の開放 |
| Modify `src/features/bracket/types.ts`, `from-division.ts`, `resolve-bracket.ts` (+tests), `src/components/tournament/MatchCard.tsx` (+test) | 描画データに `loserOf` / `bracket` / bye 伝播 / 敗者待ち表示 |
| Modify `src/features/bracket/layout-bracket.ts`, `to-flow-elements.ts` (+tests) | 3 エリアのレイアウトとセクションラベル |
| Create `src/components/tournament/SectionNode.tsx`; Modify `TournamentFlow.tsx`, `DivisionBracket.tsx`, `DivisionMatchingView.tsx` (+tests) | 表示の配線 |

---

### Task 1: DE 組み合わせ生成（純粋関数）

**Files:**
- Create: `src/features/division/double-elimination/build.ts`
- Test: `src/features/division/double-elimination/build.test.ts`

**Interfaces:**
- Consumes: `buildFromSlots(slots: SlotSource[]): MatchingConfig`, `toSlots(config: MatchingConfig): SlotSource[]`（`src/features/division/single-elimination/build.ts`）、`validateMatchingConfig(config: MatchingConfig, entries: DivisionEntries): ValidationErrors`（`src/lib/division/validate.ts`、正常時は空配列）
- Produces:
  - `export type DoubleEliminationVariant = "grandFinal" | "thirdPlace";`
  - `export const buildDoubleElimination: (slots: SlotSource[], variant: DoubleEliminationVariant) => MatchingConfig;`
  - `export const isDoubleEliminationShape: (config: MatchingConfig, variant: DoubleEliminationVariant) => boolean;`

- [ ] **Step 1: Write the failing test**

`src/features/division/double-elimination/build.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type {
  BracketMatch,
  DivisionEntries,
  MatchingConfig,
  SlotSource,
} from "@/lib/division/types";
import { validateMatchingConfig } from "@/lib/division/validate";
import { buildFromSlots, toSlots } from "../single-elimination/build";
import { generateSlots } from "../single-elimination/edit";
import {
  buildDoubleElimination,
  type DoubleEliminationVariant,
  isDoubleEliminationShape,
} from "./build";

const entriesOf = (count: number): DivisionEntries => ({
  version: 1,
  entries: Array.from({ length: count }, (_, index) => ({
    id: `e${index + 1}`,
    participantId: `p${index + 1}`,
    seed: index,
  })),
});

const build = (count: number, variant: DoubleEliminationVariant) =>
  buildDoubleElimination(generateSlots(entriesOf(count).entries), variant);

const inBracket = (config: MatchingConfig, bracket: BracketMatch["bracket"]) =>
  config.matches.filter((match) => match.bracket === bracket);

const byId = (config: MatchingConfig, id: string): BracketMatch => {
  const found = config.matches.find((match) => match.id === id);
  if (!found) throw new Error(`no match ${id}`);
  return found;
};

/** 参照の回数を数える。「勝者／敗者がちょうど 1 回だけ送られる」の検査用。 */
const referenceCount = (
  config: MatchingConfig,
  kind: "winnerOf" | "loserOf",
  matchId: string,
): number =>
  config.matches
    .flatMap((match) => match.slots)
    .filter(
      (slot: SlotSource) => slot.kind === kind && slot.matchId === matchId,
    ).length;

describe("buildDoubleElimination", () => {
  it("エントリー 2 人以下は空を返す", () => {
    expect(build(2, "grandFinal")).toEqual({ version: 1, matches: [] });
    expect(build(2, "thirdPlace")).toEqual({ version: 1, matches: [] });
    expect(buildDoubleElimination([], "grandFinal")).toEqual({
      version: 1,
      matches: [],
    });
  });

  it.each([
    [3, 4],
    [4, 4],
    [5, 8],
    [8, 8],
    [16, 16],
  ])("%i 人（枠 %i）の試合数", (count, size) => {
    const grand = build(count, "grandFinal");
    expect(inBracket(grand, "winners")).toHaveLength(size - 1);
    expect(inBracket(grand, "losers")).toHaveLength(size - 2);
    expect(inBracket(grand, "final")).toHaveLength(1);

    const third = build(count, "thirdPlace");
    expect(inBracket(third, "winners")).toHaveLength(size - 1);
    expect(inBracket(third, "losers")).toHaveLength(size - 3);
    expect(inBracket(third, "final")).toHaveLength(0);
  });

  it("勝者側は buildFromSlots と同じ試合を先頭に持つ", () => {
    const slots = generateSlots(entriesOf(8).entries);
    const winners = buildFromSlots(slots).matches;
    expect(
      buildDoubleElimination(slots, "grandFinal").matches.slice(
        0,
        winners.length,
      ),
    ).toEqual(winners);
  });

  it.each([3, 4, 5, 8, 16])(
    "%i 人で validateMatchingConfig を通る",
    (count) => {
      for (const variant of ["grandFinal", "thirdPlace"] as const) {
        expect(
          validateMatchingConfig(build(count, variant), entriesOf(count)),
        ).toEqual([]);
      }
    },
  );

  it("試合番号と sequence は勝者側 → 敗者側 → 決勝の順の連番", () => {
    const config = build(8, "grandFinal");
    config.matches.forEach((match, index) => {
      expect(match.sequence).toBe(index);
      expect(match.matchNumber).toBe(String(index + 1));
    });
    const sides = config.matches.map((match) => match.bracket);
    expect(sides.indexOf("losers")).toBe(7);
    expect(sides.at(-1)).toBe("final");
  });

  it("grandFinal: 全試合の敗者と、決勝以外の全試合の勝者がちょうど 1 回ずつ送られる", () => {
    const config = build(16, "grandFinal");
    for (const match of config.matches) {
      if (match.bracket === "final") {
        expect(referenceCount(config, "winnerOf", match.id)).toBe(0);
        continue;
      }
      expect(referenceCount(config, "winnerOf", match.id)).toBe(1);
      expect(referenceCount(config, "loserOf", match.id)).toBe(
        match.bracket === "winners" ? 1 : 0,
      );
    }
  });

  it("thirdPlace: 勝者側決勝と敗者側決勝はどこにも送られない", () => {
    const config = build(16, "thirdPlace");
    const winnersFinal = byId(config, "m4-0");
    const losers = inBracket(config, "losers");
    const losersFinal = losers[losers.length - 1];
    for (const match of config.matches) {
      const terminal =
        match.id === winnersFinal.id || match.id === losersFinal.id;
      expect(referenceCount(config, "winnerOf", match.id)).toBe(
        terminal ? 0 : 1,
      );
      expect(referenceCount(config, "loserOf", match.id)).toBe(
        match.bracket === "winners" && !terminal ? 1 : 0,
      );
    }
  });

  it("round は全ブラケット通し（敗者側 L は L + 1、決勝は 2k）", () => {
    const config = build(8, "grandFinal");
    expect(byId(config, "l1-0").round).toBe(2);
    expect(byId(config, "l4-0").round).toBe(5);
    expect(byId(config, "f")).toMatchObject({
      bracket: "final",
      round: 6,
      order: 0,
      slots: [
        { kind: "winnerOf", matchId: "m3-0" },
        { kind: "winnerOf", matchId: "l4-0" },
      ],
    });
  });

  it("敗者側 1 ラウンド目は勝者側 1 回戦の敗者どうし", () => {
    const config = build(8, "grandFinal");
    expect(byId(config, "l1-1").slots).toEqual([
      { kind: "loserOf", matchId: "m1-2" },
      { kind: "loserOf", matchId: "m1-3" },
    ]);
  });

  it("合流ラウンドの敗者の並びは 逆順 → 正順 と交互になる", () => {
    const config = build(16, "grandFinal");
    // 勝者側 2 回戦の敗者（l2）は逆順
    expect(byId(config, "l2-0").slots).toEqual([
      { kind: "winnerOf", matchId: "l1-0" },
      { kind: "loserOf", matchId: "m2-3" },
    ]);
    expect(byId(config, "l2-3").slots[1]).toEqual({
      kind: "loserOf",
      matchId: "m2-0",
    });
    // 勝者側 3 回戦の敗者（l4）は正順
    expect(byId(config, "l4-0").slots).toEqual([
      { kind: "winnerOf", matchId: "l3-0" },
      { kind: "loserOf", matchId: "m3-0" },
    ]);
    // 内部ラウンド
    expect(byId(config, "l3-1").slots).toEqual([
      { kind: "winnerOf", matchId: "l2-2" },
      { kind: "winnerOf", matchId: "l2-3" },
    ]);
  });

  it("thirdPlace で 4 人なら敗者側は 1 試合（3 位決定戦）", () => {
    const config = build(4, "thirdPlace");
    expect(inBracket(config, "losers")).toEqual([
      expect.objectContaining({
        id: "l1-0",
        slots: [
          { kind: "loserOf", matchId: "m1-0" },
          { kind: "loserOf", matchId: "m1-1" },
        ],
      }),
    ]);
  });
});

describe("isDoubleEliminationShape", () => {
  it("空の組み合わせは true", () => {
    expect(
      isDoubleEliminationShape({ version: 1, matches: [] }, "grandFinal"),
    ).toBe(true);
  });

  it("生成したものは同じバリアントで true、別バリアントで false", () => {
    const config = build(8, "grandFinal");
    expect(isDoubleEliminationShape(config, "grandFinal")).toBe(true);
    expect(isDoubleEliminationShape(config, "thirdPlace")).toBe(false);
  });

  it("試合番号や実施順を変えても true", () => {
    const config = build(8, "thirdPlace");
    const edited: MatchingConfig = {
      version: 1,
      matches: [...config.matches].reverse().map((match, index) => ({
        ...match,
        sequence: index,
        matchNumber: `A${index}`,
      })),
    };
    expect(isDoubleEliminationShape(edited, "thirdPlace")).toBe(true);
  });

  it("シングルエリミネーションの木は false", () => {
    const slots = generateSlots(entriesOf(8).entries);
    expect(isDoubleEliminationShape(buildFromSlots(slots), "grandFinal")).toBe(
      false,
    );
  });

  it("toSlots で勝者側 1 回戦を取り出せる", () => {
    const slots = generateSlots(entriesOf(6).entries);
    expect(toSlots(buildDoubleElimination(slots, "grandFinal"))).toEqual(slots);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/features/division/double-elimination/build.test.ts`
Expected: FAIL（`./build` が存在しない）

- [ ] **Step 3: Write the implementation**

`src/features/division/double-elimination/build.ts`:

```ts
import type {
  BracketMatch,
  MatchingConfig,
  SlotSource,
} from "@/lib/division/types";
import { buildFromSlots, toSlots } from "../single-elimination/build";

/**
 * grandFinal: 勝者側優勝と敗者側優勝が決勝を戦う（再戦なし）。
 * thirdPlace: 決勝を持たず、敗者側優勝が 3 位。
 */
export type DoubleEliminationVariant = "grandFinal" | "thirdPlace";

/** 勝者側の id。buildFromSlots と同じ規則。 */
const winnersId = (round: number, order: number): string =>
  `m${round}-${order}`;
/** 敗者側の id。L は敗者側内でのラウンド番号（1 始まり）。 */
const losersId = (losersRound: number, order: number): string =>
  `l${losersRound}-${order}`;
const FINAL_ID = "f";

const winnerOf = (matchId: string): SlotSource => ({
  kind: "winnerOf",
  matchId,
});
const loserOf = (matchId: string): SlotSource => ({ kind: "loserOf", matchId });

/**
 * 勝者側 1 回戦のスロット割当からダブルエリミネーションの組み合わせを作る。
 *
 * 勝者側は buildFromSlots そのもの。敗者側は、
 *   L1: 勝者側 1 回戦の敗者どうし
 *   以降: 合流ラウンド（敗者側の勝者 vs 勝者側 r 回戦の敗者）と
 *         内部ラウンド（敗者側の勝者どうし）の繰り返し
 * で組む。合流する敗者の並びは 逆順 → 正順 … と交互にして、
 * 直前に当たった相手との早期再戦を避ける。
 *
 * round は全ブラケット通しの番号にする（敗者側 L は L + 1、決勝は 2k）。
 * validateMatchingConfig の「参照先の round は自分より小さい」と、
 * resolver の round 順 1 パス解決をそのまま使うため。
 *
 * 枠が 4 未満（エントリー 2 人以下）では敗者側が作れないので空を返す。
 */
export const buildDoubleElimination = (
  slots: SlotSource[],
  variant: DoubleEliminationVariant,
): MatchingConfig => {
  const winners = buildFromSlots(slots).matches;
  const firstRoundCount = winners.filter((match) => match.round === 1).length;
  if (firstRoundCount < 2) {
    return { version: 1, matches: [] };
  }
  const winnersRounds = Math.log2(firstRoundCount * 2);

  const matches: BracketMatch[] = [...winners];
  const push = (
    id: string,
    bracket: BracketMatch["bracket"],
    round: number,
    order: number,
    matchSlots: [SlotSource, SlotSource],
  ): string => {
    matches.push({
      id,
      bracket,
      round,
      order,
      sequence: matches.length,
      matchNumber: String(matches.length + 1),
      slots: matchSlots,
    });
    return id;
  };

  let losersRound = 1;
  let previous: string[] = [];
  for (let order = 0; order < firstRoundCount / 2; order += 1) {
    previous.push(
      push(losersId(losersRound, order), "losers", losersRound + 1, order, [
        loserOf(winnersId(1, order * 2)),
        loserOf(winnersId(1, order * 2 + 1)),
      ]),
    );
  }

  // grandFinal は勝者側決勝の敗者も落ちてくる。thirdPlace は準優勝で確定。
  const lastDropRound =
    variant === "grandFinal" ? winnersRounds : winnersRounds - 1;

  for (let winnersRound = 2; winnersRound <= lastDropRound; winnersRound += 1) {
    const reversed = winnersRound % 2 === 0;
    const count = previous.length;

    losersRound += 1;
    const dropped: string[] = [];
    for (let order = 0; order < count; order += 1) {
      const dropOrder = reversed ? count - 1 - order : order;
      dropped.push(
        push(losersId(losersRound, order), "losers", losersRound + 1, order, [
          winnerOf(previous[order]),
          loserOf(winnersId(winnersRound, dropOrder)),
        ]),
      );
    }
    previous = dropped;

    // 合流ラウンドが 1 試合ならそれが敗者側決勝。
    if (count === 1) {
      break;
    }

    losersRound += 1;
    const internal: string[] = [];
    for (let order = 0; order < count / 2; order += 1) {
      internal.push(
        push(losersId(losersRound, order), "losers", losersRound + 1, order, [
          winnerOf(previous[order * 2]),
          winnerOf(previous[order * 2 + 1]),
        ]),
      );
    }
    previous = internal;
  }

  if (variant === "grandFinal") {
    push(FINAL_ID, "final", winnersRounds * 2, 0, [
      winnerOf(winnersId(winnersRounds, 0)),
      winnerOf(previous[0]),
    ]);
  }

  return { version: 1, matches };
};

const slotKey = (slot: SlotSource): string => {
  switch (slot.kind) {
    case "entry":
      return `entry:${slot.entryId}`;
    case "winnerOf":
    case "loserOf":
      return `${slot.kind}:${slot.matchId}`;
    case "bye":
      return "bye";
  }
};

/** 構造だけの署名。試合番号と実施順は編集できるので比較に含めない。 */
const structureSignature = (config: MatchingConfig): string =>
  config.matches
    .map((match) =>
      [
        match.id,
        match.bracket,
        match.round,
        match.order,
        slotKey(match.slots[0]),
        slotKey(match.slots[1]),
      ].join("|"),
    )
    .sort()
    .join("\n");

/**
 * 保存されている組み合わせがこのバリアントのダブルエリミネーションの形か。
 *
 * /edit は format を無条件に書き換えられるため、別形式の組み合わせを
 * 持ったまま DE になった部門が存在しうる。勝者側 1 回戦から作り直した
 * ものと構造が一致するかで判定する（敗者側は常に自動導出なので、
 * 一致しない＝この画面が扱えない形）。空は「まだ作っていない」なので true。
 */
export const isDoubleEliminationShape = (
  config: MatchingConfig,
  variant: DoubleEliminationVariant,
): boolean => {
  if (config.matches.length === 0) {
    return true;
  }
  return (
    structureSignature(config) ===
    structureSignature(buildDoubleElimination(toSlots(config), variant))
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/features/division/double-elimination/build.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/division/double-elimination
git commit -m "feat(division): build double elimination matching from first-round slots"
```

---

### Task 2: resolver の bye 伝播（`lib/division/resolve.ts`）

**Files:**
- Modify: `src/lib/division/resolve.ts`（`resolveMatchSlots` 内の `resolveSlot`）
- Test: `src/lib/division/resolve.test.ts`

**Interfaces:**
- Produces: `resolveMatchSlots` の挙動変更のみ（シグネチャ不変）
  1. 片側でも BYE の試合の `loserOf` → `{ state: "bye" }`
  2. 両側 BYE の試合の `winnerOf` → `{ state: "bye" }`

- [ ] **Step 1: Write the failing tests**

`src/lib/division/resolve.test.ts` の `describe("resolveMatchSlots", ...)` 内（既存の `match` ヘルパーを使う）に追加。既存テストで「BYE 試合の `loserOf` が pending」を期待しているものがあれば、`{ state: "bye" }` を期待するよう書き換える（`grep -n "loserOf" src/lib/division/resolve.test.ts` で確認）。

```ts
  describe("BYE の伝播", () => {
    const byeConfig: MatchingConfig = {
      version: 1,
      matches: [
        match("m1-0", 1, 0, [
          { kind: "entry", entryId: "e1" },
          { kind: "entry", entryId: "e2" },
        ]),
        match("m1-1", 1, 1, [{ kind: "entry", entryId: "e3" }, { kind: "bye" }]),
        match("m1-2", 1, 2, [{ kind: "bye" }, { kind: "bye" }]),
        match("l1-0", 2, 0, [
          { kind: "loserOf", matchId: "m1-0" },
          { kind: "loserOf", matchId: "m1-1" },
        ]),
        match("m2-0", 2, 1, [
          { kind: "winnerOf", matchId: "m1-1" },
          { kind: "winnerOf", matchId: "m1-2" },
        ]),
        match("l1-1", 2, 2, [
          { kind: "loserOf", matchId: "m1-2" },
          { kind: "entry", entryId: "e4" },
        ]),
      ],
    };
    const noResults: DivisionResults = { version: 1, matches: [] };

    it("BYE を含む試合の敗者は bye になる", () => {
      const resolved = resolveMatchSlots(byeConfig, noResults);
      expect(resolved.get("l1-0")?.slots[1]).toEqual({ state: "bye" });
      expect(resolved.get("l1-1")?.slots[0]).toEqual({ state: "bye" });
    });

    it("BYE どうしの試合の勝者は bye になる", () => {
      const resolved = resolveMatchSlots(byeConfig, noResults);
      expect(resolved.get("m2-0")?.slots[1]).toEqual({ state: "bye" });
      // 相手が bye なので e3 が自動で勝ち上がる
      expect(resolved.get("m2-0")?.winnerEntryId).toBe("e3");
    });

    it("伝播した bye の相手は、相手が決まれば自動で勝ち上がる", () => {
      const resolved = resolveMatchSlots(byeConfig, {
        version: 1,
        matches: [{ matchId: "m1-0", winnerEntryId: "e1" }],
      });
      expect(resolved.get("l1-0")?.slots).toEqual([
        { state: "entry", entryId: "e2" },
        { state: "bye" },
      ]);
      expect(resolved.get("l1-0")?.winnerEntryId).toBe("e2");
      expect(resolved.get("l1-1")?.winnerEntryId).toBe("e4");
    });

    it("BYE 試合の相手が未確定でも敗者は bye と分かる", () => {
      const pendingConfig: MatchingConfig = {
        version: 1,
        matches: [
          ...byeConfig.matches.slice(0, 2),
          match("m2-0", 2, 0, [
            { kind: "winnerOf", matchId: "m1-0" },
            { kind: "bye" },
          ]),
          match("l2-0", 3, 0, [
            { kind: "loserOf", matchId: "m2-0" },
            { kind: "entry", entryId: "e4" },
          ]),
        ],
      };
      const resolved = resolveMatchSlots(pendingConfig, noResults);
      expect(resolved.get("l2-0")?.slots[0]).toEqual({ state: "bye" });
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/division/resolve.test.ts`
Expected: FAIL（`{ state: "pending" }` が返る）

- [ ] **Step 3: Implement**

`src/lib/division/resolve.ts` の `resolveSlot` の `winnerOf` / `loserOf` 分岐を次に置き換える:

```ts
      case "winnerOf": {
        const origin = resolved.get(source.matchId);
        if (origin === undefined) {
          return { state: "pending" };
        }
        // BYE どうしの試合からは誰も勝ち上がってこない。pending にすると
        // 次の試合が永久に進まないため、空き枠として扱う。
        if (origin.slots.every((slot) => slot.state === "bye")) {
          return { state: "bye" };
        }
        return origin.winnerEntryId === null
          ? { state: "pending" }
          : { state: "entry", entryId: origin.winnerEntryId };
      }
      case "loserOf": {
        const origin = resolved.get(source.matchId);
        if (origin === undefined) {
          return { state: "pending" };
        }
        // BYE を含む試合は不戦勝なので敗者が生まれない。ダブルエリミの
        // 敗者側で pending のまま止まらないよう、空き枠として扱う。
        if (origin.slots.some((slot) => slot.state === "bye")) {
          return { state: "bye" };
        }
        if (origin.winnerEntryId === null) {
          return { state: "pending" };
        }
        const loser = origin.slots
          .filter(isEntry)
          .find((slot) => slot.entryId !== origin.winnerEntryId);
        return loser !== undefined
          ? { state: "entry", entryId: loser.entryId }
          : { state: "pending" };
      }
```

- [ ] **Step 4: Run tests**

Run: `pnpm test src/lib/division src/features/schedule src/features/division`
Expected: PASS（BYE 対 BYE を pending と期待していた既存テストがあれば、新しい規則に合わせて期待値を直す）

- [ ] **Step 5: Commit**

```bash
git add src/lib/division/resolve.ts src/lib/division/resolve.test.ts
git commit -m "fix(division): treat unreachable slots behind bye matches as bye"
```

---

### Task 3: 位置ラベルを敗者側・決勝に対応（`lib/division/label.ts`）

**Files:**
- Modify: `src/lib/division/label.ts`（`matchPositionLabel`）
- Test: `src/lib/division/label.test.ts`

**Interfaces:**
- Produces: `matchPositionLabel(match: BracketMatch, format: DivisionFormat): string`（シグネチャ不変）
  - `ROUND_ROBIN` → `第{sequence+1}試合`（既存）
  - `SINGLE_ELIMINATION` → `{round}回戦 第{order+1}試合`（既存）
  - DE 2 形式: winners → `勝者側{round}回戦 第{order+1}試合`、losers → `敗者側{round-1}回戦 第{order+1}試合`、final → `決勝`

- [ ] **Step 1: Write the failing test**

`describe("matchPositionLabel（形式ごとの文言）", ...)` 内に追加:

```ts
    it("ダブルエリミネーションはブラケットごとの回戦で表す", () => {
      expect(matchPositionLabel(match, "DOUBLE_ELIMINATION_GRAND_FINAL")).toBe(
        "勝者側2回戦 第2試合",
      );
      expect(
        matchPositionLabel(
          { ...match, bracket: "losers", round: 3, order: 0 },
          "DOUBLE_ELIMINATION_THIRD_PLACE",
        ),
      ).toBe("敗者側2回戦 第1試合");
      expect(
        matchPositionLabel(
          { ...match, bracket: "final", round: 6, order: 0 },
          "DOUBLE_ELIMINATION_GRAND_FINAL",
        ),
      ).toBe("決勝");
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/division/label.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

`matchPositionLabel` を置き換え（JSDoc は既存を残し、DE の説明を 1 行足す）:

```ts
export const matchPositionLabel = (
  match: BracketMatch,
  format: DivisionFormat,
): string => {
  if (format === "ROUND_ROBIN") {
    return `第${match.sequence + 1}試合`;
  }
  if (format === "SINGLE_ELIMINATION") {
    return `${match.round}回戦 第${match.order + 1}試合`;
  }
  // ダブルエリミの round は全ブラケット通しの番号（敗者側 L は L + 1）。
  switch (match.bracket) {
    case "winners":
      return `勝者側${match.round}回戦 第${match.order + 1}試合`;
    case "losers":
      return `敗者側${match.round - 1}回戦 第${match.order + 1}試合`;
    case "final":
      return "決勝";
  }
};
```

- [ ] **Step 4: Run test**

Run: `pnpm test src/lib/division/label.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/division/label.ts src/lib/division/label.test.ts
git commit -m "feat(division): position labels for losers bracket and grand final"
```

---

### Task 4: 編集画面を DE に開放（strategy・エラー・スライス・画面）

**Files:**
- Modify: `src/features/division/matching-strategy.ts`, `matching-strategy.test.ts`
- Modify: `src/features/division/errors.ts`, `errors.test.ts`, `messages.ts`, `messages.test.ts`
- Modify: `src/features/division/generate-matching/repository.ts`, `generate-matching/handler.test.ts`, `generate-matching/repository.test.ts`
- Modify: `src/features/division/swap-slots/repository.ts`
- Modify: `src/features/division/format.ts`, `format.test.ts`
- Modify: `src/components/division/DivisionDetail.tsx`
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.tsx`
- Modify: `src/components/division/DivisionSetup.tsx`

**Interfaces:**
- Consumes: `buildDoubleElimination`, `isDoubleEliminationShape`, `DoubleEliminationVariant`（Task 1）
- Produces（`matching-strategy.ts`）:
  - `EDITABLE_FORMATS` に `"DOUBLE_ELIMINATION_GRAND_FINAL"`, `"DOUBLE_ELIMINATION_THIRD_PLACE"`
  - `export const minEntries: (format: EditableFormat) => number;`（SE 2 / RR 2 / DE 3）
  - `export type SlotBracketFormat = "SINGLE_ELIMINATION" | "DOUBLE_ELIMINATION_GRAND_FINAL" | "DOUBLE_ELIMINATION_THIRD_PLACE";`
  - `export const isSlotBracketFormat: (format: DivisionFormat) => format is SlotBracketFormat;`
  - `export const buildSlotBracket: (format: SlotBracketFormat, slots: SlotSource[]) => MatchingConfig;`
  - `export const matchesSlotBracketShape: (format: SlotBracketFormat, config: MatchingConfig) => boolean;`
- Produces（`errors.ts`）: `DivisionNotEnoughEntriesError` のフィールドに `readonly minimum: number`

- [ ] **Step 1: Write the failing tests**

`src/features/division/matching-strategy.test.ts`:

- import に `buildDoubleElimination`（`./double-elimination/build`）と `buildSlotBracket, isSlotBracketFormat, matchesSlotBracketShape, minEntries` を追加
- `isEditableFormat` のテストを置き換え:

```ts
describe("isEditableFormat", () => {
  it("全形式が編集画面を持つ", () => {
    expect(isEditableFormat("SINGLE_ELIMINATION")).toBe(true);
    expect(isEditableFormat("ROUND_ROBIN")).toBe(true);
    expect(isEditableFormat("DOUBLE_ELIMINATION_GRAND_FINAL")).toBe(true);
    expect(isEditableFormat("DOUBLE_ELIMINATION_THIRD_PLACE")).toBe(true);
  });
});
```

- 追加:

```ts
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
```

`src/features/division/messages.test.ts`: `new DivisionNotEnoughEntriesError({ divisionId: "d1" })` を `new DivisionNotEnoughEntriesError({ divisionId: "d1", minimum: 3 })` にし、期待文言を `"組み合わせを作るにはエントリーが3人以上必要です"` にする。
`src/features/division/errors.test.ts:91` と `generate-matching/handler.test.ts:94` も `minimum: 2` を足す（handler の期待文言が `2人以上` ならそのまま通る）。

`src/features/division/format.test.ts`: `needsParticipants("DOUBLE_ELIMINATION_GRAND_FINAL")` / `THIRD_PLACE` の期待値を `true` に変える。

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/features/division`
Expected: FAIL（`minEntries` などが未定義、文言不一致）

- [ ] **Step 3: Implement `matching-strategy.ts`**

import を次にする:

```ts
import type { DivisionFormat } from "@/generated/prisma/enums";
import type {
  DivisionEntry,
  MatchingConfig,
  SlotSource,
} from "@/lib/division/types";
import {
  buildDoubleElimination,
  type DoubleEliminationVariant,
  isDoubleEliminationShape,
} from "./double-elimination/build";
import { buildRoundRobin } from "./round-robin/build";
import {
  buildFromSlots,
  isSingleEliminationShape,
  toSlots,
} from "./single-elimination/build";
import { generateSlots, placeEntry } from "./single-elimination/edit";
```

`EDITABLE_FORMATS` と `MAX_ENTRIES` を置き換え、`MIN_ENTRIES` とスロット型ディスパッチを足す:

```ts
export const EDITABLE_FORMATS = [
  "SINGLE_ELIMINATION",
  "ROUND_ROBIN",
  "DOUBLE_ELIMINATION_GRAND_FINAL",
  "DOUBLE_ELIMINATION_THIRD_PLACE",
] as const satisfies readonly DivisionFormat[];
```

```ts
const MAX_ENTRIES: Record<EditableFormat, number> = {
  SINGLE_ELIMINATION: 128,
  ROUND_ROBIN: 16,
  // 敗者側を含めると試合数がおよそ 2 倍になる。1 部門として回せる規模で切る。
  DOUBLE_ELIMINATION_GRAND_FINAL: 64,
  DOUBLE_ELIMINATION_THIRD_PLACE: 64,
};

export const maxEntries = (format: EditableFormat): number =>
  MAX_ENTRIES[format];

/**
 * 組み合わせを作るのに必要なエントリー数。ダブルエリミは 2 人だと
 * 敗者側が作れない（buildDoubleElimination が空を返す）ので 3 人から。
 */
const MIN_ENTRIES: Record<EditableFormat, number> = {
  SINGLE_ELIMINATION: 2,
  ROUND_ROBIN: 2,
  DOUBLE_ELIMINATION_GRAND_FINAL: 3,
  DOUBLE_ELIMINATION_THIRD_PLACE: 3,
};

export const minEntries = (format: EditableFormat): number =>
  MIN_ENTRIES[format];

/**
 * 勝者側 1 回戦のスロット割当を唯一の情報源にする形式。
 * 1 回戦の入れ替え（swap-slots）と D&D エディタはこれらでだけ意味を持つ。
 */
export type SlotBracketFormat = Exclude<EditableFormat, "ROUND_ROBIN">;

export const isSlotBracketFormat = (
  format: DivisionFormat,
): format is SlotBracketFormat =>
  format === "SINGLE_ELIMINATION" ||
  format === "DOUBLE_ELIMINATION_GRAND_FINAL" ||
  format === "DOUBLE_ELIMINATION_THIRD_PLACE";

const VARIANTS: Record<
  Exclude<SlotBracketFormat, "SINGLE_ELIMINATION">,
  DoubleEliminationVariant
> = {
  DOUBLE_ELIMINATION_GRAND_FINAL: "grandFinal",
  DOUBLE_ELIMINATION_THIRD_PLACE: "thirdPlace",
};

/** 1 回戦のスロット割当から、形式に応じた組み合わせを作る。 */
export const buildSlotBracket = (
  format: SlotBracketFormat,
  slots: SlotSource[],
): MatchingConfig =>
  format === "SINGLE_ELIMINATION"
    ? buildFromSlots(slots)
    : buildDoubleElimination(slots, VARIANTS[format]);

/** 保存済みの組み合わせが、この形式の画面で部分編集できる形か。 */
export const matchesSlotBracketShape = (
  format: SlotBracketFormat,
  config: MatchingConfig,
): boolean =>
  format === "SINGLE_ELIMINATION"
    ? isSingleEliminationShape(config)
    : isDoubleEliminationShape(config, VARIANTS[format]);
```

注意: `isSingleEliminationShape` は DE の組み合わせ（2 回戦以降に `loserOf` がある）を false にするので、`matchesSlotBracketShape("SINGLE_ELIMINATION", de)` は false になる。

3 つの switch に DE を足す:

```ts
// regenerateMatching
    case "SINGLE_ELIMINATION":
    case "DOUBLE_ELIMINATION_GRAND_FINAL":
    case "DOUBLE_ELIMINATION_THIRD_PLACE":
      return buildSlotBracket(format, generateSlots(entries));
    case "ROUND_ROBIN":
      return buildRoundRobinWithinCap(entries);
```

```ts
// applyEntryAdded（既存の SINGLE_ELIMINATION のコメントは残し、ケースをまとめる）
    case "SINGLE_ELIMINATION":
    case "DOUBLE_ELIMINATION_GRAND_FINAL":
    case "DOUBLE_ELIMINATION_THIRD_PLACE":
      // （既存コメント）
      if (!matchesSlotBracketShape(format, current)) {
        return current;
      }
      return buildSlotBracket(
        format,
        placeEntry(toSlots(current), addedEntryId),
      );
    case "ROUND_ROBIN":
      return buildRoundRobin(entries);
```

```ts
// applyEntryReordered
    case "SINGLE_ELIMINATION":
    case "DOUBLE_ELIMINATION_GRAND_FINAL":
    case "DOUBLE_ELIMINATION_THIRD_PLACE":
      return current;
    case "ROUND_ROBIN":
      return buildRoundRobinWithinCap(entries);
```

- [ ] **Step 4: Implement errors / messages / generate-matching**

`src/features/division/errors.ts`:

```ts
/** 組み合わせを作るにはエントリーが足りないことを表す。minimum は形式ごとの必要人数。 */
export class DivisionNotEnoughEntriesError extends Data.TaggedError(
  "DivisionNotEnoughEntriesError",
)<{
  readonly divisionId: string;
  readonly minimum: number;
}> {}
```

`src/features/division/messages.ts`:

```ts
    Match.tag(
      "DivisionNotEnoughEntriesError",
      (error) => `組み合わせを作るにはエントリーが${error.minimum}人以上必要です`,
    ),
```

`src/features/division/generate-matching/repository.ts`: import に `minEntries` を足し、throw を置き換える:

```ts
    // 必要人数に満たないと組み合わせが作れない（builder が空を返す）。
    // 黙って空を書くと「生成した」と読めてしまうので弾く。
    if (matchingConfig.matches.length === 0) {
      throw new DivisionNotEnoughEntriesError({
        divisionId: ids.divisionId,
        minimum: minEntries(current.format),
      });
    }
```

`grep -rn "DivisionNotEnoughEntriesError(" src` で残りの生成箇所を探し、すべてに `minimum` を足す。

- [ ] **Step 5: Implement swap-slots / format / detail link / setup page / DivisionSetup**

`src/features/division/swap-slots/repository.ts`: `../single-elimination/build` の import を削除し、`import { buildSlotBracket, isSlotBracketFormat, matchesSlotBracketShape } from "../matching-strategy";` と `import { toSlots } from "../single-elimination/build";` にする。本体の該当箇所:

```ts
    const format = current.format;
    // 1 回戦スロットの入れ替えはスロット型ブラケットにしか意味が無い。
    // 存在を漏らさないため、対象外の形式は「その部門は無い」と同じに倒す。
    if (!isSlotBracketFormat(format)) {
      return { next: null, value: { swapped: false } };
    }

    // （既存コメント）
    if (!matchesSlotBracketShape(format, current.matchingConfig)) {
      return { next: null, value: { swapped: false } };
    }
    // ...swapSlots はそのまま...
    return {
      next: {
        format,
        entries: current.entries,
        matchingConfig: buildSlotBracket(format, slots),
      },
      value: { swapped: true },
    };
```

`src/features/division/format.ts` の `USES_PARTICIPANTS`: DE 2 形式を `true`。

`src/components/division/DivisionDetail.tsx` の `SETUP_LINKS`:

```ts
  DOUBLE_ELIMINATION_GRAND_FINAL: {
    segment: "setup",
    label: "エントリー・組み合わせ",
  },
  DOUBLE_ELIMINATION_THIRD_PLACE: {
    segment: "setup",
    label: "エントリー・組み合わせ",
  },
```

`setup/page.tsx`: `import { isSlotBracketFormat } from "@/features/division/matching-strategy";` を足し、ガードを置き換える（コメントの「SINGLE_ELIMINATION を編集するため」を「トーナメント形式（SE・DE）を編集するため」に直す）:

```ts
  // リーグには専用画面（/league）がある。案内を出すより 404 に倒す。
  if (!isSlotBracketFormat(division.format)) {
    notFound();
  }
```

`src/components/division/DivisionSetup.tsx`:
- `isSingleEliminationShape` の import を `import { isSlotBracketFormat, matchesSlotBracketShape } from "@/features/division/matching-strategy";` に置き換え
- 先頭のガード:

```ts
  const format = division.format;
  if (!isSlotBracketFormat(format)) {
    return (
      <Notice>
        「{DIVISION_FORMAT_LABELS[format]}
        」はこの画面では編集できません
      </Notice>
    );
  }
```

- `const mismatched = !isSingleEliminationShape(parsed.matchingConfig);` を `const mismatched = !matchesSlotBracketShape(format, parsed.matchingConfig);` に

- [ ] **Step 6: Run tests, typecheck**

Run: `pnpm test src/features/division src/components/division` then `pnpm typecheck`
Expected: PASS。`setup-store.test.ts` や `DivisionDetail` / `DivisionSetup` のテストで「DE は編集不可」を前提にした期待があれば、新仕様（編集可）に合わせて直す。

- [ ] **Step 7: Commit**

```bash
git add src/features/division src/components/division "src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.tsx"
git commit -m "feat(division): open setup screen for double elimination formats"
```

---

### Task 5: 描画データに loserOf・bracket・bye 伝播（`features/bracket`）

**Files:**
- Modify: `src/features/bracket/types.ts`
- Modify: `src/features/bracket/from-division.ts`, `from-division.test.ts`
- Modify: `src/features/bracket/resolve-bracket.ts`, `resolve-bracket.test.ts`
- Modify: `src/components/tournament/MatchCard.tsx`, `MatchCard.test.tsx`

**Interfaces:**
- Consumes: `buildDoubleElimination`（Task 1、テストデータ作成用）
- Produces（`types.ts`）:
  - `SlotSource` に `| { kind: "loserOf"; matchId: string }`
  - `export type BracketSide = "winners" | "losers" | "final";`
  - `Match.bracket?: BracketSide`（省略時 winners。mock データを壊さないため optional）
  - `ResolvedSlot.pendingLabel?: string`（pending の説明。`loserOf` のとき `第N試合の敗者`）
  - `ResolvedMatch.bracket?: BracketSide`（resolveBracket は常に埋める）
- `fromDivision` は SE と DE 2 形式を受け付ける

- [ ] **Step 1: Write the failing tests**

`src/features/bracket/resolve-bracket.test.ts` に追加（ファイル先頭の import に `Bracket`, `Participant` 型が無ければ `./types` から足す）:

```ts
describe("resolveBracket（敗者側）", () => {
  const players: Participant[] = [
    { id: "a", name: "A", seed: 0 },
    { id: "b", name: "B", seed: 1 },
    { id: "c", name: "C", seed: 2 },
  ];
  const bracket: Bracket = {
    id: "b1",
    name: "DE",
    matches: [
      {
        id: "m1-0",
        bracket: "winners",
        round: 1,
        order: 0,
        matchNumber: "1",
        slots: [
          { kind: "participant", participantId: "a" },
          { kind: "participant", participantId: "b" },
        ],
      },
      {
        id: "m1-1",
        bracket: "winners",
        round: 1,
        order: 1,
        matchNumber: "2",
        slots: [{ kind: "participant", participantId: "c" }, { kind: "bye" }],
      },
      {
        id: "l1-0",
        bracket: "losers",
        round: 2,
        order: 0,
        matchNumber: "3",
        slots: [
          { kind: "loserOf", matchId: "m1-0" },
          { kind: "loserOf", matchId: "m1-1" },
        ],
      },
    ],
  };
  const find = (matches: ReturnType<typeof resolveBracket>, id: string) => {
    const found = matches.find((match) => match.id === id);
    if (!found) throw new Error(id);
    return found;
  };

  it("bracket を引き継ぐ（省略時は winners）", () => {
    const resolved = resolveBracket(players, bracket, []);
    expect(find(resolved, "l1-0").bracket).toBe("losers");
  });

  it("敗者が決まる前は pending で「第N試合の敗者」を持つ", () => {
    const slot = find(resolveBracket(players, bracket, []), "l1-0").slots[0];
    expect(slot).toMatchObject({
      state: "pending",
      pendingLabel: "第1試合の敗者",
    });
  });

  it("BYE 試合の敗者は bye になり、相手が決まれば自動で勝ち上がる", () => {
    const resolved = resolveBracket(players, bracket, [
      { matchId: "m1-0", winnerId: "a" },
    ]);
    const losers = find(resolved, "l1-0");
    expect(losers.slots[0]).toMatchObject({
      state: "confirmed",
      participant: { id: "b" },
      isWinner: true,
    });
    expect(losers.slots[1].state).toBe("bye");
    expect(losers.winnerId).toBe("b");
    expect(losers.status).toBe("bye");
  });

  it("BYE どうしの試合の勝者は bye になる", () => {
    const resolved = resolveBracket(
      players,
      {
        id: "b2",
        name: "x",
        matches: [
          {
            id: "m1-0",
            round: 1,
            order: 0,
            slots: [{ kind: "bye" }, { kind: "bye" }],
          },
          {
            id: "m2-0",
            round: 2,
            order: 0,
            slots: [
              { kind: "winnerOf", matchId: "m1-0" },
              { kind: "participant", participantId: "a" },
            ],
          },
        ],
      },
      [],
    );
    const next = find(resolved, "m2-0");
    expect(next.slots[0].state).toBe("bye");
    expect(next.winnerId).toBe("a");
  });
});
```

`src/features/bracket/from-division.test.ts`:
- `"SINGLE_ELIMINATION 以外は null"` を `ROUND_ROBIN` だけを検査する `"ROUND_ROBIN は null"` に変える
- 既存の `toEqual` で `Match` を比較しているテストは、各試合に `bracket: "winners"` を足す
- 追加（`buildInput` は既存ヘルパー。entries は e1..e4 が p1..p4 を指すように上書きする。既存 `buildInput` の participants が足りなければ同じ形で足す）:

```ts
  it("ダブルエリミネーションは loserOf と bracket を保って変換する", () => {
    const entries = {
      version: 1 as const,
      entries: [0, 1, 2, 3].map((seed) => ({
        id: `e${seed + 1}`,
        participantId: `p${seed + 1}`,
        seed,
      })),
    };
    const matchingConfig = buildDoubleElimination(
      generateSlots(entries.entries),
      "grandFinal",
    );
    const converted = fromDivision(
      buildInput({
        format: "DOUBLE_ELIMINATION_GRAND_FINAL",
        entries,
        matchingConfig,
        participants: [1, 2, 3, 4].map((n) => ({ id: `p${n}`, name: `P${n}` })),
      }),
    );
    expect(converted).not.toBeNull();
    const losers = converted?.bracket.matches.find((m) => m.id === "l1-0");
    expect(losers).toMatchObject({
      bracket: "losers",
      slots: [
        { kind: "loserOf", matchId: "m1-0" },
        { kind: "loserOf", matchId: "m1-1" },
      ],
    });
    expect(converted?.bracket.matches.find((m) => m.id === "f")?.bracket).toBe(
      "final",
    );
  });

  it("ダブルエリミネーションで存在しない試合の loserOf は null", () => {
    expect(
      fromDivision(
        buildInput({
          format: "DOUBLE_ELIMINATION_THIRD_PLACE",
          matchingConfig: {
            version: 1,
            matches: [
              {
                id: "l1-0",
                bracket: "losers",
                round: 2,
                order: 0,
                sequence: 0,
                matchNumber: "1",
                slots: [
                  { kind: "loserOf", matchId: "nope" },
                  { kind: "bye" },
                ],
              },
            ],
          },
        }),
      ),
    ).toBeNull();
  });
```

（import: `buildDoubleElimination` from `@/features/division/double-elimination/build`, `generateSlots` from `@/features/division/single-elimination/edit`）

`src/components/tournament/MatchCard.test.tsx` に追加（既存のヘルパーで ResolvedMatch を作る）:

```ts
  it("pending のスロットに説明があればそれを出す", () => {
    render(
      <MatchCard
        match={{
          ...buildMatch(),
          slots: [
            { participant: null, state: "pending", isWinner: false, pendingLabel: "第3試合の敗者" },
            { participant: null, state: "pending", isWinner: false },
          ],
          winnerId: null,
          status: "waiting",
        }}
      />,
    );
    expect(screen.getByText("第3試合の敗者")).toBeInTheDocument();
    expect(screen.getByText("未定")).toBeInTheDocument();
  });
```

（`buildMatch` はファイル内の既存 ResolvedMatch 生成ヘルパー名に合わせる。無ければ既存テストのリテラルをコピーする）

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/features/bracket src/components/tournament`
Expected: FAIL

- [ ] **Step 3: Implement `types.ts`**

```ts
/** 試合スロットが何によって埋まるか。 */
export type SlotSource =
  | { kind: "participant"; participantId: string }
  | { kind: "winnerOf"; matchId: string }
  | { kind: "loserOf"; matchId: string }
  | { kind: "bye" };

/** 試合がどのブラケットに属するか。 */
export type BracketSide = "winners" | "losers" | "final";
```

`Match` に:

```ts
  /** 所属ブラケット。省略時は winners（シングルエリミネーション・mock） */
  bracket?: BracketSide;
```

`ResolvedSlot` に:

```ts
  /** pending のときの説明（「第3試合の敗者」など）。無ければ「未定」と出す */
  pendingLabel?: string;
```

`ResolvedMatch` に:

```ts
  /** 所属ブラケット。resolveBracket は常に埋める */
  bracket?: BracketSide;
```

`sourceMatchIds` のコメントを「各スロットの winnerOf 供給元試合 id。loserOf は線を引かないので null」に直す。

- [ ] **Step 4: Implement `resolve-bracket.ts`**

`winnerByMatchId` を「解決済みの試合」表に置き換える。ファイル全体の差分:

```ts
type Settled = { slots: [ResolvedSlot, ResolvedSlot]; winnerId: string | null };

export function resolveBracket(
  participants: Participant[],
  bracket: Bracket,
  results: MatchResult[],
): ResolvedMatch[] {
  const participantById = new Map(participants.map((p) => [p.id, p]));
  const resultByMatchId = new Map(results.map((r) => [r.matchId, r]));
  const matchIds = new Set(bracket.matches.map((m) => m.id));
  const numberByMatchId = new Map(
    bracket.matches.map((m) => [m.id, m.matchNumber]),
  );
  const settled = new Map<string, Settled>();

  const ordered = [...bracket.matches].sort(
    (a, b) => a.round - b.round || a.order - b.order,
  );

  return ordered.map((match) => {
    const context: SlotContext = {
      participantById,
      matchIds,
      numberByMatchId,
      settled,
    };
    const slots: [ResolvedSlot, ResolvedSlot] = [
      resolveSlot(match.slots[0], context),
      resolveSlot(match.slots[1], context),
    ];
    const sourceMatchIds: [string | null, string | null] = [
      sourceMatchId(match.slots[0]),
      sourceMatchId(match.slots[1]),
    ];

    // 元データの bye だけでなく、前の試合から伝播した bye も不戦勝として扱う。
    const hasBye = slots.some((slot) => slot.state === "bye");
    // ...（winnerId / score の決定、例外、isWinner の設定は既存のまま。
    //      ただし winnerByMatchId.set(...) の行は削除する）

    settled.set(match.id, { slots, winnerId });

    return {
      id: match.id,
      bracket: match.bracket ?? "winners",
      round: match.round,
      order: match.order,
      matchNumber: match.matchNumber ?? null,
      slots,
      winnerId,
      score,
      status: toStatus(hasBye, winnerId, slots),
      sourceMatchIds,
    };
  });
}

type SlotContext = {
  participantById: Map<string, Participant>;
  matchIds: Set<string>;
  numberByMatchId: Map<string, string | undefined>;
  settled: Map<string, Settled>;
};

function resolveSlot(source: SlotSource, context: SlotContext): ResolvedSlot {
  if (source.kind === "bye") {
    return { participant: null, state: "bye", isWinner: false };
  }

  if (source.kind === "participant") {
    return {
      participant: lookupParticipant(
        context.participantById,
        source.participantId,
      ),
      state: "confirmed",
      isWinner: false,
    };
  }

  if (!context.matchIds.has(source.matchId)) {
    throw new Error(`Slot references unknown matchId "${source.matchId}"`);
  }
  const origin = context.settled.get(source.matchId);
  const pending: ResolvedSlot = {
    participant: null,
    state: "pending",
    isWinner: false,
  };
  if (origin === undefined) {
    return pending;
  }

  if (source.kind === "winnerOf") {
    // BYE どうしの試合からは誰も来ない。pending だと先が永久に進まない。
    if (origin.slots.every((slot) => slot.state === "bye")) {
      return { participant: null, state: "bye", isWinner: false };
    }
    if (origin.winnerId === null) {
      return pending;
    }
    return {
      participant: lookupParticipant(context.participantById, origin.winnerId),
      state: "confirmed",
      isWinner: false,
    };
  }

  // loserOf: BYE を含む試合は不戦勝なので敗者が生まれない。
  if (origin.slots.some((slot) => slot.state === "bye")) {
    return { participant: null, state: "bye", isWinner: false };
  }
  const loser =
    origin.winnerId === null
      ? undefined
      : origin.slots.find(
          (slot) =>
            slot.state === "confirmed" &&
            slot.participant?.id !== origin.winnerId,
        );
  if (loser?.participant) {
    return { participant: loser.participant, state: "confirmed", isWinner: false };
  }
  const number = context.numberByMatchId.get(source.matchId);
  return number === undefined
    ? pending
    : { ...pending, pendingLabel: `第${number}試合の敗者` };
}
```

`sourceMatchId` は `winnerOf` のみを返す既存実装のまま。

- [ ] **Step 5: Implement `from-division.ts`**

```ts
const toSlotSource = (source: DivisionSlotSource): SlotSource => {
  switch (source.kind) {
    case "entry":
      // （既存コメント）
      return { kind: "participant", participantId: source.entryId };
    case "winnerOf":
      return { kind: "winnerOf", matchId: source.matchId };
    case "loserOf":
      return { kind: "loserOf", matchId: source.matchId };
    case "bye":
      return { kind: "bye" };
  }
};

/** ブラケットとして描ける形式。リーグは星取表（LeagueResultTable）で描く。 */
const BRACKET_FORMATS: readonly DivisionFormat[] = [
  "SINGLE_ELIMINATION",
  "DOUBLE_ELIMINATION_GRAND_FINAL",
  "DOUBLE_ELIMINATION_THIRD_PLACE",
];
```

`fromDivision` の変更点（JSDoc も「SE と DE を扱う。SE は勝ち上がり木だけを許す」に更新）:

```ts
  if (!BRACKET_FORMATS.includes(input.format)) {
    return null;
  }
  const singleElimination = input.format === "SINGLE_ELIMINATION";
  // ...
  for (const source of input.matchingConfig.matches) {
    // シングルエリミネーションに敗者側の試合があるのは形式を書き換えた
    // 部門などの不整合。勝ち上がり木として描けないので描かない。
    if (singleElimination && source.bracket !== "winners") {
      return null;
    }
    for (const slot of source.slots) {
      if (singleElimination && slot.kind === "loserOf") {
        return null;
      }
      if (
        (slot.kind === "winnerOf" || slot.kind === "loserOf") &&
        !matchIds.has(slot.matchId)
      ) {
        return null;
      }
      if (slot.kind === "entry" && !entryIds.has(slot.entryId)) {
        return null;
      }
    }
    matches.push({
      id: source.id,
      bracket: source.bracket,
      round: source.round,
      order: source.order,
      matchNumber: source.matchNumber,
      slots: [toSlotSource(source.slots[0]), toSlotSource(source.slots[1])],
    });
  }
```

- [ ] **Step 6: Implement `MatchCard.tsx`**

```ts
function slotLabel(slot: ResolvedSlot): string {
  if (slot.state === "bye") return "BYE";
  if (slot.state === "pending" && slot.pendingLabel) return slot.pendingLabel;
  return slot.participant?.name ?? "未定";
}
```

- [ ] **Step 7: Run tests and typecheck**

Run: `pnpm test src/features/bracket src/components/tournament src/components/division` then `pnpm typecheck`
Expected: PASS（`DivisionBracket.test.tsx` はまだ SE ガードが残っているので変化なし）

- [ ] **Step 8: Commit**

```bash
git add src/features/bracket src/components/tournament
git commit -m "feat(bracket): resolve loserOf slots and propagate byes for drawing"
```

---

### Task 6: 3 エリアのレイアウトと表示の配線

**Files:**
- Modify: `src/features/bracket/layout-bracket.ts`, `layout-bracket.test.ts`
- Modify: `src/features/bracket/to-flow-elements.ts`, `to-flow-elements.test.ts`
- Create: `src/components/tournament/SectionNode.tsx`
- Modify: `src/components/tournament/TournamentFlow.tsx`
- Modify: `src/components/division/DivisionBracket.tsx`, `DivisionBracket.test.tsx`
- Modify: `src/components/division/DivisionMatchingView.tsx`, `DivisionMatchingView.test.tsx`

**Interfaces:**
- Consumes: `ResolvedMatch.bracket`, `BracketSide`（Task 5）、`buildDoubleElimination`（Task 1、テスト用）
- Produces:
  - `layout-bracket.ts`: `export const SECTION_GAP = 72;`, `export const SECTION_LABEL_OFFSET = 28;`, `LayoutInput.bracket?: BracketSide`, `export type SectionLabel = { id: string; label: string; position: Position };`, `export function sectionLabels(matches: LayoutInput[], positions: Map<string, Position>): SectionLabel[];`
  - `to-flow-elements.ts`: `export type SectionNodeData = { label: string }; export type SectionFlowNode = Node<SectionNodeData, "section">; export type BracketFlowNode = MatchFlowNode | SectionFlowNode;`、`toFlowElements(matches, positions, labels: SectionLabel[] = []): { nodes: BracketFlowNode[]; edges: Edge[] }`

- [ ] **Step 1: Write the failing tests**

`src/features/bracket/layout-bracket.test.ts` に追加（import に `SECTION_GAP`, `SECTION_LABEL_OFFSET`, `sectionLabels` を足す）:

```ts
describe("layoutBracket（ダブルエリミネーション）", () => {
  const side = (
    id: string,
    bracket: "winners" | "losers" | "final",
    round: number,
    order: number,
    sources: [string | null, string | null] = [null, null],
  ): LayoutInput => ({ id, bracket, round, order, sourceMatchIds: sources });

  // 4 枠 grandFinal: 勝者側 m1-0, m1-1 → m2-0、敗者側 l1-0 → l2-0、決勝 f
  const de: LayoutInput[] = [
    side("m1-0", "winners", 1, 0),
    side("m1-1", "winners", 1, 1),
    side("m2-0", "winners", 2, 0, ["m1-0", "m1-1"]),
    side("l1-0", "losers", 2, 0),
    side("l2-0", "losers", 3, 0, ["l1-0", null]),
    side("f", "final", 4, 0, ["m2-0", "l2-0"]),
  ];

  it("敗者側は勝者側の最下端より SECTION_GAP 下から始まり、列は敗者側内の番号", () => {
    const positions = layoutBracket(de);
    const winnersBottom = at(positions, "m1-1").y + NODE_HEIGHT;
    expect(at(positions, "l1-0")).toEqual({
      x: 0,
      y: winnersBottom + SECTION_GAP,
    });
    expect(at(positions, "l2-0")).toEqual({
      x: NODE_WIDTH + GAP_X,
      y: at(positions, "l1-0").y,
    });
  });

  it("決勝は両ブラケットの最終列の右で、両決勝の中点", () => {
    const positions = layoutBracket(de);
    expect(at(positions, "f")).toEqual({
      x: 2 * (NODE_WIDTH + GAP_X),
      y: (at(positions, "m2-0").y + at(positions, "l2-0").y) / 2,
    });
  });

  it("入力順に依存しない", () => {
    expect(layoutBracket([...de].reverse())).toEqual(layoutBracket(de));
  });

  it("sectionLabels は各エリアの左上にラベルを置く", () => {
    const positions = layoutBracket(de);
    expect(sectionLabels(de, positions)).toEqual([
      {
        id: "section-winners",
        label: "勝者側",
        position: { x: 0, y: -SECTION_LABEL_OFFSET },
      },
      {
        id: "section-losers",
        label: "敗者側",
        position: {
          x: 0,
          y: at(positions, "l1-0").y - SECTION_LABEL_OFFSET,
        },
      },
      {
        id: "section-final",
        label: "決勝",
        position: {
          x: at(positions, "f").x,
          y: at(positions, "f").y - SECTION_LABEL_OFFSET,
        },
      },
    ]);
  });

  it("勝者側だけならラベルを出さない", () => {
    expect(sectionLabels(matches, layoutBracket(matches))).toEqual([]);
  });
});
```

`src/features/bracket/to-flow-elements.test.ts` に追加（既存の ResolvedMatch ヘルパーを使う）:

```ts
  it("セクションラベルを section ノードとして足す", () => {
    const { nodes } = toFlowElements([], new Map(), [
      { id: "section-losers", label: "敗者側", position: { x: 0, y: 100 } },
    ]);
    expect(nodes).toEqual([
      {
        id: "section-losers",
        type: "section",
        position: { x: 0, y: 100 },
        data: { label: "敗者側" },
        draggable: false,
        selectable: false,
      },
    ]);
  });
```

`src/components/division/DivisionBracket.test.tsx` に追加:

```ts
  it("ダブルエリミネーションは試合とセクションラベルを描く", () => {
    const entries = {
      version: 1 as const,
      entries: [
        { id: "e1", participantId: "p1", seed: 0 },
        { id: "e2", participantId: "p2", seed: 1 },
        { id: "e3", participantId: "p3", seed: 2 },
      ],
    };
    render(
      <DivisionBracket
        division={buildDivision({
          format: "DOUBLE_ELIMINATION_GRAND_FINAL",
          entries,
          matchingConfig: buildDoubleElimination(
            generateSlots(entries.entries),
            "grandFinal",
          ),
        })}
        participants={[
          ...participants,
          { id: "p3", name: "高橋 湊", nameKana: "タカハシ ミナト", playerNumber: "3" },
        ]}
      />,
    );
    // 4 枠: 勝者側 3 + 敗者側 2 + 決勝 1 + ラベル 3
    expect(screen.getByTestId("flow")).toHaveTextContent("9");
  });
```

（import: `buildDoubleElimination`, `generateSlots`。既存に「SINGLE_ELIMINATION 以外は未対応の案内」テストがあれば `ROUND_ROBIN` を使うように直し、文言は後述の実装に合わせる）

`src/components/division/DivisionMatchingView.test.tsx`: `"対応していない形式は形式名を添えて案内する"` を置き換える:

```ts
  it.each([
    "DOUBLE_ELIMINATION_GRAND_FINAL",
    "DOUBLE_ELIMINATION_THIRD_PLACE",
  ] as const)("%s はブラケットを描く", (format) => {
    render(
      <DivisionMatchingView
        division={buildDivision({ format })}
        participants={participants}
        heightClassName="h-[60dvh]"
      />,
    );
    expect(screen.getByTestId("bracket")).toHaveTextContent("h-[60dvh]");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/features/bracket src/components/division`
Expected: FAIL

- [ ] **Step 3: Implement `layout-bracket.ts`**

```ts
import type { BracketSide } from "./types";

/** ノードの実寸。MatchCard の style にも同じ値を使い、計算と描画をずらさない。 */
export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 76;
export const GAP_X = 80;
export const GAP_Y = 24;
/** 勝者側の最下端と敗者側の最上端のあいだ。ラベルが収まる高さにする。 */
export const SECTION_GAP = 72;
/** セクションラベルを、エリア最上端の試合からどれだけ上に置くか。 */
export const SECTION_LABEL_OFFSET = 28;

export type Position = { x: number; y: number };

/** layoutBracket が必要とする最小限の形。ResolvedMatch はこれに代入可能。 */
export type LayoutInput = {
  id: string;
  /** 省略時は winners */
  bracket?: BracketSide;
  round: number;
  order: number;
  sourceMatchIds: [string | null, string | null];
};

const SIDES: BracketSide[] = ["winners", "losers", "final"];
const sideOf = (match: LayoutInput): BracketSide => match.bracket ?? "winners";

/**
 * 勝者側 → 敗者側 → 決勝の順に座標を決める。
 *
 * - 勝者側: x はラウンド番号、y は供給元試合の中点（従来どおり）
 * - 敗者側: 勝者側の下に SECTION_GAP を空けて置く。round は全ブラケット通しの
 *   番号（敗者側 L は L + 1）なので、列は round − 2。sourceMatchIds は winnerOf
 *   だけなので、合流ラウンドは敗者側の前の試合と同じ高さに並ぶ
 * - 決勝: 両ブラケットの最終列の右。y は供給元（両決勝）の中点
 *
 * 各エリアをラウンド昇順に走査するので、供給元の座標は必ず先に確定している。
 */
export function layoutBracket(matches: LayoutInput[]): Map<string, Position> {
  const ordered = [...matches].sort(
    (a, b) =>
      SIDES.indexOf(sideOf(a)) - SIDES.indexOf(sideOf(b)) ||
      a.round - b.round ||
      a.order - b.order,
  );
  const positions = new Map<string, Position>();
  let losersTop: number | null = null;
  let lastColumn = -1;

  for (const match of ordered) {
    const side = sideOf(match);

    if (side === "losers" && losersTop === null) {
      const ys = [...positions.values()].map((position) => position.y);
      losersTop =
        ys.length > 0 ? Math.max(...ys) + NODE_HEIGHT + SECTION_GAP : 0;
    }

    const sourceYs = match.sourceMatchIds
      .filter((id): id is string => id !== null)
      .map((id) => {
        const source = positions.get(id);
        if (!source) {
          throw new Error(
            `Match "${match.id}" references "${id}", which has no position yet`,
          );
        }
        return source.y;
      });

    const top = side === "losers" ? (losersTop ?? 0) : 0;
    const y =
      sourceYs.length > 0
        ? sourceYs.reduce((sum, value) => sum + value, 0) / sourceYs.length
        : top + match.order * (NODE_HEIGHT + GAP_Y);

    let column: number;
    if (side === "final") {
      column = lastColumn + 1;
    } else {
      column = side === "losers" ? match.round - 2 : match.round - 1;
      lastColumn = Math.max(lastColumn, column);
    }

    positions.set(match.id, { x: column * (NODE_WIDTH + GAP_X), y });
  }

  return positions;
}

export type SectionLabel = { id: string; label: string; position: Position };

const SECTION_TEXT: Record<BracketSide, string> = {
  winners: "勝者側",
  losers: "敗者側",
  final: "決勝",
};

/**
 * 各エリアの左上に置く見出し。勝者側しか無い（シングルエリミネーション）
 * ときは見出しが無くても読めるので出さない。
 */
export function sectionLabels(
  matches: LayoutInput[],
  positions: Map<string, Position>,
): SectionLabel[] {
  if (matches.every((match) => sideOf(match) === "winners")) {
    return [];
  }
  return SIDES.flatMap((side) => {
    const placed = matches
      .filter((match) => sideOf(match) === side)
      .map((match) => positions.get(match.id))
      .filter((position): position is Position => position !== undefined);
    if (placed.length === 0) {
      return [];
    }
    return [
      {
        id: `section-${side}`,
        label: SECTION_TEXT[side],
        position: {
          x: Math.min(...placed.map((position) => position.x)),
          y:
            Math.min(...placed.map((position) => position.y)) -
            SECTION_LABEL_OFFSET,
        },
      },
    ];
  });
}
```

- [ ] **Step 4: Implement `to-flow-elements.ts`**

```ts
import type { Edge, Node } from "@xyflow/react";
import type { Position, SectionLabel } from "./layout-bracket";
import type { ResolvedMatch } from "./types";

export type MatchNodeData = { match: ResolvedMatch };
export type MatchFlowNode = Node<MatchNodeData, "match">;
export type SectionNodeData = { label: string };
export type SectionFlowNode = Node<SectionNodeData, "section">;
export type BracketFlowNode = MatchFlowNode | SectionFlowNode;
```

シグネチャと戻り値:

```ts
/** ResolvedMatch[] と座標表を React Flow の nodes / edges へ変換する。 */
export function toFlowElements(
  matches: ResolvedMatch[],
  positions: Map<string, Position>,
  labels: SectionLabel[] = [],
): { nodes: BracketFlowNode[]; edges: Edge[] } {
```

`const nodes: MatchFlowNode[] = ...` の後に追加し、return を変える:

```ts
  const sectionNodes: SectionFlowNode[] = labels.map((label) => ({
    id: label.id,
    type: "section",
    position: label.position,
    data: { label: label.label },
    draggable: false,
    selectable: false,
  }));

  // ...edges は既存のまま（sourceMatchIds は winnerOf だけなので loserOf の線は出ない）

  return { nodes: [...sectionNodes, ...nodes], edges };
```

- [ ] **Step 5: Create `SectionNode.tsx` and register it**

`src/components/tournament/SectionNode.tsx`:

```tsx
import type { NodeProps } from "@xyflow/react";
import type { SectionFlowNode } from "@/features/bracket/to-flow-elements";

/** ダブルエリミネーションの「勝者側」「敗者側」「決勝」の見出し。 */
export function SectionNode({ data }: NodeProps<SectionFlowNode>) {
  return (
    <div className="whitespace-nowrap text-sm font-bold text-slate-500">
      {data.label}
    </div>
  );
}
```

`src/components/tournament/TournamentFlow.tsx`:

```tsx
import type { BracketFlowNode } from "@/features/bracket/to-flow-elements";
import { MatchNode } from "./MatchNode";
import { SectionNode } from "./SectionNode";

const nodeTypes = { match: MatchNode, section: SectionNode };

export function TournamentFlow({
  nodes,
  edges,
}: {
  nodes: BracketFlowNode[];
  edges: Edge[];
}) {
```

（`MatchFlowNode` の import は `BracketFlowNode` に置き換える。`src/app/mock/page.tsx` など他の呼び出し元は `MatchFlowNode[]` を渡しても `BracketFlowNode[]` に代入可能）

- [ ] **Step 6: Wire `DivisionBracket.tsx` and `DivisionMatchingView.tsx`**

`DivisionBracket.tsx`:
- `import { layoutBracket, sectionLabels } from "@/features/bracket/layout-bracket";`
- 形式ガードを次に置き換える（`DIVISION_FORMAT_LABELS` はそのまま使う）:

```tsx
  // リーグは星取表で描く（DivisionMatchingView）。ここへ来るのは誤用。
  if (division.format === "ROUND_ROBIN") {
    return (
      <Notice>
        「{DIVISION_FORMAT_LABELS[division.format]}
        」のブラケット表示はまだ対応していません
      </Notice>
    );
  }
```

- 組み立て部分:

```tsx
    const positions = layoutBracket(resolved);
    elements = toFlowElements(
      resolved,
      positions,
      sectionLabels(resolved, positions),
    );
```

`DivisionMatchingView.tsx`:

```tsx
    case "SINGLE_ELIMINATION":
    case "DOUBLE_ELIMINATION_GRAND_FINAL":
    case "DOUBLE_ELIMINATION_THIRD_PLACE":
      return (
        <DivisionBracket
          division={division}
          participants={participants}
          heightClassName={heightClassName}
        />
      );
    case "ROUND_ROBIN":
      return <LeagueSection division={division} participants={participants} />;
```

DE 用の Notice 分岐を削除し、未使用になった `DIVISION_FORMAT_LABELS` の import を消す。

- [ ] **Step 7: Run all tests, typecheck, lint**

Run: `pnpm test` then `pnpm typecheck` then `pnpm lint`
Expected: test / typecheck PASS。lint は CRLF 由来以外のエラーが無いこと

- [ ] **Step 8: Commit**

```bash
git add src/features/bracket src/components/tournament src/components/division
git commit -m "feat(bracket): draw double elimination with losers bracket and grand final"
```

---

### Task 7: 実機確認と spec の追従

**Files:**
- Modify: `docs/superpowers/specs/2026-09-17-double-elimination-design.md`

- [ ] **Step 1: spec を実装に合わせる**

- 「勝者側」節の id を `w{round}-{order}` → `m{round}-{order}`（既存 `buildFromSlots` を再利用するため）
- 「表示」節に「`loserOf` の未確定スロットは `ResolvedSlot.pendingLabel`（`第N試合の敗者`）で表示する」
- 「編集画面」節に「エントリー不足エラーは形式ごとの最小人数（`minEntries`）を文言に出す」「位置ラベルは `勝者側N回戦` / `敗者側L回戦` / `決勝`」

- [ ] **Step 2: ローカルで確認**

1. `pnpm dev`（ログで実際のポートを確認。3000 は他の worktree が使っていることがある）
2. `BYPASS_AUTH=1` の場合、Cookie `USER_ID=1` を設定（シード済みユーザーは組織 `aaaaa`）
3. 大会に `ダブルエリミネーション（優勝決定戦あり）` の部門を作成 → 詳細の「エントリー・組み合わせ」→ 5 人エントリー → 生成
4. 確認項目:
   - 2 人で生成すると「エントリーが3人以上必要です」
   - プレビューに勝者側・敗者側・決勝の 3 エリアとラベルが出る
   - 1 回戦スロットの D&D 入れ替えで敗者側も作り直される
   - 結果入力で 1 回戦を記録すると、敗者側に敗者が入り、BYE 相手は自動で勝ち上がる
   - 公開ページ `/t/[tournamentId]/divisions/[divisionId]` でも描画される
   - `ダブルエリミネーション（敗者側優勝が3位）` でも決勝ノードが無いことを確認
   - `/matches` はローカル DB のずれで 500 になることがある（既知）。結果入力が確認できない場合はその旨を報告

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-17-double-elimination-design.md
git commit -m "docs(division): align double elimination spec with implementation"
```
