# Bracket Inline Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** シングルエリミネーション部門の setup 画面を「編集可能なプレビュー」と「試合名一覧」だけにし、試合の追加・削除と 1 回戦スロットへの選手配置をプレビュー上のボタンとモーダルで行えるようにする。

**Architecture:** 1 回戦の試合の並びを唯一の情報源にし、新しい純粋関数 `buildFromFirstRound` が 2 回戦以降を自動配線する（bye は `seedOrder` で分散）。4 つの新 Server Action スライス（add-first-round-match / remove-first-round-match / assign-slot / clear-slot）が共通ラッパー `runFirstRoundEdit`（`runDivisionSetup` の上に SE 限定・形状チェックを載せたもの）を通る。UI は `DivisionBracket` に `editor` を渡すと `EditableBracket`（client）が React context 経由で `MatchCard` に鉛筆ボタンを出し、React Flow の外に置いた `SlotEditDialog` を開く。

**Tech Stack:** Next.js (App Router, Server Actions) / React 19 / Effect / Zod v4 / Prisma（Json 列）/ @xyflow/react / Vitest + Testing Library / Biome / pnpm

**Spec:** `docs/superpowers/specs/2026-09-21-bracket-inline-editor-design.md`

## Global Constraints

- 対象は `SINGLE_ELIMINATION` のみ。DE 形式の setup は既存 `DivisionSetup` のまま変えない。
- スキーマ変更なし。`Division.entries` / `matchingConfig` の Json を使う。
- 1 回戦の上限は 64 試合（`MAX_FIRST_ROUND_MATCHES = 64`）。
- 空きスロットは `{ kind: "bye" }`。
- 試合 id は `m{round}-{order}`（既存 `buildFromSlots` と同じ）。
- 結果が 1 件でも記録されていれば、追加・削除・選手変更は画面で disabled、サーバーでも `DivisionResultsRecordedError`（`runDivisionSetup` が投げる）。試合名は結果後も編集可。
- 非 SE 形式への新スライスの呼び出しは `found: false`（handler で `notFound()`）。
- アイコンライブラリは追加しない（鉛筆はインライン SVG）。
- パッケージ操作は `pnpm`。テストは `pnpm test <path>`、型は `pnpm typecheck`、lint は `pnpm lint`。
- Windows チェックアウトでは Biome が CRLF 起因のエラーを大量に出すことがある。lint は変更ファイルの内容で判断する。
- 新しいワークツリーでは最初に `.env` をメインチェックアウトからコピーし、`pnpm install` と `pnpm exec next typegen` を実行する（`PageProps` 型の生成）。
- UI 文言・コメントは既存コードに合わせて日本語。
- Effect の失敗を検証するテストは既存ヘルパー `import { failureTag } from "@/shared/testing/exit";` を使い `expect(failureTag(exit)).toBe("<Tag>")` と書く（各テストファイルで import を忘れない）。
- コミットメッセージ末尾: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`（モデル名を書き換えない。BOM を入れない）。

## File Structure

| File | 役割 |
|---|---|
| `src/features/division/single-elimination/build.ts` (modify) | `buildFromFirstRound` 追加、`isSingleEliminationShape` を 2 回戦以降の bye 許容に |
| `src/features/division/single-elimination/first-round.ts` (create) | 1 回戦の純粋な編集操作（取り出し・追加・削除・スロット差し替え・試合名引き継ぎ・エントリー削除） |
| `src/features/division/errors.ts` / `messages.ts` (modify) | `DivisionFirstRoundLimitError` / `DivisionShapeMismatchError` |
| `src/features/division/entry-member.ts` (create) | add-entry から Member / Participant 解決を切り出して共有 |
| `src/features/division/first-round-store.ts` (create) | `runFirstRoundEdit`（SE 限定・形状チェック付き `runDivisionSetup`） |
| `src/features/division/first-round-schema.ts` (create) | `matchIdSchema` / `slotTargetSchema` と、FormData から ids を読む `readDivisionIds` |
| `src/features/division/{add-first-round-match,remove-first-round-match,assign-slot,clear-slot}/` (create) | 各スライスの handler / usecase / repository / schema(必要なら) + tests |
| `src/features/division/state.ts` (modify) | `succeeded` のコメント更新 |
| `src/features/division/repository.ts` (modify) | `DivisionParticipant.memberId?` を埋める |
| `src/components/ui/PencilIcon.tsx` (create) | インライン SVG |
| `src/components/tournament/slot-edit-context.ts` (create) | `SlotEditContext` |
| `src/components/tournament/MatchCard.tsx` (modify) | context があるとき 1 回戦スロットに鉛筆 |
| `src/components/division/SlotEditDialog.tsx` (create) | スロット編集モーダル |
| `src/components/division/EditableBracket.tsx` (create) | Provider + TournamentFlow + SlotEditDialog |
| `src/components/division/DivisionBracket.tsx` (modify) | `editor` prop |
| `src/components/division/AddFirstRoundMatchButton.tsx` (create) | 「試合を追加」ボタン |
| `src/components/division/BracketEditorSetup.tsx` (create) | SE 用 setup 画面本体 |
| `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.tsx` (modify) | format で出し分け |

---

### Task 1: `buildFromFirstRound` と形状判定の緩和

**Files:**
- Modify: `src/features/division/single-elimination/build.ts`
- Test: `src/features/division/single-elimination/build.test.ts`

**Interfaces:**
- Produces:
  - `export type FirstRoundPair = [SlotSource, SlotSource];`（build.ts から export）
  - `export const buildFromFirstRound: (pairs: readonly FirstRoundPair[]) => MatchingConfig`
  - `isSingleEliminationShape(config)` は 2 回戦以降のスロットが `winnerOf` または `bye` なら true

- [ ] **Step 1: 失敗するテストを書く**

`build.test.ts` の末尾に追加（既存 import に `buildFromFirstRound`, `type FirstRoundPair` と `validateMatchingConfig` を足す）:

```ts
import { validateMatchingConfig } from "@/lib/division/validate";

const bye = { kind: "bye" } as const;
const emptyPairs = (n: number): FirstRoundPair[] =>
  Array.from({ length: n }, () => [bye, bye]);
const w = (id: string) => ({ kind: "winnerOf" as const, matchId: id });

describe("buildFromFirstRound", () => {
  it("0 試合なら空", () => {
    expect(buildFromFirstRound([])).toEqual({ version: 1, matches: [] });
  });

  it("1 試合なら 1 回戦だけ（それが決勝）", () => {
    const config = buildFromFirstRound(emptyPairs(1));
    expect(config.matches.map((m) => m.id)).toEqual(["m1-0"]);
  });

  it("2 試合なら決勝が両方の勝者を受ける", () => {
    const config = buildFromFirstRound(emptyPairs(2));
    const final = config.matches.find((m) => m.id === "m2-0");
    expect(final?.slots).toEqual([w("m1-0"), w("m1-1")]);
    expect(config.matches).toHaveLength(3);
  });

  it("3 試合なら 1 試合目の勝者が 2 回戦で bye を得る", () => {
    const config = buildFromFirstRound(emptyPairs(3));
    const round2 = config.matches
      .filter((m) => m.round === 2)
      .sort((a, b) => a.order - b.order)
      .map((m) => m.slots);
    expect(round2).toEqual([
      [w("m1-0"), bye],
      [w("m1-1"), w("m1-2")],
    ]);
  });

  it("5 試合なら bye を seedOrder で散らし、1 回戦は追加順のまま詰める", () => {
    const config = buildFromFirstRound(emptyPairs(5));
    const round2 = config.matches
      .filter((m) => m.round === 2)
      .sort((a, b) => a.order - b.order)
      .map((m) => m.slots);
    expect(round2).toEqual([
      [w("m1-0"), bye],
      [w("m1-1"), w("m1-2")],
      [w("m1-3"), bye],
      [w("m1-4"), bye],
    ]);
  });

  it("8 試合なら bye は生まれず 15 試合になる", () => {
    const config = buildFromFirstRound(emptyPairs(8));
    expect(config.matches).toHaveLength(15);
    const higher = config.matches.filter((m) => m.round >= 2);
    expect(higher.every((m) => m.slots.every((s) => s.kind === "winnerOf"))).toBe(true);
  });

  it("1 回戦の中身と id は入力の順どおり", () => {
    const pairs: FirstRoundPair[] = [
      [{ kind: "entry", entryId: "a" }, bye],
      [bye, { kind: "entry", entryId: "b" }],
    ];
    const config = buildFromFirstRound(pairs);
    const round1 = config.matches.filter((m) => m.round === 1);
    expect(round1.map((m) => [m.id, m.order, m.slots])).toEqual([
      ["m1-0", 0, pairs[0]],
      ["m1-1", 1, pairs[1]],
    ]);
  });

  it("1〜64 試合のどれでも、bye どうしの 2 回戦が無く、検証と形状判定を通る", () => {
    for (let n = 1; n <= 64; n += 1) {
      const config = buildFromFirstRound(emptyPairs(n));
      const round2 = config.matches.filter((m) => m.round === 2);
      expect(round2.some((m) => m.slots.every((s) => s.kind === "bye"))).toBe(false);
      expect(validateMatchingConfig(config, { version: 1, entries: [] })).toEqual([]);
      expect(isSingleEliminationShape(config)).toBe(true);
    }
  });
});

