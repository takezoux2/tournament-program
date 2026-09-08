# 試合の実施順の並べ替え 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 部門の中の試合を「何番目にやるか」でドラッグ&ドロップ並べ替えできるようにし、あわせてリーグから「節」を無くす。

**Architecture:** `BracketMatch` に実施順 `sequence` を新設し、`round`/`order`（ブラケットの描画座標）と役割を分ける。並べ替えは `sequence` と `matchNumber` だけを書き換え、`id` を保つので `results` と `ScheduleItem` の参照は壊れない。旧データは読み出し（`lib/division/parse.ts`）が `(round, order)` 順の添字で `sequence` を補うため、マイグレーションは不要。

**Tech Stack:** Next.js 16 (App Router, Server Actions) / React 19 / TypeScript / Prisma 7 / Effect / Zod / @dnd-kit / Vitest + Testing Library / Biome

**設計:** `docs/superpowers/specs/2026-09-08-match-order-design.md`

## Global Constraints

- パッケージマネージャは **pnpm**。`pnpm exec vitest run <path>` / `pnpm typecheck` / `pnpm lint` を使う
- アーキテクチャは垂直スライス。`features/<category>/<action>/` に `schema.ts` / `domain.ts` / `usecase.ts` / `repository.ts` / `handler.ts` を置く（`docs/code-design/architecture.md`）
- `features` の同列・下位への依存は lint で禁止。共有するものは下位共通層の `src/lib/` に置く
- 副作用は Effect で扱う。エラーは `features/division/errors.ts` のタグ付きエラーで表し、文言は `messages.ts` に書く（`Match.exhaustive` なので書き忘れるとコンパイルエラーになる）
- コメントは日本語。「なぜそうしたか」を書く（既存ファイルの密度に合わせる）
- 画面の文言は日本語
- TDD。テストを先に書き、落ちることを確認してから実装する
- タスクごとにコミットする。コミットメッセージ末尾に必ず入れる:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- Windows のチェックアウトでは Biome が CRLF 由来のエラーを全ファイルに出す。**自分が触ったファイルの内容だけで lint を判断する**
- 作業用 worktree を新規に作った場合は、`pnpm install` の後に `pnpm exec next typegen`（`PageProps` などの型が生成される）を実行し、元のチェックアウトから `.env` をコピーする

---

## File Structure

**新規作成**

| ファイル | 責務 |
|---|---|
| `src/lib/dnd/reorder.ts` | ドラッグ結果を並べ替え後のキー配列に直す純粋関数（`components/schedule/schedule-drag.ts` から移設） |
| `src/lib/dnd/reorder.test.ts` | 同上のテスト（移設） |
| `src/features/division/reorder-matches/schema.ts` | 入力（並べ替え後の matchId 配列）の検証 |
| `src/features/division/reorder-matches/domain.ts` | `sequence` と `matchNumber` を振り直す純粋関数 |
| `src/features/division/reorder-matches/usecase.ts` | ポートを呼ぶだけの薄い層（既存スライスと同形） |
| `src/features/division/reorder-matches/repository.ts` | 所有権つき読み出し → 検証 → 書き込みのトランザクション |
| `src/features/division/reorder-matches/handler.ts` | Server Action |
| `src/features/division/reorder-matches/{domain,repository,handler}.test.ts` | 同上のテスト |
| `src/components/division/MatchOrderList.tsx` | 実施順の一覧。D&D ハンドル + 試合番号の編集行。リーグ／トーナメント共用 |
| `src/components/division/MatchOrderList.test.tsx` | 同上のテスト |

**変更**

| ファイル | 変更内容 |
|---|---|
| `src/lib/division/types.ts` | `BracketMatch.sequence` を追加 |
| `src/lib/division/parse.ts` | `sequence` の読み取りと補完、`sequence` 昇順で返す |
| `src/lib/division/validate.ts` | `sequence` が 0 からの連番であることを検証 |
| `src/lib/division/label.ts` | リーグの位置文言を `第N試合` に |
| `src/features/division/single-elimination/build.ts` | 生成時に `sequence` を振る |
| `src/features/division/single-elimination/view.ts` | `toMatchNumberView` を削除（共通化） |
| `src/features/division/round-robin/build.ts` | 節を保存しない（全試合 `round: 1`）。id と `sequence` を通し番号に |
| `src/features/division/round-robin/view.ts` | `toRoundView` / `LeagueRoundView` を削除（共通化・節の廃止） |
| `src/features/division/match-number-view.ts` | 共通の `toMatchOrderView` を追加 |
| `src/features/division/errors.ts` / `messages.ts` | `DivisionMatchOrderError` を追加 |
| `src/features/schedule/domain.ts` | 部門内の並びを `sequence` 順（＝配列順）に |
| `src/components/schedule/ScheduleList.tsx` | `resolveDragReorder` の import 元を `lib/dnd/reorder` に |
| `src/components/division/MatchNumberRow.tsx` | `<li>` をやめて行の中身だけを返す |
| `src/components/division/LeagueSetup.tsx` | 「節ごとの試合」→「試合」。`MatchOrderList` に差し替え |
| `src/components/division/DivisionSetup.tsx` | 「試合番号」→「試合の実施順」。`MatchOrderList` に差し替え |
| `.../divisions/[divisionId]/league/page.tsx` / `.../setup/page.tsx` | 並べ替えの Server Action を渡す |

**削除**

| ファイル | 理由 |
|---|---|
| `src/components/division/LeagueRoundList.tsx` / `.test.tsx` | 節ごとの表示が無くなる。`MatchOrderList` に統合 |
| `src/components/division/MatchNumberList.tsx` / `.test.tsx` | `MatchOrderList` に統合 |
| `src/components/schedule/schedule-drag.ts` / `.test.ts` | `lib/dnd/reorder.ts` へ移設 |

---
## Task 1: `sequence`（実施順）をデータ型・読み出し・検証に導入する

**Files:**
- Modify: `src/lib/division/types.ts`（`BracketMatch`）
- Modify: `src/lib/division/parse.ts`（`ParsedBracketMatch` / `fillMatchNumbers` / `parseMatchingConfig`）
- Modify: `src/lib/division/validate.ts`（`validateMatchingConfig`）
- Modify: `src/features/division/single-elimination/build.ts`（`buildFromSlots` の 2 箇所の push）
- Modify: `src/features/division/round-robin/build.ts`（`buildRoundRobin` の push）
- Test: `src/lib/division/parse.test.ts`, `src/lib/division/validate.test.ts`
- Modify（型エラーの追随）: `BracketMatch` のオブジェクトリテラルを書いているテスト。`pnpm typecheck` が場所を教えてくれる。おおよそ次のファイル:
  `src/app/t/[tournamentId]/divisions/[divisionId]/page.test.tsx`,
  `src/components/division/{DivisionBracket,DivisionSetup,LeagueSetup}.test.tsx`,
  `src/features/bracket/from-division.test.ts`,
  `src/features/division/{add-entry,record-result,remove-entry,reorder-entry,set-match-number,swap-slots}/repository.test.ts`,
  `src/features/schedule/{domain,repository,result-rows,schedule-store}.test.ts`,
  `src/lib/division/{label,resolve,validate}.test.ts`

**Interfaces:**
- Consumes: なし（最初のタスク）
- Produces:
  - `BracketMatch.sequence: number` — 部門内の実施順。0 始まりの連番
  - `parseMatchingConfig(value: unknown): MatchingConfig` — 返す `matches` は必ず `sequence` 昇順・0 からの連番（以降のタスクはこの不変条件に依存する）
  - `validateMatchingConfig(config: MatchingConfig, entries: DivisionEntries): ValidationErrors` — `sequence` の連番違反を検出する

- [ ] **Step 1: `parse` の失敗するテストを書く**

`src/lib/division/parse.test.ts` の `describe("parseMatchingConfig", ...)` の末尾に追加する。

```ts
  it("sequence の無い旧データには round/order 順で 0 からの連番を振る", () => {
    const match = (id: string, round: number, order: number) => ({
      id,
      bracket: "winners",
      round,
      order,
      matchNumber: id,
      slots: [{ kind: "bye" }, { kind: "bye" }],
    });
    const config = parseMatchingConfig({
      version: 1,
      // 配列順を round 順と逆に置き、並べ替えたうえで振ることを確かめる
      matches: [match("m2-0", 2, 0), match("m1-0", 1, 0), match("m1-1", 1, 1)],
    });

    // 返す配列自体が実施順になっている（下流は配列順をそのまま読む）
    expect(config.matches.map((match) => match.id)).toEqual([
      "m1-0",
      "m1-1",
      "m2-0",
    ]);
    expect(config.matches.map((match) => match.sequence)).toEqual([0, 1, 2]);
  });

  it("sequence があればその昇順に並べ、0 からの連番に詰め直す", () => {
    const match = (id: string, order: number, sequence: number) => ({
      id,
      bracket: "winners",
      round: 1,
      order,
      sequence,
      matchNumber: id,
      slots: [{ kind: "bye" }, { kind: "bye" }],
    });
    const config = parseMatchingConfig({
      version: 1,
      // 3 番目の試合を先頭へ動かしたあとの並び。値も 0 始まりでない。
      matches: [match("a", 0, 5), match("b", 1, 9), match("c", 2, 1)],
    });

    expect(config.matches.map((match) => match.id)).toEqual(["c", "a", "b"]);
    expect(config.matches.map((match) => match.sequence)).toEqual([0, 1, 2]);
  });

  it("sequence が一部にしか無ければ全件を round/order 順で振り直す", () => {
    // 途中まで書き込まれた壊れたデータ。中途半端な値を信じると並びが
    // 飛び飛びになるので、揃っていないときは既定の順に戻す。
    const config = parseMatchingConfig({
      version: 1,
      matches: [
        {
          id: "m1-1",
          bracket: "winners",
          round: 1,
          order: 1,
          sequence: 0,
          matchNumber: "2",
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
        {
          id: "m1-0",
          bracket: "winners",
          round: 1,
          order: 0,
          matchNumber: "1",
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
      ],
    });

    expect(config.matches.map((match) => match.id)).toEqual(["m1-0", "m1-1"]);
    expect(config.matches.map((match) => match.sequence)).toEqual([0, 1]);
  });

  it("sequence が整数以外なら DivisionJsonError", () => {
    expect(() =>
      parseMatchingConfig({
        version: 1,
        matches: [
          {
            id: "m1-0",
            bracket: "winners",
            round: 1,
            order: 0,
            sequence: "1",
            matchNumber: "1",
            slots: [{ kind: "bye" }, { kind: "bye" }],
          },
        ],
      }),
    ).toThrow(/matchingConfig\.matches\[0\]\.sequence/);
  });
```

