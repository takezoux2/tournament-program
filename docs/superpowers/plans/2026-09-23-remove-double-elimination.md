# ダブルエリミネーション機能の削除 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `DOUBLE_ELIMINATION_GRAND_FINAL` / `DOUBLE_ELIMINATION_THIRD_PLACE` を DB の enum ごと取り除き、`SINGLE_ELIMINATION` とリーグの 2 形式だけを扱う状態に戻す。

**Architecture:** 3 段階で進める。(1) 編集経路から DE を外し、DE 専用だった画面・スライスを削除する。(2) enum を削除し、`Record<DivisionFormat, …>` と網羅 `switch` を 2 形式に絞る。(3) 残ったコメントの文言を直す。(1) と (2) を分けるのは、型の都合でそれぞれが「まとめてやらないと緑にならない」塊になっているため。各タスクの終わりで `pnpm typecheck` / `pnpm test` / `pnpm lint` がすべて緑になる。

**Tech Stack:** Next.js 16.3.3 / React 19 / TypeScript 5 / Prisma 7.10（PostgreSQL） / Vitest 4 / Testing Library / Biome 2.4.2 / Effect 3

設計の根拠は `docs/superpowers/specs/2026-09-23-remove-double-elimination-design.md` にある。判断に迷ったらそちらを読むこと。

## Global Constraints

- パッケージマネージャは **pnpm**。`npm` / `yarn` を使わない。
- 検証コマンドは `pnpm typecheck` / `pnpm test` / `pnpm lint`。`pnpm test` は `vitest run`（ウォッチしない）。
- Prisma のクライアントは `src/generated/prisma/` に生成される。スキーマを変えたら `pnpm exec prisma generate` を必ず走らせる。`src/generated/` は手で編集しない。
- `BracketMatch.bracket` の `"losers"` / `"final"`、`SlotSource` の `loserOf` は **残す**。`src/lib/division/{types,parse,label,resolve,validate}.ts` と `src/features/bracket/{types,layout-bracket}.ts` からこれらを消さない。
- `matchingConfig` / `results` の Json を書き換えるマイグレーションは作らない。
- `docs/superpowers/specs/2026-09-17-double-elimination-design.md` と `docs/superpowers/plans/2026-09-17-double-elimination.md` は削除も改変もしない。
- 新規・変更したテストは、既存ファイルの記法に合わせる（`describe` / `it` は日本語、`vi.mock` は Prisma の境界だけ）。
- コミットメッセージの末尾に必ず次の 1 行を入れる:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- Windows のチェックアウトでは、触っていないファイルに CRLF 由来の Biome 指摘が出ることがある。**自分が変更したファイルの内容**で緑かどうかを判断する。

## File Structure

削除するファイル:

| パス | 役割 |
| --- | --- |
| `src/features/division/double-elimination/build.ts` / `build.test.ts` | DE の組み合わせ生成 |
| `src/features/division/swap-slots/{handler,usecase,repository,schema}.ts` と `{handler,repository,schema}.test.ts` | 1 回戦スロット入れ替え（DE 専用操作） |
| `src/components/division/DivisionSetup.tsx` / `DivisionSetup.test.tsx` | DE の setup 画面 |
| `src/components/division/MatchingSection.tsx` / `MatchingSection.test.tsx` | `DivisionSetup` 専用の組み合わせ節 |
| `src/features/division/single-elimination/view.ts` / `view.test.ts` | `toSetupView`。`DivisionSetup` 専用 |

変更するファイル:

| パス | 変更の主旨 |
| --- | --- |
| `prisma/schema.prisma` | `DivisionFormat` を 2 値にする |
| `prisma/migrations/<新規>/migration.sql` | DE 部門を削除し enum 型を作り直す |
| `src/features/division/matching-strategy.ts` | DE 分岐と `SlotBracketFormat` 抽象を削除 |
| `src/features/division/single-elimination/edit.ts` | `swapSlots` を削除（`generateSlots` / `placeEntry` は残す） |
| `src/features/division/format.ts` | ラベルと `needsParticipants` を 2 形式に |
| `src/features/bracket/from-division.ts` | `BRACKET_FORMATS` を 1 要素にし、`singleElimination` フラグを畳む |
| `src/lib/division/label.ts` | `matchPositionLabel` を `match.bracket` 起点に一本化 |
| `src/components/division/DivisionDetail.tsx` | `SETUP_LINKS` を 2 形式に |
| `src/components/division/DivisionMatchingView.tsx` | `switch` から DE を削除 |
| `src/components/print/PrintDivisionSection.tsx` | 同上 |
| `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.tsx` | 三項分岐を `BracketEditorSetup` 一本に |
| 各テスト | 下記タスク内に列挙 |

コメントだけ直すファイル: `src/lib/division/{types,parse,resolve}.ts`、`src/features/schedule/result-rows.ts`、`src/components/tournament/SectionNode.tsx`、`src/features/division/first-round-store.ts`、`src/components/division/BracketEditorSetup.tsx`。

---

### Task 1: 編集経路から DE を外し、到達不能になる画面とスライスを削除する

このタスクでは **`prisma/schema.prisma` を触らない**。enum にはまだ DE の値が残っている。
`Record<DivisionFormat, …>` を持つ `format.ts` / `DivisionDetail.tsx` と、`DivisionFormat` を
網羅する `switch` は Task 2 で扱う。ここで触ると型エラーになる。

**Files:**
- Delete: `src/features/division/double-elimination/build.ts`, `build.test.ts`
- Delete: `src/features/division/swap-slots/` （`handler.ts` `handler.test.ts` `usecase.ts` `repository.ts` `repository.test.ts` `schema.ts` `schema.test.ts`）
- Delete: `src/components/division/DivisionSetup.tsx`, `DivisionSetup.test.tsx`
- Delete: `src/components/division/MatchingSection.tsx`, `MatchingSection.test.tsx`
- Delete: `src/features/division/single-elimination/view.ts`, `view.test.ts`
- Modify: `src/features/division/matching-strategy.ts`
- Modify: `src/features/division/single-elimination/edit.ts`
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.tsx`
- Test: `src/features/division/matching-strategy.test.ts`
- Test: `src/features/division/single-elimination/edit.test.ts`
- Test: `src/features/division/{add-entry,remove-entry,reorder-entry,generate-matching,set-match-name}/repository.test.ts`
- Test: `src/features/division/remove-entry/handler.test.ts`
- Test: `src/features/division/setup-store.test.ts`, `first-round-store.test.ts`
- Test: `src/features/bracket/from-division.test.ts`
- Test: `src/components/division/DivisionBracket.test.tsx`
- Test: `src/components/print/PrintBracket.test.tsx`
- Test: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.test.tsx`

