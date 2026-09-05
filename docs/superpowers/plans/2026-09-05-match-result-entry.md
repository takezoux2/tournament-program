# 試合結果入力（勝敗） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 大会の全試合を進行順に並べ、勝者ボタンを 1 回押すだけで勝敗を記録できる「結果入力」画面を、既存の編集画面とは別に追加する。

**Architecture:** 読み出し（進行順 + スロット解決）は `features/schedule`、書き込み（`Division.results`）は `features/division/record-result` スライスが持ち、`app` のページが両者を合成する。両カテゴリから使う純粋ロジック（勝者の伝播・下流の集合）は下位共通層の `src/lib/division/` に置く。

**Tech Stack:** Next.js 16 App Router / React 19 Server Actions / Prisma 7 / Effect / Zod 4 / Vitest + Testing Library / Biome

設計: `docs/superpowers/specs/2026-09-05-match-result-entry-design.md`

## Global Constraints

- パッケージマネージャは **pnpm**。`npm` / `yarn` は使わない。
- アーキテクチャは垂直スライス（`docs/code-design/architecture.md`）。`features/` 配下は**上位ディレクトリのみ**依存可。同列（`features/schedule` ↔ `features/division`）と下位への依存は禁止。共有したい純粋ロジックは `src/lib/` へ下ろす。
- `features/` 配下に `.tsx` を置かない。画面は `src/components/` と `src/app/`。
- 所有権チェックは**クエリの `where` に入れる**。取得してから条件で弾かない。単数形 `update` / `delete` ではなく `updateMany` / `deleteMany` を使い、0 件は `notFound()` に倒す。
- 認可は Server Action の冒頭でも**独立に** `requireOrganization(slug)` を呼ぶ。ページで確認済みでも省略しない。
- 日時の文字列化は必ずサーバ側で行う。クライアントで組み立てると時刻帯がずれる。
- 文言は日本語。エラー文言は `features/division/messages.ts` に集約する。
- テストは Vitest。`pnpm test`（単発）/ `pnpm test -- <path>`（絞り込み）。型は `pnpm typecheck`、lint は `pnpm lint`。
- **Windows のチェックアウトでは Biome が CRLF 由来の `format` エラーを全ファイルで出す既知のノイズがある。** lint の合否は自分が触ったファイルの「内容の」指摘だけで判断する。
- コミットメッセージは日本語の要約ではなく既存の慣習（`feat(scope): ...` / `test(scope): ...` / `refactor(scope): ...`）に合わせる。本文末尾に以下を付ける。

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

## 準備（最初のタスクの前に 1 回だけ）

- [ ] **worktree を作る**

```bash
git worktree add ../tournament-program-result-entry -b match-result-entry
cd ../tournament-program-result-entry
```

- [ ] **依存と環境を用意する**

`node_modules` と `.env` は worktree に付いてこない。メインのチェックアウトからコピーし、Prisma Client と Next.js の型を生成する。

```bash
cp ../tournament-program/.env .
pnpm install
pnpm exec prisma generate
pnpm exec next typegen
```

`next typegen` を忘れると `PageProps<...>` と `LayoutProps<...>` が未定義で `pnpm typecheck` が落ちる。

- [ ] **元の状態で全テストが通ることを確認する**

Run: `pnpm test`
Expected: すべて PASS（作業前の基準線）

---

## Task 1: 勝者の伝播と下流の集合（純粋関数）

**Files:**
- Create: `src/lib/division/resolve.ts`
- Test: `src/lib/division/resolve.test.ts`

**Interfaces:**
- Consumes: `src/lib/division/types.ts` の `MatchingConfig` / `DivisionResults` / `SlotSource` / `BracketMatch`
- Produces:
  - `type ResolvedSlot = { state: "entry"; entryId: string } | { state: "pending" } | { state: "bye" }`
  - `type ResolvedMatch = { slots: [ResolvedSlot, ResolvedSlot]; winnerEntryId: string | null }`
  - `resolveMatchSlots(config: MatchingConfig, results: DivisionResults): Map<string, ResolvedMatch>`
  - `downstreamMatchIds(matchId: string, config: MatchingConfig): Set<string>`

- [ ] **Step 1: 失敗するテストを書く**

Create `src/lib/division/resolve.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { downstreamMatchIds, resolveMatchSlots } from "./resolve";
import type { BracketMatch, DivisionResults, MatchingConfig } from "./types";

const match = (
  id: string,
  round: number,
  order: number,
  slots: BracketMatch["slots"],
): BracketMatch => ({
  id,
  bracket: "winners",
  round,
  order,
  matchNumber: id,
  slots,
});

/** e1 vs e2（1回戦）、e3 vs BYE（1回戦）、その勝者どうし（2回戦）。 */
const config: MatchingConfig = {
  version: 1,
  matches: [
    match("m1-0", 1, 0, [
      { kind: "entry", entryId: "e1" },
      { kind: "entry", entryId: "e2" },
    ]),
    match("m1-1", 1, 1, [{ kind: "entry", entryId: "e3" }, { kind: "bye" }]),
    match("m2-0", 2, 0, [
      { kind: "winnerOf", matchId: "m1-0" },
      { kind: "winnerOf", matchId: "m1-1" },
    ]),
  ],
};

const results = (
  ...matches: DivisionResults["matches"]
): DivisionResults => ({ version: 1, matches });

describe("resolveMatchSlots", () => {
  it("記録が無くても BYE の相手は勝ち上がる", () => {
    const resolved = resolveMatchSlots(config, results());

    expect(resolved.get("m1-0")).toEqual({
      slots: [
        { state: "entry", entryId: "e1" },
        { state: "entry", entryId: "e2" },
      ],
      winnerEntryId: null,
    });
    expect(resolved.get("m1-1")).toEqual({
      slots: [{ state: "entry", entryId: "e3" }, { state: "bye" }],
      winnerEntryId: "e3",
    });
  });

  it("記録された勝者を次のラウンドへ伝播する", () => {
    const resolved = resolveMatchSlots(
      config,
      results({ matchId: "m1-0", winnerEntryId: "e2" }),
    );

    expect(resolved.get("m2-0")).toEqual({
      slots: [
        { state: "entry", entryId: "e2" },
        { state: "entry", entryId: "e3" },
      ],
      winnerEntryId: null,
    });
  });

  it("前の試合が未記録なら次のラウンドのスロットは未確定", () => {
    const resolved = resolveMatchSlots(config, results());

    expect(resolved.get("m2-0")?.slots[0]).toEqual({ state: "pending" });
  });

  it("どちらのスロットにも立っていない勝者の記録は無視する", () => {
    // データが壊れていても読み出しでは落とさない（label.ts の
    // 「（不明な参加者）」と同じ思想）。
    const resolved = resolveMatchSlots(
      config,
      results({ matchId: "m1-0", winnerEntryId: "e9" }),
    );

    expect(resolved.get("m1-0")?.winnerEntryId).toBeNull();
    expect(resolved.get("m2-0")?.slots[0]).toEqual({ state: "pending" });
  });

  it("loserOf は勝者が決まってから敗者に解決する", () => {
    const withLoser: MatchingConfig = {
      version: 1,
      matches: [
        config.matches[0],
        match("mL", 2, 0, [
          { kind: "loserOf", matchId: "m1-0" },
          { kind: "entry", entryId: "e4" },
        ]),
      ],
    };

    expect(resolveMatchSlots(withLoser, results()).get("mL")?.slots[0]).toEqual({
      state: "pending",
    });
    expect(
      resolveMatchSlots(
        withLoser,
        results({ matchId: "m1-0", winnerEntryId: "e1" }),
      ).get("mL")?.slots[0],
    ).toEqual({ state: "entry", entryId: "e2" });
  });
});

describe("downstreamMatchIds", () => {
  it("参照している試合を推移的に集める", () => {
    const deep: MatchingConfig = {
      version: 1,
      matches: [
        ...config.matches,
        match("m3-0", 3, 0, [
          { kind: "winnerOf", matchId: "m2-0" },
          { kind: "bye" },
        ]),
      ],
    };

    expect(downstreamMatchIds("m1-0", deep)).toEqual(
      new Set(["m2-0", "m3-0"]),
    );
  });

  it("自分自身は含めない。参照されていなければ空", () => {
    expect(downstreamMatchIds("m2-0", config)).toEqual(new Set<string>());
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm test -- src/lib/division/resolve.test.ts`
Expected: FAIL（`Failed to resolve import "./resolve"`）

- [ ] **Step 3: 実装する**

Create `src/lib/division/resolve.ts`:

```ts
import type {
  DivisionResults,
  MatchingConfig,
  SlotSource,
} from "./types";

/** スロットに誰が立っているか。pending は前の試合の結果待ち。 */
export type ResolvedSlot =
  | { state: "entry"; entryId: string }
  | { state: "pending" }
  | { state: "bye" };

/** 1 試合ぶんの解決結果。winnerEntryId は BYE の自動勝ち上がりを含む。 */
export type ResolvedMatch = {
  slots: [ResolvedSlot, ResolvedSlot];
  winnerEntryId: string | null;
};

/**
 * 記録と BYE から、この試合の勝者を決める。
 *
 * BYE を優先するのは、片側が不戦勝の試合は記録が無くても勝者が決まるため。
 * 記録された勝者がどちらのスロットにも立っていない場合は、例外を投げずに
 * 勝者なしとして読む。読み出しで落とさないのは label.ts が引けない参加者を
 * 「（不明な参加者）」にするのと同じ思想で、壊れたデータ 1 件で一覧全体が
 * 見えなくなる方が困るため。
 */
const decideWinner = (
  slots: [ResolvedSlot, ResolvedSlot],
  recorded: string | null | undefined,
): string | null => {
  const hasBye = slots.some((slot) => slot.state === "bye");
  if (hasBye) {
    const standing = slots.find((slot) => slot.state === "entry");
    return standing !== undefined && standing.state === "entry"
      ? standing.entryId
      : null;
  }

  if (recorded === undefined || recorded === null) {
    return null;
  }
  const stands = slots.some(
    (slot) => slot.state === "entry" && slot.entryId === recorded,
  );
  return stands ? recorded : null;
};

/**
 * 組み合わせと勝敗記録を突き合わせ、各試合のスロットに誰が立っているかを返す。
 *
 * round 昇順 → order 昇順の 1 パスで、解決済みの勝者を次のラウンドへ伝播する。
 * validateMatchingConfig が「参照先の round は自分より小さい」を保証しているので
 * 循環しない。未検証の入力でも止まるよう、参照先が未解決なら pending にする。
 */
export const resolveMatchSlots = (
  config: MatchingConfig,
  results: DivisionResults,
): Map<string, ResolvedMatch> => {
  const recordedWinner = new Map(
    results.matches.map((record) => [record.matchId, record.winnerEntryId]),
  );
  const resolved = new Map<string, ResolvedMatch>();

  const resolveSlot = (source: SlotSource): ResolvedSlot => {
    switch (source.kind) {
      case "bye":
        return { state: "bye" };
      case "entry":
        return { state: "entry", entryId: source.entryId };
      case "winnerOf": {
        const winner = resolved.get(source.matchId)?.winnerEntryId ?? null;
        return winner === null
          ? { state: "pending" }
          : { state: "entry", entryId: winner };
      }
      case "loserOf": {
        const origin = resolved.get(source.matchId);
        if (origin === undefined || origin.winnerEntryId === null) {
          return { state: "pending" };
        }
        // 勝者が決まっていても、敗者側が entry として確定しているとは限らない
        // （BYE 相手の不戦勝など）。その場合は pending のままにする。
        const loser = origin.slots.find(
          (slot) =>
            slot.state === "entry" && slot.entryId !== origin.winnerEntryId,
        );
        return loser !== undefined && loser.state === "entry"
          ? { state: "entry", entryId: loser.entryId }
          : { state: "pending" };
      }
    }
  };

  const ordered = [...config.matches].sort(
    (left, right) => left.round - right.round || left.order - right.order,
  );

  for (const match of ordered) {
    const slots: [ResolvedSlot, ResolvedSlot] = [
      resolveSlot(match.slots[0]),
      resolveSlot(match.slots[1]),
    ];
    resolved.set(match.id, {
      slots,
      winnerEntryId: decideWinner(slots, recordedWinner.get(match.id)),
    });
  }

  return resolved;
};

/**
 * その試合を winnerOf / loserOf で推移的に参照する試合の id を集める。
 * 勝者を変えたときに取り消すべき記録の範囲がこれで、画面に出す
 * 「あとの試合の結果 N 件」もこの集合から数える。
 */
export const downstreamMatchIds = (
  matchId: string,
  config: MatchingConfig,
): Set<string> => {
  const dependents = new Map<string, string[]>();
  for (const match of config.matches) {
    for (const slot of match.slots) {
      if (slot.kind === "winnerOf" || slot.kind === "loserOf") {
        const list = dependents.get(slot.matchId) ?? [];
        list.push(match.id);
        dependents.set(slot.matchId, list);
      }
    }
  }

  const found = new Set<string>();
  const stack = [matchId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      break;
    }
    for (const next of dependents.get(current) ?? []) {
      // 自分自身は含めない。壊れた参照でも訪問済みなら二度と辿らない。
      if (next === matchId || found.has(next)) {
        continue;
      }
      found.add(next);
      stack.push(next);
    }
  }

  return found;
};
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm test -- src/lib/division/resolve.test.ts`
Expected: PASS（7 tests）

- [ ] **Step 5: コミット**

```bash
git add src/lib/division/resolve.ts src/lib/division/resolve.test.ts
git commit -m "feat(division): resolve match slots and downstream matches"
```

---

## Task 2: 結果の削除と、所有権を持たない書き込み経路の撤去

**Files:**
- Modify: `src/lib/division/results.ts`
- Modify: `src/lib/division/results.test.ts`