describe("isSingleEliminationShape（2 回戦以降の bye）", () => {
  it("2 回戦以降に bye があってもトーナメントの形とみなす", () => {
    expect(isSingleEliminationShape(buildFromFirstRound(emptyPairs(3)))).toBe(true);
  });

  it("2 回戦以降に entry があれば形が違う", () => {
    const config = buildFromFirstRound(emptyPairs(2));
    const broken = {
      ...config,
      matches: config.matches.map((m) =>
        m.round === 2
          ? { ...m, slots: [{ kind: "entry" as const, entryId: "x" }, m.slots[1]] as typeof m.slots }
          : m,
      ),
    };
    expect(isSingleEliminationShape(broken)).toBe(false);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `pnpm test src/features/division/single-elimination/build.test.ts`
Expected: FAIL（`buildFromFirstRound` が export されていない）

- [ ] **Step 3: 実装**

`build.ts` に追加（`nextPowerOfTwo` の下、`buildFromSlots` の下あたり）:

```ts
/** 1 回戦の 1 試合ぶんのスロット。 */
export type FirstRoundPair = [SlotSource, SlotSource];

/**
 * 1 回戦の試合の並びから勝ち上がり木を組み立てる。buildFromSlots と違い
 * 1 回戦を 2 の冪まで水増ししない。「試合を追加」したら、その 1 試合だけが増える。
 *
 * 2 回戦の入力位置を 2 の冪 P まで取り、seedOrder(P) でシード番号が N を超える
 * 位置を bye にする。seedOrder は k と P+1-k を対にするので、N > P/2 である限り
 * bye どうしの対は生まれない。残りの位置には 1 回戦の勝者を追加順に詰める
 * （1 回戦の見た目の並びを入れ替えないため）。
 * 3 回戦以降は buildFromSlots と同じ規則で組む。
 */
export const buildFromFirstRound = (
  pairs: readonly FirstRoundPair[],
): MatchingConfig => {
  if (pairs.length === 0) {
    return { version: 1, matches: [] };
  }

  const matches: BracketMatch[] = pairs.map((slots, order) => ({
    id: matchId(1, order),
    bracket: "winners",
    round: 1,
    order,
    matchName: DEFAULT_MATCH_NAME,
    slots: [slots[0], slots[1]],
  }));

  if (pairs.length === 1) {
    return { version: 1, matches };
  }

  const size = nextPowerOfTwo(pairs.length);
  let nextOrder = 0;
  const feeds = seedOrder(size).map((seed): SlotSource => {
    if (seed > pairs.length) {
      return { kind: "bye" };
    }
    const source: SlotSource = {
      kind: "winnerOf",
      matchId: matchId(1, nextOrder),
    };
    nextOrder += 1;
    return source;
  });

  for (let order = 0; order < size / 2; order += 1) {
    matches.push({
      id: matchId(2, order),
      bracket: "winners",
      round: 2,
      order,
      matchName: DEFAULT_MATCH_NAME,
      slots: [feeds[order * 2], feeds[order * 2 + 1]],
    });
  }

  let previousCount = size / 2;
  let round = 3;
  while (previousCount > 1) {
    const count = previousCount / 2;
    for (let order = 0; order < count; order += 1) {
      matches.push({
        id: matchId(round, order),
        bracket: "winners",
        round,
        order,
        matchName: DEFAULT_MATCH_NAME,
        slots: [
          { kind: "winnerOf", matchId: matchId(round - 1, order * 2) },
          { kind: "winnerOf", matchId: matchId(round - 1, order * 2 + 1) },
        ],
      });
    }
    previousCount = count;
    round += 1;
  }

  return { version: 1, matches };
};
```

`isSingleEliminationShape` の最後の return を置き換え、JSDoc の末尾に 1 段落追加:

```ts
 * buildFromFirstRound は 1 回戦が 2 の冪でないとき 2 回戦に bye を置く。
 * bye は league の星取表に現れない（league は 2 回戦以降を持たない）ので、
 * 許しても判別は崩れない。
 */
export const isSingleEliminationShape = (config: MatchingConfig): boolean => {
  const higherRounds = config.matches.filter((match) => match.round >= 2);
  if (higherRounds.length === 0) {
    return config.matches.length <= 1;
  }
  return higherRounds.every((match) =>
    match.slots.every(
      (slot) => slot.kind === "winnerOf" || slot.kind === "bye",
    ),
  );
};
```

- [ ] **Step 4: テストを通す**

Run: `pnpm test src/features/division/single-elimination/ src/features/division/matching-strategy.test.ts`
Expected: PASS（既存テストも含めて全て）

- [ ] **Step 5: Commit**

```bash
git add src/features/division/single-elimination/build.ts src/features/division/single-elimination/build.test.ts
git commit -m "feat(division): build a single-elimination tree from its first-round matches"
```

---

### Task 2: 1 回戦の純粋な編集操作

**Files:**
- Create: `src/features/division/single-elimination/first-round.ts`
- Test: `src/features/division/single-elimination/first-round.test.ts`

**Interfaces:**
- Consumes: `buildFromFirstRound`, `FirstRoundPair`（Task 1）
- Produces（すべて `first-round.ts` から export）:
  - `MAX_FIRST_ROUND_MATCHES = 64`
  - `firstRoundPairs(config: MatchingConfig): FirstRoundPair[]`
  - `carryMatchNames(previous: MatchingConfig, next: MatchingConfig, renamedIds?: ReadonlyMap<string, string | null>): MatchingConfig`
  - `addFirstRoundMatch(config: MatchingConfig): MatchingConfig`
  - `removeFirstRoundMatch(config: MatchingConfig, matchId: string): { config: MatchingConfig; removedEntryIds: string[] } | null`
  - `setFirstRoundSlot(config: MatchingConfig, matchId: string, slotIndex: 0 | 1, source: SlotSource): { config: MatchingConfig; replaced: SlotSource } | null`
  - `removeEntries(entries: DivisionEntries, entryIds: readonly string[]): DivisionEntries`

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, expect, it } from "vitest";
import type { MatchingConfig } from "@/lib/division/types";
import { buildFromFirstRound, type FirstRoundPair } from "./build";
import {
  addFirstRoundMatch,
  carryMatchNames,
  firstRoundPairs,
  removeEntries,
  removeFirstRoundMatch,
  setFirstRoundSlot,
} from "./first-round";

const bye = { kind: "bye" } as const;
const entry = (id: string) => ({ kind: "entry" as const, entryId: id });

const threeMatches: FirstRoundPair[] = [
  [entry("a"), entry("b")],
  [entry("c"), bye],
  [entry("d"), entry("e")],
];

const rename = (config: MatchingConfig, id: string, name: string): MatchingConfig => ({
  ...config,
  matches: config.matches.map((m) => (m.id === id ? { ...m, matchName: name } : m)),
});

const nameOf = (config: MatchingConfig, id: string) =>
  config.matches.find((m) => m.id === id)?.matchName;

describe("firstRoundPairs", () => {
  it("1 回戦を order 順に取り出す（Json の並びに依存しない）", () => {
    const config = buildFromFirstRound(threeMatches);
    const shuffled = { ...config, matches: [...config.matches].reverse() };
    expect(firstRoundPairs(shuffled)).toEqual(threeMatches);
  });
});

describe("addFirstRoundMatch", () => {
  it("空の組み合わせに 1 試合目を作る", () => {
    const config = addFirstRoundMatch({ version: 1, matches: [] });
    expect(firstRoundPairs(config)).toEqual([[bye, bye]]);
  });

  it("末尾に空の試合を足し、配線し直し、既存の試合名を残す", () => {
    const named = rename(buildFromFirstRound(threeMatches), "m1-1", "準々決勝A");
    const config = addFirstRoundMatch(named);
    expect(firstRoundPairs(config)).toEqual([...threeMatches, [bye, bye]]);
    expect(nameOf(config, "m1-1")).toBe("準々決勝A");
    // 4 試合 → 2 回戦に bye が無くなる
    expect(
      config.matches.filter((m) => m.round === 2).every((m) =>
        m.slots.every((s) => s.kind === "winnerOf"),
      ),
    ).toBe(true);
  });
});

describe("removeFirstRoundMatch", () => {
  it("試合を消して詰め、消した試合のエントリーを返す", () => {
    const result = removeFirstRoundMatch(buildFromFirstRound(threeMatches), "m1-0");
    expect(result?.removedEntryIds).toEqual(["a", "b"]);
    expect(result && firstRoundPairs(result.config)).toEqual([threeMatches[1], threeMatches[2]]);
  });

  it("詰めた試合には、詰める前の同じ試合の名前を引き継ぐ", () => {
    let config = buildFromFirstRound(threeMatches);
    config = rename(config, "m1-0", "消える試合");
    config = rename(config, "m1-2", "最後の試合");
    const result = removeFirstRoundMatch(config, "m1-1");
    expect(result && nameOf(result.config, "m1-0")).toBe("消える試合");
    expect(result && nameOf(result.config, "m1-1")).toBe("最後の試合");
  });

  it("bye はエントリーとして返さない", () => {
    const result = removeFirstRoundMatch(buildFromFirstRound(threeMatches), "m1-1");
    expect(result?.removedEntryIds).toEqual(["c"]);
  });

  it("最後の 1 試合を消すと空になる", () => {
    const result = removeFirstRoundMatch(buildFromFirstRound([[bye, bye]]), "m1-0");
    expect(result?.config).toEqual({ version: 1, matches: [] });
  });

  it("1 回戦以外や存在しない id なら null", () => {
    const config = buildFromFirstRound(threeMatches);
    expect(removeFirstRoundMatch(config, "m2-0")).toBeNull();
    expect(removeFirstRoundMatch(config, "nope")).toBeNull();
  });
});

describe("setFirstRoundSlot", () => {
  it("指定スロットだけ差し替え、前の中身を返す", () => {
    const config = rename(buildFromFirstRound(threeMatches), "m1-2", "名前");
    const result = setFirstRoundSlot(config, "m1-2", 1, entry("z"));
    expect(result?.replaced).toEqual(entry("e"));
    expect(result && firstRoundPairs(result.config)[2]).toEqual([entry("d"), entry("z")]);
    expect(result && nameOf(result.config, "m1-2")).toBe("名前");
  });

  it("1 回戦以外や存在しない id なら null", () => {
    const config = buildFromFirstRound(threeMatches);
    expect(setFirstRoundSlot(config, "m2-0", 0, bye)).toBeNull();
    expect(setFirstRoundSlot(config, "nope", 0, bye)).toBeNull();
  });
});

describe("carryMatchNames", () => {
  it("同じ id の名前を引き継ぎ、無い id は既定のまま", () => {
    const previous = rename(buildFromFirstRound(threeMatches), "m2-1", "準決勝");
    const next = buildFromFirstRound([...threeMatches, [bye, bye]]);
    const carried = carryMatchNames(previous, next);
    expect(nameOf(carried, "m2-1")).toBe("準決勝");
    expect(nameOf(carried, "m1-3")).toBe(next.matches.find((m) => m.id === "m1-3")?.matchName);
  });
});

describe("removeEntries", () => {
  it("指定 id のエントリーを除く", () => {
    const entries = {
      version: 1 as const,
      entries: [
        { id: "a", participantId: "p1", seed: 0 },
        { id: "b", participantId: "p2", seed: 1 },
      ],
    };
    expect(removeEntries(entries, ["a"]).entries.map((e) => e.id)).toEqual(["b"]);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `pnpm test src/features/division/single-elimination/first-round.test.ts`
Expected: FAIL（モジュールが無い）

- [ ] **Step 3: 実装**

```ts
import type {
  BracketMatch,
  DivisionEntries,
  MatchingConfig,
  SlotSource,
} from "@/lib/division/types";
import { buildFromFirstRound, type FirstRoundPair } from "./build";

/** 1 回戦の試合数の上限。2 人 × 64 = 128 はトーナメントのエントリー上限と同じ。 */
export const MAX_FIRST_ROUND_MATCHES = 64;

const firstRoundMatches = (config: MatchingConfig): BracketMatch[] =>
  config.matches
    .filter((match) => match.bracket === "winners" && match.round === 1)
    .sort((left, right) => left.order - right.order);

/** 1 回戦の並び。Json の配列順は当てにできないので order で並べ直す。 */
export const firstRoundPairs = (config: MatchingConfig): FirstRoundPair[] =>
  firstRoundMatches(config).map((match) => [match.slots[0], match.slots[1]]);

/**
 * 組み直した木へ、手で付けた試合名を引き継ぐ。
 * renamedIds は「旧 id → 新 id」。削除した試合は null。載っていない id は
 * そのまま同じ id へ引き継ぐ。削除で後続の試合が詰まると id がずれるため、
 * 呼び出し側がずれを明示する（id だけで照合すると名前が隣の試合へ移る）。
 */
export const carryMatchNames = (
  previous: MatchingConfig,
  next: MatchingConfig,
  renamedIds: ReadonlyMap<string, string | null> = new Map(),
): MatchingConfig => {
  const names = new Map<string, string>();
  for (const match of previous.matches) {
    const target = renamedIds.has(match.id)
      ? renamedIds.get(match.id)
      : match.id;
    if (target !== null && target !== undefined) {
      names.set(target, match.matchName);
    }
  }
  return {
    ...next,
    matches: next.matches.map((match) => {
      const name = names.get(match.id);
      return name === undefined ? match : { ...match, matchName: name };
    }),
  };
};

/** 両スロットが空の試合を 1 回戦の末尾に足し、配線し直す。上限の確認は呼び出し側。 */
export const addFirstRoundMatch = (config: MatchingConfig): MatchingConfig =>
  carryMatchNames(
    config,
    buildFromFirstRound([
      ...firstRoundPairs(config),
      [{ kind: "bye" }, { kind: "bye" }],
    ]),
  );

const entryIdsOf = (slots: readonly SlotSource[]): string[] =>
  slots.flatMap((slot) => (slot.kind === "entry" ? [slot.entryId] : []));

/**
 * 1 回戦の試合を消して配線し直す。消えた試合に居た選手の entryId も返す
 * （呼び出し側が entries から除くため）。1 回戦に無い id なら null。
 */
export const removeFirstRoundMatch = (
  config: MatchingConfig,
  matchId: string,
): { config: MatchingConfig; removedEntryIds: string[] } | null => {
  const matches = firstRoundMatches(config);
  const index = matches.findIndex((match) => match.id === matchId);
  if (index === -1) {
    return null;
  }

  const rebuilt = buildFromFirstRound(
    matches
      .filter((_, position) => position !== index)
      .map((match): FirstRoundPair => [match.slots[0], match.slots[1]]),
  );
  const rebuiltFirstRound = firstRoundMatches(rebuilt);

  const renamedIds = new Map<string, string | null>();
  matches.forEach((match, position) => {
    if (position === index) {
      renamedIds.set(match.id, null);
    } else if (position > index) {
      renamedIds.set(match.id, rebuiltFirstRound[position - 1].id);
    }
  });

  return {
    config: carryMatchNames(config, rebuilt, renamedIds),
    removedEntryIds: entryIdsOf(matches[index].slots),
  };
};

/**
 * 1 回戦の 1 スロットを差し替える。木の形は変わらないので組み直さない。
 * 前の中身を返すのは、呼び出し側が押し出された選手のエントリーを消すため。
 */
export const setFirstRoundSlot = (
  config: MatchingConfig,
  matchId: string,
  slotIndex: 0 | 1,
  source: SlotSource,
): { config: MatchingConfig; replaced: SlotSource } | null => {
  const target = firstRoundMatches(config).find(
    (match) => match.id === matchId,
  );
  if (target === undefined) {
    return null;
  }

  const slots: [SlotSource, SlotSource] = [target.slots[0], target.slots[1]];
  slots[slotIndex] = source;

  return {
    config: {
      ...config,
      matches: config.matches.map((match) =>
        match.id === matchId ? { ...match, slots } : match,
      ),
    },
    replaced: target.slots[slotIndex],
  };
};

export const removeEntries = (
  entries: DivisionEntries,
  entryIds: readonly string[],
): DivisionEntries => ({
  ...entries,
  entries: entries.entries.filter((entry) => !entryIds.includes(entry.id)),
});
```

- [ ] **Step 4: テストを通す**

Run: `pnpm test src/features/division/single-elimination/first-round.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/division/single-elimination/first-round.ts src/features/division/single-elimination/first-round.test.ts
git commit -m "feat(division): add pure first-round editing operations"
```

---

### Task 3: 共通基盤（エラー・Member 解決の共有・`runFirstRoundEdit`・入力スキーマ）

**Files:**
- Modify: `src/features/division/errors.ts`, `src/features/division/messages.ts`, `src/features/division/add-entry/repository.ts`, `src/features/division/state.ts`
- Create: `src/features/division/entry-member.ts`, `src/features/division/first-round-store.ts`, `src/features/division/first-round-schema.ts`
- Test: `src/features/division/messages.test.ts`（追記）, `src/features/division/first-round-store.test.ts`, `src/features/division/first-round-schema.test.ts`

**Interfaces:**
- Consumes: `isSingleEliminationShape`（Task 1）, `runDivisionSetup` / `DivisionSetup` / `DivisionIds` / `DivisionSetupOutcome` / `DivisionSetupTx`（既存 `setup-store.ts`）
- Produces:
  - `errors.ts`: `DivisionFirstRoundLimitError({ divisionId, limit })`, `DivisionShapeMismatchError({ divisionId })`（`DivisionError` union と `divisionErrorTags` に追加）
  - `entry-member.ts`: `resolveMemberId(tx, organizationId, input: AddEntryInput): Promise<string>`, `resolveParticipantId(tx, tournamentId, memberId): Promise<string>`
  - `first-round-store.ts`: `runFirstRoundEdit<T>(ids: DivisionIds, mutate: (tx: DivisionSetupTx, current: DivisionSetup) => Promise<{ next: DivisionSetup | null; value: T }>): Effect.Effect<DivisionSetupOutcome<T>, DivisionError>`
  - `first-round-schema.ts`: `matchIdSchema`, `slotTargetSchema`（`{ matchId: string; slotIndex: 0 | 1 }`）, `type SlotTarget`, `readDivisionIds(formData): { slug: string; tournamentId: string; divisionId: string }`

- [ ] **Step 1: 失敗するテストを書く**

`messages.test.ts` に追記（既存の import スタイルに合わせる）:

```ts
import { DivisionFirstRoundLimitError, DivisionShapeMismatchError } from "./errors";

it("1 回戦の上限", () => {
  expect(
    divisionErrorMessage(new DivisionFirstRoundLimitError({ divisionId: "d1", limit: 64 })),
  ).toBe("1回戦は64試合までです");
});

it("トーナメントの形でない組み合わせ", () => {
  expect(
    divisionErrorMessage(new DivisionShapeMismatchError({ divisionId: "d1" })),
  ).toBe("この組み合わせはトーナメントの形ではありません。作り直してください");
});
```

`first-round-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readDivisionIds, slotTargetSchema } from "./first-round-schema";

describe("slotTargetSchema", () => {
  it("slotIndex の \"0\" / \"1\" を数値にする", () => {
    expect(slotTargetSchema.parse({ matchId: "m1-0", slotIndex: "1" })).toEqual({
      matchId: "m1-0",
      slotIndex: 1,
    });
  });

  it("0/1 以外や空の matchId は弾く", () => {
    expect(slotTargetSchema.safeParse({ matchId: "m1-0", slotIndex: "2" }).success).toBe(false);
    expect(slotTargetSchema.safeParse({ matchId: "m1-0", slotIndex: "" }).success).toBe(false);
    expect(slotTargetSchema.safeParse({ matchId: "", slotIndex: "0" }).success).toBe(false);
  });
});

describe("readDivisionIds", () => {
  it("FormData から 3 つの id を読み、無ければ空文字", () => {
    const data = new FormData();
    data.set("slug", "acme");
    data.set("tournamentId", "t1");
    expect(readDivisionIds(data)).toEqual({ slug: "acme", tournamentId: "t1", divisionId: "" });
  });
});
```

`first-round-store.test.ts`（Prisma 境界だけモック。swap-slots/repository.test.ts と同じ方式）:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import { buildFromFirstRound } from "./single-elimination/build";

const divisionFindFirst = vi.fn();
const divisionUpdateMany = vi.fn();
const participantFindMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (run: (tx: unknown) => Promise<unknown>) =>
      run({
        division: {
          findFirst: (args: unknown) => divisionFindFirst(args),
          updateMany: (args: unknown) => divisionUpdateMany(args),
        },
        participant: { findMany: (args: unknown) => participantFindMany(args) },
      }),
  },
}));

const { runFirstRoundEdit } = await import("./first-round-store");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };
const row = (overrides: Record<string, unknown> = {}) => ({
  format: "SINGLE_ELIMINATION",
  entries: { version: 1, entries: [] },
  matchingConfig: { version: 1, matches: [] },
  results: { version: 1, matches: [] },
  ...overrides,
});

beforeEach(() => {
  divisionFindFirst.mockReset();
  divisionUpdateMany.mockReset();
  participantFindMany.mockReset();
  participantFindMany.mockResolvedValue([]);
  divisionUpdateMany.mockResolvedValue({ count: 1 });
});

describe("runFirstRoundEdit", () => {
  it("SE なら mutate の結果を書き込み found: true を返す", async () => {
    divisionFindFirst.mockResolvedValue(row());
    const next = buildFromFirstRound([[{ kind: "bye" }, { kind: "bye" }]]);
    const result = await Effect.runPromise(
      runFirstRoundEdit(ids, async (_tx, current) => ({
        next: { ...current, matchingConfig: next },
        value: "ok",
      })),
    );
    expect(result).toEqual({ found: true, value: "ok" });
    expect(divisionUpdateMany.mock.calls[0][0].data.matchingConfig).toEqual(next);
  });

  it("SE 以外は mutate を呼ばず found: false", async () => {
    divisionFindFirst.mockResolvedValue(row({ format: "DOUBLE_ELIMINATION_GRAND_FINAL" }));
    const mutate = vi.fn();
    const result = await Effect.runPromise(runFirstRoundEdit(ids, mutate));
    expect(result).toEqual({ found: false });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("league 形状の組み合わせは DivisionShapeMismatchError", async () => {
    const e = (id: string) => ({ kind: "entry", entryId: id });
    divisionFindFirst.mockResolvedValue(
      row({
        entries: {
          version: 1,
          entries: ["a", "b", "c"].map((id, seed) => ({ id, participantId: `p${id}`, seed })),
        },
        matchingConfig: {
          version: 1,
          matches: [
            { id: "r1", bracket: "winners", round: 1, order: 0, matchName: "1", slots: [e("a"), e("b")] },
            { id: "r2", bracket: "winners", round: 1, order: 1, matchName: "1", slots: [e("a"), e("c")] },
          ],
        },
      }),
    );
    const exit = await Effect.runPromiseExit(
      runFirstRoundEdit(ids, async () => ({ next: null, value: null })),
    );
    expect(failureTag(exit)).toBe("DivisionShapeMismatchError");
  });

  it("結果があれば DivisionResultsRecordedError", async () => {
    divisionFindFirst.mockResolvedValue(
      row({ results: { version: 1, matches: [{ matchId: "m1-0", winnerEntryId: "a" }] } }),
    );
    const exit = await Effect.runPromiseExit(
      runFirstRoundEdit(ids, async () => ({ next: null, value: null })),
    );
    expect(failureTag(exit)).toBe("DivisionResultsRecordedError");
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `pnpm test src/features/division/messages.test.ts src/features/division/first-round-store.test.ts src/features/division/first-round-schema.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装**

`errors.ts`（`DivisionWinReasonNotAllowedError` の下に追加し、`DivisionError` union と `divisionErrorTags` の両方に足す）:

```ts
/** 1 回戦の試合数が上限に達していることを表す。 */
export class DivisionFirstRoundLimitError extends Data.TaggedError(
  "DivisionFirstRoundLimitError",
)<{
  readonly divisionId: string;
  readonly limit: number;
}> {}

/**
 * 組み合わせがトーナメントの形をしていないのに、1 回戦を部分編集しようとしたことを表す。
 * /edit で format を書き換えた部門で起きうる。生成し直せば直る。
 */
export class DivisionShapeMismatchError extends Data.TaggedError(
  "DivisionShapeMismatchError",
)<{
  readonly divisionId: string;
}> {}
```

`messages.ts`（`Match.exhaustive` の直前に追加）:

```ts
    Match.tag(
      "DivisionFirstRoundLimitError",
      (error) => `1回戦は${error.limit}試合までです`,
    ),
    Match.tag(
      "DivisionShapeMismatchError",
      () => "この組み合わせはトーナメントの形ではありません。作り直してください",
    ),
```

`entry-member.ts`: `add-entry/repository.ts` から `resolveMemberId`・`nextPlayerNumberFor`・`resolveParticipantId` を**コメントごとそのまま移し**、`resolveMemberId` と `resolveParticipantId` に `export` を付ける。ファイル先頭:

```ts
import "server-only";
import { nextPlayerNumber } from "@/lib/participant/player-number";
import type { AddEntryInput } from "./add-entry/schema";
import { DivisionMemberNotFoundError } from "./errors";
import type { DivisionSetupTx } from "./setup-store";
```

`add-entry/repository.ts` は移した 3 関数を削除し、`import { resolveMemberId, resolveParticipantId } from "../entry-member";` を足す（不要になった `nextPlayerNumber` / `DivisionMemberNotFoundError` の import を消す）。挙動は変えない。

`first-round-store.ts`:

```ts
import "server-only";
import { Effect } from "effect";
import { type DivisionError, DivisionShapeMismatchError } from "./errors";
import {
  type DivisionIds,
  type DivisionSetup,
  type DivisionSetupOutcome,
  type DivisionSetupTx,
  runDivisionSetup,
} from "./setup-store";
import { isSingleEliminationShape } from "./single-elimination/build";

type Applicable<T> = { applicable: false } | { applicable: true; value: T };

/**
 * 1 回戦を直接編集する 4 スライスが共有する入口。runDivisionSetup の
 * トランザクション・結果ロック・保存前検証に、次の 2 つを足す。
 *
 * - SINGLE_ELIMINATION 以外は「その部門は無い」と同じ found: false に倒す
 *   （ダブルエリミは勝者側 1 回戦を直接いじると敗者側の対応が崩れるため対象外）。
 * - トーナメントの形でない組み合わせは部分編集させない（league の星取表を
 *   1 回戦だけ取り出して組み直すと 2 節目以降が消える）。
 */
export const runFirstRoundEdit = <T>(
  ids: DivisionIds,
  mutate: (
    tx: DivisionSetupTx,
    current: DivisionSetup,
  ) => Promise<{ next: DivisionSetup | null; value: T }>,
): Effect.Effect<DivisionSetupOutcome<T>, DivisionError> =>
  runDivisionSetup<Applicable<T>>(ids, async (tx, current) => {
    if (current.format !== "SINGLE_ELIMINATION") {
      return { next: null, value: { applicable: false } };
    }
    if (!isSingleEliminationShape(current.matchingConfig)) {
      throw new DivisionShapeMismatchError({ divisionId: ids.divisionId });
    }
    const { next, value } = await mutate(tx, current);
    return { next, value: { applicable: true, value } };
  }).pipe(
    Effect.map(
      (outcome): DivisionSetupOutcome<T> =>
        outcome.found && outcome.value.applicable
          ? { found: true, value: outcome.value.value }
          : { found: false },
    ),
  );
```

`first-round-schema.ts`:

```ts
import { z } from "zod";

export const matchIdSchema = z.string().min(1, "試合の指定が不正です");

/** 1 回戦のどのスロットか。FormData は文字列なので "0" / "1" を受けて数値にする。 */
export const slotTargetSchema = z.object({
  matchId: matchIdSchema,
  slotIndex: z
    .enum(["0", "1"], { error: "スロットの指定が不正です" })
    .transform((value): 0 | 1 => (value === "0" ? 0 : 1)),
});

export type SlotTarget = z.infer<typeof slotTargetSchema>;

/** 全フォームが hidden で送る 3 つの id。 */
export const readDivisionIds = (formData: FormData) => ({
  slug: String(formData.get("slug") ?? ""),
  tournamentId: String(formData.get("tournamentId") ?? ""),
  divisionId: String(formData.get("divisionId") ?? ""),
});
```

`state.ts` の `succeeded` の JSDoc 最終文を差し替え:

```ts
   * 同じ行での連続した成功を見分けられない。設定するのは record-result と、
   * スロット編集モーダルを閉じる合図に使う assign-slot / clear-slot /
   * remove-first-round-match。他スライスでは undefined のまま。
```

- [ ] **Step 4: テストを通す**

Run: `pnpm test src/features/division/`
Expected: PASS（add-entry の既存テストも含めて）

- [ ] **Step 5: Commit**

```bash
git add src/features/division/errors.ts src/features/division/messages.ts src/features/division/messages.test.ts src/features/division/entry-member.ts src/features/division/add-entry/repository.ts src/features/division/state.ts src/features/division/first-round-store.ts src/features/division/first-round-store.test.ts src/features/division/first-round-schema.ts src/features/division/first-round-schema.test.ts
git commit -m "feat(division): add the shared entry point for first-round edits"
```

---

### Task 4: スライス add-first-round-match / remove-first-round-match

**Files:**
- Create: `src/features/division/add-first-round-match/{handler.ts,usecase.ts,repository.ts}` + `repository.test.ts`, `handler.test.ts`
- Create: `src/features/division/remove-first-round-match/{handler.ts,usecase.ts,repository.ts,schema.ts}` + `repository.test.ts`, `handler.test.ts`

**Interfaces:**
- Consumes: `runFirstRoundEdit`, `readDivisionIds`, `matchIdSchema`（Task 3）; `addFirstRoundMatch`, `removeFirstRoundMatch`, `removeEntries`, `firstRoundPairs`, `MAX_FIRST_ROUND_MATCHES`（Task 2）
- Produces:
  - `addFirstRoundMatchAction(prev: DivisionFormState, formData: FormData): Promise<DivisionFormState>` — 成功で `{ error: null }`
  - `removeFirstRoundMatchAction(prev, formData)` — formData に `matchId`。成功で `{ error: null, succeeded: (prev.succeeded ?? 0) + 1 }`

- [ ] **Step 1: 失敗するテスト（repository）を書く**

`add-first-round-match/repository.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildFromFirstRound } from "../single-elimination/build";
import { firstRoundPairs } from "../single-elimination/first-round";

const divisionFindFirst = vi.fn();
const divisionUpdateMany = vi.fn();
const participantFindMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (run: (tx: unknown) => Promise<unknown>) =>
      run({
        division: {
          findFirst: (args: unknown) => divisionFindFirst(args),
          updateMany: (args: unknown) => divisionUpdateMany(args),
        },
        participant: { findMany: (args: unknown) => participantFindMany(args) },
      }),
  },
}));

const { addFirstRoundMatchInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };
const bye = { kind: "bye" } as const;
const row = (matchCount: number) => ({
  format: "SINGLE_ELIMINATION",
  entries: { version: 1, entries: [] },
  matchingConfig: buildFromFirstRound(
    Array.from({ length: matchCount }, () => [bye, bye] as [typeof bye, typeof bye]),
  ),
  results: { version: 1, matches: [] },
});

beforeEach(() => {
  divisionFindFirst.mockReset();
  divisionUpdateMany.mockReset();
  participantFindMany.mockReset();
  participantFindMany.mockResolvedValue([]);
  divisionUpdateMany.mockResolvedValue({ count: 1 });
});

describe("addFirstRoundMatchInDb", () => {
  it("空の試合を 1 つ足して書き込む", async () => {
    divisionFindFirst.mockResolvedValue(row(2));
    const result = await Effect.runPromise(addFirstRoundMatchInDb(ids));
    expect(result).toEqual({ found: true, value: null });
    const written = divisionUpdateMany.mock.calls[0][0].data.matchingConfig;
    expect(firstRoundPairs(written)).toHaveLength(3);
  });

  it("64 試合あれば DivisionFirstRoundLimitError", async () => {
    divisionFindFirst.mockResolvedValue(row(64));
    const exit = await Effect.runPromiseExit(addFirstRoundMatchInDb(ids));
    expect(failureTag(exit)).toBe("DivisionFirstRoundLimitError");
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });
});
```

`remove-first-round-match/repository.test.ts`（同じモック前置き。`import { removeFirstRoundMatchInDb } from "./repository"` を動的 import）:

```ts
const e = (id: string) => ({ kind: "entry" as const, entryId: id });
const entries = {
  version: 1,
  entries: ["a", "b", "c"].map((id, seed) => ({ id, participantId: `p-${id}`, seed })),
};

beforeEach(() => {
  // （前置きの mockReset 群に加えて）
  divisionFindFirst.mockResolvedValue({
    format: "SINGLE_ELIMINATION",
    entries,
    matchingConfig: buildFromFirstRound([
      [e("a"), e("b")],
      [e("c"), { kind: "bye" }],
    ]),
    results: { version: 1, matches: [] },
  });
  participantFindMany.mockResolvedValue(entries.entries.map((x) => ({ id: x.participantId })));
});

describe("removeFirstRoundMatchInDb", () => {
  it("試合と、その試合の選手のエントリーを消す", async () => {
    const result = await Effect.runPromise(removeFirstRoundMatchInDb(ids, { matchId: "m1-0" }));
    expect(result).toEqual({ found: true, value: null });
    const data = divisionUpdateMany.mock.calls[0][0].data;
    expect(data.entries.entries.map((x: { id: string }) => x.id)).toEqual(["c"]);
    expect(firstRoundPairs(data.matchingConfig)).toEqual([[e("c"), { kind: "bye" }]]);
  });

  it("1 回戦に無い試合は DivisionMatchNotFoundError", async () => {
    const exit = await Effect.runPromiseExit(removeFirstRoundMatchInDb(ids, { matchId: "m2-0" }));
    expect(failureTag(exit)).toBe("DivisionMatchNotFoundError");
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `pnpm test src/features/division/add-first-round-match src/features/division/remove-first-round-match`
Expected: FAIL

- [ ] **Step 3: repository / usecase / schema を実装**

`add-first-round-match/repository.ts`:

```ts
import "server-only";
import type { Effect } from "effect";
import { type DivisionError, DivisionFirstRoundLimitError } from "../errors";
import { runFirstRoundEdit } from "../first-round-store";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import {
  addFirstRoundMatch,
  firstRoundPairs,
  MAX_FIRST_ROUND_MATCHES,
} from "../single-elimination/first-round";

export type AddFirstRoundMatchPort = (
  ids: DivisionIds,
) => Effect.Effect<DivisionSetupOutcome<null>, DivisionError>;

export const addFirstRoundMatchInDb: AddFirstRoundMatchPort = (ids) =>
  runFirstRoundEdit<null>(ids, async (_tx, current) => {
    if (
      firstRoundPairs(current.matchingConfig).length >= MAX_FIRST_ROUND_MATCHES
    ) {
      throw new DivisionFirstRoundLimitError({
        divisionId: ids.divisionId,
        limit: MAX_FIRST_ROUND_MATCHES,
      });
    }
    return {
      next: {
        ...current,
        matchingConfig: addFirstRoundMatch(current.matchingConfig),
      },
      value: null,
    };
  });
```

`add-first-round-match/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { AddFirstRoundMatchPort } from "./repository";

export const addFirstRoundMatchToDivision = (
  port: AddFirstRoundMatchPort,
  ids: DivisionIds,
): Effect.Effect<DivisionSetupOutcome<null>, DivisionError> => port(ids);
```

`remove-first-round-match/schema.ts`:

```ts
import { z } from "zod";
import { matchIdSchema } from "../first-round-schema";

export const removeFirstRoundMatchSchema = z.object({ matchId: matchIdSchema });

export type RemoveFirstRoundMatchInput = z.infer<typeof removeFirstRoundMatchSchema>;
```

`remove-first-round-match/repository.ts`:

```ts
import "server-only";
import type { Effect } from "effect";
import { type DivisionError, DivisionMatchNotFoundError } from "../errors";
import { runFirstRoundEdit } from "../first-round-store";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import {
  removeEntries,
  removeFirstRoundMatch,
} from "../single-elimination/first-round";
import type { RemoveFirstRoundMatchInput } from "./schema";

export type RemoveFirstRoundMatchPort = (
  ids: DivisionIds,
  input: RemoveFirstRoundMatchInput,
) => Effect.Effect<DivisionSetupOutcome<null>, DivisionError>;

export const removeFirstRoundMatchInDb: RemoveFirstRoundMatchPort = (
  ids,
  input,
) =>
  runFirstRoundEdit<null>(ids, async (_tx, current) => {
    const removed = removeFirstRoundMatch(current.matchingConfig, input.matchId);
    // 画面が古いと、もう無い試合を指してくる。黙って成功にすると
    // 運営者は消えたと思い込むので、再読み込みを促す。
    if (removed === null) {
      throw new DivisionMatchNotFoundError({ matchId: input.matchId });
    }
    return {
      next: {
        format: current.format,
        entries: removeEntries(current.entries, removed.removedEntryIds),
        matchingConfig: removed.config,
      },
      value: null,
    };
  });
```

`remove-first-round-match/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { RemoveFirstRoundMatchPort } from "./repository";
import type { RemoveFirstRoundMatchInput } from "./schema";

export const removeFirstRoundMatchFromDivision = (
  port: RemoveFirstRoundMatchPort,
  ids: DivisionIds,
  input: RemoveFirstRoundMatchInput,
): Effect.Effect<DivisionSetupOutcome<null>, DivisionError> => port(ids, input);
```

- [ ] **Step 4: repository テストを通す**

Run: `pnpm test src/features/division/add-first-round-match src/features/division/remove-first-round-match`
Expected: PASS

- [ ] **Step 5: 失敗するテスト（handler）を書く**

`add-first-round-match/handler.test.ts`（`add-entry/handler.test.ts` の前置きを踏襲。モジュールモックは `@/shared/middleware/require-organization`, `next/navigation`, `../revalidate`, `./repository`）:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DivisionFirstRoundLimitError } from "../errors";
import { INITIAL_DIVISION_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const addFirstRoundMatchInDb = vi.fn();
const revalidateDivisionSetup = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => requireOrganization(slug),
}));
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("../revalidate", () => ({
  revalidateDivisionSetup: (...args: unknown[]) => revalidateDivisionSetup(...args),
}));
vi.mock("./repository", () => ({
  addFirstRoundMatchInDb: (ids: unknown) => addFirstRoundMatchInDb(ids),
}));

const { addFirstRoundMatchAction } = await import("./handler");

const formData = () => {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("tournamentId", "t1");
  data.set("divisionId", "d1");
  return data;
};

beforeEach(() => {
  requireOrganization.mockReset();
  addFirstRoundMatchInDb.mockReset();
  revalidateDivisionSetup.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({
    organization: { id: "o1" },
    session: { user: { id: "u1" } },
  });
  addFirstRoundMatchInDb.mockReturnValue(Effect.succeed({ found: true, value: null }));
});

describe("addFirstRoundMatchAction", () => {
  it("組織の id でポートを呼び、再検証する", async () => {
    const state = await addFirstRoundMatchAction(INITIAL_DIVISION_FORM_STATE, formData());
    expect(requireOrganization).toHaveBeenCalledWith("acme");
    expect(addFirstRoundMatchInDb).toHaveBeenCalledWith({
      organizationId: "o1",
      tournamentId: "t1",
      divisionId: "d1",
    });
    expect(revalidateDivisionSetup).toHaveBeenCalledWith("acme", "t1", "d1");
    expect(state).toEqual({ error: null });
  });

  it("ドメインエラーは文言にする", async () => {
    addFirstRoundMatchInDb.mockReturnValue(
      Effect.fail(new DivisionFirstRoundLimitError({ divisionId: "d1", limit: 64 })),
    );
    const state = await addFirstRoundMatchAction(INITIAL_DIVISION_FORM_STATE, formData());
    expect(state).toEqual({ error: "1回戦は64試合までです" });
  });

  it("見つからなければ 404", async () => {
    addFirstRoundMatchInDb.mockReturnValue(Effect.succeed({ found: false }));
    await expect(
      addFirstRoundMatchAction(INITIAL_DIVISION_FORM_STATE, formData()),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
```

`remove-first-round-match/handler.test.ts`: 同じ前置きで `removeFirstRoundMatchInDb: (ids, input) => removeFirstRoundMatchInDb(ids, input)` をモックし、次を検証:

```ts
it("matchId をポートへ渡し、succeeded を 1 増やす", async () => {
  const data = formData();
  data.set("matchId", "m1-2");
  const state = await removeFirstRoundMatchAction({ error: null, succeeded: 2 }, data);
  expect(removeFirstRoundMatchInDb).toHaveBeenCalledWith(
    { organizationId: "o1", tournamentId: "t1", divisionId: "d1" },
    { matchId: "m1-2" },
  );
  expect(state).toEqual({ error: null, succeeded: 3 });
});

it("matchId が空なら入力エラーでポートを呼ばない", async () => {
  const state = await removeFirstRoundMatchAction(INITIAL_DIVISION_FORM_STATE, formData());
  expect(state).toEqual({ error: "試合の指定が不正です" });
  expect(removeFirstRoundMatchInDb).not.toHaveBeenCalled();
});
```

- [ ] **Step 6: handler を実装**

`add-first-round-match/handler.ts`:

```ts
"use server";

import { Exit } from "effect";
import { notFound } from "next/navigation";
import { runOperationExit } from "@/shared/lib/logger/run-operation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import { readDivisionIds } from "../first-round-schema";
import { revalidateDivisionSetup } from "../revalidate";
import type { DivisionFormState } from "../state";
import { addFirstRoundMatchInDb } from "./repository";
import { addFirstRoundMatchToDivision } from "./usecase";

export const addFirstRoundMatchAction = async (
  _prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const { slug, tournamentId, divisionId } = readDivisionIds(formData);
  // Server Action はページを経由せず直接叩ける別の入口なので、ここで独立に確かめる。
  const { organization, session } = await requireOrganization(slug);

  const exit = await runOperationExit(
    "division.add-first-round-match",
    {
      context: {
        userId: session.user.id,
        organizationId: organization.id,
        tournamentId,
        divisionId,
      },
    },
    addFirstRoundMatchToDivision(addFirstRoundMatchInDb, {
      organizationId: organization.id,
      tournamentId,
      divisionId,
    }),
  );

  if (Exit.isFailure(exit)) {
    return divisionErrorFormState(exit.cause);
  }
  // 見つからないことと権限が無いことを区別させないため 404 に倒す。
  if (!exit.value.found) {
    notFound();
  }

  revalidateDivisionSetup(slug, tournamentId, divisionId);
  return { error: null };
};
```

`remove-first-round-match/handler.ts`: 上と同じ骨格で、`requireOrganization` の後に

```ts
  const parsed = removeFirstRoundMatchSchema.safeParse({
    matchId: String(formData.get("matchId") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
```

を入れ、operation 名 `"division.remove-first-round-match"`、options に `request: parsed.data` を足し、`removeFirstRoundMatchFromDivision(removeFirstRoundMatchInDb, ids, parsed.data)` を実行する。第 1 引数は `prevState` と名付け、最後は

```ts
  revalidateDivisionSetup(slug, tournamentId, divisionId);
  // モーダルを閉じる合図。成功の戻り値が毎回同じ形なので、回数で見分ける。
  return { error: null, succeeded: (prevState.succeeded ?? 0) + 1 };
```

- [ ] **Step 7: テストを通す**

Run: `pnpm test src/features/division/add-first-round-match src/features/division/remove-first-round-match`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/features/division/add-first-round-match src/features/division/remove-first-round-match
git commit -m "feat(division): add and remove first-round matches with automatic rewiring"
```

---

### Task 5: スライス assign-slot / clear-slot

**Files:**
- Create: `src/features/division/assign-slot/{handler.ts,usecase.ts,repository.ts,schema.ts}` + `repository.test.ts`, `handler.test.ts`
- Create: `src/features/division/clear-slot/{handler.ts,usecase.ts,repository.ts}` + `repository.test.ts`, `handler.test.ts`

**Interfaces:**
- Consumes: `runFirstRoundEdit`, `slotTargetSchema`, `SlotTarget`, `readDivisionIds`, `resolveMemberId`, `resolveParticipantId`（Task 3）; `setFirstRoundSlot`, `removeEntries`（Task 2）; `addEntrySchema`, `AddEntryInput`（既存 `add-entry/schema.ts`）
- Produces:
  - `assignSlotAction(prev, formData)` — formData: `matchId`, `slotIndex`, `mode`, `memberId` | `name`, `nameKana`。成功で `{ error: null, succeeded: prev+1 }`
  - `clearSlotAction(prev, formData)` — formData: `matchId`, `slotIndex`。成功で `{ error: null, succeeded: prev+1 }`
  - `type AssignSlotInput = SlotTarget & { member: AddEntryInput }`

- [ ] **Step 1: 失敗するテスト（repository）を書く**

`assign-slot/repository.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildFromFirstRound } from "../single-elimination/build";
import { firstRoundPairs } from "../single-elimination/first-round";

const divisionFindFirst = vi.fn();
const divisionUpdateMany = vi.fn();
const participantFindMany = vi.fn();
const participantFindFirst = vi.fn();
const participantCreate = vi.fn();
const memberFindFirst = vi.fn();
const memberCreate = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (run: (tx: unknown) => Promise<unknown>) =>
      run({
        division: {
          findFirst: (args: unknown) => divisionFindFirst(args),
          updateMany: (args: unknown) => divisionUpdateMany(args),
        },
        participant: {
          findMany: (args: unknown) => participantFindMany(args),
          findFirst: (args: unknown) => participantFindFirst(args),
          create: (args: unknown) => participantCreate(args),
        },
        member: {
          findFirst: (args: unknown) => memberFindFirst(args),
          create: (args: unknown) => memberCreate(args),
        },
      }),
  },
}));

const { assignSlotInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };
const bye = { kind: "bye" } as const;
const e = (id: string) => ({ kind: "entry" as const, entryId: id });
const entries = { version: 1, entries: [{ id: "a", participantId: "p-a", seed: 0 }] };

beforeEach(() => {
  for (const fn of [
    divisionFindFirst, divisionUpdateMany, participantFindMany,
    participantFindFirst, participantCreate, memberFindFirst, memberCreate,
  ]) fn.mockReset();
  divisionFindFirst.mockResolvedValue({
    format: "SINGLE_ELIMINATION",
    entries,
    matchingConfig: buildFromFirstRound([[e("a"), bye]]),
    results: { version: 1, matches: [] },
  });
  // save の検証（id）と選手番号の採番（playerNumber）の両方がこれを読む。
  participantFindMany.mockResolvedValue([
    { id: "p-a", playerNumber: "1" },
    { id: "p-new", playerNumber: "2" },
  ]);
  divisionUpdateMany.mockResolvedValue({ count: 1 });
  memberFindFirst.mockResolvedValue({ id: "m-2" });
  participantFindFirst.mockResolvedValue({ id: "p-new" });
});

describe("assignSlotInDb", () => {
  it("既存メンバーを空きスロットに置き、エントリーを足す", async () => {
    const result = await Effect.runPromise(
      assignSlotInDb(ids, { matchId: "m1-0", slotIndex: 1, member: { mode: "existing", memberId: "m-2" } }),
    );
    expect(result).toEqual({ found: true, value: null });
    const data = divisionUpdateMany.mock.calls[0][0].data;
    const added = data.entries.entries.find((x: { participantId: string }) => x.participantId === "p-new");
    expect(added.seed).toBe(1);
    expect(firstRoundPairs(data.matchingConfig)[0]).toEqual([e("a"), e(added.id)]);
  });

  it("差し替えたら前の選手のエントリーを消す", async () => {
    await Effect.runPromise(
      assignSlotInDb(ids, { matchId: "m1-0", slotIndex: 0, member: { mode: "existing", memberId: "m-2" } }),
    );
    const data = divisionUpdateMany.mock.calls[0][0].data;
    expect(data.entries.entries.map((x: { participantId: string }) => x.participantId)).toEqual(["p-new"]);
  });

  it("新規メンバーなら Member と Participant を作る", async () => {
    memberCreate.mockResolvedValue({ id: "m-3" });
    participantFindFirst.mockResolvedValue(null);
    participantCreate.mockResolvedValue({ id: "p-new" });
    await Effect.runPromise(
      assignSlotInDb(ids, {
        matchId: "m1-0",
        slotIndex: 1,
        member: { mode: "new", name: "佐藤 蓮", nameKana: "さとう れん" },
      }),
    );
    expect(memberCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { organizationId: "o1", name: "佐藤 蓮", nameKana: "さとう れん" } }),
    );
    expect(participantCreate).toHaveBeenCalled();
  });

  it("既に部門にいる参加者は DivisionDuplicateEntryError", async () => {
    participantFindFirst.mockResolvedValue({ id: "p-a" });
    const exit = await Effect.runPromiseExit(
      assignSlotInDb(ids, { matchId: "m1-0", slotIndex: 1, member: { mode: "existing", memberId: "m-1" } }),
    );
    expect(failureTag(exit)).toBe("DivisionDuplicateEntryError");
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("1 回戦に無い試合は Member を作る前に DivisionMatchNotFoundError", async () => {
    const exit = await Effect.runPromiseExit(
      assignSlotInDb(ids, { matchId: "m9-9", slotIndex: 0, member: { mode: "new", name: "x", nameKana: "x" } }),
    );
    expect(failureTag(exit)).toBe("DivisionMatchNotFoundError");
    expect(memberCreate).not.toHaveBeenCalled();
  });
});
```

`clear-slot/repository.test.ts`（swap-slots と同じ 3 モックの前置き。`import { clearSlotInDb } from "./repository"`）:

```ts
const bye = { kind: "bye" } as const;
const e = (id: string) => ({ kind: "entry" as const, entryId: id });
const entries = {
  version: 1,
  entries: [
    { id: "a", participantId: "p-a", seed: 0 },
    { id: "b", participantId: "p-b", seed: 1 },
  ],
};

beforeEach(() => {
  // （mockReset 群）
  divisionFindFirst.mockResolvedValue({
    format: "SINGLE_ELIMINATION",
    entries,
    matchingConfig: buildFromFirstRound([[e("a"), e("b")]]),
    results: { version: 1, matches: [] },
  });
  participantFindMany.mockResolvedValue([{ id: "p-a" }, { id: "p-b" }]);
  divisionUpdateMany.mockResolvedValue({ count: 1 });
});

describe("clearSlotInDb", () => {
  it("スロットを空にし、その選手のエントリーを消す", async () => {
    const result = await Effect.runPromise(clearSlotInDb(ids, { matchId: "m1-0", slotIndex: 1 }));
    expect(result).toEqual({ found: true, value: null });
    const data = divisionUpdateMany.mock.calls[0][0].data;
    expect(firstRoundPairs(data.matchingConfig)[0]).toEqual([e("a"), bye]);
    expect(data.entries.entries.map((x: { id: string }) => x.id)).toEqual(["a"]);
  });

  it("既に空なら書き込まない", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "SINGLE_ELIMINATION",
      entries,
      matchingConfig: buildFromFirstRound([[e("a"), bye]]),
      results: { version: 1, matches: [] },
    });
    await Effect.runPromise(clearSlotInDb(ids, { matchId: "m1-0", slotIndex: 1 }));
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("1 回戦に無い試合は DivisionMatchNotFoundError", async () => {
    const exit = await Effect.runPromiseExit(clearSlotInDb(ids, { matchId: "m2-0", slotIndex: 0 }));
    expect(failureTag(exit)).toBe("DivisionMatchNotFoundError");
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `pnpm test src/features/division/assign-slot src/features/division/clear-slot`
Expected: FAIL

- [ ] **Step 3: 実装**

`assign-slot/schema.ts`:

```ts
import type { AddEntryInput } from "../add-entry/schema";
import type { SlotTarget } from "../first-round-schema";

/**
 * どのスロットに、誰を置くか。誰の部分は add-entry と同じ二択
 * （既存 Member / 新規登録）なので addEntrySchema をそのまま使い、
 * handler が slotTargetSchema と別々に検証して組み合わせる。
 */
export type AssignSlotInput = SlotTarget & { member: AddEntryInput };
```

`assign-slot/repository.ts`:

```ts
import "server-only";
import { randomUUID } from "node:crypto";
import type { Effect } from "effect";
import { resolveMemberId, resolveParticipantId } from "../entry-member";
import {
  DivisionDuplicateEntryError,
  type DivisionError,
  DivisionMatchNotFoundError,
} from "../errors";
import { runFirstRoundEdit } from "../first-round-store";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import {
  removeEntries,
  setFirstRoundSlot,
} from "../single-elimination/first-round";
import type { AssignSlotInput } from "./schema";

export type AssignSlotPort = (
  ids: DivisionIds,
  input: AssignSlotInput,
) => Effect.Effect<DivisionSetupOutcome<null>, DivisionError>;

export const assignSlotInDb: AssignSlotPort = (ids, input) =>
  runFirstRoundEdit<null>(ids, async (tx, current) => {
    // Member を作ってから試合が無いと分かると、トランザクションは巻き戻るが
    // 無駄な書き込みになる。先に試合の存在を確かめる。
    const exists = current.matchingConfig.matches.some(
      (match) =>
        match.bracket === "winners" &&
        match.round === 1 &&
        match.id === input.matchId,
    );
    if (!exists) {
      throw new DivisionMatchNotFoundError({ matchId: input.matchId });
    }

    const memberId = await resolveMemberId(tx, ids.organizationId, input.member);
    const participantId = await resolveParticipantId(tx, ids.tournamentId, memberId);

    // 同じ人が 2 つのスロットに居るとトーナメントが成り立たない。
    // 同じスロットに同じ人を選び直した場合も、エラーで知らせて何もしない。
    if (current.entries.entries.some((entry) => entry.participantId === participantId)) {
      throw new DivisionDuplicateEntryError({ divisionId: ids.divisionId });
    }

    const maxSeed = current.entries.entries.reduce(
      (max, entry) => Math.max(max, entry.seed),
      -1,
    );
    const added = { id: randomUUID(), participantId, seed: maxSeed + 1 };

    const placed = setFirstRoundSlot(
      current.matchingConfig,
      input.matchId,
      input.slotIndex,
      { kind: "entry", entryId: added.id },
    );
    if (placed === null) {
      throw new DivisionMatchNotFoundError({ matchId: input.matchId });
    }

    const pushedOut = placed.replaced.kind === "entry" ? [placed.replaced.entryId] : [];
    const entries = removeEntries(
      { version: 1, entries: [...current.entries.entries, added] },
      pushedOut,
    );

    return {
      next: { format: current.format, entries, matchingConfig: placed.config },
      value: null,
    };
  });
```


`assign-slot/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { AssignSlotPort } from "./repository";
import type { AssignSlotInput } from "./schema";

export const assignSlotInDivision = (
  port: AssignSlotPort,
  ids: DivisionIds,
  input: AssignSlotInput,
): Effect.Effect<DivisionSetupOutcome<null>, DivisionError> => port(ids, input);
```

`clear-slot/repository.ts`:

```ts
import "server-only";
import type { Effect } from "effect";
import { type DivisionError, DivisionMatchNotFoundError } from "../errors";
import type { SlotTarget } from "../first-round-schema";
import { runFirstRoundEdit } from "../first-round-store";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import {
  removeEntries,
  setFirstRoundSlot,
} from "../single-elimination/first-round";

export type ClearSlotPort = (
  ids: DivisionIds,
  input: SlotTarget,
) => Effect.Effect<DivisionSetupOutcome<null>, DivisionError>;

export const clearSlotInDb: ClearSlotPort = (ids, input) =>
  runFirstRoundEdit<null>(ids, async (_tx, current) => {
    const cleared = setFirstRoundSlot(
      current.matchingConfig,
      input.matchId,
      input.slotIndex,
      { kind: "bye" },
    );
    if (cleared === null) {
      throw new DivisionMatchNotFoundError({ matchId: input.matchId });
    }
    // 既に空なら何も変わらない。書き込みを省く。
    if (cleared.replaced.kind !== "entry") {
      return { next: null, value: null };
    }
    return {
      next: {
        format: current.format,
        entries: removeEntries(current.entries, [cleared.replaced.entryId]),
        matchingConfig: cleared.config,
      },
      value: null,
    };
  });
```

`clear-slot/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { SlotTarget } from "../first-round-schema";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { ClearSlotPort } from "./repository";

export const clearSlotInDivision = (
  port: ClearSlotPort,
  ids: DivisionIds,
  input: SlotTarget,
): Effect.Effect<DivisionSetupOutcome<null>, DivisionError> => port(ids, input);
```

- [ ] **Step 4: repository テストを通す**

Run: `pnpm test src/features/division/assign-slot src/features/division/clear-slot`
Expected: PASS

- [ ] **Step 5: 失敗するテスト（handler）を書く**

両スライスとも Task 4 の handler.test.ts と同じ前置き（モック対象は `./repository` の `assignSlotInDb` / `clearSlotInDb`）。

`assign-slot/handler.test.ts` のケース:

```ts
it("スロットと既存メンバーの選択をポートへ渡し、succeeded を増やす", async () => {
  const data = formData();
  data.set("matchId", "m1-0");
  data.set("slotIndex", "1");
  data.set("mode", "existing");
  data.set("memberId", "m-2");
  const state = await assignSlotAction(INITIAL_DIVISION_FORM_STATE, data);
  expect(assignSlotInDb).toHaveBeenCalledWith(
    { organizationId: "o1", tournamentId: "t1", divisionId: "d1" },
    { matchId: "m1-0", slotIndex: 1, member: { mode: "existing", memberId: "m-2" } },
  );
  expect(state).toEqual({ error: null, succeeded: 1 });
});

it("新規登録で氏名が空なら入力エラー", async () => {
  const data = formData();
  data.set("matchId", "m1-0");
  data.set("slotIndex", "0");
  data.set("mode", "new");
  data.set("name", " ");
  data.set("nameKana", "かな");
  const state = await assignSlotAction(INITIAL_DIVISION_FORM_STATE, data);
  expect(state).toEqual({ error: "氏名を入力してください" });
  expect(assignSlotInDb).not.toHaveBeenCalled();
});

it("slotIndex が不正なら入力エラー", async () => {
  const data = formData();
  data.set("matchId", "m1-0");
  data.set("slotIndex", "5");
  data.set("mode", "existing");
  data.set("memberId", "m-2");
  const state = await assignSlotAction(INITIAL_DIVISION_FORM_STATE, data);
  expect(state).toEqual({ error: "スロットの指定が不正です" });
});
```

`clear-slot/handler.test.ts` のケース:

```ts
it("スロットをポートへ渡し、succeeded を増やす", async () => {
  const data = formData();
  data.set("matchId", "m1-0");
  data.set("slotIndex", "0");
  const state = await clearSlotAction({ error: null, succeeded: 4 }, data);
  expect(clearSlotInDb).toHaveBeenCalledWith(
    { organizationId: "o1", tournamentId: "t1", divisionId: "d1" },
    { matchId: "m1-0", slotIndex: 0 },
  );
  expect(state).toEqual({ error: null, succeeded: 5 });
});

it("見つからなければ 404", async () => {
  clearSlotInDb.mockReturnValue(Effect.succeed({ found: false }));
  const data = formData();
  data.set("matchId", "m1-0");
  data.set("slotIndex", "0");
  await expect(clearSlotAction(INITIAL_DIVISION_FORM_STATE, data)).rejects.toThrow("NEXT_NOT_FOUND");
});
```

- [ ] **Step 6: handler を実装**

`assign-slot/handler.ts`:

```ts
"use server";

import { Exit } from "effect";
import { notFound } from "next/navigation";
import { runOperationExit } from "@/shared/lib/logger/run-operation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { addEntrySchema } from "../add-entry/schema";
import { divisionErrorFormState } from "../effect-to-form-state";
import { readDivisionIds, slotTargetSchema } from "../first-round-schema";
import { revalidateDivisionSetup } from "../revalidate";
import type { DivisionFormState } from "../state";
import { assignSlotInDb } from "./repository";
import { assignSlotInDivision } from "./usecase";

export const assignSlotAction = async (
  prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const { slug, tournamentId, divisionId } = readDivisionIds(formData);
  // Server Action はページを経由せず直接叩ける別の入口なので、ここで独立に確かめる。
  const { organization, session } = await requireOrganization(slug);

  const target = slotTargetSchema.safeParse({
    matchId: String(formData.get("matchId") ?? ""),
    slotIndex: String(formData.get("slotIndex") ?? ""),
  });
  if (!target.success) {
    return { error: target.error.issues[0].message };
  }
  const member = addEntrySchema.safeParse({
    mode: String(formData.get("mode") ?? ""),
    memberId: String(formData.get("memberId") ?? ""),
    name: String(formData.get("name") ?? ""),
    nameKana: String(formData.get("nameKana") ?? ""),
  });
  if (!member.success) {
    return { error: member.error.issues[0].message };
  }
  const input = { ...target.data, member: member.data };

  const exit = await runOperationExit(
    "division.assign-slot",
    {
      request: input,
      context: {
        userId: session.user.id,
        organizationId: organization.id,
        tournamentId,
        divisionId,
      },
    },
    assignSlotInDivision(
      assignSlotInDb,
      { organizationId: organization.id, tournamentId, divisionId },
      input,
    ),
  );

  if (Exit.isFailure(exit)) {
    return divisionErrorFormState(exit.cause);
  }
  // 見つからないことと権限が無いことを区別させないため 404 に倒す。
  if (!exit.value.found) {
    notFound();
  }

  revalidateDivisionSetup(slug, tournamentId, divisionId);
  // モーダルを閉じる合図。成功の戻り値が毎回同じ形なので、回数で見分ける。
  return { error: null, succeeded: (prevState.succeeded ?? 0) + 1 };
};
```

`clear-slot/handler.ts`: 同じ骨格で member の検証を除き、`input = target.data`、operation 名 `"division.clear-slot"`、`clearSlotInDivision(clearSlotInDb, ids, input)`。

- [ ] **Step 7: テストを通す**

Run: `pnpm test src/features/division/`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/features/division/assign-slot src/features/division/clear-slot
git commit -m "feat(division): assign and clear first-round slots"
```

---

### Task 6: 鉛筆ボタン付き MatchCard とスロット編集モーダル

**Files:**
- Create: `src/components/ui/PencilIcon.tsx`, `src/components/tournament/slot-edit-context.ts`, `src/components/division/SlotEditDialog.tsx`, `src/components/division/EditableBracket.tsx`
- Modify: `src/components/tournament/MatchCard.tsx`, `src/components/division/DivisionBracket.tsx`
- Test: `src/components/tournament/MatchCard.test.tsx`（追記）, `src/components/division/SlotEditDialog.test.tsx`, `src/components/division/DivisionBracket.test.tsx`（追記）

**Interfaces:**
- Consumes: Task 4/5 の action（`DivisionFormAction` 型として受け取る）
- Produces:
  - `SlotEditContext`（`{ locked: boolean; onEditSlot: (matchId: string, slotIndex: 0 | 1) => void } | null`）
  - `SlotEditDialog` props: `{ target: SlotEditTarget; slug; tournamentId; divisionId; members: MemberSummary[]; actions: SlotEditActions; onClose: () => void }`
  - `type SlotEditTarget = { matchId: string; slotIndex: 0 | 1; matchName: string | null; occupantName: string | null }`
  - `type SlotEditActions = { assignSlot: DivisionFormAction; clearSlot: DivisionFormAction; removeMatch: DivisionFormAction }`
  - `type BracketEditor = { locked: boolean; slug: string; tournamentId: string; divisionId: string; members: MemberSummary[]; actions: SlotEditActions }`
  - `DivisionBracket` に `editor?: BracketEditor`

- [ ] **Step 1: 失敗するテストを書く**

`MatchCard.test.tsx` に追記（`import { SlotEditContext } from "./slot-edit-context"; import userEvent from "@testing-library/user-event"; import { vi } from "vitest";`）:

```ts
const firstRound: ResolvedMatch = {
  ...doneMatch,
  id: "m1-0",
  round: 1,
  slots: [confirmed("e1", "佐藤 蓮", 1, false), bye],
  winnerId: null,
  status: "bye",
  sourceMatchIds: [null, null],
};

describe("MatchCard の鉛筆ボタン", () => {
  it("context が無ければ出さない", () => {
    render(<MatchCard match={firstRound} />);
    expect(screen.queryByRole("button", { name: /選手を編集/ })).not.toBeInTheDocument();
  });

  it("1 回戦の両スロットに出し、押すと試合とスロットを伝える", async () => {
    const onEditSlot = vi.fn();
    render(
      <SlotEditContext.Provider value={{ locked: false, onEditSlot }}>
        <MatchCard match={firstRound} />
      </SlotEditContext.Provider>,
    );
    const buttons = screen.getAllByRole("button", { name: /選手を編集/ });
    expect(buttons).toHaveLength(2);
    await userEvent.click(buttons[1]);
    expect(onEditSlot).toHaveBeenCalledWith("m1-0", 1);
  });

  it("locked なら押せない", () => {
    render(
      <SlotEditContext.Provider value={{ locked: true, onEditSlot: vi.fn() }}>
        <MatchCard match={firstRound} />
      </SlotEditContext.Provider>,
    );
    for (const button of screen.getAllByRole("button", { name: /選手を編集/ })) {
      expect(button).toBeDisabled();
    }
  });

  it("2 回戦以降には出さない", () => {
    render(
      <SlotEditContext.Provider value={{ locked: false, onEditSlot: vi.fn() }}>
        <MatchCard match={doneMatch} />
      </SlotEditContext.Provider>,
    );
    expect(screen.queryByRole("button", { name: /選手を編集/ })).not.toBeInTheDocument();
  });
});
```

`SlotEditDialog.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { DivisionFormState } from "@/features/division/state";
import { SlotEditDialog } from "./SlotEditDialog";

// jsdom は <dialog> の showModal / close を実装していない（ConfirmDialog.test.tsx と同じ）。
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

const succeed = vi.fn(async (prev: DivisionFormState) => ({
  error: null,
  succeeded: (prev.succeeded ?? 0) + 1,
}));

const props = (overrides: Partial<Parameters<typeof SlotEditDialog>[0]> = {}) => ({
  target: { matchId: "m1-0", slotIndex: 1 as const, matchName: "第1試合", occupantName: "佐藤 蓮" },
  slug: "acme",
  tournamentId: "t1",
  divisionId: "d1",
  members: [{ id: "m-2", name: "鈴木 陽菜", nameKana: "すずき はるな" }],
  actions: { assignSlot: succeed, clearSlot: succeed, removeMatch: succeed },
  onClose: vi.fn(),
  ...overrides,
});

describe("SlotEditDialog", () => {
  it("開いた時点でモーダルを表示し、対象を見出しに出す", () => {
    render(<SlotEditDialog {...props()} />);
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
    expect(screen.getByText("第1試合 の下側")).toBeInTheDocument();
    expect(screen.getByText("現在: 佐藤 蓮")).toBeInTheDocument();
  });

  it("既存メンバーを選んで送ると assignSlot に対象スロットとメンバーが渡り、閉じる", async () => {
    const assignSlot = vi.fn(succeed);
    const onClose = vi.fn();
    render(<SlotEditDialog {...props({ onClose, actions: { assignSlot, clearSlot: succeed, removeMatch: succeed } })} />);
    await userEvent.click(screen.getByRole("button", { name: "この選手にする" }));
    await waitFor(() => expect(assignSlot).toHaveBeenCalled());
    const data = assignSlot.mock.calls[0][1] as FormData;
    expect(Object.fromEntries(data)).toMatchObject({
      slug: "acme", tournamentId: "t1", divisionId: "d1",
      matchId: "m1-0", slotIndex: "1", mode: "existing", memberId: "m-2",
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("空のスロットでは「スロットを空にする」を出さない", () => {
    render(<SlotEditDialog {...props({ target: { matchId: "m1-0", slotIndex: 0, matchName: null, occupantName: null } })} />);
    expect(screen.queryByRole("button", { name: "スロットを空にする" })).not.toBeInTheDocument();
    expect(screen.getByText("現在: 空き")).toBeInTheDocument();
  });

  it("試合を削除すると removeMatch に matchId が渡る", async () => {
    const removeMatch = vi.fn(succeed);
    render(<SlotEditDialog {...props({ actions: { assignSlot: succeed, clearSlot: succeed, removeMatch } })} />);
    await userEvent.click(screen.getByRole("button", { name: "試合を削除" }));
    await waitFor(() => expect(removeMatch).toHaveBeenCalled());
    expect((removeMatch.mock.calls[0][1] as FormData).get("matchId")).toBe("m1-0");
  });

  it("失敗したら閉じずにエラーを出す", async () => {
    const fail = vi.fn(async () => ({ error: "その参加者はすでにエントリーしています" }));
    const onClose = vi.fn();
    render(<SlotEditDialog {...props({ onClose, actions: { assignSlot: fail, clearSlot: succeed, removeMatch: succeed } })} />);
    await userEvent.click(screen.getByRole("button", { name: "この選手にする" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("その参加者はすでにエントリーしています");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("メンバーが居なければ新規登録だけを出す", () => {
    render(<SlotEditDialog {...props({ members: [] })} />);
    expect(screen.getByLabelText("氏名")).toBeInTheDocument();
    expect(screen.queryByLabelText("メンバー")).not.toBeInTheDocument();
  });
});
```

`DivisionBracket.test.tsx` に追記。既存ファイルは `vi.mock("@/components/tournament/TournamentFlow", ...)` の後に `const { DivisionBracket } = await import("./DivisionBracket");` をしている。その **import より前** に次のモックを足す:

```tsx
const editableProps = vi.fn();
vi.mock("./EditableBracket", () => ({
  EditableBracket: (props: { nodes: unknown[]; locked: boolean }) => {
    editableProps(props);
    return <div data-testid="editable">{props.nodes.length}</div>;
  },
}));
```

ケース（`buildDivision` / `participants` / `noSeq` は既存ファイルのフィクスチャ）:

```tsx
describe("editor", () => {
  const action = vi.fn(async () => ({ error: null }));
  const editor = {
    locked: true,
    slug: "acme",
    tournamentId: "t1",
    divisionId: "d1",
    members: [],
    actions: { assignSlot: action, clearSlot: action, removeMatch: action },
  };

  it("editor を渡すと EditableBracket で描き、locked を渡す", () => {
    render(
      <DivisionBracket
        division={buildDivision()}
        participants={participants}
        overallSeq={noSeq}
        editor={editor}
      />,
    );
    expect(screen.getByTestId("editable")).toBeInTheDocument();
    expect(screen.queryByTestId("flow")).not.toBeInTheDocument();
    const props = editableProps.mock.calls.at(-1)?.[0] as { locked: boolean; nodes: unknown[] };
    expect(props.locked).toBe(true);
    expect(props.nodes.length).toBeGreaterThan(0);
  });

  it("editor が無ければ従来どおり TournamentFlow", () => {
    render(
      <DivisionBracket division={buildDivision()} participants={participants} overallSeq={noSeq} />,
    );
    expect(screen.getByTestId("flow")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `pnpm test src/components/tournament/MatchCard.test.tsx src/components/division/SlotEditDialog.test.tsx src/components/division/DivisionBracket.test.tsx`
Expected: FAIL

- [ ] **Step 3: 実装**

`src/components/ui/PencilIcon.tsx`:

```tsx
/** 編集ボタン用の鉛筆。アイコンライブラリを入れないのでインライン SVG で持つ。 */
export function PencilIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-.793.793-2.828-2.828.793-.793ZM11.379 5.793 3 14.172V17h2.828l8.38-8.379-2.83-2.828Z" />
    </svg>
  );
}
```

`src/components/tournament/slot-edit-context.ts`:

```ts
"use client";

import { createContext, useContext } from "react";

/**
 * ブラケットを編集画面として使うときだけ与える。React Flow のノードには
 * 関数を data として渡すより context で届けるほうが、ノードの再生成と
 * 無関係に済む。null（既定）のときは閲覧専用で、鉛筆を出さない。
 */
export type SlotEditContextValue = {
  locked: boolean;
  onEditSlot: (matchId: string, slotIndex: 0 | 1) => void;
};

export const SlotEditContext = createContext<SlotEditContextValue | null>(null);

export const useSlotEdit = (): SlotEditContextValue | null =>
  useContext(SlotEditContext);
```

`MatchCard.tsx` の変更:
- 先頭に `"use client";` を追加（hook を使うため。呼び出し元の TournamentFlow は既に client）。
- `import { PencilIcon } from "@/components/ui/PencilIcon";` と `import { useSlotEdit } from "./slot-edit-context";`
- `SlotRow` に `edit?: { locked: boolean; onEdit: () => void }` prop を追加し、`winReason` の表示の後（行の最後の子）に:

```tsx
      {edit !== undefined && (
        // ブラケットはノードの選択もドラッグも切っているため、React Flow が
        // ノードに pointer-events: none を付ける。メモボタンと同じく
        // pointer-events-auto と nodrag / nopan でこのボタンだけ押せるようにする。
        <span className="nodrag nopan pointer-events-auto shrink-0">
          <button
            type="button"
            onClick={edit.onEdit}
            disabled={edit.locked}
            aria-label={`${index === 0 ? "上" : "下"}側の選手を編集`}
            className="rounded p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PencilIcon />
          </button>
        </span>
      )}
```

- `MatchCard` 本体の先頭で:

```tsx
  const slotEdit = useSlotEdit();
  // 選手を直接置けるのは勝者側 1 回戦だけ。2 回戦以降は勝ち上がりで決まる。
  const editFor = (index: 0 | 1) =>
    slotEdit !== null && match.bracket === "winners" && match.round === 1
      ? { locked: slotEdit.locked, onEdit: () => slotEdit.onEditSlot(match.id, index) }
      : undefined;
```

  2 つの `<SlotRow>` にそれぞれ `edit={editFor(0)}` / `edit={editFor(1)}` を渡す。

`src/components/division/SlotEditDialog.tsx`:

```tsx
"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import {
  type DivisionFormAction,
  type DivisionFormState,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";
import type { MemberSummary } from "@/features/organization/repository";

export type SlotEditTarget = {
  matchId: string;
  slotIndex: 0 | 1;
  /** 展開済みの試合名。無ければ null */
  matchName: string | null;
  /** 今そのスロットに居る人の名前。空きなら null */
  occupantName: string | null;
};

export type SlotEditActions = {
  assignSlot: DivisionFormAction;
  clearSlot: DivisionFormAction;
  removeMatch: DivisionFormAction;
};

/** 成功のたびに増える succeeded を前回値と比べ、増えたら閉じる（MatchResultRow と同じ方式）。 */
const useCloseOnSuccess = (state: DivisionFormState, close: () => void) => {
  const succeeded = state.succeeded ?? 0;
  const trackedRef = useRef(succeeded);
  useEffect(() => {
    if (succeeded > trackedRef.current) {
      trackedRef.current = succeeded;
      close();
    }
  }, [succeeded, close]);
};

/**
 * 1 回戦の 1 スロットを編集するモーダル。呼び出し側は target ごとに key を変えて
 * 描き直すこと（前のスロットの入力やエラーを持ち越さないため）。
 */
export function SlotEditDialog({
  target,
  slug,
  tournamentId,
  divisionId,
  members,
  actions,
  onClose,
}: {
  target: SlotEditTarget;
  slug: string;
  tournamentId: string;
  divisionId: string;
  members: MemberSummary[];
  actions: SlotEditActions;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [mode, setMode] = useState<"existing" | "new">(
    members.length === 0 ? "new" : "existing",
  );
  const [assignState, assignAction, assignPending] = useActionState(
    actions.assignSlot,
    INITIAL_DIVISION_FORM_STATE,
  );
  const [clearState, clearAction, clearPending] = useActionState(
    actions.clearSlot,
    INITIAL_DIVISION_FORM_STATE,
  );
  const [removeState, removeAction, removePending] = useActionState(
    actions.removeMatch,
    INITIAL_DIVISION_FORM_STATE,
  );

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const close = useRef(() => dialogRef.current?.close()).current;
  useCloseOnSuccess(assignState, close);
  useCloseOnSuccess(clearState, close);
  useCloseOnSuccess(removeState, close);

  const pending = assignPending || clearPending || removePending;
  const error = assignState.error ?? clearState.error ?? removeState.error;

  const hidden = (
    <>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="divisionId" value={divisionId} />
      <input type="hidden" name="matchId" value={target.matchId} />
      <input type="hidden" name="slotIndex" value={String(target.slotIndex)} />
    </>
  );

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-full max-w-sm rounded border border-slate-200 bg-white p-0 backdrop:bg-slate-900/40"
    >
      <div className="space-y-4 p-5">
        <div>
          <h2 id={titleId} className="text-base font-bold text-slate-800">
            {target.matchName ?? "試合"} の{target.slotIndex === 0 ? "上" : "下"}側
          </h2>
          <p className="text-sm text-slate-600">
            現在: {target.occupantName ?? "空き"}
          </p>
        </div>

        <form action={assignAction} className="space-y-3">
          {hidden}
          <input type="hidden" name="mode" value={mode} />
          {members.length > 0 && (
            <div className="flex gap-4 text-sm text-slate-700">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="modeChoice"
                  checked={mode === "existing"}
                  onChange={() => setMode("existing")}
                />
                既存のメンバーから選ぶ
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="modeChoice"
                  checked={mode === "new"}
                  onChange={() => setMode("new")}
                />
                新しく登録する
              </label>
            </div>
          )}
          {mode === "existing" ? (
            <div className="space-y-1">
              <label htmlFor={`${titleId}-member`} className="block text-sm font-medium text-slate-700">
                メンバー
              </label>
              <select
                id={`${titleId}-member`}
                name="memberId"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              >
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <label htmlFor={`${titleId}-name`} className="block text-sm font-medium text-slate-700">
                  氏名
                </label>
                <input
                  id={`${titleId}-name`}
                  name="name"
                  type="text"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={`${titleId}-kana`} className="block text-sm font-medium text-slate-700">
                  氏名（かな）
                </label>
                <input
                  id={`${titleId}-kana`}
                  name="nameKana"
                  type="text"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            この選手にする
          </button>
        </form>

        {error !== null && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-4">
          <div className="flex gap-2">
            {target.occupantName !== null && (
              <form action={clearAction}>
                {hidden}
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
                >
                  スロットを空にする
                </button>
              </form>
            )}
            <form action={removeAction}>
              {hidden}
              <button
                type="submit"
                disabled={pending}
                className="rounded border border-red-300 px-3 py-2 text-sm text-red-700 disabled:opacity-50"
              >
                試合を削除
              </button>
            </form>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
          >
            キャンセル
          </button>
        </div>
      </div>
    </dialog>
  );
}
```

`src/components/division/EditableBracket.tsx`:

```tsx
"use client";

import type { Edge } from "@xyflow/react";
import { useCallback, useMemo, useState } from "react";
import { SlotEditContext } from "@/components/tournament/slot-edit-context";
import { TournamentFlow } from "@/components/tournament/TournamentFlow";
import type { BracketFlowNode } from "@/features/bracket/to-flow-elements";
import type { MemberSummary } from "@/features/organization/repository";
import {
  type SlotEditActions,
  SlotEditDialog,
  type SlotEditTarget,
} from "./SlotEditDialog";

export type BracketEditor = {
  locked: boolean;
  slug: string;
  tournamentId: string;
  divisionId: string;
  /** 選べるメンバー。この部門に配置済みの人は呼び出し側で除いておく */
  members: MemberSummary[];
  actions: SlotEditActions;
};

/**
 * 編集できるブラケット。鉛筆は MatchCard が context を見て出し、押されたら
 * ここがモーダルを開く。モーダルは React Flow の外に置く（ズーム・パンの
 * 変形を受けず、ノードの pointer-events 制御とも無関係にするため）。
 */
export function EditableBracket({
  nodes,
  edges,
  locked,
  slug,
  tournamentId,
  divisionId,
  members,
  actions,
}: BracketEditor & { nodes: BracketFlowNode[]; edges: Edge[] }) {
  const [target, setTarget] = useState<SlotEditTarget | null>(null);

  const onEditSlot = useCallback(
    (matchId: string, slotIndex: 0 | 1) => {
      const node = nodes.find(
        (candidate) => candidate.type === "match" && candidate.id === matchId,
      );
      const match = node?.type === "match" ? node.data.match : undefined;
      setTarget({
        matchId,
        slotIndex,
        matchName: match?.matchName ?? null,
        occupantName: match?.slots[slotIndex].participant?.name ?? null,
      });
    },
    [nodes],
  );

  const context = useMemo(() => ({ locked, onEditSlot }), [locked, onEditSlot]);

  return (
    <SlotEditContext.Provider value={context}>
      <TournamentFlow nodes={nodes} edges={edges} />
      {target !== null && (
        <SlotEditDialog
          key={`${target.matchId}:${target.slotIndex}`}
          target={target}
          slug={slug}
          tournamentId={tournamentId}
          divisionId={divisionId}
          members={members}
          actions={actions}
          onClose={() => setTarget(null)}
        />
      )}
    </SlotEditContext.Provider>
  );
}
```

`DivisionBracket.tsx` の変更:
- `import { type BracketEditor, EditableBracket } from "./EditableBracket";`
- props に `editor?: BracketEditor;`（JSDoc: 「渡すと 1 回戦のスロットに鉛筆を出す編集モード。setup 画面だけが渡す」）
- 最後の return の中身を:

```tsx
      {editor === undefined ? (
        <TournamentFlow nodes={elements.nodes} edges={elements.edges} />
      ) : (
        <EditableBracket
          nodes={elements.nodes}
          edges={elements.edges}
          {...editor}
        />
      )}
```

- [ ] **Step 4: テストを通す**

Run: `pnpm test src/components/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/PencilIcon.tsx src/components/tournament/slot-edit-context.ts src/components/tournament/MatchCard.tsx src/components/tournament/MatchCard.test.tsx src/components/division/SlotEditDialog.tsx src/components/division/SlotEditDialog.test.tsx src/components/division/EditableBracket.tsx src/components/division/DivisionBracket.tsx src/components/division/DivisionBracket.test.tsx
git commit -m "feat(division): edit first-round slots from the bracket preview"
```

---

### Task 7: SE 用 setup 画面とページの出し分け

**Files:**
- Create: `src/components/division/AddFirstRoundMatchButton.tsx`, `src/components/division/BracketEditorSetup.tsx`, `src/components/division/BracketEditorSetup.test.tsx`
- Modify: `src/features/division/repository.ts`（`DivisionParticipant.memberId?`）, `src/features/division/repository.test.ts`, `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.tsx`, 同 `page.test.tsx`

**Interfaces:**
- Consumes: `BracketEditor`, `DivisionBracket`（Task 6）; 4 action（Task 4/5）; 既存 `GenerateMatchingForm`, `MatchOrderList`, `Notice`, `toMatchOrderView`, `resolveMatchNames`, `isSingleEliminationShape`
- Produces:
  - `DivisionParticipant` に `memberId?: string`
  - `BracketEditorSetupActions = { addFirstRoundMatch; removeFirstRoundMatch; assignSlot; clearSlot; generateMatching; setMatchName }`（全て `DivisionFormAction`）
  - `BracketEditorSetup` props: `{ division, participants, members, slug, tournamentId, overallSeq, actions: BracketEditorSetupActions }`

- [ ] **Step 1: 失敗するテストを書く**

`repository.test.ts` の `listParticipantsInTournament` のケース: モック行の `member` に `id: "m1"` / `id: "m2"` を足し、期待値の各要素に `memberId: "m1"` / `memberId: "m2"` を足す。

`BracketEditorSetup.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildFromFirstRound } from "@/features/division/single-elimination/build";

const bracketProps = vi.fn();
vi.mock("./DivisionBracket", () => ({
  DivisionBracket: (props: unknown) => {
    bracketProps(props);
    return <div>bracket</div>;
  },
}));

const { BracketEditorSetup } = await import("./BracketEditorSetup");

const action = vi.fn(async () => ({ error: null }));
const actions = {
  addFirstRoundMatch: action,
  removeFirstRoundMatch: action,
  assignSlot: action,
  clearSlot: action,
  generateMatching: action,
  setMatchName: action,
};

const e = (id: string) => ({ kind: "entry" as const, entryId: id });
const division = (overrides: Record<string, unknown> = {}) => ({
  id: "d1",
  name: "男子",
  order: 0,
  format: "SINGLE_ELIMINATION" as const,
  entries: { version: 1, entries: [{ id: "a", participantId: "p1", seed: 0 }] },
  matchingConfig: buildFromFirstRound([[e("a"), { kind: "bye" }]]),
  results: { version: 1, matches: [] },
  resultConfig: null,
  createdAt: new Date(),
  ...overrides,
});

const participants = [
  { id: "p1", memberId: "m1", name: "佐藤", nameKana: "さとう", playerNumber: "1" },
];
const members = [
  { id: "m1", name: "佐藤", nameKana: "さとう" },
  { id: "m2", name: "鈴木", nameKana: "すずき" },
];

const renderSetup = (d = division()) =>
  render(
    <BracketEditorSetup
      division={d}
      participants={participants}
      members={members}
      slug="acme"
      tournamentId="t1"
      overallSeq={new Map()}
      actions={actions}
    />,
  );

beforeEach(() => bracketProps.mockClear());

describe("BracketEditorSetup", () => {
  it("プレビューと試合名の 2 区画だけを出す", () => {
    renderSetup();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "プレビュー",
      "試合名",
    ]);
  });

  it("配置済みのメンバーを除いて editor に渡す", () => {
    renderSetup();
    const props = bracketProps.mock.calls[0][0] as { editor: { members: { id: string }[]; locked: boolean } };
    expect(props.editor.members.map((m) => m.id)).toEqual(["m2"]);
    expect(props.editor.locked).toBe(false);
  });

  it("結果があれば試合の追加を押せず、editor も locked", () => {
    renderSetup(division({ results: { version: 1, matches: [{ matchId: "m1-0", winnerEntryId: "a" }] } }));
    expect(screen.getByRole("button", { name: "試合を追加" })).toBeDisabled();
    const props = bracketProps.mock.calls[0][0] as { editor: { locked: boolean } };
    expect(props.editor.locked).toBe(true);
    expect(screen.getByText("勝敗が記録されているため、エントリーと組み合わせは変更できません")).toBeInTheDocument();
  });

  it("エントリーはあるが組み合わせが無ければ、生成ボタンを出してブラケットは出さない", () => {
    renderSetup(division({ matchingConfig: { version: 1, matches: [] } }));
    expect(screen.getByRole("button", { name: "組み合わせを生成" })).toBeInTheDocument();
    expect(bracketProps).not.toHaveBeenCalled();
  });

  it("何も無ければ「試合を追加」だけで始められる", () => {
    renderSetup(division({ entries: { version: 1, entries: [] }, matchingConfig: { version: 1, matches: [] } }));
    expect(screen.getByRole("button", { name: "試合を追加" })).toBeEnabled();
  });
});
```

`page.test.tsx`: 新しい 4 handler をモックに追加し、`BracketEditorSetup` も `DivisionSetup` と同じ方式で props を控えるダミーに差し替える。既存の「組織の認可を確かめてから描く」は SE の division なので、期待するテキストを BracketEditorSetup のダミーのもの（例: `"bracket-setup"`）に変える。追加するケース:

```ts
vi.mock("@/features/division/add-first-round-match/handler", () => ({ addFirstRoundMatchAction: vi.fn() }));
vi.mock("@/features/division/remove-first-round-match/handler", () => ({ removeFirstRoundMatchAction: vi.fn() }));
vi.mock("@/features/division/assign-slot/handler", () => ({ assignSlotAction: vi.fn() }));
vi.mock("@/features/division/clear-slot/handler", () => ({ clearSlotAction: vi.fn() }));

const bracketEditorSetupProps = vi.fn();
vi.mock("@/components/division/BracketEditorSetup", () => ({
  BracketEditorSetup: (props: unknown) => {
    bracketEditorSetupProps(props);
    return <div>bracket-setup</div>;
  },
}));

it("シングルエリミは BracketEditorSetup に 6 つのアクションを渡す", async () => {
  render(await DivisionSetupPage(pageProps()));
  const props = bracketEditorSetupProps.mock.calls[0][0] as { actions: Record<string, unknown> };
  expect(props.actions).toEqual({
    addFirstRoundMatch: addFirstRoundMatchAction,
    removeFirstRoundMatch: removeFirstRoundMatchAction,
    assignSlot: assignSlotAction,
    clearSlot: clearSlotAction,
    generateMatching: generateMatchingAction,
    setMatchName: setMatchNameAction,
  });
  expect(divisionSetupProps).not.toHaveBeenCalled();
});
```

既存の「ダブルエリミネーションも 404 にせず描く」は `DivisionSetup`（テキスト `"setup"`）を描くことを確かめ、既存の actions 検証ケースがあれば DE の division で行うよう書き換える。

- [ ] **Step 2: 失敗を確認**

Run: `pnpm test src/components/division/BracketEditorSetup.test.tsx "src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup" src/features/division/repository.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装**

`repository.ts`:
- `DivisionParticipant` に追加:

```ts
  /**
   * 参加者の Member。setup 画面が「この部門に配置済みの人」を
   * メンバーの選択肢から除くのに使う。一覧以外の経路では埋めないので省略可能。
   */
  memberId?: string;
```

- `listParticipantsInTournament` の select を `member: { select: { id: true, name: true, nameKana: true } }` にし、map に `memberId: row.member.id,` を足す。

`AddFirstRoundMatchButton.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import {
  type DivisionFormAction,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";

export function AddFirstRoundMatchButton({
  action,
  slug,
  tournamentId,
  divisionId,
  disabled,
}: {
  action: DivisionFormAction;
  slug: string;
  tournamentId: string;
  divisionId: string;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_DIVISION_FORM_STATE,
  );

  return (
    <form action={formAction} className="flex items-center gap-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="divisionId" value={divisionId} />
      <button
        type="submit"
        disabled={pending || disabled}
        className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        試合を追加
      </button>
      {state.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
```

`BracketEditorSetup.tsx`:

```tsx
import { toMatchOrderView } from "@/features/division/match-name-view";
import type {
  DivisionDetail,
  DivisionParticipant,
} from "@/features/division/repository";
import { isSingleEliminationShape } from "@/features/division/single-elimination/build";
import type { DivisionFormAction } from "@/features/division/state";
import type { MemberSummary } from "@/features/organization/repository";
import { resolveMatchNames } from "@/lib/division/match-name";
import {
  parseDivisionEntries,
  parseDivisionResults,
  parseMatchingConfig,
} from "@/lib/division/parse";
import { AddFirstRoundMatchButton } from "./AddFirstRoundMatchButton";
import { DivisionBracket } from "./DivisionBracket";
import { GenerateMatchingForm } from "./GenerateMatchingForm";
import { MatchOrderList } from "./MatchOrderList";
import { Notice } from "./Notice";

export type BracketEditorSetupActions = {
  addFirstRoundMatch: DivisionFormAction;
  removeFirstRoundMatch: DivisionFormAction;
  assignSlot: DivisionFormAction;
  clearSlot: DivisionFormAction;
  generateMatching: DivisionFormAction;
  setMatchName: DivisionFormAction;
};

/**
 * シングルエリミネーションの setup 画面。プレビューがそのまま編集画面で、
 * 試合の追加と 1 回戦のスロット編集をブラケット上で行う。
 * ダブルエリミは勝者側 1 回戦だけを直接いじると敗者側の対応が崩れるため、
 * 従来の DivisionSetup のまま。
 */
export function BracketEditorSetup({
  division,
  participants,
  members,
  slug,
  tournamentId,
  overallSeq,
  actions,
}: {
  division: DivisionDetail;
  participants: DivisionParticipant[];
  members: MemberSummary[];
  slug: string;
  tournamentId: string;
  /** 大会全体の通し番号。{{OverallSeq}} の展開に使う */
  overallSeq: ReadonlyMap<string, number>;
  actions: BracketEditorSetupActions;
}) {
  // Json は DB の列で、アプリの外から壊れた値が入りうる。パースの失敗は
  // ここで受け止め、ページ全体は落とさない。
  let parsed: {
    entries: ReturnType<typeof parseDivisionEntries>;
    matchingConfig: ReturnType<typeof parseMatchingConfig>;
    results: ReturnType<typeof parseDivisionResults>;
  };
  try {
    parsed = {
      entries: parseDivisionEntries(division.entries),
      matchingConfig: parseMatchingConfig(division.matchingConfig),
      results: parseDivisionResults(division.results),
    };
  } catch {
    return <Notice>部門のデータを読み込めませんでした</Notice>;
  }

  // 勝敗が入ったあとに組み合わせを変えると結果の参照が壊れる。
  // サーバ側でも拒否するが、押せてしまう前に理由を見せる。
  const locked = parsed.results.matches.length > 0;

  // /edit で format を書き換えた部門は league の星取表を持っていることがある。
  // また、旧画面でエントリーだけ登録して生成していない部門もある。
  // どちらも生成し直せば編集できる形になる。
  const mismatched = !isSingleEliminationShape(parsed.matchingConfig);
  const needsGeneration =
    mismatched ||
    (parsed.matchingConfig.matches.length === 0 &&
      parsed.entries.entries.length > 0);

  const placedParticipantIds = new Set(
    parsed.entries.entries.map((entry) => entry.participantId),
  );
  const placedMemberIds = new Set(
    participants
      .filter((participant) => placedParticipantIds.has(participant.id))
      .flatMap((participant) =>
        participant.memberId === undefined ? [] : [participant.memberId],
      ),
  );
  const availableMembers = members.filter(
    (member) => !placedMemberIds.has(member.id),
  );

  return (
    <div className="space-y-6">
      {locked && (
        <output className="block rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          勝敗が記録されているため、エントリーと組み合わせは変更できません
        </output>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-700">プレビュー</h2>
        {needsGeneration ? (
          <>
            <GenerateMatchingForm
              slug={slug}
              tournamentId={tournamentId}
              divisionId={division.id}
              action={actions.generateMatching}
              disabled={locked}
              label="組み合わせを生成"
            />
            <Notice>
              {mismatched
                ? "この組み合わせはトーナメントの形ではありません。作り直してください"
                : "登録済みのエントリーから組み合わせを生成してください"}
            </Notice>
          </>
        ) : (
          <>
            <AddFirstRoundMatchButton
              action={actions.addFirstRoundMatch}
              slug={slug}
              tournamentId={tournamentId}
              divisionId={division.id}
              disabled={locked}
            />
            <DivisionBracket
              division={division}
              participants={participants}
              overallSeq={overallSeq}
              editor={{
                locked,
                slug,
                tournamentId,
                divisionId: division.id,
                members: availableMembers,
                actions: {
                  assignSlot: actions.assignSlot,
                  clearSlot: actions.clearSlot,
                  removeMatch: actions.removeFirstRoundMatch,
                },
              }}
            />
          </>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-700">試合名</h2>
        {/* 試合名の変更は構造を変えないため、locked でも編集できる */}
        {mismatched ? (
          <Notice>組み合わせを作り直すと、ここに試合が出ます</Notice>
        ) : (
          <MatchOrderList
            rows={toMatchOrderView(
              parsed.matchingConfig,
              parsed.entries,
              participants,
              division.format,
              resolveMatchNames(parsed.matchingConfig, division.id, overallSeq),
            )}
            slug={slug}
            tournamentId={tournamentId}
            divisionId={division.id}
            setMatchNameAction={actions.setMatchName}
            emptyMessage="「試合を追加」で 1 回戦の試合を作ります"
          />
        )}
      </section>
    </div>
  );
}
```

（空の組み合わせのときは DivisionBracket が「組み合わせが未作成です」を出すので、追加ボタンと合わせて始め方が分かる。）

`page.tsx`:
- 4 handler と `BracketEditorSetup` を import。
- `<DivisionSetup ... />` を次に置き換える:

```tsx
        {division.format === "SINGLE_ELIMINATION" ? (
          <BracketEditorSetup
            division={division}
            participants={participants}
            members={members}
            slug={slug}
            tournamentId={tournament.id}
            overallSeq={overallSeq}
            actions={{
              addFirstRoundMatch: addFirstRoundMatchAction,
              removeFirstRoundMatch: removeFirstRoundMatchAction,
              assignSlot: assignSlotAction,
              clearSlot: clearSlotAction,
              generateMatching: generateMatchingAction,
              setMatchName: setMatchNameAction,
            }}
          />
        ) : (
          <DivisionSetup
            division={division}
            participants={participants}
            members={members}
            slug={slug}
            tournamentId={tournament.id}
            overallSeq={overallSeq}
            actions={{
              addEntry: addEntryAction,
              removeEntry: removeEntryAction,
              reorderEntry: reorderEntryAction,
              generateMatching: generateMatchingAction,
              swapSlots: swapSlotsAction,
              setMatchName: setMatchNameAction,
              setPlayerNumber: setPlayerNumberAction,
            }}
          />
        )}
```
- 既存コメント「この画面はトーナメント形式（SE・DE）を編集するために開くもので…」は残す。

- [ ] **Step 4: テストを通す**

Run: `pnpm test`
Expected: PASS（全テスト）

- [ ] **Step 5: 型と lint**

Run: `pnpm typecheck`
Expected: エラーなし

Run: `pnpm lint`
Expected: 変更ファイルに内容起因のエラーなし（CRLF のみのエラーは無視してよい。`pnpm lint:fix` で整形が必要なら実行してから再確認）

- [ ] **Step 6: Commit**

```bash
git add src/features/division/repository.ts src/features/division/repository.test.ts src/components/division/AddFirstRoundMatchButton.tsx src/components/division/BracketEditorSetup.tsx src/components/division/BracketEditorSetup.test.tsx "src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.tsx" "src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.test.tsx"
git commit -m "feat(division): make the single-elimination setup page an inline bracket editor"
```

---

### Task 8: 実機確認

**Files:** なし（確認のみ。見つかった不具合は該当タスクのファイルを直してコミット）

- [ ] **Step 1: 開発サーバーを起動**

`.env` に `BYPASS_AUTH=1` があることを確認し、`pnpm dev` を起動。ログに出たポートを使う（3000 は他のワークツリーが使っていることがある）。Cookie `USER_ID=1` を設定してアクセスする（組織 slug は `aaaaa`）。

- [ ] **Step 2: シナリオを確認**

SINGLE_ELIMINATION の部門を 1 つ作り、`/orgs/aaaaa/tournaments/<id>/divisions/<id>/setup` で:
1. ページが「プレビュー」「試合名」の 2 区画だけであること
2. 「試合を追加」を 3 回押す → 1 回戦 3 試合、2 回戦は `[第1試合の勝者, BYE]` と `[第2試合の勝者, 第3試合の勝者]`、決勝 1 試合
3. 1 回戦のスロットの鉛筆 → モーダル。既存メンバーを選んで「この選手にする」→ 閉じてプレビューに名前が出る
4. 同じ人を別スロットに置こうとするとモーダル内にエラー。選択肢からも消えていること
5. 新規登録（氏名・かな）で配置できる
6. 「スロットを空にする」「試合を削除」で自動配線し直される。手で付けた試合名が別の試合へ移らない
7. 結果入力画面で 1 試合結果を入れる → setup の追加ボタンと鉛筆が disabled、amber の通知が出る
8. DE 部門の setup が従来画面のままであること

- [ ] **Step 3: 不具合があれば修正してコミット、無ければ完了**
