# 大会の印刷用 PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/t/[tournamentId]/print` に、大会概要・選手一覧・部門ごとのトーナメント表／リーグ表をまとめた印刷専用ページを作り、ブラウザの印刷（PDF に保存）で出力できるようにする。

**Architecture:** 印刷ページはサーバーコンポーネントで、印刷設定（用紙 A4/A3、結果あり/空欄）をクエリで受け取って描き分ける。トーナメント表は React Flow を使わず、既存のパイプライン（`fromDivision` → `resolveBracket` → `layoutBracket`）の結果を静的 SVG（`PrintBracket`）で描き、viewBox で用紙に収める。部門ページは CSS の名前付きページ（`@page division`）で横向きにする。「部門の Json をパースして描ける形にする」前半は、画面用の `DivisionBracket` / `DivisionMatchingView` と共有する関数（`prepareBracket` / `prepareLeagueTable`）へ切り出す。

**Tech Stack:** Next.js 16（App Router、`PageProps` 型は `next typegen` が生成）、React 19、Tailwind CSS v4、Vitest + Testing Library（jsdom）、Biome、pnpm。

**Spec:** `docs/superpowers/specs/2026-09-22-tournament-print-design.md`

## Global Constraints

- 作業ディレクトリは worktree `E:\program\takezoux2\tournament-program\.claude\worktrees\tournament-print`（ブランチ `feat/tournament-print`）。メインのチェックアウト（`E:\program\takezoux2\tournament-program`）のファイルは編集しない。
- パッケージ管理は pnpm。**新しい依存は追加しない。**
- 新しいルートを作ったら `pnpm exec next typegen` を実行して `PageProps<"/t/[tournamentId]/print">` を生成してから typecheck する。
- テスト: `pnpm vitest run <path>`。型: `pnpm typecheck`。整形: `pnpm exec biome check --write <変更したファイル>`。Windows のチェックアウトでは CRLF 由来の lint エラーがリポジトリ全体に出るので、変更したファイルの内容に対する指摘だけを見る。
- 画面の文言は日本語。コメントも既存コードに合わせて日本語で「なぜ」を書く。
- 閲覧可否は必ず `findPublicTournament(tournamentId, session?.user.id ?? null)` を通す（セッション由来の user id だけを渡す）。
- コミットメッセージは Conventional Commits（例 `feat(print): ...`）で、末尾に次の 1 行を**そのまま**付ける（モデル名を書き換えない。BOM を入れない）:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- 用紙: A4 = 210×297mm、A3 = 297×420mm。余白 12mm。部門ページは横向き。
- クエリ: `paper` は `a4`（既定）/`a3`、`results` は `1`（既定）/`0`。不正値は既定に戻す。

## File Structure

| ファイル | 役割 |
| --- | --- |
| `src/features/print/options.ts` (新規) | 印刷設定のパース、URL 生成、`@page` の CSS 生成（純粋関数） |
| `src/components/division/prepare-bracket.ts` (新規) | 部門 → 描画用の解決済みブラケット（または案内文）。`DivisionBracket` と印刷が共有 |
| `src/components/division/prepare-league-table.ts` (新規) | 部門 → リーグの表ビュー（または案内文）。`DivisionMatchingView` と印刷が共有 |
| `src/components/division/DivisionBracket.tsx` (変更) | `prepareBracket` を使う形に置き換え |
| `src/components/division/DivisionMatchingView.tsx` (変更) | `LeagueSection` が `prepareLeagueTable` を使う |
| `src/components/division/LeagueResultTable.tsx` (変更) | `print` / `showStandings` prop を追加 |
| `src/features/bracket/svg-geometry.ts` (新規) | SVG の viewBox と連結線のパス（純粋関数） |
| `src/components/print/PrintBracket.tsx` (新規) | 静的 SVG のトーナメント表 |
| `src/features/division/repository.ts` (変更) | `listDivisionDetailsInTournament` を追加 |
| `src/components/print/PrintSummarySection.tsx` (新規) | 大会概要 |
| `src/components/print/PrintParticipantTable.tsx` (新規) | 選手一覧の表 |
| `src/components/print/PrintDivisionSection.tsx` (新規) | 部門 1 つ（形式で描き分け） |
| `src/components/print/PrintToolbar.tsx` (新規, client) | 設定切替と印刷ボタン |
| `src/app/t/[tournamentId]/print/page.tsx` (新規) | 印刷ページ |
| `src/app/t/[tournamentId]/page.tsx` (変更) | 「印刷用PDF」リンク |
| `src/app/orgs/[slug]/tournaments/[tournamentId]/page.tsx` (変更) | 「印刷用PDF」リンク（新しいタブ） |

---

### Task 1: 印刷設定（options.ts）

**Files:**
- Create: `src/features/print/options.ts`
- Test: `src/features/print/options.test.ts`

**Interfaces:**
- Produces:
  - `type PaperSize = "a4" | "a3"`
  - `type PrintOptions = { paper: PaperSize; results: boolean }`
  - `parsePrintOptions(params: Record<string, string | string[] | undefined>): PrintOptions`
  - `printHref(tournamentId: string, options: PrintOptions): string` → `/t/<id>/print?paper=a4&results=1`
  - `printPageCss(paper: PaperSize): string`
  - `divisionBodyHeightMm(paper: PaperSize): number`（A4 → 172、A3 → 259）
  - CSS クラス名 `print-division-body`（部門ページの本文領域。印刷時に高さが決まる）

- [ ] **Step 1: 失敗するテストを書く**

`src/features/print/options.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  divisionBodyHeightMm,
  parsePrintOptions,
  printHref,
  printPageCss,
} from "./options";

describe("parsePrintOptions", () => {
  it("何も無ければ A4・結果ありにする", () => {
    expect(parsePrintOptions({})).toEqual({ paper: "a4", results: true });
  });

  it("paper=a3 と results=0 を読む", () => {
    expect(parsePrintOptions({ paper: "a3", results: "0" })).toEqual({
      paper: "a3",
      results: false,
    });
  });

  it("不正値は既定に戻す", () => {
    expect(parsePrintOptions({ paper: "b5", results: "yes" })).toEqual({
      paper: "a4",
      results: true,
    });
  });

  it("同じキーが複数あれば先頭を使う", () => {
    expect(parsePrintOptions({ paper: ["a3", "a4"], results: ["0"] })).toEqual(
      { paper: "a3", results: false },
    );
  });
});

describe("printHref", () => {
  it("設定をクエリにした印刷ページの URL を返す", () => {
    expect(printHref("t1", { paper: "a3", results: false })).toBe(
      "/t/t1/print?paper=a3&results=0",
    );
    expect(printHref("t1", { paper: "a4", results: true })).toBe(
      "/t/t1/print?paper=a4&results=1",
    );
  });
});

describe("printPageCss", () => {
  it("既定のページは縦、部門ページは横にする", () => {
    const css = printPageCss("a4");
    expect(css).toContain("@page { size: A4 portrait; margin: 12mm; }");
    expect(css).toContain("@page division { size: A4 landscape; }");
  });

  it("部門ページの本文の高さを用紙から決める", () => {
    expect(printPageCss("a3")).toContain(
      ".print-division-body { height: 259mm; }",
    );
  });
});

describe("divisionBodyHeightMm", () => {
  it("横向きの高さから余白と見出しを引く", () => {
    expect(divisionBodyHeightMm("a4")).toBe(172);
    expect(divisionBodyHeightMm("a3")).toBe(259);
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `pnpm vitest run src/features/print/options.test.ts`
Expected: FAIL（`./options` が無い）

- [ ] **Step 3: 実装する**

`src/features/print/options.ts`:

```ts
/** 印刷ページの設定。クエリ文字列で受け取り、サーバーで描き分ける。 */
export type PaperSize = "a4" | "a3";