**Interfaces:**
- Produces: `clearResults(results: DivisionResults, matchIds: ReadonlySet<string>): DivisionResults`
- Removes: `recordMatchResult` / `DivisionConflictError` / `DivisionValidationError`（すべて未使用。`recordMatchResult` は `findUniqueOrThrow({ where: { id } })` で読むため組織の所有権チェックを持たない）
- Keeps: `applyMatchResult(results, record)`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/division/results.test.ts` の先頭 import を次に差し替え、末尾の `describe("DivisionValidationError", ...)` ブロックを丸ごと削除して、代わりに `clearResults` の describe を足す。

```ts
import { describe, expect, it } from "vitest";
import { applyMatchResult, clearResults } from "./results";
import { EMPTY_DIVISION_RESULTS } from "./types";
```

```ts
describe("clearResults", () => {
  const results = {
    version: 1 as const,
    matches: [
      { matchId: "m1", winnerEntryId: "e1" },
      { matchId: "m2", winnerEntryId: "e2" },
      { matchId: "m3", winnerEntryId: "e3" },
    ],
  };

  it("指定した試合の記録だけを取り除く", () => {
    expect(clearResults(results, new Set(["m1", "m3"]))).toEqual({
      version: 1,
      matches: [{ matchId: "m2", winnerEntryId: "e2" }],
    });
  });

  it("元の値は変更しない", () => {
    clearResults(results, new Set(["m1"]));

    expect(results.matches).toHaveLength(3);
  });

  it("空集合なら同じ内容を返す", () => {
    expect(clearResults(EMPTY_DIVISION_RESULTS, new Set<string>())).toEqual(
      EMPTY_DIVISION_RESULTS,
    );
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm test -- src/lib/division/results.test.ts`
Expected: FAIL（`clearResults` が export されていない）

- [ ] **Step 3: 実装する**

`src/lib/division/results.ts` を次の内容で全面的に置き換える（`recordMatchResult` / 2 つのエラークラス / `toJsonInput` / Prisma の import が消える）。

```ts
import type { DivisionResults, MatchResultRecord } from "./types";

/**
 * 1 試合分の結果を反映した新しい results を返す。元の値は変更しない。
 * 同じ matchId が既にあれば位置を保ったまま上書きし、無ければ末尾に追加する。
 */
export const applyMatchResult = (
  results: DivisionResults,
  record: MatchResultRecord,
): DivisionResults => {
  const index = results.matches.findIndex(
    (existing) => existing.matchId === record.matchId,
  );
  const matches =
    index === -1
      ? [...results.matches, record]
      : results.matches.map((existing, i) => (i === index ? record : existing));
  return { version: 1, matches };
};

/**
 * 指定した試合の記録を取り除いた新しい results を返す。元の値は変更しない。
 * 勝者を変えたときに、その勝者が進む先（下流）の記録をまとめて消すために使う。
 */
export const clearResults = (
  results: DivisionResults,
  matchIds: ReadonlySet<string>,
): DivisionResults => ({
  version: 1,
  matches: results.matches.filter((record) => !matchIds.has(record.matchId)),
});
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm test -- src/lib/division/results.test.ts`
Expected: PASS

- [ ] **Step 5: 参照が残っていないことを確認する**

Run: `pnpm typecheck`
Expected: エラーなし（`recordMatchResult` を使っているコードは存在しない）

- [ ] **Step 6: コミット**

```bash
git add src/lib/division/results.ts src/lib/division/results.test.ts
git commit -m "refactor(division): drop the unowned result write path and add clearResults"
```

---

## Task 3: 結果入力用の行を読む（features/schedule）

**Files:**
- Create: `src/features/schedule/result-rows.ts`
- Create: `src/features/schedule/result-rows.test.ts`
- Modify: `src/features/schedule/types.ts`（`ScheduleDivision` に `results` を足す）
- Modify: `src/features/schedule/repository.ts`（select に `results`、`loadMaterials` の抽出、`loadResultRows` の公開）
- Modify: `src/features/schedule/domain.test.ts`（`ScheduleDivision` リテラル 2 箇所に `results` を足す）
- Modify: `src/features/schedule/repository.test.ts`（`divisionFindMany` のモック行に `results` を足す）

**Interfaces:**
- Consumes: Task 1 の `resolveMatchSlots` / `downstreamMatchIds`、既存の `buildScheduleView` / `createSlotLabeler`
- Produces:
  - `type ResultSlotView = { label: string; entryId: string | null }`
  - `type ResultRowState = "ready" | "recorded" | "waiting" | "bye"`
  - `type ResultRowView`（下の実装のとおり。divider 行は `{ kind: "divider"; key: string; label: string }`）
  - `buildResultRows(rows: ScheduleRowView[], divisions: ScheduleDivision[], participants: ScheduleParticipant[]): ResultRowView[]`
  - `loadResultRows(organizationId: string, tournamentId: string): Promise<ResultRowView[]>`（`repository.ts`）

区切り行に開始予定時刻を載せないのは意図。日時の文字列化はサーバ側でしか行えず、`features/schedule` は同列の `features/tournament` の `formatStartsAt` を import できない。結果入力に時刻は要らないので見出しのラベルだけを運ぶ。

- [ ] **Step 1: `ScheduleDivision` に `results` を足す**

`src/features/schedule/types.ts`:

```ts
import type {
  DivisionEntries,
  DivisionResults,
  MatchingConfig,
} from "@/lib/division/types";
```

```ts
/** マージの材料になる部門。Json は検証済みの形で受け取る。 */
export type ScheduleDivision = {
  id: string;
  name: string;
  /** 大会内での表示順。行の無い試合を末尾へ足すときの並び順に使う。 */
  order: number;
  entries: DivisionEntries;
  matchingConfig: MatchingConfig;
  /** 勝敗記録。進行順のマージ（buildScheduleView）では使わず、結果入力の行だけが使う。 */
  results: DivisionResults;
};
```

- [ ] **Step 2: 既存テストのリテラルを直し、赤を確認する**

`src/features/schedule/domain.test.ts` の `divisionA` / `divisionB` に次を足す。

```ts
  results: { version: 1, matches: [] },
```

`src/features/schedule/repository.test.ts` の `divisionFindMany.mockResolvedValue` を次にする。

```ts
  divisionFindMany.mockResolvedValue([
    {
      id: "dA",
      name: "男子",
      order: 0,
      entries,
      matchingConfig,
      results: { version: 1, matches: [] },
    },
  ]);
```

Run: `pnpm test -- src/features/schedule`
Expected: PASS（型だけの変更なので緑のまま。ここが赤なら先に直す）

- [ ] **Step 3: `buildResultRows` の失敗するテストを書く**

Create `src/features/schedule/result-rows.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { BracketMatch, MatchingConfig } from "@/lib/division/types";
import { buildResultRows } from "./result-rows";
import type {
  ScheduleDivision,
  ScheduleParticipant,
  ScheduleRowView,
} from "./types";

const match = (
  id: string,
  round: number,
  order: number,
  matchNumber: string,
  slots: BracketMatch["slots"],
): BracketMatch => ({ id, bracket: "winners", round, order, matchNumber, slots });

const matchingConfig: MatchingConfig = {
  version: 1,
  matches: [
    match("m1-0", 1, 0, "1", [
      { kind: "entry", entryId: "e1" },
      { kind: "entry", entryId: "e2" },
    ]),
    match("m1-1", 1, 1, "2", [
      { kind: "entry", entryId: "e3" },
      { kind: "bye" },
    ]),
    match("m2-0", 2, 0, "3", [
      { kind: "winnerOf", matchId: "m1-0" },
      { kind: "winnerOf", matchId: "m1-1" },
    ]),
  ],
};

const participants: ScheduleParticipant[] = [
  { id: "p1", name: "山田" },
  { id: "p2", name: "佐藤" },
  { id: "p3", name: "鈴木" },
];

const division = (
  results: ScheduleDivision["results"],
): ScheduleDivision => ({
  id: "dA",
  name: "男子",
  order: 0,
  entries: {
    version: 1,
    entries: [
      { id: "e1", participantId: "p1", seed: 0 },
      { id: "e2", participantId: "p2", seed: 1 },
      { id: "e3", participantId: "p3", seed: 2 },
    ],
  },
  matchingConfig,
  results,
});

const matchRow = (matchId: string, matchNumber: string): ScheduleRowView => ({
  kind: "match",
  key: `match:dA:${matchId}`,
  divisionId: "dA",
  divisionName: "男子",
  matchId,
  matchNumber,
  label: `${matchNumber}回戦 第${matchNumber}試合`,
  card: "山田 vs 佐藤",
});

const rows: ScheduleRowView[] = [
  matchRow("m1-0", "1"),
  matchRow("m1-1", "2"),
  matchRow("m2-0", "3"),
];

const asMatch = (row: ReturnType<typeof buildResultRows>[number]) => {
  if (row.kind !== "match") {
    throw new Error("試合行ではありません");
  }
  return row;
};

describe("buildResultRows", () => {
  it("両者が確定した未記録の試合は ready で、名前がスロットに入る", () => {
    const result = buildResultRows(
      rows,
      [division({ version: 1, matches: [] })],
      participants,
    );

    expect(asMatch(result[0])).toMatchObject({
      matchId: "m1-0",
      state: "ready",
      winnerEntryId: null,
      downstreamRecordedCount: 0,
      slots: [
        { label: "山田", entryId: "e1" },
        { label: "佐藤", entryId: "e2" },
      ],
    });
  });

  it("BYE を含む試合は bye で、勝者が自動的に決まる", () => {
    const result = buildResultRows(
      rows,
      [division({ version: 1, matches: [] })],
      participants,
    );

    expect(asMatch(result[1])).toMatchObject({
      state: "bye",
      winnerEntryId: "e3",
      slots: [
        { label: "鈴木", entryId: "e3" },
        { label: "BYE", entryId: null },
      ],
    });
  });

  it("相手が未確定の試合は waiting で、構造上の表記を出す", () => {
    const result = buildResultRows(
      rows,
      [division({ version: 1, matches: [] })],
      participants,
    );

    expect(asMatch(result[2])).toMatchObject({
      state: "waiting",
      slots: [
        { label: "第1試合の勝者", entryId: null },
        { label: "鈴木", entryId: "e3" },
      ],
    });
  });

  it("記録済みの試合は recorded になり、下流の記録数を数える", () => {
    const result = buildResultRows(
      rows,
      [
        division({
          version: 1,
          matches: [
            { matchId: "m1-0", winnerEntryId: "e1" },
            { matchId: "m2-0", winnerEntryId: "e1" },
          ],
        }),
      ],
      participants,
    );

    expect(asMatch(result[0])).toMatchObject({
      state: "recorded",
      winnerEntryId: "e1",
      downstreamRecordedCount: 1,
    });
    expect(asMatch(result[2])).toMatchObject({
      state: "recorded",
      winnerEntryId: "e1",
      downstreamRecordedCount: 0,
    });
  });

  it("区切り行は見出しとして素通しする", () => {
    const withDivider: ScheduleRowView[] = [
      {
        kind: "divider",
        key: "divider:d1",
        id: "d1",
        label: "午前の部",
        startsAt: null,
        startsAtInput: "",
      },
      ...rows,
    ];

    const result = buildResultRows(
      withDivider,
      [division({ version: 1, matches: [] })],
      participants,
    );

    expect(result[0]).toEqual({
      kind: "divider",
      key: "divider:d1",
      label: "午前の部",
    });
  });

  it("実体の無い部門を指す行は落とす", () => {
    const result = buildResultRows(rows, [], participants);

    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 4: テストが落ちることを確認する**

Run: `pnpm test -- src/features/schedule/result-rows.test.ts`
Expected: FAIL（`Failed to resolve import "./result-rows"`）

- [ ] **Step 5: `result-rows.ts` を実装する**

Create `src/features/schedule/result-rows.ts`:

```ts
import { createSlotLabeler } from "@/lib/division/label";
import {
  downstreamMatchIds,
  type ResolvedMatch,
  resolveMatchSlots,
} from "@/lib/division/resolve";
import type {
  ScheduleDivision,
  ScheduleParticipant,
  ScheduleRowView,
} from "./types";

/** ボタン 1 つぶんの表示。entryId が入っているスロットだけが押せる。 */
export type ResultSlotView = {
  /** 確定なら参加者名、未確定なら「第3試合の勝者」、BYE なら "BYE" */
  label: string;
  entryId: string | null;
};

export type ResultRowState = "ready" | "recorded" | "waiting" | "bye";

/**
 * 結果入力の 1 行。区切りは見出しとしてラベルだけを運ぶ。
 * 開始予定時刻を載せないのは、日時の文字列化がサーバ側の仕事で、
 * features/schedule からは同列の features/tournament の書式化関数を
 * 参照できないため。結果の入力に時刻は要らない。
 */
export type ResultRowView =
  | { kind: "divider"; key: string; label: string }
  | {
      kind: "match";
      key: string;
      divisionId: string;
      divisionName: string;
      matchId: string;
      matchNumber: string;
      /** 「1回戦 第1試合」 */
      label: string;
      slots: [ResultSlotView, ResultSlotView];
      /** BYE の自動勝ち上がりを含む。決まっていなければ null */
      winnerEntryId: string | null;
      state: ResultRowState;
      /** 上書き・取り消しで消える下流の記録の件数。0 なら確認を出さない */
      downstreamRecordedCount: number;
    };

/**
 * BYE を先に見るのは、片側が不戦勝の試合は記録の有無にかかわらず
 * 入力させないため（勝者は自動で決まる）。
 */
const rowState = (
  resolved: ResolvedMatch,
  isRecorded: boolean,
): ResultRowState => {
  if (resolved.slots.some((slot) => slot.state === "bye")) {
    return "bye";
  }
  if (isRecorded) {
    return "recorded";
  }
  if (resolved.slots.some((slot) => slot.state === "pending")) {
    return "waiting";
  }
  return "ready";
};

/**
 * 進行順の行（buildScheduleView の出力）に、いま誰が立っているかと
 * 記録の状態を足す。並びには手を入れない。
 *
 * 解決とラベル付けは部門ごとに 1 度だけ作る。行ごとに作り直すと
 * 試合数に対して二乗に近い計算量になる。
 */
export const buildResultRows = (
  rows: ScheduleRowView[],
  divisions: ScheduleDivision[],
  participants: ScheduleParticipant[],
): ResultRowView[] => {
  const context = new Map(
    divisions.map((division) => [
      division.id,
      {
        division,
        resolved: resolveMatchSlots(division.matchingConfig, division.results),
        labelSlot: createSlotLabeler(
          division.matchingConfig,
          division.entries,
          participants,
        ),
        recorded: new Set(
          division.results.matches.map((record) => record.matchId),
        ),
      },
    ]),
  );

  return rows.flatMap((row): ResultRowView[] => {
    if (row.kind === "divider") {
      return [{ kind: "divider", key: row.key, label: row.label }];
    }

    const current = context.get(row.divisionId);
    if (current === undefined) {
      return [];
    }
    const match = current.division.matchingConfig.matches.find(
      (candidate) => candidate.id === row.matchId,
    );
    const resolved = current.resolved.get(row.matchId);
    if (match === undefined || resolved === undefined) {
      return [];
    }

    // 確定しているスロットは参加者名で呼ぶ。未確定と BYE は組み合わせ上の
    // 表記（「第3試合の勝者」「BYE」）をそのまま使う。
    const slotView = (index: 0 | 1): ResultSlotView => {
      const slot = resolved.slots[index];
      return slot.state === "entry"
        ? {
            label: current.labelSlot({ kind: "entry", entryId: slot.entryId }),
            entryId: slot.entryId,
          }
        : { label: current.labelSlot(match.slots[index]), entryId: null };
    };

    const downstream = downstreamMatchIds(
      row.matchId,
      current.division.matchingConfig,
    );

    return [
      {
        kind: "match",
        key: row.key,
        divisionId: row.divisionId,
        divisionName: row.divisionName,
        matchId: row.matchId,
        matchNumber: row.matchNumber,
        label: row.label,
        slots: [slotView(0), slotView(1)],
        winnerEntryId: resolved.winnerEntryId,
        state: rowState(resolved, current.recorded.has(row.matchId)),
        downstreamRecordedCount: [...downstream].filter((id) =>
          current.recorded.has(id),
        ).length,
      },
    ];
  });
};
```

- [ ] **Step 6: テストが通ることを確認する**

Run: `pnpm test -- src/features/schedule/result-rows.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 7: repository に読み出しを足す**

`src/features/schedule/repository.ts` を次のように変える。

import に足す:

```ts
import { parseDivisionResults } from "@/lib/division/parse";
import { buildResultRows, type ResultRowView } from "./result-rows";
```

`loadDivisions` の select と戻り値:

```ts
    select: {
      id: true,
      name: true,
      order: true,
      entries: true,
      matchingConfig: true,
      results: true,
    },
  });

  // Json のパースはここで済ませ、domain は検証済みの形だけを扱う純粋関数に保つ。
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    order: row.order,
    entries: parseDivisionEntries(row.entries),
    matchingConfig: parseMatchingConfig(row.matchingConfig),
    results: parseDivisionResults(row.results),
  }));
```

`readScheduleRows` を材料の読み出しと分ける:

```ts
type ScheduleMaterials = {
  divisions: ScheduleDivision[];
  participants: ScheduleParticipant[];
  items: ScheduleItemRecord[];
};

/** 3 本のクエリをまとめて投げる。進行順の一覧と結果入力の両方が使う。 */
const loadMaterials = async (
  reader: ScheduleReader,
  organizationId: string,
  tournamentId: string,
): Promise<ScheduleMaterials> => {
  const [divisions, participants, items] = await Promise.all([
    loadDivisions(reader, organizationId, tournamentId),
    loadParticipants(reader, organizationId, tournamentId),
    loadItems(reader, organizationId, tournamentId),
  ]);
  return { divisions, participants, items };
};

/**
 * 一覧の行をマージ済みの形で読む。ページと schedule-store の両方が使う。
 * 読み出しは副作用を持たない（行のずれを直すのは次の保存）。
 */
export const readScheduleRows = async (
  reader: ScheduleReader,
  organizationId: string,
  tournamentId: string,
): Promise<ScheduleRowView[]> => {
  const { divisions, participants, items } = await loadMaterials(
    reader,
    organizationId,
    tournamentId,
  );

  return buildScheduleView(divisions, participants, items);
};

/** ページから呼ぶ読み出し。 */
export const loadScheduleView = (
  organizationId: string,
  tournamentId: string,
): Promise<ScheduleRowView[]> =>
  readScheduleRows(prisma, organizationId, tournamentId);

/** 結果入力ページから呼ぶ読み出し。並びは試合一覧と同じ。 */
export const loadResultRows = async (
  organizationId: string,
  tournamentId: string,
): Promise<ResultRowView[]> => {
  const { divisions, participants, items } = await loadMaterials(
    prisma,
    organizationId,
    tournamentId,
  );

  return buildResultRows(
    buildScheduleView(divisions, participants, items),
    divisions,
    participants,
  );
};
```

- [ ] **Step 8: repository のテストを足す**

`src/features/schedule/repository.test.ts` の import 行を次にする。

```ts
const { loadResultRows, loadScheduleView } = await import("./repository");
```

末尾に足す:

```ts
describe("loadResultRows", () => {
  it("進行順の行を結果入力用の形にして返す", async () => {
    const rows = await loadResultRows("o1", "t1");

    expect(rows).toEqual([
      {
        kind: "match",
        key: "match:dA:m1-0",
        divisionId: "dA",
        divisionName: "男子",
        matchId: "m1-0",
        matchNumber: "1",
        label: "1回戦 第1試合",
        slots: [
          { label: "山田", entryId: "e1" },
          { label: "佐藤", entryId: "e2" },
        ],
        winnerEntryId: null,
        state: "ready",
        downstreamRecordedCount: 0,
      },
    ]);
  });

  it("部門の読み出しに所有条件を入れる", async () => {
    await loadResultRows("o1", "t1");

    expect(divisionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournament: { id: "t1", organizationId: "o1" } },
      }),
    );
  });
});
```

- [ ] **Step 9: schedule のテストを全部通す**

Run: `pnpm test -- src/features/schedule`
Expected: PASS

- [ ] **Step 10: コミット**

```bash
git add src/features/schedule
git commit -m "feat(schedule): read match rows for result entry"
```

---

## Task 4: エラーと再検証の追加（features/division）

**Files:**
- Modify: `src/features/division/errors.ts`
- Modify: `src/features/division/messages.ts`
- Modify: `src/features/division/revalidate.ts`
- Modify: `src/features/division/messages.test.ts`

**Interfaces:**
- Produces:
  - `DivisionRevisionConflictError`（`{ divisionId: string }`）
  - `DivisionSlotNotDecidedError`（`{ matchId: string }`）
  - `revalidateDivisionResults(slug: string, tournamentId: string, divisionId: string): void`

- [ ] **Step 1: 文言のテストを書く**

`src/features/division/messages.test.ts` に足す（既存のテストの書き方に合わせる。ファイルを開いて既存の it の形をそのまま真似ること）。

```ts
  it("楽観ロックの競合は再読み込みを促す", () => {
    expect(
      divisionErrorMessage(
        new DivisionRevisionConflictError({ divisionId: "d1" }),
      ),
    ).toBe("他の人が更新しました。画面を再読み込みしてください");
  });

  it("未確定の試合への入力はその旨を返す", () => {
    expect(
      divisionErrorMessage(new DivisionSlotNotDecidedError({ matchId: "m1" })),
    ).toBe("対戦相手がまだ決まっていません。画面を再読み込みしてください");
  });
