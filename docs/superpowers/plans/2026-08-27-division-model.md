# Division モデル 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prisma の `Match` / `Entry` モデルを廃止し、試合形式・エントリー・組み合わせ・勝敗を Json で持つ `Division` モデルに置き換え、その Json を安全に読み書きするライブラリを実装する。

**Architecture:** RDB は `Tournament 1-N Division` と `Tournament 1-N Participant` の 2 系統のみ。Division の 3 つの Json（`entries` / `matchingConfig` / `results`）は Prisma が型付けしないため、`src/lib/division/` で「パース → 整合性検証 → 更新」を担う。DB アクセスは `results.ts` の更新関数 1 つだけに閉じ、それ以外は全て純関数として DB なしでテストする。`results` の更新は `revision` 列による楽観ロックで保護する。

**Tech Stack:** Prisma 7.10（`prisma-client` generator + `@prisma/adapter-pg`）、PostgreSQL、TypeScript 5（strict）、Vitest 4、Biome 2.4。

## Global Constraints

- 設計の出典は [docs/superpowers/specs/2026-08-27-division-model-design.md](../specs/2026-08-27-division-model-design.md)。矛盾したら spec が正。
- Json の `version` は常に `1`。他の値を読んだらエラーにする。
- Json のデフォルト値は空配列を持つ有効な構造。空オブジェクト `{}` は使わない。
- 組み合わせと勝敗は `participantId` ではなく `DivisionEntry.id` を参照する。
- `revision` は `results` を更新するときのみ +1 する。
- `src/lib/division/` のうち `results.ts` 以外は Prisma に依存しない純関数にする。型のみの import（`import type`）は許可する。
- コメントは日本語。既存コード（`src/features/tournament/`）のスタイルに合わせる。
- 生成物 `src/generated/prisma/` は手で編集しない。
- 各タスクの最後に必ずコミットする。

## 既存コードとの関係（このプランの対象外）

`src/features/tournament/` には Mock データで動く React Flow の描画層が既にある。
そこにも `SlotSource` / `Match` / `MatchResult` という型があるが、`{ kind: "participant" }` を使い
`loserOf` を持たない、Mock 専用の別系統である。

このプランでは描画層に一切手を触れない。DB の Json を描画層の型へ変換するアダプタは、
組み合わせ生成アルゴリズムと合わせて別プランで扱う。両者の型名が衝突しないよう、
本プランの型は `src/lib/division/types.ts` に閉じる。

---

### Task 1: Prisma スキーマの置き換えとマイグレーション再生成

**Files:**
- Modify: `prisma/schema.prisma`
- Delete: `prisma/migrations/20260827000000_init/`
- Regenerate: `src/generated/prisma/`（コマンド経由。手で編集しない）

**Interfaces:**
- Consumes: なし
- Produces: `prisma.division` モデル（`id` / `tournamentId` / `name` / `order` / `format` / `entries` / `matchingConfig` / `results` / `revision` / `createdAt` / `updatedAt`）、`DivisionFormat` 型（`"SINGLE_ELIMINATION" | "DOUBLE_ELIMINATION_GRAND_FINAL" | "DOUBLE_ELIMINATION_THIRD_PLACE" | "ROUND_ROBIN"`、`@/generated/prisma/enums` から import 可能）

- [ ] **Step 1: `prisma/schema.prisma` から `Match` / `Entry` / `MatchStatus` を削除する**

`model Match { ... }`、`enum MatchStatus { ... }`、`model Entry { ... }` の 3 ブロックを丸ごと削除する。

- [ ] **Step 2: `Tournament` のリレーションを差し替える**

`model Tournament` の中の `matches      Match[]` を次の 1 行に置き換える。

```prisma
  divisions    Division[]
```

- [ ] **Step 3: `Participant` から `entries` リレーションを削除する**

`model Participant` の中の `entries    Entry[]` の行を削除する。列（`id` / `tournamentId` / `name` / `seed` / `team` / `createdAt` / `updatedAt`）と `@@unique([tournamentId, seed])` / `@@index([tournamentId])` はそのまま残す。

- [ ] **Step 4: `Division` と `DivisionFormat` を追加する**

`model Participant` の後に、次をそのまま追記する。

```prisma
/// 部門。大会内の 1 つの競技形式（男子の部、決勝トーナメントなど）。
model Division {
  id             String         @id @default(uuid())
  tournamentId   String
  /// 表示名。「男子シングルス」「決勝トーナメント」など。
  name           String
  /// 大会内での表示順・実施順。0 始まり。
  order          Int
  /// 試合の種類。
  format         DivisionFormat
  /// エントリー情報。DivisionEntries 型。
  entries        Json           @default("{\"version\":1,\"entries\":[]}")
  /// マッチング設定。展開済みの組み合わせを保持する。MatchingConfig 型。
  matchingConfig Json           @default("{\"version\":1,\"matches\":[]}")
  /// 勝敗記録。DivisionResults 型。
  results        Json           @default("{\"version\":1,\"matches\":[]}")
  /// results の楽観ロック用リビジョン。results を更新するたびに +1 する。
  revision       Int            @default(0)
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  tournament Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)

  @@unique([tournamentId, order])
  @@index([tournamentId])
}

enum DivisionFormat {
  /// シングルエリミネーション
  SINGLE_ELIMINATION
  /// ダブルエリミネーション。勝者トーナメント優勝者と敗者トーナメント優勝者が最終試合を行う。
  DOUBLE_ELIMINATION_GRAND_FINAL
  /// ダブルエリミネーション。敗者トーナメント優勝者が 3 位となる。
  DOUBLE_ELIMINATION_THIRD_PLACE
  /// リーグ（総当たり）
  ROUND_ROBIN
}
```

- [ ] **Step 5: スキーマの構文を検証する**