export type PrintOptions = {
  paper: PaperSize;
  /** false なら結果を載せない（当日に手書きする運用向けの空欄の表） */
  results: boolean;
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * クエリから印刷設定を読む。URL は手で書き換えられるので、知らない値は
 * エラーにせず既定（A4・結果あり）へ倒す。
 */
export const parsePrintOptions = (params: SearchParams): PrintOptions => ({
  paper: first(params.paper) === "a3" ? "a3" : "a4",
  results: first(params.results) !== "0",
});

export const printHref = (
  tournamentId: string,
  options: PrintOptions,
): string =>
  `/t/${tournamentId}/print?paper=${options.paper}&results=${options.results ? "1" : "0"}`;

/** 用紙の短辺・長辺（mm） */
const PAPER_MM: Record<PaperSize, { short: number; long: number }> = {
  a4: { short: 210, long: 297 },
  a3: { short: 297, long: 420 },
};

const PAGE_MARGIN_MM = 12;
/** 部門ページの見出し（部門名と形式）に取っておく高さ */
const DIVISION_HEADING_MM = 14;

/**
 * 部門ページ（横向き）で表に使える高さ。SVG は親の高さに合わせて縮むので、
 * 印刷時はこの値で本文の箱の高さを固定し、1 部門を 1 ページに収める。
 */
export const divisionBodyHeightMm = (paper: PaperSize): number =>
  PAPER_MM[paper].short - PAGE_MARGIN_MM * 2 - DIVISION_HEADING_MM;

/**
 * 印刷用の CSS。用紙サイズは実行時に決まるので Tailwind のクラスでは書けず、
 * ページに <style> として埋め込む。部門ページは名前付きページ（page: division）
 * で横向きにする。
 */
export const printPageCss = (paper: PaperSize): string => {
  const size = paper.toUpperCase();
  return [
    `@page { size: ${size} portrait; margin: ${PAGE_MARGIN_MM}mm; }`,
    `@page division { size: ${size} landscape; }`,
    `@media print { .print-division-body { height: ${divisionBodyHeightMm(paper)}mm; } }`,
  ].join("\n");
};
```

- [ ] **Step 4: 通ることを確認する**

Run: `pnpm vitest run src/features/print/options.test.ts`
Expected: PASS（全件）

- [ ] **Step 5: コミット**

```bash
pnpm exec biome check --write src/features/print
git add src/features/print
git commit -m "feat(print): parse print options and build the page CSS" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `prepareBracket` を切り出す

`DivisionBracket` の「パース → `fromDivision` → `resolveBracket` → `layoutBracket`」をそのまま関数へ移し、印刷用の 2 つのオプションを足す。画面の挙動は変えない（既存の `DivisionBracket.test.tsx` が通り続けること）。

**Files:**
- Create: `src/components/division/prepare-bracket.ts`
- Test: `src/components/division/prepare-bracket.test.ts`
- Modify: `src/components/division/DivisionBracket.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type PreparedBracket =
    | { kind: "ready"; matches: ResolvedMatch[]; positions: Map<string, Position>; labels: SectionLabel[] }
    | { kind: "notice"; message: string };
  export type PrepareBracketOptions = { withResults?: boolean; withPlayerNumber?: boolean };
  export function prepareBracket(
    division: DivisionDetail,
    participants: DivisionParticipant[],
    overallSeq: ReadonlyMap<string, number>,
    options?: PrepareBracketOptions,
  ): PreparedBracket;
  ```
  - `withResults: false` → 結果を `EMPTY_DIVISION_RESULTS` として扱う（BYE の勝ち上がりは残る）
  - `withPlayerNumber: true` → 表示名を `No.<選手番号> <氏名>` にする

- [ ] **Step 1: 失敗するテストを書く**

`src/components/division/prepare-bracket.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { DivisionDetail } from "@/features/division/repository";
import { prepareBracket } from "./prepare-bracket";

const participants = [
  { id: "p1", name: "佐藤 蓮", nameKana: "サトウ レン", playerNumber: "1" },
  { id: "p2", name: "鈴木 陽菜", nameKana: "スズキ ハルナ", playerNumber: "2" },
];

const noSeq = new Map<string, number>();

const buildDivision = (
  overrides: Partial<DivisionDetail> = {},
): DivisionDetail => ({
  id: "d1",
  name: "男子シングルス",
  order: 0,
  format: "SINGLE_ELIMINATION",
  entries: {
    version: 1,
    entries: [
      { id: "e1", participantId: "p1", seed: 0 },
      { id: "e2", participantId: "p2", seed: 1 },
    ],
  },
  matchingConfig: {
    version: 1,
    matches: [
      {
        id: "m1",
        bracket: "winners",
        round: 1,
        order: 0,
        slots: [
          { kind: "entry", entryId: "e1" },
          { kind: "entry", entryId: "e2" },
        ],
      },
    ],
  },
  results: { version: 1, matches: [{ matchId: "m1", winnerEntryId: "e2" }] },
  resultConfig: null,
  createdAt: new Date("2026-08-01T00:00:00Z"),
  ...overrides,
});

describe("prepareBracket", () => {
  it("結果込みで解決し、座標を付けて返す", () => {
    const prepared = prepareBracket(buildDivision(), participants, noSeq);

    expect(prepared.kind).toBe("ready");
    if (prepared.kind !== "ready") return;
    expect(prepared.matches).toHaveLength(1);
    expect(prepared.matches[0].winnerId).toBe("e2");
    expect(prepared.positions.get("m1")).toEqual({ x: 0, y: 0 });
    expect(prepared.labels).toEqual([]);
  });

  it("withResults: false なら結果を無視する", () => {
    const prepared = prepareBracket(buildDivision(), participants, noSeq, {
      withResults: false,
    });

    if (prepared.kind !== "ready") throw new Error("ready のはず");
    expect(prepared.matches[0].winnerId).toBeNull();
    expect(prepared.matches[0].slots.every((slot) => !slot.isWinner)).toBe(
      true,
    );
  });

  it("withPlayerNumber: true なら名前の前に選手番号を付ける", () => {
    const prepared = prepareBracket(buildDivision(), participants, noSeq, {
      withPlayerNumber: true,
    });

    if (prepared.kind !== "ready") throw new Error("ready のはず");
    expect(prepared.matches[0].slots[0].participant?.name).toBe(
      "No.1 佐藤 蓮",
    );
  });

  it("Json が壊れていれば案内文を返す", () => {
    expect(
      prepareBracket(buildDivision({ entries: "broken" }), participants, noSeq),
    ).toEqual({
      kind: "notice",
      message: "ブラケットのデータを読み込めませんでした",
    });
  });

  it("組み合わせが無ければ案内文を返す", () => {
    expect(
      prepareBracket(
        buildDivision({ matchingConfig: { version: 1, matches: [] } }),
        participants,
        noSeq,
      ),
    ).toEqual({ kind: "notice", message: "組み合わせが未作成です" });
  });

  it("リーグは案内文を返す", () => {
    expect(
      prepareBracket(
        buildDivision({ format: "ROUND_ROBIN" }),
        participants,
        noSeq,
      ),
    ).toEqual({
      kind: "notice",
      message: "「リーグ（総当たり）」のブラケット表示はまだ対応していません",
    });
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `pnpm vitest run src/components/division/prepare-bracket.test.ts`
Expected: FAIL（`./prepare-bracket` が無い）

- [ ] **Step 3: 実装する**

`src/components/division/prepare-bracket.ts`:

```ts
import { fromDivision } from "@/features/bracket/from-division";
import {
  layoutBracket,
  type Position,
  type SectionLabel,
  sectionLabels,
} from "@/features/bracket/layout-bracket";
import { resolveBracket } from "@/features/bracket/resolve-bracket";
import type { ResolvedMatch } from "@/features/bracket/types";
import { DIVISION_FORMAT_LABELS } from "@/features/division/format";
import type {
  DivisionDetail,
  DivisionParticipant,
} from "@/features/division/repository";
import { resolveMatchNames } from "@/lib/division/match-name";
import {
  parseDivisionEntries,
  parseDivisionResultConfigOrDefault,
  parseDivisionResults,
  parseMatchingConfig,
} from "@/lib/division/parse";
import { EMPTY_DIVISION_RESULTS } from "@/lib/division/types";

/** 描ける状態のブラケットか、代わりに出す 1 行の案内。 */
export type PreparedBracket =
  | {
      kind: "ready";
      matches: ResolvedMatch[];
      positions: Map<string, Position>;
      labels: SectionLabel[];
    }
  | { kind: "notice"; message: string };

export type PrepareBracketOptions = {
  /** false なら結果を無視して組み合わせだけを解決する（印刷の空欄モード） */
  withResults?: boolean;
  /** 表示名の前に選手番号を付ける。紙では選手番号で呼び出すため印刷で使う */
  withPlayerNumber?: boolean;
};

/**
 * 部門の Json をブラケットとして描ける形にする。画面（DivisionBracket）と
 * 印刷（PrintBracket）が同じ判定・同じ案内文を使うよう、描画の手前までを
 * ここに集める。失敗はすべて案内文で返し、例外は外へ出さない。
 */
export function prepareBracket(
  division: DivisionDetail,
  participants: DivisionParticipant[],
  overallSeq: ReadonlyMap<string, number>,
  options: PrepareBracketOptions = {},
): PreparedBracket {
  const { withResults = true, withPlayerNumber = false } = options;

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
    return { kind: "notice", message: "ブラケットのデータを読み込めませんでした" };
  }

  // resultConfig は表示のフィルタでしかない。壊れていてもブラケットそのものは
  // 描けるはずなので、他の 3 列とは別に受け止めて既定値へ落とす
  // （/edit ページの読み出しと同じ方針）。
  const resultConfig = parseDivisionResultConfigOrDefault(
    division.resultConfig,
  );

  if (parsed.matchingConfig.matches.length === 0) {
    return { kind: "notice", message: "組み合わせが未作成です" };
  }

  // リーグは星取表で描く（DivisionMatchingView）。ここへ来るのは誤用。
  if (division.format === "ROUND_ROBIN") {
    return {
      kind: "notice",
      message: `「${DIVISION_FORMAT_LABELS[division.format]}」のブラケット表示はまだ対応していません`,
    };
  }

  const converted = fromDivision({
    id: division.id,
    name: division.name,
    format: division.format,
    entries: parsed.entries,
    matchingConfig: parsed.matchingConfig,
    // 空欄モードでも BYE の勝ち上がりは resolveBracket が構造から決めるので残る
    results: withResults ? parsed.results : EMPTY_DIVISION_RESULTS,
    resultConfig,
    // memberId は setup 画面の候補絞り込み用で、ブラケットには要らない。
    // 公開ページではノードのデータがクライアントへ送られるため、
    // 描画に使う項目だけを渡して内部 id が紛れ込まないようにする。
    participants: participants.map(({ id, name, playerNumber, team }) => ({
      id,
      name: withPlayerNumber ? `No.${playerNumber} ${name}` : name,
      team,
    })),
    matchNames: resolveMatchNames(
      parsed.matchingConfig,
      division.id,
      overallSeq,
    ),
  });
  if (converted === null) {
    return {
      kind: "notice",
      message: "この組み合わせはまだ表示に対応していません",
    };
  }

  // resolveBracket / layoutBracket は矛盾したデータで例外を投げる設計。
  // ここも同じくページを落とさず案内で返す。
  try {
    const matches = resolveBracket(
      converted.participants,
      converted.bracket,
      converted.results,
    );
    const positions = layoutBracket(matches);
    return {
      kind: "ready",
      matches,
      positions,
      labels: sectionLabels(matches, positions),
    };
  } catch {
    return { kind: "notice", message: "ブラケットを組み立てられませんでした" };
  }
}
```

- [ ] **Step 4: `DivisionBracket` を置き換える**

`src/components/division/DivisionBracket.tsx` の中身を次にする（props とその説明コメントは現行のまま）:

```tsx
import { TournamentFlow } from "@/components/tournament/TournamentFlow";
import { toFlowElements } from "@/features/bracket/to-flow-elements";
import type {
  DivisionDetail,
  DivisionParticipant,
} from "@/features/division/repository";
import { type BracketEditor, EditableBracket } from "./EditableBracket";
import { Notice } from "./Notice";
import { prepareBracket } from "./prepare-bracket";