- [ ] **Step 2: 落ちることを確認する**

Run: `pnpm exec vitest run src/lib/division/parse.test.ts`

Expected: FAIL。`sequence` が `undefined` のため `toEqual([0, 1, 2])` が落ち、最後のケースは例外が飛ばずに落ちる。

- [ ] **Step 3: `BracketMatch` に `sequence` を足す**

`src/lib/division/types.ts` の `order` の直後に挿入する。

```ts
  /** ラウンド内の上からの位置。0 始まり */
  order: number;
  /**
   * 部門内での実施順。0 始まりの連番。並べ替えで変わる。
   *
   * round/order は「ブラケット上のどこにある試合か」を表し、描画座標に
   * そのまま使われる（features/bracket/layout-bracket.ts）。実施順として
   * 動かすと対戦表の形が崩れるため、「何番目にやるか」は別の項に持つ。
   */
  sequence: number;
```

`round` のコメント（「ROUND_ROBIN では節番号」）は Task 3 で直すので、ここでは触らない。

- [ ] **Step 4: `parse.ts` で `sequence` を読み、補完する**

`ParsedBracketMatch` の宣言を置き換える。

```ts
/** matchNumber / sequence 補完前の 1 試合。旧データにはどちらも無い。 */
type ParsedBracketMatch = Omit<BracketMatch, "matchNumber" | "sequence"> & {
  matchNumber?: string;
  sequence?: number;
};

/** matchNumber を補ったあとの 1 試合。sequence はまだ無いことがある。 */
type NumberedBracketMatch = Omit<BracketMatch, "sequence"> & {
  sequence?: number;
};
```

`parseBracketMatch` の末尾、`if (record.matchNumber !== undefined) { ... }` の直後に足す。

```ts
  if (record.sequence !== undefined) {
    parsed.sequence = asInt(record.sequence, `${path}.sequence`);
  }
```

`fillMatchNumbers` の戻り値の型を `NumberedBracketMatch[]` に変え、末尾の `return` のキャストも合わせる。

```ts
const fillMatchNumbers = (
  matches: ParsedBracketMatch[],
): NumberedBracketMatch[] => {
```

```ts
  return matches.map((match) =>
    match.matchNumber === undefined
      ? { ...match, matchNumber: assigned.get(match.id) as string }
      : (match as NumberedBracketMatch),
  );
```

`fillMatchNumbers` の直後に新しい関数を足す。

```ts
/**
 * 実施順を補い、0 からの連番に正規化する。
 *
 * 全試合が sequence を持つならその昇順、1 つでも欠けていれば round/order 順に
 * 並べ、その並びで 0 から振り直す。欠けているのは列を足す前に保存された
 * 旧データで、round/order 順は運営者が今見ている並びそのものなので、
 * 補完しても画面の並びは変わらない。
 *
 * 揃っていないときに残っている値を使わないのは、途中まで書き込まれた
 * 壊れたデータで並びが飛び飛びになるのを避けるため。値が揃っていても
 * 添字で振り直すので、重複や欠番のあるデータもここで詰め直される。
 * データ移行を行わない代わりに、読み出しが必ず完全な形へ正規化する
 * （matchNumber の補完と同じ方針）。
 *
 * 返す配列の順がそのまま実施順になる。下流は sequence で並べ直さずに
 * 配列順を読んでよい。
 */
const fillSequences = (matches: NumberedBracketMatch[]): BracketMatch[] => {
  const complete = matches.every((match) => match.sequence !== undefined);
  const byPosition = (
    left: NumberedBracketMatch,
    right: NumberedBracketMatch,
  ): number => left.round - right.round || left.order - right.order;

  return [...matches]
    .sort(
      complete
        ? (left, right) =>
            (left.sequence as number) - (right.sequence as number) ||
            byPosition(left, right)
        : byPosition,
    )
    .map((match, sequence) => ({ ...match, sequence }));
};
```

`parseMatchingConfig` の `matches` を包む。

```ts
    matches: fillSequences(
      fillMatchNumbers(
        asArray(record.matches, "matchingConfig.matches").map((item, index) =>
          parseBracketMatch(item, `matchingConfig.matches[${index}]`),
        ),
      ),
    ),
```

- [ ] **Step 5: `parse` のテストが通ることを確認する**

Run: `pnpm exec vitest run src/lib/division/parse.test.ts`

Expected: PASS（既存のテストも含めて全件）

- [ ] **Step 6: `validate` の失敗するテストを書く**

`src/lib/division/validate.test.ts` の `describe("validateMatchingConfig", ...)` の末尾に追加する。

```ts
  it("sequence が 0 からの連番なら通る", () => {
    const config: MatchingConfig = {
      version: 1,
      matches: [
        {
          id: "m1-0",
          bracket: "winners",
          round: 1,
          order: 0,
          sequence: 0,
          matchNumber: "1",
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
        {
          id: "m1-1",
          bracket: "winners",
          round: 1,
          order: 1,
          sequence: 1,
          matchNumber: "2",
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
      ],
    };

    expect(validateMatchingConfig(config, { version: 1, entries: [] })).toEqual(
      [],
    );
  });

  it("sequence が重複していたらエラー", () => {
    const config: MatchingConfig = {
      version: 1,
      matches: [
        {
          id: "m1-0",
          bracket: "winners",
          round: 1,
          order: 0,
          sequence: 0,
          matchNumber: "1",
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
        {
          id: "m1-1",
          bracket: "winners",
          round: 1,
          order: 1,
          sequence: 0,
          matchNumber: "2",
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
      ],
    };

    expect(validateMatchingConfig(config, { version: 1, entries: [] })).toEqual(
      [expect.stringContaining("sequence")],
    );
  });

  it("sequence に欠番があったらエラー", () => {
    const config: MatchingConfig = {
      version: 1,
      matches: [
        {
          id: "m1-0",
          bracket: "winners",
          round: 1,
          order: 0,
          sequence: 0,
          matchNumber: "1",
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
        {
          id: "m1-1",
          bracket: "winners",
          round: 1,
          order: 1,
          sequence: 2,
          matchNumber: "2",
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
      ],
    };

    expect(validateMatchingConfig(config, { version: 1, entries: [] })).toEqual(
      [expect.stringContaining("sequence")],
    );
  });
```

- [ ] **Step 7: 落ちることを確認する**

Run: `pnpm exec vitest run src/lib/division/validate.test.ts`

Expected: FAIL。重複・欠番のケースでエラーが 0 件のまま返る（`sequence` を型に足したので最初のケースだけは通る）。

- [ ] **Step 8: `validateMatchingConfig` に連番の検証を足す**

`src/lib/division/validate.ts` の `validateMatchingConfig` 内、`matchNumber` が空でないかを見るループの直後に足す。

```ts
  // 実施順は 0 から抜けなく並んでいなければならない。読み出し（parse.ts）が
  // 常にこの形へ正規化するため、ここで捕まえるのは書き込み側（生成・並べ替え）の
  // 不具合。保存の直前にだけ効く網として置く。
  const sequences = matches
    .map((match) => match.sequence)
    .sort((left, right) => left - right);
  if (sequences.some((sequence, index) => sequence !== index)) {
    errors.push(
      `matchingConfig.matches[].sequence が 0 からの連番ではありません: ${sequences.join(", ")}`,
    );
  }
```

- [ ] **Step 9: `validate` のテストが通ることを確認する**

Run: `pnpm exec vitest run src/lib/division/validate.test.ts`

Expected: PASS

- [ ] **Step 10: 生成側に `sequence` を振る**

`src/features/division/single-elimination/build.ts` の `buildFromSlots` にある 2 箇所の `matches.push({ ... })` に `sequence` を足す。`matchNumber` が `matches.length + 1` を使っているのと同じ理由で、push 前の長さがそのまま 0 始まりの実施順になる。

1 回戦側:

```ts
    matches.push({
      id: matchId(1, order),
      bracket: "winners",
      round: 1,
      order,
      // 生成直後の実施順は round/order 順。生成を押した時点の並びを既定にする。
      sequence: matches.length,
      matchNumber: String(matches.length + 1),
      slots: [paddedSlots[order * 2], paddedSlots[order * 2 + 1]],
    });
```

2 回戦以降側:

```ts
      matches.push({
        id: matchId(round, order),
        bracket: "winners",
        round,
        order,
        sequence: matches.length,
        matchNumber: String(matches.length + 1),
        slots: [
          { kind: "winnerOf", matchId: matchId(round - 1, order * 2) },
          { kind: "winnerOf", matchId: matchId(round - 1, order * 2 + 1) },
        ],
      });
```