**Interfaces:**
- Produces（Task 2 以降が前提にする）:
  - `export const EDITABLE_FORMATS = ["SINGLE_ELIMINATION", "ROUND_ROBIN"] as const satisfies readonly DivisionFormat[];`
  - `export type EditableFormat = (typeof EDITABLE_FORMATS)[number];`
  - `export const isEditableFormat: (format: DivisionFormat) => format is EditableFormat;`
  - `export const maxEntries: (format: EditableFormat) => number;`（SE 128 / RR 16）
  - `export const minEntries: (format: EditableFormat) => number;`（SE 2 / RR 2）
  - `export const regenerateMatching: (format: EditableFormat, entries: DivisionEntry[]) => MatchingConfig;`
  - `export const applyEntryAdded: (format: EditableFormat, current: MatchingConfig, entries: DivisionEntry[], addedEntryId: string) => MatchingConfig;`
  - `export const applyEntryReordered: (format: EditableFormat, current: MatchingConfig, entries: DivisionEntry[]) => MatchingConfig;`
  - `matching-strategy.ts` から `SlotBracketFormat` / `isSlotBracketFormat` / `buildSlotBracket` / `matchesSlotBracketShape` は **エクスポートされなくなる**
  - `src/features/division/single-elimination/edit.ts` は `generateSlots` / `placeEntry` のみをエクスポートする

- [ ] **Step 1: DE 専用のファイルとディレクトリを削除する**

```bash
git rm -r src/features/division/double-elimination
git rm -r src/features/division/swap-slots
git rm src/components/division/DivisionSetup.tsx src/components/division/DivisionSetup.test.tsx
git rm src/components/division/MatchingSection.tsx src/components/division/MatchingSection.test.tsx
git rm src/features/division/single-elimination/view.ts src/features/division/single-elimination/view.test.ts
```

- [ ] **Step 2: `matching-strategy.ts` を書き換える**

`src/features/division/matching-strategy.ts` の中身を次で置き換える（ファイル全体）。

```ts
import type { DivisionFormat } from "@/generated/prisma/enums";
import type { DivisionEntry, MatchingConfig } from "@/lib/division/types";
import { buildRoundRobin } from "./round-robin/build";
import {
  buildFromSlots,
  isSingleEliminationShape,
  toSlots,
} from "./single-elimination/build";
import { generateSlots, placeEntry } from "./single-elimination/edit";

/**
 * エントリー・組み合わせの編集画面を持つ形式。setup-store の読み出しが
 * これで弾くため、ここに無い形式へは Server Action からも書き込めない。
 */
export const EDITABLE_FORMATS = [
  "SINGLE_ELIMINATION",
  "ROUND_ROBIN",
] as const satisfies readonly DivisionFormat[];

export type EditableFormat = (typeof EDITABLE_FORMATS)[number];

export const isEditableFormat = (
  format: DivisionFormat,
): format is EditableFormat =>
  (EDITABLE_FORMATS as readonly DivisionFormat[]).includes(format);

/**
 * 部門あたりのエントリー上限。
 *
 * リーグは試合数が n(n-1)/2 で増えるため、トーナメントと同じ 128 人だと
 * 8128 試合の Json と一覧が生まれる。1 つのリーグとして現実に回せる
 * 人数で切り、それ以上は部門を分けて並行リーグにする運用に倒す。
 *
 * Record のキーを EditableFormat に固定しているので、対応形式を足して
 * 上限を書き忘れるとコンパイルエラーになる。
 */
const MAX_ENTRIES: Record<EditableFormat, number> = {
  SINGLE_ELIMINATION: 128,
  ROUND_ROBIN: 16,
};

export const maxEntries = (format: EditableFormat): number =>
  MAX_ENTRIES[format];

/** 組み合わせを作るのに必要なエントリー数。 */
const MIN_ENTRIES: Record<EditableFormat, number> = {
  SINGLE_ELIMINATION: 2,
  ROUND_ROBIN: 2,
};

export const minEntries = (format: EditableFormat): number =>
  MIN_ENTRIES[format];

/**
 * 円卓法の組み合わせを上限内でだけ組み立てる。
 *
 * /edit は format を無条件に書き換えられるため、128 人のトーナメントを
 * ROUND_ROBIN にした部門が、生成ボタンを一度も押さないまま残ることがある。
 * 並べ替え・削除はどちらも生成ボタンを経由せずここへ来るので、ここで
 * 弾かないと 8128 試合ぶんの Json が黙って書き込まれてしまう。上限超過
 * なら空を返す。空にしておけば、エントリーを減らして上限内に戻したあと
 * 通常どおり生成し直せる（運営者を詰ませない）。
 */
const buildRoundRobinWithinCap = (entries: DivisionEntry[]): MatchingConfig =>
  entries.length > MAX_ENTRIES.ROUND_ROBIN
    ? { version: 1, matches: [] }
    : buildRoundRobin(entries);

/**
 * エントリーのシード順から組み合わせを丸ごと作り直す。
 * 必要人数に満たなければどちらの形式でも空を返す（トーナメントは
 * buildFromSlots 自身が、リーグは buildRoundRobin が空を返す）。
 */
export const regenerateMatching = (
  format: EditableFormat,
  entries: DivisionEntry[],
): MatchingConfig => {
  switch (format) {
    case "SINGLE_ELIMINATION":
      return buildFromSlots(generateSlots(entries));
    case "ROUND_ROBIN":
      return buildRoundRobinWithinCap(entries);
  }
};

/**
 * エントリーを 1 人足したあとの組み合わせ。
 *
 * トーナメントは 1 回戦のスロットに「一番下の bye を埋める」だけで既存の
 * 対戦カードが残る。リーグには対応する操作が無い（1 人増えれば全員の試合が
 * 1 つずつ増え、円卓法の割り当ても全部ずれる）ので丸ごと作り直す。
 *
 * 組み合わせが未作成のときは空のままにする。エントリーを足しただけで
 * 対戦表が生えると、生成を押していない運営者を驚かせる。
 */
export const applyEntryAdded = (
  format: EditableFormat,
  current: MatchingConfig,
  entries: DivisionEntry[],
  addedEntryId: string,
): MatchingConfig => {
  if (current.matches.length === 0) {
    return current;
  }

  switch (format) {
    case "SINGLE_ELIMINATION":
      // /edit は format を無条件に書き換えられるため、リーグの星取表を
      // 持ったまま SINGLE_ELIMINATION になった部門が存在しうる。その星取表は
      // toSlots で 1 回戦だけ取り出して buildFromSlots に通すと 2 節目以降が
      // 消える（奇数人なら休みの 1 人がそのまま行方不明になる）。この画面が
      // 読めない形の組み合わせを部分編集で書き換えてはいけないので、
      // 触らず current をそのまま返す。参照を変えずに返すことで
      // 「rebuild this」の案内が消えずに残り、それが運営者の逃げ道になる。
      // 同じ参照を返すのは、呼び出し側が参照比較で「作り直したか」を
      // 判別するため（regenerated フラグが正しく false になる）。
      if (!isSingleEliminationShape(current)) {
        return current;
      }
      return buildFromSlots(placeEntry(toSlots(current), addedEntryId));
    case "ROUND_ROBIN":
      return buildRoundRobin(entries);
  }
};

/**
 * シード順を入れ替えたあとの組み合わせ。
 *
 * トーナメントは触らない（反映したければ運営者が「生成」を押す）。
 * リーグの割り当てはシード順から決まるので、触らないと画面の
 * 「エントリー」と「対戦表」が食い違ったままになる。作り直す。
 */
export const applyEntryReordered = (
  format: EditableFormat,
  current: MatchingConfig,
  entries: DivisionEntry[],
): MatchingConfig => {
  if (current.matches.length === 0) {
    return current;
  }

  switch (format) {
    case "SINGLE_ELIMINATION":
      return current;
    case "ROUND_ROBIN":
      return buildRoundRobinWithinCap(entries);
  }
};
```