export function DivisionBracket({
  division,
  participants,
  overallSeq,
  heightClassName = "h-[28rem]",
  editor,
}: {
  division: DivisionDetail;
  participants: DivisionParticipant[];
  /** 大会全体の通し番号。試合名の {{OverallSeq}} の展開に使う */
  overallSeq: ReadonlyMap<string, number>;
  /**
   * 描画枠の高さ。既定は管理画面の詳細ページ向け。公開のブラケットページは
   * ブラケット専用の画面なので、dvh 基準の高さを渡して画面を占有させる。
   * Tailwind v4 はソース中の文字列からクラスを生成するため、
   * 呼び出し側は必ず文字列リテラルで渡すこと。
   */
  heightClassName?: string;
  /** 渡すと 1 回戦のスロットに鉛筆を出す編集モード。setup 画面だけが渡す */
  editor?: BracketEditor;
}) {
  // パースから座標計算までは印刷（PrintBracket）と共有する。
  const prepared = prepareBracket(division, participants, overallSeq);
  if (prepared.kind === "notice") {
    return <Notice>{prepared.message}</Notice>;
  }

  // toFlowElements も座標の欠けで例外を投げる。ページは落とさない。
  let elements: ReturnType<typeof toFlowElements>;
  try {
    elements = toFlowElements(
      prepared.matches,
      prepared.positions,
      prepared.labels,
    );
  } catch {
    return <Notice>ブラケットを組み立てられませんでした</Notice>;
  }

  return (
    <div
      className={`${heightClassName} rounded border border-slate-200 bg-white`}
    >
      {editor === undefined ? (
        <TournamentFlow nodes={elements.nodes} edges={elements.edges} />
      ) : (
        <EditableBracket
          nodes={elements.nodes}
          edges={elements.edges}
          {...editor}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: テストと型を確認する**

Run: `pnpm vitest run src/components/division`
Expected: PASS（新規の `prepare-bracket.test.ts` と既存の `DivisionBracket.test.tsx` などすべて）

Run: `pnpm typecheck`
Expected: エラーなし（fresh worktree で `PageProps` / `LayoutProps` が無いと言われたら先に `pnpm exec next typegen`）

- [ ] **Step 6: コミット**

```bash
pnpm exec biome check --write src/components/division/prepare-bracket.ts src/components/division/prepare-bracket.test.ts src/components/division/DivisionBracket.tsx
git add src/components/division
git commit -m "refactor(division): share bracket preparation between screen and print" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `prepareLeagueTable` と `LeagueResultTable` の印刷向け prop

**Files:**
- Create: `src/components/division/prepare-league-table.ts`
- Test: `src/components/division/prepare-league-table.test.ts`
- Modify: `src/components/division/DivisionMatchingView.tsx`（`LeagueSection`）
- Modify: `src/components/division/LeagueResultTable.tsx`
- Test: `src/components/division/LeagueResultTable.test.tsx`（追記）

**Interfaces:**
- Produces:
  ```ts
  export type PreparedLeagueTable =
    | { kind: "ready"; table: LeagueTableView }
    | { kind: "notice"; message: string };
  export function prepareLeagueTable(
    division: DivisionDetail,
    participants: DivisionParticipant[],
    overallSeq: ReadonlyMap<string, number>,
    options?: { withResults?: boolean },
  ): PreparedLeagueTable;
  ```
  - `LeagueResultTable` の props: `{ table: LeagueTableView; print?: boolean; showStandings?: boolean }`
    - `print`: 横スクロールの箱をやめ、ページ幅いっぱいの表にする
    - `showStandings: false`: 順位・勝・分・敗・勝点のマスを空欄にする（列は残す）

- [ ] **Step 1: 失敗するテストを書く**

`src/components/division/prepare-league-table.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { DivisionDetail } from "@/features/division/repository";
import { prepareLeagueTable } from "./prepare-league-table";

const participants = [
  { id: "p1", name: "佐藤 蓮", nameKana: "サトウ レン", playerNumber: "1" },
  { id: "p2", name: "鈴木 陽菜", nameKana: "スズキ ハルナ", playerNumber: "2" },
];

const noSeq = new Map<string, number>();

const buildDivision = (
  overrides: Partial<DivisionDetail> = {},
): DivisionDetail => ({
  id: "d1",
  name: "リーグ",
  order: 0,
  format: "ROUND_ROBIN",
  entries: {
    version: 1,
    entries: [
      { id: "e1", participantId: "p1", seed: 0 },
      { id: "e2", participantId: "p2", seed: 1 },
    ],
  },
  matchingConfig: {
    version: 1,
    matches: [
      {
        id: "r1-0",
        bracket: "winners",
        round: 1,
        order: 0,
        matchName: "1",
        slots: [
          { kind: "entry", entryId: "e1" },
          { kind: "entry", entryId: "e2" },
        ],
      },
    ],
  },
  results: { version: 1, matches: [{ matchId: "r1-0", winnerEntryId: "e2" }] },
  resultConfig: null,
  createdAt: new Date("2026-08-01T00:00:00Z"),
  ...overrides,
});

describe("prepareLeagueTable", () => {
  it("結果込みの表を返す", () => {
    const prepared = prepareLeagueTable(buildDivision(), participants, noSeq);

    if (prepared.kind !== "ready") throw new Error("ready のはず");
    // 勝った e2（鈴木）が 1 位
    expect(prepared.table.rows[0].label).toBe("鈴木 陽菜");
    expect(prepared.table.rows[0].wins).toBe(1);
  });

  it("withResults: false なら勝敗を数えず、印も付けない", () => {
    const prepared = prepareLeagueTable(buildDivision(), participants, noSeq, {
      withResults: false,
    });

    if (prepared.kind !== "ready") throw new Error("ready のはず");
    expect(prepared.table.rows.every((row) => row.wins === 0)).toBe(true);
    const cells = prepared.table.rows.flatMap((row) => row.cells);
    expect(
      cells.every((cell) => cell.kind !== "match" || cell.outcome === null),
    ).toBe(true);
  });

  it("Json が壊れていれば案内文を返す", () => {
    expect(
      prepareLeagueTable(
        buildDivision({ entries: "broken" }),
        participants,
        noSeq,
      ),
    ).toEqual({ kind: "notice", message: "部門のデータを読み込めませんでした" });
  });

  it("組み合わせが無ければ案内文を返す", () => {
    expect(
      prepareLeagueTable(
        buildDivision({ matchingConfig: { version: 1, matches: [] } }),
        participants,
        noSeq,
      ),
    ).toEqual({ kind: "notice", message: "組み合わせが未作成です" });
  });
});
```

`src/components/division/LeagueResultTable.test.tsx` の末尾に追記（既存の `table` フィクスチャを使う。e1 の勝点 4 はこの表で 1 か所にしか出ない）:

```tsx
describe("LeagueResultTable（印刷向け）", () => {
  it("showStandings={false} なら集計の数字を出さない", () => {
    render(<LeagueResultTable table={table} showStandings={false} />);

    expect(screen.queryByText("4")).not.toBeInTheDocument();
    // 列そのものは残す（手書きの欄になる）
    expect(screen.getByRole("columnheader", { name: "勝点" })).toBeInTheDocument();
  });

  it("既定では集計の数字を出す", () => {
    render(<LeagueResultTable table={table} />);

    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("print なら横スクロールの箱に入れない", () => {
    const { container } = render(<LeagueResultTable table={table} print />);

    expect(container.firstChild).not.toHaveClass("overflow-x-auto");
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `pnpm vitest run src/components/division/prepare-league-table.test.ts src/components/division/LeagueResultTable.test.tsx`
Expected: FAIL（`./prepare-league-table` が無い／`showStandings` が効かず "4" が出る／`overflow-x-auto` が付いている）

- [ ] **Step 3: `prepareLeagueTable` を実装する**

`src/components/division/prepare-league-table.ts`:

```ts
import type {
  DivisionDetail,
  DivisionParticipant,
} from "@/features/division/repository";
import { isRoundRobinShape } from "@/features/division/round-robin/build";
import {
  type LeagueTableView,
  toLeagueTableView,
} from "@/features/division/round-robin/standings";
import { resolveMatchNames } from "@/lib/division/match-name";
import {
  parseDivisionEntries,
  parseDivisionResults,
  parseMatchingConfig,
} from "@/lib/division/parse";
import { EMPTY_DIVISION_RESULTS } from "@/lib/division/types";

/** 描ける状態のリーグ表か、代わりに出す 1 行の案内。 */
export type PreparedLeagueTable =
  | { kind: "ready"; table: LeagueTableView }
  | { kind: "notice"; message: string };

/**
 * 部門の Json をリーグの結果表にする。画面（DivisionMatchingView）と
 * 印刷（PrintDivisionSection）が同じ判定・同じ案内文を使う。
 */
export function prepareLeagueTable(
  division: DivisionDetail,
  participants: DivisionParticipant[],
  overallSeq: ReadonlyMap<string, number>,
  options: { withResults?: boolean } = {},
): PreparedLeagueTable {
  const { withResults = true } = options;

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
    return { kind: "notice", message: "部門のデータを読み込めませんでした" };
  }

  if (parsed.matchingConfig.matches.length === 0) {
    return { kind: "notice", message: "組み合わせが未作成です" };
  }

  // /edit は format を無条件に書き換えられるので、トーナメントの木を
  // 持ったままリーグになった部門が存在しうる。その木を結果表として
  // 描くと嘘になるため、案内だけ出す（編集画面の LeagueSetup と同じ扱い）。
  if (!isRoundRobinShape(parsed.matchingConfig)) {
    return { kind: "notice", message: "この対戦表はリーグの形ではありません" };
  }

  return {
    kind: "ready",
    table: toLeagueTableView(
      parsed.matchingConfig,
      parsed.entries,
      withResults ? parsed.results : EMPTY_DIVISION_RESULTS,
      participants,
      resolveMatchNames(parsed.matchingConfig, division.id, overallSeq),
    ),
  };
}
```

- [ ] **Step 4: `DivisionMatchingView` の `LeagueSection` を置き換える**

`src/components/division/DivisionMatchingView.tsx` の import と `LeagueSection` を次にする（`DivisionMatchingView` 本体は変えない）。使わなくなった import（`isRoundRobinShape`、`toLeagueTableView`、`resolveMatchNames`、`parse*`）は消す:

```tsx
import type {
  DivisionDetail,
  DivisionParticipant,
} from "@/features/division/repository";
import { DivisionBracket } from "./DivisionBracket";
import { LeagueResultTable } from "./LeagueResultTable";
import { Notice } from "./Notice";
import { prepareLeagueTable } from "./prepare-league-table";

/** リーグの結果表。Json のパースと形の検査は prepareLeagueTable が受け止める。 */
const LeagueSection = ({
  division,
  participants,
  overallSeq,
}: {
  division: DivisionDetail;
  participants: DivisionParticipant[];
  overallSeq: ReadonlyMap<string, number>;
}) => {
  const prepared = prepareLeagueTable(division, participants, overallSeq);
  if (prepared.kind === "notice") {
    return <Notice>{prepared.message}</Notice>;
  }
  return <LeagueResultTable table={prepared.table} />;
};
```

- [ ] **Step 5: `LeagueResultTable` に prop を足す**

`src/components/division/LeagueResultTable.tsx` の `LeagueResultTable` 関数を次にする（上の `CellContent` などは変えない）:

```tsx
/**
 * 勝敗込みの星取表と順位表を 1 つにまとめた表。
 * 行・列はどちらも順位順で渡ってくる（並べ替えはドメイン側の責務）。
 * 画面では人数が増えると横に広がるので、横スクロールできる箱に入れる。
 * 紙はスクロールできないので、print ではページ幅いっぱいの表にする。
 */
export function LeagueResultTable({
  table,
  print = false,
  showStandings = true,
}: {
  table: LeagueTableView;
  /** 印刷ページ向け。横スクロールの箱をやめる */
  print?: boolean;
  /**
   * false で順位・勝・分・敗・勝点のマスを空欄にする。印刷の空欄モードでは
   * 結果を数えないので、全員 0 の集計は並べず手書きの欄として残す。
   */
  showStandings?: boolean;
}) {
  if (table.headers.length === 0) {
    return <p className="text-sm text-slate-600">まだエントリーがありません</p>;
  }

  const standing = (value: number): number | null =>
    showStandings ? value : null;

  return (
    <div
      className={
        print
          ? "rounded border border-slate-400 bg-white"
          : "overflow-x-auto rounded border border-slate-200 bg-white"
      }
    >
      <table
        className={`${print ? "w-full" : "min-w-full"} border-collapse text-sm`}
      >
        <thead>
          <tr>
            <th scope="col" className={headerClassName}>
              順位
            </th>
            <th scope="col" className={`${headerClassName} text-left`}>
              名前
            </th>
            {table.headers.map((header) => (
              <th key={header.entryId} scope="col" className={headerClassName}>
                {header.label}
              </th>
            ))}
            <th scope="col" className={headerClassName}>
              勝
            </th>
            <th scope="col" className={headerClassName}>
              分
            </th>
            <th scope="col" className={headerClassName}>
              敗
            </th>
            <th scope="col" className={headerClassName}>
              勝点
            </th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.entryId}>
              <td className={`${numberClassName} font-medium`}>
                {standing(row.rank)}
              </td>
              <th
                scope="row"
                className="whitespace-nowrap border-b border-slate-100 px-3 py-2 text-left font-medium text-slate-800"
              >
                {row.label}
              </th>
              {row.cells.map((cell, index) => (
                <td
                  // 列の並びは headers と 1 対 1 なので、列の entryId を鍵にする
                  key={table.headers[index].entryId}
                  className="whitespace-nowrap border-b border-slate-100 px-3 py-2 text-center text-xs text-slate-600"
                >
                  <CellContent cell={cell} />
                </td>
              ))}
              <td className={numberClassName}>{standing(row.wins)}</td>
              <td className={numberClassName}>{standing(row.draws)}</td>
              <td className={numberClassName}>{standing(row.losses)}</td>
              <td className={`${numberClassName} font-medium`}>
                {standing(row.points)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 6: テストを確認する**

Run: `pnpm vitest run src/components/division`
Expected: PASS（新規・追記分と既存の `DivisionMatchingView.test.tsx`、`LeagueResultTable.test.tsx` すべて）

- [ ] **Step 7: コミット**

```bash
pnpm exec biome check --write src/components/division/prepare-league-table.ts src/components/division/prepare-league-table.test.ts src/components/division/DivisionMatchingView.tsx src/components/division/LeagueResultTable.tsx src/components/division/LeagueResultTable.test.tsx
git add src/components/division
git commit -m "refactor(division): share league table preparation and add print props" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 静的 SVG のトーナメント表（PrintBracket）

**Files:**
- Create: `src/features/bracket/svg-geometry.ts`
- Test: `src/features/bracket/svg-geometry.test.ts`
- Create: `src/components/print/PrintBracket.tsx`
- Test: `src/components/print/PrintBracket.test.tsx`

**Interfaces:**
- Consumes: `NODE_WIDTH`(220) / `NODE_HEIGHT`(76) / `GAP_X`(80) / `Position` / `SectionLabel` / `layoutBracket` / `sectionLabels`（`@/features/bracket/layout-bracket`）、`resolveBracket`、`ResolvedMatch`
- Produces:
  - `bracketViewBox(positions: Iterable<Position>, labels?: SectionLabel[]): { x: number; y: number; width: number; height: number }`
  - `connectorPath(source: Position, target: Position, slotIndex: 0 | 1): string`
  - `PrintBracket({ matches, positions, labels }: { matches: ResolvedMatch[]; positions: Map<string, Position>; labels: SectionLabel[] })` — `<svg role="img" aria-label="トーナメント表">`。カードは `data-testid="print-match-<id>"`、連結線は `data-testid="print-connector"`

- [ ] **Step 1: 失敗するテストを書く（幾何）**

`src/features/bracket/svg-geometry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bracketViewBox, connectorPath } from "./svg-geometry";

describe("bracketViewBox", () => {
  it("カードの外接矩形に、試合名の高さと余白を足す", () => {
    // 右端 300 + 220 = 520、下端 100 + 76 = 176、上端は試合名ぶん 0 - 12 = -12
    expect(
      bracketViewBox([
        { x: 0, y: 0 },
        { x: 300, y: 100 },
      ]),
    ).toEqual({ x: -16, y: -28, width: 552, height: 220 });
  });

  it("セクション見出しが上にあれば含める", () => {
    expect(
      bracketViewBox(
        [
          { x: 0, y: 0 },
          { x: 300, y: 100 },
        ],
        [{ id: "section-winners", label: "勝者側", position: { x: 0, y: -28 } }],
      ),
    ).toEqual({ x: -16, y: -44, width: 552, height: 236 });
  });

  it("カードが無ければ大きさ 0 を返す", () => {
    expect(bracketViewBox([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe("connectorPath", () => {
  it("供給元の右端中央から、次の試合の該当スロットの左端へ直角に結ぶ", () => {
    // 始点 (220, 38)、折れ位置は次の試合の左 40、終点の y は上側スロットの中央 50 + 19
    expect(connectorPath({ x: 0, y: 0 }, { x: 300, y: 50 }, 0)).toBe(
      "M 220 38 H 260 V 69 H 300",
    );
  });

  it("下側スロットへは下半分の中央に着ける", () => {
    expect(connectorPath({ x: 0, y: 0 }, { x: 300, y: 50 }, 1)).toBe(
      "M 220 38 H 260 V 107 H 300",
    );
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `pnpm vitest run src/features/bracket/svg-geometry.test.ts`
Expected: FAIL（`./svg-geometry` が無い）

- [ ] **Step 3: 幾何を実装する**

`src/features/bracket/svg-geometry.ts`:

```ts
import {
  GAP_X,
  NODE_HEIGHT,
  NODE_WIDTH,
  type Position,
  type SectionLabel,
} from "./layout-bracket";

/** viewBox の四辺に足す余白 */
const VIEWBOX_PADDING = 16;
/** 試合名はカードの上に置くので、そのぶん上へ広げる */
export const MATCH_NAME_HEIGHT = 12;

export type ViewBox = { x: number; y: number; width: number; height: number };

/**
 * 静的 SVG の viewBox。layoutBracket の座標はカードの左上なので、
 * カードの大きさ・試合名・セクション見出しを含む外接矩形に余白を足す。
 * viewBox さえ正しければ、SVG は親の箱に合わせて縮むだけで用紙に収まる。
 */
export function bracketViewBox(
  positions: Iterable<Position>,
  labels: SectionLabel[] = [],
): ViewBox {
  const cards = [...positions];
  if (cards.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const left = Math.min(
    ...cards.map((p) => p.x),
    ...labels.map((l) => l.position.x),
  );
  const top = Math.min(
    ...cards.map((p) => p.y - MATCH_NAME_HEIGHT),
    ...labels.map((l) => l.position.y),
  );
  const right = Math.max(...cards.map((p) => p.x + NODE_WIDTH));
  const bottom = Math.max(...cards.map((p) => p.y + NODE_HEIGHT));
  return {
    x: left - VIEWBOX_PADDING,
    y: top - VIEWBOX_PADDING,
    width: right - left + VIEWBOX_PADDING * 2,
    height: bottom - top + VIEWBOX_PADDING * 2,
  };
}

/**
 * 供給元の試合から次の試合への連結線。供給元の右端中央を出て、次の試合の
 * 手前（GAP_X の半分）で縦に折れ、該当スロットの高さで左端に着く。
 * 折れ位置を次の試合の側に置くのは、ダブルイリミネーションの決勝のように
 * 列が離れた供給元でも、横に走る線が他のカードの上を通らないようにするため
 * （供給元の行は、その列より右にカードが無い）。
 */
export function connectorPath(
  source: Position,
  target: Position,
  slotIndex: 0 | 1,
): string {
  const startX = source.x + NODE_WIDTH;
  const startY = source.y + NODE_HEIGHT / 2;
  const bendX = target.x - GAP_X / 2;
  const endY = target.y + (NODE_HEIGHT / 4) * (slotIndex * 2 + 1);
  return `M ${startX} ${startY} H ${bendX} V ${endY} H ${target.x}`;
}
```

- [ ] **Step 4: 幾何のテストが通ることを確認する**

Run: `pnpm vitest run src/features/bracket/svg-geometry.test.ts`
Expected: PASS

- [ ] **Step 5: 失敗するテストを書く（PrintBracket）**

`src/components/print/PrintBracket.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  layoutBracket,
  sectionLabels,
} from "@/features/bracket/layout-bracket";
import { resolveBracket } from "@/features/bracket/resolve-bracket";
import type { Bracket, MatchResult, Participant } from "@/features/bracket/types";
import { PrintBracket } from "./PrintBracket";

const participants: Participant[] = [
  { id: "a", name: "No.1 佐藤", seed: 0 },
  { id: "b", name: "No.2 鈴木", seed: 1 },
  { id: "c", name: "No.3 高橋", seed: 2 },
  { id: "d", name: "No.4 田中", seed: 3 },
];

const bracket: Bracket = {
  id: "d1",
  name: "男子",
  matches: [
    {
      id: "m1",
      round: 1,
      order: 0,
      matchName: "第1試合",
      slots: [
        { kind: "participant", participantId: "a" },
        { kind: "participant", participantId: "b" },
      ],
    },
    {
      id: "m2",
      round: 1,
      order: 1,
      matchName: "第2試合",
      slots: [
        { kind: "participant", participantId: "c" },
        { kind: "participant", participantId: "d" },
      ],
    },
    {
      id: "m3",
      round: 2,
      order: 0,
      matchName: "決勝",
      slots: [
        { kind: "winnerOf", matchId: "m1" },
        { kind: "winnerOf", matchId: "m2" },
      ],
    },
  ],
};

const renderBracket = (target: Bracket, results: MatchResult[]) => {
  const matches = resolveBracket(participants, target, results);
  const positions = layoutBracket(matches);
  return render(
    <PrintBracket
      matches={matches}
      positions={positions}
      labels={sectionLabels(matches, positions)}
    />,
  );
};

describe("PrintBracket", () => {
  it("試合ごとにカードを描き、勝ち上がりを線で結ぶ", () => {
    renderBracket(bracket, []);

    expect(screen.getByRole("img", { name: "トーナメント表" })).toBeInTheDocument();
    expect(screen.getAllByTestId(/^print-match-/)).toHaveLength(3);
    expect(screen.getAllByTestId("print-connector")).toHaveLength(2);
    expect(screen.getByText("決勝")).toBeInTheDocument();
  });

  it("結果があれば勝者を太字にし、スコアを添える", () => {
    renderBracket(bracket, [{ matchId: "m1", winnerId: "a", score: "3-1" }]);

    // 勝者は 1 回戦と、勝ち上がった決勝の 2 か所に出る。1 回戦のカードだけを見る
    const winner = screen
      .getAllByText("No.1 佐藤")
      .find((element) => element.closest("[data-testid='print-match-m1']"));
    expect(winner).toHaveAttribute("font-weight", "700");
    expect(screen.getByText("No.2 鈴木")).toHaveAttribute("font-weight", "400");
    expect(screen.getByText("3-1")).toBeInTheDocument();
  });

  it("結果が無ければ誰も太字にせず、未確定のスロットは空欄にする", () => {
    renderBracket(bracket, []);

    for (const name of ["No.1 佐藤", "No.2 鈴木", "No.3 高橋", "No.4 田中"]) {
      expect(screen.getByText(name)).toHaveAttribute("font-weight", "400");
    }
    // 決勝の 2 スロットは未確定。名前は出さない
    const final = screen.getByTestId("print-match-m3");
    expect(final).not.toHaveTextContent("佐藤");
  });

  it("不戦のスロットは「不戦」と書く", () => {
    renderBracket(
      {
        id: "d2",
        name: "女子",
        matches: [
          {
            id: "m1",
            round: 1,
            order: 0,
            slots: [
              { kind: "participant", participantId: "a" },
              { kind: "bye" },
            ],
          },
        ],
      },
      [],
    );

    expect(screen.getByText("不戦")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: 失敗を確認する**

Run: `pnpm vitest run src/components/print/PrintBracket.test.tsx`
Expected: FAIL（`./PrintBracket` が無い）

- [ ] **Step 7: PrintBracket を実装する**

`src/components/print/PrintBracket.tsx`:

```tsx
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  type Position,
  type SectionLabel,
} from "@/features/bracket/layout-bracket";
import {
  bracketViewBox,
  connectorPath,
} from "@/features/bracket/svg-geometry";
import type { ResolvedMatch, ResolvedSlot } from "@/features/bracket/types";

// モノクロ印刷でも読めるよう、色は濃淡だけで分ける
const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#334155";
const DIVIDER = "#cbd5e1";

const SLOT_HEIGHT = NODE_HEIGHT / 2;
const TEXT_INSET = 8;

/**
 * スロットに書く文字。未確定は当日に手書きできるよう空欄にし、
 * 「第3試合の敗者」のような説明があるときだけ淡色で出す。
 */
const slotText = (slot: ResolvedSlot): { text: string; muted: boolean } => {
  switch (slot.state) {
    case "bye":
      return { text: "不戦", muted: true };
    case "pending":
      return { text: slot.pendingLabel ?? "", muted: true };
    case "confirmed":
      return { text: slot.participant?.name ?? "", muted: false };
  }
};

const SlotRow = ({ slot, index }: { slot: ResolvedSlot; index: 0 | 1 }) => {
  const { text, muted } = slotText(slot);
  // 13px の文字をスロットの縦中央に置くためのベースライン
  const baseline = index * SLOT_HEIGHT + SLOT_HEIGHT / 2 + 5;
  return (
    <>
      <text
        x={TEXT_INSET}
        y={baseline}
        fontSize={13}
        fontWeight={slot.isWinner ? 700 : 400}
        fill={muted ? MUTED : INK}
      >
        {text}
      </text>
      {slot.score !== null && (
        <text
          x={NODE_WIDTH - TEXT_INSET}
          y={baseline}
          fontSize={11}
          textAnchor="end"
          fill={INK}
        >
          {slot.score}
        </text>
      )}
    </>
  );
};

const MatchCard = ({
  match,
  position,
}: {
  match: ResolvedMatch;
  position: Position;
}) => {
  // スロットごとのスコアがあれば試合全体のスコアは重複になるので出さない
  // （画面の MatchCard と同じ扱い）
  const hasSlotScore = match.slots.some((slot) => slot.score !== null);
  const summary = [hasSlotScore ? null : match.score, match.winReason]
    .filter((value): value is string => value !== null && value !== "")
    .join(" ");

  return (
    <g data-testid={`print-match-${match.id}`}>
      {match.matchName !== null && (
        <text x={position.x} y={position.y - 3} fontSize={10} fill={MUTED}>
          {match.matchName}
        </text>
      )}
      {summary !== "" && (
        <text
          x={position.x + NODE_WIDTH}
          y={position.y - 3}
          fontSize={10}
          textAnchor="end"
          fill={INK}
        >
          {summary}
        </text>
      )}
      {/* 入れ子の svg は既定で overflow: hidden なので、長い名前はカードの枠で切れる */}
      <svg
        x={position.x}
        y={position.y}
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
      >
        <rect
          x={0.5}
          y={0.5}
          width={NODE_WIDTH - 1}
          height={NODE_HEIGHT - 1}
          fill="#ffffff"
          stroke={LINE}
        />
        <line
          x1={0}
          y1={SLOT_HEIGHT}
          x2={NODE_WIDTH}
          y2={SLOT_HEIGHT}
          stroke={DIVIDER}
        />
        <SlotRow slot={match.slots[0]} index={0} />
        <SlotRow slot={match.slots[1]} index={1} />
      </svg>
    </g>
  );
};

/**
 * 印刷用のトーナメント表。React Flow は transform・表示範囲外の省略・
 * fitView の待ちが印刷と相性が悪いので、layoutBracket の座標をそのまま
 * 静的な SVG に描く。viewBox で親の箱いっぱいに縮めて 1 ページに収める。
 */
export function PrintBracket({
  matches,
  positions,
  labels,
}: {
  matches: ResolvedMatch[];
  positions: Map<string, Position>;
  labels: SectionLabel[];
}) {
  const box = bracketViewBox(positions.values(), labels);

  const connectors = matches.flatMap((match) =>
    match.sourceMatchIds.flatMap((sourceId, index) => {
      if (sourceId === null) return [];
      const source = positions.get(sourceId);
      const target = positions.get(match.id);
      if (!source || !target) return [];
      return [
        <path
          key={`${sourceId}->${match.id}`}
          data-testid="print-connector"
          d={connectorPath(source, target, index as 0 | 1)}
          fill="none"
          stroke={LINE}
          strokeWidth={1.5}
        />,
      ];
    }),
  );

  return (
    <svg
      role="img"
      aria-label="トーナメント表"
      viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
      preserveAspectRatio="xMidYMin meet"
      className="h-full w-full"
    >
      {connectors}
      {labels.map((label) => (
        <text
          key={label.id}
          x={label.position.x}
          y={label.position.y + 14}
          fontSize={14}
          fontWeight={700}
          fill={INK}
        >
          {label.label}
        </text>
      ))}
      {matches.map((match) => {
        const position = positions.get(match.id);
        return position ? (
          <MatchCard key={match.id} match={match} position={position} />
        ) : null;
      })}
    </svg>
  );
}
```

- [ ] **Step 8: テストを確認する**

Run: `pnpm vitest run src/features/bracket/svg-geometry.test.ts src/components/print/PrintBracket.test.tsx`
Expected: PASS

- [ ] **Step 9: コミット**

```bash
pnpm exec biome check --write src/features/bracket/svg-geometry.ts src/features/bracket/svg-geometry.test.ts src/components/print
git add src/features/bracket/svg-geometry.ts src/features/bracket/svg-geometry.test.ts src/components/print
git commit -m "feat(print): draw the bracket as a static SVG" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 部門を詳細込みで一覧する repository 関数

**Files:**
- Modify: `src/features/division/repository.ts`
- Test: `src/features/division/repository.test.ts`（追記）

**Interfaces:**
- Produces: `listDivisionDetailsInTournament(organizationId: string, tournamentId: string): Promise<DivisionDetail[]>`（order 昇順、`findDivisionInTournament` と同じ列）

- [ ] **Step 1: 失敗するテストを書く**

`src/features/division/repository.test.ts` の import に `listDivisionDetailsInTournament` を足し（`await import("./repository")` の分割代入）、末尾に追記:

```ts
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
```

- [ ] **Step 2: 失敗を確認する**

Run: `pnpm vitest run src/features/division/repository.test.ts`
Expected: FAIL（`listDivisionDetailsInTournament is not a function`）

- [ ] **Step 3: 実装する**

`src/features/division/repository.ts` で、`findDivisionInTournament` の `select` を定数に出して共有し、新しい関数を足す:

```ts
/** 部門の詳細（Json 4 列込み）。1 件引きと一覧引きで列をずらさないよう共有する。 */
const DIVISION_DETAIL_SELECT = {
  id: true,
  name: true,
  order: true,
  format: true,
  entries: true,
  matchingConfig: true,
  results: true,
  resultConfig: true,
  createdAt: true,
} as const;
```

`findDivisionInTournament` の `select: { ... }` を `select: DIVISION_DETAIL_SELECT` に置き換え、その下に:

```ts
/**
 * 大会の全部門を詳細込みで order 昇順に返す。印刷ページが全部門の表を
 * 1 度に描くために使う（部門ごとに findDivisionInTournament を呼ぶと
 * 部門数だけクエリが増える）。所有権の where は listDivisionsInTournament と同じ。
 */
export const listDivisionDetailsInTournament = (
  organizationId: string,
  tournamentId: string,
): Promise<DivisionDetail[]> =>
  prisma.division.findMany({
    where: { tournament: { id: tournamentId, organizationId } },
    orderBy: { order: "asc" },
    select: DIVISION_DETAIL_SELECT,
  });
```

- [ ] **Step 4: テストと型を確認する**

Run: `pnpm vitest run src/features/division/repository.test.ts`
Expected: PASS（既存の `findDivisionInTournament` のテストも）

Run: `pnpm typecheck`
Expected: エラーなし

- [ ] **Step 5: コミット**

```bash
pnpm exec biome check --write src/features/division/repository.ts src/features/division/repository.test.ts
git add src/features/division/repository.ts src/features/division/repository.test.ts
git commit -m "feat(division): list division details for a whole tournament" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 印刷ページのセクション（概要・選手一覧・部門）

**Files:**
- Create: `src/components/print/PrintSummarySection.tsx`
- Create: `src/components/print/PrintParticipantTable.tsx`
- Create: `src/components/print/PrintDivisionSection.tsx`
- Test: `src/components/print/PrintSummarySection.test.tsx`
- Test: `src/components/print/PrintParticipantTable.test.tsx`
- Test: `src/components/print/PrintDivisionSection.test.tsx`

**Interfaces:**
- Consumes: `prepareBracket`（Task 2）、`prepareLeagueTable` / `LeagueResultTable` の `print` `showStandings`（Task 3）、`PrintBracket`（Task 4）、`PublicTournament`（`@/features/tournament/repository`）、`DivisionSummary` / `DivisionDetail` / `DivisionParticipant`（`@/features/division/repository`）、`TournamentParticipant`（`@/features/participant/repository`）
- Produces:
  - `PrintSummarySection({ tournament: PublicTournament; divisions: DivisionSummary[] })` — `<h1>` に大会名
  - `PrintParticipantTable({ participants: TournamentParticipant[] })` — `<h2>選手一覧</h2>` と表
  - `PrintDivisionSection({ division: DivisionDetail; participants: DivisionParticipant[]; overallSeq: ReadonlyMap<string, number>; withResults: boolean })` — `<h2>` に部門名

`repository.ts` は `import "server-only"` を持つが、ここで使うのは型だけ（`import type`）なので jsdom のテストでも問題ない。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/print/PrintSummarySection.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrintSummarySection } from "./PrintSummarySection";

const tournament = {
  id: "t1",
  name: "春季大会",
  startsAt: null,
  status: "IN_PROGRESS" as const,
  createdAt: new Date("2026-08-01T00:00:00Z"),
  description: "",
  organizationId: "o1",
  organizationName: "テニス部",
  isPreview: false,
};

describe("PrintSummarySection", () => {
  it("大会名・組織名・開始日時・ステータスを出す", () => {
    render(<PrintSummarySection tournament={tournament} divisions={[]} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "春季大会" }),
    ).toBeInTheDocument();
    expect(screen.getByText("テニス部")).toBeInTheDocument();
    expect(screen.getByText("未設定")).toBeInTheDocument();
    expect(screen.getByText("進行中")).toBeInTheDocument();
  });

  it("概要が空なら概要の見出しを出さない", () => {
    render(<PrintSummarySection tournament={tournament} divisions={[]} />);

    expect(
      screen.queryByRole("heading", { name: "概要" }),
    ).not.toBeInTheDocument();
  });

  it("概要があれば Markdown として出す", () => {
    render(
      <PrintSummarySection
        tournament={{ ...tournament, description: "**集合** 9 時" }}
        divisions={[]}
      />,
    );

    expect(screen.getByRole("heading", { name: "概要" })).toBeInTheDocument();
    expect(screen.getByText("集合").tagName).toBe("STRONG");
  });

  it("部門を形式つきで並べ、無ければその旨を出す", () => {
    const { rerender } = render(
      <PrintSummarySection
        tournament={tournament}
        divisions={[
          { id: "d1", name: "男子", order: 0, format: "SINGLE_ELIMINATION" },
        ]}
      />,
    );
    expect(
      screen.getByText("男子（シングルエリミネーション）"),
    ).toBeInTheDocument();

    rerender(<PrintSummarySection tournament={tournament} divisions={[]} />);
    expect(screen.getByText("部門がありません")).toBeInTheDocument();
  });
});
```


`src/components/print/PrintParticipantTable.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrintParticipantTable } from "./PrintParticipantTable";

describe("PrintParticipantTable", () => {
  it("選手番号・氏名・所属・出場部門を 1 行に並べる", () => {
    render(
      <PrintParticipantTable
        participants={[
          {
            id: "p1",
            name: "佐藤 蓮",
            nameKana: "サトウ レン",
            playerNumber: "1",
            team: "東高",
            divisions: [
              { id: "d1", name: "男子" },
              { id: "d2", name: "混合" },
            ],
          },
          {
            id: "p2",
            name: "鈴木 陽菜",
            nameKana: "スズキ ハルナ",
            playerNumber: "2",
            divisions: [],
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "選手一覧" }),
    ).toBeInTheDocument();
    const rows = screen.getAllByRole("row");
    // 見出し行 + 2 人
    expect(rows).toHaveLength(3);
    const first = within(rows[1]);
    expect(first.getByText("1")).toBeInTheDocument();
    expect(first.getByText("佐藤 蓮")).toBeInTheDocument();
    expect(first.getByText("東高")).toBeInTheDocument();
    expect(first.getByText("男子、混合")).toBeInTheDocument();
  });

  it("参加者がいなければその旨を出す", () => {
    render(<PrintParticipantTable participants={[]} />);

    expect(screen.getByText("まだ参加者がいません")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
```

`src/components/print/PrintDivisionSection.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DivisionDetail } from "@/features/division/repository";
import { PrintDivisionSection } from "./PrintDivisionSection";

const participants = [
  { id: "p1", name: "佐藤 蓮", nameKana: "サトウ レン", playerNumber: "1" },
  { id: "p2", name: "鈴木 陽菜", nameKana: "スズキ ハルナ", playerNumber: "2" },
];

const noSeq = new Map<string, number>();

const buildDivision = (
  overrides: Partial<DivisionDetail> = {},
): DivisionDetail => ({
  id: "d1",
  name: "男子シングルス",
  order: 0,
  format: "SINGLE_ELIMINATION",
  entries: {
    version: 1,
    entries: [
      { id: "e1", participantId: "p1", seed: 0 },
      { id: "e2", participantId: "p2", seed: 1 },
    ],
  },
  matchingConfig: {
    version: 1,
    matches: [
      {
        id: "m1",
        bracket: "winners",
        round: 1,
        order: 0,
        matchName: "第1試合",
        slots: [
          { kind: "entry", entryId: "e1" },
          { kind: "entry", entryId: "e2" },
        ],
      },
    ],
  },
  results: { version: 1, matches: [{ matchId: "m1", winnerEntryId: "e2" }] },
  resultConfig: null,
  createdAt: new Date("2026-08-01T00:00:00Z"),
  ...overrides,
});

describe("PrintDivisionSection", () => {
  it("見出しに部門名と形式を出す", () => {
    render(
      <PrintDivisionSection
        division={buildDivision()}
        participants={participants}
        overallSeq={noSeq}
        withResults
      />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: /男子シングルス/ }),
    ).toHaveTextContent("シングルエリミネーション");
  });

  it("エリミネーションは選手番号つきの SVG で描く", () => {
    render(
      <PrintDivisionSection
        division={buildDivision()}
        participants={participants}
        overallSeq={noSeq}
        withResults
      />,
    );

    expect(
      screen.getByRole("img", { name: "トーナメント表" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No.2 鈴木 陽菜")).toHaveAttribute(
      "font-weight",
      "700",
    );
  });

  it("空欄モードでは勝者を太字にしない", () => {
    render(
      <PrintDivisionSection
        division={buildDivision()}
        participants={participants}
        overallSeq={noSeq}
        withResults={false}
      />,
    );

    expect(screen.getByText("No.2 鈴木 陽菜")).toHaveAttribute(
      "font-weight",
      "400",
    );
  });

  it("リーグは結果表で描き、空欄モードでは印を付けない", () => {
    const league = buildDivision({
      format: "ROUND_ROBIN",
      matchingConfig: {
        version: 1,
        matches: [
          {
            id: "r1-0",
            bracket: "winners",
            round: 1,
            order: 0,
            matchName: "1",
            slots: [
              { kind: "entry", entryId: "e1" },
              { kind: "entry", entryId: "e2" },
            ],
          },
        ],
      },
      results: {
        version: 1,
        matches: [{ matchId: "r1-0", winnerEntryId: "e2" }],
      },
    });

    const { rerender } = render(
      <PrintDivisionSection
        division={league}
        participants={participants}
        overallSeq={noSeq}
        withResults
      />,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: "勝ち" })).toHaveLength(1);

    rerender(
      <PrintDivisionSection
        division={league}
        participants={participants}
        overallSeq={noSeq}
        withResults={false}
      />,
    );
    expect(
      screen.queryByRole("img", { name: "勝ち" }),
    ).not.toBeInTheDocument();
  });

  it("壊れた部門は案内だけを出す", () => {
    render(
      <PrintDivisionSection
        division={buildDivision({ entries: "broken" })}
        participants={participants}
        overallSeq={noSeq}
        withResults
      />,
    );

    expect(
      screen.getByText("ブラケットのデータを読み込めませんでした"),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `pnpm vitest run src/components/print`
Expected: 新しい 3 ファイルが FAIL（モジュールが無い）。`PrintBracket.test.tsx` は PASS のまま

- [ ] **Step 3: 実装する**

`src/components/print/PrintSummarySection.tsx`:

```tsx
import { TournamentDescriptionMarkdown } from "@/components/tournament/TournamentDescriptionMarkdown";
import { DIVISION_FORMAT_LABELS } from "@/features/division/format";
import type { DivisionSummary } from "@/features/division/repository";
import { formatStartsAt } from "@/features/tournament/format";
import type { PublicTournament } from "@/features/tournament/repository";
import { TOURNAMENT_STATUS_LABELS } from "@/features/tournament/status";

/**
 * 印刷の 1 ページ目。紙だけで大会の要点が分かるよう、公開ページの概要に
 * 部門の一覧を添える。
 */
export function PrintSummarySection({
  tournament,
  divisions,
}: {
  tournament: PublicTournament;
  divisions: DivisionSummary[];
}) {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm text-slate-600">{tournament.organizationName}</p>
        <h1 className="text-2xl font-bold">{tournament.name}</h1>
      </div>

      <dl className="grid grid-cols-[6rem_1fr] gap-y-1 text-sm">
        <dt className="text-slate-600">開始日時</dt>
        <dd>{formatStartsAt(tournament.startsAt)}</dd>
        <dt className="text-slate-600">ステータス</dt>
        <dd>{TOURNAMENT_STATUS_LABELS[tournament.status]}</dd>
      </dl>

      {tournament.description !== "" && (
        <section className="space-y-2">
          <h2 className="text-base font-bold">概要</h2>
          <TournamentDescriptionMarkdown markdown={tournament.description} />
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-base font-bold">部門</h2>
        {divisions.length === 0 ? (
          <p className="text-sm">部門がありません</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {divisions.map((division) => (
              <li key={division.id}>
                {`${division.name}（${DIVISION_FORMAT_LABELS[division.format]}）`}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
```

`src/components/print/PrintParticipantTable.tsx`:

```tsx
import type { TournamentParticipant } from "@/features/participant/repository";

const cellClassName = "border border-slate-400 px-2 py-1 text-left";

/**
 * 印刷の選手一覧。並びは listParticipantsWithDivisions が選手番号の自然順で
 * 決めているので、ここでは並べ替えない。<thead> は印刷でページをまたぐと
 * ブラウザが各ページの先頭に繰り返すので、長い名簿でも列の意味が分かる。
 */
export function PrintParticipantTable({
  participants,
}: {
  participants: TournamentParticipant[];
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">選手一覧</h2>
      {participants.length === 0 ? (
        <p className="text-sm">まだ参加者がいません</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100">
              <th scope="col" className={`${cellClassName} w-20`}>
                選手番号
              </th>
              <th scope="col" className={cellClassName}>
                氏名
              </th>
              <th scope="col" className={cellClassName}>
                所属
              </th>
              <th scope="col" className={cellClassName}>
                出場部門
              </th>
            </tr>
          </thead>
          <tbody>
            {participants.map((participant) => (
              // 行の途中で改ページすると 1 人の情報が 2 枚に割れる
              <tr key={participant.id} className="break-inside-avoid">
                <td className={cellClassName}>{participant.playerNumber}</td>
                <td className={cellClassName}>{participant.name}</td>
                <td className={cellClassName}>{participant.team ?? ""}</td>
                <td className={cellClassName}>
                  {participant.divisions
                    .map((division) => division.name)
                    .join("、")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
```

`src/components/print/PrintDivisionSection.tsx`:

```tsx
import { LeagueResultTable } from "@/components/division/LeagueResultTable";
import { Notice } from "@/components/division/Notice";
import { prepareBracket } from "@/components/division/prepare-bracket";
import { prepareLeagueTable } from "@/components/division/prepare-league-table";
import { DIVISION_FORMAT_LABELS } from "@/features/division/format";
import type {
  DivisionDetail,
  DivisionParticipant,
} from "@/features/division/repository";
import { PrintBracket } from "./PrintBracket";

type BodyProps = {
  division: DivisionDetail;
  participants: DivisionParticipant[];
  overallSeq: ReadonlyMap<string, number>;
  withResults: boolean;
};

const BracketBody = ({
  division,
  participants,
  overallSeq,
  withResults,
}: BodyProps) => {
  const prepared = prepareBracket(division, participants, overallSeq, {
    withResults,
    withPlayerNumber: true,
  });
  if (prepared.kind === "notice") {
    return <Notice>{prepared.message}</Notice>;
  }
  // SVG は親の高さに合わせて縮む。画面では 70vh、印刷では printPageCss が
  // .print-division-body に用紙から求めた高さを与え、1 ページに収める。
  return (
    <div className="print-division-body h-[70vh]">
      <PrintBracket
        matches={prepared.matches}
        positions={prepared.positions}
        labels={prepared.labels}
      />
    </div>
  );
};

const LeagueBody = ({
  division,
  participants,
  overallSeq,
  withResults,
}: BodyProps) => {
  const prepared = prepareLeagueTable(division, participants, overallSeq, {
    withResults,
  });
  if (prepared.kind === "notice") {
    return <Notice>{prepared.message}</Notice>;
  }
  return (
    <LeagueResultTable
      table={prepared.table}
      print
      showStandings={withResults}
    />
  );
};

/** 印刷の部門 1 つ。形式でトーナメント表とリーグ表を描き分ける。 */
export function PrintDivisionSection(props: BodyProps) {
  const { division } = props;
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold">
        {division.name}
        <span className="ml-3 text-sm font-normal text-slate-600">
          {DIVISION_FORMAT_LABELS[division.format]}
        </span>
      </h2>
      {(() => {
        switch (division.format) {
          case "SINGLE_ELIMINATION":
          case "DOUBLE_ELIMINATION_GRAND_FINAL":
          case "DOUBLE_ELIMINATION_THIRD_PLACE":
            return <BracketBody {...props} />;
          case "ROUND_ROBIN":
            return <LeagueBody {...props} />;
          default: {
            // 形式を増やしたときに、何も描かないまま通るのではなくコンパイルエラーにする
            const exhaustive: never = division.format;
            return exhaustive;
          }
        }
      })()}
    </section>
  );
}
```

- [ ] **Step 4: テストを確認する**

Run: `pnpm vitest run src/components/print`
Expected: PASS（4 ファイルとも）

- [ ] **Step 5: コミット**

```bash
pnpm exec biome check --write src/components/print
git add src/components/print
git commit -m "feat(print): add summary, participant and division sections" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: ツールバーと印刷ページ

**Files:**
- Create: `src/components/print/PrintToolbar.tsx`
- Test: `src/components/print/PrintToolbar.test.tsx`
- Create: `src/app/t/[tournamentId]/print/page.tsx`
- Test: `src/app/t/[tournamentId]/print/page.test.tsx`

**Interfaces:**
- Consumes: `parsePrintOptions` / `printHref` / `printPageCss` / `PrintOptions`（Task 1）、`listDivisionDetailsInTournament`（Task 5）、Task 6 の 3 セクション、既存の `findPublicTournament` / `getOptionalSession` / `listParticipantsWithDivisions` / `listOverallOrderSources` / `formatPublicTitle` / `PublicPreviewNotice`
- Produces: `PrintToolbar({ tournamentId: string; options: PrintOptions })`、ページ `/t/[tournamentId]/print`

- [ ] **Step 1: 失敗するテストを書く（ツールバー）**

`src/components/print/PrintToolbar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PrintToolbar } from "./PrintToolbar";

describe("PrintToolbar", () => {
  it("用紙と結果の切替を、今の設定を保ったリンクで出す", () => {
    render(
      <PrintToolbar tournamentId="t1" options={{ paper: "a4", results: false }} />,
    );

    expect(screen.getByRole("link", { name: "A3" })).toHaveAttribute(
      "href",
      "/t/t1/print?paper=a3&results=0",
    );
    expect(screen.getByRole("link", { name: "結果あり" })).toHaveAttribute(
      "href",
      "/t/t1/print?paper=a4&results=1",
    );
  });

  it("選択中の設定に aria-current を付ける", () => {
    render(
      <PrintToolbar tournamentId="t1" options={{ paper: "a4", results: false }} />,
    );

    expect(screen.getByRole("link", { name: "A4" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("link", { name: "空欄" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("link", { name: "A3" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("印刷ボタンでブラウザの印刷を開く", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(
      <PrintToolbar tournamentId="t1" options={{ paper: "a4", results: true }} />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "印刷 / PDFに保存" }),
    );

    expect(print).toHaveBeenCalledOnce();
    print.mockRestore();
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `pnpm vitest run src/components/print/PrintToolbar.test.tsx`
Expected: FAIL（`./PrintToolbar` が無い）

- [ ] **Step 3: ツールバーを実装する**

`src/components/print/PrintToolbar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { type PrintOptions, printHref } from "@/features/print/options";

const Choice = ({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) => (
  <Link
    href={href}
    aria-current={active ? "true" : undefined}
    className={`rounded px-3 py-1 ${
      active
        ? "bg-slate-800 font-medium text-white"
        : "border border-slate-300 bg-white text-slate-700"
    }`}
  >
    {children}
  </Link>
);

/**
 * 印刷ページ上部の操作欄。切替はクエリを書き換えたリンクで行い、表そのものは
 * サーバーで描き直す（設定を URL に残すので、同じ設定のまま共有・再印刷できる）。
 * 紙には出さない。
 */
export function PrintToolbar({
  tournamentId,
  options,
}: {
  tournamentId: string;
  options: PrintOptions;
}) {
  const href = (next: Partial<PrintOptions>) =>
    printHref(tournamentId, { ...options, ...next });

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-4 border-b border-slate-200 bg-white px-4 py-3 text-sm print:hidden">
      <Link href={`/t/${tournamentId}`} className="text-slate-600 underline">
        大会ページへ戻る
      </Link>
      <div role="group" aria-label="用紙サイズ" className="flex gap-1">
        <Choice href={href({ paper: "a4" })} active={options.paper === "a4"}>
          A4
        </Choice>
        <Choice href={href({ paper: "a3" })} active={options.paper === "a3"}>
          A3
        </Choice>
      </div>
      <div role="group" aria-label="試合結果" className="flex gap-1">
        <Choice href={href({ results: true })} active={options.results}>
          結果あり
        </Choice>
        <Choice href={href({ results: false })} active={!options.results}>
          空欄
        </Choice>
      </div>
      <button
        type="button"
        onClick={() => window.print()}
        className="ml-auto rounded bg-slate-800 px-4 py-2 font-medium text-white"
      >
        印刷 / PDFに保存
      </button>
    </div>
  );
}
```

- [ ] **Step 4: ツールバーのテストを確認する**

Run: `pnpm vitest run src/components/print/PrintToolbar.test.tsx`
Expected: PASS

- [ ] **Step 5: 失敗するテストを書く（ページ）**

`src/app/t/[tournamentId]/print/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findPublicTournament = vi.fn();
const listDivisionDetailsInTournament = vi.fn();
const listOverallOrderSources = vi.fn();
const listParticipantsWithDivisions = vi.fn();
const getOptionalSession = vi.fn();
const notFound = vi.fn(() => {
  // next/navigation の notFound は例外を投げて制御を打ち切る。
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("@/features/tournament/repository", () => ({
  findPublicTournament: (tournamentId: string, viewerUserId: string | null) =>
    findPublicTournament(tournamentId, viewerUserId),
}));
vi.mock("@/features/division/repository", () => ({
  listDivisionDetailsInTournament: (organizationId: string, id: string) =>
    listDivisionDetailsInTournament(organizationId, id),
  listOverallOrderSources: (id: string) => listOverallOrderSources(id),
}));
vi.mock("@/features/participant/repository", () => ({
  listParticipantsWithDivisions: (organizationId: string, id: string) =>
    listParticipantsWithDivisions(organizationId, id),
}));
vi.mock("@/shared/middleware/require-session", () => ({
  getOptionalSession: () => getOptionalSession(),
}));

const { default: Page, generateMetadata } = await import("./page");

const pageProps = (
  tournamentId: string,
  searchParams: Record<string, string> = {},
) => ({
  params: Promise.resolve({ tournamentId }),
  searchParams: Promise.resolve(searchParams),
});

// organizationId と tournamentId をわざと異なる値にする。揃えると取り違えを見逃す。
const tournament = {
  id: "t1",
  name: "春季大会",
  startsAt: null,
  status: "IN_PROGRESS" as const,
  createdAt: new Date("2026-08-01T00:00:00Z"),
  description: "",
  organizationId: "o1",
  organizationName: "テニス部",
  isPreview: false,
};

const division = {
  id: "d1",
  name: "男子シングルス",
  order: 0,
  format: "SINGLE_ELIMINATION" as const,
  entries: {
    version: 1,
    entries: [
      { id: "e1", participantId: "p1", seed: 0 },
      { id: "e2", participantId: "p2", seed: 1 },
    ],
  },
  matchingConfig: {
    version: 1,
    matches: [
      {
        id: "m1",
        bracket: "winners",
        round: 1,
        order: 0,
        slots: [
          { kind: "entry", entryId: "e1" },
          { kind: "entry", entryId: "e2" },
        ],
      },
    ],
  },
  results: { version: 1, matches: [] },
  resultConfig: null,
  createdAt: new Date("2026-08-01T00:00:00Z"),
};

const participants = [
  {
    id: "p1",
    name: "佐藤 蓮",
    nameKana: "サトウ レン",
    playerNumber: "1",
    divisions: [{ id: "d1", name: "男子シングルス" }],
  },
  {
    id: "p2",
    name: "鈴木 陽菜",
    nameKana: "スズキ ハルナ",
    playerNumber: "2",
    divisions: [{ id: "d1", name: "男子シングルス" }],
  },
];

describe("PublicPrintPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findPublicTournament.mockResolvedValue(tournament);
    getOptionalSession.mockResolvedValue(null);
    listDivisionDetailsInTournament.mockResolvedValue([division]);
    listParticipantsWithDivisions.mockResolvedValue(participants);
    listOverallOrderSources.mockResolvedValue(new Map());
  });

  it("ログイン中は閲覧者の user.id を公開ゲートに渡す", async () => {
    getOptionalSession.mockResolvedValue({ user: { id: "u1" } });

    await Page(pageProps("t1"));

    expect(findPublicTournament).toHaveBeenCalledWith("t1", "u1");
  });

  it("公開対象でなければ notFound を呼び、部門も参加者も引かない", async () => {
    findPublicTournament.mockResolvedValue(null);

    await expect(Page(pageProps("t1"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(listDivisionDetailsInTournament).not.toHaveBeenCalled();
    expect(listParticipantsWithDivisions).not.toHaveBeenCalled();
  });

  it("ゲートが返した organizationId で部門と参加者を引く", async () => {
    await Page(pageProps("t1"));

    expect(listDivisionDetailsInTournament).toHaveBeenCalledWith("o1", "t1");
    expect(listParticipantsWithDivisions).toHaveBeenCalledWith("o1", "t1");
    expect(listOverallOrderSources).toHaveBeenCalledWith("t1");
  });

  it("概要・選手一覧・部門のセクションを並べる", async () => {
    render(await Page(pageProps("t1")));

    expect(
      screen.getByRole("heading", { level: 1, name: "春季大会" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "選手一覧" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /男子シングルス/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "トーナメント表" }),
    ).toBeInTheDocument();
  });

  it("用紙サイズをクエリから読み、@page に反映する", async () => {
    const { container } = render(await Page(pageProps("t1", { paper: "a3" })));

    expect(container.querySelector("style")?.textContent).toContain(
      "@page division { size: A3 landscape; }",
    );
  });

  it("準備中のプレビューなら案内を出す", async () => {
    findPublicTournament.mockResolvedValue({ ...tournament, isPreview: true });

    render(await Page(pageProps("t1")));

    expect(screen.getByText(/この大会は準備中です/)).toBeInTheDocument();
  });

  it("タイトルに「印刷用」を付ける", async () => {
    const metadata = await generateMetadata(pageProps("t1"));

    expect(metadata.title).toContain("印刷用");
  });
});
```


- [ ] **Step 6: 失敗を確認する**

Run: `pnpm vitest run "src/app/t/[tournamentId]/print/page.test.tsx"`
Expected: FAIL（`./page` が無い）

- [ ] **Step 7: ページを実装する**

`src/app/t/[tournamentId]/print/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintDivisionSection } from "@/components/print/PrintDivisionSection";
import { PrintParticipantTable } from "@/components/print/PrintParticipantTable";
import { PrintSummarySection } from "@/components/print/PrintSummarySection";
import { PrintToolbar } from "@/components/print/PrintToolbar";
import { PublicPreviewNotice } from "@/components/public/PublicPreviewNotice";
import {
  listDivisionDetailsInTournament,
  listOverallOrderSources,
} from "@/features/division/repository";
import { listParticipantsWithDivisions } from "@/features/participant/repository";
import { parsePrintOptions, printPageCss } from "@/features/print/options";
import { formatPublicTitle } from "@/features/tournament/format";
import { findPublicTournament } from "@/features/tournament/repository";
import { getOptionalSession } from "@/shared/middleware/require-session";

export async function generateMetadata({
  params,
}: PageProps<"/t/[tournamentId]/print">): Promise<Metadata> {
  const { tournamentId } = await params;
  const session = await getOptionalSession();
  const tournament = await findPublicTournament(
    tournamentId,
    session?.user.id ?? null,
  );
  // 公開対象でない大会の名前をタイトルに出さない。本体は notFound になる。
  if (tournament === null) {
    return {};
  }
  return {
    // 印刷ダイアログの「PDF に保存」は既定のファイル名にタイトルを使う
    title: formatPublicTitle(
      tournament.name,
      tournament.organizationName,
      "印刷用",
    ),
  };
}

/**
 * 画面では用紙を模した白い箱を並べ、印刷では箱の飾りを消して用紙の余白
 * （@page の margin）に任せる。
 */
const sheetClassName =
  "rounded bg-white p-8 shadow-sm print:rounded-none print:p-0 print:shadow-none";

export default async function PublicPrintPage({
  params,
  searchParams,
}: PageProps<"/t/[tournamentId]/print">) {
  const { tournamentId } = await params;
  const options = parsePrintOptions(await searchParams);

  // 公開ゲート。公開してよい状態だけを where で許可するのはこの関数が持つ。
  // 閲覧者を渡すのは、その組織のメンバーに準備中の大会も印刷させるため。
  const session = await getOptionalSession();
  const tournament = await findPublicTournament(
    tournamentId,
    session?.user.id ?? null,
  );
  if (tournament === null) {
    notFound();
  }

  // ゲートが返した organizationId を渡す（他の公開ページと同じ多層防御）。
  // 選手一覧の参加者は DivisionParticipant の形も満たすので、ブラケットの
  // 名前解決にもそのまま使い、参加者を 2 度引かない。
  const [divisions, participants, overallSeq] = await Promise.all([
    listDivisionDetailsInTournament(tournament.organizationId, tournament.id),
    listParticipantsWithDivisions(tournament.organizationId, tournament.id),
    listOverallOrderSources(tournament.id),
  ]);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 print:bg-white">
      {/* 用紙サイズは実行時に決まるので、@page はここで埋め込む */}
      <style>{printPageCss(options.paper)}</style>
      <PrintToolbar tournamentId={tournament.id} options={options} />

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 print:max-w-none print:space-y-0 print:p-0">
        {tournament.isPreview && (
          <div className="print:hidden">
            <PublicPreviewNotice />
          </div>
        )}

        <div className={sheetClassName}>
          <PrintSummarySection tournament={tournament} divisions={divisions} />
        </div>

        <div className={`${sheetClassName} break-before-page`}>
          <PrintParticipantTable participants={participants} />
        </div>

        {divisions.map((division) => (
          // 名前付きページ division は @page division（横向き）になる
          <div
            key={division.id}
            className={`${sheetClassName} break-before-page [page:division]`}
          >
            <PrintDivisionSection
              division={division}
              participants={participants}
              overallSeq={overallSeq}
              withResults={options.results}
            />
          </div>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 8: 型を生成してテストと型を確認する**

Run: `pnpm exec next typegen`
Expected: 成功（`PageProps<"/t/[tournamentId]/print">` が使えるようになる）

Run: `pnpm vitest run src/components/print "src/app/t/[tournamentId]/print"`
Expected: PASS

Run: `pnpm typecheck`
Expected: エラーなし

- [ ] **Step 9: コミット**

```bash
pnpm exec biome check --write src/components/print "src/app/t/[tournamentId]/print"
git add src/components/print "src/app/t/[tournamentId]/print"
git commit -m "feat(print): add the printable tournament page" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 公開ページと管理画面からの導線

**Files:**
- Modify: `src/app/t/[tournamentId]/page.tsx`
- Test: `src/app/t/[tournamentId]/page.test.tsx`（追記）
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/page.tsx`
- Test: `src/app/orgs/[slug]/tournaments/[tournamentId]/page.test.tsx`（追記）

**Interfaces:**
- Consumes: 印刷ページのパス `/t/<tournamentId>/print`（既定の設定で開くのでクエリは付けない）

- [ ] **Step 1: 失敗するテストを書く**

`src/app/t/[tournamentId]/page.test.tsx` の `describe("PublicTournamentPage")` 内に追記:

```tsx
  it("印刷用ページへの導線を出す", async () => {
    render(await Page(pageProps("t1")));

    expect(screen.getByRole("link", { name: "印刷用PDF" })).toHaveAttribute(
      "href",
      "/t/t1/print",
    );
  });
```

`src/app/orgs/[slug]/tournaments/[tournamentId]/page.test.tsx` の「公開ページを開く」のテストの直後に、同じ書き方で追記:

```tsx
  it("印刷用ページを新しいタブで開く導線を出す", async () => {
    const element = await Page(pageProps("tennis", "t1"));
    render(element);

    const link = screen.getByRole("link", { name: "印刷用PDF" });
    expect(link).toHaveAttribute("href", "/t/t1/print");
    expect(link).toHaveAttribute("target", "_blank");
  });
```

- [ ] **Step 2: 失敗を確認する**

Run: `pnpm vitest run "src/app/t/[tournamentId]/page.test.tsx" "src/app/orgs/[slug]/tournaments/[tournamentId]/page.test.tsx"`
Expected: 追記した 2 件が FAIL（リンクが無い）

- [ ] **Step 3: リンクを足す**

`src/app/t/[tournamentId]/page.tsx` の `grid grid-cols-2` の中、「参加者一覧」リンクの後に:

```tsx
          <Link
            href={`/t/${tournament.id}/print`}
            className="col-span-2 rounded border border-slate-300 bg-white px-4 py-3 text-center text-sm font-medium text-slate-800"
          >
            印刷用PDF
          </Link>
```

`src/app/orgs/[slug]/tournaments/[tournamentId]/page.tsx` の「公開ページを開く」リンクの後に:

```tsx
          {/* 印刷は公開ページの印刷用画面を使う。準備中でもメンバーは公開ゲートを通れる */}
          <Link
            href={`/t/${tournament.id}/print`}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800"
          >
            印刷用PDF
          </Link>
```

- [ ] **Step 4: テストを確認する**

Run: `pnpm vitest run "src/app/t/[tournamentId]/page.test.tsx" "src/app/orgs/[slug]/tournaments/[tournamentId]/page.test.tsx"`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
pnpm exec biome check --write "src/app/t/[tournamentId]/page.tsx" "src/app/t/[tournamentId]/page.test.tsx" "src/app/orgs/[slug]/tournaments/[tournamentId]/page.tsx" "src/app/orgs/[slug]/tournaments/[tournamentId]/page.test.tsx"
git add "src/app/t/[tournamentId]" "src/app/orgs/[slug]/tournaments/[tournamentId]/page.tsx" "src/app/orgs/[slug]/tournaments/[tournamentId]/page.test.tsx"
git commit -m "feat(print): link to the print page from the public and admin overviews" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 全体の確認と実画面での目視

- [ ] **Step 1: 全テスト・型・lint**

Run: `pnpm test`
Expected: 全件 PASS

Run: `pnpm typecheck`
Expected: エラーなし

Run: `pnpm lint`
Expected: 変更したファイルに内容の指摘が無い（CRLF だけの指摘は無視してよい）

- [ ] **Step 2: 開発サーバーで印刷プレビューを見る**

`.env` に `BYPASS_AUTH=1` がある前提で、ブラウザの Cookie に `USER_ID=1` を設定する（ユーザー 1 は組織 `aaaaa` のメンバー）。`pnpm dev` を起動し、ログに出た実際のポート（3000 は他の worktree が使っていることが多い）で開く。

1. 組織 `aaaaa` の大会の管理画面から「印刷用PDF」を押し、新しいタブで `/t/<id>/print` が開くこと
2. 大会概要 → 選手一覧 → 部門（1 部門 1 ページ）の順に並ぶこと
3. Chrome の印刷プレビュー（Ctrl+P）で:
   - 概要・選手一覧が縦、部門ページが横になること
   - トーナメント表が 1 ページに収まり、連結線がカードに正しく着くこと
   - ダブルイリミネーションの部門で「勝者側／敗者側／決勝」の見出しと決勝への線が他のカードに重ならないこと
   - ツールバーが紙に出ないこと
4. ツールバーで A3 に切り替え、印刷プレビューの用紙が A3 になること
5. 「空欄」に切り替え、勝者の太字・スコア・リーグの ○●△ と集計が消え、BYE の勝ち上がりは残ること
6. Cookie を消した（ログアウト状態の）ブラウザで、公開中の大会の `/t/<id>/print` が開けること、準備中の大会は 404 になること

問題が見つかれば、該当タスクのファイルを直してテストを足し、コミットする。
