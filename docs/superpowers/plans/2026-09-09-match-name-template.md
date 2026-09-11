# 試合名のテンプレート化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 各試合の表示名を自由文字列のテンプレートにし、`{{OverallSeq}}` / `{{DivisionSeq}}` を mustache で展開して表示する。

**Architecture:** `BracketMatch.matchNumber` を `matchName` に改め、値をテンプレート文字列として持つ。`{{DivisionSeq}}` は `sequence + 1`、`{{OverallSeq}}` は大会の進行順（`ScheduleItem` の並び + 未配置の試合を部門 order → sequence で末尾に足したもの）の試合行だけを 1 から数えた通し番号。通し番号の算出（`lib/division/overall-order.ts`）と展開（`lib/division/match-name.ts`）は下位共通層の純粋関数に置き、`features/division` と `features/schedule` の両方から使う。表示する画面はすべて大会全体を読んで展開済みの文字列を渡す。

**Tech Stack:** Next.js 16 (App Router) / React 19 / TypeScript / Prisma 7 / Effect / Zod v4 / Vitest + Testing Library / Tailwind v4 / Biome / **mustache（本タスクで追加）**

**設計書:** [docs/superpowers/specs/2026-09-09-match-name-template-design.md](../specs/2026-09-09-match-name-template-design.md)

## Global Constraints

- パッケージマネージャは **pnpm**。`pnpm add` / `pnpm exec` を使う（npm / yarn は使わない）。
- 検証コマンド: `pnpm typecheck` / `pnpm test` / `pnpm lint`。
- **ワークツリーで作業する場合**、最初に 2 つの準備が要る（どちらも欠けると `pnpm typecheck` が落ちる）:
  - メインのチェックアウトから `.env` をコピーする
  - `pnpm install` 後に `pnpm exec next typegen` を実行する（`PageProps` 型が生成される）
- **Biome の CRLF ノイズ**: このリポジトリは Windows チェックアウトで CRLF になっており、`pnpm lint` が触っていないファイルにも改行由来のエラーを出す。lint の合否は自分が書いた内容で判断し、CRLF だけの指摘は無視する。
- 既定の試合名テンプレートは `"第{{DivisionSeq}}試合"`（定数 `DEFAULT_MATCH_NAME`）。この文字列を各所にベタ書きせず、必ず定数を参照する。
- 変数名は `OverallSeq` / `DivisionSeq`。大文字小文字を含めてこの綴りが正（mustache は大小文字を区別する）。
- コメントと UI 文言は日本語。既存ファイルのコメントの粒度・語り口に合わせる（「なぜそうするか」を書く）。
- 試合名の一意性は要求しない。部門内で全試合が同じ文字列になるのが正常な状態。
- 旧 `matchNumber` の値は読み継がない。読み出しで `DEFAULT_MATCH_NAME` を入れる。
- コミットは各タスクの末尾で 1 回。コミットメッセージ末尾に必ず次の 2 行（空行 + 署名）を入れる:
  ```
  
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```

## File Structure

**新規作成**

| ファイル | 責務 |
|---|---|
| `src/lib/division/match-name.ts` | 既定値の定数、mustache による展開、部門の全試合の名前解決 |
| `src/lib/division/match-name.test.ts` | 同上のテスト |
| `src/lib/division/overall-order.ts` | 大会全体の通し番号の算出（純粋関数） |
| `src/lib/division/overall-order.test.ts` | 同上のテスト |

**改名（ディレクトリ・ファイルごと）**

| 現在 | 変更後 |
|---|---|
| `src/features/division/set-match-number/` | `src/features/division/set-match-name/` |
| `src/features/division/match-number-view.ts` | `src/features/division/match-name-view.ts` |
| `src/features/division/match-number-view.test.ts` | `src/features/division/match-name-view.test.ts` |
| `src/components/division/MatchNumberRow.tsx` | `src/components/division/MatchNameRow.tsx` |

**主な変更**

| ファイル | 変更内容 |
|---|---|
| `src/lib/division/types.ts` | `matchNumber` → `matchName` |
| `src/lib/division/parse.ts` | 補完を `DEFAULT_MATCH_NAME` に |
| `src/lib/division/validate.ts` | 重複ルール削除、空チェックは残す |
| `src/lib/division/label.ts` | `createSlotLabeler` が解決済みの名前を受け取る |
| `src/features/division/single-elimination/build.ts` | 既定値 |
| `src/features/division/round-robin/build.ts` | 既定値 |
| `src/features/division/round-robin/view.ts` | 星取表のマスに解決済みの名前 |
| `src/features/division/reorder-matches/domain.ts` | 名前を振り直さない |
| `src/features/division/repository.ts` | `listOverallOrderSources` を追加 |
| `src/features/division/errors.ts` / `messages.ts` | 重複エラーの削除 |
| `src/features/schedule/domain.ts` / `types.ts` | `buildOverallSeq` 経由、行に解決済みの名前 |
| `src/features/schedule/result-rows.ts` | フィールド改名 |
| `src/features/bracket/types.ts` / `from-division.ts` | フィールド改名 |
| 各コンポーネント | `第{...}試合` のラッパー除去、プレビュー、変数の説明 |
| 各ページ | `overallSeq` の配線 |

---

### Task 1: mustache の導入と試合名の展開

**Files:**
- Modify: `package.json`（`pnpm add` が書き換える）
- Create: `src/lib/division/match-name.ts`
- Test: `src/lib/division/match-name.test.ts`

**Interfaces:**
- Consumes: `BracketMatch`（`src/lib/division/types.ts`。この時点ではまだ `matchNumber` という名前だが、このタスクでは `BracketMatch` を import しない）
- Produces:
  - `DEFAULT_MATCH_NAME: string` = `"第{{DivisionSeq}}試合"`
  - `renderMatchName(template: string, vars: { OverallSeq: number; DivisionSeq: number }): string`

- [ ] **Step 1: mustache を入れる**

```bash
pnpm add mustache
pnpm add -D @types/mustache
```

- [ ] **Step 2: 失敗するテストを書く**

`src/lib/division/match-name.test.ts` を新規作成:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_MATCH_NAME, renderMatchName } from "./match-name";

const vars = { OverallSeq: 5, DivisionSeq: 2 };

describe("DEFAULT_MATCH_NAME", () => {
  it("既定値は部門内の通し番号で「第N試合」になる", () => {
    expect(renderMatchName(DEFAULT_MATCH_NAME, vars)).toBe("第2試合");
  });
});