- [ ] **Step 3: `single-elimination/edit.ts` から `swapSlots` を削除する**

`src/features/division/single-elimination/edit.ts` の `export const swapSlots = (` から
その関数の閉じ括弧までと、直前の JSDoc コメントを削除する。`generateSlots` と
`placeEntry` は残す。削除後に `swapSlots` の語がファイルに残っていないことを確認する。

```bash
grep -n "swapSlots" src/features/division/single-elimination/edit.ts
```
Expected: 出力なし

- [ ] **Step 4: `edit.test.ts` から `swapSlots` のテストを削除する**

`src/features/division/single-elimination/edit.test.ts` の
`describe("swapSlots", () => { … });` ブロック全体（93 行目付近から）を削除し、
1 行目の import を次にする。

```ts
import { generateSlots, placeEntry } from "./edit";
```

- [ ] **Step 5: setup ページを `BracketEditorSetup` 一本にする**

`src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.tsx`:

import からこの 7 行を削除する。

```ts
import { DivisionSetup } from "@/components/division/DivisionSetup";
import { addEntryAction } from "@/features/division/add-entry/handler";
import { isSlotBracketFormat } from "@/features/division/matching-strategy";
import { removeEntryAction } from "@/features/division/remove-entry/handler";
import { reorderEntryAction } from "@/features/division/reorder-entry/handler";
import { swapSlotsAction } from "@/features/division/swap-slots/handler";
import { setPlayerNumberAction } from "@/features/participant/set-player-number/handler";
```

読み出しのコメントとガードを差し替える。

```ts
  // 詳細ページと違い、参加者とメンバーを常に引く。この画面は
  // シングルエリミネーションを編集するために開くもので、どちらも必ず使うため。
```

```ts
  // リーグには専用画面（/league）がある。案内を出すより 404 に倒す。
  if (division.format !== "SINGLE_ELIMINATION") {
    notFound();
  }
```

三項分岐（`{division.format === "SINGLE_ELIMINATION" ? ( … ) : ( … )}`）を
`BracketEditorSetup` の呼び出しだけに置き換える。

```tsx
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
```

- [ ] **Step 6: setup ページのテストから DE のケースを削除する**

`src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.test.tsx`:

- `it("ダブルエリミネーションも 404 にせず描く", …)`（226 行目付近）を削除
- `it("7 つの Server Action をそれぞれ対応する actions のプロパティに渡す（ダブルエリミネーション）", …)`（251 行目付近）を削除
- `it("シングルエリミは BracketEditorSetup に 6 つのアクションを渡す", …)`（275 行目付近）は残す
- `it("リーグは 404 に倒す", …)` は残す
- ファイル冒頭の `vi.mock` / import から `DivisionSetup`、`swap-slots/handler`、
  `add-entry/handler`、`remove-entry/handler`、`reorder-entry/handler`、
  `set-player-number/handler` への参照が残っていれば削除する

削除後、DE への参照が無いことを確認する。

```bash
grep -rn "DOUBLE_ELIM\|DivisionSetup\|swap-slots" "src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.test.tsx"
```
Expected: 出力なし

- [ ] **Step 7: `matching-strategy.test.ts` を書き換える**

`src/features/division/matching-strategy.test.ts` を次のとおり直す。

import を置き換える（`buildDoubleElimination` と畳んだ 3 つを外す）。

```ts
import { describe, expect, it } from "vitest";
import type { DivisionEntry, MatchingConfig } from "@/lib/division/types";
import {
  applyEntryAdded,
  applyEntryReordered,
  isEditableFormat,
  maxEntries,
  minEntries,
  regenerateMatching,
} from "./matching-strategy";
import { buildRoundRobin } from "./round-robin/build";
import { buildFromSlots } from "./single-elimination/build";
import { generateSlots } from "./single-elimination/edit";
```

`describe("isEditableFormat")` を置き換える。

```ts
describe("isEditableFormat", () => {
  it("全形式が編集画面を持つ", () => {
    expect(isEditableFormat("SINGLE_ELIMINATION")).toBe(true);
    expect(isEditableFormat("ROUND_ROBIN")).toBe(true);
  });
});
```

`describe("maxEntries")` に下限も確かめる `it` を足す（DE の `describe` から
「形式ごとに上限・下限が違う」という意図だけを引き継ぐ）。

```ts
  it("どちらの形式も下限は 2 人", () => {
    expect(minEntries("SINGLE_ELIMINATION")).toBe(2);
    expect(minEntries("ROUND_ROBIN")).toBe(2);
  });
```