`src/features/division/round-robin/build.ts` の `buildRoundRobin` の push にも同じ 1 行を足す（節の廃止は Task 3。ここでは型を満たすだけ）。

```ts
      matches.push({
        id: matchId(round, order),
        bracket: "winners",
        round,
        order,
        sequence: matches.length,
        matchNumber: String(matches.length + 1),
        slots: [
          { kind: "entry", entryId: sorted[left].id },
          { kind: "entry", entryId: sorted[right].id },
        ],
      });
```

- [ ] **Step 11: 型エラーになったテストのリテラルに `sequence` を足す**

Run: `pnpm typecheck`

`BracketMatch` を直接組み立てているテストが「`sequence` が無い」と言われる。各リテラルに、そのテストが期待している並び順に合わせた 0 始まりの連番を足す。1 試合だけなら `sequence: 0`。`buildFromSlots` / `buildRoundRobin` の戻り値を使っているテストは触らなくてよい。

`pnpm typecheck` がエラーを出さなくなるまで繰り返す。

- [ ] **Step 12: 全テストと型検査を通す**

Run: `pnpm exec vitest run` と `pnpm typecheck`

Expected: どちらも PASS。既存の期待値（文言・並び）はこのタスクでは変わらない。

- [ ] **Step 13: lint とコミット**

Run: `pnpm lint`（CRLF 由来のエラーは無視し、自分が触ったファイルの内容についての指摘だけ直す）

```bash
git add -A
git commit -m "feat(division): add play-order sequence to bracket matches

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
## Task 2: 試合一覧のビューを実施順で共通化する

トーナメントとリーグで別々にあった一覧のビュー関数を 1 つにまとめ、並びを `sequence`（＝`parseMatchingConfig` が返す配列順）にする。この時点ではまだ画面の見た目は変わらない。

**Files:**
- Modify: `src/features/division/match-number-view.ts`（`toMatchOrderView` を追加）
- Modify: `src/features/division/single-elimination/view.ts`（`toMatchNumberView` を削除）
- Modify: `src/components/division/DivisionSetup.tsx`（import と呼び出し）
- Modify: `src/features/schedule/domain.ts`（`buildMatchRows` の並べ替えを外す）
- Create: `src/features/division/match-number-view.test.ts`
- Modify: `src/features/division/single-elimination/view.test.ts`（`toMatchNumberView` の describe を移す）
- Modify: `src/features/schedule/domain.test.ts`（テスト名の更新）

**Interfaces:**
- Consumes: `BracketMatch.sequence` と「`parseMatchingConfig` は `sequence` 昇順で返す」（Task 1）
- Produces:
  - `toMatchOrderView(config: MatchingConfig, entries: DivisionEntries, participants: { id: string; name: string }[], format: DivisionFormat): MatchNumberRowView[]` — 実施順に並んだ行。Task 3 と Task 6 の画面がこれを使う

- [ ] **Step 1: 共通ビューの失敗するテストを書く**

Create: `src/features/division/match-number-view.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { DivisionEntries } from "@/lib/division/types";
import { toMatchOrderView } from "./match-number-view";
import { buildFromSlots } from "./single-elimination/build";

const entries: DivisionEntries = {
  version: 1,
  entries: [
    { id: "e1", participantId: "p1", seed: 0 },
    { id: "e2", participantId: "p2", seed: 1 },
    { id: "e3", participantId: "p3", seed: 2 },
    { id: "e4", participantId: "p4", seed: 3 },
  ],
};

const participants = [
  { id: "p1", name: "山田" },
  { id: "p2", name: "佐藤" },
  { id: "p3", name: "鈴木" },
  { id: "p4", name: "田中" },
];

const config = buildFromSlots([
  { kind: "entry", entryId: "e1" },
  { kind: "entry", entryId: "e2" },
  { kind: "entry", entryId: "e3" },
  { kind: "entry", entryId: "e4" },
]);

describe("toMatchOrderView", () => {
  it("配列の順（＝実施順）のまま行にする", () => {
    const rows = toMatchOrderView(
      config,
      entries,
      participants,
      "SINGLE_ELIMINATION",
    );

    expect(rows.map((row) => row.matchId)).toEqual(["m1-0", "m1-1", "m2-0"]);
  });

  it("並べ替え済みの配列は並べ直さずにそのまま返す", () => {
    // 実施順を入れ替えたあとの config。round/order で並べ直す実装だと
    // 元の順に戻ってしまうので、このテストが効く。
    const reordered = {
      version: 1 as const,
      matches: [
        { ...config.matches[2], sequence: 0, matchNumber: "1" },
        { ...config.matches[0], sequence: 1, matchNumber: "2" },
        { ...config.matches[1], sequence: 2, matchNumber: "3" },
      ],
    };

    const rows = toMatchOrderView(
      reordered,
      entries,
      participants,
      "SINGLE_ELIMINATION",
    );

    expect(rows.map((row) => row.matchId)).toEqual(["m2-0", "m1-0", "m1-1"]);
  });

  it("位置の文言と対戦カードを載せる", () => {
    const [row] = toMatchOrderView(
      config,
      entries,
      participants,
      "SINGLE_ELIMINATION",
    );

    expect(row).toEqual({
      matchId: "m1-0",
      matchNumber: "1",
      label: "1回戦 第1試合",
      card: "山田 vs 佐藤",
    });
  });

  it("名前を引けない参加者は（不明な参加者）として出す", () => {
    const [row] = toMatchOrderView(config, entries, [], "SINGLE_ELIMINATION");

    expect(row.card).toBe("（不明な参加者） vs （不明な参加者）");
  });
});
```

- [ ] **Step 2: 落ちることを確認する**

Run: `pnpm exec vitest run src/features/division/match-number-view.test.ts`

Expected: FAIL（`toMatchOrderView` が存在しない）

- [ ] **Step 3: `toMatchOrderView` を実装する**

`src/features/division/match-number-view.ts` に追記する（既存の `MatchNumberRowView` 型はそのまま残す）。

```ts
import type { DivisionFormat } from "@/generated/prisma/enums";
import {
  createSlotLabeler,
  matchCardLabel,
  matchPositionLabel,
} from "@/lib/division/label";
import type { DivisionEntries, MatchingConfig } from "@/lib/division/types";
```

```ts
/**
 * 保存済みの組み合わせを実施順の一覧にする。
 *
 * 並べ替えず配列の順をそのまま使う。parseMatchingConfig が sequence 昇順で
 * 返すため、配列の順が実施順そのものになっている。ここで round/order へ
 * 並べ直すと、運営者が並べ替えた結果が画面に出ない。
 *
 * トーナメントとリーグで同じ行・同じ並べ方になったため 1 つにまとめてある。
 * 違いは位置の文言だけで、それは format を label.ts へ渡して吸収する。
 */
export const toMatchOrderView = (
  config: MatchingConfig,
  entries: DivisionEntries,
  participants: { id: string; name: string }[],
  format: DivisionFormat,
): MatchNumberRowView[] => {
  const labelSlot = createSlotLabeler(config, entries, participants);

  return config.matches.map((match) => ({
    matchId: match.id,
    matchNumber: match.matchNumber,
    label: matchPositionLabel(match, format),
    card: matchCardLabel(match, labelSlot),
  }));
};
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run src/features/division/match-number-view.test.ts`

Expected: PASS

- [ ] **Step 5: トーナメント側の呼び出しを差し替え、古い関数を消す**

`src/features/division/single-elimination/view.ts` から `toMatchNumberView` を削除する。あわせて、それだけが使っていた import（`createSlotLabeler` / `matchCardLabel` / `matchPositionLabel` / `MatchNumberRowView`）も消す（`toSetupView` は残す）。

`src/components/division/DivisionSetup.tsx` の import と呼び出しを差し替える。

```ts
import { toMatchOrderView } from "@/features/division/match-number-view";
```

```tsx
          <MatchNumberList
            rows={toMatchOrderView(
              parsed.matchingConfig,
              parsed.entries,
              participants,
              division.format,
            )}
```

`src/features/division/single-elimination/view.test.ts` の `describe("toMatchNumberView", ...)` は削除する（同等の観点は Step 1 で作ったテストが持っている）。使わなくなった import も消す。

- [ ] **Step 6: 大会の進行順の既定の並びを実施順にする**

`src/features/schedule/domain.ts` の `buildMatchRows` から並べ替えを外す。

```ts
      return division.matchingConfig.matches.map(
        (match): ScheduleRowView => ({
          kind: "match",
          key: matchKey(division.id, match.id),
          divisionId: division.id,
          divisionName: division.name,
          matchId: match.id,
          matchNumber: match.matchNumber,
          label: matchPositionLabel(match, division.format),
          card: matchCardLabel(match, labelSlot),
        }),
      );
```

関数の上のコメントも直す。

```ts
/**
 * 全部門の試合を、部門の order 昇順 → 部門内の実施順で並べた行にする。
 * 行を持たない試合を末尾へ足すときの「決定的な順」がこれで、
 * 保存の有無にかかわらず同じ入力からは同じ並びになる。
 *
 * 部門内は並べ替えない。matchingConfig.matches は parseMatchingConfig が
 * sequence 昇順で返しており、それが部門の編集画面で運営者が決めた実施順そのもの。
 */
```

`src/features/schedule/domain.test.ts` のテスト名 `"行が 1 件も無ければ部門順 → round → order で全試合を並べる"` を `"行が 1 件も無ければ部門順 → 部門内の実施順で全試合を並べる"` に変える（期待値は変わらない）。

- [ ] **Step 7: 全テストと型検査を通す**

Run: `pnpm exec vitest run` と `pnpm typecheck`

Expected: どちらも PASS

- [ ] **Step 8: lint とコミット**

Run: `pnpm lint`

```bash
git add -A
git commit -m "refactor(division): build match lists in play order

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: リーグから「節」を無くす