describe("renderMatchName", () => {
  it("OverallSeq を大会全体の通し番号に展開する", () => {
    expect(renderMatchName("第{{OverallSeq}}試合", vars)).toBe("第5試合");
  });

  it("DivisionSeq を部門内の通し番号に展開する", () => {
    expect(renderMatchName("{{DivisionSeq}}", vars)).toBe("2");
  });

  it("1 つの文字列に両方の変数を書ける", () => {
    expect(renderMatchName("{{OverallSeq}}／{{DivisionSeq}}", vars)).toBe(
      "5／2",
    );
  });

  it("変数の内側の空白を許す", () => {
    expect(renderMatchName("第{{ OverallSeq }}試合", vars)).toBe("第5試合");
  });

  it("知らない変数は空文字にする（mustache の既定）", () => {
    expect(renderMatchName("第{{Foo}}試合", vars)).toBe("第試合");
  });

  it("変数名の大文字小文字を区別する", () => {
    expect(renderMatchName("{{overallseq}}", vars)).toBe("");
  });

  it("変数を含まない文字列はそのまま返す", () => {
    expect(renderMatchName("決勝", vars)).toBe("決勝");
  });

  it("テンプレートのリテラル部分はエスケープしない", () => {
    expect(renderMatchName("A & B 第{{OverallSeq}}試合", vars)).toBe(
      "A & B 第5試合",
    );
  });

  it("閉じ忘れた区画は例外にせずテンプレートのまま返す", () => {
    expect(renderMatchName("{{#a}}第1試合", vars)).toBe("{{#a}}第1試合");
  });
});
```

> mustache の既定のエスケープが掛かるのは `{{...}}` に差し込む**値**だけで、
> テンプレートのリテラル部分は素通しする。値として渡すのは整数 2 つだけなので、
> エスケープが実際に何かを書き換える場面は無い。「A & B」のような試合名が
> 壊れないことを 8 番目のテストで固定しておく。
>
> **実装者への注意**: 上の期待値は実装前に検証していない。まず RED を確認し、
> 実際の出力が期待値と違ったら、mustache の実挙動が正となるようテストを直して
> 報告に書くこと（推測でテストを通さない）。

> **`{{#a}}` の扱い**: `Mustache.render` はテンプレートの構文解析を伴うため、
> 閉じ忘れた区画は例外になる。`renderMatchName` はそれを握ってテンプレートを
> そのまま返す。

- [ ] **Step 3: テストを走らせて落ちることを確かめる**

Run: `pnpm exec vitest run src/lib/division/match-name.test.ts`
Expected: FAIL（`Failed to resolve import "./match-name"`）

- [ ] **Step 4: 最小の実装を書く**

`src/lib/division/match-name.ts` を新規作成:

```ts
import Mustache from "mustache";

/**
 * 生成直後の試合名。テンプレートなので、並べ替えて実施順が変わると
 * 表示も自動で追従する。リテラルの連番を振っていたときのように
 * 並べ替えのたびに振り直す必要が無い。
 */
export const DEFAULT_MATCH_NAME = "第{{DivisionSeq}}試合";

/** 試合名のテンプレートに渡せる変数。名前は mustache のキーそのもの。 */
export type MatchNameVars = {
  /** 大会の進行順で何番目の試合か。1 始まり */
  OverallSeq: number;
  /** 部門の中で何番目の試合か。1 始まり */
  DivisionSeq: number;
};

/**
 * 試合名を展開する。構文解析は mustache に委ねるので、空白の許容・
 * 未知の変数（空文字になる）・大文字小文字の区別はすべて mustache の
 * 既定どおりになる。
 *
 * 例外を握ってテンプレートをそのまま返すのは、保存時の構文検査を
 * 通っていない文字列（別経路で書かれた Json など）で一覧全体が
 * 落ちるのを防ぐため。読み出しは常に何かを返す。
 */
export const renderMatchName = (
  template: string,
  vars: MatchNameVars,
): string => {
  try {
    return Mustache.render(template, vars);
  } catch {
    return template;
  }
};
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `pnpm exec vitest run src/lib/division/match-name.test.ts`
Expected: PASS（10 tests）

- [ ] **Step 6: 型と lint を確かめる**

Run: `pnpm typecheck`
Expected: エラーなし

- [ ] **Step 7: コミット**

```bash
git add package.json pnpm-lock.yaml src/lib/division/match-name.ts src/lib/division/match-name.test.ts
git commit -m "$(cat <<'EOF'
feat(division): 試合名テンプレートの展開を追加

mustache を導入し、{{OverallSeq}} / {{DivisionSeq}} を展開する
純粋関数と既定値の定数を置く。まだ誰も使っていない。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 大会全体の通し番号の算出

**Files:**
- Create: `src/lib/division/overall-order.ts`
- Test: `src/lib/division/overall-order.test.ts`

**Interfaces:**
- Consumes: なし（純粋関数）
- Produces:
  - `overallSeqKey(divisionId: string, matchId: string): string` — `` `${divisionId}:${matchId}` ``
  - `type OverallOrderDivision = { id: string; order: number; matchIds: string[] }`
  - `type OverallOrderItem = { divisionId: string; matchId: string }`
  - `buildOverallSeq(divisions: readonly OverallOrderDivision[], savedItems: readonly OverallOrderItem[]): Map<string, number>`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/division/overall-order.test.ts` を新規作成:

```ts
import { describe, expect, it } from "vitest";
import {
  buildOverallSeq,
  type OverallOrderDivision,
  overallSeqKey,
} from "./overall-order";

const divisions: OverallOrderDivision[] = [
  { id: "d1", order: 0, matchIds: ["m1", "m2"] },
  { id: "d2", order: 1, matchIds: ["n1"] },
];

describe("buildOverallSeq", () => {
  it("保存された進行順のとおりに 1 から振る", () => {
    const seq = buildOverallSeq(divisions, [
      { divisionId: "d2", matchId: "n1" },
      { divisionId: "d1", matchId: "m2" },
      { divisionId: "d1", matchId: "m1" },
    ]);

    expect(seq.get(overallSeqKey("d2", "n1"))).toBe(1);
    expect(seq.get(overallSeqKey("d1", "m2"))).toBe(2);
    expect(seq.get(overallSeqKey("d1", "m1"))).toBe(3);
  });

  it("進行順が空なら部門 order → 部門内の並びで振る", () => {
    const seq = buildOverallSeq(divisions, []);

    expect(seq.get(overallSeqKey("d1", "m1"))).toBe(1);
    expect(seq.get(overallSeqKey("d1", "m2"))).toBe(2);
    expect(seq.get(overallSeqKey("d2", "n1"))).toBe(3);
  });

  it("行を持たない試合は部門 order → 部門内の並びで末尾に足す", () => {
    const seq = buildOverallSeq(divisions, [
      { divisionId: "d2", matchId: "n1" },
    ]);

    expect(seq.get(overallSeqKey("d2", "n1"))).toBe(1);
    expect(seq.get(overallSeqKey("d1", "m1"))).toBe(2);
    expect(seq.get(overallSeqKey("d1", "m2"))).toBe(3);
  });

  it("部門 order の昇順で末尾に足す（配列の順ではない）", () => {
    const unsorted: OverallOrderDivision[] = [
      { id: "d2", order: 1, matchIds: ["n1"] },
      { id: "d1", order: 0, matchIds: ["m1"] },
    ];
    const seq = buildOverallSeq(unsorted, []);

    expect(seq.get(overallSeqKey("d1", "m1"))).toBe(1);
    expect(seq.get(overallSeqKey("d2", "n1"))).toBe(2);
  });

  it("実体の無い行は番号を消費しない", () => {
    const seq = buildOverallSeq(divisions, [
      { divisionId: "d9", matchId: "x1" },
      { divisionId: "d1", matchId: "m1" },
    ]);

    expect(seq.get(overallSeqKey("d1", "m1"))).toBe(1);
    expect(seq.has(overallSeqKey("d9", "x1"))).toBe(false);
  });

  it("同じ試合が二重に並んでいても 1 回しか数えない", () => {
    const seq = buildOverallSeq(divisions, [
      { divisionId: "d1", matchId: "m1" },
      { divisionId: "d1", matchId: "m1" },
      { divisionId: "d1", matchId: "m2" },
    ]);

    expect(seq.get(overallSeqKey("d1", "m1"))).toBe(1);
    expect(seq.get(overallSeqKey("d1", "m2"))).toBe(2);
    expect(seq.size).toBe(3);
  });

  it("全試合にちょうど 1 つずつ番号が付く", () => {
    const seq = buildOverallSeq(divisions, []);

    expect(seq.size).toBe(3);
    expect([...seq.values()].sort((l, r) => l - r)).toEqual([1, 2, 3]);
  });

  it("入力の配列を書き換えない", () => {
    const input: OverallOrderDivision[] = [
      { id: "d2", order: 1, matchIds: ["n1"] },
      { id: "d1", order: 0, matchIds: ["m1"] },
    ];
    buildOverallSeq(input, []);

    expect(input.map((division) => division.id)).toEqual(["d2", "d1"]);
  });
});
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `pnpm exec vitest run src/lib/division/overall-order.test.ts`
Expected: FAIL（`Failed to resolve import "./overall-order"`）

- [ ] **Step 3: 実装を書く**

`src/lib/division/overall-order.ts` を新規作成:

```ts
/**
 * 通し番号の対照表のキー。試合 id は部門の中でしか一意でないため、
 * 大会をまたぐ表では部門 id と組にする必要がある。
 */
export const overallSeqKey = (divisionId: string, matchId: string): string =>
  `${divisionId}:${matchId}`;

/** 通し番号の材料になる部門。matchIds は部門内の実施順（sequence 昇順）で渡す。 */
export type OverallOrderDivision = {
  id: string;
  /** 大会内での表示順。行を持たない試合を末尾へ足すときの並び順に使う。 */
  order: number;
  matchIds: string[];
};

/** 保存されている進行順の 1 行。区切りは呼び出し側で落として渡す。 */
export type OverallOrderItem = { divisionId: string; matchId: string };

/**
 * 大会の全試合に 1 始まりの通し番号を振る。
 *
 * 並びの規則は進行順の一覧（features/schedule の buildScheduleView）と同じ
 * ——「保存された進行順に並べ、実体の無い行と二重の行は落とし、行を持たない
 * 試合を部門 order → 部門内の実施順で末尾に足す」。同じ規則を 2 箇所に書くと
 * 必ずずれるので、順序の決定はこの関数 1 つに集め、進行順の一覧もここから
 * 並びを得る。features どうしは依存できないため下位共通層に置いてある。
 *
 * 区切り行を数えないのは、区切りを 1 本挿すだけで以降の試合の番号が
 * 飛ぶのを避けるため。運営者が数えるのは試合であって区切りではない。
 */
export const buildOverallSeq = (
  divisions: readonly OverallOrderDivision[],
  savedItems: readonly OverallOrderItem[],
): Map<string, number> => {
  const known = new Set<string>();
  for (const division of divisions) {
    for (const matchId of division.matchIds) {
      known.add(overallSeqKey(division.id, matchId));
    }
  }

  const ordered: string[] = [];
  const placed = new Set<string>();

  for (const item of savedItems) {
    const key = overallSeqKey(item.divisionId, item.matchId);
    // 実体の無い行（組み合わせの作り直しで消えた試合）と二重の行は数えない。
    if (!known.has(key) || placed.has(key)) {
      continue;
    }
    placed.add(key);
    ordered.push(key);
  }

  for (const division of [...divisions].sort(
    (left, right) => left.order - right.order,
  )) {
    for (const matchId of division.matchIds) {
      const key = overallSeqKey(division.id, matchId);
      if (!placed.has(key)) {
        placed.add(key);
        ordered.push(key);
      }
    }
  }

  return new Map(ordered.map((key, index) => [key, index + 1]));
};
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `pnpm exec vitest run src/lib/division/overall-order.test.ts`
Expected: PASS（8 tests）

- [ ] **Step 5: コミット**

```bash
git add src/lib/division/overall-order.ts src/lib/division/overall-order.test.ts
git commit -m "$(cat <<'EOF'
feat(division): 大会全体の通し番号の算出を追加

進行順の並びの規則を純粋関数として下位共通層に置く。
試合名の {{OverallSeq}} と進行順の一覧が同じ並びを共有するための土台。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `matchNumber` → `matchName` の機械的改名

**このタスクは挙動を一切変えない。** 名前だけを変え、値は今までどおりリテラルの連番のままにする。挙動の変更は Task 6 以降で行う。改名を先に済ませるのは、型が繋がらないと中間状態でコンパイルが通らないため。

**Files:**
- Rename: `src/features/division/set-match-number/` → `src/features/division/set-match-name/`
- Rename: `src/features/division/match-number-view.ts` / `.test.ts` → `match-name-view.ts` / `.test.ts`
- Rename: `src/components/division/MatchNumberRow.tsx` → `src/components/division/MatchNameRow.tsx`
- Modify: `matchNumber` / `MatchNumber` / `matchOrder` 系の識別子を含む全ファイル（下の grep で列挙される。約 67 ファイル）
- Test: 既存テストがそのまま通ること

**Interfaces:**
- Produces（改名後の名前。以降のタスクはこれらを使う）:
  - `BracketMatch.matchName: string`（`src/lib/division/types.ts`）
  - `MatchNameRowView { matchId, matchName, label, card }`、`toMatchOrderView(...)`（`src/features/division/match-name-view.ts`。関数名は据え置き）
  - `ScheduleRowView`（match 分岐）の `matchName: string`
  - `ResultRowView`（match 分岐）の `matchName: string`
  - `CrossTableCell` の `{ kind: "match"; matchName: string }`
  - `bracket` の `Match.matchName?: string` / `ResolvedMatch.matchName: string | null`
  - `setMatchNameAction`（`src/features/division/set-match-name/handler.ts`）、`setMatchNameSchema` / `SetMatchNameInput`、`setMatchNameInDb` / `SetMatchNamePort`、`setMatchNameForDivision`
  - フォームの入力欄名 `matchName`
  - `MatchNameRow`（`src/components/division/MatchNameRow.tsx`）
- 据え置き（Task 7 で削除するのでここでは触らない）:
  - `DivisionMatchNumberConflictError` とその文言「その試合番号は別の試合で使われています」

- [ ] **Step 1: 影響範囲を確認する**

Run:
```bash
grep -rl "matchNumber\|MatchNumber\|match-number" src | sort
```
Expected: 約 70 行のファイル一覧が出る。この一覧が改名の対象。

- [ ] **Step 2: ディレクトリとファイルを git mv で改名する**

```bash
git mv src/features/division/set-match-number src/features/division/set-match-name
git mv src/features/division/match-number-view.ts src/features/division/match-name-view.ts
git mv src/features/division/match-number-view.test.ts src/features/division/match-name-view.test.ts
git mv src/components/division/MatchNumberRow.tsx src/components/division/MatchNameRow.tsx
```

- [ ] **Step 3: 識別子を一括置換する**

`DivisionMatchNumberConflictError` を巻き込まないよう、先にその識別子を退避してから置換し、最後に戻す。

```bash
files=$(grep -rl "matchNumber\|MatchNumber\|match-number" src)

# 1. 削除予定のエラー名を一時的な印に退避する
sed -i 's/DivisionMatchNumberConflictError/__KEEP_CONFLICT_ERROR__/g' $files

# 2. 残りをすべて改名する
sed -i \
  -e 's/matchNumber/matchName/g' \
  -e 's/MatchNumber/MatchName/g' \
  -e 's/match-number/match-name/g' \
  -e 's/setMatchNumber/setMatchName/g' \
  $files

# 3. 退避したエラー名を戻す
sed -i 's/__KEEP_CONFLICT_ERROR__/DivisionMatchNumberConflictError/g' $files
```

> `setMatchNumber` は `matchNumber` の置換で既に `setMatchName` になっているが、順序に依存しないよう明示してある。

- [ ] **Step 4: 日本語の文言を「試合番号」から「試合名」に直す**

置換で変わるのは識別子だけなので、UI 文言とコメントは手で直す。次の grep で全箇所を出し、1 つずつ「試合名」に書き換える。

Run:
```bash
grep -rn "試合番号" src
```

書き換える箇所と変更後の文言:

| ファイル | 変更後 |
|---|---|
| `src/features/division/set-match-name/schema.ts` | `"試合名を入力してください"` / `"試合名は20文字までです"` |
| `src/features/division/set-match-name/handler.test.ts` | 上と同じ期待値に合わせる |
| `src/components/division/MatchNameRow.tsx` | `aria-label={`${row.label}の試合名`}` とコメント中の「試合番号」 |
| `src/components/division/MatchOrderList.tsx` | 説明文の「試合番号」→「試合名」（2 箇所） |
| `src/components/division/*.test.tsx` | 上に対応する期待値 |
| `src/lib/division/validate.ts` | `` `${match.id}: matchName が空です` `` と重複メッセージ内の文言 |
| その他コメント | 「試合番号」→「試合名」 |

> `src/lib/division/label.ts` の `第${...}試合の勝者` はこのタスクでは**変えない**（Task 6 で扱う）。

- [ ] **Step 5: 手当てが要る箇所を目視で確認する**

置換で意図せぬ形になっていないか、次の 3 点を確認する。

1. `src/features/division/set-match-name/repository.ts` — `DivisionMatchNumberConflictError` の import と throw が残っていること（Task 7 で消す）
2. `src/features/schedule/types.ts` / `result-rows.ts` — `matchName` フィールドのコメントが日本語として通ること
3. 表示側の `第{row.matchName}試合` のような文字列（`ScheduleMatchRow.tsx` / `PublicScheduleList.tsx` / `MatchResultRow.tsx` / `LeagueCrossTable.tsx`）は**このタスクでは変えない**。値がまだリテラルの連番なので表示は従来どおりになる。

- [ ] **Step 6: 型・テスト・lint を通す**

Run: `pnpm typecheck`
Expected: エラーなし。残っていれば置換漏れなので手で直す。

Run: `pnpm test`
Expected: 全テスト PASS（挙動を変えていないため）

Run: `pnpm lint`
Expected: 自分が触った内容に由来するエラーなし（CRLF のみの指摘は無視）

- [ ] **Step 7: 置換漏れが無いことを確かめる**

Run:
```bash
grep -rn "matchNumber\|MatchNumber\|match-number\|試合番号" src
```
Expected: `DivisionMatchNumberConflictError` の定義・union・対照表・文言・import・throw だけが残る（`src/features/division/errors.ts`、`messages.ts`、`set-match-name/repository.ts`、`set-match-name/repository.test.ts`、`set-match-name/handler.test.ts`）

- [ ] **Step 8: コミット**

```bash
git add -A src
git commit -m "$(cat <<'EOF'
refactor(division): matchNumber を matchName に改名

試合番号ではなく試合名として扱うため、フィールド・スライス・部品・
UI 文言を一括で改名する。値と挙動は変えていない。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 進行順の並びを `buildOverallSeq` に一本化し、行に展開済みの試合名を載せる

**Files:**
- Modify: `src/features/schedule/domain.ts`
- Modify: `src/features/schedule/types.ts:39-52`（`ScheduleRowView` の match 分岐のコメント）
- Modify: `src/components/schedule/ScheduleMatchRow.tsx:12`
- Modify: `src/components/public/PublicScheduleList.tsx:43`
- Modify: `src/components/result/MatchResultRow.tsx:41,118,151`
- Test: `src/features/schedule/domain.test.ts`、`src/components/schedule/ScheduleList.test.tsx`、`src/components/public/PublicScheduleList.test.tsx`、`src/components/result/MatchResultList.test.tsx`

**Interfaces:**
- Consumes: `buildOverallSeq` / `overallSeqKey` / `OverallOrderDivision`（Task 2）、`renderMatchName`（Task 1）、`BracketMatch.matchName`（Task 3）
- Produces: `ScheduleRowView`（match 分岐）の `matchName` が**展開済みの表示名**になる。`ResultRowView.matchName` もそれを写すので同じ。

- [ ] **Step 1: 失敗するテストを書く**

`src/features/schedule/domain.test.ts` の末尾に追記（既存のテストヘルパの作り方はファイル先頭に合わせること）:

```ts
describe("buildScheduleView の試合名", () => {
  it("テンプレートを展開して行に載せる", () => {
    const division = makeDivision({
      id: "d1",
      order: 0,
      matches: [
        makeMatch({ id: "m1", sequence: 0, matchName: "第{{OverallSeq}}試合" }),
        makeMatch({ id: "m2", sequence: 1, matchName: "第{{DivisionSeq}}試合" }),
      ],
    });

    const rows = buildScheduleView([division], [], []);

    expect(rows[0]).toMatchObject({ matchId: "m1", matchName: "第1試合" });
    expect(rows[1]).toMatchObject({ matchId: "m2", matchName: "第2試合" });
  });

  it("OverallSeq は区切りを数えず、保存された進行順に従う", () => {
    const division = makeDivision({
      id: "d1",
      order: 0,
      matches: [
        makeMatch({ id: "m1", sequence: 0, matchName: "{{OverallSeq}}" }),
        makeMatch({ id: "m2", sequence: 1, matchName: "{{OverallSeq}}" }),
      ],
    });

    const rows = buildScheduleView(
      [division],
      [],
      [
        { kind: "divider", id: "s1", label: "午前の部", startsAt: null },
        { kind: "match", id: "s2", divisionId: "d1", matchId: "m2" },
        { kind: "divider", id: "s3", label: "午後の部", startsAt: null },
        { kind: "match", id: "s4", divisionId: "d1", matchId: "m1" },
      ],
    );

    expect(rows.map((row) => (row.kind === "match" ? row.matchName : row.label)))
      .toEqual(["午前の部", "1", "午後の部", "2"]);
  });

  it("OverallSeq は部門をまたいで通しで数える", () => {
    const first = makeDivision({
      id: "d1",
      order: 0,
      matches: [makeMatch({ id: "m1", sequence: 0, matchName: "{{OverallSeq}}" })],
    });
    const second = makeDivision({
      id: "d2",
      order: 1,
      matches: [makeMatch({ id: "n1", sequence: 0, matchName: "{{OverallSeq}}" })],
    });

    const rows = buildScheduleView([first, second], [], []);

    expect(rows.map((row) => (row.kind === "match" ? row.matchName : ""))).toEqual(
      ["1", "2"],
    );
  });
});
```

> `makeDivision` / `makeMatch` は既存テストのヘルパ。無ければ既存テストが `ScheduleDivision` / `BracketMatch` を組み立てている形をそのまま使い、`matchName` と `sequence` を指定できるようにする。

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `pnpm exec vitest run src/features/schedule/domain.test.ts`
Expected: FAIL（`matchName` がテンプレート文字列のまま返る）

- [ ] **Step 3: `buildScheduleView` を書き換える**

`src/features/schedule/domain.ts` の import に追加:

```ts
import { renderMatchName } from "@/lib/division/match-name";
import {
  buildOverallSeq,
  type OverallOrderDivision,
  overallSeqKey,
} from "@/lib/division/overall-order";
```

`buildMatchRows` を差し替える。行の並びは自分で決めず、`buildOverallSeq` が
返した通し番号の昇順にする（並びの規則を 2 箇所に持たないため）:

```ts
/**
 * 全部門の試合を行にする。並び順は buildOverallSeq が決めた通し番号の昇順で、
 * この関数は自分では並びを決めない。並びの規則を 2 箇所に書くとずれるため。
 *
 * 試合名はここで展開する。{{OverallSeq}} は大会全体を見ないと決まらないので、
 * 部門だけを見ている下流では展開できない。
 */
const buildMatchRows = (
  divisions: ScheduleDivision[],
  participants: ScheduleParticipant[],
  overallSeq: Map<string, number>,
): ScheduleRowView[] => {
  const rows: { row: ScheduleRowView; seq: number }[] = [];

  for (const division of divisions) {
    const labelSlot = createSlotLabeler(
      division.matchingConfig,
      division.entries,
      participants,
    );

    for (const match of division.matchingConfig.matches) {
      const seq = overallSeq.get(overallSeqKey(division.id, match.id)) ?? 0;
      rows.push({
        seq,
        row: {
          kind: "match",
          key: matchKey(division.id, match.id),
          divisionId: division.id,
          divisionName: division.name,
          matchId: match.id,
          matchName: renderMatchName(match.matchName, {
            OverallSeq: seq,
            DivisionSeq: match.sequence + 1,
          }),
          label: matchPositionLabel(match, division.format),
          card: matchCardLabel(match, labelSlot),
        },
      });
    }
  }

  // 並びは buildOverallSeq が決めた通し番号そのもの。部門 order による
  // 並べ替えをここで持たないのは、規則を 1 箇所に閉じ込めるため。
  return rows.sort((left, right) => left.seq - right.seq).map((item) => item.row);
};
```

`buildScheduleView` の冒頭で通し番号を作って渡す:

```ts
export const buildScheduleView = (
  divisions: ScheduleDivision[],
  participants: ScheduleParticipant[],
  items: ScheduleItemRecord[],
): ScheduleRowView[] => {
  const overallSeq = buildOverallSeq(
    divisions.map(
      (division): OverallOrderDivision => ({
        id: division.id,
        order: division.order,
        // parseMatchingConfig が sequence 昇順で返すので配列順がそのまま実施順。
        matchIds: division.matchingConfig.matches.map((match) => match.id),
      }),
    ),
    items.flatMap((item) =>
      item.kind === "match"
        ? [{ divisionId: item.divisionId, matchId: item.matchId }]
        : [],
    ),
  );

  const matchRows = buildMatchRows(divisions, participants, overallSeq);
  // 以降は既存のマージ処理をそのまま使う
  const byKey = new Map(matchRows.map((row) => [row.key, row]));
  ...
};
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `pnpm exec vitest run src/features/schedule`
Expected: PASS（新しい 3 件を含め全件）

- [ ] **Step 5: 表示側の「第◯試合」ラッパーを外す失敗テストを書く**

`src/components/schedule/ScheduleList.test.tsx` の試合行の期待値を、`第1試合` ではなく行が持つ `matchName` そのものを描くように直す。同様に `PublicScheduleList.test.tsx`、`MatchResultList.test.tsx` も直す。たとえば:

```tsx
it("行の試合名をそのまま描く", () => {
  render(<ScheduleMatchRow row={{ ...matchRow, matchName: "決勝" }} />);

  expect(screen.getByText("決勝")).toBeInTheDocument();
});
```

Run: `pnpm exec vitest run src/components/schedule src/components/public src/components/result`
Expected: FAIL（`第決勝試合` が描かれている）

- [ ] **Step 6: 表示側からラッパーを外す**

`src/components/schedule/ScheduleMatchRow.tsx:12`:

```tsx
{row.matchName}
```

`src/components/public/PublicScheduleList.tsx:43`:

```tsx
{row.matchName}
```

`src/components/result/MatchResultRow.tsx`:

```tsx
// 41 行目
aria-label={`${row.divisionName} ${row.matchName} ${slot.label}の勝ち`}
// 118 行目
{row.matchName}
// 151 行目
aria-label={`${row.divisionName} ${row.matchName}の結果を取り消す`}
```

- [ ] **Step 7: テストと型を通す**

Run: `pnpm exec vitest run src/components/schedule src/components/public src/components/result`
Expected: PASS

Run: `pnpm typecheck`
Expected: エラーなし

- [ ] **Step 8: コミット**

```bash
git add -A src
git commit -m "$(cat <<'EOF'
feat(schedule): 進行順の行に展開済みの試合名を載せる

行の並びを buildOverallSeq に一本化し、{{OverallSeq}} を大会全体の
通し番号で展開する。表示側の「第◯試合」の飾りは名前側へ移した。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 部門の画面に通し番号を配線する

**Files:**
- Modify: `src/features/division/repository.ts`（`listOverallOrderSources` を追加）
- Modify: `src/features/division/match-name-view.ts`（`toMatchOrderView` が `overallSeq` を受ける）
- Modify: `src/features/division/round-robin/view.ts`（`toCrossTableView` が `overallSeq` を受ける）
- Modify: `src/components/division/DivisionSetup.tsx`、`LeagueSetup.tsx`、`LeagueCrossTable.tsx`
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.tsx`
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/league/page.tsx`
- Test: `src/features/division/match-name-view.test.ts`、`src/features/division/round-robin/view.test.ts`、`src/components/division/DivisionSetup.test.tsx`、`LeagueSetup.test.tsx`、`LeagueCrossTable.test.tsx`

**Interfaces:**
- Consumes: `buildOverallSeq` / `overallSeqKey` / `OverallOrderDivision`（Task 2）、`renderMatchName`（Task 1）
- Produces:
  - `resolveMatchNames(config: MatchingConfig, divisionId: string, overallSeq: ReadonlyMap<string, number>): Map<string, string>`（`src/lib/division/match-name.ts` に追加）
  - `listOverallOrderSources(tournamentId: string): Promise<Map<string, number>>`（`src/features/division/repository.ts`。通し番号そのものを返す）
  - `toMatchOrderView(config, entries, participants, format, matchNames: ReadonlyMap<string, string>): MatchNameRowView[]`
  - `toCrossTableView(config, entries, participants, matchNames: ReadonlyMap<string, string>): CrossTableView`

- [ ] **Step 1: `resolveMatchNames` の失敗テストを書く**

`src/lib/division/match-name.test.ts` に追記:

```ts
import { overallSeqKey } from "./overall-order";
import type { BracketMatch, MatchingConfig } from "./types";
import { resolveMatchNames } from "./match-name";

const match = (id: string, sequence: number, matchName: string): BracketMatch => ({
  id,
  bracket: "winners",
  round: 1,
  order: sequence,
  sequence,
  matchName,
  slots: [{ kind: "bye" }, { kind: "bye" }],
});

describe("resolveMatchNames", () => {
  const config: MatchingConfig = {
    version: 1,
    matches: [
      match("m1", 0, "第{{OverallSeq}}試合"),
      match("m2", 1, "第{{DivisionSeq}}試合"),
    ],
  };

  it("部門 id と組にしたキーで通し番号を引く", () => {
    const names = resolveMatchNames(
      config,
      "d1",
      new Map([
        [overallSeqKey("d1", "m1"), 7],
        [overallSeqKey("d1", "m2"), 8],
      ]),
    );

    expect(names.get("m1")).toBe("第7試合");
    expect(names.get("m2")).toBe("第2試合");
  });

  it("通し番号を引けない試合は OverallSeq を 0 にする", () => {
    const names = resolveMatchNames(config, "d1", new Map());

    expect(names.get("m1")).toBe("第0試合");
    expect(names.get("m2")).toBe("第2試合");
  });
});
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `pnpm exec vitest run src/lib/division/match-name.test.ts`
Expected: FAIL（`resolveMatchNames` が export されていない）

- [ ] **Step 3: `resolveMatchNames` を実装する**

`src/lib/division/match-name.ts` に追加:

```ts
import { overallSeqKey } from "./overall-order";
import type { MatchingConfig } from "./types";

/**
 * 部門の全試合を展開して「試合 id → 表示名」の対照表にする。
 *
 * 通し番号の表が大会全体のキー（部門 id と組）で引くのに対し、
 * 画面は部門 1 つの中で試合 id だけを持って引きたい。その差をここで吸収する。
 * 通し番号を引けない試合（通常は起きない）は OverallSeq を 0 にして、
 * 名前を作れないことより「0 と出る」ほうに倒す。一覧を落とさない。
 */
export const resolveMatchNames = (
  config: MatchingConfig,
  divisionId: string,
  overallSeq: ReadonlyMap<string, number>,
): Map<string, string> =>
  new Map(
    config.matches.map((match) => [
      match.id,
      renderMatchName(match.matchName, {
        OverallSeq: overallSeq.get(overallSeqKey(divisionId, match.id)) ?? 0,
        DivisionSeq: match.sequence + 1,
      }),
    ]),
  );
```

Run: `pnpm exec vitest run src/lib/division/match-name.test.ts`
Expected: PASS

- [ ] **Step 4: リポジトリの読み出しを足す**

`src/features/division/repository.ts` の末尾に追加（import に `parseMatchingConfig`、`buildOverallSeq`、`OverallOrderDivision` を足す）:

```ts
/**
 * 大会の全試合の通し番号を読む。試合名の {{OverallSeq}} を展開するのに要る。
 *
 * 所有権は呼び出し側のページが既に確立している（管理画面は
 * requireOrganization と findDivisionInTournament の 3 段 where、公開画面は
 * findPublicTournament の公開ゲート）。ここは番号を作るだけで、
 * 大会 id 以外の絞り込みは行わない。
 *
 * features/schedule にも同じ材料を読む関数があるが、features どうしは
 * 依存できないため別に持つ。並びの規則そのものは lib/division/overall-order.ts
 * の 1 つを共有しているので、番号がずれることはない。
 */
export const listOverallOrderSources = async (
  tournamentId: string,
): Promise<Map<string, number>> => {
  const [divisions, items] = await Promise.all([
    prisma.division.findMany({
      where: { tournamentId },
      orderBy: { order: "asc" },
      select: { id: true, order: true, matchingConfig: true },
    }),
    prisma.scheduleItem.findMany({
      where: { tournamentId, kind: "MATCH" },
      orderBy: { order: "asc" },
      select: { divisionId: true, matchId: true },
    }),
  ]);

  return buildOverallSeq(
    divisions.map(
      (division): OverallOrderDivision => ({
        id: division.id,
        order: division.order,
        // 壊れた Json を持つ部門があっても他の部門の番号は出したいので、
        // その部門だけ試合ゼロとして扱う。
        matchIds: (() => {
          try {
            return parseMatchingConfig(division.matchingConfig).matches.map(
              (match) => match.id,
            );
          } catch {
            return [];
          }
        })(),
      }),
    ),
    // kind: "MATCH" の行は divisionId / matchId を必ず持つが、列としては
    // nullable なので落として渡す。
    items.flatMap((item) =>
      item.divisionId === null || item.matchId === null
        ? []
        : [{ divisionId: item.divisionId, matchId: item.matchId }],
    ),
  );
};
```

- [ ] **Step 5: view 関数が展開済みの名前を受け取るようにする（失敗テストから）**

`src/features/division/match-name-view.test.ts` を、`toMatchOrderView` の 5 番目の引数に `Map<string, string>` を渡す形に直し、行の `matchName` がその値になることを確かめる:

```ts
it("渡された展開済みの試合名を行に載せる", () => {
  const rows = toMatchOrderView(
    config,
    entries,
    participants,
    "SINGLE_ELIMINATION",
    new Map([["m1", "第9試合"]]),
  );

  expect(rows[0].matchName).toBe("第9試合");
});
```

`src/features/division/round-robin/view.test.ts` も同様に `toCrossTableView` の 4 番目の引数を足し、マスの `matchName` がその値になることを確かめる。

Run: `pnpm exec vitest run src/features/division/match-name-view.test.ts src/features/division/round-robin/view.test.ts`
Expected: FAIL（引数の数が合わない）

- [ ] **Step 6: view 関数を書き換える**

`src/features/division/match-name-view.ts`:

```ts
export const toMatchOrderView = (
  config: MatchingConfig,
  entries: DivisionEntries,
  participants: { id: string; name: string }[],
  format: DivisionFormat,
  /** 展開済みの試合名。{{OverallSeq}} は大会全体を見ないと決まらないので上で作って渡す */
  matchNames: ReadonlyMap<string, string>,
): MatchNameRowView[] => {
  const labelSlot = createSlotLabeler(config, entries, participants);

  return config.matches.map((match) => ({
    matchId: match.id,
    // 展開に失敗する経路は無いが、引けなければテンプレートをそのまま出す。
    matchName: matchNames.get(match.id) ?? match.matchName,
    label: matchPositionLabel(match, format),
    card: matchCardLabel(match, labelSlot),
  }));
};
```

`src/features/division/round-robin/view.ts` の `toCrossTableView` — `numberByPair` の値を `matchNames.get(match.id) ?? match.matchName` にし、`CrossTableCell` の `matchName` に入れる:

```ts
export const toCrossTableView = (
  config: MatchingConfig,
  entries: DivisionEntries,
  participants: { id: string; name: string }[],
  matchNames: ReadonlyMap<string, string>,
): CrossTableView => {
  ...
  const nameByPair = new Map<string, string>();
  for (const match of config.matches) {
    const [first, second] = match.slots;
    if (first.kind === "entry" && second.kind === "entry") {
      nameByPair.set(
        pairKey(first.entryId, second.entryId),
        matchNames.get(match.id) ?? match.matchName,
      );
    }
  }
  ...
};
```

- [ ] **Step 7: 星取表のマスから飾りを外す**

`src/components/division/LeagueCrossTable.tsx:12`:

```tsx
return cell.matchName;
```

対応する `LeagueCrossTable.test.tsx` の期待値も、`第1試合` ではなくマスが持つ名前そのものを描くように直す。

- [ ] **Step 8: コンポーネントとページを配線する**

`src/components/division/DivisionSetup.tsx`:
- props に `overallSeq: ReadonlyMap<string, number>` を足す
- `resolveMatchNames(parsed.matchingConfig, division.id, overallSeq)` を計算し、`toMatchOrderView` の 5 番目に渡す

`src/components/division/LeagueSetup.tsx`:
- 同じく props に `overallSeq` を足し、`resolveMatchNames` の結果を `toMatchOrderView` と `toCrossTableView` の両方に渡す

`src/app/.../divisions/[divisionId]/setup/page.tsx` と `.../league/page.tsx`:
- `listOverallOrderSources` を import し、既存の `Promise.all` に足す

```ts
const [tournament, division, participants, members, overallSeq] =
  await Promise.all([
    findTournamentInOrganization(organization.id, tournamentId),
    findDivisionInTournament(organization.id, tournamentId, divisionId),
    listParticipantsInTournament(organization.id, tournamentId),
    listMembersInOrganization(organization.id),
    listOverallOrderSources(tournamentId),
  ]);
```

- `<DivisionSetup ... overallSeq={overallSeq} />` / `<LeagueSetup ... overallSeq={overallSeq} />` として渡す

各コンポーネントのテスト（`DivisionSetup.test.tsx` / `LeagueSetup.test.tsx`）にも `overallSeq={new Map()}` を足す。

- [ ] **Step 9: テストと型を通す**

Run: `pnpm exec vitest run src/features/division src/components/division src/lib/division`
Expected: PASS

Run: `pnpm typecheck`
Expected: エラーなし

- [ ] **Step 10: コミット**

```bash
git add -A src
git commit -m "$(cat <<'EOF'
feat(division): 部門の画面に大会全体の通し番号を配線する

部門セットアップとリーグの画面が大会全体を読み、展開済みの試合名を
一覧と星取表に渡すようにする。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: ブラケット描画に展開済みの試合名を通す

**Files:**
- Modify: `src/features/bracket/from-division.ts`（`FromDivisionInput` に `matchNames` を足す）
- Modify: `src/components/division/DivisionBracket.tsx`
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/page.tsx`
- Modify: `src/app/t/[tournamentId]/divisions/[divisionId]/page.tsx`
- Modify: `src/components/division/DivisionSetup.tsx`（プレビューの `DivisionBracket` に渡す）
- Test: `src/features/bracket/from-division.test.ts`、`src/components/division/DivisionBracket.test.tsx`、`src/components/tournament/MatchCard.test.tsx`

**Interfaces:**
- Consumes: `resolveMatchNames`（Task 5）、`listOverallOrderSources`（Task 5）
- Produces: `FromDivisionInput` に `matchNames: ReadonlyMap<string, string>` が加わる。`Match.matchName` / `ResolvedMatch.matchName` には展開済みの文字列が入る。

- [ ] **Step 1: 失敗するテストを書く**

`src/features/bracket/from-division.test.ts` に追記:

```ts
it("展開済みの試合名を Match に載せる", () => {
  const result = fromDivision({
    ...baseInput,
    matchNames: new Map([["m1-0", "第9試合"]]),
  });

  expect(result?.bracket.matches[0].matchName).toBe("第9試合");
});

it("引けない試合はテンプレートをそのまま載せる", () => {
  const result = fromDivision({ ...baseInput, matchNames: new Map() });

  expect(result?.bracket.matches[0].matchName).toBe(
    baseInput.matchingConfig.matches[0].matchName,
  );
});
```

> `baseInput` は既存テストが組み立てている `FromDivisionInput`。既存の全ケースに `matchNames: new Map()` を足す必要がある。

Run: `pnpm exec vitest run src/features/bracket/from-division.test.ts`
Expected: FAIL（`matchNames` が型に無い）

- [ ] **Step 2: `from-division.ts` を書き換える**

`FromDivisionInput` に足す:

```ts
export type FromDivisionInput = {
  ...
  participants: DivisionSourceParticipant[];
  /**
   * 展開済みの試合名（試合 id → 表示名）。{{OverallSeq}} は大会全体を
   * 見ないと決まらないため、部門だけを受け取るこの関数では作れない。
   */
  matchNames: ReadonlyMap<string, string>;
};
```

`matches.push` の `matchName` を差し替える:

```ts
matches.push({
  id: source.id,
  round: source.round,
  order: source.order,
  matchName: input.matchNames.get(source.id) ?? source.matchName,
  slots: [first, second],
});
```

- [ ] **Step 3: `DivisionBracket` に props を足す**

`src/components/division/DivisionBracket.tsx`:

```tsx
export function DivisionBracket({
  division,
  participants,
  overallSeq,
  heightClassName = "h-[28rem]",
}: {
  division: DivisionDetail;
  participants: DivisionParticipant[];
  /** 大会全体の通し番号。試合名の {{OverallSeq}} の展開に使う */
  overallSeq: ReadonlyMap<string, number>;
  heightClassName?: string;
}) {
```

`fromDivision` の呼び出しに足す:

```tsx
const converted = fromDivision({
  id: division.id,
  name: division.name,
  format: division.format,
  entries: parsed.entries,
  matchingConfig: parsed.matchingConfig,
  results: parsed.results,
  participants,
  matchNames: resolveMatchNames(parsed.matchingConfig, division.id, overallSeq),
});
```

import に `import { resolveMatchNames } from "@/lib/division/match-name";` を足す。

- [ ] **Step 4: 3 つの呼び出し元を配線する**

`src/components/division/DivisionSetup.tsx:183` — 既に `overallSeq` を props に持っている（Task 5）ので、そのまま渡す:

```tsx
<DivisionBracket
  division={division}
  participants={participants}
  overallSeq={overallSeq}
/>
```

`src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/page.tsx` — `listOverallOrderSources` を import し、`Promise.all` に足して `<DivisionBracket ... overallSeq={overallSeq} />` に渡す:

```ts
const [tournament, division, overallSeq] = await Promise.all([
  findTournamentInOrganization(organization.id, tournamentId),
  findDivisionInTournament(organization.id, tournamentId, divisionId),
  listOverallOrderSources(tournamentId),
]);
```

`src/app/t/[tournamentId]/divisions/[divisionId]/page.tsx` — 公開ゲートを通ったあとに読む:

```ts
const [participants, overallSeq] = await Promise.all([
  division.format === "SINGLE_ELIMINATION"
    ? listParticipantsInTournament(tournament.organizationId, tournament.id)
    : Promise.resolve([]),
  listOverallOrderSources(tournament.id),
]);
```

そして `<DivisionBracket ... overallSeq={overallSeq} />` に渡す。

- [ ] **Step 5: テストの呼び出しを直す**

`DivisionBracket.test.tsx` の各レンダリングに `overallSeq={new Map()}` を足す。`MatchCard.test.tsx` は `matchName` を任意の文字列にして、そのまま描かれることを確かめる（`MatchCard.tsx:56-61` は既に `match.matchName` をそのまま描くので変更不要）。

- [ ] **Step 6: テストと型を通す**

Run: `pnpm exec vitest run src/features/bracket src/components/division src/components/tournament`
Expected: PASS

Run: `pnpm typecheck`
Expected: エラーなし

- [ ] **Step 7: コミット**

```bash
git add -A src
git commit -m "$(cat <<'EOF'
feat(bracket): ブラケットのカードに展開済みの試合名を出す

fromDivision が展開済みの名前を受け取るようにし、管理・公開の
両方のブラケット画面で大会全体の通し番号を配線する。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 既定値をテンプレートに切り替える（仕様の本体）

**Files:**
- Modify: `src/lib/division/parse.ts:88-166,240-250`（`fillMatchNames`）
- Modify: `src/lib/division/validate.ts:71-82`（重複ルールの削除）
- Modify: `src/lib/division/label.ts:24-52`（`createSlotLabeler`）
- Modify: `src/features/division/single-elimination/build.ts:85-115`
- Modify: `src/features/division/round-robin/build.ts:95-115`
- Modify: `src/features/division/reorder-matches/domain.ts:38-40`
- Modify: `src/features/division/match-name-view.ts`、`src/features/schedule/domain.ts`、`src/features/schedule/result-rows.ts`（`createSlotLabeler` の呼び出し）
- Test: `src/lib/division/parse.test.ts`、`validate.test.ts`、`label.test.ts`、`src/features/division/single-elimination/build.test.ts`、`round-robin/build.test.ts`、`reorder-matches/domain.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_MATCH_NAME`（Task 1）、`resolveMatchNames`（Task 5）
- Produces: `createSlotLabeler(matchNames: ReadonlyMap<string, string>, entries: DivisionEntries, participants: { id: string; name: string }[]): SlotLabeler` — 第 1 引数が `MatchingConfig` から展開済みの名前の表に変わる

- [ ] **Step 1: 失敗するテストを書く（生成の既定値）**

`src/features/division/single-elimination/build.test.ts` の試合名の期待値を書き換える:

```ts
it("全試合に既定の試合名テンプレートを入れる", () => {
  const config = buildFromSlots([
    { kind: "entry", entryId: "e1" },
    { kind: "entry", entryId: "e2" },
    { kind: "entry", entryId: "e3" },
    { kind: "entry", entryId: "e4" },
  ]);

  expect(config.matches.map((match) => match.matchName)).toEqual([
    DEFAULT_MATCH_NAME,
    DEFAULT_MATCH_NAME,
    DEFAULT_MATCH_NAME,
  ]);
});
```

`src/features/division/round-robin/build.test.ts` も同様に、`buildRoundRobin` の全試合が `DEFAULT_MATCH_NAME` を持つことを確かめる（既存の `"1", "2", ...` を期待している箇所を置き換える）。

`src/features/division/reorder-matches/domain.test.ts`:

```ts
it("試合名は書き換えずそのまま写す", () => {
  const config: MatchingConfig = {
    version: 1,
    matches: [
      makeMatch({ id: "m1", sequence: 0, matchName: "第{{DivisionSeq}}試合" }),
      makeMatch({ id: "m2", sequence: 1, matchName: "決勝" }),
    ],
  };

  const next = reorderMatches(config, ["m2", "m1"]);

  expect(next?.matches.map((match) => match.matchName)).toEqual([
    "決勝",
    "第{{DivisionSeq}}試合",
  ]);
  expect(next?.matches.map((match) => match.sequence)).toEqual([0, 1]);
});
```

`src/lib/division/parse.test.ts`:

```ts
it("matchName が無ければ既定のテンプレートを入れる", () => {
  const config = parseMatchingConfig({
    version: 1,
    matches: [
      { id: "m1", bracket: "winners", round: 1, order: 0, slots: [byeSlot, byeSlot] },
    ],
  });

  expect(config.matches[0].matchName).toBe(DEFAULT_MATCH_NAME);
});

it("旧データの matchNumber は読み継がない", () => {
  const config = parseMatchingConfig({
    version: 1,
    matches: [
      {
        id: "m1",
        bracket: "winners",
        round: 1,
        order: 0,
        matchNumber: "7",
        slots: [byeSlot, byeSlot],
      },
    ],
  });

  expect(config.matches[0].matchName).toBe(DEFAULT_MATCH_NAME);
});

it("matchName があればそのまま使う", () => {
  const config = parseMatchingConfig({
    version: 1,
    matches: [
      {
        id: "m1",
        bracket: "winners",
        round: 1,
        order: 0,
        matchName: "決勝",
        slots: [byeSlot, byeSlot],
      },
    ],
  });

  expect(config.matches[0].matchName).toBe("決勝");
});
```

`src/lib/division/validate.test.ts` — 重複が通ることに直す:

```ts
it("試合名が重複していてもエラーにしない", () => {
  const config: MatchingConfig = {
    version: 1,
    matches: [
      makeMatch({ id: "m1", sequence: 0, matchName: DEFAULT_MATCH_NAME }),
      makeMatch({ id: "m2", sequence: 1, matchName: DEFAULT_MATCH_NAME }),
    ],
  };

  expect(validateMatchingConfig(config, emptyEntries)).toEqual([]);
});

it("試合名が空ならエラーにする", () => {
  const config: MatchingConfig = {
    version: 1,
    matches: [makeMatch({ id: "m1", sequence: 0, matchName: "" })],
  };

  expect(validateMatchingConfig(config, emptyEntries)).toContain(
    "m1: matchName が空です",
  );
});
```

`src/lib/division/label.test.ts` — スロットの文言:

```ts
it("勝者・敗者は展開済みの試合名をそのまま使う", () => {
  const labelSlot = createSlotLabeler(
    new Map([["m1", "第3試合"]]),
    entries,
    participants,
  );

  expect(labelSlot({ kind: "winnerOf", matchId: "m1" })).toBe("第3試合の勝者");
  expect(labelSlot({ kind: "loserOf", matchId: "m1" })).toBe("第3試合の敗者");
});

it("引けない試合は「?」にする", () => {
  const labelSlot = createSlotLabeler(new Map(), entries, participants);

  expect(labelSlot({ kind: "winnerOf", matchId: "m9" })).toBe("?の勝者");
});
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `pnpm test`
Expected: FAIL（上で書き換えた各ファイル）

- [ ] **Step 3: 生成の既定値を差し替える**

`src/features/division/single-elimination/build.ts` — import に `import { DEFAULT_MATCH_NAME } from "@/lib/division/match-name";` を足し、2 箇所の `matchName: String(matches.length + 1)` を `matchName: DEFAULT_MATCH_NAME` にする。

`src/features/division/round-robin/build.ts` — 同じく import を足し、`matchName: String(order + 1)` を `matchName: DEFAULT_MATCH_NAME` にする。

- [ ] **Step 4: 読み出しの補完を差し替える**

`src/lib/division/parse.ts`:

- `ParsedBracketMatch` / `NumberedBracketMatch` の型名とコメントを `matchName` 基準に直す
- `fillMatchNumbers`（Task 3 で `fillMatchNames` に改名済み）を、衝突を避ける採番から既定値の一律代入に置き換える:

```ts
/**
 * matchName の無い試合（改名前に保存された旧データ）へ既定のテンプレートを入れる。
 * 旧 matchNumber の値は読み継がない。リテラルの番号を残すと、その部門だけが
 * 並べ替えに追従しなくなり、新しく作った部門と挙動が分かれるため。
 * データ移行を行わない代わりに、読み出しが必ず完全な形へ正規化する。
 */
const fillMatchNames = (
  matches: ParsedBracketMatch[],
): NamedBracketMatch[] =>
  matches.map((match) =>
    match.matchName === undefined
      ? { ...match, matchName: DEFAULT_MATCH_NAME }
      : (match as NamedBracketMatch),
  );
```

import に `import { DEFAULT_MATCH_NAME } from "./match-name";` を足す。

> `parseBracketMatch` が `record.matchNumber` を読む行は Task 3 の置換で `record.matchName` になっている。旧キー `matchNumber` は読まないので、これで正しい。

- [ ] **Step 5: 検証から重複ルールを外す**

`src/lib/division/validate.ts` — `matchName` の重複を積む `for` ループ（Task 3 の置換後で 71-77 行目付近）を丸ごと削除する。空チェックの `for` は残す。関数の doc コメントの「あわせて sequence が…」の記述はそのまま。

- [ ] **Step 6: スロットの文言を展開済みの名前基準にする**

`src/lib/division/label.ts`:

```ts
/**
 * スロットの表示文字列を作る関数を返す。
 *
 * 第 1 引数が展開済みの試合名の表なのは、{{OverallSeq}} が大会全体を
 * 見ないと決まらないため。この関数は部門しか知らないので自分では展開できない。
 * 「第◯試合」という飾りを付けないのも同じ理由で、名前の形は運営者が
 * 試合名そのもので決める（既定値なら「第1試合の勝者」になる）。
 */
export const createSlotLabeler = (
  matchNames: ReadonlyMap<string, string>,
  entries: DivisionEntries,
  participants: { id: string; name: string }[],
): SlotLabeler => {
  const participantById = new Map(
    participants.map((participant) => [participant.id, participant.name]),
  );
  const nameByEntryId = new Map(
    entries.entries.map((entry) => [
      entry.id,
      participantById.get(entry.participantId) ?? null,
    ]),
  );

  return (slot) => {
    switch (slot.kind) {
      case "entry":
        return nameByEntryId.get(slot.entryId) ?? "（不明な参加者）";
      case "winnerOf":
        return `${matchNames.get(slot.matchId) ?? "?"}の勝者`;
      case "loserOf":
        return `${matchNames.get(slot.matchId) ?? "?"}の敗者`;
      case "bye":
        return "BYE";
    }
  };
};
```

`MatchingConfig` の import が未使用になれば外す。

- [ ] **Step 7: `createSlotLabeler` の呼び出し 3 箇所を直す**

`src/features/division/match-name-view.ts`:

```ts
const labelSlot = createSlotLabeler(matchNames, entries, participants);
```

`src/features/schedule/domain.ts` の `buildMatchRows` — 部門ごとに名前を作ってから渡す:

```ts
for (const division of divisions) {
  const matchNames = resolveMatchNames(
    division.matchingConfig,
    division.id,
    overallSeq,
  );
  const labelSlot = createSlotLabeler(matchNames, division.entries, participants);

  for (const match of division.matchingConfig.matches) {
    const seq = overallSeq.get(overallSeqKey(division.id, match.id)) ?? 0;
    rows.push({
      seq,
      row: {
        ...
        matchName: matchNames.get(match.id) ?? match.matchName,
        ...
      },
    });
  }
}
```

`renderMatchName` の直接呼び出しは `resolveMatchNames` に置き換わるので、import から外す。

`src/features/schedule/result-rows.ts` — `buildResultRows` は `rows`（展開済み）と `divisions` を受け取るが、`createSlotLabeler` に渡す名前の表を自分で作る必要がある。`buildResultRows` の引数に `overallSeq` を足す:

```ts
export const buildResultRows = (
  rows: ScheduleRowView[],
  divisions: ScheduleDivision[],
  participants: ScheduleParticipant[],
  overallSeq: ReadonlyMap<string, number>,
): ResultRowView[] => {
  const context = new Map(
    divisions.map((division) => [
      division.id,
      {
        division,
        resolved: resolveMatchSlots(division.matchingConfig, division.results),
        labelSlot: createSlotLabeler(
          resolveMatchNames(division.matchingConfig, division.id, overallSeq),
          division.entries,
          participants,
        ),
        ...
      },
    ]),
  );
  ...
};
```

`src/features/schedule/repository.ts` の `loadResultRows` で `overallSeq` を作って渡す。`buildScheduleView` の中で作っているものと同じ計算になるので、`domain.ts` から通し番号を作る部分を切り出して export する:

```ts
// src/features/schedule/domain.ts
/** 進行順の材料から通し番号を作る。一覧と結果入力の両方が同じ番号を使うため export する。 */
export const scheduleOverallSeq = (
  divisions: ScheduleDivision[],
  items: ScheduleItemRecord[],
): Map<string, number> =>
  buildOverallSeq(
    divisions.map((division) => ({
      id: division.id,
      order: division.order,
      matchIds: division.matchingConfig.matches.map((match) => match.id),
    })),
    items.flatMap((item) =>
      item.kind === "match"
        ? [{ divisionId: item.divisionId, matchId: item.matchId }]
        : [],
    ),
  );
```

`buildScheduleView` はこれを呼ぶ。`loadResultRows` も呼んで `buildResultRows` に渡す:

```ts
const overallSeq = scheduleOverallSeq(divisions, items);

return buildResultRows(
  buildScheduleView(divisions, participants, items),
  divisions,
  participants,
  overallSeq,
);
```

`result-rows.test.ts` の呼び出しにも第 4 引数 `new Map()` を足す。

- [ ] **Step 8: 並べ替えが試合名を書き換えないようにする**

`src/features/division/reorder-matches/domain.ts`:

```ts
    matches.push({ ...match, sequence });
```

あわせて doc コメントを直す:

```ts
/**
 * 指定の並びで実施順を振り直す。
 *
 * 書き換えるのは sequence だけで、id / round / order / slots / matchName は
 * そのまま写す。試合名はテンプレート（既定は "第{{DivisionSeq}}試合"）なので、
 * sequence が変われば表示は自動で追従する。手で「決勝」と付けた名前を
 * 並べ替えで潰さないために、名前そのものには触れない。
 * ...
 */
```

- [ ] **Step 9: テストを通す**

Run: `pnpm test`
Expected: PASS。落ちるのは既存テストが `"1"`, `"2"` のリテラルを期待している箇所なので、`DEFAULT_MATCH_NAME` や展開後の文字列に直す。

Run: `pnpm typecheck`
Expected: エラーなし

- [ ] **Step 10: 一覧の説明文を直す**

`src/components/division/MatchOrderList.tsx` の説明文を、並べ替えで名前が振り直されなくなったことに合わせる:

```tsx
<p className="text-xs text-slate-500">
  左端をドラッグすると実施順を入れ替えられます。試合名に
  {"{{DivisionSeq}}"} を含めていれば、並べ替えに合わせて番号も動きます。対戦表を作り直したときと、トーナメントで
  1 回戦の組み合わせを入れ替えたときは、実施順と試合名が既定に戻ります
</p>
```

対応する `MatchOrderList.test.tsx` の文言の期待値も直す。

Run: `pnpm exec vitest run src/components/division/MatchOrderList.test.tsx`
Expected: PASS

- [ ] **Step 11: コミット**

```bash
git add -A src
git commit -m "$(cat <<'EOF'
feat(division): 試合名の既定値をテンプレートにする

生成と読み出しの既定を "第{{DivisionSeq}}試合" にし、部門内の一意制約と
並べ替え時の振り直しをやめる。スロットの文言は展開済みの名前をそのまま使う。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 試合名の保存の検証とプレビュー

**Files:**
- Modify: `src/features/division/set-match-name/schema.ts`
- Modify: `src/features/division/set-match-name/repository.ts`（重複チェックの削除）
- Modify: `src/features/division/errors.ts`（`DivisionMatchNumberConflictError` の削除）
- Modify: `src/features/division/messages.ts`（対応する文言の削除）
- Modify: `src/components/division/MatchNameRow.tsx`（プレビューと変数の説明）
- Test: `src/features/division/set-match-name/schema.test.ts`、`repository.test.ts`、`handler.test.ts`、`src/components/division/MatchOrderList.test.tsx`

**Interfaces:**
- Consumes: `MatchNameRowView`（`matchId` / `matchName` / `label` / `card`）
- Produces:
  - `setMatchNameSchema` — `{ matchId: string; matchName: string }`。`matchName` は trim 済み・1〜100 文字・mustache として構文解析できる
  - `MatchNameRowView` に `template: string`（保存されている生のテンプレート）が加わる

- [ ] **Step 1: スキーマの失敗テストを書く**

`src/features/division/set-match-name/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { setMatchNameSchema } from "./schema";

const parse = (matchName: string) =>
  setMatchNameSchema.safeParse({ matchId: "m1", matchName });

describe("setMatchNameSchema", () => {
  it("前後の空白を落とす", () => {
    const result = parse("  決勝  ");

    expect(result.success && result.data.matchName).toBe("決勝");
  });

  it("変数を含む文字列を受け付ける", () => {
    expect(parse("第{{OverallSeq}}試合").success).toBe(true);
  });

  it("空文字を拒む", () => {
    const result = parse("   ");

    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0].message).toBe(
      "試合名を入力してください",
    );
  });

  it("100 文字を超える文字列を拒む", () => {
    const result = parse("あ".repeat(101));

    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0].message).toBe(
      "試合名は100文字以内で入力してください",
    );
  });

  it("閉じ忘れた区画を拒む", () => {
    const result = parse("{{#a}}第1試合");

    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0].message).toBe(
      "試合名の書き方が正しくありません",
    );
  });

  it("知らない変数は拒まない（展開時に空文字になる）", () => {
    expect(parse("第{{Foo}}試合").success).toBe(true);
  });
});
```

Run: `pnpm exec vitest run src/features/division/set-match-name/schema.test.ts`
Expected: FAIL

- [ ] **Step 2: スキーマを書き換える**

`src/features/division/set-match-name/schema.ts`:

```ts
import Mustache from "mustache";
import { z } from "zod";