次の 3 つの `describe` をブロックごと削除する。

- `describe("maxEntries / minEntries（ダブルエリミネーション）", …)`（210 行目付近）
- `describe("ダブルエリミネーションの組み合わせ", …)`（224 行目付近）
- `describe("スロット型ブラケットのディスパッチ", …)`（306 行目付近）

残る `describe("regenerateMatching")` / `describe("applyEntryAdded")` /
`describe("applyEntryReordered")` は SE と RR のケースしか持たないのでそのまま。

- [ ] **Step 8: DE を素材に使っていた他のテストを SE / RR に付け替える**

`add-entry` / `remove-entry` / `reorder-entry` の各 `repository.test.ts` は、
「シングルエリミはこの経路では編集しない（1 回戦スライスで組む）ため、
汎用の振る舞いはダブルエリミ・リーグで確かめる」という理由で **DE を汎用の素材に
使っていた**。DE が消えると、この 3 スライスが実際に動くのは `ROUND_ROBIN` だけになる
（`SINGLE_ELIMINATION` は repository の先頭で早期 return する）。
**ケースを消すのではなく `ROUND_ROBIN` に付け替えて、カバレッジを落とさないこと。**

`src/features/division/add-entry/repository.test.ts`:

- 4 行目の `import { buildDoubleElimination } from "../double-elimination/build";` を削除
- 15-16 行目のコメントを次にする

```ts
// シングルエリミはこの経路では編集しない（1 回戦スライスで組む）ため、
// 汎用の振る舞いはリーグで確かめる。
```

- 48 行目の fixture の形式を `ROUND_ROBIN` にする

```ts
const empty = {
  format: "ROUND_ROBIN" as const,
  entries: { version: 1, entries: [] },
  matchingConfig: { version: 1, matches: [] },
  results: { version: 1, matches: [] },
};
```

- `it("組み合わせがあれば一番下の bye を埋める", …)`（174 行目付近）は
  DE の勝者側ブラケット前提の振る舞い。`it("リーグは組み合わせがあると丸ごと作り直す", …)`
  （337 行目付近）が同じ経路を `ROUND_ROBIN` で見ているので、**削除**する
- `it("ダブルエリミは 64 人に達していたら拒否する", …)`（242 行目付近）は
  `it("リーグは 16 人を超える追加を拒否する", …)`（265 行目付近）と同じ主張なので **削除**
- `it("ダブルエリミは 16 人でも追加できる", …)`（288 行目付近）は「リーグの上限が
  他の形式に漏れない」ことの確認。`SINGLE_ELIMINATION` は早期 return するので
  同じ形では書けない。**削除**し、代わりに `maxEntries` のテスト
  （Step 7 で `matching-strategy.test.ts` に残したもの）に任せる
- `it("シングルエリミでは何もしない（1 回戦スライスで編集する）", …)`（317 行目付近）は **残す**
- 146 行目・225 行目付近に直書きされている `format: "DOUBLE_ELIMINATION_GRAND_FINAL"`
  （`it("エントリーを末尾の seed で足す")` と `it("同じ参加者の二重エントリーを拒否する")`）を
  `format: "ROUND_ROBIN"` にする。どちらも `matchingConfig` が空のケースなので、
  `applyEntryAdded` が早期 return し期待値は変わらない
- 上の付け替えで参照されなくなる `entry` / `bye` ヘルパや `buildFromSlots` の import が
  あれば削除する（Biome の未使用チェックで出る）

`src/features/division/remove-entry/repository.test.ts`:

- 3 行目の `buildDoubleElimination` の import を削除
- 12 行目のコメントを `// 汎用の振る舞いはリーグで確かめる。` にする
- 58 / 81 / 154 / 173 行目付近の `format: "DOUBLE_ELIMINATION_GRAND_FINAL"` を
  `format: "ROUND_ROBIN"` にし、`buildDoubleElimination(…)` を使っている期待値を
  `buildRoundRobin(entries)` に置き換える（`import { buildRoundRobin } from "../round-robin/build";`）
- `it("ダブルエリミネーションは残りが形式の下限（3人）を下回ったら組み合わせを空にする", …)`
  （123 行目付近）は DE の下限 3 に依存する。`it("リーグでも残りが 2 人未満なら組み合わせを空にする", …)`
  （313 行目付近）が同じ `cleared` 経路を見ているので **削除**
- `it("ダブルエリミネーションの上限を超えたエントリーが残っていれば、削除しても組み合わせは空のまま", …)`
  （276 行目付近）は `it("リーグの上限を超えたエントリーが残っていれば…", …)`（241 行目付近）と
  同じ `clearedOverCap` 経路なので **削除**
- `it("シングルエリミでは何もしない（1 回戦スライスで編集する）", …)`（106 行目付近）は **残す**

`src/features/division/reorder-entry/repository.test.ts`:

- 10 行目のコメントを `// 汎用の振る舞いはリーグで確かめる。` にする
- 42 / 262 行目付近の `format: "DOUBLE_ELIMINATION_GRAND_FINAL"` を `"ROUND_ROBIN"` にする
- `it("ダブルエリミは並べ替えても組み合わせを作り直さない", …)`（69 行目付近）と
  `it("組み合わせには手を触れない（ダブルエリミ）", …)`（94 行目付近）は、
  `applyEntryReordered` の「トーナメントは触らない」枝を見ている。
  `SINGLE_ELIMINATION` は repository が早期 return するため同じ形では書けない。
  **削除**する（`matching-strategy.test.ts` の
  `it("トーナメントは組み合わせに触らない", …)` が同じ振る舞いを直接見ている）
- `it("シングルエリミでは何もしない（1 回戦スライスで編集する）", …)`（124 行目付近）は **残す**

`src/features/division/generate-matching/repository.test.ts`:

- `it("ダブルエリミネーションは 3 人未満なら拒否する", …)`（118 行目付近）を **削除**
  （形式ごとの下限が 2 だけになり、`SINGLE_ELIMINATION` / `ROUND_ROBIN` の
  「2 人未満なら拒否する」ケースが既にある）

`src/features/division/set-match-name/repository.test.ts`:

- `it("ダブルエリミネーションの部門でも試合名を変えられる", …)`（164 行目付近）の
  `format` を `"ROUND_ROBIN"` にし、`it` の名前を
  `it("リーグの部門でも試合名を変えられる", …)` にする（形式に依らないことの確認なので残す）