**Files:**
- Modify: `src/features/division/round-robin/build.ts`（`matchId` / `buildRoundRobin`）
- Modify: `src/lib/division/label.ts`（`matchPositionLabel`）
- Modify: `src/lib/division/types.ts`（`round` のコメント）
- Modify: `src/features/division/round-robin/view.ts`（`toRoundView` / `LeagueRoundView` を削除）
- Modify: `src/components/division/LeagueSetup.tsx`（区画名と一覧の差し替え）
- Delete: `src/components/division/LeagueRoundList.tsx`, `src/components/division/LeagueRoundList.test.tsx`
- Test: `src/features/division/round-robin/build.test.ts`, `src/features/division/round-robin/view.test.ts`, `src/lib/division/label.test.ts`, `src/components/division/LeagueSetup.test.tsx`, `src/features/schedule/domain.test.ts`

**Interfaces:**
- Consumes: `toMatchOrderView`（Task 2）、`BracketMatch.sequence`（Task 1）
- Produces:
  - `buildRoundRobin(entries: DivisionEntry[]): MatchingConfig` — 全試合 `round: 1`、`order` と `sequence` は 0 からの通し番号、id は `r1-{通し番号}`
  - `matchPositionLabel(match, "ROUND_ROBIN")` → `第{sequence + 1}試合`

- [ ] **Step 1: 生成の失敗するテストを書く**

`src/features/division/round-robin/build.test.ts` の `describe("buildRoundRobin", ...)` に追加する。既存の「節ごとに分かれること」を確かめているテストがあれば、この観点に置き換える。

```ts
  it("節を保存しない（全試合が round 1 の 1 本の並び）", () => {
    const config = buildRoundRobin(entries4);

    expect(config.matches.map((match) => match.round)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(config.matches.map((match) => match.order)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(config.matches.map((match) => match.sequence)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect(config.matches.map((match) => match.id)).toEqual([
      "r1-0",
      "r1-1",
      "r1-2",
      "r1-3",
      "r1-4",
      "r1-5",
    ]);
    expect(config.matches.map((match) => match.matchNumber)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
  });

  it("並びは円卓法の節を上から連結した順のまま", () => {
    // 4 人なら 第1節(A-D, B-C) → 第2節(A-C, D-B) → 第3節(A-B, C-D)。
    // 同じ人が続けて出にくい並びが、節を消しても保たれることを確かめる。
    const config = buildRoundRobin(entries4);

    expect(
      config.matches.map((match) =>
        match.slots
          .map((slot) => (slot.kind === "entry" ? slot.entryId : "?"))
          .join("-"),
      ),
    ).toEqual(["e1-e4", "e2-e3", "e1-e3", "e4-e2", "e1-e2", "e3-e4"]);
  });
```

`entries4` はこのファイルで既に使っている 4 人ぶんのエントリー（`e1`〜`e4`、seed 0〜3）。無ければファイル先頭の既存の組み立て方に合わせて用意する。2 つ目のテストの期待値は `circleRounds(4)` の現在の出力（`[[0,3],[1,2]]` / `[[0,2],[3,1]]` / `[[0,1],[2,3]]`）を添字からエントリー id に直したもので、このタスクでは `circleRounds` を変えないため一致する。

- [ ] **Step 2: 落ちることを確認する**

Run: `pnpm exec vitest run src/features/division/round-robin/build.test.ts`

Expected: FAIL。`round` が `[1,1,2,2,3,3]`、id が `r1-0, r1-1, r2-0, ...` になっている。

- [ ] **Step 3: 節を保存しないように生成を変える**

`src/features/division/round-robin/build.ts` の `matchId` と `buildRoundRobin` を置き換える。

```ts
/**
 * 試合 id。生成時の通し番号だけから決まる。接頭辞を single-elimination の
 * `m{round}-{order}` と変えてあるのは、形式を取り違えたデータが混ざったときに
 * 見分けられるようにするため。`r1-` の 1 は「リーグに節は無い（round は常に 1）」
 * ことを表していて、実施順ではない。並べ替えても id は変わらない。
 */
const matchId = (order: number): string => `r1-${order}`;

/**
 * エントリーのシード順から総当たりの組み合わせを組み立てる。
 * 2 人未満なら空を返す。呼び出し側はそれを「作れなかった」と読める。
 *
 * 円卓法で節ごとの組を作り、それを上から連結して 1 本の並びにする。
 * 節はここで消費されて保存されない（リーグに節を分ける必要が無いため）が、
 * 節の順に連結することで「同じ人が続けて試合をしにくい並び」が既定になる。
 */
export const buildRoundRobin = (entries: DivisionEntry[]): MatchingConfig => {
  const sorted = [...entries].sort((left, right) => left.seed - right.seed);
  const matches: BracketMatch[] = [];

  for (const pairs of circleRounds(sorted.length)) {
    for (const [left, right] of pairs) {
      const order = matches.length;
      matches.push({
        id: matchId(order),
        bracket: "winners",
        round: 1,
        order,
        sequence: order,
        matchNumber: String(order + 1),
        slots: [
          { kind: "entry", entryId: sorted[left].id },
          { kind: "entry", entryId: sorted[right].id },
        ],
      });
    }
  }

  return { version: 1, matches };
};
```

`circleRounds` は節ごとの組を返す純粋関数のまま残す（この関数の中だけで使う）。関数のコメントの「節」への言及はそのままでよい。生成の途中の考え方としては節が残るため。

- [ ] **Step 4: 生成のテストが通ることを確認する**

Run: `pnpm exec vitest run src/features/division/round-robin/build.test.ts`

Expected: PASS

- [ ] **Step 5: 文言の失敗するテストを書く**

`src/lib/division/label.test.ts` の `it("リーグは節で表す", ...)` を置き換える。

```ts
    it("リーグは実施順の通し番号で表す", () => {
      // リーグに節は無い。round は常に 1 なので「1回戦」と出すと嘘になる。
      expect(matchPositionLabel(match, "ROUND_ROBIN")).toBe("第2試合");
    });
```

このテストが使っている `match` は `sequence: 1` を持つ試合にする（Task 1 でリテラルに `sequence` を足した際の値を確認し、`第2試合` と一致するように `sequence: 1` に揃える）。

- [ ] **Step 6: 落ちることを確認する**

Run: `pnpm exec vitest run src/lib/division/label.test.ts`

Expected: FAIL（`第2節 第2試合` が返る）

- [ ] **Step 7: 文言を変える**

`src/lib/division/label.ts` の `matchPositionLabel` を置き換える。

```ts
/**
 * 「1回戦 第1試合」のような構造上の位置。
 * リーグには節も回戦も無いので、実施順の通し番号だけで表す。
 * 形式を引数に取るのは、この関数が大会の進行順（複数の部門が混ざる）でも
 * 使われるため。呼び出し側がその試合の部門の形式を知っている。
 */
export const matchPositionLabel = (
  match: BracketMatch,
  format: DivisionFormat,
): string =>
  format === "ROUND_ROBIN"
    ? `第${match.sequence + 1}試合`
    : `${match.round}回戦 第${match.order + 1}試合`;
```

`src/lib/division/types.ts` の `round` のコメントも直す。

```ts
  /** 1 = 1 回戦。ROUND_ROBIN は節を持たないので常に 1 */
  round: number;
```

`src/features/schedule/domain.test.ts` の `it("リーグの部門は節の文言で並べる", ...)` を `it("リーグの部門は実施順の通し番号で並べる", ...)` に変え、期待値を `"第1試合"` にする。

- [ ] **Step 8: 文言のテストが通ることを確認する**

Run: `pnpm exec vitest run src/lib/division/label.test.ts src/features/schedule/domain.test.ts`

Expected: PASS

- [ ] **Step 9: リーグの画面をフラットな一覧にする**

`src/features/division/round-robin/view.ts` から `toRoundView` と `LeagueRoundView` と `MatchNumberRowView` の import、`label.ts` からの import を削除する（`toCrossTableView` と、それが使う `labeledEntries` は残す）。

`src/features/division/round-robin/view.test.ts` の `describe("toRoundView", ...)` を丸ごと削除する（`toCrossTableView` の describe は残す）。使わなくなった import も消す。

`src/components/division/LeagueSetup.tsx` の「節ごとの試合」の区画を差し替える。

```tsx
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-700">試合の実施順</h2>
        {/* 番号の変更は構造を変えないため、locked でも編集できる */}
        {mismatched ? (
          <Notice>対戦表を作り直すと、ここに試合が出ます</Notice>
        ) : (
          <MatchNumberList
            rows={toMatchOrderView(
              parsed.matchingConfig,
              parsed.entries,
              participants,
              division.format,
            )}
            slug={slug}
            tournamentId={tournamentId}
            divisionId={division.id}
            action={actions.setMatchNumber}
          />
        )}
      </section>
```

import を差し替える。

```ts
import { toMatchOrderView } from "@/features/division/match-number-view";
import { toCrossTableView } from "@/features/division/round-robin/view";
import { MatchNumberList } from "./MatchNumberList";
```

`LeagueRoundList` の import は削除する。

Delete: `src/components/division/LeagueRoundList.tsx`, `src/components/division/LeagueRoundList.test.tsx`

`src/components/division/LeagueSetup.test.tsx` の期待値を直す。

* 区画の見出しを確かめているテスト: `"節ごとの試合"` → `"試合の実施順"`
* 節の見出し `"第1節"` を探しているテスト: 代わりに実施順の行の文言（例: `"第1試合"`）を探す
* 「休み」を確かめているテストがあれば削除する（節が無くなり、休みという概念自体が画面から消えるため）