```

import 行に `DivisionRevisionConflictError` と `DivisionSlotNotDecidedError` を足す。

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm test -- src/features/division/messages.test.ts`
Expected: FAIL（2 つのエラークラスが export されていない）

- [ ] **Step 3: エラーを足す**

`src/features/division/errors.ts` の `DivisionParticipantNotFoundError` の下に足す:

```ts
/** results の楽観ロック（revision）が競合したことを表す。 */
export class DivisionRevisionConflictError extends Data.TaggedError(
  "DivisionRevisionConflictError",
)<{
  readonly divisionId: string;
}> {}

/** 対戦相手がまだ決まっていない試合に勝敗を入れようとしたことを表す。 */
export class DivisionSlotNotDecidedError extends Data.TaggedError(
  "DivisionSlotNotDecidedError",
)<{
  readonly matchId: string;
}> {}
```

`DivisionError` の union に 2 行足す:

```ts
  | DivisionParticipantNotFoundError
  | DivisionRevisionConflictError
  | DivisionSlotNotDecidedError;
```

`divisionErrorTags` に 2 行足す:

```ts
  DivisionParticipantNotFoundError: true,
  DivisionRevisionConflictError: true,
  DivisionSlotNotDecidedError: true,
};
```

- [ ] **Step 4: 文言を足す**

`src/features/division/messages.ts` の最後の `Match.tag(...)` の後ろ（`Match.exhaustive` の直前）に足す:

```ts
    Match.tag(
      "DivisionRevisionConflictError",
      () => "他の人が更新しました。画面を再読み込みしてください",
    ),
    Match.tag(
      "DivisionSlotNotDecidedError",
      () => "対戦相手がまだ決まっていません。画面を再読み込みしてください",
    ),
```

- [ ] **Step 5: 再検証を足す**

`src/features/division/revalidate.ts` の末尾に足す:

```ts
/**
 * 勝敗を書き換えたあとに再検証すべきページ。結果入力の一覧、進行順の一覧、
 * ブラケットを描く部門詳細の 3 本が同じ results を読む。
 */
export const revalidateDivisionResults = (
  slug: string,
  tournamentId: string,
  divisionId: string,
): void => {
  const base = `/orgs/${slug}/tournaments/${tournamentId}`;
  revalidatePath(`${base}/results`);
  revalidatePath(`${base}/matches`);
  revalidatePath(`${base}/divisions/${divisionId}`);
};
```