Run: `pnpm exec prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

失敗する場合は Step 1〜4 の削除漏れ（`Match` を参照したままのリレーションなど）を疑う。

- [ ] **Step 6: 既存の init マイグレーションを削除する**

```bash
rm -rf prisma/migrations/20260827000000_init
```

- [ ] **Step 7: DB をリセットして init を作り直す**

`DATABASE_URL` が到達可能であることが前提。到達できない場合はここで止めて報告する。

```bash
pnpm exec prisma migrate reset --force --skip-seed
pnpm exec prisma migrate dev --name init
```

Expected: `prisma/migrations/<timestamp>_init/migration.sql` が 1 つだけ生成され、
`Your database is now in sync with your schema.` が出る。

- [ ] **Step 8: 生成された SQL に Match / Entry が残っていないことを確認する**

Run: `grep -c -E '"Match"|"Entry"' prisma/migrations/*_init/migration.sql`
Expected: `0`

Run: `grep -c -E '"Division"|"DivisionFormat"' prisma/migrations/*_init/migration.sql`
Expected: `0` より大きい数

- [ ] **Step 9: Prisma Client を再生成する**

Run: `pnpm db:generate`
Expected: `Generated Prisma Client ... to ./src/generated/prisma`

- [ ] **Step 10: 生成された型に Division があることを確認する**

Run: `grep -n "DivisionFormat" src/generated/prisma/enums.ts`
Expected: `export const DivisionFormat = {` と `export type DivisionFormat = ...` の 2 行が出る

Run: `ls src/generated/prisma/models/`
Expected: `Division.ts` があり、`Match.ts` と `Entry.ts` は無い

- [ ] **Step 11: 型チェックとテストが通ることを確認する**

Run: `pnpm typecheck`
Expected: エラーなしで終了（終了コード 0）

Run: `pnpm test`
Expected: `src/features/tournament/` の既存テストが全て PASS

既存テストは Prisma に依存していないため、ここで壊れることはない。壊れた場合は
削除しすぎ（`Participant` の列まで消したなど）を疑う。

- [ ] **Step 12: コミット**

```bash
git add prisma/schema.prisma prisma/migrations src/generated/prisma
git commit -m "feat: replace Match and Entry models with Division"
```

---

### Task 2: Json の型定義とパーサ

**Files:**
- Create: `src/lib/division/types.ts`
- Create: `src/lib/division/parse.ts`
- Test: `src/lib/division/parse.test.ts`

**Interfaces:**
- Consumes: Task 1 の `DivisionFormat`（`@/generated/prisma/enums` から `import type`）
- Produces:
  - 型 `DivisionEntry` / `DivisionEntries` / `SlotSource` / `BracketSide` / `BracketMatch` / `MatchingConfig` / `MatchResultRecord` / `DivisionResults`
  - 定数 `EMPTY_DIVISION_ENTRIES` / `EMPTY_MATCHING_CONFIG` / `EMPTY_DIVISION_RESULTS`
  - `class DivisionJsonError extends Error`
  - `parseDivisionEntries(value: unknown): DivisionEntries`
  - `parseMatchingConfig(value: unknown): MatchingConfig`
  - `parseDivisionResults(value: unknown): DivisionResults`

- [ ] **Step 1: 型定義ファイルを書く**

Create `src/lib/division/types.ts`:

```ts
/** Division.entries の 1 要素。「誰がこの部門に何番シードで出るか」。 */
export type DivisionEntry = {
  /** 部門内で一意。matchingConfig / results はこの id で参照する */
  id: string;
  /** Participant.id */
  participantId: string;
  /** 部門内でのシード順。0 始まり */
  seed: number;
};

/** Division.entries の全体。 */
export type DivisionEntries = {
  version: 1;
  entries: DivisionEntry[];
};

/** 試合スロットが何によって埋まるか。 */
export type SlotSource =
  | { kind: "entry"; entryId: string }
  | { kind: "winnerOf"; matchId: string }
  | { kind: "loserOf"; matchId: string }
  | { kind: "bye" };

/** 試合がどのブラケットに属するか。シングルエリミネーションとリーグは "winners" 固定。 */
export type BracketSide = "winners" | "losers" | "final";

/** 組み合わせの中の 1 試合。 */
export type BracketMatch = {
  /** 部門内で一意 */
  id: string;
  bracket: BracketSide;
  /** 1 = 1 回戦。ROUND_ROBIN では節番号 */
  round: number;
  /** ラウンド内の上からの位置。0 始まり */
  order: number;
  slots: [SlotSource, SlotSource];
};

/** Division.matchingConfig の全体。展開済みの組み合わせ。 */
export type MatchingConfig = {
  version: 1;
  matches: BracketMatch[];
};

/** Division.results の 1 要素。 */
export type MatchResultRecord = {
  /** BracketMatch.id */
  matchId: string;
  /** DivisionEntry.id。null = 引き分け（ROUND_ROBIN でのみ許可） */
  winnerEntryId: string | null;
  /** "3-1" などの表示用文字列 */
  score?: string;
  /** ISO 8601 */
  finishedAt?: string;
};

/** Division.results の全体。 */
export type DivisionResults = {
  version: 1;
  matches: MatchResultRecord[];
};

export const EMPTY_DIVISION_ENTRIES: DivisionEntries = {
  version: 1,
  entries: [],
};

export const EMPTY_MATCHING_CONFIG: MatchingConfig = {
  version: 1,
  matches: [],
};

export const EMPTY_DIVISION_RESULTS: DivisionResults = {
  version: 1,
  matches: [],
};
```

- [ ] **Step 2: 失敗するテストを書く**

Create `src/lib/division/parse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DivisionJsonError,
  parseDivisionEntries,
  parseDivisionResults,
  parseMatchingConfig,
} from "./parse";