- [ ] **Step 10: 全テストと型検査を通す**

Run: `pnpm exec vitest run` と `pnpm typecheck`

Expected: どちらも PASS

- [ ] **Step 11: lint とコミット**

Run: `pnpm lint`

```bash
git add -A
git commit -m "feat(division): drop matchday grouping from round-robin

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
## Task 4: 並べ替えのスライスを作る（サーバ側）

**Files:**
- Create: `src/features/division/reorder-matches/schema.ts`
- Create: `src/features/division/reorder-matches/domain.ts`
- Create: `src/features/division/reorder-matches/usecase.ts`
- Create: `src/features/division/reorder-matches/repository.ts`
- Create: `src/features/division/reorder-matches/handler.ts`
- Create: `src/features/division/reorder-matches/{domain,repository,handler}.test.ts`
- Modify: `src/features/division/errors.ts`（`DivisionMatchOrderError` を追加）
- Modify: `src/features/division/messages.ts`（同エラーの文言）

**Interfaces:**
- Consumes: `BracketMatch.sequence`（Task 1）、`DivisionIds` / `DivisionSetupOutcome`（`../setup-store`）、`isEditableFormat`（`../matching-strategy`）
- Produces:
  - `reorderMatches(config: MatchingConfig, matchIds: string[]): MatchingConfig | null`
  - `reorderMatchesInDb: ReorderMatchesPort`
  - `reorderMatchesAction(prevState: DivisionFormState, formData: FormData): Promise<DivisionFormState>` — FormData は `slug` / `tournamentId` / `divisionId` と、並べ替え後の順に並べた複数の `matchId`。Task 6 の画面がこれを呼ぶ

- [ ] **Step 1: 純粋関数の失敗するテストを書く**

Create: `src/features/division/reorder-matches/domain.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { MatchingConfig } from "@/lib/division/types";
import { reorderMatches } from "./domain";

const config: MatchingConfig = {
  version: 1,
  matches: [
    {
      id: "m1-0",
      bracket: "winners",
      round: 1,
      order: 0,
      sequence: 0,
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
      sequence: 1,
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
      sequence: 2,
      matchNumber: "3",
      slots: [
        { kind: "winnerOf", matchId: "m1-0" },
        { kind: "winnerOf", matchId: "m1-1" },
      ],
    },
  ],
};

describe("reorderMatches", () => {
  it("指定の順に並べ、実施順を 0 から振り直す", () => {
    const next = reorderMatches(config, ["m2-0", "m1-0", "m1-1"]);

    expect(next?.matches.map((match) => match.id)).toEqual([
      "m2-0",
      "m1-0",
      "m1-1",
    ]);
    expect(next?.matches.map((match) => match.sequence)).toEqual([0, 1, 2]);
  });

  it("試合番号を先頭から振り直す", () => {
    const next = reorderMatches(config, ["m2-0", "m1-0", "m1-1"]);

    expect(next?.matches.map((match) => match.matchNumber)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  it("id・ブラケット上の位置・対戦カードは変えない", () => {
    // ここが変わるとブラケットの絵が崩れ、results と ScheduleItem の
    // 参照も外れる。並べ替えが触ってよいのは実施順と試合番号だけ。
    const next = reorderMatches(config, ["m2-0", "m1-0", "m1-1"]);
    const moved = next?.matches[0];

    expect(moved?.id).toBe("m2-0");
    expect(moved?.round).toBe(2);
    expect(moved?.order).toBe(0);
    expect(moved?.bracket).toBe("winners");
    expect(moved?.slots).toEqual(config.matches[2].slots);
  });

  it("元の組み合わせを書き換えない", () => {
    reorderMatches(config, ["m2-0", "m1-0", "m1-1"]);

    expect(config.matches.map((match) => match.id)).toEqual([
      "m1-0",
      "m1-1",
      "m2-0",
    ]);
    expect(config.matches[2].sequence).toBe(2);
  });

  it("件数が足りなければ null", () => {
    expect(reorderMatches(config, ["m1-0", "m1-1"])).toBeNull();
  });

  it("同じ id が 2 回来たら null", () => {
    // 件数だけ見ていると通ってしまい、片方の試合が消えた組み合わせを書く。
    expect(reorderMatches(config, ["m1-0", "m1-0", "m1-1"])).toBeNull();
  });

  it("知らない id が混じっていたら null", () => {
    expect(reorderMatches(config, ["m1-0", "m1-1", "m9-9"])).toBeNull();
  });

  it("組み合わせが空で並びも空なら空を返す", () => {
    expect(reorderMatches({ version: 1, matches: [] }, [])).toEqual({
      version: 1,
      matches: [],
    });
  });
});
```

- [ ] **Step 2: 落ちることを確認する**

Run: `pnpm exec vitest run src/features/division/reorder-matches/domain.test.ts`

Expected: FAIL（`./domain` が無い）

- [ ] **Step 3: 純粋関数を実装する**

Create: `src/features/division/reorder-matches/domain.ts`

```ts
import type { BracketMatch, MatchingConfig } from "@/lib/division/types";

/**
 * 指定の並びで実施順と試合番号を振り直す。
 *
 * 書き換えるのは sequence と matchNumber だけで、id / round / order / slots は
 * そのまま写す。id を保つので、results（matchId で試合を指す）と
 * ScheduleItem（(divisionId, matchId) で指す）の参照は壊れない。
 * round / order を保つので、トーナメントのブラケットの絵も動かない。
 *
 * 送られた id の並びが現在の組み合わせとちょうど一致しない（件数違い・重複・
 * 未知の id）場合は null を返す。画面が古い（別の誰かが組み合わせを作り直した）
 * ときに起きるもので、部分的に書くと試合が消えた組み合わせになるため、
 * 呼び出し側が「何も書かずに読み直しを促す」に倒せるようにする。
 */
export const reorderMatches = (
  config: MatchingConfig,
  matchIds: string[],
): MatchingConfig | null => {
  if (matchIds.length !== config.matches.length) {
    return null;
  }
  if (new Set(matchIds).size !== matchIds.length) {
    return null;
  }

  const byId = new Map(config.matches.map((match) => [match.id, match]));
  const matches: BracketMatch[] = [];

  for (const [sequence, matchId] of matchIds.entries()) {
    const match = byId.get(matchId);
    if (match === undefined) {
      return null;
    }
    matches.push({ ...match, sequence, matchNumber: String(sequence + 1) });
  }

  return { version: 1, matches };
};
```

- [ ] **Step 4: 通ることを確認する**

Run: `pnpm exec vitest run src/features/division/reorder-matches/domain.test.ts`

Expected: PASS

- [ ] **Step 5: エラーと文言を足す**

`src/features/division/errors.ts` に足す（`DivisionMatchNumberConflictError` の下あたり）。

```ts
/** 送られてきた並び順が現在の組み合わせと一致しないことを表す。 */
export class DivisionMatchOrderError extends Data.TaggedError(
  "DivisionMatchOrderError",
)<{
  readonly divisionId: string;
}> {}
```

`DivisionError` の union に `| DivisionMatchOrderError` を足し、`divisionErrorTags` に `DivisionMatchOrderError: true,` を足す（union だけ足すとコンパイルエラーになる）。

`src/features/division/messages.ts` に足す。

```ts
    Match.tag(
      "DivisionMatchOrderError",
      () => "並び順が古くなっています。画面を再読み込みしてください",
    ),
```

Run: `pnpm typecheck`
Expected: PASS（`Match.exhaustive` が満たされる）

- [ ] **Step 6: 入力の検証（schema）と usecase を書く**

Create: `src/features/division/reorder-matches/schema.ts`

```ts
import { z } from "zod";

export const reorderMatchesSchema = z.object({
  matchIds: z
    .array(z.string().min(1, "並び順が不正です"))
    .min(1, "並び順が不正です"),
});

export type ReorderMatchesInput = z.infer<typeof reorderMatchesSchema>;
```

Create: `src/features/division/reorder-matches/usecase.ts`

```ts
import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { ReorderMatchesPort } from "./repository";
import type { ReorderMatchesInput } from "./schema";

export const reorderMatchesForDivision = (
  port: ReorderMatchesPort,
  ids: DivisionIds,
  input: ReorderMatchesInput,
): Effect.Effect<DivisionSetupOutcome<null>, DivisionError> => port(ids, input);
```

- [ ] **Step 7: repository の失敗するテストを書く**

Create: `src/features/division/reorder-matches/repository.test.ts`

```ts
import { Cause, Effect, Exit, Option } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildFromSlots } from "../single-elimination/build";

const divisionFindFirst = vi.fn();
const divisionUpdateMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (run: (tx: unknown) => Promise<unknown>) =>
      run({
        division: {
          findFirst: (args: unknown) => divisionFindFirst(args),
          updateMany: (args: unknown) => divisionUpdateMany(args),
        },
      }),
  },
}));

const { reorderMatchesInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };

// e1 vs e2 / e3 vs e4 / 決勝 の 3 試合
const config = buildFromSlots([
  { kind: "entry", entryId: "e1" },
  { kind: "entry", entryId: "e2" },
  { kind: "entry", entryId: "e3" },
  { kind: "entry", entryId: "e4" },
]);
const entries = {
  version: 1,
  entries: [
    { id: "e1", participantId: "p1", seed: 0 },
    { id: "e2", participantId: "p2", seed: 1 },
    { id: "e3", participantId: "p3", seed: 2 },
    { id: "e4", participantId: "p4", seed: 3 },
  ],
};