`src/features/division/remove-entry/handler.test.ts`:

- `it("ダブルエリミネーションでは形式の下限（3人）で文言を出す", …)`（125 行目付近）を **削除**
- `it("ダブルエリミネーションでも同じ文言で形式の上限（64人）を伝える", …)`（167 行目付近）の
  形式を `"ROUND_ROBIN"` に、上限を 16 に、`it` の名前を
  `it("リーグでも同じ文言で形式の上限（16人）を伝える", …)` にする。
  同趣旨の既存ケースと重複するなら削除してよい
- 146 行目付近のコメント「/edit で切り替わった直後の部門（リーグに限らずダブルエリミも）が」から
  DE への言及を外す

`src/features/division/setup-store.test.ts`:

- `it("ダブルエリミネーションも編集できる形式なので mutate を呼び、形式を渡す", …)`（86 行目付近）を **削除**
  （直前に `ROUND_ROBIN` の同じケースがある）

`src/features/division/first-round-store.test.ts`:

- 57 行目の `row({ format: "DOUBLE_ELIMINATION_GRAND_FINAL" })` を
  `row({ format: "ROUND_ROBIN" })` にする（`it("SE 以外は mutate を呼ばず found: false", …)` の素材）

`src/features/bracket/from-division.test.ts`:

- 2 行目の `buildDoubleElimination` の import を削除
- `it("ダブルエリミネーションは loserOf と bracket を保って変換する", …)`（413 行目付近）を **削除**
- `it("ダブルエリミネーションで存在しない試合の loserOf は null", …)`（448 行目付近）を **削除**
  （`SINGLE_ELIMINATION` では `loserOf` を含む時点で `null` を返すので、この分岐に届かない）
- 「敗者側の試合が混じった `SINGLE_ELIMINATION` は描かない」趣旨のケースがあれば **残す**

`src/components/division/DivisionBracket.test.tsx`:

- `buildDoubleElimination` / `generateSlots` の import を削除
- `it("ダブルエリミネーションは試合とセクションラベルを描く", …)`（251 行目付近）を **削除**
- `it("敗者復活を含む組み合わせは未対応として案内する", …)`（116 行目付近）は **残す**

`src/components/print/PrintBracket.test.tsx`:

- 14 行目の `buildDoubleElimination` の import を削除
- `it("ダブルエリミネーションは勝者側・敗者側・決勝を描き、線の本数は供給元の数と揃う", …)`
  （154 行目付近）を **削除**

- [ ] **Step 9: 型とテストを通す**

Run: `pnpm typecheck`
Expected: エラーなしで終了（exit 0）

型エラーが出たら、その場所が DE / 削除したファイルへの参照であることを確認して直す。
`Record<DivisionFormat, …>` や `DivisionFormat` の網羅 `switch` に関するエラーが出た場合は
**Task 2 の範囲**なので、ここでは触らずに Task 2 まで残してよいか判断する
（このタスクの変更だけなら enum は無傷なので、本来この種のエラーは出ない）。

Run: `pnpm test`
Expected: 全テスト PASS

Run: `pnpm lint`
Expected: 自分が変更したファイルに指摘が無いこと

- [ ] **Step 10: 残存参照を確かめる**

```bash
grep -rn "double-elimination\|buildDoubleElimination\|isSlotBracketFormat\|buildSlotBracket\|matchesSlotBracketShape\|swap-slots\|swapSlots\|toSetupView\|MatchingSection\|DivisionSetup\b" src --include=*.ts --include=*.tsx
```
Expected: `DivisionSetup` は `LeagueSetup.tsx` / `MatchNameSection.tsx` などのコメント内の
言及だけ（Task 3 で直す）。それ以外の名前は 1 件も出ないこと。

- [ ] **Step 11: コミット**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(division): drop the double-elimination editing path

DE 専用だった組み合わせ生成・1 回戦入れ替え・setup 画面を削除し、
SlotBracketFormat の抽象を畳む。setup ページは BracketEditorSetup 一本になる。
DB の enum はまだ触っていない。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: enum を削除し、表示側の形式ディスパッチを 2 形式に絞る

`Record<DivisionFormat, …>` と `DivisionFormat` の網羅 `switch` は、enum が縮むのと
同時にしか直せない。スキーマ・マイグレーション・表示側をひとまとめにする。

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_remove_double_elimination/migration.sql`
- Modify: `src/features/division/format.ts`
- Modify: `src/components/division/DivisionDetail.tsx`
- Modify: `src/components/division/DivisionMatchingView.tsx`
- Modify: `src/components/print/PrintDivisionSection.tsx`
- Modify: `src/features/bracket/from-division.ts`
- Modify: `src/lib/division/label.ts`
- Test: `src/features/division/format.test.ts`
- Test: `src/lib/division/label.test.ts`
- Test: `src/components/division/DivisionDetail.test.tsx`, `DivisionList.test.tsx`
- Test: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/page.test.tsx`
- Test: `src/app/t/[tournamentId]/divisions/[divisionId]/page.test.tsx`

**Interfaces:**
- Consumes: Task 1 の `matching-strategy.ts`（`EditableFormat` が 2 値であること）
- Produces:
  - `DivisionFormat` は `"SINGLE_ELIMINATION" | "ROUND_ROBIN"`
  - `export const DIVISION_FORMAT_LABELS: Record<DivisionFormat, string>;`（2 エントリー）
  - `export const DIVISION_FORMATS: DivisionFormat[];`（`["SINGLE_ELIMINATION", "ROUND_ROBIN"]`）
  - `export const needsParticipants: (format: DivisionFormat) => boolean;`
  - `export const matchPositionLabel: (match: BracketMatch, format: DivisionFormat) => string;`（シグネチャ不変）

- [ ] **Step 1: 適用前の DB を記録する**

```bash
node -e "const {Pool}=require('./node_modules/.pnpm/pg@8.23.0/node_modules/pg');require('dotenv').config();const p=new Pool({connectionString:process.env.DATABASE_URL});p.query('SELECT format, count(*)::int FROM \"Division\" GROUP BY format ORDER BY 1').then(r=>{console.log(r.rows);return p.end()})"
```
Expected: `SINGLE_ELIMINATION` / `DOUBLE_ELIMINATION_GRAND_FINAL` / `ROUND_ROBIN` の件数が出る。
DE の件数を控えておく（Step 5 の確認に使う）。