/**
 * mustache として読める文字列かどうか。閉じ忘れた区画（{{#a}} だけ など）は
 * 展開時に例外になるため、保存の前に弾いて画面で気づけるようにする。
 * 知らない変数は mustache の既定どおり空文字に展開されるだけなので弾かない。
 */
const isParsableTemplate = (value: string): boolean => {
  try {
    Mustache.parse(value);
    return true;
  } catch {
    return false;
  }
};

export const setMatchNameSchema = z.object({
  matchId: z.string().min(1, "試合の指定が不正です"),
  matchName: z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(1, "試合名を入力してください")
        // 数える対象は展開後ではなくテンプレートそのもの。展開後の長さは
        // 通し番号の桁数で変わり、保存できるかどうかが後から変わってしまう。
        .max(100, "試合名は100文字以内で入力してください")
        .refine(isParsableTemplate, "試合名の書き方が正しくありません"),
    ),
});

export type SetMatchNameInput = z.infer<typeof setMatchNameSchema>;
```

- [ ] **Step 3: リポジトリから重複チェックを外す**

`src/features/division/set-match-name/repository.ts`:
- `DivisionMatchNumberConflictError` の import を削除
- `config.matches.some(...)` で重複を見て throw している `if` ブロックを丸ごと削除

`repository.test.ts` の「重複していたらエラーにする」ケースを、「重複していても保存できる」に書き換える:

```ts
it("同じ試合名が既にあっても保存できる", async () => {
  // 既定値はテンプレートなので、部門内の全試合が同じ文字列を持つのが正常。
  const exit = await Effect.runPromiseExit(
    setMatchNameInDb(ids, { matchId: "m1", matchName: DEFAULT_MATCH_NAME }),
  );

  expect(Exit.isSuccess(exit)).toBe(true);
});
```

- [ ] **Step 4: エラー型と文言を削除する**

`src/features/division/errors.ts`:
- `DivisionMatchNumberConflictError` クラスの定義を削除
- `DivisionError` union から削除
- `divisionErrorTags` の `DivisionMatchNumberConflictError: true,` を削除

`src/features/division/messages.ts`:
- `Match.tag("DivisionMatchNumberConflictError", ...)` の節を削除

`handler.test.ts` の「重複していたら文言を返す」ケースを削除する。

Run: `pnpm typecheck`
Expected: エラーなし（`Match.exhaustive` と `divisionErrorTags` の型が union と一致する）

- [ ] **Step 5: 行にプレビューと生のテンプレートを載せる**

`src/features/division/match-name-view.ts` — `MatchNameRowView` に `template` を足す:

```ts
export type MatchNameRowView = {
  /** BracketMatch.id。保存時にこの id を送る */
  matchId: string;
  /** 保存されているテンプレート文字列。入力欄の初期値になる */
  template: string;
  /** 展開後の表示名。プレビューに出す */
  matchName: string;
  /** 「1回戦 第1試合」（リーグは「第1試合」）のような構造上の位置 */
  label: string;
  /** 「山田 vs 佐藤」のような対戦の表示 */
  card: string;
};
```

`toMatchOrderView` の返り値に `template: match.matchName,` を足す。

- [ ] **Step 6: 入力欄の失敗テストを書く**

`src/components/division/MatchOrderList.test.tsx` に追記:

```tsx
it("入力欄にはテンプレートを、隣には展開後の名前を出す", () => {
  render(
    <MatchOrderList
      rows={[
        {
          matchId: "m1",
          template: "第{{OverallSeq}}試合",
          matchName: "第5試合",
          label: "1回戦 第1試合",
          card: "山田 vs 佐藤",
        },
      ]}
      slug="acme"
      tournamentId="t1"
      divisionId="d1"
      reorderAction={noopAction}
      setMatchNameAction={noopAction}
      emptyMessage="まだ組み合わせがありません"
    />,
  );

  expect(screen.getByLabelText("1回戦 第1試合の試合名")).toHaveValue(
    "第{{OverallSeq}}試合",
  );
  expect(screen.getByText("第5試合")).toBeInTheDocument();
});