describe("parseDivisionEntries", () => {
  it("妥当な値をそのまま返す", () => {
    const value = {
      version: 1,
      entries: [
        { id: "e1", participantId: "p1", seed: 0 },
        { id: "e2", participantId: "p2", seed: 1 },
      ],
    };

    expect(parseDivisionEntries(value)).toEqual(value);
  });

  it("デフォルト値の空構造を受け付ける", () => {
    expect(parseDivisionEntries({ version: 1, entries: [] })).toEqual({
      version: 1,
      entries: [],
    });
  });

  it("version が 1 以外なら弾く", () => {
    expect(() => parseDivisionEntries({ version: 2, entries: [] })).toThrow(
      DivisionJsonError,
    );
  });

  it("空オブジェクトを弾く", () => {
    expect(() => parseDivisionEntries({})).toThrow(DivisionJsonError);
  });

  it("seed が整数でなければ弾く", () => {
    expect(() =>
      parseDivisionEntries({
        version: 1,
        entries: [{ id: "e1", participantId: "p1", seed: 1.5 }],
      }),
    ).toThrow(DivisionJsonError);
  });

  it("エラーメッセージに場所が入る", () => {
    expect(() =>
      parseDivisionEntries({
        version: 1,
        entries: [{ id: "e1", participantId: 42, seed: 0 }],
      }),
    ).toThrow(/entries\.entries\[0\]\.participantId/);
  });
});

describe("parseMatchingConfig", () => {
  it("4 種類の SlotSource を全て受け付ける", () => {
    const value = {
      version: 1,
      matches: [
        {
          id: "m1",
          bracket: "winners",
          round: 1,
          order: 0,
          slots: [
            { kind: "entry", entryId: "e1" },
            { kind: "bye" },
          ],
        },
        {
          id: "m2",
          bracket: "losers",
          round: 2,
          order: 0,
          slots: [
            { kind: "winnerOf", matchId: "m1" },
            { kind: "loserOf", matchId: "m1" },
          ],
        },
      ],
    };

    expect(parseMatchingConfig(value)).toEqual(value);
  });

  it("想定外の kind を弾く", () => {
    expect(() =>
      parseMatchingConfig({
        version: 1,
        matches: [
          {
            id: "m1",
            bracket: "winners",
            round: 1,
            order: 0,
            slots: [{ kind: "participant", participantId: "p1" }, { kind: "bye" }],
          },
        ],
      }),
    ).toThrow(DivisionJsonError);
  });

  it("想定外の bracket を弾く", () => {
    expect(() =>
      parseMatchingConfig({
        version: 1,
        matches: [
          {
            id: "m1",
            bracket: "consolation",
            round: 1,
            order: 0,
            slots: [{ kind: "bye" }, { kind: "bye" }],
          },
        ],
      }),
    ).toThrow(DivisionJsonError);
  });

  it("slots が 2 個でなければ弾く", () => {
    expect(() =>
      parseMatchingConfig({
        version: 1,
        matches: [
          {
            id: "m1",
            bracket: "winners",
            round: 1,
            order: 0,
            slots: [{ kind: "bye" }],
          },
        ],
      }),
    ).toThrow(DivisionJsonError);
  });
});

describe("parseDivisionResults", () => {
  it("勝者ありの結果を受け付ける", () => {
    const value = {
      version: 1,
      matches: [
        {
          matchId: "m1",
          winnerEntryId: "e1",
          score: "3-1",
          finishedAt: "2026-08-27T10:00:00.000Z",
        },
      ],
    };

    expect(parseDivisionResults(value)).toEqual(value);
  });

  it("引き分け（winnerEntryId が null）を受け付ける", () => {
    const value = {
      version: 1,
      matches: [{ matchId: "m1", winnerEntryId: null }],
    };

    expect(parseDivisionResults(value)).toEqual(value);
  });

  it("省略可能な score / finishedAt が無くても通る", () => {
    const parsed = parseDivisionResults({
      version: 1,
      matches: [{ matchId: "m1", winnerEntryId: "e1" }],
    });

    expect(parsed.matches[0]).not.toHaveProperty("score");
    expect(parsed.matches[0]).not.toHaveProperty("finishedAt");
  });

  it("winnerEntryId が文字列でも null でもなければ弾く", () => {
    expect(() =>
      parseDivisionResults({
        version: 1,
        matches: [{ matchId: "m1", winnerEntryId: 1 }],
      }),
    ).toThrow(DivisionJsonError);
  });

  it("matches が配列でなければ弾く", () => {
    expect(() =>
      parseDivisionResults({ version: 1, matches: { m1: "e1" } }),
    ).toThrow(DivisionJsonError);
  });
});
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `pnpm test src/lib/division/parse.test.ts`
Expected: FAIL。`Failed to resolve import "./parse"` または `Cannot find module './parse'`

- [ ] **Step 4: パーサを実装する**

Create `src/lib/division/parse.ts`:

```ts
import type {
  BracketMatch,
  BracketSide,
  DivisionEntries,
  DivisionEntry,
  DivisionResults,
  MatchResultRecord,
  MatchingConfig,
  SlotSource,
} from "./types";

/** Json が想定の形をしていないことを表す。呼び出し元は入力エラーとして扱う。 */
export class DivisionJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DivisionJsonError";
  }
}

const fail = (path: string, expected: string): never => {
  throw new DivisionJsonError(`${path}: ${expected} を期待しましたが不正な値です`);
};

const asRecord = (value: unknown, path: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(path, "オブジェクト");
  }
  return value as Record<string, unknown>;
};

const asString = (value: unknown, path: string): string =>
  typeof value === "string" ? value : fail(path, "文字列");

const asInt = (value: unknown, path: string): number =>
  typeof value === "number" && Number.isInteger(value)
    ? value
    : fail(path, "整数");

const asArray = (value: unknown, path: string): unknown[] =>
  Array.isArray(value) ? value : fail(path, "配列");

const asVersion1 = (value: unknown, path: string): 1 =>
  value === 1 ? 1 : fail(path, "version 1");

const parseDivisionEntry = (value: unknown, path: string): DivisionEntry => {
  const record = asRecord(value, path);
  return {
    id: asString(record.id, `${path}.id`),
    participantId: asString(record.participantId, `${path}.participantId`),
    seed: asInt(record.seed, `${path}.seed`),
  };
};

const parseSlotSource = (value: unknown, path: string): SlotSource => {
  const record = asRecord(value, path);
  const kind = asString(record.kind, `${path}.kind`);
  switch (kind) {
    case "entry":
      return { kind, entryId: asString(record.entryId, `${path}.entryId`) };
    case "winnerOf":
      return {
        kind: "winnerOf",
        matchId: asString(record.matchId, `${path}.matchId`),
      };
    case "loserOf":
      return {
        kind: "loserOf",
        matchId: asString(record.matchId, `${path}.matchId`),
      };
    case "bye":
      return { kind };
    default:
      return fail(`${path}.kind`, "entry / winnerOf / loserOf / bye のいずれか");
  }
};

const BRACKET_SIDES: readonly string[] = ["winners", "losers", "final"];

const parseBracketSide = (value: unknown, path: string): BracketSide => {
  const side = asString(value, path);
  return BRACKET_SIDES.includes(side)
    ? (side as BracketSide)
    : fail(path, "winners / losers / final のいずれか");
};

const parseBracketMatch = (value: unknown, path: string): BracketMatch => {
  const record = asRecord(value, path);
  const slots = asArray(record.slots, `${path}.slots`);
  if (slots.length !== 2) {
    fail(`${path}.slots`, "要素 2 個の配列");
  }
  return {
    id: asString(record.id, `${path}.id`),
    bracket: parseBracketSide(record.bracket, `${path}.bracket`),
    round: asInt(record.round, `${path}.round`),
    order: asInt(record.order, `${path}.order`),
    slots: [
      parseSlotSource(slots[0], `${path}.slots[0]`),
      parseSlotSource(slots[1], `${path}.slots[1]`),
    ],
  };
};

const parseMatchResultRecord = (
  value: unknown,
  path: string,
): MatchResultRecord => {
  const record = asRecord(value, path);
  if (record.winnerEntryId !== null && typeof record.winnerEntryId !== "string") {
    fail(`${path}.winnerEntryId`, "文字列または null");
  }
  const parsed: MatchResultRecord = {
    matchId: asString(record.matchId, `${path}.matchId`),
    winnerEntryId: record.winnerEntryId as string | null,
  };
  if (record.score !== undefined) {
    parsed.score = asString(record.score, `${path}.score`);
  }
  if (record.finishedAt !== undefined) {
    parsed.finishedAt = asString(record.finishedAt, `${path}.finishedAt`);
  }
  return parsed;
};

/** Division.entries の Json を検証して返す。不正なら DivisionJsonError。 */
export const parseDivisionEntries = (value: unknown): DivisionEntries => {
  const record = asRecord(value, "entries");
  return {
    version: asVersion1(record.version, "entries.version"),
    entries: asArray(record.entries, "entries.entries").map((item, index) =>
      parseDivisionEntry(item, `entries.entries[${index}]`),
    ),
  };
};

/** Division.matchingConfig の Json を検証して返す。不正なら DivisionJsonError。 */
export const parseMatchingConfig = (value: unknown): MatchingConfig => {
  const record = asRecord(value, "matchingConfig");
  return {
    version: asVersion1(record.version, "matchingConfig.version"),
    matches: asArray(record.matches, "matchingConfig.matches").map(
      (item, index) =>
        parseBracketMatch(item, `matchingConfig.matches[${index}]`),
    ),
  };
};

/** Division.results の Json を検証して返す。不正なら DivisionJsonError。 */
export const parseDivisionResults = (value: unknown): DivisionResults => {
  const record = asRecord(value, "results");
  return {
    version: asVersion1(record.version, "results.version"),
    matches: asArray(record.matches, "results.matches").map((item, index) =>
      parseMatchResultRecord(item, `results.matches[${index}]`),
    ),
  };
};
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm test src/lib/division/parse.test.ts`
Expected: 全 PASS（15 テスト）

- [ ] **Step 6: 型チェックと lint**

Run: `pnpm typecheck`
Expected: エラーなし

Run: `pnpm lint`
Expected: エラーなし。指摘があれば `pnpm lint:fix` を実行してから再確認する。

- [ ] **Step 7: コミット**

```bash
git add src/lib/division/types.ts src/lib/division/parse.ts src/lib/division/parse.test.ts
git commit -m "feat: add division json types and parsers"
```

---

### Task 3: エントリーと組み合わせの整合性検証（ルール 1〜6）

**Files:**
- Create: `src/lib/division/validate.ts`
- Test: `src/lib/division/validate.test.ts`

**Interfaces:**
- Consumes: Task 2 の `DivisionEntries` / `MatchingConfig` 型
- Produces:
  - `type ValidationErrors = string[]`
  - `validateEntries(entries: DivisionEntries, existingParticipantIds: readonly string[]): ValidationErrors`
  - `validateMatchingConfig(config: MatchingConfig, entries: DivisionEntries): ValidationErrors`

いずれも空配列を返せば妥当。例外は投げない。

spec の整合性ルール 2（`participantId` が同じ大会に存在するか）は DB 参照が必要だが、
関数を純粋に保つため、呼び出し元が読んだ `Participant.id` の一覧を
`existingParticipantIds` として渡す形にする。DB アクセスは呼び出し元の責務。

- [ ] **Step 1: 失敗するテストを書く**