- [ ] **Step 2: スキーマの enum を 2 値にする**

`prisma/schema.prisma` の `enum DivisionFormat` を置き換える。

```prisma
enum DivisionFormat {
  /// シングルエリミネーション
  SINGLE_ELIMINATION
  /// リーグ（総当たり）
  ROUND_ROBIN
}
```

- [ ] **Step 3: マイグレーションの雛形を作る**

Run: `pnpm exec prisma migrate dev --create-only --name remove_double_elimination`
Expected: `prisma/migrations/<timestamp>_remove_double_elimination/migration.sql` が作られる。
enum 値の削除は破壊的変更なので警告が出るが、`--create-only` なので適用はされない。

- [ ] **Step 4: マイグレーション SQL を書き換える**

生成された `migration.sql` の中身を次で置き換える。`DELETE` が型の入れ替えより
**先**にあること。順番を逆にすると `USING` のキャストが DE の行で失敗して全体が落ちる。

```sql
-- ダブルエリミネーション形式を廃止する。
-- 該当部門は行ごと消す（ScheduleItem は FK の ON DELETE CASCADE で追従する）。
-- PostgreSQL は enum 値を直接 DROP できないため型を作り直す。

DELETE FROM "Division"
 WHERE "format" IN ('DOUBLE_ELIMINATION_GRAND_FINAL', 'DOUBLE_ELIMINATION_THIRD_PLACE');

CREATE TYPE "DivisionFormat_new" AS ENUM ('SINGLE_ELIMINATION', 'ROUND_ROBIN');
ALTER TABLE "Division" ALTER COLUMN "format"
  TYPE "DivisionFormat_new" USING ("format"::text::"DivisionFormat_new");
ALTER TYPE "DivisionFormat" RENAME TO "DivisionFormat_old";
ALTER TYPE "DivisionFormat_new" RENAME TO "DivisionFormat";
DROP TYPE "DivisionFormat_old";
```

- [ ] **Step 5: マイグレーションを適用してクライアントを作り直す**

Run: `pnpm exec prisma migrate dev`
Expected: 新しいマイグレーションが適用され、`prisma generate` まで走る。

Run（再確認）:
```bash
node -e "const {Pool}=require('./node_modules/.pnpm/pg@8.23.0/node_modules/pg');require('dotenv').config();const p=new Pool({connectionString:process.env.DATABASE_URL});p.query('SELECT format, count(*)::int FROM \"Division\" GROUP BY format ORDER BY 1').then(r=>{console.log(r.rows);return p.end()})"
```
Expected: `SINGLE_ELIMINATION` と `ROUND_ROBIN` だけが出る。件数は Step 1 と同じ（DE の行だけが消えている）。

```bash
grep -n "DOUBLE_ELIM" src/generated/prisma/enums.ts
```
Expected: 出力なし

- [ ] **Step 6: `format.ts` から DE を外す**

`src/features/division/format.ts` の 2 つの `Record` を置き換える。

```ts
export const DIVISION_FORMAT_LABELS: Record<DivisionFormat, string> = {
  SINGLE_ELIMINATION: "シングルエリミネーション",
  ROUND_ROBIN: "リーグ（総当たり）",
};
```

```ts
const USES_PARTICIPANTS: Record<DivisionFormat, boolean> = {
  SINGLE_ELIMINATION: true,
  ROUND_ROBIN: true,
};
```

- [ ] **Step 7: `format.test.ts` の固定値を直す**

`src/features/division/format.test.ts`:

```ts
  it("DIVISION_FORMATS の並び順はスキーマの宣言順そのもの", () => {
    // ソートせず順序まで固定する。ここを手書きの配列に戻したり、
    // アルファベット順などに並べ替えたりする変更を検出するため、
    // 期待値はスキーマの宣言順を書き写した固定値にする(実装からの逆算にしない)。
    expect(DIVISION_FORMATS).toEqual(["SINGLE_ELIMINATION", "ROUND_ROBIN"]);
  });
```

```ts
describe("needsParticipants", () => {
  it("参加者一覧が要るのはブラケットと結果表を描く全形式", () => {
    expect(needsParticipants("SINGLE_ELIMINATION")).toBe(true);
    expect(needsParticipants("ROUND_ROBIN")).toBe(true);
  });
});
```

- [ ] **Step 8: `DivisionDetail.tsx` の `SETUP_LINKS` を 2 形式にする**

`src/components/division/DivisionDetail.tsx`:

```ts
const SETUP_LINKS: Record<
  DivisionFormat,
  { segment: string; label: string } | null
> = {
  SINGLE_ELIMINATION: { segment: "setup", label: "エントリー・組み合わせ" },
  ROUND_ROBIN: { segment: "league", label: "エントリー・対戦表" },
};
```

- [ ] **Step 9: 描画・印刷の `switch` から DE を外す**

`src/components/division/DivisionMatchingView.tsx`: `case "SINGLE_ELIMINATION":` の直後に
続く 2 つの DE の `case` 行を削除する（`case "SINGLE_ELIMINATION":` と `return (` が
隣り合う形にする）。末尾の `default:` と `const exhaustive: never` は残す。

`src/components/print/PrintDivisionSection.tsx`: 同じく DE の `case` 行 2 本を削除する。

- [ ] **Step 10: `from-division.ts` のブラケット形式判定を畳む**

`src/features/bracket/from-division.ts`:

```ts
/** ブラケットとして描ける形式。リーグは星取表（LeagueResultTable）で描く。 */
const BRACKET_FORMATS: readonly DivisionFormat[] = ["SINGLE_ELIMINATION"];
```

90 行目付近の `const singleElimination = input.format === "SINGLE_ELIMINATION";` を削除し、
122 / 126 行目付近のガードを無条件にする。

```ts
    // ブラケットは勝ち上がり木として描く。敗者側の試合があるのは
    // 形式を書き換えた部門などの不整合。描けないので描かない。
    if (source.bracket !== "winners") {
      return null;
    }
    for (const slot of source.slots) {
      if (slot.kind === "loserOf") {
        return null;
      }
```

`(slot.kind === "winnerOf" || slot.kind === "loserOf") && !matchIds.has(slot.matchId)`
の条件はそのまま残す（`loserOf` は上で弾かれるが、参照検証の意図を保つ）。