it("使える変数を説明する", () => {
  render(<MatchOrderList {...props} />);

  expect(screen.getByText(/\{\{OverallSeq\}\}/)).toBeInTheDocument();
  expect(screen.getByText(/\{\{DivisionSeq\}\}/)).toBeInTheDocument();
});
```

Run: `pnpm exec vitest run src/components/division/MatchOrderList.test.tsx`
Expected: FAIL

- [ ] **Step 7: 入力欄にプレビューを足す**

`src/components/division/MatchNameRow.tsx` のフォーム部分:

```tsx
<form action={formAction} className="flex items-center gap-2">
  <input type="hidden" name="slug" value={slug} />
  <input type="hidden" name="tournamentId" value={tournamentId} />
  <input type="hidden" name="divisionId" value={divisionId} />
  <input type="hidden" name="matchId" value={row.matchId} />
  {/* 入力欄はテンプレートそのもの。展開後は隣に出して、変数を書いた
      結果がその場で分かるようにする。 */}
  <input
    type="text"
    name="matchName"
    defaultValue={row.template}
    aria-label={`${row.label}の試合名`}
    className="w-48 rounded border border-slate-300 px-2 py-1 text-sm"
  />
  <span className="whitespace-nowrap text-xs text-slate-500">
    {row.matchName}
  </span>
  <button
    type="submit"
    disabled={pending}
    className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-30"
  >
    保存
  </button>
  {state.error !== null && (
    <p role="alert" className="text-xs text-red-600">
      {state.error}
    </p>
  )}