Create `src/lib/division/validate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { DivisionEntries, MatchingConfig } from "./types";
import { validateEntries, validateMatchingConfig } from "./validate";

const entries = (
  ...list: { id: string; participantId: string; seed: number }[]
): DivisionEntries => ({ version: 1, entries: list });

const config = (...matches: MatchingConfig["matches"]): MatchingConfig => ({
  version: 1,
  matches,
});

describe("validateEntries", () => {
  it("妥当なら空配列を返す", () => {
    const result = validateEntries(
      entries(
        { id: "e1", participantId: "p1", seed: 0 },
        { id: "e2", participantId: "p2", seed: 1 },
      ),
      ["p1", "p2", "p3"],
    );

    expect(result).toEqual([]);
  });

  it("ルール 1: id の重複を検出する", () => {
    const result = validateEntries(
      entries(
        { id: "e1", participantId: "p1", seed: 0 },
        { id: "e1", participantId: "p2", seed: 1 },
      ),
      ["p1", "p2"],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toContain("e1");
  });

  it("ルール 2: 存在しない participantId を検出する", () => {
    const result = validateEntries(
      entries({ id: "e1", participantId: "ghost", seed: 0 }),
      ["p1", "p2"],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toContain("ghost");
  });

  it("ルール 2: 同じ参加者の二重エントリーを検出する", () => {
    const result = validateEntries(
      entries(
        { id: "e1", participantId: "p1", seed: 0 },
        { id: "e2", participantId: "p1", seed: 1 },
      ),
      ["p1"],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toContain("p1");
  });

  it("ルール 3: seed の重複を検出する", () => {
    const result = validateEntries(
      entries(
        { id: "e1", participantId: "p1", seed: 0 },
        { id: "e2", participantId: "p2", seed: 0 },
      ),
      ["p1", "p2"],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toContain("seed");
  });

  it("空のエントリーは妥当とする", () => {
    expect(validateEntries(entries(), [])).toEqual([]);
  });
});

describe("validateMatchingConfig", () => {
  const roster = entries(
    { id: "e1", participantId: "p1", seed: 0 },
    { id: "e2", participantId: "p2", seed: 1 },
    { id: "e3", participantId: "p3", seed: 2 },
  );

  it("妥当なら空配列を返す", () => {
    const result = validateMatchingConfig(
      config(
        {
          id: "m1",
          bracket: "winners",
          round: 1,
          order: 0,
          slots: [{ kind: "entry", entryId: "e1" }, { kind: "bye" }],
        },
        {
          id: "m2",
          bracket: "winners",
          round: 1,
          order: 1,
          slots: [
            { kind: "entry", entryId: "e2" },
            { kind: "entry", entryId: "e3" },
          ],
        },
        {
          id: "m3",
          bracket: "winners",
          round: 2,
          order: 0,
          slots: [
            { kind: "winnerOf", matchId: "m1" },
            { kind: "winnerOf", matchId: "m2" },
          ],
        },
      ),
      roster,
    );

    expect(result).toEqual([]);
  });

  it("ルール 4: 試合 id の重複を検出する", () => {
    const result = validateMatchingConfig(
      config(
        {
          id: "m1",
          bracket: "winners",
          round: 1,
          order: 0,
          slots: [{ kind: "entry", entryId: "e1" }, { kind: "bye" }],
        },
        {
          id: "m1",
          bracket: "winners",
          round: 1,
          order: 1,
          slots: [{ kind: "entry", entryId: "e2" }, { kind: "bye" }],
        },
      ),
      roster,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toContain("m1");
  });

  it("ルール 5: entries に無い entryId を検出する", () => {
    const result = validateMatchingConfig(
      config({
        id: "m1",
        bracket: "winners",
        round: 1,
        order: 0,
        slots: [{ kind: "entry", entryId: "ghost" }, { kind: "bye" }],
      }),
      roster,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toContain("ghost");
  });

  it("ルール 6: 存在しない matchId の参照を検出する", () => {
    const result = validateMatchingConfig(
      config({
        id: "m2",
        bracket: "winners",
        round: 2,
        order: 0,
        slots: [{ kind: "winnerOf", matchId: "ghost" }, { kind: "bye" }],
      }),
      roster,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toContain("ghost");
  });

  it("ルール 6: 同じ round への参照を検出する", () => {
    const result = validateMatchingConfig(
      config(
        {
          id: "m1",
          bracket: "winners",
          round: 1,
          order: 0,
          slots: [{ kind: "entry", entryId: "e1" }, { kind: "bye" }],
        },
        {
          id: "m2",
          bracket: "winners",
          round: 1,
          order: 1,
          slots: [{ kind: "winnerOf", matchId: "m1" }, { kind: "bye" }],
        },
      ),
      roster,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toContain("m1");
  });

  it("ルール 6: loserOf も round を検査する", () => {
    const result = validateMatchingConfig(
      config(
        {
          id: "m1",
          bracket: "winners",
          round: 2,
          order: 0,
          slots: [{ kind: "entry", entryId: "e1" }, { kind: "bye" }],
        },
        {
          id: "m2",
          bracket: "losers",
          round: 1,
          order: 0,
          slots: [{ kind: "loserOf", matchId: "m1" }, { kind: "bye" }],
        },
      ),
      roster,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toContain("m1");
  });

  it("空の組み合わせは妥当とする", () => {
    expect(validateMatchingConfig(config(), roster)).toEqual([]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm test src/lib/division/validate.test.ts`
Expected: FAIL。`Failed to resolve import "./validate"`

- [ ] **Step 3: 検証を実装する**

Create `src/lib/division/validate.ts`:

```ts
import type { DivisionEntries, MatchingConfig } from "./types";

/** 検証エラーのメッセージ一覧。空配列なら妥当。 */
export type ValidationErrors = string[];

/** 配列の中で 2 回以上現れた値を返す。 */
const duplicates = <T>(values: readonly T[]): T[] => {
  const seen = new Set<T>();
  const found = new Set<T>();
  for (const value of values) {
    if (seen.has(value)) {
      found.add(value);
    }
    seen.add(value);
  }
  return [...found];
};

/**
 * エントリーの整合性を検証する（spec のルール 1〜3）。
 * existingParticipantIds は、この部門が属する大会の Participant.id の一覧。
 */
export const validateEntries = (
  entries: DivisionEntries,
  existingParticipantIds: readonly string[],
): ValidationErrors => {
  const errors: ValidationErrors = [];
  const list = entries.entries;

  for (const id of duplicates(list.map((entry) => entry.id))) {
    errors.push(`entries[].id が重複しています: ${id}`);
  }
  for (const participantId of duplicates(
    list.map((entry) => entry.participantId),
  )) {
    errors.push(`同じ参加者が二重にエントリーしています: ${participantId}`);
  }
  for (const seed of duplicates(list.map((entry) => entry.seed))) {
    errors.push(`entries[].seed が重複しています: ${seed}`);
  }

  const known = new Set(existingParticipantIds);
  for (const entry of list) {
    if (!known.has(entry.participantId)) {
      errors.push(
        `participantId がこの大会に存在しません: ${entry.participantId}`,
      );
    }
  }

  return errors;
};

/**
 * 組み合わせの整合性を検証する（spec のルール 4〜6）。
 * 参照先の round が自分より必ず小さいことを課すため、循環は構造的に起きない。
 */
export const validateMatchingConfig = (
  config: MatchingConfig,
  entries: DivisionEntries,
): ValidationErrors => {
  const errors: ValidationErrors = [];
  const matches = config.matches;

  for (const id of duplicates(matches.map((match) => match.id))) {
    errors.push(`matchingConfig.matches[].id が重複しています: ${id}`);
  }

  const entryIds = new Set(entries.entries.map((entry) => entry.id));
  const roundById = new Map(matches.map((match) => [match.id, match.round]));

  for (const match of matches) {
    for (const [index, slot] of match.slots.entries()) {
      const where = `${match.id}.slots[${index}]`;
      if (slot.kind === "bye") {
        continue;
      }
      if (slot.kind === "entry") {
        if (!entryIds.has(slot.entryId)) {
          errors.push(
            `${where}: entryId が entries に存在しません: ${slot.entryId}`,
          );
        }
        continue;
      }
      const sourceRound = roundById.get(slot.matchId);
      if (sourceRound === undefined) {
        errors.push(`${where}: matchId が存在しません: ${slot.matchId}`);
        continue;
      }
      if (sourceRound >= match.round) {
        errors.push(
          `${where}: 参照先 ${slot.matchId} の round ${sourceRound} が自分の round ${match.round} 以上です`,
        );
      }
    }
  }

  return errors;
};
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm test src/lib/division/validate.test.ts`
Expected: 全 PASS（13 テスト）

- [ ] **Step 5: 型チェックと lint**

Run: `pnpm typecheck`
Expected: エラーなし

Run: `pnpm lint`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/lib/division/validate.ts src/lib/division/validate.test.ts
git commit -m "feat: validate division entries and matching config"
```

---

### Task 4: 勝敗記録の整合性検証（ルール 7〜9）

**Files:**
- Modify: `src/lib/division/validate.ts`（末尾に追記）
- Modify: `src/lib/division/validate.test.ts`（末尾に追記）

**Interfaces:**
- Consumes: Task 2 の `MatchingConfig` / `DivisionResults` 型、Task 1 の `DivisionFormat` 型、Task 3 の `ValidationErrors` と `duplicates`（同一ファイル内）
- Produces:
  - `reachableEntryIds(matchId: string, config: MatchingConfig): Set<string>`
  - `validateResults(results: DivisionResults, config: MatchingConfig, format: DivisionFormat): ValidationErrors`

- [ ] **Step 1: 失敗するテストを追記する**

`src/lib/division/validate.test.ts` の先頭 import を次に差し替える。

```ts
import { describe, expect, it } from "vitest";
import type { DivisionEntries, DivisionResults, MatchingConfig } from "./types";
import {
  reachableEntryIds,
  validateEntries,
  validateMatchingConfig,
  validateResults,
} from "./validate";
```

ファイル末尾に次を追記する。

```ts
/** 4 名のシングルエリミネーション。m3 が決勝。 */
const bracket = config(
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
  {
    id: "m2",
    bracket: "winners",
    round: 1,
    order: 1,
    slots: [
      { kind: "entry", entryId: "e3" },
      { kind: "entry", entryId: "e4" },
    ],
  },
  {
    id: "m3",
    bracket: "winners",
    round: 2,
    order: 0,
    slots: [
      { kind: "winnerOf", matchId: "m1" },
      { kind: "winnerOf", matchId: "m2" },
    ],
  },
);

const results = (
  ...matches: DivisionResults["matches"]
): DivisionResults => ({ version: 1, matches });

describe("reachableEntryIds", () => {
  it("1 回戦は自分のスロットの entry だけを返す", () => {
    expect(reachableEntryIds("m1", bracket)).toEqual(new Set(["e1", "e2"]));
  });

  it("決勝は全ての entry を再帰的に集める", () => {
    expect(reachableEntryIds("m3", bracket)).toEqual(
      new Set(["e1", "e2", "e3", "e4"]),
    );
  });

  it("loserOf もたどる", () => {
    const doubleElim = config(
      {
        id: "w1",
        bracket: "winners",
        round: 1,
        order: 0,
        slots: [
          { kind: "entry", entryId: "e1" },
          { kind: "entry", entryId: "e2" },
        ],
      },
      {
        id: "l1",
        bracket: "losers",
        round: 2,
        order: 0,
        slots: [{ kind: "loserOf", matchId: "w1" }, { kind: "bye" }],
      },
    );

    expect(reachableEntryIds("l1", doubleElim)).toEqual(new Set(["e1", "e2"]));
  });

  it("存在しない試合には何も返さない", () => {
    expect(reachableEntryIds("ghost", bracket)).toEqual(new Set());
  });
});