- [ ] **Step 6: テストと型を通す**

Run: `pnpm test -- src/features/division/messages.test.ts src/features/division/errors.test.ts`
Expected: PASS

Run: `pnpm typecheck`
Expected: エラーなし（`Match.exhaustive` が文言の書き忘れを弾く）

- [ ] **Step 7: コミット**

```bash
git add src/features/division/errors.ts src/features/division/messages.ts src/features/division/messages.test.ts src/features/division/revalidate.ts
git commit -m "feat(division): add result recording errors and revalidation"
```

---

## Task 5: record-result スライスの入力と書き込み

**Files:**
- Create: `src/features/division/record-result/schema.ts`
- Create: `src/features/division/record-result/repository.ts`
- Create: `src/features/division/record-result/repository.test.ts`

**Interfaces:**
- Consumes: `DivisionIds` / `DivisionSetupOutcome`（`../setup-store`）、Task 1 の `resolveMatchSlots` / `downstreamMatchIds`、Task 2 の `applyMatchResult` / `clearResults`、Task 4 のエラー
- Produces:
  - `recordResultSchema` / `type RecordResultInput = { matchId: string; winnerEntryId: string }`（`winnerEntryId` が空文字なら取り消し）
  - `type RecordResultPort = (ids: DivisionIds, input: RecordResultInput) => Effect.Effect<DivisionSetupOutcome<null>, DivisionError>`
  - `recordResultInDb: RecordResultPort`

`setup-store.ts` の `runDivisionSetup` は使わない。あれは results が 1 件でもあると拒否する読み出しで、まさにこのスライスが書き換えたい列だから。`set-match-number/repository.ts` と同じく専用のトランザクションを書く。

- [ ] **Step 1: schema を書く**

Create `src/features/division/record-result/schema.ts`:

```ts
import { z } from "zod";

/**
 * winnerEntryId は勝者の DivisionEntry.id。空文字は「記録を取り消す」を表す。
 * 画面の「取り消し」ボタンが value="" で送る。
 */
export const recordResultSchema = z.object({
  matchId: z.string().min(1, "試合の指定が不正です"),
  winnerEntryId: z.string(),
});

export type RecordResultInput = z.infer<typeof recordResultSchema>;
```

- [ ] **Step 2: repository の失敗するテストを書く**

Create `src/features/division/record-result/repository.test.ts`:

```ts
import { Cause, Effect, Exit, Option } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();
const updateMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (run: (tx: unknown) => unknown) =>
      run({ division: { findFirst, updateMany } }),
  },
}));

const { recordResultInDb } = await import("./repository");

const ids = {
  organizationId: "o1",
  tournamentId: "t1",
  divisionId: "d1",
};

const matchingConfig = {
  version: 1,
  matches: [
    {
      id: "m1-0",
      bracket: "winners",
      round: 1,
      order: 0,
      matchNumber: "1",
      slots: [
        { kind: "entry", entryId: "e1" },
        { kind: "entry", entryId: "e2" },
      ],
    },
    {
      id: "m1-1",
      bracket: "winners",
      round: 1,
      order: 1,
      matchNumber: "2",
      slots: [
        { kind: "entry", entryId: "e3" },
        { kind: "entry", entryId: "e4" },
      ],
    },
    {
      id: "m2-0",
      bracket: "winners",
      round: 2,
      order: 0,
      matchNumber: "3",
      slots: [
        { kind: "winnerOf", matchId: "m1-0" },
        { kind: "winnerOf", matchId: "m1-1" },
      ],
    },
  ],
};

const entries = {
  version: 1,
  entries: [
    { id: "e1", participantId: "p1", seed: 0 },
    { id: "e2", participantId: "p2", seed: 1 },
    { id: "e3", participantId: "p3", seed: 2 },
    { id: "e4", participantId: "p4", seed: 3 },
  ],
};

const division = (results: unknown, revision = 3) => ({
  format: "SINGLE_ELIMINATION",
  entries,
  matchingConfig,
  results,
  revision,
});

const empty = { version: 1, matches: [] };

const run = (input: { matchId: string; winnerEntryId: string }) =>
  Effect.runPromiseExit(recordResultInDb(ids, input));

/** 失敗のタグを確かめる。set-match-number/repository.test.ts と同じ書き方。 */
const expectFailureTag = (
  exit: Exit.Exit<unknown, { _tag: string }>,
  tag: string,
) => {
  expect(exit._tag).toBe("Failure");
  if (Exit.isFailure(exit)) {
    const failure = Cause.failureOption(exit.cause);
    expect(Option.isSome(failure)).toBe(true);
    if (Option.isSome(failure)) {
      expect(failure.value._tag).toBe(tag);
    }
  }
};

beforeEach(() => {
  findFirst.mockReset();
  updateMany.mockReset();
  updateMany.mockResolvedValue({ count: 1 });
});

describe("recordResultInDb", () => {
  it("所有権を where に入れて読む", async () => {
    findFirst.mockResolvedValue(division(empty));

    await run({ matchId: "m1-0", winnerEntryId: "e1" });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "d1",
          tournament: { id: "t1", organizationId: "o1" },
        },
      }),
    );
  });

  it("対象が無ければ found: false を返す", async () => {
    findFirst.mockResolvedValue(null);

    const exit = await run({ matchId: "m1-0", winnerEntryId: "e1" });

    expect(exit).toStrictEqual(Exit.succeed({ found: false }));
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("勝者を記録し、revision を進める", async () => {
    findFirst.mockResolvedValue(division(empty));

    await run({ matchId: "m1-0", winnerEntryId: "e1" });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "d1",
        revision: 3,
        tournament: { id: "t1", organizationId: "o1" },
      },
      data: {
        results: { version: 1, matches: [{ matchId: "m1-0", winnerEntryId: "e1" }] },
        revision: 4,
      },
    });
  });

  it("勝者を変えると下流の記録を消す", async () => {
    findFirst.mockResolvedValue(
      division({
        version: 1,
        matches: [
          { matchId: "m1-0", winnerEntryId: "e1" },
          { matchId: "m1-1", winnerEntryId: "e3" },
          { matchId: "m2-0", winnerEntryId: "e1" },
        ],
      }),
    );

    await run({ matchId: "m1-0", winnerEntryId: "e2" });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          // applyMatchResult は既にある記録の位置を保ったまま上書きする。
          results: {
            version: 1,
            matches: [
              { matchId: "m1-0", winnerEntryId: "e2" },
              { matchId: "m1-1", winnerEntryId: "e3" },
            ],
          },
        }),
      }),
    );
  });

  it("空文字なら自分と下流の記録を消す", async () => {
    findFirst.mockResolvedValue(
      division({
        version: 1,
        matches: [
          { matchId: "m1-0", winnerEntryId: "e1" },
          { matchId: "m1-1", winnerEntryId: "e3" },
          { matchId: "m2-0", winnerEntryId: "e1" },
        ],
      }),
    );

    await run({ matchId: "m1-0", winnerEntryId: "" });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          results: {
            version: 1,
            matches: [{ matchId: "m1-1", winnerEntryId: "e3" }],
          },
        }),
      }),
    );
  });

  it("同じ勝者の押し直しでは書き込まない", async () => {
    findFirst.mockResolvedValue(
      division({
        version: 1,
        matches: [
          { matchId: "m1-0", winnerEntryId: "e1" },
          { matchId: "m2-0", winnerEntryId: "e1" },
        ],
      }),
    );

    const exit = await run({ matchId: "m1-0", winnerEntryId: "e1" });

    expect(exit).toStrictEqual(Exit.succeed({ found: true, value: null }));
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("組み合わせに無い試合は DivisionMatchNotFoundError", async () => {
    findFirst.mockResolvedValue(division(empty));

    const exit = await run({ matchId: "m9-9", winnerEntryId: "e1" });

    expectFailureTag(exit, "DivisionMatchNotFoundError");
  });

  it("対戦相手が未確定なら DivisionSlotNotDecidedError", async () => {
    findFirst.mockResolvedValue(division(empty));

    const exit = await run({ matchId: "m2-0", winnerEntryId: "e1" });

    expectFailureTag(exit, "DivisionSlotNotDecidedError");
  });

  it("その試合に立っていない参加者は DivisionSlotNotDecidedError", async () => {
    findFirst.mockResolvedValue(division(empty));

    const exit = await run({ matchId: "m1-0", winnerEntryId: "e3" });

    expectFailureTag(exit, "DivisionSlotNotDecidedError");
  });

  it("revision が進んでいれば DivisionRevisionConflictError", async () => {
    findFirst.mockResolvedValue(division(empty));
    updateMany.mockResolvedValue({ count: 0 });

    const exit = await run({ matchId: "m1-0", winnerEntryId: "e1" });

    expectFailureTag(exit, "DivisionRevisionConflictError");
  });
});
```

- [ ] **Step 3: テストが落ちることを確認する**

Run: `pnpm test -- src/features/division/record-result/repository.test.ts`
Expected: FAIL（`Failed to resolve import "./repository"`）

- [ ] **Step 4: repository を実装する**

Create `src/features/division/record-result/repository.ts`:

```ts
import "server-only";
import { Effect } from "effect";
import type { Prisma } from "@/generated/prisma/client";
import { parseDivisionResults, parseMatchingConfig } from "@/lib/division/parse";
import { downstreamMatchIds, resolveMatchSlots } from "@/lib/division/resolve";
import { applyMatchResult, clearResults } from "@/lib/division/results";
import type { DivisionResults } from "@/lib/division/types";
import { validateResults } from "@/lib/division/validate";
import { prisma } from "@/shared/db/prisma";
import {
  DivisionDataError,
  type DivisionError,
  DivisionMatchNotFoundError,
  DivisionRevisionConflictError,
  DivisionSlotNotDecidedError,
  toDivisionError,
} from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { RecordResultInput } from "./schema";

export type RecordResultPort = (
  ids: DivisionIds,
  input: RecordResultInput,
) => Effect.Effect<DivisionSetupOutcome<null>, DivisionError>;

/**
 * Prisma の Json 入力は任意プロパティを持つ構造的な型を受け付けない
 * （MatchResultRecord の score / finishedAt が undefined を取りうるため）。
 * 書き込みのときだけ変換する。
 */
const toJsonInput = (results: DivisionResults): Prisma.InputJsonValue =>
  results as unknown as Prisma.InputJsonValue;

/**
 * 1 試合の勝敗を書く。winnerEntryId が空文字なら記録を取り消す。
 *
 * setup-store の runDivisionSetup は使わない。あれは results が 1 件でもあると
 * 拒否する読み出しで、このスライスが書き換えたいのはまさにその列だから。
 *
 * 勝者が変わると、その勝者が進む先（下流）の記録は矛盾する。承認済みの仕様に
 * 従い、下流をまとめて消してから書く。同じ勝者の押し直しは変更なしとして
 * 何も書かない（下流も残る）。
 */
export const recordResultInDb: RecordResultPort = (ids, input) =>
  Effect.tryPromise({
    try: () =>
      prisma.$transaction(async (tx): Promise<DivisionSetupOutcome<null>> => {
        const ownership = {
          id: ids.divisionId,
          tournament: {
            id: ids.tournamentId,
            organizationId: ids.organizationId,
          },
        };

        const row = await tx.division.findFirst({
          where: ownership,
          select: {
            format: true,
            entries: true,
            matchingConfig: true,
            results: true,
            revision: true,
          },
        });
        if (!row) {
          return { found: false };
        }

        const config = parseMatchingConfig(row.matchingConfig);
        const current = parseDivisionResults(row.results);
        if (!config.matches.some((match) => match.id === input.matchId)) {
          throw new DivisionMatchNotFoundError({ matchId: input.matchId });
        }

        const previous =
          current.matches.find((record) => record.matchId === input.matchId)
            ?.winnerEntryId ?? null;
        const nextWinner =
          input.winnerEntryId === "" ? null : input.winnerEntryId;

        if (nextWinner !== null) {
          // 画面ではボタンを無効にしているが、Server Action はページを経由せず
          // 直接叩ける別の入口なので、ここで独立に確かめる。両スロットが確定
          // していない試合（未確定・BYE）は入力させない。
          const resolved = resolveMatchSlots(config, current).get(
            input.matchId,
          );
          const standing =
            resolved === undefined
              ? []
              : resolved.slots.flatMap((slot) =>
                  slot.state === "entry" ? [slot.entryId] : [],
                );
          if (standing.length !== 2 || !standing.includes(nextWinner)) {
            throw new DivisionSlotNotDecidedError({ matchId: input.matchId });
          }
        }

        if (nextWinner === previous) {
          return { found: true, value: null };
        }

        const cleared = clearResults(
          current,
          downstreamMatchIds(input.matchId, config),
        );
        const next =
          nextWinner === null
            ? clearResults(cleared, new Set([input.matchId]))
            : applyMatchResult(cleared, {
                matchId: input.matchId,
                winnerEntryId: nextWinner,
              });

        // setup-store の save と同じく、書く直前に反映後の全体を検証する。
        const errors = validateResults(next, config, row.format);
        if (errors.length > 0) {
          throw new DivisionDataError({ reason: errors });
        }

        const updated = await tx.division.updateMany({
          where: { ...ownership, revision: row.revision },
          data: { results: toJsonInput(next), revision: row.revision + 1 },
        });
        if (updated.count === 0) {
          throw new DivisionRevisionConflictError({
            divisionId: ids.divisionId,
          });
        }

        return { found: true, value: null };
      }),
    catch: (reason) => toDivisionError(reason, ids.tournamentId),
  });
```

`updateMany` の `where` はテストの期待（`{ id, revision, tournament: {...} }`）と同じ形になる。スプレッドの順序でキーの並びが変わっても `toHaveBeenCalledWith` は等価比較なので問題ない。

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm test -- src/features/division/record-result/repository.test.ts`
Expected: PASS（11 tests）

- [ ] **Step 6: コミット**

```bash
git add src/features/division/record-result
git commit -m "feat(division): record a match result with ownership and optimistic lock"
```

---

## Task 6: record-result の usecase と Server Action

**Files:**
- Create: `src/features/division/record-result/usecase.ts`
- Create: `src/features/division/record-result/handler.ts`
- Create: `src/features/division/record-result/handler.test.ts`

**Interfaces:**
- Consumes: Task 5 の `RecordResultPort` / `recordResultInDb` / `recordResultSchema`、Task 4 の `revalidateDivisionResults`
- Produces:
  - `recordResultForDivision(port, ids, input)`
  - `recordResultAction: DivisionFormAction`（`formData` に `slug` / `tournamentId` / `divisionId` / `matchId` / `winnerEntryId`）

- [ ] **Step 1: handler の失敗するテストを書く**

Create `src/features/division/record-result/handler.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrganization = vi.fn();
const recordResultInDb = vi.fn();
const revalidateDivisionResults = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => requireOrganization(slug),
}));
vi.mock("./repository", () => ({
  recordResultInDb: (ids: unknown, input: unknown) =>
    recordResultInDb(ids, input),
}));
vi.mock("../revalidate", () => ({
  revalidateDivisionResults: (
    slug: string,
    tournamentId: string,
    divisionId: string,
  ) => revalidateDivisionResults(slug, tournamentId, divisionId),
}));

const { recordResultAction } = await import("./handler");

const formData = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
};

const validInput = {
  slug: "tennis",
  tournamentId: "t1",
  divisionId: "d1",
  matchId: "m1-0",
  winnerEntryId: "e1",
};

beforeEach(() => {
  requireOrganization.mockReset();
  recordResultInDb.mockReset();
  revalidateDivisionResults.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({ organization: { id: "o1" } });
  recordResultInDb.mockReturnValue(
    Effect.succeed({ found: true, value: null }),
  );
});

