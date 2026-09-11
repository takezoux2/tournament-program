# 試合結果の詳細（勝因・スコア・メモ）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 試合結果に勝因・スコア・メモを記録できるようにし、その有効/無効と勝因の選択肢を `Division` ごとに設定できるようにする。

**Architecture:** 設定は `Division.resultConfig`（新しい Json 列）、記録は既存の `Division.results` の中の `MatchResultRecord` を拡張して持つ。勝敗の保存（`record-result`）は変更せず、詳細の保存は新スライス `update-result-detail` が担当する（勝者を変えないので下流の記録を消してはならず、条件が違うため）。設定は表示と入力のフィルタにすぎず、`results` を書き換えることは無い。

**Tech Stack:** Next.js 16（App Router / Server Actions）, React 19, TypeScript, Prisma 7 + PostgreSQL, Effect（エラー表現）, Zod v4（入力検証）, Vitest + Testing Library, Tailwind v4, Biome。

設計書: `docs/superpowers/specs/2026-09-12-match-result-detail-design.md`

## Global Constraints

- パッケージマネージャは **pnpm**。`pnpm test` / `pnpm exec vitest run <path>` / `pnpm lint` / `pnpm typecheck`。
- 作業ディレクトリはワークツリー `.claude/worktrees/match-result-detail`（ブランチ `worktree-match-result-detail`）。元のチェックアウトへ `cd` しない。
- **スライス同士は import できない。** `features/division/*` と `features/schedule/*`、および同じカテゴリ内の別スライス（例: `create` と `update`）は相互に import しない。共有したい純粋ロジックは祖先方向（`features/<category>/` 直下、または `src/lib/`）に置く。
- `Division.results` / `Division.entries` / `Division.matchingConfig` / `Division.resultConfig` の Json は **Zod ではなく `src/lib/division/parse.ts` の手書きパーサ**で検証する。既存 3 列と同じ書き方に揃える。フォーム入力の検証だけが Zod。
- Server Action はページを経由せず直接叩けるため、所有権（組織 → 大会 → 部門）は `requireOrganization` とは別に必ず Prisma の `where` にも入れる。
- コメントは日本語。既存ファイルのコメント密度と語り口（「なぜそうしたか」を書く）に合わせる。
- 値の上限は次のとおり。定数として `src/lib/division/types.ts` に置き、各所はそれを参照する。
  - 勝因ラベル: 1〜30 文字、選択肢は最大 20 件
  - スコア欄の数: 1〜8
  - スコアの値: 0 以上 999.99 以下、小数第 2 位まで、または未入力（`null`）
  - メモ: 1000 文字以内
- 既存の `MatchResultRecord.score`（表示用文字列）には**書き込まない**。読み取りだけ残す。
- Windows のチェックアウトのため、Biome が CRLF 由来の差分を大量に出すことがある。lint は自分が触った内容で判断する。

---

### Task 1: `resultConfig` 列とドメイン型・パーサ

**Files:**
- Modify: `prisma/schema.prisma`（`model Division`）
- Create: `prisma/migrations/20260912000000_add_division_result_config/migration.sql`
- Modify: `src/lib/division/types.ts`
- Modify: `src/lib/division/parse.ts`
- Test: `src/lib/division/parse.test.ts`（既存ファイルに追記）

**Interfaces:**
- Consumes: なし（最初のタスク）
- Produces:
  - `type ScoreAggregation = "sum" | "average"`
  - `type DivisionResultConfig = { version: 1; winReason: { enabled: boolean; options: string[] }; score: { enabled: boolean; count: number; aggregation: ScoreAggregation }; note: { enabled: boolean } }`
  - `type MatchScoreEntry = { entryId: string; values: (number | null)[] }`
  - `MatchResultRecord` に `winReason?: string` / `scores?: MatchScoreEntry[]` / `note?: string`
  - `const DEFAULT_DIVISION_RESULT_CONFIG: DivisionResultConfig`
  - `const MAX_SCORE_COUNT = 8` / `MAX_WIN_REASON_OPTIONS = 20` / `MAX_WIN_REASON_LENGTH = 30` / `MAX_NOTE_LENGTH = 1000` / `MAX_SCORE_VALUE = 999.99`
  - `parseDivisionResultConfig(value: unknown): DivisionResultConfig`（`src/lib/division/parse.ts`）

- [ ] **Step 1: 型と定数を書く**

`src/lib/division/types.ts` の `MatchResultRecord` の定義を次で置き換える（`score` と `finishedAt` はそのまま残す）。

```ts
/** スコア欄の数の上限。1 以上この値以下。 */
export const MAX_SCORE_COUNT = 8;
/** 勝因の選択肢の件数の上限。 */
export const MAX_WIN_REASON_OPTIONS = 20;
/** 勝因ラベル 1 件の文字数の上限。 */
export const MAX_WIN_REASON_LENGTH = 30;
/** メモの文字数の上限。 */
export const MAX_NOTE_LENGTH = 1000;
/** スコアの値の上限。下限は 0。 */
export const MAX_SCORE_VALUE = 999.99;

/** 集計方法。スコアを 1 つの数にまとめる方法。 */
export type ScoreAggregation = "sum" | "average";

/**
 * Division.resultConfig の全体。結果入力で何を記録できるかの設定。
 *
 * ここは「表示と入力のフィルタ」でしかない。enabled を false にしても
 * results に入っている記録は消さないし、書き換えもしない。大会の最中に
 * 設定を足したり誤って外したりしても入力済みの値が失われないようにするため。
 */
export type DivisionResultConfig = {
  version: 1;
  winReason: { enabled: boolean; options: string[] };
  /** count は 1〜MAX_SCORE_COUNT。片者あたりのスコア欄の数 */
  score: { enabled: boolean; count: number; aggregation: ScoreAggregation };
  note: { enabled: boolean };
};

/** 1 人ぶんの採点。 */
export type MatchScoreEntry = {
  /**
   * DivisionEntry.id。スロット番号（0/1）で持たないのは、swap-slots で
   * スロットを入れ替えたときに採点が別人に付け替わってしまうため。
   */
  entryId: string;
  /** 未入力は null。長さは保存時の resultConfig.score.count */
  values: (number | null)[];
};

/** Division.results の 1 要素。 */
export type MatchResultRecord = {
  /** BracketMatch.id */
  matchId: string;
  /** DivisionEntry.id。null = 引き分け（ROUND_ROBIN でのみ許可） */
  winnerEntryId: string | null;
  /**
   * 旧・表示用スコア文字列（"3-1" など）。どこからも書き込まれていない。
   * 構造化した scores を足したので今後も書かない。既存データのために読むだけ。
   */
  score?: string;
  /** ISO 8601 */
  finishedAt?: string;
  /** 勝因。現在の resultConfig.winReason.options に無い値も保持する */
  winReason?: string;
  /** 両者ぶんの採点。片方だけの記録も許す */
  scores?: MatchScoreEntry[];
  note?: string;
};
```

同じファイルの末尾（`EMPTY_DIVISION_RESULTS` の下）に既定値を足す。

```ts
// 空配列リテラルと同じ理由で、一度 readonly に型付けしてからキャストする。
const DEFAULT_WIN_REASON_OPTIONS: readonly string[] = Object.freeze([
  "一本勝ち",
  "判定勝ち",
  "反則負け",
  "棄権",
]);

/**
 * Division.resultConfig の既定値。列の @default と同じ内容を持つ。
 *
 * 3 項目とも無効にしてあるので、既存の部門の見え方と操作は何も変わらない。
 * 一方 options には語を入れてあるので、チェックを 1 つ入れるだけで使い始められる。
 */
export const DEFAULT_DIVISION_RESULT_CONFIG: DivisionResultConfig =
  Object.freeze({
    version: 1,
    winReason: Object.freeze({
      enabled: false,
      options: DEFAULT_WIN_REASON_OPTIONS as string[],
    }),
    score: Object.freeze({
      enabled: false,
      count: 3,
      aggregation: "sum" as ScoreAggregation,
    }),
    note: Object.freeze({ enabled: false }),
  });
```

- [ ] **Step 2: スキーマとマイグレーションを書く**

`prisma/schema.prisma` の `model Division` の `results` の下に足す。

```prisma
  /// 結果入力で何を記録できるか。DivisionResultConfig 型。
  resultConfig   Json           @default("{\"version\":1,\"winReason\":{\"enabled\":false,\"options\":[\"一本勝ち\",\"判定勝ち\",\"反則負け\",\"棄権\"]},\"score\":{\"enabled\":false,\"count\":3,\"aggregation\":\"sum\"},\"note\":{\"enabled\":false}}")
```

`prisma/migrations/20260912000000_add_division_result_config/migration.sql` を新規作成する。

```sql
-- AlterTable
ALTER TABLE "Division" ADD COLUMN     "resultConfig" JSONB NOT NULL DEFAULT '{"version":1,"winReason":{"enabled":false,"options":["一本勝ち","判定勝ち","反則負け","棄権"]},"score":{"enabled":false,"count":3,"aggregation":"sum"},"note":{"enabled":false}}';
```

ディレクトリ名の時刻は既存の並び（`20260905120000_verify_existing_users`）より後であればよい。`prisma migrate dev` に生成させてもよいが、ローカル DB が本番の履歴とずれていることがあるため手で書いても構わない。

- [ ] **Step 3: Prisma クライアントを再生成し、型が通ることを確かめる**

Run: `pnpm exec prisma generate`
Expected: `Generated Prisma Client ... to ./src/generated/prisma`

生成物に列が出たことを確かめる（`src/generated/prisma/models/Division.ts` を検索し、`resultConfig` が含まれること）。

Run: `pnpm typecheck`
Expected: エラーなし

- [ ] **Step 4: パーサの失敗するテストを書く**

`src/lib/division/parse.test.ts` の末尾に足す。ファイル先頭の import に `parseDivisionResultConfig` を加えること。

```ts
describe("parseDivisionResultConfig", () => {
  const valid = {
    version: 1,
    winReason: { enabled: true, options: ["一本勝ち", "判定勝ち"] },
    score: { enabled: true, count: 3, aggregation: "average" },
    note: { enabled: false },
  };

  it("正しい設定をそのまま返す", () => {
    expect(parseDivisionResultConfig(valid)).toEqual(valid);
  });

  it("count が範囲外なら弾く", () => {
    expect(() =>
      parseDivisionResultConfig({ ...valid, score: { ...valid.score, count: 9 } }),
    ).toThrow(DivisionJsonError);
    expect(() =>
      parseDivisionResultConfig({ ...valid, score: { ...valid.score, count: 0 } }),
    ).toThrow(DivisionJsonError);
  });

  it("aggregation が未知の値なら弾く", () => {
    expect(() =>
      parseDivisionResultConfig({
        ...valid,
        score: { ...valid.score, aggregation: "median" },
      }),
    ).toThrow(DivisionJsonError);
  });

  it("enabled が真偽値でなければ弾く", () => {
    expect(() =>
      parseDivisionResultConfig({ ...valid, note: { enabled: "yes" } }),
    ).toThrow(DivisionJsonError);
  });
});

describe("parseDivisionResults の詳細項目", () => {
  const base = {
    version: 1,
    matches: [
      {
        matchId: "m1",
        winnerEntryId: "e1",
        winReason: "一本勝ち",
        scores: [
          { entryId: "e1", values: [7, 6.8, null] },
          { entryId: "e2", values: [6.5, 6.9, 6.6] },
        ],
        note: "主審の判定に抗議あり",
      },
    ],
  };

  it("勝因・スコア・メモを読む", () => {
    expect(parseDivisionResults(base)).toEqual(base);
  });

  it("詳細項目を持たない旧データもそのまま読める", () => {
    const old = { version: 1, matches: [{ matchId: "m1", winnerEntryId: "e1" }] };
    expect(parseDivisionResults(old)).toEqual(old);
  });

  it("スコアが範囲外なら弾く", () => {
    const over = {
      version: 1,
      matches: [
        { matchId: "m1", winnerEntryId: "e1", scores: [{ entryId: "e1", values: [1000] }] },
      ],
    };
    expect(() => parseDivisionResults(over)).toThrow(DivisionJsonError);
  });

  it("スコアが数値でも null でもなければ弾く", () => {
    const bad = {
      version: 1,
      matches: [
        { matchId: "m1", winnerEntryId: "e1", scores: [{ entryId: "e1", values: ["7"] }] },
      ],
    };
    expect(() => parseDivisionResults(bad)).toThrow(DivisionJsonError);
  });
});
```

- [ ] **Step 5: テストが落ちることを確かめる**

Run: `pnpm exec vitest run src/lib/division/parse.test.ts`
Expected: FAIL（`parseDivisionResultConfig is not a function` / 詳細項目が落ちて `toEqual` が不一致）

- [ ] **Step 6: パーサを実装する**

`src/lib/division/parse.ts`。まず import に型を足す。

```ts
import type {
  BracketMatch,
  BracketSide,
  DivisionEntries,
  DivisionEntry,
  DivisionResultConfig,
  DivisionResults,
  MatchingConfig,
  MatchResultRecord,
  MatchScoreEntry,
  ScoreAggregation,
  SlotSource,
} from "./types";
import { MAX_SCORE_COUNT, MAX_SCORE_VALUE } from "./types";
```

`asArray` の下に補助を足す。