describe("validateResults", () => {
  it("妥当なら空配列を返す", () => {
    const errors = validateResults(
      results(
        { matchId: "m1", winnerEntryId: "e1" },
        { matchId: "m3", winnerEntryId: "e1", score: "3-1" },
      ),
      bracket,
      "SINGLE_ELIMINATION",
    );

    expect(errors).toEqual([]);
  });

  it("ルール 7: matchingConfig に無い matchId を検出する", () => {
    const errors = validateResults(
      results({ matchId: "ghost", winnerEntryId: "e1" }),
      bracket,
      "SINGLE_ELIMINATION",
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("ghost");
  });

  it("ルール 7: 同じ matchId が 2 回現れたら検出する", () => {
    const errors = validateResults(
      results(
        { matchId: "m1", winnerEntryId: "e1" },
        { matchId: "m1", winnerEntryId: "e2" },
      ),
      bracket,
      "SINGLE_ELIMINATION",
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("m1");
  });

  it("ルール 8: その試合に到達しない winnerEntryId を検出する", () => {
    const errors = validateResults(
      results({ matchId: "m1", winnerEntryId: "e3" }),
      bracket,
      "SINGLE_ELIMINATION",
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("e3");
  });

  it("ルール 9: SINGLE_ELIMINATION の引き分けを弾く", () => {
    const errors = validateResults(
      results({ matchId: "m1", winnerEntryId: null }),
      bracket,
      "SINGLE_ELIMINATION",
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("ROUND_ROBIN");
  });

  it("ルール 9: ROUND_ROBIN の引き分けは許可する", () => {
    const errors = validateResults(
      results({ matchId: "m1", winnerEntryId: null }),
      bracket,
      "ROUND_ROBIN",
    );

    expect(errors).toEqual([]);
  });

  it("空の結果は妥当とする", () => {
    expect(validateResults(results(), bracket, "SINGLE_ELIMINATION")).toEqual(
      [],
    );
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm test src/lib/division/validate.test.ts`
Expected: FAIL。`reachableEntryIds is not a function` / `validateResults is not a function`
（Task 3 の 13 テストは引き続き PASS）

- [ ] **Step 3: 到達可能性と結果検証を実装する**

`src/lib/division/validate.ts` の import を次に差し替える。

```ts
import type { DivisionFormat } from "@/generated/prisma/enums";
import type { DivisionEntries, DivisionResults, MatchingConfig } from "./types";
```

ファイル末尾に次を追記する。

```ts
/**
 * その試合のスロットに到達しうる entry id を集める。
 * winnerOf / loserOf は参照先を再帰的にたどる。
 * validateMatchingConfig が round の単調減少を保証していれば循環しないが、
 * 未検証の入力でも止まるよう訪問済みの試合は再訪しない。
 */
export const reachableEntryIds = (
  matchId: string,
  config: MatchingConfig,
): Set<string> => {
  const byId = new Map(config.matches.map((match) => [match.id, match]));
  const found = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string): void => {
    if (visited.has(id)) {
      return;
    }
    visited.add(id);
    const match = byId.get(id);
    if (!match) {
      return;
    }
    for (const slot of match.slots) {
      if (slot.kind === "entry") {
        found.add(slot.entryId);
      } else if (slot.kind !== "bye") {
        visit(slot.matchId);
      }
    }
  };

  visit(matchId);
  return found;
};

/**
 * 勝敗記録の整合性を検証する（spec のルール 7〜9）。
 * 1 試合につき結果は 1 件までとする。
 */
export const validateResults = (
  results: DivisionResults,
  config: MatchingConfig,
  format: DivisionFormat,
): ValidationErrors => {
  const errors: ValidationErrors = [];
  const matchIds = new Set(config.matches.map((match) => match.id));

  for (const matchId of duplicates(
    results.matches.map((record) => record.matchId),
  )) {
    errors.push(`results に同じ matchId が 2 回現れています: ${matchId}`);
  }

  for (const record of results.matches) {
    if (!matchIds.has(record.matchId)) {
      errors.push(
        `matchId が matchingConfig に存在しません: ${record.matchId}`,
      );
      continue;
    }
    if (record.winnerEntryId === null) {
      if (format !== "ROUND_ROBIN") {
        errors.push(
          `引き分けは ROUND_ROBIN でのみ許可されます: ${record.matchId}`,
        );
      }
      continue;
    }
    if (!reachableEntryIds(record.matchId, config).has(record.winnerEntryId)) {
      errors.push(
        `${record.matchId}: winnerEntryId ${record.winnerEntryId} はこの試合に到達しません`,
      );
    }
  }

  return errors;
};
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm test src/lib/division/validate.test.ts`
Expected: 全 PASS（24 テスト）

- [ ] **Step 5: 型チェックと lint**

Run: `pnpm typecheck`
Expected: エラーなし

Run: `pnpm lint`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/lib/division/validate.ts src/lib/division/validate.test.ts
git commit -m "feat: validate division results against bracket reachability"
```

---

### Task 5: 勝敗の反映と楽観ロック付き書き込み

**Files:**
- Create: `src/lib/division/results.ts`
- Test: `src/lib/division/results.test.ts`

**Interfaces:**
- Consumes: Task 2 の `DivisionResults` / `MatchResultRecord` 型と `parseDivisionResults`
- Produces:
  - `applyMatchResult(results: DivisionResults, record: MatchResultRecord): DivisionResults`
  - `class DivisionConflictError extends Error`
  - `recordMatchResult(prisma: PrismaClient, divisionId: string, record: MatchResultRecord): Promise<DivisionResults>`

`recordMatchResult` はこのライブラリで唯一 DB に触れる関数。単体テストは純関数
`applyMatchResult` のみを対象とし、楽観ロックの競合は DB の挙動なのでテストしない。

- [ ] **Step 1: 失敗するテストを書く**

Create `src/lib/division/results.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyMatchResult } from "./results";
import { EMPTY_DIVISION_RESULTS } from "./types";

describe("applyMatchResult", () => {
  it("空の results に 1 件追加する", () => {
    const next = applyMatchResult(EMPTY_DIVISION_RESULTS, {
      matchId: "m1",
      winnerEntryId: "e1",
      score: "3-1",
    });

    expect(next).toEqual({
      version: 1,
      matches: [{ matchId: "m1", winnerEntryId: "e1", score: "3-1" }],
    });
  });

  it("同じ matchId は上書きし、件数を増やさない", () => {
    const first = applyMatchResult(EMPTY_DIVISION_RESULTS, {
      matchId: "m1",
      winnerEntryId: "e1",
      score: "3-1",
    });
    const second = applyMatchResult(first, {
      matchId: "m1",
      winnerEntryId: "e2",
      score: "1-3",
    });

    expect(second.matches).toEqual([
      { matchId: "m1", winnerEntryId: "e2", score: "1-3" },
    ]);
  });

  it("上書きしても他の試合の並び順を保つ", () => {
    let current = EMPTY_DIVISION_RESULTS;
    current = applyMatchResult(current, { matchId: "m1", winnerEntryId: "e1" });
    current = applyMatchResult(current, { matchId: "m2", winnerEntryId: "e3" });
    current = applyMatchResult(current, { matchId: "m1", winnerEntryId: "e2" });

    expect(current.matches.map((record) => record.matchId)).toEqual([
      "m1",
      "m2",
    ]);
    expect(current.matches[0].winnerEntryId).toBe("e2");
  });

  it("引き分けを記録できる", () => {
    const next = applyMatchResult(EMPTY_DIVISION_RESULTS, {
      matchId: "m1",
      winnerEntryId: null,
    });

    expect(next.matches[0].winnerEntryId).toBeNull();
  });

  it("元の値を変更しない", () => {
    const before = EMPTY_DIVISION_RESULTS;
    applyMatchResult(before, { matchId: "m1", winnerEntryId: "e1" });

    expect(before.matches).toEqual([]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm test src/lib/division/results.test.ts`
Expected: FAIL。`Failed to resolve import "./results"`

- [ ] **Step 3: 実装する**

Create `src/lib/division/results.ts`:

```ts
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { parseDivisionResults } from "./parse";
import type { DivisionResults, MatchResultRecord } from "./types";

/** 楽観ロックの競合。呼び出し元は再読み込みを促す。 */
export class DivisionConflictError extends Error {
  constructor(divisionId: string) {
    super(
      `Division ${divisionId} は他の人が更新しました。再読み込みしてください。`,
    );
    this.name = "DivisionConflictError";
  }
}

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

/** Prisma の Json 入力は構造的な型を受け付けないため、書き込み時にだけ変換する。 */
const toJsonInput = (results: DivisionResults): Prisma.InputJsonValue =>
  results as unknown as Prisma.InputJsonValue;

const isRecordNotFound = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code: unknown }).code === "P2025";

/**
 * 楽観ロック付きで 1 試合分の結果を書き込む。
 * 読み取りから書き込みの間に revision が変わっていたら DivisionConflictError を投げる。
 */
export const recordMatchResult = async (
  prisma: PrismaClient,
  divisionId: string,
  record: MatchResultRecord,
): Promise<DivisionResults> => {
  const division = await prisma.division.findUniqueOrThrow({
    where: { id: divisionId },
    select: { results: true, revision: true },
  });

  const next = applyMatchResult(
    parseDivisionResults(division.results),
    record,
  );

  try {
    await prisma.division.update({
      where: { id: divisionId, revision: division.revision },
      data: { results: toJsonInput(next), revision: division.revision + 1 },
    });
  } catch (error) {
    if (isRecordNotFound(error)) {
      throw new DivisionConflictError(divisionId);
    }
    throw error;
  }

  return next;
};
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm test src/lib/division/results.test.ts`
Expected: 全 PASS（5 テスト）

- [ ] **Step 5: 全テストと型チェック**

Run: `pnpm test`
Expected: 全 PASS（既存の `src/features/tournament/` の分を含む）

Run: `pnpm typecheck`
Expected: エラーなし

`prisma.division.update` の `where` に `revision` を渡す箇所で型エラーが出る場合、
Task 1 の `pnpm db:generate` が済んでいない可能性が高い。再実行して確認する。

Run: `pnpm lint`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/lib/division/results.ts src/lib/division/results.test.ts
git commit -m "feat: record match results with optimistic locking"
```

---

## 完了条件

- `prisma/schema.prisma` に `Match` / `Entry` / `MatchStatus` が存在しない
- `prisma/migrations/` に init マイグレーションが 1 つだけある
- `pnpm typecheck` / `pnpm lint` / `pnpm test` が全て通る
- `src/lib/division/` に `types.ts` / `parse.ts` / `validate.ts` / `results.ts` と各テストがある
- spec の整合性ルール 1〜9 それぞれに、通る例と弾く例のテストがある

## 次のプラン（このプランの範囲外）

- 形式ごとの `matchingConfig` 自動生成（シード配置、BYE の寄せ方、総当たりの節割り）
- `Division` の Json を `src/features/tournament/types.ts` の描画用型に変換するアダプタ
- 部門間の参加者引き継ぎ
- Division / Participant の CRUD と画面