</form>
```

`src/components/division/MatchOrderList.tsx` の説明文に変数の一覧を足す（Task 7 で書き換えた段落の直後）:

```tsx
<p className="text-xs text-slate-500">
  試合名には次の変数を書けます。{"{{OverallSeq}}"} は大会全体で何番目の試合か、
  {"{{DivisionSeq}}"} はこの部門で何番目の試合かに置き換わります
</p>
```

- [ ] **Step 8: テストと型を通す**

Run: `pnpm exec vitest run src/features/division src/components/division`
Expected: PASS

Run: `pnpm typecheck`
Expected: エラーなし

- [ ] **Step 9: コミット**

```bash
git add -A src
git commit -m "$(cat <<'EOF'
feat(division): 試合名の保存を検証しプレビューを出す

mustache として読めるかと 100 文字以内かを保存前に確かめ、重複の
拒否はやめる。編集行では入力欄にテンプレート、隣に展開後の名前を出す。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 全体の検証

**Files:** 変更なし（問題が見つかれば該当ファイルを直す）

- [ ] **Step 1: 型を通す**

Run: `pnpm typecheck`
Expected: エラーなし

- [ ] **Step 2: 全テストを通す**

Run: `pnpm test`
Expected: 全件 PASS。実行結果の失敗件数が 0 であることを目で確かめる。