```ts
const asBoolean = (value: unknown, path: string): boolean =>
  typeof value === "boolean" ? value : fail(path, "真偽値");

/**
 * スコア 1 つぶん。未入力の null は呼び出し側で先に弾く。
 * 範囲をここで見るのは、壊れた値が集計や画面に流れ込むのを入口で止めるため。
 */
const asScoreValue = (value: unknown, path: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fail(path, "数値または null");
  }
  if (value < 0 || value > MAX_SCORE_VALUE) {
    return fail(path, `0 以上 ${MAX_SCORE_VALUE} 以下の数値`);
  }
  return value;
};

const asScoreAggregation = (value: unknown, path: string): ScoreAggregation => {
  const raw = asString(value, path);
  return raw === "sum" || raw === "average"
    ? raw
    : fail(path, '"sum" または "average"');
};

const parseMatchScoreEntry = (value: unknown, path: string): MatchScoreEntry => {
  const record = asRecord(value, path);
  return {
    entryId: asString(record.entryId, `${path}.entryId`),
    values: asArray(record.values, `${path}.values`).map((item, index) =>
      item === null ? null : asScoreValue(item, `${path}.values[${index}]`),
    ),
  };
};
```

`parseMatchResultRecord` の `finishedAt` の直後に足す。

```ts
  if (record.winReason !== undefined) {
    parsed.winReason = asString(record.winReason, `${path}.winReason`);
  }
  if (record.scores !== undefined) {
    parsed.scores = asArray(record.scores, `${path}.scores`).map((item, index) =>
      parseMatchScoreEntry(item, `${path}.scores[${index}]`),
    );
  }
  if (record.note !== undefined) {
    parsed.note = asString(record.note, `${path}.note`);
  }
```

ファイル末尾に設定のパーサを足す。

```ts
/** Division.resultConfig の Json を検証して返す。不正なら DivisionJsonError。 */
export const parseDivisionResultConfig = (
  value: unknown,
): DivisionResultConfig => {
  const record = asRecord(value, "resultConfig");
  const winReason = asRecord(record.winReason, "resultConfig.winReason");
  const score = asRecord(record.score, "resultConfig.score");
  const note = asRecord(record.note, "resultConfig.note");

  const count = asInt(score.count, "resultConfig.score.count");
  if (count < 1 || count > MAX_SCORE_COUNT) {
    fail("resultConfig.score.count", `1 以上 ${MAX_SCORE_COUNT} 以下の整数`);
  }

  return {
    version: asVersion1(record.version, "resultConfig.version"),
    winReason: {
      enabled: asBoolean(winReason.enabled, "resultConfig.winReason.enabled"),
      options: asArray(
        winReason.options,
        "resultConfig.winReason.options",
      ).map((item, index) =>
        asString(item, `resultConfig.winReason.options[${index}]`),
      ),
    },
    score: {
      enabled: asBoolean(score.enabled, "resultConfig.score.enabled"),
      count,
      aggregation: asScoreAggregation(
        score.aggregation,
        "resultConfig.score.aggregation",
      ),
    },
    note: { enabled: asBoolean(note.enabled, "resultConfig.note.enabled") },
  };
};
```

- [ ] **Step 7: テストが通ることを確かめる**

Run: `pnpm exec vitest run src/lib/division/parse.test.ts`
Expected: PASS

Run: `pnpm typecheck`
Expected: エラーなし

- [ ] **Step 8: コミット**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/division/types.ts src/lib/division/parse.ts src/lib/division/parse.test.ts src/generated
git commit -m "feat(division): 結果入力の設定列と詳細項目の型・パーサを足す"
```

`src/generated` が `.gitignore` されている場合は `git add` から外すこと（`git status` で確認する）。

---

### Task 2: スコアの集計

**Files:**
- Create: `src/lib/division/score.ts`
- Test: `src/lib/division/score.test.ts`

**Interfaces:**
- Consumes: `ScoreAggregation`（Task 1）
- Produces:
  - `aggregateScore(values: readonly (number | null)[], aggregation: ScoreAggregation): number | null`
  - `formatScore(value: number | null): string | null`

クライアント（入力中の追従表示）とサーバ（公開ページの描画）の両方から呼ぶので、`features` ではなく `src/lib/` に置く。

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/division/score.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { aggregateScore, formatScore } from "./score";

describe("aggregateScore", () => {
  it("合計を出す", () => {
    expect(aggregateScore([7, 6.8, 7.2], "sum")).toBeCloseTo(21, 10);
  });

  it("平均を出す", () => {
    expect(aggregateScore([7, 6, 5], "average")).toBeCloseTo(6, 10);
  });

  it("未入力（null）は数に入れない", () => {
    // 未入力を 0 として扱うと、合計も平均も嘘になる。
    expect(aggregateScore([7, null, 5], "sum")).toBeCloseTo(12, 10);
    expect(aggregateScore([7, null, 5], "average")).toBeCloseTo(6, 10);
  });

  it("全部未入力なら null", () => {
    expect(aggregateScore([null, null], "sum")).toBeNull();
    expect(aggregateScore([null, null], "average")).toBeNull();
  });

  it("空配列なら null", () => {
    expect(aggregateScore([], "sum")).toBeNull();
  });
});

describe("formatScore", () => {
  it("null はそのまま null", () => {
    expect(formatScore(null)).toBeNull();
  });

  it("末尾の不要な 0 を落とす", () => {
    expect(formatScore(21)).toBe("21");
    expect(formatScore(7.5)).toBe("7.5");
    expect(formatScore(7.0)).toBe("7");
  });

  it("小数第 2 位で四捨五入する", () => {
    expect(formatScore(20 / 3)).toBe("6.67");
    expect(formatScore(6.665)).toBe("6.67");
  });

  it("浮動小数の誤差を画面に出さない", () => {
    expect(formatScore(0.1 + 0.2)).toBe("0.3");
    expect(formatScore(aggregateScore([7, 6.8, 7.2], "sum"))).toBe("21");
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `pnpm exec vitest run src/lib/division/score.test.ts`
Expected: FAIL（`Failed to resolve import "./score"`）

- [ ] **Step 3: 実装する**

`src/lib/division/score.ts`

```ts
import type { ScoreAggregation } from "./types";

/**
 * 非 null の値だけで集計する。1 つも無ければ null。
 *
 * 未入力を 0 として扱わないのは、審判 3 人のうち 1 人ぶんしか入っていない
 * 状態で合計も平均も嘘になるため。入力途中の保存を許す以上、この区別は要る。
 */
export const aggregateScore = (
  values: readonly (number | null)[],
  aggregation: ScoreAggregation,
): number | null => {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) {
    return null;
  }
  const total = present.reduce((sum, value) => sum + value, 0);
  return aggregation === "sum" ? total : total / present.length;
};

/**
 * 表示用の文字列。小数第 2 位で四捨五入し、末尾の不要な 0 を落とす。
 *
 * 丸めは表示の直前に 1 回だけ行う。集計の途中で丸めると誤差が積み上がるし、
 * 丸めずに String() へ渡すと 0.30000000000000004 が画面に出る。
 */
export const formatScore = (value: number | null): string | null =>
  value === null ? null : String(Math.round(value * 100) / 100);
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `pnpm exec vitest run src/lib/division/score.test.ts`
Expected: PASS（15 前後の assertion、0 failures）

- [ ] **Step 5: コミット**

```bash
git add src/lib/division/score.ts src/lib/division/score.test.ts
git commit -m "feat(division): スコアの集計と表示用の書式を足す"
```

---

### Task 3: 設定の保存（update スライス）

**Files:**
- Modify: `src/features/division/update/schema.ts`
- Modify: `src/features/division/update/repository.ts`
- Modify: `src/features/division/update/usecase.ts`
- Modify: `src/features/division/update/handler.ts`
- Test: `src/features/division/update/schema.test.ts`（新規）
- Test: `src/features/division/update/repository.test.ts`（既存に追記）
- Test: `src/features/division/update/usecase.test.ts`（既存に追記）

**Interfaces:**
- Consumes: `DivisionResultConfig` / `MAX_*` 定数（Task 1）
- Produces:
  - `divisionResultConfigSchema`（`update/schema.ts`）— 入力 `{ winReasonEnabled: boolean; winReasonOptions: string; scoreEnabled: boolean; scoreCount: string; scoreAggregation: string; noteEnabled: boolean }` → 出力 `DivisionResultConfig`
  - `UpdateDivisionInput` に `resultConfig: DivisionResultConfig`
  - `UpdateDivisionPort` の引数に `resultConfig: DivisionResultConfig`
  - フォームの欄名: `winReasonEnabled` / `winReasonOptions` / `scoreEnabled` / `scoreCount` / `scoreAggregation` / `noteEnabled`

- [ ] **Step 1: スキーマの失敗するテストを書く**

`src/features/division/update/schema.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { updateDivisionSchema } from "./schema";

const base = {
  name: "男子シングルス",
  format: "SINGLE_ELIMINATION",
  resultConfig: {
    winReasonEnabled: true,
    winReasonOptions: "一本勝ち\n判定勝ち",
    scoreEnabled: true,
    scoreCount: "3",
    scoreAggregation: "average",
    noteEnabled: false,
  },
};

const parse = (override: Partial<typeof base.resultConfig>) =>
  updateDivisionSchema.safeParse({
    ...base,
    resultConfig: { ...base.resultConfig, ...override },
  });

describe("updateDivisionSchema の resultConfig", () => {
  it("設定を DivisionResultConfig に変換する", () => {
    const result = parse({});
    expect(result.success).toBe(true);
    expect(result.success && result.data.resultConfig).toEqual({
      version: 1,
      winReason: { enabled: true, options: ["一本勝ち", "判定勝ち"] },
      score: { enabled: true, count: 3, aggregation: "average" },
      note: { enabled: false },
    });
  });

  it("選択肢を trim し、空行と重複を落とす", () => {
    const result = parse({
      winReasonOptions: "  一本勝ち  \n\n判定勝ち\n一本勝ち\n   \n",
    });
    expect(result.success && result.data.resultConfig.winReason.options).toEqual(
      ["一本勝ち", "判定勝ち"],
    );
  });

  it("改行コードが CRLF でも 1 行 1 項目として読む", () => {
    const result = parse({ winReasonOptions: "一本勝ち\r\n判定勝ち" });
    expect(result.success && result.data.resultConfig.winReason.options).toEqual(
      ["一本勝ち", "判定勝ち"],
    );
  });

  it("30 文字を超える選択肢は弾く", () => {
    const result = parse({ winReasonOptions: "あ".repeat(31) });
    expect(result.success).toBe(false);
  });

  it("21 件以上の選択肢は弾く", () => {
    const result = parse({
      winReasonOptions: Array.from({ length: 21 }, (_, i) => `理由${i}`).join("\n"),
    });
    expect(result.success).toBe(false);
  });

  it("スコア欄の数が 1〜8 の外なら弾く", () => {
    expect(parse({ scoreCount: "0" }).success).toBe(false);
    expect(parse({ scoreCount: "9" }).success).toBe(false);
    expect(parse({ scoreCount: "1" }).success).toBe(true);
    expect(parse({ scoreCount: "8" }).success).toBe(true);
  });

  it("未知の集計方法は弾く", () => {
    expect(parse({ scoreAggregation: "median" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `pnpm exec vitest run src/features/division/update/schema.test.ts`
Expected: FAIL（`resultConfig` が出力に無い / unrecognized key）

- [ ] **Step 3: スキーマを実装する**

`src/features/division/update/schema.ts` を全面的に書き換える。

```ts
import { z } from "zod";
import type { DivisionResultConfig } from "@/lib/division/types";
import {
  MAX_SCORE_COUNT,
  MAX_WIN_REASON_LENGTH,
  MAX_WIN_REASON_OPTIONS,
} from "@/lib/division/types";
import { divisionFormatSchema, divisionNameSchema } from "../schema-parts";

/**
 * textarea の中身を選択肢の配列にする。1 行 1 項目。
 * 行追加ボタンの類を作らず textarea 1 つで済ませているのは、並べ替えも削除も
 * テキスト編集で完結し、クライアント側の状態を持たずに済むため。
 *
 * CRLF を先に潰すのは Windows のブラウザが \r\n で送ってくるため。
 * \r が残ると trim で消えるが、文字数の検証だけが先に走ると 1 文字ぶん
 * 多く数えてしまう。
 */
const winReasonOptionsSchema = z
  .string()
  .transform((raw) => {
    const seen = new Set<string>();
    const options: string[] = [];
    for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
      const label = line.trim();
      if (label === "" || seen.has(label)) {
        continue;
      }
      seen.add(label);
      options.push(label);
    }
    return options;
  })
  .pipe(
    z
      .array(
        z
          .string()
          .max(
            MAX_WIN_REASON_LENGTH,
            `勝因は${MAX_WIN_REASON_LENGTH}文字以内で入力してください`,
          ),
      )
      .max(
        MAX_WIN_REASON_OPTIONS,
        `勝因の選択肢は${MAX_WIN_REASON_OPTIONS}件までです`,
      ),
  );

const scoreCountMessage = `スコア欄の数は1以上${MAX_SCORE_COUNT}以下で指定してください`;

/**
 * 結果入力の設定。checkbox は「あるかどうか」しか送られないので、
 * handler 側で真偽値に直してから渡す。
 */