- [ ] **Step 11: `matchPositionLabel` を `match.bracket` 起点に一本化する**

enum が 2 値になると、`SINGLE_ELIMINATION` を先に返す今の形では後半の
`switch (match.bracket)` に到達しなくなる。`losers` / `final` を持つ Json を
読んだときの文言は残す方針なので、`bracket` で分ける形にまとめる。
`winners` の戻り値は今の `SINGLE_ELIMINATION` と同じ文字列にすること。

`src/lib/division/label.ts`:

```ts
/**
 * 「2回戦 (1)」のような、部門の中での位置を表す 1 行。
 *
 * 「第 N 試合」と書かないのは、試合名の既定値（第{{OverallSeq}}試合）と同じ形に
 * なり、大会の通し番号と取り違えるため。括弧の数字はラウンド内の上からの位置
 * （order + 1）で、試合の番号ではない。
 *
 * リーグは節も回戦も持たないので位置の文言を出さない（空文字）。表示側は
 * formatDivisionPosition を通して、空文字なら区切りごと描かない。
 *
 * losers / final は現在の組み合わせ生成では作られないが、それらを持つ Json を
 * 読んだときに回戦が嘘にならないよう書き分けを残してある。round は全ブラケット
 * 通しの番号（敗者側 L は L + 1）で保存されている。
 *
 * 形式を引数に取るのは、この関数が大会の進行順（複数の部門が混ざる）でも
 * 使われるため。呼び出し側がその試合の部門の形式を知っている。
 */
export const matchPositionLabel = (
  match: BracketMatch,
  format: DivisionFormat,
): string => {
  if (format === "ROUND_ROBIN") {
    return "";
  }
  switch (match.bracket) {
    case "winners":
      return `${match.round}回戦 (${match.order + 1})`;
    case "losers":
      return `敗者側${match.round - 1}回戦 (${match.order + 1})`;
    case "final":
      return "決勝";
  }
};
```

- [ ] **Step 12: `label.test.ts` の DE ケースを差し替える**

`src/lib/division/label.test.ts` の
`it("ダブルエリミネーションはブラケットごとの回戦で表す", …)`（125 行目付近）を置き換える。

```ts
    it("敗者側・決勝の試合はブラケット名を付けて表す", () => {
      // 現在の生成では作られないが、これらを持つ Json を読んでも
      // 「2回戦」のような嘘にならないことを固定する。
      expect(
        matchPositionLabel(
          { ...match, bracket: "losers", round: 3, order: 0 },
          "SINGLE_ELIMINATION",
        ),
      ).toBe("敗者側2回戦 (1)");
      expect(
        matchPositionLabel(
          { ...match, bracket: "final", round: 6, order: 0 },
          "SINGLE_ELIMINATION",
        ),
      ).toBe("決勝");
    });
```

`it("トーナメントは「N回戦 (ラウンド内の位置)」で表す", …)` と
`it("リーグは位置の文言を出さない", …)` はそのまま残す。

- [ ] **Step 13: 残りのテストから DE の値を外す**

`src/components/division/DivisionDetail.test.tsx`:
- `it("ダブルエリミネーションも /setup へ送る", …)`（43 行目付近）を **削除**

`src/components/division/DivisionList.test.tsx`:
- 16 行目付近の `format: "DOUBLE_ELIMINATION_GRAND_FINAL"` を `"ROUND_ROBIN"` にする。
  ラベルを文字列で期待している箇所があれば `"リーグ（総当たり）"` に直す

`src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/page.test.tsx`:
- `it("ダブルエリミネーションもブラケット描画に参加者名を使うので参加者一覧を取得する", …)`
  （191 行目付近）を **削除**（`SINGLE_ELIMINATION` の同趣旨のケースがある）

`src/app/t/[tournamentId]/divisions/[divisionId]/page.test.tsx`:
- `it("ダブルエリミネーションもブラケット描画に参加者名を使うので参加者を引く", …)`
  （218 行目付近）を **削除**

- [ ] **Step 14: 型とテストを通す**

Run: `pnpm typecheck`
Expected: エラーなし

Run: `pnpm test`
Expected: 全テスト PASS

Run: `pnpm lint`
Expected: 自分が変更したファイルに指摘が無いこと

```bash
grep -rn "DOUBLE_ELIM" src prisma/schema.prisma
```
Expected: `prisma/migrations/` 以外は出力なし（マイグレーション SQL には
削除対象として文字列が残るのが正しい）

- [ ] **Step 15: コミット**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(division)!: remove DOUBLE_ELIMINATION from DivisionFormat

enum を 2 値に絞り、該当する部門はマイグレーションで行ごと削除する。
PostgreSQL は enum 値を DROP できないので型を作り直す。表示・印刷・
ラベルの形式ディスパッチも 2 形式に合わせる。

BREAKING CHANGE: DOUBLE_ELIMINATION_GRAND_FINAL と
DOUBLE_ELIMINATION_THIRD_PLACE の部門は削除される。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 残ったコメントの文言を直し、手で動かして確かめる

コードの振る舞いは変えない。「ダブルエリミのために用意した」と書いてある説明を、
「`losers` / `final` を持つ Json を読んだときのため」という今の理由に書き換える。

**Files:**
- Modify: `src/lib/division/types.ts`
- Modify: `src/lib/division/parse.ts`
- Modify: `src/lib/division/resolve.ts`
- Modify: `src/lib/division/parse.test.ts`
- Modify: `src/features/schedule/result-rows.ts`
- Modify: `src/components/tournament/SectionNode.tsx`
- Modify: `src/features/division/first-round-store.ts`
- Modify: `src/components/division/BracketEditorSetup.tsx`

**Interfaces:**
- Consumes: Task 1 / Task 2 の完了状態
- Produces: なし（コメントのみ）

- [ ] **Step 1: `types.ts` の 2 か所を直す**

`src/lib/division/types.ts` の `BracketSide`:

```ts
/**
 * 試合がどのブラケットに属するか。現在の組み合わせ生成が作るのは "winners" だけ。
 * "losers" / "final" は、それらを持つ既存の Json を読めるように残してある。
 */
export type BracketSide = "winners" | "losers" | "final";
```

`MatchScoreEntry.entryId` のコメント（88 行目付近）から、削除した `swap-slots`
スライスへの言及を外す。