describe("recordResultAction", () => {
  it("組織の所有権を確かめてから書き込む", async () => {
    const state = await recordResultAction(
      { error: null },
      formData(validInput),
    );

    expect(requireOrganization).toHaveBeenCalledWith("tennis");
    expect(recordResultInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1", divisionId: "d1" },
      { matchId: "m1-0", winnerEntryId: "e1" },
    );
    expect(state).toEqual({ error: null });
  });

  it("成功したら 3 本のページを再検証する", async () => {
    await recordResultAction({ error: null }, formData(validInput));

    expect(revalidateDivisionResults).toHaveBeenCalledWith(
      "tennis",
      "t1",
      "d1",
    );
  });

  it("取り消し（空文字）もそのまま渡す", async () => {
    await recordResultAction(
      { error: null },
      formData({ ...validInput, winnerEntryId: "" }),
    );

    expect(recordResultInDb).toHaveBeenCalledWith(expect.anything(), {
      matchId: "m1-0",
      winnerEntryId: "",
    });
  });

  it("試合の指定が空なら書き込まずに文言を返す", async () => {
    const state = await recordResultAction(
      { error: null },
      formData({ ...validInput, matchId: "" }),
    );

    expect(state).toEqual({ error: "試合の指定が不正です" });
    expect(recordResultInDb).not.toHaveBeenCalled();
  });

  it("対象が無ければ notFound へ倒す", async () => {
    recordResultInDb.mockReturnValue(Effect.succeed({ found: false }));

    await expect(
      recordResultAction({ error: null }, formData(validInput)),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("失敗は日本語の文言にして返す", async () => {
    const { DivisionRevisionConflictError } = await import("../errors");
    recordResultInDb.mockReturnValue(
      Effect.fail(new DivisionRevisionConflictError({ divisionId: "d1" })),
    );

    const state = await recordResultAction(
      { error: null },
      formData(validInput),
    );

    expect(state).toEqual({
      error: "他の人が更新しました。画面を再読み込みしてください",
    });
    expect(revalidateDivisionResults).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm test -- src/features/division/record-result/handler.test.ts`
Expected: FAIL（`Failed to resolve import "./handler"`）

- [ ] **Step 3: usecase と handler を実装する**

Create `src/features/division/record-result/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { RecordResultPort } from "./repository";
import type { RecordResultInput } from "./schema";

export const recordResultForDivision = (
  port: RecordResultPort,
  ids: DivisionIds,
  input: RecordResultInput,
): Effect.Effect<DivisionSetupOutcome<null>, DivisionError> => port(ids, input);
```

Create `src/features/division/record-result/handler.ts`:

```ts
"use server";

import { Effect, Exit } from "effect";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import { revalidateDivisionResults } from "../revalidate";
import type { DivisionFormState } from "../state";
import { recordResultInDb } from "./repository";
import { recordResultSchema } from "./schema";
import { recordResultForDivision } from "./usecase";

export const recordResultAction = async (
  _prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const divisionId = String(formData.get("divisionId") ?? "");
  // Server Action はページを経由せず直接叩ける別の入口なので、ここで独立に確かめる。
  const { organization } = await requireOrganization(slug);

  const parsed = recordResultSchema.safeParse({
    matchId: String(formData.get("matchId") ?? ""),
    winnerEntryId: String(formData.get("winnerEntryId") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    recordResultForDivision(
      recordResultInDb,
      { organizationId: organization.id, tournamentId, divisionId },
      parsed.data,
    ),
  );

  if (Exit.isFailure(exit)) {
    return divisionErrorFormState(exit.cause);
  }
  if (!exit.value.found) {
    notFound();
  }

  revalidateDivisionResults(slug, tournamentId, divisionId);
  return { error: null };
};
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm test -- src/features/division/record-result`
Expected: PASS（repository 11 + handler 6）

- [ ] **Step 5: コミット**

```bash
git add src/features/division/record-result
git commit -m "feat(division): add the record result server action"
```

---

## Task 7: 結果入力の一覧コンポーネント

**Files:**
- Create: `src/components/result/MatchResultRow.tsx`
- Create: `src/components/result/MatchResultList.tsx`
- Create: `src/components/result/MatchResultList.test.tsx`

**Interfaces:**
- Consumes: Task 3 の `ResultRowView`、`@/features/division/state` の `DivisionFormAction` / `INITIAL_DIVISION_FORM_STATE`
- Produces: `MatchResultList({ rows, slug, tournamentId, action })` / `MatchResultRow({ row, slug, tournamentId, action })`

- [ ] **Step 1: 失敗するテストを書く**

Create `src/components/result/MatchResultList.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResultRowView } from "@/features/schedule/result-rows";
import { MatchResultList } from "./MatchResultList";

const action = vi.fn(async () => ({ error: null }));

const matchRow = (
  overrides: Partial<Extract<ResultRowView, { kind: "match" }>> = {},
): ResultRowView => ({
  kind: "match",
  key: "match:d1:m1-0",
  divisionId: "d1",
  divisionName: "男子",
  matchId: "m1-0",
  matchNumber: "1",
  label: "1回戦 第1試合",
  slots: [
    { label: "山田", entryId: "e1" },
    { label: "佐藤", entryId: "e2" },
  ],
  winnerEntryId: null,
  state: "ready",
  downstreamRecordedCount: 0,
  ...overrides,
});

const renderList = (rows: ResultRowView[]) =>
  render(
    <MatchResultList
      rows={rows}
      slug="tennis"
      tournamentId="t1"
      action={action}
    />,
  );

beforeEach(() => {
  action.mockClear();
  vi.restoreAllMocks();
});

describe("MatchResultList", () => {
  it("押した側を勝者として送る", async () => {
    const user = userEvent.setup();
    renderList([matchRow()]);

    await user.click(
      screen.getByRole("button", { name: "第1試合 佐藤の勝ち" }),
    );

    expect(action).toHaveBeenCalled();
    const formData = action.mock.calls[0][1] as FormData;
    expect(formData.get("slug")).toBe("tennis");
    expect(formData.get("tournamentId")).toBe("t1");
    expect(formData.get("divisionId")).toBe("d1");
    expect(formData.get("matchId")).toBe("m1-0");
    expect(formData.get("winnerEntryId")).toBe("e2");
  });

  it("記録済みの行は勝者が押された状態になり、取り消しを出す", () => {
    renderList([matchRow({ state: "recorded", winnerEntryId: "e1" })]);

    expect(
      screen.getByRole("button", { name: "第1試合 山田の勝ち" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "第1試合の結果を取り消す" }),
    ).toBeInTheDocument();
  });

  it("未確定の行と不戦勝の行は押せない", () => {
    renderList([
      matchRow({
        state: "waiting",
        slots: [
          { label: "第1試合の勝者", entryId: null },
          { label: "佐藤", entryId: "e2" },
        ],
      }),
    ]);

    expect(
      screen.getByRole("button", { name: "第1試合 佐藤の勝ち" }),
    ).toBeDisabled();
    expect(screen.getByText("第1試合の勝者")).toBeInTheDocument();
  });

  it("下流の記録があるときだけ確認してから送る", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderList([
      matchRow({
        state: "recorded",
        winnerEntryId: "e1",
        downstreamRecordedCount: 2,
      }),
    ]);

    await user.click(
      screen.getByRole("button", { name: "第1試合 佐藤の勝ち" }),
    );

    expect(confirm).toHaveBeenCalledWith(
      "この試合の結果を変えると、あとの試合の結果 2 件も取り消されます。よろしいですか？",
    );
    expect(action).not.toHaveBeenCalled();
  });

  it("下流の記録が無ければ確認しない", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderList([matchRow()]);

    await user.click(
      screen.getByRole("button", { name: "第1試合 山田の勝ち" }),
    );

    expect(confirm).not.toHaveBeenCalled();
    expect(action).toHaveBeenCalled();
  });

  it("取り消しは空文字を送る", async () => {
    const user = userEvent.setup();
    renderList([matchRow({ state: "recorded", winnerEntryId: "e1" })]);

    await user.click(
      screen.getByRole("button", { name: "第1試合の結果を取り消す" }),
    );

    const formData = action.mock.calls[0][1] as FormData;
    expect(formData.get("winnerEntryId")).toBe("");
  });

  it("区切りは見出しとして出す", () => {
    renderList([
      { kind: "divider", key: "divider:x1", label: "午前の部" },
      matchRow(),
    ]);

    expect(screen.getByText("午前の部")).toBeInTheDocument();
  });

  it("試合が無ければその旨を出す", () => {
    renderList([]);

    expect(screen.getByText("まだ試合がありません")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm test -- src/components/result/MatchResultList.test.tsx`
Expected: FAIL（`Failed to resolve import "./MatchResultList"`）

- [ ] **Step 3: 行のコンポーネントを実装する**

Create `src/components/result/MatchResultRow.tsx`:

```tsx
"use client";

import type { MouseEvent } from "react";
import { useActionState } from "react";
import {
  type DivisionFormAction,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";
import type {
  ResultRowView,
  ResultSlotView,
} from "@/features/schedule/result-rows";

type MatchRow = Extract<ResultRowView, { kind: "match" }>;

/**
 * 勝者を選ぶボタン。submit の value に entryId を載せ、押したボタンの
 * name/value がそのまま FormData に入る形にしている。ラジオ + 保存だと
 * タップが 2 回になるため。
 */
function WinnerButton({
  row,
  slot,
  disabled,
  onClick,
}: {
  row: MatchRow;
  slot: ResultSlotView;
  disabled: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const isWinner =
    row.winnerEntryId !== null && slot.entryId === row.winnerEntryId;

  return (
    <button
      type="submit"
      name="winnerEntryId"
      value={slot.entryId ?? ""}
      aria-label={`第${row.matchNumber}試合 ${slot.label}の勝ち`}
      aria-pressed={isWinner}
      disabled={disabled || slot.entryId === null}
      className={
        isWinner
          ? "rounded border border-slate-800 bg-slate-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          : "rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-40"
      }
    >
      {slot.label}
    </button>
  );
}

/**
 * 1 行 1 フォーム。useActionState を行ごとに持たせ、エラーをその行に出す。
 * 入力できるのは両者が確定している試合だけで、未確定（waiting）と
 * 不戦勝（bye）は押せない。勝者は自動で決まるか、まだ決まっていない。
 */
export function MatchResultRow({
  row,
  slug,
  tournamentId,
  action,
}: {
  row: MatchRow;
  slug: string;
  tournamentId: string;
  action: DivisionFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_DIVISION_FORM_STATE,
  );
  const editable = row.state === "ready" || row.state === "recorded";

  // 消えるものがあるときだけ確認する。普段の入力はタップ 1 回で終わらせたい。
  const confirmIfNeeded = (event: MouseEvent<HTMLButtonElement>) => {
    if (row.downstreamRecordedCount === 0) {
      return;
    }
    const accepted = window.confirm(
      `この試合の結果を変えると、あとの試合の結果 ${row.downstreamRecordedCount} 件も取り消されます。よろしいですか？`,
    );
    if (!accepted) {
      event.preventDefault();
    }
  };

  return (
    <li className="rounded border border-slate-200 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm text-slate-800">
            <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-bold">
              第{row.matchNumber}試合
            </span>
            <span className="truncate text-xs text-slate-500">
              {row.divisionName} / {row.label}
            </span>
          </p>
        </div>

        <form action={formAction} className="flex items-center gap-2">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="tournamentId" value={tournamentId} />
          <input type="hidden" name="divisionId" value={row.divisionId} />
          <input type="hidden" name="matchId" value={row.matchId} />

          <WinnerButton
            row={row}
            slot={row.slots[0]}
            disabled={pending || !editable}
            onClick={confirmIfNeeded}
          />
          <span className="text-xs text-slate-400">vs</span>
          <WinnerButton
            row={row}
            slot={row.slots[1]}
            disabled={pending || !editable}
            onClick={confirmIfNeeded}
          />

          {row.state === "recorded" && (
            <button
              type="submit"
              name="winnerEntryId"
              value=""
              aria-label={`第${row.matchNumber}試合の結果を取り消す`}
              disabled={pending}
              onClick={confirmIfNeeded}
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 disabled:opacity-40"
            >
              取り消し
            </button>
          )}
        </form>
      </div>

      {row.state === "bye" && (
        <p className="mt-1 text-xs text-slate-500">不戦勝で自動的に勝ち上がります</p>
      )}
      {state.error !== null && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {state.error}
        </p>
      )}
    </li>
  );
}
```

- [ ] **Step 4: 一覧のコンポーネントを実装する**

Create `src/components/result/MatchResultList.tsx`:

```tsx
"use client";

import type { DivisionFormAction } from "@/features/division/state";
import type { ResultRowView } from "@/features/schedule/result-rows";
import { MatchResultRow } from "./MatchResultRow";

/**
 * 進行順に並んだ結果入力の一覧。並べ替えと区切りの編集は試合一覧
 * （/matches）が持つので、ここでは区切りを見出しとして出すだけにする。
 */
export function MatchResultList({
  rows,
  slug,
  tournamentId,
  action,
}: {
  rows: ResultRowView[];
  slug: string;
  tournamentId: string;
  action: DivisionFormAction;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-600">まだ試合がありません</p>;
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) =>
        row.kind === "divider" ? (
          <li
            key={row.key}
            className="rounded bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700"
          >
            {row.label}
          </li>
        ) : (
          <MatchResultRow
            key={row.key}
            row={row}
            slug={slug}
            tournamentId={tournamentId}
            action={action}
          />
        ),
      )}
    </ul>
  );
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm test -- src/components/result/MatchResultList.test.tsx`
Expected: PASS（8 tests）

- [ ] **Step 6: コミット**

```bash
git add src/components/result
git commit -m "feat(result): add the match result entry list"
```

---

## Task 8: 結果入力ページと大会詳細からの導線

**Files:**
- Create: `src/app/orgs/[slug]/tournaments/[tournamentId]/results/page.tsx`
- Create: `src/app/orgs/[slug]/tournaments/[tournamentId]/results/page.test.tsx`
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/page.tsx`（「結果入力」リンクを足す）
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/page.test.tsx`（リンクの検証を足す）

**Interfaces:**
- Consumes: `loadResultRows`（Task 3）、`recordResultAction`（Task 6）、`MatchResultList`（Task 7）

- [ ] **Step 1: ページのテストを書く**

Create `src/app/orgs/[slug]/tournaments/[tournamentId]/results/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/LogoutButton", () => ({
  LogoutButton: () => <button type="button">ログアウト</button>,
}));

const requireOrganization = vi.fn();
const findTournamentInOrganization = vi.fn();
const loadResultRows = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => requireOrganization(slug),
}));
vi.mock("@/features/tournament/repository", () => ({
  findTournamentInOrganization: (
    organizationId: string,
    tournamentId: string,
  ) => findTournamentInOrganization(organizationId, tournamentId),
}));
vi.mock("@/features/schedule/repository", () => ({
  loadResultRows: (organizationId: string, tournamentId: string) =>
    loadResultRows(organizationId, tournamentId),
}));
vi.mock("@/features/division/record-result/handler", () => ({
  recordResultAction: async () => ({ error: null }),
}));

const { default: Page } = await import("./page");

const pageProps = (slug: string, tournamentId: string) => ({
  params: Promise.resolve({ slug, tournamentId }),
  searchParams: Promise.resolve({}),
});

const session = { user: { id: "u1", name: "竹添" } };
const organization = { id: "o1", name: "テニス部", slug: "tennis" };
const tournament = { id: "t1", name: "春季大会" };

beforeEach(() => {
  requireOrganization.mockReset();
  findTournamentInOrganization.mockReset();
  loadResultRows.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({ session, organization });
  findTournamentInOrganization.mockResolvedValue(tournament);
  loadResultRows.mockResolvedValue([
    {
      kind: "match",
      key: "match:d1:m1-0",
      divisionId: "d1",
      divisionName: "男子",
      matchId: "m1-0",
      matchNumber: "1",
      label: "1回戦 第1試合",
      slots: [
        { label: "山田", entryId: "e1" },
        { label: "佐藤", entryId: "e2" },
      ],
      winnerEntryId: null,
      state: "ready",
      downstreamRecordedCount: 0,
    },
  ]);
});

describe("TournamentResultsPage", () => {
  it("組織の所有権を確かめ、大会の行を読む", async () => {
    render(await Page(pageProps("tennis", "t1")));

    expect(requireOrganization).toHaveBeenCalledWith("tennis");
    expect(loadResultRows).toHaveBeenCalledWith("o1", "t1");
    expect(
      screen.getByRole("button", { name: "第1試合 山田の勝ち" }),
    ).toBeInTheDocument();
  });

  it("大会がこの組織に無ければ notFound へ倒す", async () => {
    findTournamentInOrganization.mockResolvedValue(null);

    await expect(Page(pageProps("tennis", "t9"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(loadResultRows).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm test -- "src/app/orgs/[slug]/tournaments/[tournamentId]/results/page.test.tsx"`
Expected: FAIL（`Failed to resolve import "./page"`）

- [ ] **Step 3: ページを実装する**

Create `src/app/orgs/[slug]/tournaments/[tournamentId]/results/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { MatchResultList } from "@/components/result/MatchResultList";
import { recordResultAction } from "@/features/division/record-result/handler";
import { loadResultRows } from "@/features/schedule/repository";
import { findTournamentInOrganization } from "@/features/tournament/repository";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function TournamentResultsPage({
  params,
}: PageProps<"/orgs/[slug]/tournaments/[tournamentId]/results">) {
  const { slug, tournamentId } = await params;
  const { session, organization } = await requireOrganization(slug);

  const tournament = await findTournamentInOrganization(
    organization.id,
    tournamentId,
  );
  if (!tournament) {
    notFound();
  }

  const rows = await loadResultRows(organization.id, tournamentId);

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        crumbs={[
          { label: "組織", href: "/" },
          { label: organization.name, href: `/orgs/${slug}` },
          {
            label: tournament.name,
            href: `/orgs/${slug}/tournaments/${tournament.id}`,
          },
          { label: "結果入力" },
        ]}
        userName={session.user.name}
      />

      <div className="mx-auto max-w-3xl space-y-4 px-6 py-8">
        <div>
          <h1 className="text-lg font-bold text-slate-800">結果入力</h1>
          <p className="text-xs text-slate-500">
            勝った方を押すとその場で記録します。勝敗を記録すると、その部門のエントリー・組み合わせは編集できなくなります。
          </p>
        </div>

        <MatchResultList
          rows={rows}
          slug={slug}
          tournamentId={tournament.id}
          action={recordResultAction}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: ルートの型を生成してテストを通す**

Run: `pnpm exec next typegen`
Expected: 正常終了（新しいルートの `PageProps` が生える）

Run: `pnpm test -- "src/app/orgs/[slug]/tournaments/[tournamentId]/results/page.test.tsx"`
Expected: PASS（2 tests）

- [ ] **Step 5: 大会詳細に導線を足す**

`src/app/orgs/[slug]/tournaments/[tournamentId]/page.tsx` の「試合一覧」リンクを次の 2 本に差し替える。

```tsx
        <div className="flex gap-2">
          <Link
            href={`/orgs/${slug}/tournaments/${tournament.id}/matches`}
            className="inline-block rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800"
          >
            試合一覧
          </Link>
          <Link
            href={`/orgs/${slug}/tournaments/${tournament.id}/results`}
            className="inline-block rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800"
          >
            結果入力
          </Link>
        </div>
```

`src/app/orgs/[slug]/tournaments/[tournamentId]/page.test.tsx` に足す（既存の「試合一覧」リンクを検証している it の隣に、同じ書き方で）:

```tsx
  it("結果入力ページへの導線を出す", async () => {
    render(await Page(pageProps("tennis", "t1")));

    expect(screen.getByRole("link", { name: "結果入力" })).toHaveAttribute(
      "href",
      "/orgs/tennis/tournaments/t1/results",
    );
  });
```

- [ ] **Step 6: 大会詳細のテストを通す**

Run: `pnpm test -- "src/app/orgs/[slug]/tournaments/[tournamentId]/page.test.tsx"`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add "src/app/orgs/[slug]/tournaments/[tournamentId]"
git commit -m "feat(result): add the result entry page and its link"
```

---

## Task 9: 仕上げ

**Files:**
- Modify: 直前までに触ったファイルのうち、lint / typecheck の指摘があったもの

- [ ] **Step 1: 全テストを通す**

Run: `pnpm test`
Expected: 全 PASS。落ちたテストがあれば、そのテストが守っている仕様を読んでから直す（テストを消して通すのは禁止）

- [ ] **Step 2: 型を通す**

Run: `pnpm typecheck`
Expected: エラーなし

- [ ] **Step 3: lint を通す**

Run: `pnpm lint`
Expected: 自分が触ったファイルに「内容の」指摘が無いこと。CRLF 由来の `format` エラーは既知のノイズなので無視する（`pnpm lint:fix` は行全体の改行を書き換えて差分を汚すので使わない）

- [ ] **Step 4: 実際に動かして確認する**

```bash
BYPASS_AUTH=1 pnpm dev
```

Cookie に `USER_ID=1` を設定して `/orgs/<slug>/tournaments/<id>/results` を開き、次を目で確かめる。

1. 1 回戦の行で勝った方を押すと、その場で「勝」の印が付く
2. 2 回戦の行に勝者の名前が入り、押せるようになる
3. 1 回戦の勝者を押し直すと確認ダイアログが出て、承諾すると 2 回戦の記録が消える
4. 「取り消し」で未入力に戻る
5. BYE を含む行は押せず、「不戦勝で自動的に勝ち上がります」と出る

- [ ] **Step 5: 最終コミット（未コミットの修正があれば）**

```bash
git status
git add -A
git commit -m "fix(result): address lint and typecheck findings"
```

- [ ] **Step 6: 仕上げの判断を仰ぐ**

superpowers:finishing-a-development-branch に従い、マージ / PR / そのまま、のどれにするかを利用者に尋ねる。