export const divisionResultConfigSchema = z
  .object({
    winReasonEnabled: z.boolean(),
    winReasonOptions: winReasonOptionsSchema,
    scoreEnabled: z.boolean(),
    scoreCount: z.coerce
      .number()
      .int(scoreCountMessage)
      .min(1, scoreCountMessage)
      .max(MAX_SCORE_COUNT, scoreCountMessage),
    scoreAggregation: z.enum(["sum", "average"], {
      error: "集計方法を選択してください",
    }),
    noteEnabled: z.boolean(),
  })
  .transform(
    (input): DivisionResultConfig => ({
      version: 1,
      winReason: {
        enabled: input.winReasonEnabled,
        options: input.winReasonOptions,
      },
      score: {
        enabled: input.scoreEnabled,
        count: input.scoreCount,
        aggregation: input.scoreAggregation,
      },
      note: { enabled: input.noteEnabled },
    }),
  );

/**
 * 入力の形は作成時と同じだが、create から import はしない（同列スライスへの
 * 依存は禁止）。共通の部品は features/division 直下の schema-parts.ts に置き、
 * 両スライスがそこを祖先方向に参照する。
 *
 * resultConfig は update だけが扱うので schema-parts.ts には上げない。
 * 部門の作成画面には結果入力の設定を出さない（作成時に採点方式まで決める
 * 運用は考えにくく、画面を短く保ちたい）。
 */
export const updateDivisionSchema = z.object({
  name: divisionNameSchema,
  format: divisionFormatSchema,
  resultConfig: divisionResultConfigSchema,
});

export type UpdateDivisionInput = z.infer<typeof updateDivisionSchema>;
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `pnpm exec vitest run src/features/division/update/schema.test.ts`
Expected: PASS

- [ ] **Step 5: repository と usecase の失敗するテストを書く**

`src/features/division/update/repository.test.ts` に足す（既存のテストが使っているモックの形に合わせること）。

```ts
it("resultConfig を書き、results には触れない", async () => {
  updateMany.mockResolvedValue({ count: 1 });
  const resultConfig = {
    version: 1 as const,
    winReason: { enabled: true, options: ["一本勝ち"] },
    score: { enabled: false, count: 3, aggregation: "sum" as const },
    note: { enabled: true },
  };

  await Effect.runPromise(
    updateDivisionInDb({
      organizationId: "o1",
      tournamentId: "t1",
      divisionId: "d1",
      name: "男子",
      format: "SINGLE_ELIMINATION",
      resultConfig,
    }),
  );

  const [call] = updateMany.mock.calls;
  expect(call[0].data).toEqual({
    name: "男子",
    format: "SINGLE_ELIMINATION",
    resultConfig,
  });
  expect(call[0].data).not.toHaveProperty("results");
});
```

`src/features/division/update/usecase.test.ts` に足す。

```ts
it("resultConfig を port へそのまま渡す", async () => {
  const resultConfig = {
    version: 1 as const,
    winReason: { enabled: false, options: [] },
    score: { enabled: true, count: 5, aggregation: "average" as const },
    note: { enabled: false },
  };
  const port = vi.fn(() => Effect.succeed({ updated: 1 }));

  await Effect.runPromise(
    updateDivision(
      port,
      { name: "男子", format: "SINGLE_ELIMINATION", resultConfig },
      "o1",
      "t1",
      "d1",
    ),
  );

  expect(port).toHaveBeenCalledWith(
    expect.objectContaining({ resultConfig }),
  );
});
```

- [ ] **Step 6: テストが落ちることを確かめる**

Run: `pnpm exec vitest run src/features/division/update`
Expected: FAIL（`resultConfig` が `data` に無い / 型エラー）

- [ ] **Step 7: repository・usecase・handler を実装する**

`src/features/division/update/repository.ts`

```ts
import "server-only";
import { Effect } from "effect";
import type { Prisma } from "@/generated/prisma/client";
import type { DivisionFormat } from "@/generated/prisma/enums";
import type { DivisionResultConfig } from "@/lib/division/types";
import { prisma } from "@/shared/db/prisma";
import { type DivisionError, toDivisionError } from "../errors";

export type UpdateDivisionPort = (input: {
  organizationId: string;
  tournamentId: string;
  divisionId: string;
  name: string;
  format: DivisionFormat;
  resultConfig: DivisionResultConfig;
}) => Effect.Effect<{ updated: number }, DivisionError>;

/** Prisma の Json 入力は構造的な型をそのままでは受け付けないため、書く直前に変換する。 */
const toJsonInput = (config: DivisionResultConfig): Prisma.InputJsonValue =>
  config as unknown as Prisma.InputJsonValue;

export const updateDivisionInDb: UpdateDivisionPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      // updateMany を使うのは where に所有条件を残したまま更新するため。
      // update は unique な where しか受け付けず、id 単独になってしまう。
      const result = await prisma.division.updateMany({
        where: {
          id: input.divisionId,
          tournament: {
            id: input.tournamentId,
            organizationId: input.organizationId,
          },
        },
        // order はここでは触らない。並べ替えは reorder スライスが担当する。
        // results にも触らない。設定は表示と入力のフィルタでしかなく、
        // 設定を変えても記録済みの内容は消さない。
        data: {
          name: input.name,
          format: input.format,
          resultConfig: toJsonInput(input.resultConfig),
        },
      });
      return { updated: result.count };
    },
    catch: (reason) => toDivisionError(reason, input.tournamentId),
  });
```

`src/features/division/update/usecase.ts` の `port({...})` に `resultConfig: input.resultConfig,` を足す。

`src/features/division/update/handler.ts` の `safeParse` を差し替える。

```ts
  const parsed = updateDivisionSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    format: String(formData.get("format") ?? ""),
    resultConfig: {
      // checkbox はチェックされたときだけ送られてくる。存在の有無を真偽値に直す。
      winReasonEnabled: formData.get("winReasonEnabled") !== null,
      winReasonOptions: String(formData.get("winReasonOptions") ?? ""),
      scoreEnabled: formData.get("scoreEnabled") !== null,
      scoreCount: String(formData.get("scoreCount") ?? ""),
      scoreAggregation: String(formData.get("scoreAggregation") ?? ""),
      noteEnabled: formData.get("noteEnabled") !== null,
    },
  });
```

- [ ] **Step 8: テストが通ることを確かめる**

Run: `pnpm exec vitest run src/features/division/update`
Expected: PASS

Run: `pnpm typecheck`
Expected: エラーなし

- [ ] **Step 9: コミット**

```bash
git add src/features/division/update
git commit -m "feat(division): 部門の更新で結果入力の設定を保存する"
```

---

### Task 4: 部門編集フォームの設定欄

**Files:**
- Modify: `src/features/division/repository.ts`（`DivisionDetail` に `resultConfig`）
- Modify: `src/components/division/DivisionForm.tsx`
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/edit/page.tsx`
- Test: `src/components/division/DivisionForm.test.tsx`（既存に追記）

**Interfaces:**
- Consumes: `DEFAULT_DIVISION_RESULT_CONFIG` / `parseDivisionResultConfig` / `MAX_SCORE_COUNT`（Task 1）、欄名（Task 3）
- Produces: `DivisionForm` の任意 props `defaultResultConfig?: DivisionResultConfig`。渡されたときだけ設定欄を描く。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/division/DivisionForm.test.tsx` に足す。

```ts
const config = {
  version: 1 as const,
  winReason: { enabled: true, options: ["一本勝ち", "判定勝ち"] },
  score: { enabled: false, count: 5, aggregation: "average" as const },
  note: { enabled: true },
};

it("defaultResultConfig が無ければ設定欄を出さない", () => {
  render(
    <DivisionForm
      action={noopAction}
      slug="acme"
      tournamentId="t1"
      submitLabel="作成する"
    />,
  );
  expect(screen.queryByText("結果入力の設定")).not.toBeInTheDocument();
});

it("defaultResultConfig を渡すと現在の設定を初期値にした欄を出す", () => {
  render(
    <DivisionForm
      action={noopAction}
      slug="acme"
      tournamentId="t1"
      submitLabel="保存する"
      divisionId="d1"
      defaultResultConfig={config}
    />,
  );

  expect(screen.getByRole("checkbox", { name: "勝因を記録する" })).toBeChecked();
  expect(
    screen.getByRole("textbox", { name: "勝因の選択肢（1行1項目）" }),
  ).toHaveValue("一本勝ち\n判定勝ち");
  expect(screen.getByRole("checkbox", { name: "スコアを記録する" })).not.toBeChecked();
  expect(screen.getByRole("combobox", { name: "スコア欄の数" })).toHaveValue("5");
  expect(screen.getByRole("radio", { name: "平均" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "メモを記録する" })).toBeChecked();
});
```

`noopAction` は既存テストの書き方に合わせる（無ければ `async () => ({ error: null })` を定義する）。

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `pnpm exec vitest run src/components/division/DivisionForm.test.tsx`
Expected: FAIL（`defaultResultConfig` が未知の prop、チェックボックスが見つからない）

- [ ] **Step 3: repository に列を足す**

`src/features/division/repository.ts`

```ts
/**
 * Json 4 列は Prisma が JsonValue で返す。ここでは形を保証せず unknown として運び、
 * 検証は lib/division の parse 関数に任せる。
 */
export type DivisionDetail = DivisionSummary & {
  entries: unknown;
  matchingConfig: unknown;
  results: unknown;
  resultConfig: unknown;
  createdAt: Date;
};
```

`findDivisionInTournament` の `select` に `resultConfig: true,` を足す。

- [ ] **Step 4: DivisionForm に設定欄を足す**

`src/components/division/DivisionForm.tsx`。import と props を足す。

```tsx
import type { DivisionResultConfig } from "@/lib/division/types";
import { MAX_SCORE_COUNT } from "@/lib/division/types";
```

props に足す。

```tsx
  /**
   * 編集時に渡す。渡されたときだけ「結果入力の設定」欄を描く。
   * 部門を作る時点で採点方式まで決める運用は考えにくいので、作成画面には出さない。
   */
  defaultResultConfig?: DivisionResultConfig;
```

`{state.error !== null && ...}` の直前に足す。

```tsx
      {defaultResultConfig !== undefined && (
        <fieldset className="space-y-3 rounded border border-slate-200 px-3 py-3">
          <legend className="px-1 text-sm font-medium text-slate-700">
            結果入力の設定
          </legend>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="winReasonEnabled"
                defaultChecked={defaultResultConfig.winReason.enabled}
              />
              勝因を記録する
            </label>
            <label
              htmlFor="winReasonOptions"
              className="block text-xs text-slate-500"
            >
              勝因の選択肢（1行1項目）
            </label>
            <textarea
              id="winReasonOptions"
              name="winReasonOptions"
              rows={4}
              defaultValue={defaultResultConfig.winReason.options.join("\n")}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="scoreEnabled"
                defaultChecked={defaultResultConfig.score.enabled}
              />
              スコアを記録する
            </label>
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-2">
                <label htmlFor="scoreCount" className="text-xs text-slate-500">
                  スコア欄の数
                </label>
                <select
                  id="scoreCount"
                  name="scoreCount"
                  defaultValue={String(defaultResultConfig.score.count)}
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                >
                  {Array.from({ length: MAX_SCORE_COUNT }, (_, i) => i + 1).map(
                    (count) => (
                      <option key={count} value={count}>
                        {count}
                      </option>
                    ),
                  )}
                </select>
              </span>
              <span className="flex items-center gap-3 text-sm text-slate-700">
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="scoreAggregation"
                    value="sum"
                    defaultChecked={
                      defaultResultConfig.score.aggregation === "sum"
                    }
                  />
                  合計
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="scoreAggregation"
                    value="average"
                    defaultChecked={
                      defaultResultConfig.score.aggregation === "average"
                    }
                  />
                  平均
                </label>
              </span>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="noteEnabled"
              defaultChecked={defaultResultConfig.note.enabled}
            />
            メモを記録する
          </label>

          <p className="text-xs text-slate-500">
            チェックを外しても記録済みの内容は消えません。画面に出なくなるだけで、
            もう一度チェックを入れれば元どおり見えます。
          </p>
        </fieldset>
      )}
```

- [ ] **Step 5: 編集ページから渡す**

`.../divisions/[divisionId]/edit/page.tsx` の import に足す。

```tsx
import { parseDivisionResultConfig } from "@/lib/division/parse";
import { DEFAULT_DIVISION_RESULT_CONFIG } from "@/lib/division/types";
```

`return` の直前に足す。

```tsx
  // Json は DB の列で、アプリの外から壊れた値が入りうる。編集画面まで落とさず、
  // 読めないときは既定値を出して直せるようにする。
  let resultConfig = DEFAULT_DIVISION_RESULT_CONFIG;
  try {
    resultConfig = parseDivisionResultConfig(division.resultConfig);
  } catch {
    resultConfig = DEFAULT_DIVISION_RESULT_CONFIG;
  }
```

`<DivisionForm ... />` に `defaultResultConfig={resultConfig}` を足す。

- [ ] **Step 6: テストが通ることを確かめる**

Run: `pnpm exec vitest run src/components/division/DivisionForm.test.tsx`
Expected: PASS

Run: `pnpm typecheck`
Expected: エラーなし

- [ ] **Step 7: コミット**

```bash
git add src/features/division/repository.ts src/components/division/DivisionForm.tsx src/components/division/DivisionForm.test.tsx "src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/edit/page.tsx"
git commit -m "feat(division): 部門編集画面に結果入力の設定欄を足す"
```

---

### Task 5: 詳細の保存スライス `update-result-detail`