- [ ] **Step 3: lint を通す**

Run: `pnpm lint`
Expected: 変更したファイルに内容由来のエラーなし（CRLF だけの指摘は無視）

- [ ] **Step 4: 改名の取りこぼしが無いことを確かめる**

Run:
```bash
grep -rn "matchNumber\|MatchNumber\|match-number\|試合番号" src
```
Expected: 何も出ない

- [ ] **Step 5: ビルドを通す**

Run: `pnpm build`
Expected: 成功

- [ ] **Step 6: 手で動かして確かめる**

`.env` を用意して `BYPASS_AUTH=1 pnpm dev` で起動し、Cookie に `USER_ID=1` を設定する（seed 済みのユーザは組織 `aaaaa` に属する）。

確認する項目:

| 画面 | 確認すること |
|---|---|
| 部門セットアップ `/orgs/aaaaa/tournaments/{id}/divisions/{id}/setup` | 試合名の入力欄にテンプレートが入り、隣に「第1試合」が出る |
| 同上 | 入力欄を `第{{OverallSeq}}試合` にして保存すると、プレビューが大会全体の番号になる |
| 同上 | 1 件を「決勝」にしてから並べ替えても「決勝」が残り、他の行の番号だけ動く |
| リーグ `/orgs/aaaaa/tournaments/{id}/divisions/{id}/league` | 一覧と星取表の両方に同じ試合名が出る |
| 進行順 `/orgs/aaaaa/tournaments/{id}/matches` | `{{OverallSeq}}` が区切りを数えずに 1 から並ぶ |
| 結果入力 `/orgs/aaaaa/tournaments/{id}/results` | 試合名が進行順と一致する |
| 公開の進行順 `/t/{id}/schedule` | 管理画面と同じ試合名が出る |
| 公開のブラケット `/t/{id}/divisions/{id}` | カードに試合名が出て、未確定スロットが「第1試合の勝者」と読める |