```ts
  /**
   * DivisionEntry.id。スロット番号（0/1）で持たないのは、スロットの
   * 割り当てが変わったときに採点が別人に付け替わってしまうため。
   */
```

- [ ] **Step 2: `parse.ts` の並び順のコメントを直す**

`src/lib/division/parse.ts` の `BRACKET_RANK` と `sortByPosition` の説明
（203 行目・211 行目付近）から DE への言及を外す。

```ts
/** ブラケットの並び。勝者側 → 敗者側 → 決勝。 */
```

```ts
/**
 * ブラケット（勝者側 → 敗者側 → 決勝）→ round → order の順に並べる。
 *
 * Json の配列順は当てにできない（旧データは部門内の並べ替えで sequence 順に
 * 並んでいる）ので、読み出しで構造上の順に揃える。下流（試合名の一覧、
 * 進行順に行を持たない試合の末尾追加）は並べ直さずに配列の順を読む。
 *
 * ブラケットを先に見るのは losers / final を持つ Json のため。round は
 * 全ブラケット通しの番号（敗者側 L は L + 1）で保存されているので、round だけで
 * 並べると勝者側と敗者側が交互に混ざり、通し番号も飛び飛びになる。現在の
 * 生成が作る組み合わせは全試合が winners なので並びは変わらない。
 */
```

`src/lib/division/parse.test.ts` の 272 行目付近のコメント
「ダブルエリミの round は全ブラケット通し（敗者側 L1 は round 2）。」から
DE の語を外す（「round は全ブラケット通し（敗者側 L1 は round 2）。」）。
256 行目の `it("ブラケットは勝者側 → 敗者側 → 決勝の順に並べる", …)` は名前も中身もそのまま。

- [ ] **Step 3: `resolve.ts` と `result-rows.ts` のコメントを直す**

`src/lib/division/resolve.ts` の 88-89 行目付近:

```ts
        // BYE を含む試合は不戦勝なので敗者が生まれない。loserOf のスロットが
        // pending のまま止まらないよう、空き枠として扱う。
```

`src/features/schedule/result-rows.ts` の 165-167 行目付近:

```ts
    // 確定しているスロットは参加者名で呼ぶ。未確定は組み合わせ上の表記
    // （「第3試合の勝者」）を使う。BYE は、元のスロット定義が loserOf 等でも
    // （BYE の伝播で空き枠になった場合を含め）実際に立っているのは BYE なので、
    // "BYE" 固定で表示する。
```

- [ ] **Step 4: `SectionNode.tsx` のコメントを直す**

`src/components/tournament/SectionNode.tsx` の 4 行目:

```tsx
/** ブラケットの「勝者側」「敗者側」「決勝」の見出し。 */
```

- [ ] **Step 5: `first-round-store.ts` と `BracketEditorSetup.tsx` の但し書きを外す**

`src/features/division/first-round-store.ts` の 15-21 行目付近:

```ts
/**
 * 1 回戦を直接編集する 4 スライスが共有する入口。runDivisionSetup の
 * トランザクション・結果ロック・保存前検証に、次の 2 つを足す。
 *
 * - SINGLE_ELIMINATION 以外は「その部門は無い」と同じ found: false に倒す。
 * - トーナメントの形でない組み合わせは部分編集させない（league の星取表を
 *   1 回戦だけ取り出して組み直すと 2 節目以降が消える）。
 */
```

`src/components/division/BracketEditorSetup.tsx` の 27-31 行目付近:

```tsx
/**
 * シングルエリミネーションの setup 画面。プレビューがそのまま編集画面で、
 * 試合の追加と 1 回戦のスロット編集をブラケット上で行う。
 */
```

- [ ] **Step 6: DE の語が残っていないことを確かめる**

```bash
grep -rn "ダブルエリミ\|DOUBLE_ELIM\|double-elimination" src
```
Expected: 出力なし（`src/generated/` を含めて 0 件）

- [ ] **Step 7: 型・テスト・lint を通す**

Run: `pnpm typecheck`
Expected: エラーなし

Run: `pnpm test`
Expected: 全テスト PASS

Run: `pnpm lint`
Expected: 自分が変更したファイルに指摘が無いこと

- [ ] **Step 8: 実際に動かして確かめる**

開発サーバを立てる。既に別のワークツリーが 3000 番を使っていることがあるので、
ログに出た実際のポートを読むこと。

```bash
BYPASS_AUTH=1 pnpm dev
```

ブラウザで Cookie に `USER_ID=1` を設定したうえで次を確認する。

1. 組織 `aaaaa` の大会を開き、部門を新規作成する画面で、形式の選択肢が
   「シングルエリミネーション」「リーグ（総当たり）」の **2 つだけ**であること
2. 既存のシングルエリミネーション部門を開き、詳細・`/setup`（ブラケットエディタ）・
   結果入力が今までどおり動くこと
3. 既存のリーグ部門を開き、詳細・`/league`（エントリーと対戦表）・
   結果入力が今までどおり動くこと
4. 大会の印刷ページ（`/print`）が両形式とも描けること
5. 大会の進行順の画面で、削除された DE 部門の行が残っていないこと

確認できたらサーバを止める。`TaskStop` だけでは `start-server.js` が生き残ることが
あるので、プロセスが残っていないか確認する。

- [ ] **Step 9: コミット**

```bash
git add -A
git commit -m "$(cat <<'EOF'
docs(division): reword comments that explained losers/final via DE

losers / final と loserOf は既存の Json を読むために残してある。
その理由をコメントに書き直し、消えた形式とスライスへの言及を外す。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 完了の判定

次がすべて満たされていること。

- `pnpm typecheck` / `pnpm test` / `pnpm lint` が緑
- `grep -rn "ダブルエリミ\|DOUBLE_ELIM\|double-elimination" src` が 0 件
- `prisma/migrations/` に `remove_double_elimination` のマイグレーションがあり、
  ローカル DB に適用済み（`pnpm exec prisma migrate status` が最新）
- `Division` テーブルの `format` が `SINGLE_ELIMINATION` と `ROUND_ROBIN` だけ
- 部門作成フォームの形式の選択肢が 2 つ
- `src/lib/division/types.ts` に `loserOf` と `"losers" | "final"` が**残っている**
- `docs/superpowers/specs/2026-09-17-double-elimination-design.md` と
  `docs/superpowers/plans/2026-09-17-double-elimination.md` が**変更されていない**