**Files:**
- Modify: `src/features/division/errors.ts`
- Modify: `src/features/division/messages.ts`
- Modify: `src/features/division/revalidate.ts`
- Create: `src/features/division/update-result-detail/schema.ts`
- Create: `src/features/division/update-result-detail/detail.ts`
- Create: `src/features/division/update-result-detail/usecase.ts`
- Create: `src/features/division/update-result-detail/repository.ts`
- Create: `src/features/division/update-result-detail/handler.ts`
- Test: `src/features/division/update-result-detail/detail.test.ts`
- Test: `src/features/division/update-result-detail/repository.test.ts`
- Test: `src/features/division/errors.test.ts` / `messages.test.ts`（既存に追記）

**Interfaces:**
- Consumes: `applyMatchResult` / `parseDivisionResults` / `parseMatchingConfig` / `parseDivisionResultConfig` / `resolveMatchSlots` / `validateResults`、`DivisionIds` / `DivisionSetupOutcome`（`../setup-store`）
- Produces:
  - `UpdateResultDetailInput = { matchId: string; winReason: string; scores: { entryId: string; values: (number | null)[] }[]; note: string }`
  - `buildDetailRecord(existing, input, config, standingEntryIds): MatchResultRecord`
  - `isAcceptableWinReason(label, config, existing): boolean`
  - `UpdateResultDetailPort` / `updateResultDetailInDb` / `updateResultDetailForDivision`
  - `updateResultDetailAction: DivisionFormAction`（`handler.ts`, `"use server"`）
  - フォームの欄名: `slug` / `tournamentId` / `divisionId` / `matchId` / `winReason` / `note`、スコアは `scoreEntryId`（各者 1 つ）と `score_<entryId>`（欄の数だけ繰り返し）

- [ ] **Step 1: エラーを 2 つ足す**

`src/features/division/errors.ts`。`DivisionSlotNotDecidedError` の下に足す。

```ts
/** 勝敗が未記録の試合に詳細（勝因・スコア・メモ）を入れようとしたことを表す。 */
export class DivisionResultNotRecordedError extends Data.TaggedError(
  "DivisionResultNotRecordedError",
)<{
  readonly matchId: string;
}> {}

/**
 * 選択肢にも現在の記録にも無い勝因を保存しようとしたことを表す。
 * 判定には DB 側の options と現在の記録の両方が要るので Zod では書けず、
 * repository で見る。したがって入力エラーではなくドメインエラーになる。
 */
export class DivisionWinReasonNotAllowedError extends Data.TaggedError(
  "DivisionWinReasonNotAllowedError",
)<{
  readonly winReason: string;
}> {}
```

`DivisionError` の union と `divisionErrorTags` の両方に `DivisionResultNotRecordedError` と `DivisionWinReasonNotAllowedError` を足す（片方だけだとコンパイルエラーになる）。

`src/features/division/messages.ts` に文言を足す。

```ts
    Match.tag(
      "DivisionResultNotRecordedError",
      () => "先に勝敗を記録してください",
    ),
    Match.tag(
      "DivisionWinReasonNotAllowedError",
      () => "その勝因は選べません。画面を再読み込みしてください",
    ),
```

既存の `errors.test.ts` / `messages.test.ts` が全タグを列挙している場合は、そこにも足す。

- [ ] **Step 2: 公開ページの再検証を足す**

`src/features/division/revalidate.ts` の `revalidateDivisionResults` を差し替える。

```ts
/**
 * 勝敗と結果の詳細を書き換えたあとに再検証すべきページ。運営の結果入力・進行順・
 * 部門詳細に加えて、公開側の試合一覧とブラケットも同じ results を読む。
 * 公開側はこれまで再検証の対象から漏れていた。
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
  revalidatePath(`/t/${tournamentId}/schedule`);
  revalidatePath(`/t/${tournamentId}/divisions/${divisionId}`);
};
```

- [ ] **Step 3: 純粋関数の失敗するテストを書く**

`src/features/division/update-result-detail/detail.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { DivisionResultConfig, MatchResultRecord } from "@/lib/division/types";
import { buildDetailRecord, isAcceptableWinReason } from "./detail";

const allEnabled: DivisionResultConfig = {
  version: 1,
  winReason: { enabled: true, options: ["一本勝ち", "判定勝ち"] },
  score: { enabled: true, count: 3, aggregation: "sum" },
  note: { enabled: true },
};

const existing: MatchResultRecord = { matchId: "m1", winnerEntryId: "e1" };
const standing = ["e1", "e2"];

const input = {
  matchId: "m1",
  winReason: "一本勝ち",
  scores: [
    { entryId: "e1", values: [7, 6.8, 7.2] },
    { entryId: "e2", values: [6.5, 6.9, 6.6] },
  ],
  note: "  主審の判定に抗議あり  ",
};

describe("buildDetailRecord", () => {
  it("有効な項目を書き、勝敗は触らない", () => {
    expect(buildDetailRecord(existing, input, allEnabled, standing)).toEqual({
      matchId: "m1",
      winnerEntryId: "e1",
      winReason: "一本勝ち",
      scores: [
        { entryId: "e1", values: [7, 6.8, 7.2] },
        { entryId: "e2", values: [6.5, 6.9, 6.6] },
      ],
      note: "主審の判定に抗議あり",
    });
  });

  it("無効な項目は書かず、既存値も消さない", () => {
    const disabled: DivisionResultConfig = {
      ...allEnabled,
      winReason: { enabled: false, options: [] },
      note: { enabled: false },
    };
    const withValues: MatchResultRecord = {
      ...existing,
      winReason: "判定勝ち",
      note: "既存のメモ",
    };

    const result = buildDetailRecord(withValues, input, disabled, standing);
    expect(result.winReason).toBe("判定勝ち");
    expect(result.note).toBe("既存のメモ");
  });

  it("空文字は解除として扱う", () => {
    const withValues: MatchResultRecord = {
      ...existing,
      winReason: "一本勝ち",
      note: "既存のメモ",
    };
    const result = buildDetailRecord(
      withValues,
      { ...input, winReason: "", note: "   " },
      allEnabled,
      standing,
    );
    expect(result).not.toHaveProperty("winReason");
    expect(result).not.toHaveProperty("note");
  });

  it("この試合に立っていない entryId のスコアは捨てる", () => {
    const result = buildDetailRecord(
      existing,
      {
        ...input,
        scores: [
          { entryId: "e1", values: [7, null, null] },
          { entryId: "e9", values: [9, 9, 9] },
        ],
      },
      allEnabled,
      standing,
    );
    expect(result.scores).toEqual([{ entryId: "e1", values: [7, null, null] }]);
  });

  it("count を超えたスコアは切り詰める", () => {
    const result = buildDetailRecord(
      existing,
      { ...input, scores: [{ entryId: "e1", values: [1, 2, 3, 4, 5] }] },
      allEnabled,
      standing,
    );
    expect(result.scores).toEqual([{ entryId: "e1", values: [1, 2, 3] }]);
  });

  it("全部未入力のスコアは持たない", () => {
    const withScores: MatchResultRecord = {
      ...existing,
      scores: [{ entryId: "e1", values: [7, 7, 7] }],
    };
    const result = buildDetailRecord(
      withScores,
      {
        ...input,
        scores: [
          { entryId: "e1", values: [null, null, null] },
          { entryId: "e2", values: [null, null, null] },
        ],
      },
      allEnabled,
      standing,
    );
    expect(result).not.toHaveProperty("scores");
  });
});

describe("isAcceptableWinReason", () => {
  it("選択肢にある値は受け入れる", () => {
    expect(isAcceptableWinReason("判定勝ち", allEnabled, existing)).toBe(true);
  });

  it("空文字（解除）は受け入れる", () => {
    expect(isAcceptableWinReason("", allEnabled, existing)).toBe(true);
  });

  it("選択肢に無い値は拒否する", () => {
    expect(isAcceptableWinReason("反則負け", allEnabled, existing)).toBe(false);
  });

  it("一覧から消されたが今その試合に入っている値は受け入れる", () => {
    const recorded: MatchResultRecord = { ...existing, winReason: "反則負け" };
    expect(isAcceptableWinReason("反則負け", allEnabled, recorded)).toBe(true);
  });
});
```

- [ ] **Step 4: テストが落ちることを確かめる**

Run: `pnpm exec vitest run src/features/division/update-result-detail/detail.test.ts`
Expected: FAIL（`Failed to resolve import "./detail"`）

- [ ] **Step 5: schema と純粋関数を実装する**

`src/features/division/update-result-detail/schema.ts`

```ts
import { z } from "zod";
import { MAX_NOTE_LENGTH, MAX_SCORE_COUNT, MAX_SCORE_VALUE } from "@/lib/division/types";

const scoreRangeMessage = `スコアは0以上${MAX_SCORE_VALUE}以下で入力してください`;

/**
 * 未入力は null。union ではなく nullable にしているのは、union だと
 * issues[0].message が "invalid_union" になって画面に出す文言が作れないため。
 */
const scoreValueSchema = z
  .number({ error: "スコアは数値で入力してください" })
  .min(0, scoreRangeMessage)
  .max(MAX_SCORE_VALUE, scoreRangeMessage)
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6,
    "スコアは小数第2位まで入力できます",
  )
  .nullable();

/**
 * entryId はクライアントが送ってくるが信用しない。repository がその試合に
 * 立っている 2 人と突き合わせ、一致しないものは捨てる。
 */
const scoreEntrySchema = z.object({
  entryId: z.string().min(1, "スコアの対象が不正です"),
  values: z.array(scoreValueSchema).max(MAX_SCORE_COUNT, "スコアの数が多すぎます"),
});

export const updateResultDetailSchema = z.object({
  matchId: z.string().min(1, "試合の指定が不正です"),
  /** 空文字は「勝因を解除する」を表す */
  winReason: z.string(),
  scores: z.array(scoreEntrySchema).max(2, "スコアの対象が不正です"),
  note: z
    .string()
    .max(MAX_NOTE_LENGTH, `メモは${MAX_NOTE_LENGTH}文字以内で入力してください`),
});

export type UpdateResultDetailInput = z.infer<typeof updateResultDetailSchema>;
```

`src/features/division/update-result-detail/detail.ts`

```ts
import type {
  DivisionResultConfig,
  MatchResultRecord,
  MatchScoreEntry,
} from "@/lib/division/types";
import type { UpdateResultDetailInput } from "./schema";

/**
 * その勝因を保存してよいか。
 *
 * 選択肢に無い任意の文字列を投げ込めると「部門ごとに勝因を決める」という設定の
 * 意味が無くなる。一方で、設定から消された値が既にその試合に入っている場合は
 * 受け入れないと、勝因を変えずにスコアだけ直すことができなくなる。
 */
export const isAcceptableWinReason = (
  label: string,
  config: DivisionResultConfig,
  existing: MatchResultRecord,
): boolean =>
  label === "" ||
  config.winReason.options.includes(label) ||
  existing.winReason === label;

/**
 * 既存の記録に詳細を反映した新しい記録を返す。元の値は変更しない。
 * winnerEntryId には触らないので、下流の記録を消す必要が無い。
 *
 * 無効な項目は書かず、既存値も消さない。画面に出ていない項目を直接 POST で
 * 書き換えられないようにしつつ、「設定は表示と入力のフィルタでしかない」という
 * 方針とも揃う。
 */
export const buildDetailRecord = (
  existing: MatchResultRecord,
  input: UpdateResultDetailInput,
  config: DivisionResultConfig,
  /** その試合に立っている 2 人の DivisionEntry.id */
  standingEntryIds: readonly string[],
): MatchResultRecord => {
  const next: MatchResultRecord = { ...existing };

  if (config.winReason.enabled) {
    const label = input.winReason.trim();
    if (label === "") {
      delete next.winReason;
    } else {
      next.winReason = label;
    }
  }

  if (config.score.enabled) {
    const scores = input.scores
      // 送られてきた entryId は信用しない。その試合に立っている 2 人だけを通す。
      .filter((entry) => standingEntryIds.includes(entry.entryId))
      .map(
        (entry): MatchScoreEntry => ({
          entryId: entry.entryId,
          // 設定を減らしたあとに古い画面から送られてきた余りを落とす。
          values: entry.values.slice(0, config.score.count),
        }),
      )
      // 1 つも入っていない人は持たない。空の配列を残すと「記録がある」ように見える。
      .filter((entry) => entry.values.some((value) => value !== null));

    if (scores.length === 0) {
      delete next.scores;
    } else {
      next.scores = scores;
    }
  }

  if (config.note.enabled) {
    const note = input.note.trim();
    if (note === "") {
      delete next.note;
    } else {
      next.note = note;
    }
  }

  return next;
};
```

- [ ] **Step 6: 純粋関数のテストが通ることを確かめる**

Run: `pnpm exec vitest run src/features/division/update-result-detail/detail.test.ts`
Expected: PASS

- [ ] **Step 7: repository の失敗するテストを書く**

`src/features/division/update-result-detail/repository.test.ts`。モックの形は `src/features/division/record-result/repository.test.ts` に合わせる。

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

const { updateResultDetailInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };

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
      id: "m2-0",
      bracket: "winners",
      round: 2,
      order: 0,
      matchNumber: "2",
      slots: [
        { kind: "winnerOf", matchId: "m1-0" },
        { kind: "bye" },
      ],
    },
  ],
};

const resultConfig = {
  version: 1,
  winReason: { enabled: true, options: ["一本勝ち", "判定勝ち"] },
  score: { enabled: true, count: 3, aggregation: "sum" },
  note: { enabled: true },
};