> 進行順の画面がローカルで 500 になる場合、`ScheduleItem` テーブルがローカル DB に無い既知のずれ（マイグレーションは記録済みだがテーブルが無い）。`pnpm db:migrate` で解消する。

- [ ] **Step 7: 設計との突き合わせ**

[設計書](../specs/2026-09-09-match-name-template-design.md)の「決定事項」の表を上から読み、実装が各行と一致していることを確かめる。ずれていれば直す。

- [ ] **Step 8: 完了の報告**

`pnpm typecheck` / `pnpm test` / `pnpm build` の実行結果（件数を含む）を添えて完了を報告する。実行していない検証を「通った」と書かない。

---

## Self-Review

**1. 仕様の網羅**

| 設計書の項目 | 実装するタスク |
|---|---|
| `matchNumber` → `matchName` の改名 | Task 3 |
| 既定値 `"第{{DivisionSeq}}試合"` | Task 7（生成・読み出し） |
| mustache の採用と既定挙動 | Task 1 |
| `{{DivisionSeq}}` = `sequence + 1` | Task 1（`resolveMatchNames` は Task 5） |
| `{{OverallSeq}}` = 進行順の試合行の通し番号 | Task 2、Task 4 |
| 全画面で大会全体を読んで解決 | Task 4（進行順・結果・公開の進行順）、Task 5（部門・星取表）、Task 6（ブラケット） |
| 重複チェックの撤廃 | Task 7（`validate`）、Task 8（スライス・エラー型） |
| 並べ替えが試合名を書き換えない | Task 7 |
| 旧 `matchNumber` を読み継がない | Task 7 |
| `createSlotLabeler` の飾り除去 | Task 7 |
| `buildOverallSeq` への一本化 | Task 2、Task 4、Task 7（`scheduleOverallSeq`） |
| `listOverallOrderSources` | Task 5 |
| 空文字・構文・100 文字の検証 | Task 8 |
| 描画時の例外フォールバック | Task 1（`renderMatchName`） |
| 編集行のプレビューと変数の説明 | Task 8 |
| リーグの位置ラベルは据え置き | 変更しないので該当タスクなし（設計書に明記済み） |