beforeEach(() => {
  divisionFindFirst.mockReset();
  divisionUpdateMany.mockReset();
  divisionFindFirst.mockResolvedValue({
    format: "SINGLE_ELIMINATION",
    entries,
    matchingConfig: config,
  });
  divisionUpdateMany.mockResolvedValue({ count: 1 });
});

describe("reorderMatchesInDb", () => {
  it("送られた順で実施順と試合番号を書き直す", async () => {
    const outcome = await Effect.runPromise(
      reorderMatchesInDb(ids, { matchIds: ["m2-0", "m1-0", "m1-1"] }),
    );

    expect(outcome).toEqual({ found: true, value: null });
    const written = divisionUpdateMany.mock.calls[0][0].data.matchingConfig;
    expect(written.matches.map((match: { id: string }) => match.id)).toEqual([
      "m2-0",
      "m1-0",
      "m1-1",
    ]);
    expect(
      written.matches.map((match: { sequence: number }) => match.sequence),
    ).toEqual([0, 1, 2]);
    expect(
      written.matches.map((match: { matchNumber: string }) => match.matchNumber),
    ).toEqual(["1", "2", "3"]);
  });

  it("所有権を where に入れて読む", async () => {
    await Effect.runPromise(
      reorderMatchesInDb(ids, { matchIds: ["m1-0", "m1-1", "m2-0"] }),
    );

    expect(divisionFindFirst.mock.calls[0][0].where).toEqual({
      id: "d1",
      tournament: { id: "t1", organizationId: "o1" },
    });
  });

  it("部門が無ければ found: false", async () => {
    divisionFindFirst.mockResolvedValue(null);

    const outcome = await Effect.runPromise(
      reorderMatchesInDb(ids, { matchIds: ["m1-0", "m1-1", "m2-0"] }),
    );

    expect(outcome).toEqual({ found: false });
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("編集画面を持たない形式なら found: false", async () => {
    // Server Action はページを経由せず叩けるので、形式もここで確かめる。
    divisionFindFirst.mockResolvedValue({
      format: "DOUBLE_ELIMINATION_GRAND_FINAL",
      entries,
      matchingConfig: config,
    });

    const outcome = await Effect.runPromise(
      reorderMatchesInDb(ids, { matchIds: ["m1-0", "m1-1", "m2-0"] }),
    );

    expect(outcome).toEqual({ found: false });
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("並びが現在の組み合わせと合わなければ DivisionMatchOrderError で何も書かない", async () => {
    const exit = await Effect.runPromiseExit(
      reorderMatchesInDb(ids, { matchIds: ["m1-0", "m1-1"] }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const error = Cause.failureOption(exit.cause);
      expect(Option.isSome(error) && error.value._tag).toBe(
        "DivisionMatchOrderError",
      );
    }
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("勝敗が記録されていても並べ替えられる", async () => {
    // runDivisionSetup を使わない理由がここ。results は matchId で試合を
    // 指しており、並べ替えは id を変えないので参照は壊れない。
    // このテストは repository が results を読まないことで満たされる。
    divisionFindFirst.mockResolvedValue({
      format: "SINGLE_ELIMINATION",
      entries,
      matchingConfig: config,
    });

    const outcome = await Effect.runPromise(
      reorderMatchesInDb(ids, { matchIds: ["m2-0", "m1-0", "m1-1"] }),
    );

    expect(outcome).toEqual({ found: true, value: null });
    expect(divisionFindFirst.mock.calls[0][0].select.results).toBeUndefined();
  });
});
```

- [ ] **Step 8: 落ちることを確認する**

Run: `pnpm exec vitest run src/features/division/reorder-matches/repository.test.ts`

Expected: FAIL（`./repository` が無い）

- [ ] **Step 9: repository を実装する**

Create: `src/features/division/reorder-matches/repository.ts`

```ts
import "server-only";
import { Effect } from "effect";
import {
  parseDivisionEntries,
  parseMatchingConfig,
} from "@/lib/division/parse";
import { validateMatchingConfig } from "@/lib/division/validate";
import { prisma } from "@/shared/db/prisma";
import {
  DivisionDataError,
  type DivisionError,
  DivisionMatchOrderError,
  toDivisionError,
} from "../errors";
import { isEditableFormat } from "../matching-strategy";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import { reorderMatches } from "./domain";
import type { ReorderMatchesInput } from "./schema";

export type ReorderMatchesPort = (
  ids: DivisionIds,
  input: ReorderMatchesInput,
) => Effect.Effect<DivisionSetupOutcome<null>, DivisionError>;

/**
 * 実施順と試合番号だけを書き換える。試合の id も対戦カードも変えないため、
 * results（matchId で試合を指す）と ScheduleItem（(divisionId, matchId) で
 * 指す）の参照は壊れない。だから勝敗記録後でも並べ替えられる。
 * runDivisionSetup は results が 1 件でもあると拒否する読み出しなので、
 * ここでは使わず専用のトランザクションを書く（set-match-number と同じ理由）。
 */
export const reorderMatchesInDb: ReorderMatchesPort = (ids, input) =>
  Effect.tryPromise({
    try: () =>
      prisma.$transaction(async (tx): Promise<DivisionSetupOutcome<null>> => {
        const row = await tx.division.findFirst({
          where: {
            id: ids.divisionId,
            tournament: {
              id: ids.tournamentId,
              organizationId: ids.organizationId,
            },
          },
          select: { format: true, entries: true, matchingConfig: true },
        });
        // 編集画面を持たない形式は setup-store と同じく「無い」に倒す。
        if (!row || !isEditableFormat(row.format)) {
          return { found: false };
        }

        const next = reorderMatches(
          parseMatchingConfig(row.matchingConfig),
          input.matchIds,
        );
        // 画面が古い（別の誰かが組み合わせを作り直した）。一部だけ書くと
        // 試合が消えた組み合わせになるので、何も書かずに読み直しを促す。
        if (next === null) {
          throw new DivisionMatchOrderError({ divisionId: ids.divisionId });
        }

        // setup-store の save と同じく、書く直前に検証を通す。
        const errors = validateMatchingConfig(
          next,
          parseDivisionEntries(row.entries),
        );
        if (errors.length > 0) {
          throw new DivisionDataError({ reason: errors });
        }

        await tx.division.updateMany({
          where: {
            id: ids.divisionId,
            tournament: {
              id: ids.tournamentId,
              organizationId: ids.organizationId,
            },
          },
          data: { matchingConfig: next },
        });
        return { found: true, value: null };
      }),
    catch: (reason) => toDivisionError(reason, ids.tournamentId),
  });
```

- [ ] **Step 10: 通ることを確認する**

Run: `pnpm exec vitest run src/features/division/reorder-matches/repository.test.ts`

Expected: PASS

- [ ] **Step 11: handler の失敗するテストを書く**

Create: `src/features/division/reorder-matches/handler.test.ts`。`src/features/division/set-match-number/handler.test.ts` のモックの組み方をそのまま写し、対象だけ差し替える。

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrganization = vi.fn();
const reorderMatchesInDb = vi.fn();
const revalidateDivisionSetup = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

// 関数呼び出しの順序を追跡するための配列
let calls: string[] = [];

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => {
    calls.push("requireOrganization");
    return requireOrganization(slug);
  },
}));
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("../revalidate", () => ({
  revalidateDivisionSetup: (
    slug: string,
    tournamentId: string,
    divisionId: string,
  ) => revalidateDivisionSetup(slug, tournamentId, divisionId),
}));
vi.mock("./repository", () => ({
  reorderMatchesInDb: (ids: unknown, input: unknown) => {
    calls.push("reorderMatchesInDb");
    return reorderMatchesInDb(ids, input);
  },
}));

const { reorderMatchesAction } = await import("./handler");

const formData = (matchIds: string[]) => {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("tournamentId", "t1");
  data.set("divisionId", "d1");
  for (const matchId of matchIds) {
    data.append("matchId", matchId);
  }
  return data;
};

beforeEach(() => {
  calls = [];
  requireOrganization.mockReset();
  reorderMatchesInDb.mockReset();
  revalidateDivisionSetup.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({ organization: { id: "o1" } });
  reorderMatchesInDb.mockReturnValue(
    Effect.succeed({ found: true, value: null }),
  );
});

describe("reorderMatchesAction", () => {
  it("並びを渡して保存し、画面を再検証する", async () => {
    const state = await reorderMatchesAction(
      { error: null },
      formData(["m2-0", "m1-0"]),
    );

    expect(state).toEqual({ error: null });
    expect(reorderMatchesInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1", divisionId: "d1" },
      { matchIds: ["m2-0", "m1-0"] },
    );
    expect(revalidateDivisionSetup).toHaveBeenCalledWith("acme", "t1", "d1");
  });

  it("保存の前に所属を確かめる", async () => {
    await reorderMatchesAction({ error: null }, formData(["m1-0"]));

    expect(calls).toEqual(["requireOrganization", "reorderMatchesInDb"]);
  });

  it("並びが空なら保存せずエラーを返す", async () => {
    const state = await reorderMatchesAction({ error: null }, formData([]));

    expect(state.error).toBe("並び順が不正です");
    expect(reorderMatchesInDb).not.toHaveBeenCalled();
  });

  it("部門が無ければ notFound", async () => {
    reorderMatchesInDb.mockReturnValue(Effect.succeed({ found: false }));

    await expect(
      reorderMatchesAction({ error: null }, formData(["m1-0"])),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(revalidateDivisionSetup).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 12: 落ちることを確認する**

Run: `pnpm exec vitest run src/features/division/reorder-matches/handler.test.ts`

Expected: FAIL（`./handler` が無い）

- [ ] **Step 13: handler を実装する**

Create: `src/features/division/reorder-matches/handler.ts`

```ts
"use server";

import { Effect, Exit } from "effect";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import { revalidateDivisionSetup } from "../revalidate";
import type { DivisionFormState } from "../state";
import { reorderMatchesInDb } from "./repository";
import { reorderMatchesSchema } from "./schema";
import { reorderMatchesForDivision } from "./usecase";

export const reorderMatchesAction = async (
  _prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const divisionId = String(formData.get("divisionId") ?? "");
  // Server Action はページを経由せず直接叩ける別の入口なので、ここで独立に確かめる。
  const { organization } = await requireOrganization(slug);

  // 画面は行ごとの hidden input ではなく、並べ替え後の順に matchId を
  // 並べて送る。getAll の順が FormData に足した順になるので、それが並び。
  const parsed = reorderMatchesSchema.safeParse({
    matchIds: formData.getAll("matchId").map(String),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    reorderMatchesForDivision(
      reorderMatchesInDb,
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

  revalidateDivisionSetup(slug, tournamentId, divisionId);
  return { error: null };
};
```

- [ ] **Step 14: 全テストと型検査を通す**

Run: `pnpm exec vitest run` と `pnpm typecheck`

Expected: どちらも PASS

- [ ] **Step 15: lint とコミット**

Run: `pnpm lint`

```bash
git add -A
git commit -m "feat(division): add reorder-matches slice

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: ドラッグ判定の純粋関数を共通層へ移す

`components/schedule/schedule-drag.ts` の `resolveDragReorder` を、部門の一覧からも使えるように `lib/dnd/reorder.ts` へ移す。振る舞いは変えない。

**Files:**
- Create: `src/lib/dnd/reorder.ts`（`src/components/schedule/schedule-drag.ts` の移設）
- Create: `src/lib/dnd/reorder.test.ts`（`src/components/schedule/schedule-drag.test.ts` の移設）
- Delete: `src/components/schedule/schedule-drag.ts`, `src/components/schedule/schedule-drag.test.ts`
- Modify: `src/components/schedule/ScheduleList.tsx`（import 元）

**Interfaces:**
- Consumes: なし
- Produces: `resolveDragReorder(keys: string[], activeId: string, overId: string | null): string[] | null` — `@/lib/dnd/reorder` から import する。Task 6 が使う

- [ ] **Step 1: ファイルを移す**

```bash
mkdir -p src/lib/dnd
git mv src/components/schedule/schedule-drag.ts src/lib/dnd/reorder.ts
git mv src/components/schedule/schedule-drag.test.ts src/lib/dnd/reorder.test.ts
```

- [ ] **Step 2: import とコメントを直す**

`src/lib/dnd/reorder.test.ts` の import を `./reorder` に直す。

`src/components/schedule/ScheduleList.tsx` の

```ts
import { resolveDragReorder } from "./schedule-drag";
```

を

```ts
import { resolveDragReorder } from "@/lib/dnd/reorder";
```

に変える（import の並び順は Biome が決めるので、`pnpm lint:fix` に任せてよい）。

`src/lib/dnd/reorder.ts` の関数コメントの置き場所の説明を、移設後の事実に合わせて書き直す。

```ts
/**
 * ドラッグの結果を並べ替え後のキー配列に直す。並べ替えにならない場合は null。
 *
 * D&D の実操作は jsdom で再現しにくいので、判断をここへ切り出して
 * 単体でテストできるようにしてある。コンポーネントは呼ぶだけにする。
 *
 * 大会の進行順（components/schedule）と部門の試合の実施順
 * （components/division）が同じ判断を必要とするため、どちらからも
 * 参照できる下位共通層に置く。lib は features / components を
 * 参照できない層なので、この関数がライブラリにも画面にも依存しない
 * 純粋関数であることが構造的に保たれる。
 *
 * @dnd-kit/sortable の arrayMove を使わないのは、この関数を
 * ライブラリに依存しない純粋関数に保ってテストを軽くするため。
 */
```

- [ ] **Step 3: テストと型検査を通す**

Run: `pnpm exec vitest run src/lib/dnd/reorder.test.ts src/components/schedule` と `pnpm typecheck`

Expected: どちらも PASS

- [ ] **Step 4: lint とコミット**

Run: `pnpm lint`

```bash
git add -A
git commit -m "refactor: move drag reorder helper to lib/dnd

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
## Task 6: 実施順の一覧（D&D）を作り、両方の画面に配線する

**Files:**
- Create: `src/components/division/MatchOrderList.tsx`
- Create: `src/components/division/MatchOrderList.test.tsx`
- Modify: `src/components/division/MatchNumberRow.tsx`（`<li>` をやめる）
- Modify: `src/components/division/LeagueSetup.tsx`, `src/components/division/DivisionSetup.tsx`
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/league/page.tsx`
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.tsx`
- Delete: `src/components/division/MatchNumberList.tsx`, `src/components/division/MatchNumberList.test.tsx`
- Modify: `src/components/division/LeagueSetup.test.tsx`, `src/components/division/DivisionSetup.test.tsx`, および上記 2 ページの `page.test.tsx`（`actions` の組に新しい action が増えるため）

**Interfaces:**
- Consumes: `toMatchOrderView`（Task 2）、`reorderMatchesAction`（Task 4）、`resolveDragReorder`（Task 5）、`MatchNumberRowView` / `DivisionFormAction`
- Produces: `MatchOrderList` — props は
  `{ rows: MatchNumberRowView[]; slug: string; tournamentId: string; divisionId: string; reorderAction: DivisionFormAction; setMatchNumberAction: DivisionFormAction; emptyMessage: string }`

- [ ] **Step 1: 一覧の失敗するテストを書く**

Create: `src/components/division/MatchOrderList.test.tsx`。既存の `src/components/division/MatchNumberList.test.tsx` の描画まわりの観点を引き継ぐ。

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MatchNumberRowView } from "@/features/division/match-number-view";
import { MatchOrderList } from "./MatchOrderList";

const rows: MatchNumberRowView[] = [
  {
    matchId: "m1-0",
    matchNumber: "1",
    label: "1回戦 第1試合",
    card: "山田 vs 佐藤",
  },
  {
    matchId: "m1-1",
    matchNumber: "2",
    label: "1回戦 第2試合",
    card: "鈴木 vs 田中",
  },
];

const noop = vi.fn(async () => ({ error: null }));

const renderList = (list: MatchNumberRowView[]) =>
  render(
    <MatchOrderList
      rows={list}
      slug="acme"
      tournamentId="t1"
      divisionId="d1"
      reorderAction={noop}
      setMatchNumberAction={noop}
      emptyMessage="まだ組み合わせがありません"
    />,
  );

describe("MatchOrderList", () => {
  it("渡された順に行を出す", () => {
    renderList(rows);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("1回戦 第1試合");
    expect(items[0]).toHaveTextContent("山田 vs 佐藤");
    expect(items[1]).toHaveTextContent("1回戦 第2試合");
  });

  it("行ごとに試合番号の編集フォームを出す", () => {
    renderList(rows);

    expect(
      screen.getByLabelText("1回戦 第1試合の試合番号"),
    ).toHaveValue("1");
  });

  it("行ごとに区別できる名前のドラッグハンドルを出す", () => {
    // 一覧には似た行が並ぶので、ハンドルの名前に行の中身を混ぜる。
    // 固定文言だと支援技術には同じ名前のボタンが並んで見える。
    renderList(rows);

    expect(
      screen.getByRole("button", {
        name: "1行目 1回戦 第1試合をドラッグして並べ替え",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "2行目 1回戦 第2試合をドラッグして並べ替え",
      }),
    ).toBeInTheDocument();
  });

  it("行が無ければ渡された文言を出す", () => {
    renderList([]);

    expect(
      screen.getByText("まだ組み合わせがありません"),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 落ちることを確認する**

Run: `pnpm exec vitest run src/components/division/MatchOrderList.test.tsx`

Expected: FAIL（`./MatchOrderList` が無い）

- [ ] **Step 3: `MatchNumberRow` を行の中身だけにする**

`src/components/division/MatchNumberRow.tsx` の `<li>` を `<div>` に変え、枠の見た目は一覧側の `<li>` に持たせる。コメントも直す。

```tsx
/**
 * 1 行の中身。1 行 1 フォームで、useActionState を行ごとに持たせ、
 * エラーをその行の隣に出す。試合番号は組み合わせの構造を変えないため、
 * 勝敗記録後も編集できる（disabled を受け取らないのは意図）。
 *
 * <li> を返さないのは、一覧側（MatchOrderList）が行の枠とドラッグハンドルを
 * 持つため。行の見た目と掴む場所を一覧に集めておくと、この部品は
 * 「試合番号を直す口」だけに集中できる。
 */
```

```tsx
  return (
    <div className="flex flex-1 items-center justify-between gap-4">
```

閉じタグも `</div>` に変える。

- [ ] **Step 4: `MatchOrderList` を実装する**

Create: `src/components/division/MatchOrderList.tsx`

```tsx
"use client";

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { ReactNode } from "react";
import { useActionState, useTransition } from "react";
import type { MatchNumberRowView } from "@/features/division/match-number-view";
import {
  type DivisionFormAction,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";
import { resolveDragReorder } from "@/lib/dnd/reorder";
import { MatchNumberRow } from "./MatchNumberRow";

/**
 * 1 行ぶんの並べ替え可能な枠。掴む場所をハンドルのボタンに限るのは、
 * 行の中に試合番号の入力欄と保存ボタンがあり、行全体を掴めるようにすると
 * 文字を選択できなくなるため（components/schedule/ScheduleList.tsx と同じ形）。
 *
 * transform を translate3d に自前で直しているのは、@dnd-kit/utilities を
 * 依存に足さないため。縦一列の並べ替えなので y だけ見れば足りる。
 */
function SortableRow({
  id,
  name,
  disabled,
  children,
}: {
  id: string;
  name: string;
  /** 並べ替えの保存中。掴めてしまうと古い並びから計算して先の保存を打ち消す。 */
  disabled: boolean;
  children: ReactNode;
}) {
  const sortable = useSortable({ id, disabled });

  return (
    <li
      ref={sortable.setNodeRef}
      style={{
        transform: sortable.transform
          ? `translate3d(0, ${sortable.transform.y}px, 0)`
          : undefined,
        transition: sortable.transition,
      }}
      className={
        sortable.isDragging
          ? "flex items-center gap-3 rounded border border-slate-800 bg-slate-50 px-4 py-3"
          : "flex items-center gap-3 rounded border border-slate-200 bg-white px-4 py-3"
      }
    >
      <button
        type="button"
        disabled={disabled}
        aria-label={`${name}をドラッグして並べ替え`}
        className="cursor-grab rounded px-1 text-slate-400 disabled:cursor-default disabled:opacity-30"
        {...sortable.listeners}
        {...sortable.attributes}
      >
        ⠿
      </button>
      {children}
    </li>
  );
}

/**
 * 部門の試合を実施順に並べた一覧。行はドラッグで入れ替えられ、
 * 同じ行が試合番号の編集フォームを兼ねる。
 *
 * トーナメントとリーグで同じ部品を使う。並べ替えが変えるのは実施順と
 * 試合番号だけで、ブラケット上の位置（round/order）は動かさないため、
 * 形式によって挙動を分ける必要が無い。
 */
export function MatchOrderList({
  rows,
  slug,
  tournamentId,
  divisionId,
  reorderAction,
  setMatchNumberAction,
  emptyMessage,
}: {
  /** 実施順に並べて渡す。この並びがそのまま画面の並びになる。 */
  rows: MatchNumberRowView[];
  slug: string;
  tournamentId: string;
  divisionId: string;
  reorderAction: DivisionFormAction;
  setMatchNumberAction: DivisionFormAction;
  /** 行が 1 つも無いときの文言。画面ごとに言い方が違う。 */
  emptyMessage: string;
}) {
  const [reorderState, reorder, reordering] = useActionState(
    reorderAction,
    INITIAL_DIVISION_FORM_STATE,
  );
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const keys = rows.map((row) => row.matchId);

  const handleDragEnd = (event: DragEndEvent): void => {
    const next = resolveDragReorder(
      keys,
      String(event.active.id),
      event.over === null ? null : String(event.over.id),
    );
    if (next === null) {
      return;
    }

    // フォーム要素を経由せずに送るため、FormData をここで組み立てる。
    // 行ごとの hidden input にすると、ドラッグ中の並びと送信内容がずれる。
    const data = new FormData();
    data.set("slug", slug);
    data.set("tournamentId", tournamentId);
    data.set("divisionId", divisionId);
    for (const matchId of next) {
      data.append("matchId", matchId);
    }
    startTransition(() => reorder(data));
  };

  if (rows.length === 0) {
    return <p className="text-sm text-slate-600">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-2">
      <p aria-live="polite" className="text-xs text-slate-500">
        {reordering
          ? "並べ替えを保存中..."
          : "左端をドラッグすると実施順を入れ替えられます。並べ替えると試合番号は先頭から振り直されます。対戦表を作り直すと、実施順と試合番号は既定に戻ります"}
      </p>

      {reorderState.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {reorderState.error}
        </p>
      )}

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={keys} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {rows.map((row, index) => (
              <SortableRow
                key={row.matchId}
                id={row.matchId}
                name={`${index + 1}行目 ${row.label}`}
                disabled={reordering}
              >
                <MatchNumberRow
                  row={row}
                  slug={slug}
                  tournamentId={tournamentId}
                  divisionId={divisionId}
                  action={setMatchNumberAction}
                />
              </SortableRow>
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
```

- [ ] **Step 5: 一覧のテストが通ることを確認する**

Run: `pnpm exec vitest run src/components/division/MatchOrderList.test.tsx`

Expected: PASS

- [ ] **Step 6: 2 つの画面を差し替える**

`src/components/division/LeagueSetup.tsx`:

* `LeagueSetupActions` に `reorderMatches: DivisionFormAction;` を足す
* import を `MatchNumberList` から `MatchOrderList` に変える
* Task 3 で差し替えた区画を書き換える

```tsx
          <MatchOrderList
            rows={toMatchOrderView(
              parsed.matchingConfig,
              parsed.entries,
              participants,
              division.format,
            )}
            slug={slug}
            tournamentId={tournamentId}
            divisionId={division.id}
            reorderAction={actions.reorderMatches}
            setMatchNumberAction={actions.setMatchNumber}
            emptyMessage="まだ対戦表がありません"
          />
```

`src/components/division/DivisionSetup.tsx`:

* `DivisionSetupActions` に `reorderMatches: DivisionFormAction;` を足す
* 区画の見出しを `試合番号` から `試合の実施順` に変える
* コメント `{/* 番号の変更は構造を変えないため、locked でも編集できる */}` を
  `{/* 実施順と番号の変更は構造を変えないため、locked でも編集できる */}` に変える
* `MatchNumberList` を `MatchOrderList` に差し替える

```tsx
          <MatchOrderList
            rows={toMatchOrderView(
              parsed.matchingConfig,
              parsed.entries,
              participants,
              division.format,
            )}
            slug={slug}
            tournamentId={tournamentId}
            divisionId={division.id}
            reorderAction={actions.reorderMatches}
            setMatchNumberAction={actions.setMatchNumber}
            emptyMessage="まだ組み合わせがありません"
          />
```

Delete: `src/components/division/MatchNumberList.tsx`, `src/components/division/MatchNumberList.test.tsx`

- [ ] **Step 7: ページから Server Action を渡す**

`.../divisions/[divisionId]/league/page.tsx` と `.../divisions/[divisionId]/setup/page.tsx` の両方に足す。

```ts
import { reorderMatchesAction } from "@/features/division/reorder-matches/handler";
```

```tsx
          actions={{
            ...
            reorderMatches: reorderMatchesAction,
          }}
```

- [ ] **Step 8: 画面のテストを直す**

`LeagueSetup.test.tsx` / `DivisionSetup.test.tsx` / 2 つの `page.test.tsx` で、`actions` を組み立てている箇所に `reorderMatches` を足す（型エラーが出る場所がそのまま直す場所）。`DivisionSetup.test.tsx` の見出し `"試合番号"` を探しているテストは `"試合の実施順"` に直す。

Run: `pnpm exec vitest run src/components src/app` と `pnpm typecheck`

Expected: どちらも PASS

- [ ] **Step 9: 全テストを通す**

Run: `pnpm exec vitest run`

Expected: PASS

- [ ] **Step 10: lint とコミット**

Run: `pnpm lint`

```bash
git add -A
git commit -m "feat(division): reorder matches by drag and drop

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: 実機で確かめて仕上げる

**Files:** なし（確認のみ。直すべき点が見つかったら該当タスクのファイルを直す）

**Interfaces:**
- Consumes: Task 1〜6 のすべて
- Produces: なし

- [ ] **Step 1: 型・テスト・lint を通しで流す**

Run: `pnpm typecheck` / `pnpm exec vitest run` / `pnpm lint`

Expected: すべて PASS（lint は CRLF 由来のエラーを除く）

- [ ] **Step 2: 開発サーバを起動する**

`.env` がある状態で起動する。ローカルは認証を迂回できる（`AGENTS.md`）。

```bash
BYPASS_AUTH=1 pnpm dev
```

ブラウザで Cookie に `USER_ID=1` を設定してからアクセスする。

- [ ] **Step 3: リーグの画面を確かめる**

`/orgs/<slug>/tournaments/<id>/divisions/<id>/league` を開く（`ROUND_ROBIN` の部門）。

確かめること:
* 「節」の見出しと「休み: 〜」が無く、試合が 1 本の並びで出る
* 行の左端をドラッグして入れ替えると、並びが変わり試合番号が 1 から振り直される
* 再読み込みしても並びが残る
* 星取表のマスの試合番号が、振り直したあとの番号になっている

- [ ] **Step 4: トーナメントの画面を確かめる**

`/orgs/<slug>/tournaments/<id>/divisions/<id>/setup` を開く（`SINGLE_ELIMINATION` の部門）。

確かめること:
* 「試合の実施順」の一覧をドラッグで入れ替えられる
* **入れ替えても下の「プレビュー」のブラケットの形が変わらない**（ここが崩れたら `round`/`order` を触ってしまっている）
* 1 回戦スロットの D&D（シード位置）は今までどおり動く

- [ ] **Step 5: 大会の進行順を確かめる**

`/orgs/<slug>/tournaments/<id>/matches` を開く。

確かめること:
* 部門で決めた実施順が、行を 1 つも保存していない大会の既定の並びに反映されている
* リーグの試合の位置文言が「第N試合」になっている（「第N節」が残っていない）

> ローカル DB では `ScheduleItem` テーブルが無く `/matches` が 500 になることがある（マイグレーションは記録済みだがテーブルが無い状態）。その場合は `pnpm db:deploy` でテーブルを作ってから開く。

- [ ] **Step 6: 見つかった不具合を直してコミットする**

直した場合は、そのタスクの観点でテストを足してから直す（TDD）。

```bash
git add -A
git commit -m "fix(division): <直した内容>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: ブランチを仕上げる**

REQUIRED SUB-SKILL: `superpowers:finishing-a-development-branch` を使い、マージ / PR / 後片付けの進め方を選ぶ。