const input = {
  matchId: "m1-0",
  winReason: "一本勝ち",
  scores: [
    { entryId: "e1", values: [7, 6.8, 7.2] },
    { entryId: "e2", values: [6.5, 6.9, 6.6] },
  ],
  note: "メモ",
};

const row = (results: unknown) => ({
  format: "SINGLE_ELIMINATION",
  matchingConfig,
  results,
  resultConfig,
  revision: 3,
});

const failureTag = (exit: Exit.Exit<unknown, { _tag: string }>): string => {
  const failure = Cause.failureOption(
    Exit.isFailure(exit) ? exit.cause : Cause.empty,
  );
  return Option.isSome(failure) ? failure.value._tag : "";
};

beforeEach(() => {
  findFirst.mockReset();
  updateMany.mockReset();
});

describe("updateResultDetailInDb", () => {
  it("詳細を書き、下流の記録を消さない", async () => {
    findFirst.mockResolvedValue(
      row({
        version: 1,
        matches: [
          { matchId: "m1-0", winnerEntryId: "e1" },
          { matchId: "m2-0", winnerEntryId: "e1" },
        ],
      }),
    );
    updateMany.mockResolvedValue({ count: 1 });

    const exit = await Effect.runPromiseExit(updateResultDetailInDb(ids, input));
    expect(Exit.isSuccess(exit)).toBe(true);

    const written = updateMany.mock.calls[0][0].data.results;
    expect(written.matches).toEqual([
      {
        matchId: "m1-0",
        winnerEntryId: "e1",
        winReason: "一本勝ち",
        scores: [
          { entryId: "e1", values: [7, 6.8, 7.2] },
          { entryId: "e2", values: [6.5, 6.9, 6.6] },
        ],
        note: "メモ",
      },
      // 下流はそのまま残る。勝者を変えていないので矛盾しない。
      { matchId: "m2-0", winnerEntryId: "e1" },
    ]);
    expect(updateMany.mock.calls[0][0].data.revision).toBe(4);
  });

  it("勝敗が未記録なら拒否する", async () => {
    findFirst.mockResolvedValue(row({ version: 1, matches: [] }));

    const exit = await Effect.runPromiseExit(updateResultDetailInDb(ids, input));
    expect(failureTag(exit)).toBe("DivisionResultNotRecordedError");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("組み合わせに無い試合は拒否する", async () => {
    findFirst.mockResolvedValue(
      row({ version: 1, matches: [{ matchId: "m1-0", winnerEntryId: "e1" }] }),
    );

    const exit = await Effect.runPromiseExit(
      updateResultDetailInDb(ids, { ...input, matchId: "m9-9" }),
    );
    expect(failureTag(exit)).toBe("DivisionMatchNotFoundError");
  });

  it("選択肢に無い勝因は拒否する", async () => {
    findFirst.mockResolvedValue(
      row({ version: 1, matches: [{ matchId: "m1-0", winnerEntryId: "e1" }] }),
    );

    const exit = await Effect.runPromiseExit(
      updateResultDetailInDb(ids, { ...input, winReason: "反則負け" }),
    );
    expect(failureTag(exit)).toBe("DivisionWinReasonNotAllowedError");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("一覧から消えた勝因でも、今その試合に入っていれば通す", async () => {
    findFirst.mockResolvedValue(
      row({
        version: 1,
        matches: [
          { matchId: "m1-0", winnerEntryId: "e1", winReason: "反則負け" },
        ],
      }),
    );
    updateMany.mockResolvedValue({ count: 1 });

    const exit = await Effect.runPromiseExit(
      updateResultDetailInDb(ids, { ...input, winReason: "反則負け" }),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
  });

  it("無効な項目は書かず、既存値も消さない", async () => {
    findFirst.mockResolvedValue({
      ...row({
        version: 1,
        matches: [{ matchId: "m1-0", winnerEntryId: "e1", note: "既存のメモ" }],
      }),
      resultConfig: { ...resultConfig, note: { enabled: false } },
    });
    updateMany.mockResolvedValue({ count: 1 });

    await Effect.runPromiseExit(
      updateResultDetailInDb(ids, { ...input, note: "新しいメモ" }),
    );

    const written = updateMany.mock.calls[0][0].data.results;
    expect(written.matches[0].note).toBe("既存のメモ");
  });

  it("revision が競合したら拒否する", async () => {
    findFirst.mockResolvedValue(
      row({ version: 1, matches: [{ matchId: "m1-0", winnerEntryId: "e1" }] }),
    );
    updateMany.mockResolvedValue({ count: 0 });

    const exit = await Effect.runPromiseExit(updateResultDetailInDb(ids, input));
    expect(failureTag(exit)).toBe("DivisionRevisionConflictError");
  });

  it("部門が無ければ found: false", async () => {
    findFirst.mockResolvedValue(null);

    const exit = await Effect.runPromiseExit(updateResultDetailInDb(ids, input));
    expect(Exit.isSuccess(exit) && exit.value).toEqual({ found: false });
  });
});
```

- [ ] **Step 8: テストが落ちることを確かめる**

Run: `pnpm exec vitest run src/features/division/update-result-detail/repository.test.ts`
Expected: FAIL（`Failed to resolve import "./repository"`）

- [ ] **Step 9: usecase・repository・handler を実装する**

`src/features/division/update-result-detail/usecase.ts`

```ts
import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { UpdateResultDetailPort } from "./repository";
import type { UpdateResultDetailInput } from "./schema";

export const updateResultDetailForDivision = (
  port: UpdateResultDetailPort,
  ids: DivisionIds,
  input: UpdateResultDetailInput,
): Effect.Effect<DivisionSetupOutcome<void>, DivisionError> => port(ids, input);
```

`src/features/division/update-result-detail/repository.ts`

```ts
import "server-only";
import { Effect } from "effect";
import type { Prisma } from "@/generated/prisma/client";
import {
  parseDivisionResultConfig,
  parseDivisionResults,
  parseMatchingConfig,
} from "@/lib/division/parse";
import { resolveMatchSlots } from "@/lib/division/resolve";
import { applyMatchResult } from "@/lib/division/results";
import type { DivisionResults } from "@/lib/division/types";
import { validateResults } from "@/lib/division/validate";
import { prisma } from "@/shared/db/prisma";
import {
  DivisionDataError,
  type DivisionError,
  DivisionMatchNotFoundError,
  DivisionResultNotRecordedError,
  DivisionRevisionConflictError,
  DivisionWinReasonNotAllowedError,
  toDivisionError,
} from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import { buildDetailRecord, isAcceptableWinReason } from "./detail";
import type { UpdateResultDetailInput } from "./schema";

export type UpdateResultDetailPort = (
  ids: DivisionIds,
  input: UpdateResultDetailInput,
) => Effect.Effect<DivisionSetupOutcome<void>, DivisionError>;

const toJsonInput = (results: DivisionResults): Prisma.InputJsonValue =>
  results as unknown as Prisma.InputJsonValue;

/**
 * 1 試合の詳細（勝因・スコア・メモ）を書く。勝敗には触らない。
 *
 * record-result と分けているのは、あちらが「勝者が変わったら下流の記録を消す」
 * という条件を持つため。詳細の保存は勝者を変えないので、下流を消してはならない。
 * 同じ入口に同居させると「何を送ったときに何が消えるか」が読めなくなる。
 */
export const updateResultDetailInDb: UpdateResultDetailPort = (ids, input) =>
  Effect.tryPromise({
    try: () =>
      prisma.$transaction(
        async (tx): Promise<DivisionSetupOutcome<void>> => {
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
              matchingConfig: true,
              results: true,
              resultConfig: true,
              revision: true,
            },
          });
          if (!row) {
            return { found: false };
          }

          const config = parseMatchingConfig(row.matchingConfig);
          const current = parseDivisionResults(row.results);
          const resultConfig = parseDivisionResultConfig(row.resultConfig);

          if (!config.matches.some((match) => match.id === input.matchId)) {
            throw new DivisionMatchNotFoundError({ matchId: input.matchId });
          }

          // 勝敗より先に詳細だけを入れる場面は無い。許すと「記録の無い試合が
          // 記録済みに見える」状態を作ってしまう。
          const existing = current.matches.find(
            (record) => record.matchId === input.matchId,
          );
          if (existing === undefined) {
            throw new DivisionResultNotRecordedError({
              matchId: input.matchId,
            });
          }

          if (
            resultConfig.winReason.enabled &&
            !isAcceptableWinReason(
              input.winReason.trim(),
              resultConfig,
              existing,
            )
          ) {
            throw new DivisionWinReasonNotAllowedError({
              winReason: input.winReason,
            });
          }

          // 画面ではその試合に立っている 2 人ぶんしか欄を出さないが、Server Action は
          // ページを経由せず直接叩けるので、ここで独立に確かめる。
          const resolved = resolveMatchSlots(config, current).get(input.matchId);
          const standingEntryIds =
            resolved === undefined
              ? []
              : resolved.slots.flatMap((slot) =>
                  slot.state === "entry" ? [slot.entryId] : [],
                );

          const next = applyMatchResult(
            current,
            buildDetailRecord(existing, input, resultConfig, standingEntryIds),
          );

          // record-result の save と同じく、書く直前に反映後の全体を検証する。
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

          return { found: true, value: undefined };
        },
      ),
    catch: (reason) => toDivisionError(reason, ids.tournamentId),
  });
```

`src/features/division/update-result-detail/handler.ts`

```ts
"use server";

import { Effect, Exit } from "effect";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import { revalidateDivisionResults } from "../revalidate";
import type { DivisionFormState } from "../state";
import { updateResultDetailInDb } from "./repository";
import { updateResultDetailSchema } from "./schema";
import { updateResultDetailForDivision } from "./usecase";

/**
 * スコアの欄名は score_<entryId>。index を名前に入れず getAll の順（＝DOM の順）を
 * そのまま使う。サーバ側は entryId を信用せず、repository がその試合に立っている
 * 2 人と突き合わせて捨てる。
 */
const readScores = (formData: FormData) =>
  formData.getAll("scoreEntryId").map((raw) => {
    const entryId = String(raw);
    return {
      entryId,
      values: formData.getAll(`score_${entryId}`).map((value) => {
        const text = String(value).trim();
        return text === "" ? null : Number(text);
      }),
    };
  });

export const updateResultDetailAction = async (
  prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const divisionId = String(formData.get("divisionId") ?? "");
  // Server Action はページを経由せず直接叩ける別の入口なので、ここで独立に確かめる。
  const { organization } = await requireOrganization(slug);

  const parsed = updateResultDetailSchema.safeParse({
    matchId: String(formData.get("matchId") ?? ""),
    winReason: String(formData.get("winReason") ?? ""),
    scores: readScores(formData),
    note: String(formData.get("note") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    updateResultDetailForDivision(
      updateResultDetailInDb,
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
  // 成功時の戻り値が初期状態と同じ形になるので、record-result と同じく
  // 増えるカウンタで「今回成功した」ことを画面に伝える。
  return { error: null, succeeded: (prevState.succeeded ?? 0) + 1 };
};
```

- [ ] **Step 10: テストが通ることを確かめる**

Run: `pnpm exec vitest run src/features/division`
Expected: PASS（既存のテストも含めて 0 failures）

Run: `pnpm typecheck`
Expected: エラーなし

- [ ] **Step 11: コミット**

```bash
git add src/features/division
git commit -m "feat(division): 試合結果の詳細を保存するスライスを足す"
```

---

### Task 6: 結果行に設定と詳細を載せる

**Files:**
- Modify: `src/features/schedule/types.ts`
- Modify: `src/features/schedule/repository.ts`
- Modify: `src/features/schedule/result-rows.ts`
- Test: `src/features/schedule/result-rows.test.ts`（既存に追記）

**Interfaces:**
- Consumes: `DivisionResultConfig` / `MatchScoreEntry` / `parseDivisionResultConfig`（Task 1）
- Produces: `ResultRowView` の match 行に `resultConfig: DivisionResultConfig` / `winReason: string | null` / `scores: MatchScoreEntry[]` / `note: string | null`、divider 行に `startsAt: Date | null`

- [ ] **Step 1: 失敗するテストを書く**

`src/features/schedule/result-rows.test.ts` に足す。既存のテストが組み立てている `ScheduleDivision` には `resultConfig` を足す必要がある（足さないと型エラーになる）。

```ts
const resultConfig = {
  version: 1 as const,
  winReason: { enabled: true, options: ["一本勝ち"] },
  score: { enabled: true, count: 3, aggregation: "sum" as const },
  note: { enabled: true },
};

it("記録済みの詳細と部門の設定を行に載せる", () => {
  const rows = buildResultRows(
    scheduleRows,
    [
      {
        ...division,
        resultConfig,
        results: {
          version: 1,
          matches: [
            {
              matchId: "m1-0",
              winnerEntryId: "e1",
              winReason: "一本勝ち",
              scores: [{ entryId: "e1", values: [7, null, 7] }],
              note: "抗議あり",
            },
          ],
        },
      },
    ],
    participants,
  );

  const row = rows.find((r) => r.kind === "match" && r.matchId === "m1-0");
  expect(row).toMatchObject({
    resultConfig,
    winReason: "一本勝ち",
    scores: [{ entryId: "e1", values: [7, null, 7] }],
    note: "抗議あり",
  });
});

it("詳細が無い試合は null と空配列になる", () => {
  const rows = buildResultRows(
    scheduleRows,
    [{ ...division, resultConfig, results: { version: 1, matches: [] } }],
    participants,
  );

  const row = rows.find((r) => r.kind === "match" && r.matchId === "m1-0");
  expect(row).toMatchObject({ winReason: null, scores: [], note: null });
});
```

`scheduleRows` / `division` / `participants` の名前は既存テストの変数に合わせること。

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `pnpm exec vitest run src/features/schedule/result-rows.test.ts`
Expected: FAIL（`resultConfig` が未知のプロパティ、行に `winReason` が無い）

- [ ] **Step 3: 型を広げる**

`src/features/schedule/types.ts`。import に `DivisionResultConfig` を足し、`ScheduleDivision` に足す。

```ts
  /** 勝敗記録。進行順のマージ（buildScheduleView）では使わず、結果入力の行だけが使う。 */
  results: DivisionResults;
  /** 結果入力の設定。結果の行（buildResultRows）だけが使う。 */
  resultConfig: DivisionResultConfig;
```

`src/features/schedule/repository.ts` の `loadDivisions` の `select` に `resultConfig: true,` を、戻り値の組み立てに `resultConfig: parseDivisionResultConfig(row.resultConfig),` を足す（import も）。

- [ ] **Step 4: result-rows を広げる**

`src/features/schedule/result-rows.ts`。import に型を足す。

```ts
import type {
  DivisionResultConfig,
  MatchResultRecord,
  MatchScoreEntry,
} from "@/lib/division/types";
```

`ResultRowView` を差し替える。

```ts
export type ResultRowView =
  | {
      kind: "divider";
      key: string;
      label: string;
      /**
       * 区切りの開始予定時刻。書式化は画面側の仕事なので Date のまま運ぶ
       * （features/schedule からは同列の features/tournament を参照できない）。
       * 公開の試合一覧がこの型を使うため、結果入力には要らないが載せている。
       */
      startsAt: Date | null;
    }
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
      /** この試合が属する部門の結果入力の設定 */
      resultConfig: DivisionResultConfig;
      /** 記録済みの勝因。未設定は null */
      winReason: string | null;
      /** 記録済みの採点。未設定は空配列 */
      scores: MatchScoreEntry[];
      /** 記録済みのメモ。未設定は null */
      note: string | null;
    };
```

`buildResultRows` の `context` の `recorded` を記録そのものを引ける表に替える。

```ts
        // 記録の有無だけでなく中身も要るので、id から記録を引く表にする。
        recordById: new Map<string, MatchResultRecord>(
          division.results.matches.map((record) => [record.matchId, record]),
        ),
```

`divider` の分岐を差し替える。

```ts
    if (row.kind === "divider") {
      return [
        {
          kind: "divider",
          key: row.key,
          label: row.label,
          startsAt: row.startsAt,
        },
      ];
    }
```

`match` を返す部分で `recorded.has(...)` を `recordById.has(...)` に直し、新しい項目を足す。

```ts
    const record = current.recordById.get(row.matchId);

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
        state: rowState(resolved, record !== undefined),
        downstreamRecordedCount: [...downstream].filter((id) =>
          current.recordById.has(id),
        ).length,
        resultConfig: current.division.resultConfig,
        winReason: record?.winReason ?? null,
        scores: record?.scores ?? [],
        note: record?.note ?? null,
      },
    ];
```

`ScheduleRowView` の divider が `startsAt` を持っていることを確認する（`src/features/schedule/types.ts`）。持っていなければ `buildScheduleView` の出力から取れるように直す。

- [ ] **Step 5: テストが通ることを確かめる**

Run: `pnpm exec vitest run src/features/schedule`
Expected: PASS

Run: `pnpm typecheck`
Expected: エラーなし（`MatchResultList` などで divider の `startsAt` が増えたことによる型エラーが出たら、使っていない側は無視してよいので読み飛ばすだけで直る）

- [ ] **Step 6: コミット**

```bash
git add src/features/schedule
git commit -m "feat(schedule): 結果の行に部門の設定と詳細を載せる"
```

---

### Task 7: 結果入力画面の詳細フォームとメモの吹き出し

**Files:**
- Create: `src/components/result/MatchNoteButton.tsx`
- Create: `src/components/result/MatchNoteButton.test.tsx`
- Create: `src/components/result/MatchResultDetailForm.tsx`
- Create: `src/components/result/MatchResultDetailForm.test.tsx`
- Modify: `src/components/result/MatchResultRow.tsx`
- Modify: `src/components/result/MatchResultList.tsx`
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/results/page.tsx`
- Test: `src/components/result/MatchResultRow.test.tsx` / `MatchResultList.test.tsx`（既存があれば追記）

**Interfaces:**
- Consumes: `ResultRowView`（Task 6）、`updateResultDetailAction`（Task 5）、`aggregateScore` / `formatScore`（Task 2）
- Produces:
  - `MatchNoteButton({ note, label }: { note: string | null; label: string })`
  - `MatchResultDetailForm({ row, slug, tournamentId, action })`
  - `MatchResultRow` / `MatchResultList` の props に `detailAction: DivisionFormAction` が増える

- [ ] **Step 1: メモの吹き出しの失敗するテストを書く**

`src/components/result/MatchNoteButton.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MatchNoteButton } from "./MatchNoteButton";

describe("MatchNoteButton", () => {
  it("メモが無ければ何も出さない", () => {
    const { container } = render(
      <MatchNoteButton note={null} label="第1試合のメモ" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("空文字のメモも出さない", () => {
    const { container } = render(
      <MatchNoteButton note="" label="第1試合のメモ" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("メモがあればボタンと本文を出す", () => {
    render(<MatchNoteButton note="抗議あり" label="第1試合のメモ" />);
    const button = screen.getByRole("button", { name: "第1試合のメモ" });
    expect(button).toHaveAttribute("popovertarget");
    expect(screen.getByText("抗議あり")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `pnpm exec vitest run src/components/result/MatchNoteButton.test.tsx`
Expected: FAIL（`Failed to resolve import "./MatchNoteButton"`）

- [ ] **Step 3: メモの吹き出しを実装する**

`src/components/result/MatchNoteButton.tsx`

```tsx
"use client";

import { useId } from "react";

/**
 * メモを吹き出しで見せるボタン。運営の結果画面と公開ページの両方で使う。
 *
 * 開閉は HTML の popover 属性でブラウザに任せる。Esc と外側クリックで閉じる
 * 挙動が標準で付いてくるので、自前の外側クリック検出を書かずに済む。
 */
export function MatchNoteButton({
  note,
  label,
}: {
  note: string | null;
  /** 読み上げ用。「第3試合のメモ」のように試合が分かる文言を渡す */
  label: string;
}) {
  const id = useId();

  if (note === null || note === "") {
    return null;
  }

  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        aria-label={label}
        className="rounded px-1 text-xs text-slate-500 hover:bg-slate-100"
      >
        📝
      </button>
      <div
        id={id}
        popover="auto"
        className="max-w-xs rounded border border-slate-300 bg-white px-3 py-2 text-xs whitespace-pre-wrap text-slate-700 shadow-lg"
      >
        {note}
      </div>
    </>
  );
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `pnpm exec vitest run src/components/result/MatchNoteButton.test.tsx`
Expected: PASS

- [ ] **Step 5: 詳細フォームの失敗するテストを書く**

`src/components/result/MatchResultDetailForm.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MatchResultDetailForm } from "./MatchResultDetailForm";

const noopAction = async () => ({ error: null });

const row = {
  kind: "match" as const,
  key: "k1",
  divisionId: "d1",
  divisionName: "男子シングルス",
  matchId: "m1-0",
  matchNumber: "1",
  label: "1回戦 第1試合",
  slots: [
    { label: "田中", entryId: "e1" },
    { label: "佐藤", entryId: "e2" },
  ] as [{ label: string; entryId: string | null }, { label: string; entryId: string | null }],
  winnerEntryId: "e1",
  state: "recorded" as const,
  downstreamRecordedCount: 0,
  resultConfig: {
    version: 1 as const,
    winReason: { enabled: true, options: ["一本勝ち", "判定勝ち"] },
    score: { enabled: true, count: 3, aggregation: "sum" as const },
    note: { enabled: true },
  },
  winReason: "一本勝ち",
  scores: [{ entryId: "e1", values: [7, 6.8, 7.2] }],
  note: "抗議あり",
};

const renderForm = (override: Partial<typeof row> = {}) =>
  render(
    <MatchResultDetailForm
      row={{ ...row, ...override }}
      slug="acme"
      tournamentId="t1"
      action={noopAction}
    />,
  );

describe("MatchResultDetailForm", () => {
  it("有効な項目だけを出す", () => {
    renderForm({
      resultConfig: {
        ...row.resultConfig,
        score: { enabled: false, count: 3, aggregation: "sum" },
        note: { enabled: false },
      },
    });

    expect(screen.getByRole("combobox", { name: "勝因" })).toBeInTheDocument();
    expect(screen.queryByLabelText("メモ")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("記録済みの値を初期値にする", () => {
    renderForm();
    expect(screen.getByRole("combobox", { name: "勝因" })).toHaveValue("一本勝ち");
    expect(screen.getByLabelText("メモ")).toHaveValue("抗議あり");
    expect(screen.getByLabelText("田中 のスコア 1")).toHaveValue(7);
  });

  it("スコアの数は設定の count ぶん出す", () => {
    renderForm({
      resultConfig: {
        ...row.resultConfig,
        score: { enabled: true, count: 2, aggregation: "sum" },
      },
    });
    expect(screen.getByLabelText("田中 のスコア 2")).toBeInTheDocument();
    expect(screen.queryByLabelText("田中 のスコア 3")).not.toBeInTheDocument();
  });

  it("集計値が入力に追従する", async () => {
    renderForm({ scores: [] });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("田中 のスコア 1"), "7");
    await user.type(screen.getByLabelText("田中 のスコア 2"), "6");

    expect(screen.getByTestId("aggregate-e1")).toHaveTextContent("13");
  });

  it("一覧に無い勝因が記録されていれば選択肢に残す", () => {
    renderForm({ winReason: "反則負け" });
    const select = screen.getByRole("combobox", { name: "勝因" });
    expect(select).toHaveValue("反則負け");
    expect(
      screen.getByRole("option", { name: "（一覧にない）反則負け" }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: テストが落ちることを確かめる**

Run: `pnpm exec vitest run src/components/result/MatchResultDetailForm.test.tsx`
Expected: FAIL（`Failed to resolve import "./MatchResultDetailForm"`）

- [ ] **Step 7: 詳細フォームを実装する**

`src/components/result/MatchResultDetailForm.tsx`

```tsx
"use client";

import { useActionState, useState } from "react";
import {
  type DivisionFormAction,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";
import type { ResultRowView } from "@/features/schedule/result-rows";
import { aggregateScore, formatScore } from "@/lib/division/score";

type MatchRow = Extract<ResultRowView, { kind: "match" }>;

/** スコア欄の値。空文字は未入力（null）を表す。 */
type ScoreDraft = Record<string, string[]>;

/** その試合に立っている 2 人。BYE と未確定のスロットは entryId を持たない。 */
const standingSlots = (row: MatchRow) =>
  row.slots.flatMap((slot) =>
    slot.entryId === null ? [] : [{ entryId: slot.entryId, label: slot.label }],
  );

const initialDraft = (row: MatchRow): ScoreDraft => {
  const count = row.resultConfig.score.count;
  const draft: ScoreDraft = {};
  for (const slot of standingSlots(row)) {
    const saved = row.scores.find((entry) => entry.entryId === slot.entryId);
    draft[slot.entryId] = Array.from({ length: count }, (_, index) => {
      const value = saved?.values[index];
      return value === undefined || value === null ? "" : String(value);
    });
  }
  return draft;
};

const toNumbers = (values: string[]): (number | null)[] =>
  values.map((value) => (value.trim() === "" ? null : Number(value)));

/**
 * 勝因・スコア・メモの入力。勝敗のフォームとは別の form にする。
 *
 * HTML のフォームは入れ子にできないので、MatchResultRow の中では勝敗フォームと
 * 兄弟として並べる。保存先の Server Action も別（update-result-detail）で、
 * あちらと違い下流の記録を消さない。
 */
export function MatchResultDetailForm({
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
  const [draft, setDraft] = useState<ScoreDraft>(() => initialDraft(row));

  const config = row.resultConfig;
  const slots = standingSlots(row);

  // 設定から消されたあとも、その試合に入っている値は選べるようにしておく。
  // でないと勝因を変えずにスコアだけ直すことができなくなる。
  const staleWinReason =
    row.winReason !== null && !config.winReason.options.includes(row.winReason)
      ? row.winReason
      : null;

  const setScore = (entryId: string, index: number, value: string) => {
    setDraft((current) => {
      const values = [...(current[entryId] ?? [])];
      values[index] = value;
      return { ...current, [entryId]: values };
    });
  };

  return (
    <form
      action={formAction}
      className="mt-2 space-y-3 rounded border border-slate-200 bg-slate-50 px-3 py-3"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="divisionId" value={row.divisionId} />
      <input type="hidden" name="matchId" value={row.matchId} />

      {config.winReason.enabled && (
        <div className="flex items-center gap-2">
          <label
            htmlFor={`winReason-${row.key}`}
            className="text-xs text-slate-500"
          >
            勝因
          </label>
          <select
            id={`winReason-${row.key}`}
            name="winReason"
            defaultValue={row.winReason ?? ""}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">（未設定）</option>
            {staleWinReason !== null && (
              <option value={staleWinReason}>
                （一覧にない）{staleWinReason}
              </option>
            )}
            {config.winReason.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      )}

      {config.score.enabled && slots.length > 0 && (
        <table className="text-xs">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left font-medium text-slate-500">
                スコア
              </th>
              {Array.from({ length: config.score.count }, (_, index) => (
                <th
                  // 欄の数は設定で決まり、並べ替えも削除もされないので index を鍵にしてよい。
                  key={index}
                  className="px-1 py-1 font-medium text-slate-500"
                >
                  {index + 1}
                </th>
              ))}
              <th className="px-2 py-1 font-medium text-slate-500">
                {config.score.aggregation === "sum" ? "合計" : "平均"}
              </th>
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => (
              <tr key={slot.entryId}>
                <th
                  scope="row"
                  className="px-2 py-1 text-left font-medium text-slate-700"
                >
                  {slot.label}
                  {/* 欄名は score_<entryId>。サーバは getAll の順を index として読む。 */}
                  <input type="hidden" name="scoreEntryId" value={slot.entryId} />
                </th>
                {Array.from({ length: config.score.count }, (_, index) => (
                  <td key={index} className="px-1 py-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      max="999.99"
                      name={`score_${slot.entryId}`}
                      aria-label={`${slot.label} のスコア ${index + 1}`}
                      value={draft[slot.entryId]?.[index] ?? ""}
                      onChange={(event) =>
                        setScore(slot.entryId, index, event.target.value)
                      }
                      className="w-16 rounded border border-slate-300 px-1 py-1 text-right"
                    />
                  </td>
                ))}
                <td
                  data-testid={`aggregate-${slot.entryId}`}
                  className="px-2 py-1 text-right font-medium text-slate-700"
                >
                  {formatScore(
                    aggregateScore(
                      toNumbers(draft[slot.entryId] ?? []),
                      config.score.aggregation,
                    ),
                  ) ?? "--"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {config.note.enabled && (
        <div className="flex items-center gap-2">
          <label htmlFor={`note-${row.key}`} className="text-xs text-slate-500">
            メモ
          </label>
          <input
            id={`note-${row.key}`}
            name="note"
            type="text"
            defaultValue={row.note ?? ""}
            maxLength={1000}
            className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {state.error !== null && (
          <p role="alert" className="text-xs text-red-600">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-slate-800 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {pending ? "保存中..." : "保存"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 8: テストが通ることを確かめる**

Run: `pnpm exec vitest run src/components/result/MatchResultDetailForm.test.tsx`
Expected: PASS

- [ ] **Step 9: 行に要約とトグルを足す**

`src/components/result/MatchResultRow.tsx`。import を足す。

```tsx
import { aggregateScore, formatScore } from "@/lib/division/score";
import { MatchNoteButton } from "./MatchNoteButton";
import { MatchResultDetailForm } from "./MatchResultDetailForm";
```

props に `detailAction: DivisionFormAction` を足す。`useActionState` の下に足す。

```tsx
  const [detailOpen, setDetailOpen] = useState(false);

  const config = row.resultConfig;
  const hasDetailFields =
    config.winReason.enabled || config.score.enabled || config.note.enabled;
  // 勝敗より先に詳細だけを入れる場面は無い。記録済みの行にだけ出す。
  const detailAvailable = row.state === "recorded" && hasDetailFields;

  const scoreSummary = row.slots
    .map((slot) =>
      slot.entryId === null
        ? null
        : formatScore(
            aggregateScore(
              row.scores.find((entry) => entry.entryId === slot.entryId)
                ?.values ?? [],
              config.score.aggregation,
            ),
          ),
    )
    .filter((value): value is string => value !== null);
  const summaryParts = [
    config.winReason.enabled ? row.winReason : null,
    config.score.enabled && scoreSummary.length === 2
      ? scoreSummary.join(" - ")
      : null,
  ].filter((value): value is string => value !== null);
```

`useState` を `react` の import に足すこと。

「取り消し」ボタンの後ろ（`</form>` の直前ではなく `</form>` の外）に、詳細トグルを置く。勝敗フォームの中に置くと submit ボタン扱いになりうるので、`<form>` の外の兄弟にする。

```tsx
        {detailAvailable && (
          <button
            type="button"
            aria-expanded={detailOpen}
            onClick={() => setDetailOpen((open) => !open)}
            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600"
          >
            詳細 {detailOpen ? "▴" : "▾"}
          </button>
        )}
```

`row.state === "bye"` の案内の前に要約と詳細フォームを足す。

```tsx
      {detailAvailable && (summaryParts.length > 0 || row.note !== null) && (
        <p className="mt-1 flex items-center gap-2 text-xs text-slate-600">
          {summaryParts.join(" ・ ")}
          {config.note.enabled && (
            <MatchNoteButton
              note={row.note}
              label={`第${row.matchNumber}試合のメモ`}
            />
          )}
        </p>
      )}

      {detailOpen && (
        <MatchResultDetailForm
          row={row}
          slug={slug}
          tournamentId={tournamentId}
          action={detailAction}
        />
      )}
```

- [ ] **Step 10: 一覧とページを配線する**

`src/components/result/MatchResultList.tsx` の props に `detailAction: DivisionFormAction` を足し、`<MatchResultRow ... detailAction={detailAction} />` に渡す。

`.../results/page.tsx` の import に足す。

```tsx
import { updateResultDetailAction } from "@/features/division/update-result-detail/handler";
```

`<MatchResultList ... />` に `detailAction={updateResultDetailAction}` を足す。ページの説明文にも一行足す。

```tsx
            勝った方を押すとその場で記録します。勝敗を記録すると、その部門のエントリー・組み合わせは編集できなくなります。勝因やスコアは「詳細」から入力します。
```

- [ ] **Step 11: テスト・型・lint を通す**

Run: `pnpm exec vitest run src/components/result`
Expected: PASS

Run: `pnpm typecheck`
Expected: エラーなし

Run: `pnpm lint`
Expected: 自分が触ったファイルに指摘が無いこと（CRLF 由来の既存ノイズは無視してよい）

- [ ] **Step 12: コミット**

```bash
git add src/components/result "src/app/orgs/[slug]/tournaments/[tournamentId]/results/page.tsx"
git commit -m "feat(result): 結果入力画面に勝因・スコア・メモの入力を足す"
```

---

### Task 8: 公開ブラケットへの反映

**Files:**
- Modify: `src/features/bracket/types.ts`
- Modify: `src/features/bracket/from-division.ts`
- Modify: `src/features/bracket/resolve-bracket.ts`
- Modify: `src/components/tournament/MatchCard.tsx`
- Modify: `src/components/division/DivisionBracket.tsx`
- Test: `src/features/bracket/from-division.test.ts` / `resolve-bracket.test.ts`（既存に追記）
- Test: `src/components/division/DivisionBracket.test.tsx`（既存に追記）

**Interfaces:**
- Consumes: `aggregateScore` / `formatScore`（Task 2）、`parseDivisionResultConfig` / `DEFAULT_DIVISION_RESULT_CONFIG`（Task 1）
- Produces:
  - `MatchResult` に `winReason?: string` / `scores?: { participantId: string; score: string }[]` / `note?: string`
  - `ResolvedSlot` に `score: string | null`
  - `ResolvedMatch` に `winReason: string | null` / `note: string | null`
  - `FromDivisionInput` に `resultConfig: DivisionResultConfig`

集計は `from-division` で済ませ、表示用の文字列にしてから `features/bracket` に渡す。こうすると `features/bracket` は部門の設定を知らずに済む。

- [ ] **Step 1: 失敗するテストを書く**

`src/features/bracket/from-division.test.ts` に足す（既存の入力に `resultConfig` を加える必要がある）。

```ts
it("勝因・集計済みスコア・メモを結果に載せる", () => {
  const converted = fromDivision({
    ...baseInput,
    resultConfig: {
      version: 1,
      winReason: { enabled: true, options: ["一本勝ち"] },
      score: { enabled: true, count: 3, aggregation: "average" },
      note: { enabled: true },
    },
    results: {
      version: 1,
      matches: [
        {
          matchId: "m1-0",
          winnerEntryId: "e1",
          winReason: "一本勝ち",
          scores: [
            { entryId: "e1", values: [7, 6, 5] },
            { entryId: "e2", values: [6, 6, null] },
          ],
          note: "抗議あり",
        },
      ],
    },
  });

  expect(converted?.results[0]).toEqual({
    matchId: "m1-0",
    winnerId: "e1",
    winReason: "一本勝ち",
    scores: [
      { participantId: "e1", score: "6" },
      { participantId: "e2", score: "6" },
    ],
    note: "抗議あり",
  });
});

it("無効な項目は載せない", () => {
  const converted = fromDivision({
    ...baseInput,
    resultConfig: {
      version: 1,
      winReason: { enabled: false, options: [] },
      score: { enabled: false, count: 3, aggregation: "sum" },
      note: { enabled: false },
    },
    results: {
      version: 1,
      matches: [
        {
          matchId: "m1-0",
          winnerEntryId: "e1",
          winReason: "一本勝ち",
          scores: [{ entryId: "e1", values: [7] }],
          note: "抗議あり",
        },
      ],
    },
  });

  expect(converted?.results[0]).toEqual({ matchId: "m1-0", winnerId: "e1" });
});
```

`src/features/bracket/resolve-bracket.test.ts` に足す。

```ts
it("スコアをスロットに配り、勝因とメモを試合に載せる", () => {
  const resolved = resolveBracket(participants, bracket, [
    {
      matchId: "m1",
      winnerId: "p1",
      winReason: "一本勝ち",
      scores: [
        { participantId: "p1", score: "21" },
        { participantId: "p2", score: "20" },
      ],
      note: "抗議あり",
    },
  ]);

  const match = byId(resolved, "m1");
  expect(match.winReason).toBe("一本勝ち");
  expect(match.note).toBe("抗議あり");
  expect(match.slots[0].score).toBe("21");
  expect(match.slots[1].score).toBe("20");
});

it("スコアが無いスロットは null", () => {
  const resolved = resolveBracket(participants, bracket, [
    { matchId: "m1", winnerId: "p1" },
  ]);
  const match = byId(resolved, "m1");
  expect(match.slots[0].score).toBeNull();
  expect(match.winReason).toBeNull();
  expect(match.note).toBeNull();
});
```

変数名（`participants` / `bracket` / `byId` / `baseInput`）は既存テストに合わせること。

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `pnpm exec vitest run src/features/bracket`
Expected: FAIL

- [ ] **Step 3: 型を広げる**

`src/features/bracket/types.ts`

```ts
/** 勝敗データ。Participant / Bracket から完全に独立している。 */
export type MatchResult = {
  matchId: string;
  winnerId: string;
  /** "3-1" などの表示用文字列 */
  score?: string;
  /** 決着のつき方。「一本勝ち」など */
  winReason?: string;
  /**
   * 参加者ごとの表示用スコア。集計（合計か平均か）は呼び出し元が済ませて
   * 文字列にしてから渡す。こうすると features/bracket は部門の設定を知らずに済む。
   */
  scores?: { participantId: string; score: string }[];
  note?: string;
};
```

```ts
export type ResolvedSlot = {
  /** pending / bye のときは null */
  participant: Participant | null;
  state: SlotState;
  isWinner: boolean;
  /** 表示用スコア。無ければ null */
  score: string | null;
};
```

`ResolvedMatch` に足す。

```ts
  winReason: string | null;
  note: string | null;
```

- [ ] **Step 4: from-division を直す**

`src/features/bracket/from-division.ts`。import に足す。

```ts
import { aggregateScore, formatScore } from "@/lib/division/score";
import type { DivisionResultConfig } from "@/lib/division/types";
```

`FromDivisionInput` に `resultConfig: DivisionResultConfig;` を足す。

`results` を組み立てるループを差し替える。

```ts
  const results: MatchResult[] = [];
  for (const record of input.results.matches) {
    // 引き分けは ROUND_ROBIN 専用で、描画側の winnerId は null を取れない。
    // 結果ごと捨てて、その試合は未決として描く。
    if (record.winnerEntryId === null) {
      continue;
    }

    const result: MatchResult = {
      matchId: record.matchId,
      winnerId: record.winnerEntryId,
    };
    if (record.score !== undefined) {
      result.score = record.score;
    }
    // 無効にした項目は公開側にも出さない。設定は表示のフィルタでもある。
    if (input.resultConfig.winReason.enabled && record.winReason !== undefined) {
      result.winReason = record.winReason;
    }
    if (input.resultConfig.score.enabled && record.scores !== undefined) {
      const scores = record.scores.flatMap((entry) => {
        const value = formatScore(
          aggregateScore(entry.values, input.resultConfig.score.aggregation),
        );
        return value === null
          ? []
          : [{ participantId: entry.entryId, score: value }];
      });
      if (scores.length > 0) {
        result.scores = scores;
      }
    }
    if (input.resultConfig.note.enabled && record.note !== undefined) {
      result.note = record.note;
    }
    results.push(result);
  }
```

- [ ] **Step 5: resolve-bracket を直す**

`src/features/bracket/resolve-bracket.ts`。`ResolvedSlot` を作っている箇所で `score` を埋める。参加者が決まっていないスロットは `null`。試合を組み立てる箇所で `winReason: result?.winReason ?? null` と `note: result?.note ?? null` を足す。

BYE の分岐でも `result` から同じ 3 項目を拾う（既存の `score = result.score ?? null` と同じ場所）。

```ts
    const scoreByParticipant = new Map(
      (result?.scores ?? []).map((entry) => [entry.participantId, entry.score]),
    );
```

を作り、各スロットに

```ts
      score:
        slot.participant === null
          ? null
          : (scoreByParticipant.get(slot.participant.id) ?? null),
```

を入れる。

- [ ] **Step 6: MatchCard を直す**

`src/components/tournament/MatchCard.tsx`。`SlotRow` に `slot.score` の表示を足す。

```tsx
      <span className="flex-1 truncate">{slotLabel(slot)}</span>
      {slot.score !== null && (
        <span className="shrink-0 pl-1 text-[10px] text-slate-500">
          {slot.score}
        </span>
      )}
```

勝因バッジは勝ったスロットの行に入れる（`SlotRow` に `winReason?: string | null` を渡し、`slot.isWinner` のときだけ出す）。

```tsx
      {winReason !== null && winReason !== undefined && slot.isWinner && (
        <span className="shrink-0 truncate rounded bg-slate-100 px-1 text-[10px] text-slate-500">
          {winReason}
        </span>
      )}
```

`MatchCard` 本体では、スロットにスコアが 1 つでもあるときは旧来の右上バッジを出さない（重ならないようにするため）。メモのボタンは左上の試合番号の隣に置く。

```tsx
  const hasSlotScore = match.slots.some((slot) => slot.score !== null);
```

```tsx
      {match.score && !hasSlotScore ? (
        <span className="absolute right-1 top-1 rounded bg-slate-100 px-1 text-[10px] leading-4 text-slate-500">
          {match.score}
        </span>
      ) : null}
      {match.matchNumber !== null ? (
        <span
          data-testid={`match-number-${match.id}`}
          className="absolute left-1 top-1 rounded bg-slate-100 px-1 text-[10px] leading-4 text-slate-500"
        >
          {match.matchNumber}
        </span>
      ) : null}
      <span className="absolute left-8 top-0 leading-4">
        <MatchNoteButton
          note={match.note}
          label={`${match.matchNumber ?? match.id}のメモ`}
        />
      </span>
```

`SlotRow` に `winReason` を渡すよう `MatchCard` の呼び出しを直す。

- [ ] **Step 7: DivisionBracket から設定を渡す**

`src/components/division/DivisionBracket.tsx`。`parsed` に `resultConfig` を足し、`fromDivision` に渡す。

```tsx
    parsed = {
      entries: parseDivisionEntries(division.entries),
      matchingConfig: parseMatchingConfig(division.matchingConfig),
      results: parseDivisionResults(division.results),
      resultConfig: parseDivisionResultConfig(division.resultConfig),
    };
```

型注釈にも `resultConfig: ReturnType<typeof parseDivisionResultConfig>;` を足し、`fromDivision({ ... resultConfig: parsed.resultConfig, ... })` とする。import も足す。

- [ ] **Step 8: テストが通ることを確かめる**

Run: `pnpm exec vitest run src/features/bracket src/components/division src/components/tournament`
Expected: PASS

Run: `pnpm typecheck`
Expected: エラーなし

`src/app/mock` が `fromDivision` や `ResolvedSlot` を直接組み立てている場合、新しい項目を足さないと型エラーになる。落ちたら `score: null` / `winReason: null` / `note: null` を足して直す。

- [ ] **Step 9: コミット**

```bash
git add src/features/bracket src/components/tournament src/components/division
git commit -m "feat(bracket): 公開ブラケットに勝因・スコア・メモを出す"
```

---

### Task 9: 公開の試合一覧に結果を出す

**Files:**
- Modify: `src/app/t/[tournamentId]/schedule/page.tsx`
- Modify: `src/components/public/PublicScheduleList.tsx`
- Test: `src/components/public/PublicScheduleList.test.tsx`（既存を書き換え）

**Interfaces:**
- Consumes: `ResultRowView` / `loadResultRows`（Task 6）、`MatchNoteButton`（Task 7）、`aggregateScore` / `formatScore`（Task 2）
- Produces: `PublicScheduleList({ rows }: { rows: ResultRowView[] })`

この一覧は今まで結果を一切出していなかった。ブラケットは `SINGLE_ELIMINATION` 専用なので、ここに出さないとリーグ部門は公開側で結果を見る場所が無い。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/public/PublicScheduleList.test.tsx` を `ResultRowView` を渡す形に書き換え、次を足す。

```tsx
const config = {
  version: 1 as const,
  winReason: { enabled: true, options: ["一本勝ち"] },
  score: { enabled: true, count: 3, aggregation: "sum" as const },
  note: { enabled: true },
};

const matchRow = {
  kind: "match" as const,
  key: "k1",
  divisionId: "d1",
  divisionName: "男子シングルス",
  matchId: "m1-0",
  matchNumber: "1",
  label: "1回戦 第1試合",
  slots: [
    { label: "田中", entryId: "e1" },
    { label: "佐藤", entryId: "e2" },
  ],
  winnerEntryId: "e1",
  state: "recorded" as const,
  downstreamRecordedCount: 0,
  resultConfig: config,
  winReason: "一本勝ち",
  scores: [
    { entryId: "e1", values: [7, 7, 7] },
    { entryId: "e2", values: [6, 7, 7] },
  ],
  note: "抗議あり",
};

it("対戦カードと結果を出す", () => {
  render(<PublicScheduleList rows={[matchRow]} />);

  expect(screen.getByText("田中 vs 佐藤")).toBeInTheDocument();
  expect(screen.getByText(/田中の勝ち/)).toBeInTheDocument();
  expect(screen.getByText(/一本勝ち/)).toBeInTheDocument();
  expect(screen.getByText(/21 - 20/)).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "第1試合のメモ" }),
  ).toBeInTheDocument();
});

it("未記録の試合には結果を出さない", () => {
  render(
    <PublicScheduleList
      rows={[
        {
          ...matchRow,
          state: "ready",
          winnerEntryId: null,
          winReason: null,
          scores: [],
          note: null,
        },
      ]}
    />,
  );
  expect(screen.queryByText(/の勝ち/)).not.toBeInTheDocument();
});

it("引き分けは引き分けと出す", () => {
  render(
    <PublicScheduleList
      rows={[{ ...matchRow, winnerEntryId: null, scores: [], note: null }]}
    />,
  );
  expect(screen.getByText(/引き分け/)).toBeInTheDocument();
});

it("区切りの開始予定時刻を出す", () => {
  render(
    <PublicScheduleList
      rows={[
        {
          kind: "divider",
          key: "d1",
          label: "午前の部",
          startsAt: new Date("2026-09-12T09:00:00+09:00"),
        },
      ]}
    />,
  );
  expect(screen.getByText("午前の部")).toBeInTheDocument();
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `pnpm exec vitest run src/components/public/PublicScheduleList.test.tsx`
Expected: FAIL（型が合わない、結果が出ていない）

- [ ] **Step 3: 一覧を書き換える**

`src/components/public/PublicScheduleList.tsx`

```tsx
import { MatchNoteButton } from "@/components/result/MatchNoteButton";
import type { ResultRowView } from "@/features/schedule/result-rows";
import { formatStartsAt } from "@/features/tournament/format";
import { aggregateScore, formatScore } from "@/lib/division/score";

type MatchRow = Extract<ResultRowView, { kind: "match" }>;

/**
 * 結果の 1 行ぶんの文言。記録が無い試合では何も返さない。
 *
 * 引き分けは ROUND_ROBIN 専用で、ブラケット（MatchCard）は扱えず結果ごと捨てる。
 * 引き分けが公開側に出るのはこの一覧だけになる。
 */
const resultParts = (row: MatchRow): string[] => {
  if (row.state !== "recorded") {
    return [];
  }

  const winner =
    row.winnerEntryId === null
      ? "引き分け"
      : `${row.slots.find((slot) => slot.entryId === row.winnerEntryId)?.label ?? ""}の勝ち`;

  const scores = row.slots
    .map((slot) =>
      slot.entryId === null
        ? null
        : formatScore(
            aggregateScore(
              row.scores.find((entry) => entry.entryId === slot.entryId)
                ?.values ?? [],
              row.resultConfig.score.aggregation,
            ),
          ),
    )
    .filter((value): value is string => value !== null);

  return [
    winner,
    row.resultConfig.winReason.enabled ? row.winReason : null,
    row.resultConfig.score.enabled && scores.length === 2
      ? scores.join(" - ")
      : null,
  ].filter((value): value is string => value !== null);
};

/**
 * 公開ページの試合一覧。既存の ScheduleList は dnd と Server Action を前提にした
 * クライアントコンポーネントなので流用せず、読むだけの Server Component として
 * 書き直す。行の並びは渡された順（loadResultRows が進行順に整えたもの）。
 *
 * 対戦カードは truncate せず折り返す。狭い画面で切ると「山田 vs …」となり、
 * 一覧としての用を成さなくなる。
 */
export function PublicScheduleList({ rows }: { rows: ResultRowView[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-600">まだ試合がありません</p>;
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        if (row.kind === "divider") {
          return (
            <li
              key={row.key}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-slate-300 pt-3 pb-1"
            >
              <span className="font-bold text-slate-700">{row.label}</span>
              {/*
                formatStartsAt は null に「未設定」を返す。区切りの時刻は
                任意項目なので、未設定のときは何も出さない方が読みやすい。
              */}
              {row.startsAt !== null && (
                <span className="text-xs text-slate-500">
                  {formatStartsAt(row.startsAt)}
                </span>
              )}
            </li>
          );
        }

        const parts = resultParts(row);

        return (
          <li
            key={row.key}
            className="rounded border border-slate-200 bg-white px-4 py-3"
          >
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-slate-800">
              <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-bold">
                第{row.matchNumber}試合
              </span>
              <span className="min-w-0 wrap-break-word font-medium">
                {`${row.slots[0].label} vs ${row.slots[1].label}`}
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {row.divisionName} / {row.label}
            </p>
            {parts.length > 0 && (
              <p className="mt-1 flex items-center gap-2 text-xs text-slate-700">
                {parts.join(" ・ ")}
                {row.resultConfig.note.enabled && (
                  <MatchNoteButton
                    note={row.note}
                    label={`第${row.matchNumber}試合のメモ`}
                  />
                )}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: ページを差し替える**

`src/app/t/[tournamentId]/schedule/page.tsx` の読み出しを `loadScheduleView` から `loadResultRows` に替える。import と呼び出しの引数（`organizationId`, `tournamentId`）は現在の `loadScheduleView` と同じ。

```tsx
import { loadResultRows } from "@/features/schedule/repository";
```

```tsx
  const rows = await loadResultRows(tournament.organizationId, tournament.id);
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `pnpm exec vitest run src/components/public`
Expected: PASS

- [ ] **Step 6: 全体を通す**

Run: `pnpm test`
Expected: 0 failures

Run: `pnpm typecheck`
Expected: エラーなし

Run: `pnpm lint`
Expected: 自分が触ったファイルに指摘が無いこと

- [ ] **Step 7: コミット**

```bash
git add src/components/public "src/app/t/[tournamentId]/schedule/page.tsx"
git commit -m "feat(public): 公開の試合一覧に結果と詳細を出す"
```

---

### Task 10: 実際のアプリで動かして確かめる

**Files:** なし（確認のみ）

- [ ] **Step 1: マイグレーションを流す**

Run: `pnpm exec prisma migrate deploy`
Expected: `1 migration found` → 適用済み

ローカル DB の履歴がずれていて失敗する場合は、`ALTER TABLE` を手で流してから `prisma migrate resolve --applied 20260912000000_add_division_result_config` で辻褄を合わせる。

- [ ] **Step 2: 開発サーバを立てる**

Run: `pnpm dev`（バックグラウンド）

ポートは 3000 が別のワークツリーに取られていることがある。**ログに出た実際のポートを読むこと。**

- [ ] **Step 3: 画面で確かめる**

`BYPASS_AUTH=1` のときは Cookie に `USER_ID=1` を設定する。この USER_ID は組織 `aaaaa` に属している。

1. 部門編集で 3 項目を有効にし、勝因の選択肢を編集して保存できること
2. 結果入力で勝者を記録 →「詳細」から勝因・スコア・メモを保存できること
3. 集計値が入力に追従し、保存後に行の要約に出ること
4. 設定で「メモを記録する」を外すと画面から消え、戻すと元の内容が見えること
5. 公開の試合一覧（`/t/<id>/schedule`）とブラケット（`/t/<id>/divisions/<id>`）に反映されること
6. メモアイコンを押すと吹き出しが開き、Esc で閉じること

- [ ] **Step 4: 結果を報告する**

動かなかったものがあれば、該当タスクへ戻って直す。すべて動いたら、superpowers:finishing-a-development-branch でマージ方法を決める。

---

## 依存関係

```
Task 1（型・列・パーサ）
  ├─ Task 2（集計）
  ├─ Task 3（設定の保存）─ Task 4（設定の画面）
  └─ Task 5（詳細の保存）
Task 1 + 2 → Task 6（結果行）→ Task 7（結果入力の画面）
Task 1 + 2 → Task 8（公開ブラケット）
Task 6 + 7 → Task 9（公開の試合一覧）
すべて → Task 10（実機確認）
```

Task 3+4 と Task 5、Task 8 は互いに独立しているので、並行して進められる。