漏れなし。

**2. プレースホルダ**

「適切に」「必要に応じて」「同様に」だけで済ませた手順は無い。Task 3 の一括置換だけは対象ファイルを列挙せず grep に委ねているが、これは列挙が約 70 件あり、機械的置換のほうが取りこぼしが少ないため。置換後に Step 7 の grep で漏れが無いことを確かめる手順を置いてある。

**3. 型の整合**

- `overallSeqKey` / `buildOverallSeq` / `OverallOrderDivision` — Task 2 で定義、Task 4・5 で使用。名前一致。
- `DEFAULT_MATCH_NAME` / `renderMatchName` — Task 1 で定義、Task 4・5・7 で使用。名前一致。
- `resolveMatchNames(config, divisionId, overallSeq)` — Task 5 で定義、Task 6・7 で使用。引数の順序一致。
- `createSlotLabeler(matchNames, entries, participants)` — Task 7 で変更。呼び出し 3 箇所（`match-name-view.ts` / `schedule/domain.ts` / `result-rows.ts`）を同じ Task 7 で直している。
- `MatchNameRowView` — Task 3 で改名、Task 8 で `template` を追加。`MatchNameRow.tsx` が `row.template` / `row.matchName` の両方を読む形で一致。
- `buildResultRows(rows, divisions, participants, overallSeq)` — Task 7 で第 4 引数を追加し、同じ Task で `repository.ts` の呼び出しも直している。
- `setMatchNameSchema` / `setMatchNameInDb` / `setMatchNameAction` — Task 3 で改名、Task 8 で中身を変更。名前一致。
