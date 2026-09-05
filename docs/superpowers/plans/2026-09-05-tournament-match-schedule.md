# 大会 試合一覧（進行順）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 大会配下の全部門の試合を横断した「試合一覧」画面を追加し、進行順のドラッグ & ドロップ並べ替えと、ラベル + 開始予定時刻を持つ区切り行（Divider）の挿入・編集・削除をできるようにする。

**Architecture:** 進行順は新テーブル `ScheduleItem`（1 行 = 試合 or 区切り）に持つ。試合の実体は `Division.matchingConfig`（JSON）の中にあり `ScheduleItem` は文字列 id で指すだけなので、読み出しは純粋関数 `buildScheduleView` で「保存された並び + 行の無い試合を決定的な順で末尾へ」にマージする。書き込みは 4 スライス共通の `schedule-store.ts` が「読む → マージ → 配列を変形 → 全行 delete + create で order を 0..n-1 に振り直す」を 1 トランザクションで回す。

**Tech Stack:** Next.js 16 (App Router / Server Actions) / React 19 / Prisma 7 (PostgreSQL) / Effect / Zod 4 / Tailwind 4 / @dnd-kit (core + sortable) / Vitest + Testing Library / Biome

**Spec:** `docs/superpowers/specs/2026-09-05-tournament-match-schedule-design.md`

## Global Constraints

- パッケージマネージャは **pnpm**（`pnpm install` / `pnpm add` / `pnpm <script>`）。
- 垂直スライスアーキテクチャ。`src/features/<category>/<action>/` に `schema.ts` / `handler.ts` / `usecase.ts` / `repository.ts` を置く。スライス同士（同列）の依存は禁止。祖先方向（カテゴリ直下・`src/lib`・`src/shared`）のみ許可。
- `features/schedule` は `features/division` や `features/tournament`（同列カテゴリ）に依存してはならない。共有したいものは `src/lib/division/` へ下ろす。**ただし `src/components/**` からは任意の feature を import してよい**（Biome の制約は features → components の向きだけ）。
- `src/features/**` に `.tsx` を置かない。画面は `src/components/<category>/` に置く。
- 認可境界 `requireOrganization(slug)` は**ページの冒頭と、各 Server Action の冒頭で独立に呼ぶ**。
- 所有権はクエリの `where` にリレーションフィルタで入れる（`where: { tournament: { id: tournamentId, organizationId } }`）。取得してから弾く形にしない。`update` / `delete` ではなく `updateMany` / `deleteMany` を使う。
- 見つからない / 権限が無いはすべて `notFound()`（404）。403 は使わない。
- エラー型は `effect` の `Data.TaggedError`、文言は `Match.type().pipe(..., Match.exhaustive)` で網羅を強制する。
- ブラケット（`Division.matchingConfig` の構造）と `BracketMatch.matchNumber` の採番規則は**変更しない**。
- コメントは日本語。既存ファイルのコメント密度・語り口に合わせる（「なぜ」を書く）。
- 検証コマンド: `pnpm test` / `pnpm typecheck` / `pnpm lint`。
- Windows チェックアウトでは Biome が CRLF 由来の差分を全ファイルに出すことがある。**自分が触ったファイルの内容についての指摘だけを見る**。
- 新しいルートを追加したら `pnpm exec next typegen` を実行する（`PageProps<...>` の型が生成される）。

---

### Task 1: ScheduleItem モデルとマイグレーション

**Files:**
- Modify: `prisma/schema.prisma`（`Tournament` / `Division` に逆リレーション追加、`enum DivisionFormat` の直後に `ScheduleItem` と `ScheduleItemKind` を追加）
- Create: `prisma/migrations/<timestamp>_add_schedule_item/migration.sql`

**Interfaces:**
- Consumes: なし
- Produces: Prisma Client の `prisma.scheduleItem`、型 `ScheduleItem`、enum `ScheduleItemKind`（`"MATCH" | "DIVIDER"`）。以降のタスクが `@/generated/prisma/enums` から `ScheduleItemKind` を import できる。

- [ ] **Step 1: `Tournament` に逆リレーションを足す**

`prisma/schema.prisma` の `model Tournament` の中、`divisions    Division[]` の直後に 1 行足す。

```prisma
  divisions    Division[]
  scheduleItems ScheduleItem[]
```

- [ ] **Step 2: `Division` に逆リレーションを足す**

`model Division` の中、`tournament Tournament @relation(...)` の直後に 1 行足す。

```prisma
  tournament Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  scheduleItems ScheduleItem[]
```

- [ ] **Step 3: `ScheduleItem` と enum を追加**

`enum DivisionFormat { ... }` ブロックの直後（`model Session` の前）に貼る。

```prisma
/// 大会の進行順。1 行が「試合」か「区切り」のどちらかを表す。
/// 試合の実体は Division.matchingConfig（Json）の中にあるため、この行は
/// (divisionId, matchId) の文字列で指すだけで、試合そのものへの外部キーにはならない。
/// ずれ（組み合わせの再生成・部門の削除）は features/schedule の
/// buildScheduleView が読み出し時に吸収する。
model ScheduleItem {
  id           String           @id @default(uuid())
  tournamentId String
  /// 進行順。0 始まりの連番。並べ替え・挿入・削除のたびに全行を振り直す。
  order        Int
  kind         ScheduleItemKind
  /// MATCH のとき: 参照先の部門。DIVIDER のとき null。
  divisionId   String?
  /// MATCH のとき: matchingConfig 内の BracketMatch.id。DIVIDER のとき null。
  matchId      String?
  /// DIVIDER のとき: 見出し。MATCH のとき null。
  label        String?
  /// DIVIDER のとき: 開始予定時刻。未設定は null。MATCH のとき null。
  startsAt     DateTime?
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt

  tournament Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  division   Division?  @relation(fields: [divisionId], references: [id], onDelete: Cascade)

  @@unique([tournamentId, order])
  /// 同じ試合が二重に並ぶのを防ぐ。PostgreSQL の一意制約は NULL 同士を
  /// 相異なるものとして扱うため、両方 null になる DIVIDER 行は衝突しない。
  @@unique([tournamentId, divisionId, matchId])
  @@index([tournamentId])
  @@index([divisionId])
}

enum ScheduleItemKind {
  /// 試合の行
  MATCH
  /// 「----- 午前の部 -----」のような区切りの行
  DIVIDER
}
```

- [ ] **Step 4: マイグレーションを作る**

DB に接続できる場合:

```bash
pnpm exec prisma migrate dev --name add_schedule_item
```

DB に接続できない場合は手で作る。`prisma/migrations/20260905120000_add_schedule_item/migration.sql` を次の内容で作成し、そのあと `pnpm db:generate` を実行する。

```sql
-- CreateEnum
CREATE TYPE "ScheduleItemKind" AS ENUM ('MATCH', 'DIVIDER');

-- CreateTable
CREATE TABLE "ScheduleItem" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "kind" "ScheduleItemKind" NOT NULL,
    "divisionId" TEXT,
    "matchId" TEXT,
    "label" TEXT,
    "startsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleItem_tournamentId_idx" ON "ScheduleItem"("tournamentId");

-- CreateIndex
CREATE INDEX "ScheduleItem_divisionId_idx" ON "ScheduleItem"("divisionId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleItem_tournamentId_order_key" ON "ScheduleItem"("tournamentId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleItem_tournamentId_divisionId_matchId_key" ON "ScheduleItem"("tournamentId", "divisionId", "matchId");

-- AddForeignKey
ALTER TABLE "ScheduleItem" ADD CONSTRAINT "ScheduleItem_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleItem" ADD CONSTRAINT "ScheduleItem_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

既存データのバックフィルは行わない（既存の大会は行を 0 件から始め、マージ規則が全試合を決定的な順で並べる）。

- [ ] **Step 5: クライアントが生成できたか確かめる**

Run: `pnpm typecheck`
Expected: エラー無しで終了。

Run: `grep -n "ScheduleItemKind" src/generated/prisma/enums.ts`
Expected: `ScheduleItemKind` の const と type が生成されている（MATCH / DIVIDER を含む）。

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(schedule): add ScheduleItem model for tournament match order"
```

---

### Task 2: スロット表示ロジックを `lib/division/label.ts` へ下ろす

`features/schedule` は `features/division`（同列）に依存できないため、「山田 vs 第 3 試合の勝者」を作るロジックを下位共通層へ移す。既存 `toMatchNumberView` の外から見た振る舞いは変えない。

**Files:**
- Create: `src/lib/division/label.ts`
- Create: `src/lib/division/label.test.ts`
- Modify: `src/features/division/single-elimination/view.ts`（`toMatchNumberView` の中身を差し替え）

**Interfaces:**
- Consumes: `src/lib/division/types.ts` の `BracketMatch` / `DivisionEntries` / `MatchingConfig` / `SlotSource`
- Produces:
  - `type SlotLabeler = (slot: SlotSource) => string`
  - `createSlotLabeler(config: MatchingConfig, entries: DivisionEntries, participants: { id: string; name: string }[]): SlotLabeler`
  - `matchCardLabel(match: BracketMatch, labelSlot: SlotLabeler): string`
  - `matchPositionLabel(match: BracketMatch): string`

- [ ] **Step 1: 失敗するテストを書く**

Create `src/lib/division/label.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createSlotLabeler, matchCardLabel, matchPositionLabel } from "./label";
import type { DivisionEntries, MatchingConfig } from "./types";

const config: MatchingConfig = {
  version: 1,
  matches: [
    {
      id: "m1-0",
      bracket: "winners",
      round: 1,
      order: 0,
      matchNumber: "3",
      slots: [{ kind: "entry", entryId: "e1" }, { kind: "bye" }],
    },
    {
      id: "m2-0",
      bracket: "winners",
      round: 2,
      order: 0,
      matchNumber: "9",
      slots: [
        { kind: "winnerOf", matchId: "m1-0" },
        { kind: "loserOf", matchId: "m1-0" },
      ],
    },
  ],
};

const entries: DivisionEntries = {
  version: 1,
  entries: [
    { id: "e1", participantId: "p1", seed: 0 },
    { id: "e9", participantId: "p9", seed: 1 },
  ],
};

const participants = [{ id: "p1", name: "山田" }];

describe("createSlotLabeler", () => {
  it("entry は参加者名にする", () => {
    const label = createSlotLabeler(config, entries, participants);
    expect(label({ kind: "entry", entryId: "e1" })).toBe("山田");
  });

  it("参加者を引けない entry は「（不明な参加者）」にする", () => {
    const label = createSlotLabeler(config, entries, participants);
    expect(label({ kind: "entry", entryId: "e9" })).toBe("（不明な参加者）");
  });

  it("勝者・敗者参照は相手の試合番号で表す", () => {
    const label = createSlotLabeler(config, entries, participants);
    expect(label({ kind: "winnerOf", matchId: "m1-0" })).toBe("第3試合の勝者");
    expect(label({ kind: "loserOf", matchId: "m1-0" })).toBe("第3試合の敗者");
  });

  it("知らない試合を指す参照は「?」にする", () => {
    const label = createSlotLabeler(config, entries, participants);
    expect(label({ kind: "winnerOf", matchId: "zzz" })).toBe("第?試合の勝者");
  });

  it("bye は BYE にする", () => {
    const label = createSlotLabeler(config, entries, participants);
    expect(label({ kind: "bye" })).toBe("BYE");
  });
});

describe("matchCardLabel", () => {
  it("両スロットを vs でつなぐ", () => {
    const label = createSlotLabeler(config, entries, participants);
    expect(matchCardLabel(config.matches[0], label)).toBe("山田 vs BYE");
  });
});

describe("matchPositionLabel", () => {
  it("round と order から構造上の位置を作る", () => {
    expect(matchPositionLabel(config.matches[1])).toBe("2回戦 第1試合");
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `pnpm exec vitest run src/lib/division/label.test.ts`
Expected: FAIL（`Failed to resolve import "./label"`）

- [ ] **Step 3: 実装する**

Create `src/lib/division/label.ts`:

```ts
import type {
  BracketMatch,
  DivisionEntries,
  MatchingConfig,
  SlotSource,
} from "./types";

/** スロット 1 つの表示文字列を作る関数。 */
export type SlotLabeler = (slot: SlotSource) => string;

/**
 * スロットの表示文字列を作る関数を返す。
 *
 * 部門の試合番号一覧（features/division）と大会の試合一覧（features/schedule）が
 * 同じ文言を出す必要がある。features は同列どうし依存できないため、
 * 両方から参照できる下位共通層のここへ置く。
 *
 * 名前を引けなかった entry は「（不明な参加者）」にして落とさない。
 * 参加者一覧が古いだけでも一覧は読めた方がよい。bye と書き分けるのは、
 * 引けないだけのスロットを「不戦勝」と出すとブラケットの読み違いになるため。
 */
export const createSlotLabeler = (
  config: MatchingConfig,
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
  const numberByMatchId = new Map(
    config.matches.map((match) => [match.id, match.matchNumber]),
  );

  return (slot) => {
    switch (slot.kind) {
      case "entry":
        return nameByEntryId.get(slot.entryId) ?? "（不明な参加者）";
      case "winnerOf":
        return `第${numberByMatchId.get(slot.matchId) ?? "?"}試合の勝者`;
      case "loserOf":
        return `第${numberByMatchId.get(slot.matchId) ?? "?"}試合の敗者`;
      case "bye":
        return "BYE";
    }
  };
};

/** 「山田 vs 第3試合の勝者」のような対戦の表示。 */
export const matchCardLabel = (
  match: BracketMatch,
  labelSlot: SlotLabeler,
): string => `${labelSlot(match.slots[0])} vs ${labelSlot(match.slots[1])}`;

/** 「1回戦 第1試合」のような構造上の位置。 */
export const matchPositionLabel = (match: BracketMatch): string =>
  `${match.round}回戦 第${match.order + 1}試合`;
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `pnpm exec vitest run src/lib/division/label.test.ts`
Expected: PASS（8 tests）

- [ ] **Step 5: `toMatchNumberView` を差し替える**

`src/features/division/single-elimination/view.ts` のファイル先頭の import を次の形にする（`SlotSource` は `toSetupView` では使わないので型 import から落とす）。

```ts
import {
  createSlotLabeler,
  matchCardLabel,
  matchPositionLabel,
} from "@/lib/division/label";
import type { DivisionEntries, MatchingConfig } from "@/lib/division/types";
import { toSlots } from "./build";
```

`toMatchNumberView` の本体（`export const toMatchNumberView = (` から関数末尾の `};` まで）を、次で丸ごと置き換える。`MatchNumberRowView` の型定義とその上のコメントはそのまま残す。

```ts
/**
 * 全試合を round/order 順に並べた試合番号の編集用一覧。
 * toSetupView と違い 1 回戦以外も含む。勝者参照は相手の試合番号で表す。
 * 表示文言は lib/division/label.ts を使う（大会の試合一覧と揃えるため）。
 */
export const toMatchNumberView = (
  config: MatchingConfig,
  entries: DivisionEntries,
  participants: { id: string; name: string }[],
): MatchNumberRowView[] => {
  const labelSlot = createSlotLabeler(config, entries, participants);

  return [...config.matches]
    .sort((left, right) => left.round - right.round || left.order - right.order)
    .map((match) => ({
      matchId: match.id,
      matchNumber: match.matchNumber,
      label: matchPositionLabel(match),
      card: matchCardLabel(match, labelSlot),
    }));
};
```

- [ ] **Step 6: 既存テストが通ることを確かめる**

Run: `pnpm exec vitest run src/lib/division src/features/division/single-elimination`
Expected: PASS（既存の `view.test.ts` を含め全件通る。落ちたら文言が変わっている＝退行なので直す）

Run: `pnpm typecheck`
Expected: エラー無し

- [ ] **Step 7: Commit**

```bash
git add src/lib/division/label.ts src/lib/division/label.test.ts src/features/division/single-elimination/view.ts
git commit -m "refactor(division): move slot label logic to lib/division/label"
```

---
### Task 3: features/schedule の土台（型・エラー・文言・state・revalidate・parse）

**Files:**
- Create: `src/features/schedule/types.ts`
- Create: `src/features/schedule/errors.ts`
- Create: `src/features/schedule/messages.ts`
- Create: `src/features/schedule/messages.test.ts`
- Create: `src/features/schedule/state.ts`
- Create: `src/features/schedule/effect-to-form-state.ts`
- Create: `src/features/schedule/revalidate.ts`
- Create: `src/features/schedule/parse.ts`
- Create: `src/features/schedule/parse.test.ts`

**Interfaces:**
- Consumes: Task 1 の `ScheduleItemKind`
- Produces:
  - `ScheduleItemRecord` / `ScheduleRowView` / `ScheduleDivision` / `ScheduleParticipant` / `ScheduleSaveItem`（`types.ts`）
  - `ScheduleError` union と各エラークラス、`toScheduleError(reason, tournamentId)`（`errors.ts`）
  - `scheduleErrorMessage(error): string`（`messages.ts`）
  - `ScheduleFormState` / `INITIAL_SCHEDULE_FORM_STATE` / `ScheduleFormAction`（`state.ts`）
  - `scheduleErrorFormState(cause): ScheduleFormState`（`effect-to-form-state.ts`）
  - `revalidateSchedule(slug, tournamentId): void`（`revalidate.ts`）
  - `ScheduleItemRow` と `parseScheduleItem(row): ScheduleItemRecord | null`（`parse.ts`）

- [ ] **Step 1: 型を書く**

Create `src/features/schedule/types.ts`:

```ts
import type { DivisionEntries, MatchingConfig } from "@/lib/division/types";

/**
 * ScheduleItem の 1 行を判別可能ユニオンに直した形。
 * DB では kind に依存して使う列が変わる（行の多相化）ため、
 * 列の組み合わせが壊れている行は parse.ts で落として、この型より先へ運ばない。
 */
export type ScheduleItemRecord =
  | { kind: "match"; id: string; divisionId: string; matchId: string }
  | { kind: "divider"; id: string; label: string; startsAt: Date | null };

/** マージの材料になる部門。Json は検証済みの形で受け取る。 */
export type ScheduleDivision = {
  id: string;
  name: string;
  /** 大会内での表示順。行の無い試合を末尾へ足すときの並び順に使う。 */
  order: number;
  entries: DivisionEntries;
  matchingConfig: MatchingConfig;
};

/** 表示名の解決に使う参加者。 */
export type ScheduleParticipant = { id: string; name: string };

/**
 * 一覧の 1 行。key が画面とサーバの間で行を指す唯一の識別子で、
 * ScheduleItem.id ではない（行がまだ DB に無い試合もあるため）。
 */
export type ScheduleRowView =
  | {
      kind: "match";
      /** `match:{divisionId}:{matchId}` */
      key: string;
      divisionId: string;
      divisionName: string;
      matchId: string;
      matchNumber: string;
      /** 「1回戦 第1試合」 */
      label: string;
      /** 「山田 vs 第3試合の勝者」 */
      card: string;
    }
  | {
      kind: "divider";
      /** `divider:{id}` */
      key: string;
      /** ScheduleItem.id。更新・削除はこの id を送る。 */
      id: string;
      label: string;
      startsAt: Date | null;
    };

/** 書き戻す 1 行。order は保存時に 0..n-1 で振り直すので持たない。 */
export type ScheduleSaveItem =
  | { kind: "match"; divisionId: string; matchId: string }
  | { kind: "divider"; id: string; label: string; startsAt: Date | null };
```

- [ ] **Step 2: エラー型を書く**

Create `src/features/schedule/errors.ts`:

```ts
import { Data, Predicate } from "effect";
import { Prisma } from "@/generated/prisma/client";
import { DivisionJsonError } from "@/lib/division/parse";

/**
 * 画面が持っていた並びが、いまの一覧と一致しないことを表す。
 * 別の誰かが組み合わせを作り直した・区切りを増やした場合に起きる。
 * この確認が同時編集に対する防波堤なので、リビジョン列は持たない。
 */
export class ScheduleStaleError extends Data.TaggedError(
  "ScheduleStaleError",
)<{
  readonly tournamentId: string;
}> {}

/** 指定された区切りが無い（または対象が区切りでない）ことを表す。 */
export class ScheduleItemNotFoundError extends Data.TaggedError(
  "ScheduleItemNotFoundError",
)<{
  readonly itemId: string;
}> {}

/** DB の Json / 行が想定の形をしていないことを表す。 */
export class ScheduleDataError extends Data.TaggedError("ScheduleDataError")<{
  readonly reason: unknown;
}> {}

/** order の unique 制約（@@unique([tournamentId, order])）に触れたことを表す。 */
export class ScheduleOrderConflictError extends Data.TaggedError(
  "ScheduleOrderConflictError",
)<{
  readonly tournamentId: string;
}> {}

export class UnexpectedScheduleError extends Data.TaggedError(
  "UnexpectedScheduleError",
)<{
  // Error が持つ cause と名前が衝突しないよう reason にしている。
  readonly reason: unknown;
}> {}

export type ScheduleError =
  | ScheduleStaleError
  | ScheduleItemNotFoundError
  | ScheduleDataError
  | ScheduleOrderConflictError
  | UnexpectedScheduleError;

/**
 * ScheduleError の全タグをコンパイラに列挙させるための対照表。
 * union にタグを足してここへの追記を忘れるとコンパイルエラーになる。
 * features/division/errors.ts と同じ作りにしてある。
 */
const scheduleErrorTags: Record<ScheduleError["_tag"], true> = {
  ScheduleStaleError: true,
  ScheduleItemNotFoundError: true,
  ScheduleDataError: true,
  ScheduleOrderConflictError: true,
  UnexpectedScheduleError: true,
};

/**
 * `in` ではなく Object.hasOwn を使う。`in` はプロトタイプ鎖まで辿るため、
 * _tag が "toString" のオブジェクトが ScheduleError と判定され、
 * messages.ts の Match.exhaustive が文言を返せず実行時に落ちる。
 */
const isScheduleError = (reason: unknown): reason is ScheduleError =>
  Predicate.isRecord(reason) &&
  Predicate.hasProperty(reason, "_tag") &&
  typeof reason._tag === "string" &&
  Object.hasOwn(scheduleErrorTags, reason._tag);

/**
 * Prisma の例外をドメインのエラーに写像する。ここで写像しておくことで、
 * usecase より上の層に Prisma の型が漏れない。
 */
export const toScheduleError = (
  reason: unknown,
  tournamentId: string,
): ScheduleError => {
  // トランザクションの中から投げたドメインエラーはそのまま通す。
  if (isScheduleError(reason)) {
    return reason;
  }
  if (reason instanceof DivisionJsonError) {
    return new ScheduleDataError({ reason });
  }
  if (
    reason instanceof Prisma.PrismaClientKnownRequestError &&
    reason.code === "P2002"
  ) {
    return new ScheduleOrderConflictError({ tournamentId });
  }
  return new UnexpectedScheduleError({ reason });
};
```

- [ ] **Step 3: 文言のテストを書く**

Create `src/features/schedule/messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ScheduleDataError,
  ScheduleItemNotFoundError,
  ScheduleOrderConflictError,
  ScheduleStaleError,
  UnexpectedScheduleError,
} from "./errors";
import { scheduleErrorMessage } from "./messages";

describe("scheduleErrorMessage", () => {
  it("並びのずれは再読み込みを促す", () => {
    expect(scheduleErrorMessage(new ScheduleStaleError({ tournamentId: "t1" }))).toBe(
      "一覧が更新されています。画面を再読み込みしてください",
    );
  });

  it("区切りが無い場合も再読み込みを促す", () => {
    expect(
      scheduleErrorMessage(new ScheduleItemNotFoundError({ itemId: "s1" })),
    ).toBe("対象の区切りが見つかりません。画面を再読み込みしてください");
  });

  it("データ破損は管理者への連絡を促す", () => {
    expect(scheduleErrorMessage(new ScheduleDataError({ reason: "x" }))).toBe(
      "試合一覧のデータが壊れています。管理者に連絡してください",
    );
  });

  it("順序の競合は再試行を促す", () => {
    expect(
      scheduleErrorMessage(
        new ScheduleOrderConflictError({ tournamentId: "t1" }),
      ),
    ).toBe("並び順が競合しました。もう一度お試しください");
  });

  it("想定外は汎用の文言にする", () => {
    expect(
      scheduleErrorMessage(new UnexpectedScheduleError({ reason: "x" })),
    ).toBe("処理に失敗しました。時間をおいて再度お試しください");
  });
});
```

- [ ] **Step 4: テストが落ちることを確かめる**

Run: `pnpm exec vitest run src/features/schedule/messages.test.ts`
Expected: FAIL（`Failed to resolve import "./messages"`）

- [ ] **Step 5: 文言・state・変換・revalidate を書く**

Create `src/features/schedule/messages.ts`:

```ts
import { Match } from "effect";
import type { ScheduleError } from "./errors";

/**
 * Match.exhaustive により、errors.ts にタグを足して文言を書き忘れると
 * コンパイルエラーになる。
 */
export const scheduleErrorMessage: (error: ScheduleError) => string =
  Match.type<ScheduleError>().pipe(
    Match.tag(
      "ScheduleStaleError",
      () => "一覧が更新されています。画面を再読み込みしてください",
    ),
    Match.tag(
      "ScheduleItemNotFoundError",
      () => "対象の区切りが見つかりません。画面を再読み込みしてください",
    ),
    Match.tag(
      "ScheduleDataError",
      () => "試合一覧のデータが壊れています。管理者に連絡してください",
    ),
    Match.tag(
      "ScheduleOrderConflictError",
      () => "並び順が競合しました。もう一度お試しください",
    ),
    Match.tag(
      "UnexpectedScheduleError",
      () => "処理に失敗しました。時間をおいて再度お試しください",
    ),
    Match.exhaustive,
  );
```

Create `src/features/schedule/state.ts`:

```ts
export type ScheduleFormState = {
  error: string | null;
};

export const INITIAL_SCHEDULE_FORM_STATE: ScheduleFormState = {
  error: null,
};

export type ScheduleFormAction = (
  state: ScheduleFormState,
  formData: FormData,
) => Promise<ScheduleFormState>;
```

Create `src/features/schedule/effect-to-form-state.ts`:

```ts
import { Cause, Option } from "effect";
import type { ScheduleError } from "./errors";
import { scheduleErrorMessage } from "./messages";
import type { ScheduleFormState } from "./state";

/**
 * Exit-failure → 日本語文言の変換。4 スライスが使うため、
 * スライスの外（カテゴリ直下）に置く。
 */
export const scheduleErrorFormState = (
  cause: Cause.Cause<ScheduleError>,
): ScheduleFormState => {
  const failure = Cause.failureOption(cause);
  return {
    error: Option.isSome(failure)
      ? scheduleErrorMessage(failure.value)
      : "処理に失敗しました。時間をおいて再度お試しください",
  };
};
```

Create `src/features/schedule/revalidate.ts`:

```ts
import { revalidatePath } from "next/cache";

/**
 * 進行順を変えたあとに再検証すべきページ。4 スライスが同じ 1 本を叩くので、
 * 書き漏らしを防ぐためここへ集約する。
 */
export const revalidateSchedule = (
  slug: string,
  tournamentId: string,
): void => {
  revalidatePath(`/orgs/${slug}/tournaments/${tournamentId}/matches`);
};
```

- [ ] **Step 6: parse のテストを書く**

Create `src/features/schedule/parse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseScheduleItem } from "./parse";

const matchRow = {
  id: "s1",
  kind: "MATCH" as const,
  divisionId: "d1",
  matchId: "m1-0",
  label: null,
  startsAt: null,
};

const dividerRow = {
  id: "s2",
  kind: "DIVIDER" as const,
  divisionId: null,
  matchId: null,
  label: "午前の部",
  startsAt: new Date("2026-09-05T09:00:00Z"),
};

describe("parseScheduleItem", () => {
  it("MATCH 行を判別可能ユニオンに直す", () => {
    expect(parseScheduleItem(matchRow)).toEqual({
      kind: "match",
      id: "s1",
      divisionId: "d1",
      matchId: "m1-0",
    });
  });

  it("DIVIDER 行を判別可能ユニオンに直す", () => {
    expect(parseScheduleItem(dividerRow)).toEqual({
      kind: "divider",
      id: "s2",
      label: "午前の部",
      startsAt: new Date("2026-09-05T09:00:00Z"),
    });
  });

  it("開始予定時刻の無い DIVIDER は null のまま運ぶ", () => {
    expect(parseScheduleItem({ ...dividerRow, startsAt: null })).toEqual({
      kind: "divider",
      id: "s2",
      label: "午前の部",
      startsAt: null,
    });
  });

  it("divisionId の欠けた MATCH 行は落とす", () => {
    expect(parseScheduleItem({ ...matchRow, divisionId: null })).toBeNull();
  });

  it("matchId の欠けた MATCH 行は落とす", () => {
    expect(parseScheduleItem({ ...matchRow, matchId: null })).toBeNull();
  });

  it("label の欠けた DIVIDER 行は落とす", () => {
    expect(parseScheduleItem({ ...dividerRow, label: null })).toBeNull();
  });
});
```

- [ ] **Step 7: テストが落ちることを確かめる**

Run: `pnpm exec vitest run src/features/schedule/parse.test.ts`
Expected: FAIL（`Failed to resolve import "./parse"`）

- [ ] **Step 8: parse を書く**

Create `src/features/schedule/parse.ts`:

```ts
import type { ScheduleItemKind } from "@/generated/prisma/enums";
import type { ScheduleItemRecord } from "./types";

/** parseScheduleItem が受け取る DB の行の形。 */
export type ScheduleItemRow = {
  id: string;
  kind: ScheduleItemKind;
  divisionId: string | null;
  matchId: string | null;
  label: string | null;
  startsAt: Date | null;
};

/**
 * DB の行を判別可能ユニオンに直す。kind と列の組み合わせが壊れている行
 * （MATCH なのに matchId が null など）は null を返して落とす。
 *
 * 列を kind で使い分ける以上、整合はコード側の責務になる。落ちた行は
 * 画面に出ないだけで、次の保存（全行の書き直し）のときに消える。
 */
export const parseScheduleItem = (
  row: ScheduleItemRow,
): ScheduleItemRecord | null => {
  if (row.kind === "MATCH") {
    if (row.divisionId === null || row.matchId === null) {
      return null;
    }
    return {
      kind: "match",
      id: row.id,
      divisionId: row.divisionId,
      matchId: row.matchId,
    };
  }

  if (row.label === null) {
    return null;
  }
  return {
    kind: "divider",
    id: row.id,
    label: row.label,
    startsAt: row.startsAt,
  };
};
```

- [ ] **Step 9: テストが通ることを確かめる**

Run: `pnpm exec vitest run src/features/schedule`
Expected: PASS（parse 6 件 + messages 5 件）

Run: `pnpm typecheck`
Expected: エラー無し

- [ ] **Step 10: Commit**

```bash
git add src/features/schedule
git commit -m "feat(schedule): add types, errors, messages and item parser"
```

---

### Task 4: マージ規則 `buildScheduleView`

**Files:**
- Create: `src/features/schedule/domain.ts`
- Create: `src/features/schedule/domain.test.ts`

**Interfaces:**
- Consumes: Task 2 の `createSlotLabeler` / `matchCardLabel` / `matchPositionLabel`、Task 3 の `types.ts`
- Produces:
  - `matchKey(divisionId: string, matchId: string): string`
  - `dividerKey(id: string): string`
  - `buildScheduleView(divisions: ScheduleDivision[], participants: ScheduleParticipant[], items: ScheduleItemRecord[]): ScheduleRowView[]`
  - `toSaveItems(rows: ScheduleRowView[]): ScheduleSaveItem[]`

- [ ] **Step 1: 失敗するテストを書く**

Create `src/features/schedule/domain.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { MatchingConfig } from "@/lib/division/types";
import { buildScheduleView, dividerKey, matchKey, toSaveItems } from "./domain";
import type { ScheduleDivision, ScheduleItemRecord } from "./types";

const config = (
  entryIds: [string, string],
  numbers: [string, string],
): MatchingConfig => ({
  version: 1,
  matches: [
    {
      id: "m1-0",
      bracket: "winners",
      round: 1,
      order: 0,
      matchNumber: numbers[0],
      slots: [
        { kind: "entry", entryId: entryIds[0] },
        { kind: "entry", entryId: entryIds[1] },
      ],
    },
    {
      id: "m1-1",
      bracket: "winners",
      round: 1,
      order: 1,
      matchNumber: numbers[1],
      slots: [{ kind: "entry", entryId: entryIds[0] }, { kind: "bye" }],
    },
  ],
});

const divisionA: ScheduleDivision = {
  id: "dA",
  name: "男子",
  order: 0,
  entries: {
    version: 1,
    entries: [
      { id: "e1", participantId: "p1", seed: 0 },
      { id: "e2", participantId: "p2", seed: 1 },
    ],
  },
  matchingConfig: config(["e1", "e2"], ["1", "2"]),
};

const divisionB: ScheduleDivision = {
  id: "dB",
  name: "女子",
  order: 1,
  entries: {
    version: 1,
    entries: [
      { id: "f1", participantId: "p3", seed: 0 },
      { id: "f2", participantId: "p4", seed: 1 },
    ],
  },
  matchingConfig: config(["f1", "f2"], ["1", "2"]),
};

const participants = [
  { id: "p1", name: "山田" },
  { id: "p2", name: "佐藤" },
  { id: "p3", name: "鈴木" },
  { id: "p4", name: "田中" },
];

describe("buildScheduleView", () => {
  it("行が 1 件も無ければ部門順 → round → order で全試合を並べる", () => {
    const rows = buildScheduleView([divisionB, divisionA], participants, []);

    expect(rows.map((row) => row.key)).toEqual([
      matchKey("dA", "m1-0"),
      matchKey("dA", "m1-1"),
      matchKey("dB", "m1-0"),
      matchKey("dB", "m1-1"),
    ]);
  });

  it("試合行に部門名・試合番号・位置・対戦カードを載せる", () => {
    const [row] = buildScheduleView([divisionA], participants, []);

    expect(row).toEqual({
      kind: "match",
      key: matchKey("dA", "m1-0"),
      divisionId: "dA",
      divisionName: "男子",
      matchId: "m1-0",
      matchNumber: "1",
      label: "1回戦 第1試合",
      card: "山田 vs 佐藤",
    });
  });

  it("保存された並びを尊重し、区切りも同じ列に混ぜる", () => {
    const items: ScheduleItemRecord[] = [
      { kind: "match", id: "s1", divisionId: "dB", matchId: "m1-0" },
      {
        kind: "divider",
        id: "s2",
        label: "午前の部",
        startsAt: new Date("2026-09-05T09:00:00Z"),
      },
      { kind: "match", id: "s3", divisionId: "dA", matchId: "m1-0" },
    ];

    const rows = buildScheduleView([divisionA, divisionB], participants, items);

    expect(rows.map((row) => row.key)).toEqual([
      matchKey("dB", "m1-0"),
      dividerKey("s2"),
      matchKey("dA", "m1-0"),
      // 行を持たない残りは決定的な順で末尾へ
      matchKey("dA", "m1-1"),
      matchKey("dB", "m1-1"),
    ]);
    expect(rows[1]).toEqual({
      kind: "divider",
      key: dividerKey("s2"),
      id: "s2",
      label: "午前の部",
      startsAt: new Date("2026-09-05T09:00:00Z"),
    });
  });

  it("実在しない試合を指す行は落とす", () => {
    const items: ScheduleItemRecord[] = [
      { kind: "match", id: "s1", divisionId: "dA", matchId: "消えた試合" },
      { kind: "match", id: "s2", divisionId: "消えた部門", matchId: "m1-0" },
    ];

    const rows = buildScheduleView([divisionA], participants, items);

    expect(rows.map((row) => row.key)).toEqual([
      matchKey("dA", "m1-0"),
      matchKey("dA", "m1-1"),
    ]);
  });

  it("同じ試合を指す行が重複していても 1 行にする", () => {
    const items: ScheduleItemRecord[] = [
      { kind: "match", id: "s1", divisionId: "dA", matchId: "m1-1" },
      { kind: "match", id: "s2", divisionId: "dA", matchId: "m1-1" },
    ];

    const rows = buildScheduleView([divisionA], participants, items);

    expect(rows.map((row) => row.key)).toEqual([
      matchKey("dA", "m1-1"),
      matchKey("dA", "m1-0"),
    ]);
  });
});

describe("toSaveItems", () => {
  it("表示行を保存用の形に落とす", () => {
    const rows = buildScheduleView([divisionA], participants, [
      { kind: "divider", id: "s2", label: "午前の部", startsAt: null },
    ]);

    expect(toSaveItems(rows)).toEqual([
      { kind: "divider", id: "s2", label: "午前の部", startsAt: null },
      { kind: "match", divisionId: "dA", matchId: "m1-0" },
      { kind: "match", divisionId: "dA", matchId: "m1-1" },
    ]);
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `pnpm exec vitest run src/features/schedule/domain.test.ts`
Expected: FAIL（`Failed to resolve import "./domain"`）

- [ ] **Step 3: 実装する**

Create `src/features/schedule/domain.ts`:

```ts
import {
  createSlotLabeler,
  matchCardLabel,
  matchPositionLabel,
} from "@/lib/division/label";
import type {
  ScheduleDivision,
  ScheduleItemRecord,
  ScheduleParticipant,
  ScheduleRowView,
  ScheduleSaveItem,
} from "./types";

/** 試合行を指すキー。ScheduleItem.id ではなく実体の座標で作る。 */
export const matchKey = (divisionId: string, matchId: string): string =>
  `match:${divisionId}:${matchId}`;

/** 区切り行を指すキー。 */
export const dividerKey = (id: string): string => `divider:${id}`;

/**
 * 全部門の試合を、部門の order 昇順 → round 昇順 → order 昇順で並べた行にする。
 * 行を持たない試合を末尾へ足すときの「決定的な順」がこれで、
 * 保存の有無にかかわらず同じ入力からは同じ並びになる。
 */
const buildMatchRows = (
  divisions: ScheduleDivision[],
  participants: ScheduleParticipant[],
): ScheduleRowView[] =>
  [...divisions]
    .sort((left, right) => left.order - right.order)
    .flatMap((division) => {
      const labelSlot = createSlotLabeler(
        division.matchingConfig,
        division.entries,
        participants,
      );

      return [...division.matchingConfig.matches]
        .sort(
          (left, right) => left.round - right.round || left.order - right.order,
        )
        .map(
          (match): ScheduleRowView => ({
            kind: "match",
            key: matchKey(division.id, match.id),
            divisionId: division.id,
            divisionName: division.name,
            matchId: match.id,
            matchNumber: match.matchNumber,
            label: matchPositionLabel(match),
            card: matchCardLabel(match, labelSlot),
          }),
        );
    });

/**
 * 保存された並びと実体をマージして一覧の行を作る。
 *
 * 試合の実体は Division.matchingConfig の中にあり、ScheduleItem は文字列 id で
 * それを指すだけなので、行と実体は必ずずれうる（組み合わせの再生成、部門の削除、
 * 新しい部門の組み合わせ）。ここで吸収して画面が壊れないようにする。
 * DB の掃除はしない。読み出しは副作用を持たず、次の保存で全行を書き直すときに
 * まとめて片付く。
 */
export const buildScheduleView = (
  divisions: ScheduleDivision[],
  participants: ScheduleParticipant[],
  items: ScheduleItemRecord[],
): ScheduleRowView[] => {
  const matchRows = buildMatchRows(divisions, participants);
  const byKey = new Map(matchRows.map((row) => [row.key, row]));
  const placed = new Set<string>();
  const rows: ScheduleRowView[] = [];

  for (const item of items) {
    if (item.kind === "divider") {
      rows.push({
        kind: "divider",
        key: dividerKey(item.id),
        id: item.id,
        label: item.label,
        startsAt: item.startsAt,
      });
      continue;
    }

    const key = matchKey(item.divisionId, item.matchId);
    const row = byKey.get(key);
    // 実体の無い行は落とす。重複した行も 2 度は並べない。
    if (row === undefined || placed.has(key)) {
      continue;
    }
    placed.add(key);
    rows.push(row);
  }

  for (const row of matchRows) {
    if (!placed.has(row.key)) {
      rows.push(row);
    }
  }

  return rows;
};

/** 表示行を保存用の形に落とす。order は保存時に 0..n-1 で振り直すので持たない。 */
export const toSaveItems = (rows: ScheduleRowView[]): ScheduleSaveItem[] =>
  rows.map((row) =>
    row.kind === "divider"
      ? {
          kind: "divider",
          id: row.id,
          label: row.label,
          startsAt: row.startsAt,
        }
      : { kind: "match", divisionId: row.divisionId, matchId: row.matchId },
  );
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `pnpm exec vitest run src/features/schedule/domain.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5: Commit**

```bash
git add src/features/schedule/domain.ts src/features/schedule/domain.test.ts
git commit -m "feat(schedule): merge saved order with live matches"
```

---

### Task 5: 並びの変形（reorder / insert / update / remove）

**Files:**
- Modify: `src/features/schedule/domain.ts`（末尾に定数 1 つと純粋関数 4 つを追加）
- Create: `src/features/schedule/transform.test.ts`

**Interfaces:**
- Consumes: Task 4 の `ScheduleRowView` / `dividerKey`
- Produces（いずれも「対象が無い / 集合が一致しない」ときは `null` を返す。エラーへの写像はスライスの責務）:
  - `HEAD_ANCHOR_KEY = ""`
  - `reorderRows(rows: ScheduleRowView[], keys: string[]): ScheduleRowView[] | null`
  - `insertDividerAfter(rows: ScheduleRowView[], anchorKey: string, divider: { id: string; label: string; startsAt: Date | null }): ScheduleRowView[] | null`
  - `updateDividerRow(rows: ScheduleRowView[], id: string, label: string, startsAt: Date | null): ScheduleRowView[] | null`
  - `removeDividerRow(rows: ScheduleRowView[], id: string): ScheduleRowView[] | null`

- [ ] **Step 1: 失敗するテストを書く**

Create `src/features/schedule/transform.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  dividerKey,
  HEAD_ANCHOR_KEY,
  insertDividerAfter,
  removeDividerRow,
  reorderRows,
  updateDividerRow,
} from "./domain";
import type { ScheduleRowView } from "./types";

const match = (divisionId: string, matchId: string): ScheduleRowView => ({
  kind: "match",
  key: `match:${divisionId}:${matchId}`,
  divisionId,
  divisionName: "男子",
  matchId,
  matchNumber: "1",
  label: "1回戦 第1試合",
  card: "山田 vs 佐藤",
});

const divider = (id: string): ScheduleRowView => ({
  kind: "divider",
  key: dividerKey(id),
  id,
  label: "午前の部",
  startsAt: null,
});

const rows = [match("dA", "m1-0"), divider("s1"), match("dA", "m1-1")];
const keys = rows.map((row) => row.key);

describe("reorderRows", () => {
  it("送られたキー順に並べ替える", () => {
    const next = reorderRows(rows, [keys[2], keys[0], keys[1]]);
    expect(next?.map((row) => row.key)).toEqual([keys[2], keys[0], keys[1]]);
  });

  it("キーが足りなければ null", () => {
    expect(reorderRows(rows, [keys[0], keys[1]])).toBeNull();
  });

  it("知らないキーが混じっていれば null", () => {
    expect(reorderRows(rows, [keys[0], keys[1], "match:dZ:m9-9"])).toBeNull();
  });

  it("同じキーが 2 度来たら null", () => {
    expect(reorderRows(rows, [keys[0], keys[0], keys[1]])).toBeNull();
  });
});

describe("insertDividerAfter", () => {
  const fresh = { id: "s9", label: "区切り", startsAt: null };

  it("アンカーの直後に挿す", () => {
    const next = insertDividerAfter(rows, keys[0], fresh);
    expect(next?.map((row) => row.key)).toEqual([
      keys[0],
      dividerKey("s9"),
      keys[1],
      keys[2],
    ]);
  });

  it("空文字のアンカーは先頭に挿す", () => {
    const next = insertDividerAfter(rows, HEAD_ANCHOR_KEY, fresh);
    expect(next?.map((row) => row.key)).toEqual([dividerKey("s9"), ...keys]);
  });

  it("知らないアンカーは null", () => {
    expect(insertDividerAfter(rows, "match:dZ:m9-9", fresh)).toBeNull();
  });
});

describe("updateDividerRow", () => {
  it("ラベルと開始予定時刻を差し替える", () => {
    const at = new Date("2026-09-05T09:00:00Z");
    const next = updateDividerRow(rows, "s1", "午後の部", at);
    expect(next?.[1]).toEqual({
      kind: "divider",
      key: dividerKey("s1"),
      id: "s1",
      label: "午後の部",
      startsAt: at,
    });
  });

  it("知らない id は null", () => {
    expect(updateDividerRow(rows, "s9", "午後の部", null)).toBeNull();
  });
});

describe("removeDividerRow", () => {
  it("対象の区切りを取り除く", () => {
    const next = removeDividerRow(rows, "s1");
    expect(next?.map((row) => row.key)).toEqual([keys[0], keys[2]]);
  });

  it("知らない id は null", () => {
    expect(removeDividerRow(rows, "s9")).toBeNull();
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `pnpm exec vitest run src/features/schedule/transform.test.ts`
Expected: FAIL（`reorderRows is not a function` など）

- [ ] **Step 3: `domain.ts` の末尾に追記する**

```ts
/** 「先頭に挿す」を表すアンカー。画面の hidden input が空文字を送ってくる。 */
export const HEAD_ANCHOR_KEY = "";

/**
 * 送られたキー順に並べ替える。キーの集合が現在の一覧と完全に一致しない場合は
 * null を返す。この一致確認が同時編集に対する防波堤で、別の誰かが組み合わせを
 * 作り直したり区切りを増やしたりしていれば、その並びは受け付けない。
 */
export const reorderRows = (
  rows: ScheduleRowView[],
  keys: string[],
): ScheduleRowView[] | null => {
  if (keys.length !== rows.length) {
    return null;
  }

  const byKey = new Map(rows.map((row) => [row.key, row]));
  const next: ScheduleRowView[] = [];
  const seen = new Set<string>();

  for (const key of keys) {
    const row = byKey.get(key);
    // 知らないキーと、同じキーの二重指定を弾く。長さが同じでも
    // 集合として一致するとは限らないため、両方を見る必要がある。
    if (row === undefined || seen.has(key)) {
      return null;
    }
    seen.add(key);
    next.push(row);
  }

  return next;
};

/**
 * anchorKey の行の直後に区切りを挿す。HEAD_ANCHOR_KEY なら先頭。
 * id は呼び出し側（repository）が採番して渡す。ここを純粋に保つため。
 */
export const insertDividerAfter = (
  rows: ScheduleRowView[],
  anchorKey: string,
  divider: { id: string; label: string; startsAt: Date | null },
): ScheduleRowView[] | null => {
  const row: ScheduleRowView = {
    kind: "divider",
    key: dividerKey(divider.id),
    id: divider.id,
    label: divider.label,
    startsAt: divider.startsAt,
  };

  if (anchorKey === HEAD_ANCHOR_KEY) {
    return [row, ...rows];
  }

  const index = rows.findIndex((current) => current.key === anchorKey);
  if (index === -1) {
    return null;
  }

  return [...rows.slice(0, index + 1), row, ...rows.slice(index + 1)];
};

/** 区切りのラベルと開始予定時刻を差し替える。対象が無ければ null。 */
export const updateDividerRow = (
  rows: ScheduleRowView[],
  id: string,
  label: string,
  startsAt: Date | null,
): ScheduleRowView[] | null => {
  const index = rows.findIndex((row) => row.kind === "divider" && row.id === id);
  if (index === -1) {
    return null;
  }

  const next = [...rows];
  next[index] = {
    kind: "divider",
    key: dividerKey(id),
    id,
    label,
    startsAt,
  };
  return next;
};

/** 区切りを取り除く。対象が無ければ null。 */
export const removeDividerRow = (
  rows: ScheduleRowView[],
  id: string,
): ScheduleRowView[] | null => {
  const index = rows.findIndex((row) => row.kind === "divider" && row.id === id);
  if (index === -1) {
    return null;
  }

  return [...rows.slice(0, index), ...rows.slice(index + 1)];
};
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `pnpm exec vitest run src/features/schedule`
Expected: PASS（transform 11 件を含め全件）

Run: `pnpm typecheck`
Expected: エラー無し

- [ ] **Step 5: Commit**

```bash
git add src/features/schedule/domain.ts src/features/schedule/transform.test.ts
git commit -m "feat(schedule): add pure transforms for reorder and dividers"
```

---
### Task 6: repository（読み出し）と schedule-store（read-modify-write）

**Files:**
- Create: `src/features/schedule/repository.ts`
- Create: `src/features/schedule/repository.test.ts`
- Create: `src/features/schedule/schedule-store.ts`
- Create: `src/features/schedule/schedule-store.test.ts`

**Interfaces:**
- Consumes: Task 3・4 のすべて
- Produces:
  - `readScheduleRows(reader, organizationId: string, tournamentId: string): Promise<ScheduleRowView[]>`
  - `loadScheduleView(organizationId: string, tournamentId: string): Promise<ScheduleRowView[]>`（ページ用）
  - `type ScheduleIds = { organizationId: string; tournamentId: string }`
  - `type ScheduleOutcome<T> = { found: false } | { found: true; value: T }`
  - `runSchedule<T>(ids: ScheduleIds, mutate: (rows: ScheduleRowView[]) => { next: ScheduleRowView[] | null; value: T }): Effect.Effect<ScheduleOutcome<T>, ScheduleError>`

- [ ] **Step 1: repository のテストを書く**

Create `src/features/schedule/repository.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const divisionFindMany = vi.fn();
const participantFindMany = vi.fn();
const scheduleItemFindMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    division: { findMany: (args: unknown) => divisionFindMany(args) },
    participant: { findMany: (args: unknown) => participantFindMany(args) },
    scheduleItem: { findMany: (args: unknown) => scheduleItemFindMany(args) },
  },
}));

const { loadScheduleView } = await import("./repository");

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
  ],
};

const entries = {
  version: 1,
  entries: [
    { id: "e1", participantId: "p1", seed: 0 },
    { id: "e2", participantId: "p2", seed: 1 },
  ],
};

beforeEach(() => {
  divisionFindMany.mockReset();
  participantFindMany.mockReset();
  scheduleItemFindMany.mockReset();
  divisionFindMany.mockResolvedValue([
    { id: "dA", name: "男子", order: 0, entries, matchingConfig },
  ]);
  participantFindMany.mockResolvedValue([
    { id: "p1", member: { name: "山田" } },
    { id: "p2", member: { name: "佐藤" } },
  ]);
  scheduleItemFindMany.mockResolvedValue([]);
});

describe("loadScheduleView", () => {
  it("3 つのクエリすべてに所有条件を入れる", async () => {
    await loadScheduleView("o1", "t1");

    expect(divisionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournament: { id: "t1", organizationId: "o1" } },
      }),
    );
    expect(participantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournament: { id: "t1", organizationId: "o1" } },
      }),
    );
    expect(scheduleItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournament: { id: "t1", organizationId: "o1" } },
        orderBy: { order: "asc" },
      }),
    );
  });

  it("参加者名を解決した行を返す", async () => {
    const rows = await loadScheduleView("o1", "t1");

    expect(rows).toEqual([
      {
        kind: "match",
        key: "match:dA:m1-0",
        divisionId: "dA",
        divisionName: "男子",
        matchId: "m1-0",
        matchNumber: "1",
        label: "1回戦 第1試合",
        card: "山田 vs 佐藤",
      },
    ]);
  });

  it("壊れた ScheduleItem 行は落とす", async () => {
    scheduleItemFindMany.mockResolvedValue([
      {
        id: "s1",
        kind: "MATCH",
        divisionId: null,
        matchId: null,
        label: null,
        startsAt: null,
      },
    ]);

    const rows = await loadScheduleView("o1", "t1");

    expect(rows.map((row) => row.key)).toEqual(["match:dA:m1-0"]);
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `pnpm exec vitest run src/features/schedule/repository.test.ts`
Expected: FAIL（`Failed to resolve import "./repository"`）

- [ ] **Step 3: repository を書く**

Create `src/features/schedule/repository.ts`:

```ts
import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import {
  parseDivisionEntries,
  parseMatchingConfig,
} from "@/lib/division/parse";
import { prisma } from "@/shared/db/prisma";
import { buildScheduleView } from "./domain";
import { parseScheduleItem } from "./parse";
import type {
  ScheduleDivision,
  ScheduleItemRecord,
  ScheduleParticipant,
  ScheduleRowView,
} from "./types";

/** トランザクションの中でも外でも同じ読み出しを使えるようにする。 */
type ScheduleReader = Pick<
  Prisma.TransactionClient,
  "division" | "participant" | "scheduleItem"
>;

/**
 * 所有権は 3 本のクエリすべての where にリレーションフィルタで入れる。
 * 取得してから条件で弾く形にすると、書き忘れがそのまま穴になる。
 */
const ownership = (organizationId: string, tournamentId: string) => ({
  tournament: { id: tournamentId, organizationId },
});

const loadDivisions = async (
  reader: ScheduleReader,
  organizationId: string,
  tournamentId: string,
): Promise<ScheduleDivision[]> => {
  const rows = await reader.division.findMany({
    where: ownership(organizationId, tournamentId),
    select: {
      id: true,
      name: true,
      order: true,
      entries: true,
      matchingConfig: true,
    },
  });

  // Json のパースはここで済ませ、domain は検証済みの形だけを扱う純粋関数に保つ。
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    order: row.order,
    entries: parseDivisionEntries(row.entries),
    matchingConfig: parseMatchingConfig(row.matchingConfig),
  }));
};

const loadParticipants = async (
  reader: ScheduleReader,
  organizationId: string,
  tournamentId: string,
): Promise<ScheduleParticipant[]> => {
  const rows = await reader.participant.findMany({
    where: ownership(organizationId, tournamentId),
    select: { id: true, member: { select: { name: true } } },
  });

  return rows.map((row) => ({ id: row.id, name: row.member.name }));
};

const loadItems = async (
  reader: ScheduleReader,
  organizationId: string,
  tournamentId: string,
): Promise<ScheduleItemRecord[]> => {
  const rows = await reader.scheduleItem.findMany({
    where: ownership(organizationId, tournamentId),
    orderBy: { order: "asc" },
    select: {
      id: true,
      kind: true,
      divisionId: true,
      matchId: true,
      label: true,
      startsAt: true,
    },
  });

  return rows.flatMap((row) => {
    const parsed = parseScheduleItem(row);
    return parsed === null ? [] : [parsed];
  });
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
  const [divisions, participants, items] = await Promise.all([
    loadDivisions(reader, organizationId, tournamentId),
    loadParticipants(reader, organizationId, tournamentId),
    loadItems(reader, organizationId, tournamentId),
  ]);

  return buildScheduleView(divisions, participants, items);
};

/** ページから呼ぶ読み出し。 */
export const loadScheduleView = (
  organizationId: string,
  tournamentId: string,
): Promise<ScheduleRowView[]> =>
  readScheduleRows(prisma, organizationId, tournamentId);
```

- [ ] **Step 4: repository のテストが通ることを確かめる**

Run: `pnpm exec vitest run src/features/schedule/repository.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 5: schedule-store のテストを書く**

Create `src/features/schedule/schedule-store.test.ts`:

```ts
import { Cause, Effect, Exit, Option } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tournamentFindFirst = vi.fn();
const divisionFindMany = vi.fn();
const participantFindMany = vi.fn();
const scheduleItemFindMany = vi.fn();
const scheduleItemDeleteMany = vi.fn();
const scheduleItemCreateMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (run: (tx: unknown) => Promise<unknown>) =>
      run({
        tournament: { findFirst: (args: unknown) => tournamentFindFirst(args) },
        division: { findMany: (args: unknown) => divisionFindMany(args) },
        participant: { findMany: (args: unknown) => participantFindMany(args) },
        scheduleItem: {
          findMany: (args: unknown) => scheduleItemFindMany(args),
          deleteMany: (args: unknown) => scheduleItemDeleteMany(args),
          createMany: (args: unknown) => scheduleItemCreateMany(args),
        },
      }),
  },
}));

const { runSchedule } = await import("./schedule-store");
const { ScheduleStaleError } = await import("./errors");

const ids = { organizationId: "o1", tournamentId: "t1" };

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
  ],
};

const entries = {
  version: 1,
  entries: [
    { id: "e1", participantId: "p1", seed: 0 },
    { id: "e2", participantId: "p2", seed: 1 },
  ],
};

beforeEach(() => {
  tournamentFindFirst.mockReset();
  divisionFindMany.mockReset();
  participantFindMany.mockReset();
  scheduleItemFindMany.mockReset();
  scheduleItemDeleteMany.mockReset();
  scheduleItemCreateMany.mockReset();
  tournamentFindFirst.mockResolvedValue({ id: "t1" });
  divisionFindMany.mockResolvedValue([
    { id: "dA", name: "男子", order: 0, entries, matchingConfig },
  ]);
  participantFindMany.mockResolvedValue([
    { id: "p1", member: { name: "山田" } },
    { id: "p2", member: { name: "佐藤" } },
  ]);
  scheduleItemFindMany.mockResolvedValue([]);
  scheduleItemDeleteMany.mockResolvedValue({ count: 0 });
  scheduleItemCreateMany.mockResolvedValue({ count: 1 });
});

describe("runSchedule", () => {
  it("大会の所有権を where に入れて確かめる", async () => {
    await Effect.runPromise(
      runSchedule(ids, (rows) => ({ next: rows, value: null })),
    );

    expect(tournamentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "t1", organizationId: "o1" } }),
    );
  });

  it("大会が無ければ found: false にする", async () => {
    tournamentFindFirst.mockResolvedValue(null);

    const outcome = await Effect.runPromise(
      runSchedule(ids, (rows) => ({ next: rows, value: null })),
    );

    expect(outcome).toEqual({ found: false });
    expect(scheduleItemDeleteMany).not.toHaveBeenCalled();
  });

  it("全行を消してから 0 始まりで振り直す", async () => {
    await Effect.runPromise(
      runSchedule(ids, (rows) => ({
        next: [
          {
            kind: "divider",
            key: "divider:s9",
            id: "s9",
            label: "午前の部",
            startsAt: null,
          },
          ...rows,
        ],
        value: null,
      })),
    );

    expect(scheduleItemDeleteMany).toHaveBeenCalledWith({
      where: { tournamentId: "t1" },
    });
    const created = scheduleItemCreateMany.mock.calls[0][0].data;
    expect(created).toEqual([
      {
        id: "s9",
        tournamentId: "t1",
        order: 0,
        kind: "DIVIDER",
        divisionId: null,
        matchId: null,
        label: "午前の部",
        startsAt: null,
      },
      {
        id: expect.any(String),
        tournamentId: "t1",
        order: 1,
        kind: "MATCH",
        divisionId: "dA",
        matchId: "m1-0",
        label: null,
        startsAt: null,
      },
    ]);
  });

  it("next が null なら何も書かない", async () => {
    const outcome = await Effect.runPromise(
      runSchedule(ids, () => ({ next: null, value: "そのまま" })),
    );

    expect(outcome).toEqual({ found: true, value: "そのまま" });
    expect(scheduleItemDeleteMany).not.toHaveBeenCalled();
    expect(scheduleItemCreateMany).not.toHaveBeenCalled();
  });

  it("mutate が投げたドメインエラーはそのまま通す", async () => {
    const exit = await Effect.runPromiseExit(
      runSchedule(ids, () => {
        throw new ScheduleStaleError({ tournamentId: "t1" });
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      expect(Option.isSome(failure)).toBe(true);
      if (Option.isSome(failure)) {
        expect(failure.value._tag).toBe("ScheduleStaleError");
      }
    }
  });
});
```

- [ ] **Step 6: テストが落ちることを確かめる**

Run: `pnpm exec vitest run src/features/schedule/schedule-store.test.ts`
Expected: FAIL（`Failed to resolve import "./schedule-store"`）

- [ ] **Step 7: schedule-store を書く**

Create `src/features/schedule/schedule-store.ts`:

```ts
import "server-only";
import { randomUUID } from "node:crypto";
import { Effect } from "effect";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/shared/db/prisma";
import { toSaveItems } from "./domain";
import { type ScheduleError, toScheduleError } from "./errors";
import { readScheduleRows } from "./repository";
import type { ScheduleRowView } from "./types";

/** 2 段の所有権を表す組。4 スライスがこの形で受け渡す。 */
export type ScheduleIds = {
  organizationId: string;
  tournamentId: string;
};

/** found: false は「この組織にこの大会が無い」。呼び出し側は notFound() へ倒す。 */
export type ScheduleOutcome<T> = { found: false } | { found: true; value: T };

/**
 * 並びを書き戻す。order の unique 制約があるため 1 行ずつ動かすと退避が要るが、
 * 全行を消してから 0..n-1 で作り直せば、同じトランザクションの中で
 * 古い行はすでに消えているので衝突しない。1 大会の行数はたかだか数百で、
 * 1 操作あたり全行書き換えのコストは受け入れる。
 *
 * 区切りの id は引き継ぐ。行が作り直されても、画面が持っている
 * divider:{id} のキーが指し続けられるようにするため。
 */
const save = async (
  tx: Prisma.TransactionClient,
  tournamentId: string,
  rows: ScheduleRowView[],
): Promise<void> => {
  await tx.scheduleItem.deleteMany({ where: { tournamentId } });

  const data = toSaveItems(rows).map((item, index) =>
    item.kind === "divider"
      ? {
          id: item.id,
          tournamentId,
          order: index,
          kind: "DIVIDER" as const,
          divisionId: null,
          matchId: null,
          label: item.label,
          startsAt: item.startsAt,
        }
      : {
          id: randomUUID(),
          tournamentId,
          order: index,
          kind: "MATCH" as const,
          divisionId: item.divisionId,
          matchId: item.matchId,
          label: null,
          startsAt: null,
        },
  );

  if (data.length > 0) {
    await tx.scheduleItem.createMany({ data });
  }
};

/**
 * 読み → マージ → 変形 → 書き戻しを 1 つのトランザクションで回す。
 * 4 つのスライスが共有し、スライス側は「行配列をどう変えるか」だけを書く。
 *
 * mutate は同期関数でよい（どのスライスも tx を必要としない）。
 * 対象が見つからない・並びが一致しないといった判断は mutate の中で
 * ScheduleError を throw して表す。toScheduleError がそのまま通す。
 *
 * next: null のときは書き込まない。
 */
export const runSchedule = <T>(
  ids: ScheduleIds,
  mutate: (rows: ScheduleRowView[]) => {
    next: ScheduleRowView[] | null;
    value: T;
  },
): Effect.Effect<ScheduleOutcome<T>, ScheduleError> =>
  Effect.tryPromise({
    try: () =>
      prisma.$transaction(async (tx): Promise<ScheduleOutcome<T>> => {
        // 所有権つきの存在確認。ここで倒しておけば、以降の読み出しが
        // 空配列を返しただけの場合と「大会が無い」場合を取り違えない。
        const tournament = await tx.tournament.findFirst({
          where: { id: ids.tournamentId, organizationId: ids.organizationId },
          select: { id: true },
        });
        if (!tournament) {
          return { found: false };
        }

        const rows = await readScheduleRows(
          tx,
          ids.organizationId,
          ids.tournamentId,
        );
        const { next, value } = mutate(rows);
        if (next !== null) {
          await save(tx, ids.tournamentId, next);
        }
        return { found: true, value };
      }),
    catch: (reason) => toScheduleError(reason, ids.tournamentId),
  });
```

- [ ] **Step 8: テストが通ることを確かめる**

Run: `pnpm exec vitest run src/features/schedule`
Expected: PASS（store 5 件を含め全件）

Run: `pnpm typecheck`
Expected: エラー無し

- [ ] **Step 9: Commit**

```bash
git add src/features/schedule/repository.ts src/features/schedule/repository.test.ts src/features/schedule/schedule-store.ts src/features/schedule/schedule-store.test.ts
git commit -m "feat(schedule): add ownership-scoped reader and transaction store"
```

---

### Task 7: reorder スライス

**Files:**
- Create: `src/features/schedule/reorder/schema.ts`
- Create: `src/features/schedule/reorder/repository.ts`
- Create: `src/features/schedule/reorder/usecase.ts`
- Create: `src/features/schedule/reorder/handler.ts`
- Create: `src/features/schedule/reorder/repository.test.ts`
- Create: `src/features/schedule/reorder/handler.test.ts`

**Interfaces:**
- Consumes: Task 5 の `reorderRows`、Task 6 の `runSchedule` / `ScheduleIds` / `ScheduleOutcome`
- Produces: `reorderScheduleAction: ScheduleFormAction`（`"use server"`）。FormData のキーは `slug` / `tournamentId` / `key`（行数ぶん `append` する）。

- [ ] **Step 1: schema を書く**

Create `src/features/schedule/reorder/schema.ts`:

```ts
import { z } from "zod";

export const reorderScheduleSchema = z.object({
  keys: z.array(z.string().min(1, "並び順が不正です")).min(1, "並び順が不正です"),
});

export type ReorderScheduleInput = z.infer<typeof reorderScheduleSchema>;
```

- [ ] **Step 2: repository のテストを書く**

Create `src/features/schedule/reorder/repository.test.ts`:

```ts
import { Cause, Effect, Exit, Option } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleRowView } from "../types";

const runSchedule = vi.fn();

vi.mock("../schedule-store", () => ({
  runSchedule: (ids: unknown, mutate: unknown) => runSchedule(ids, mutate),
}));

const { reorderScheduleInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1" };

const rows: ScheduleRowView[] = [
  {
    kind: "match",
    key: "match:dA:m1-0",
    divisionId: "dA",
    divisionName: "男子",
    matchId: "m1-0",
    matchNumber: "1",
    label: "1回戦 第1試合",
    card: "山田 vs 佐藤",
  },
  {
    kind: "divider",
    key: "divider:s1",
    id: "s1",
    label: "午前の部",
    startsAt: null,
  },
];

/** runSchedule に渡された mutate を、上の行に対して実行する。 */
const applyMutate = (): {
  next: ScheduleRowView[] | null;
  value: null;
} => {
  const mutate = runSchedule.mock.calls[0][1] as (
    rows: ScheduleRowView[],
  ) => { next: ScheduleRowView[] | null; value: null };
  return mutate(rows);
};

beforeEach(() => {
  runSchedule.mockReset();
  runSchedule.mockReturnValue(Effect.succeed({ found: true, value: null }));
});

describe("reorderScheduleInDb", () => {
  it("所有権の組をそのまま store へ渡す", async () => {
    await Effect.runPromise(
      reorderScheduleInDb(ids, { keys: ["divider:s1", "match:dA:m1-0"] }),
    );

    expect(runSchedule.mock.calls[0][0]).toEqual(ids);
  });

  it("送られたキー順に並べ替える", async () => {
    await Effect.runPromise(
      reorderScheduleInDb(ids, { keys: ["divider:s1", "match:dA:m1-0"] }),
    );

    expect(applyMutate().next?.map((row) => row.key)).toEqual([
      "divider:s1",
      "match:dA:m1-0",
    ]);
  });

  it("キー集合が一致しなければ ScheduleStaleError を投げる", async () => {
    await Effect.runPromise(
      reorderScheduleInDb(ids, { keys: ["match:dA:m1-0"] }),
    );

    expect(() => applyMutate()).toThrowError(
      expect.objectContaining({ _tag: "ScheduleStaleError" }),
    );
  });

  it("store のエラーはそのまま伝わる", async () => {
    const { ScheduleStaleError } = await import("../errors");
    runSchedule.mockReturnValue(
      Effect.fail(new ScheduleStaleError({ tournamentId: "t1" })),
    );

    const exit = await Effect.runPromiseExit(
      reorderScheduleInDb(ids, { keys: ["match:dA:m1-0"] }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      expect(Option.isSome(failure)).toBe(true);
      if (Option.isSome(failure)) {
        expect(failure.value._tag).toBe("ScheduleStaleError");
      }
    }
  });
});
```

- [ ] **Step 3: テストが落ちることを確かめる**

Run: `pnpm exec vitest run src/features/schedule/reorder/repository.test.ts`
Expected: FAIL（`Failed to resolve import "./repository"`）

- [ ] **Step 4: repository と usecase を書く**

Create `src/features/schedule/reorder/repository.ts`:

```ts
import "server-only";
import type { Effect } from "effect";
import { reorderRows } from "../domain";
import { type ScheduleError, ScheduleStaleError } from "../errors";
import {
  runSchedule,
  type ScheduleIds,
  type ScheduleOutcome,
} from "../schedule-store";
import type { ReorderScheduleInput } from "./schema";

export type ReorderSchedulePort = (
  ids: ScheduleIds,
  input: ReorderScheduleInput,
) => Effect.Effect<ScheduleOutcome<null>, ScheduleError>;

/**
 * 送られたキー順に並べ替える。キー集合が現在の一覧と一致しない場合は
 * 受け付けない。別の誰かが組み合わせを作り直した・区切りを増やした場合に
 * 起きるので、画面の再読み込みを促す。この確認自体が同時編集の防波堤で、
 * リビジョン列は持たない。
 */
export const reorderScheduleInDb: ReorderSchedulePort = (ids, input) =>
  runSchedule(ids, (rows) => {
    const next = reorderRows(rows, input.keys);
    if (next === null) {
      throw new ScheduleStaleError({ tournamentId: ids.tournamentId });
    }
    return { next, value: null };
  });
```

Create `src/features/schedule/reorder/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { ScheduleError } from "../errors";
import type { ScheduleIds, ScheduleOutcome } from "../schedule-store";
import type { ReorderSchedulePort } from "./repository";
import type { ReorderScheduleInput } from "./schema";

export const reorderSchedule = (
  port: ReorderSchedulePort,
  ids: ScheduleIds,
  input: ReorderScheduleInput,
): Effect.Effect<ScheduleOutcome<null>, ScheduleError> => port(ids, input);
```

- [ ] **Step 5: repository のテストが通ることを確かめる**

Run: `pnpm exec vitest run src/features/schedule/reorder/repository.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 6: handler のテストを書く**

Create `src/features/schedule/reorder/handler.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_SCHEDULE_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const reorderScheduleInDb = vi.fn();
const revalidateSchedule = vi.fn();
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
  revalidateSchedule: (slug: string, tournamentId: string) =>
    revalidateSchedule(slug, tournamentId),
}));
vi.mock("./repository", () => ({
  reorderScheduleInDb: (ids: unknown, input: unknown) => {
    calls.push("reorderScheduleInDb");
    return reorderScheduleInDb(ids, input);
  },
}));

const { reorderScheduleAction } = await import("./handler");

const formData = (keys: string[]) => {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("tournamentId", "t1");
  for (const key of keys) {
    data.append("key", key);
  }
  return data;
};

beforeEach(() => {
  calls = [];
  requireOrganization.mockReset();
  reorderScheduleInDb.mockReset();
  revalidateSchedule.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({ organization: { id: "o1" } });
  reorderScheduleInDb.mockReturnValue(
    Effect.succeed({ found: true, value: null }),
  );
});

describe("reorderScheduleAction", () => {
  it("認可を独立に確かめ、キー配列をポートへ渡す", async () => {
    await reorderScheduleAction(
      INITIAL_SCHEDULE_FORM_STATE,
      formData(["divider:s1", "match:dA:m1-0"]),
    );

    expect(requireOrganization).toHaveBeenCalledWith("acme");
    expect(reorderScheduleInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1" },
      { keys: ["divider:s1", "match:dA:m1-0"] },
    );
    // データベース処理よりも前に認可チェックが必ず実行されることを確認
    expect(calls).toEqual(["requireOrganization", "reorderScheduleInDb"]);
  });

  it("成功したら再検証する", async () => {
    const state = await reorderScheduleAction(
      INITIAL_SCHEDULE_FORM_STATE,
      formData(["match:dA:m1-0"]),
    );

    expect(revalidateSchedule).toHaveBeenCalledWith("acme", "t1");
    expect(state.error).toBeNull();
  });

  it("キーが 1 件も無ければ入力エラーにする", async () => {
    const state = await reorderScheduleAction(
      INITIAL_SCHEDULE_FORM_STATE,
      formData([]),
    );

    expect(state.error).toBe("並び順が不正です");
    expect(reorderScheduleInDb).not.toHaveBeenCalled();
  });

  it("並びがずれていたら再読み込みを促す", async () => {
    const { ScheduleStaleError } = await import("../errors");
    reorderScheduleInDb.mockReturnValue(
      Effect.fail(new ScheduleStaleError({ tournamentId: "t1" })),
    );

    const state = await reorderScheduleAction(
      INITIAL_SCHEDULE_FORM_STATE,
      formData(["match:dA:m1-0"]),
    );

    expect(state.error).toBe(
      "一覧が更新されています。画面を再読み込みしてください",
    );
  });

  it("大会が無ければ 404 にする", async () => {
    reorderScheduleInDb.mockReturnValue(Effect.succeed({ found: false }));

    await expect(
      reorderScheduleAction(
        INITIAL_SCHEDULE_FORM_STATE,
        formData(["match:dA:m1-0"]),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
```

- [ ] **Step 7: テストが落ちることを確かめる**

Run: `pnpm exec vitest run src/features/schedule/reorder/handler.test.ts`
Expected: FAIL（`Failed to resolve import "./handler"`）

- [ ] **Step 8: handler を書く**

Create `src/features/schedule/reorder/handler.ts`:

```ts
"use server";

import { Effect, Exit } from "effect";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { scheduleErrorFormState } from "../effect-to-form-state";
import { revalidateSchedule } from "../revalidate";
import type { ScheduleFormState } from "../state";
import { reorderScheduleInDb } from "./repository";
import { reorderScheduleSchema } from "./schema";
import { reorderSchedule } from "./usecase";

export const reorderScheduleAction = async (
  _prevState: ScheduleFormState,
  formData: FormData,
): Promise<ScheduleFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  // Server Action はページを経由せず直接叩ける別の入口なので、ここで独立に確かめる。
  const { organization } = await requireOrganization(slug);

  const parsed = reorderScheduleSchema.safeParse({
    keys: formData.getAll("key").map(String),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    reorderSchedule(
      reorderScheduleInDb,
      { organizationId: organization.id, tournamentId },
      parsed.data,
    ),
  );

  if (Exit.isFailure(exit)) {
    return scheduleErrorFormState(exit.cause);
  }
  if (!exit.value.found) {
    notFound();
  }

  revalidateSchedule(slug, tournamentId);
  return { error: null };
};
```

- [ ] **Step 9: テストが通ることを確かめる**

Run: `pnpm exec vitest run src/features/schedule`
Expected: PASS（reorder の 9 件を含め全件）

Run: `pnpm typecheck`
Expected: エラー無し

- [ ] **Step 10: Commit**

```bash
git add src/features/schedule/reorder
git commit -m "feat(schedule): add reorder slice with stale-order guard"
```

---
### Task 8: insert-divider スライス

**Files:**
- Create: `src/features/schedule/insert-divider/schema.ts`
- Create: `src/features/schedule/insert-divider/repository.ts`
- Create: `src/features/schedule/insert-divider/usecase.ts`
- Create: `src/features/schedule/insert-divider/handler.ts`
- Create: `src/features/schedule/insert-divider/repository.test.ts`
- Create: `src/features/schedule/insert-divider/handler.test.ts`

**Interfaces:**
- Consumes: Task 5 の `insertDividerAfter` / `HEAD_ANCHOR_KEY`、Task 6 の `runSchedule`
- Produces: `insertDividerAction: ScheduleFormAction`。FormData のキーは `slug` / `tournamentId` / `anchorKey`（空文字は「先頭に挿す」）。挿入されるラベルは既定値 `"区切り"`、開始予定時刻は null。

- [ ] **Step 1: schema を書く**

Create `src/features/schedule/insert-divider/schema.ts`:

```ts
import { z } from "zod";

/** 挿入位置。空文字は「先頭に挿す」（domain の HEAD_ANCHOR_KEY と対）。 */
export const insertDividerSchema = z.object({
  anchorKey: z.string(),
});

export type InsertDividerInput = z.infer<typeof insertDividerSchema>;

/** 挿入直後のラベル。画面のインラインフォームで書き換える前提の仮の名前。 */
export const DEFAULT_DIVIDER_LABEL = "区切り";
```

- [ ] **Step 2: repository のテストを書く**

Create `src/features/schedule/insert-divider/repository.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleRowView } from "../types";

const runSchedule = vi.fn();

vi.mock("../schedule-store", () => ({
  runSchedule: (ids: unknown, mutate: unknown) => runSchedule(ids, mutate),
}));

const { insertDividerInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1" };

const rows: ScheduleRowView[] = [
  {
    kind: "match",
    key: "match:dA:m1-0",
    divisionId: "dA",
    divisionName: "男子",
    matchId: "m1-0",
    matchNumber: "1",
    label: "1回戦 第1試合",
    card: "山田 vs 佐藤",
  },
];

const applyMutate = (): {
  next: ScheduleRowView[] | null;
  value: null;
} => {
  const mutate = runSchedule.mock.calls[0][1] as (
    rows: ScheduleRowView[],
  ) => { next: ScheduleRowView[] | null; value: null };
  return mutate(rows);
};

beforeEach(() => {
  runSchedule.mockReset();
  runSchedule.mockReturnValue(Effect.succeed({ found: true, value: null }));
});

describe("insertDividerInDb", () => {
  it("アンカーの直後に既定ラベルの区切りを挿す", async () => {
    await Effect.runPromise(
      insertDividerInDb(ids, { anchorKey: "match:dA:m1-0" }),
    );

    const next = applyMutate().next;
    expect(next?.map((row) => row.kind)).toEqual(["match", "divider"]);
    expect(next?.[1]).toEqual(
      expect.objectContaining({ label: "区切り", startsAt: null }),
    );
  });

  it("空文字のアンカーは先頭に挿す", async () => {
    await Effect.runPromise(insertDividerInDb(ids, { anchorKey: "" }));

    expect(applyMutate().next?.map((row) => row.kind)).toEqual([
      "divider",
      "match",
    ]);
  });

  it("知らないアンカーは ScheduleStaleError を投げる", async () => {
    await Effect.runPromise(
      insertDividerInDb(ids, { anchorKey: "match:dZ:m9-9" }),
    );

    expect(() => applyMutate()).toThrowError(
      expect.objectContaining({ _tag: "ScheduleStaleError" }),
    );
  });
});
```

- [ ] **Step 3: テストが落ちることを確かめる**

Run: `pnpm exec vitest run src/features/schedule/insert-divider/repository.test.ts`
Expected: FAIL（`Failed to resolve import "./repository"`）

- [ ] **Step 4: repository と usecase を書く**

Create `src/features/schedule/insert-divider/repository.ts`:

```ts
import "server-only";
import { randomUUID } from "node:crypto";
import type { Effect } from "effect";
import { insertDividerAfter } from "../domain";
import { type ScheduleError, ScheduleStaleError } from "../errors";
import {
  runSchedule,
  type ScheduleIds,
  type ScheduleOutcome,
} from "../schedule-store";
import { DEFAULT_DIVIDER_LABEL, type InsertDividerInput } from "./schema";

export type InsertDividerPort = (
  ids: ScheduleIds,
  input: InsertDividerInput,
) => Effect.Effect<ScheduleOutcome<null>, ScheduleError>;

/**
 * アンカーの直後（空文字なら先頭）へ区切りを挿す。
 * id の採番はここで行い、domain 側は純粋関数のままにする。
 * アンカーが今の一覧に無いのは画面が古いということなので、reorder と同じく
 * ScheduleStaleError にして再読み込みを促す。
 */
export const insertDividerInDb: InsertDividerPort = (ids, input) =>
  runSchedule(ids, (rows) => {
    const next = insertDividerAfter(rows, input.anchorKey, {
      id: randomUUID(),
      label: DEFAULT_DIVIDER_LABEL,
      startsAt: null,
    });
    if (next === null) {
      throw new ScheduleStaleError({ tournamentId: ids.tournamentId });
    }
    return { next, value: null };
  });
```

Create `src/features/schedule/insert-divider/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { ScheduleError } from "../errors";
import type { ScheduleIds, ScheduleOutcome } from "../schedule-store";
import type { InsertDividerPort } from "./repository";
import type { InsertDividerInput } from "./schema";

export const insertDivider = (
  port: InsertDividerPort,
  ids: ScheduleIds,
  input: InsertDividerInput,
): Effect.Effect<ScheduleOutcome<null>, ScheduleError> => port(ids, input);
```

- [ ] **Step 5: repository のテストが通ることを確かめる**

Run: `pnpm exec vitest run src/features/schedule/insert-divider/repository.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 6: handler のテストを書く**

Create `src/features/schedule/insert-divider/handler.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_SCHEDULE_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const insertDividerInDb = vi.fn();
const revalidateSchedule = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

let calls: string[] = [];

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => {
    calls.push("requireOrganization");
    return requireOrganization(slug);
  },
}));
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("../revalidate", () => ({
  revalidateSchedule: (slug: string, tournamentId: string) =>
    revalidateSchedule(slug, tournamentId),
}));
vi.mock("./repository", () => ({
  insertDividerInDb: (ids: unknown, input: unknown) => {
    calls.push("insertDividerInDb");
    return insertDividerInDb(ids, input);
  },
}));

const { insertDividerAction } = await import("./handler");

const formData = (anchorKey: string) => {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("tournamentId", "t1");
  data.set("anchorKey", anchorKey);
  return data;
};

beforeEach(() => {
  calls = [];
  requireOrganization.mockReset();
  insertDividerInDb.mockReset();
  revalidateSchedule.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({ organization: { id: "o1" } });
  insertDividerInDb.mockReturnValue(
    Effect.succeed({ found: true, value: null }),
  );
});

describe("insertDividerAction", () => {
  it("認可を独立に確かめ、アンカーをポートへ渡す", async () => {
    await insertDividerAction(
      INITIAL_SCHEDULE_FORM_STATE,
      formData("match:dA:m1-0"),
    );

    expect(requireOrganization).toHaveBeenCalledWith("acme");
    expect(insertDividerInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1" },
      { anchorKey: "match:dA:m1-0" },
    );
    expect(calls).toEqual(["requireOrganization", "insertDividerInDb"]);
  });

  it("アンカーが空文字でも受け付ける（先頭への挿入）", async () => {
    const state = await insertDividerAction(
      INITIAL_SCHEDULE_FORM_STATE,
      formData(""),
    );

    expect(insertDividerInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1" },
      { anchorKey: "" },
    );
    expect(revalidateSchedule).toHaveBeenCalledWith("acme", "t1");
    expect(state.error).toBeNull();
  });

  it("並びがずれていたら再読み込みを促す", async () => {
    const { ScheduleStaleError } = await import("../errors");
    insertDividerInDb.mockReturnValue(
      Effect.fail(new ScheduleStaleError({ tournamentId: "t1" })),
    );

    const state = await insertDividerAction(
      INITIAL_SCHEDULE_FORM_STATE,
      formData("match:dA:m1-0"),
    );

    expect(state.error).toBe(
      "一覧が更新されています。画面を再読み込みしてください",
    );
  });

  it("大会が無ければ 404 にする", async () => {
    insertDividerInDb.mockReturnValue(Effect.succeed({ found: false }));

    await expect(
      insertDividerAction(INITIAL_SCHEDULE_FORM_STATE, formData("")),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
```

- [ ] **Step 7: テストが落ちることを確かめる**

Run: `pnpm exec vitest run src/features/schedule/insert-divider/handler.test.ts`
Expected: FAIL（`Failed to resolve import "./handler"`）

- [ ] **Step 8: handler を書く**

Create `src/features/schedule/insert-divider/handler.ts`:

```ts
"use server";

import { Effect, Exit } from "effect";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { scheduleErrorFormState } from "../effect-to-form-state";
import { revalidateSchedule } from "../revalidate";
import type { ScheduleFormState } from "../state";
import { insertDividerInDb } from "./repository";
import { insertDividerSchema } from "./schema";
import { insertDivider } from "./usecase";

export const insertDividerAction = async (
  _prevState: ScheduleFormState,
  formData: FormData,
): Promise<ScheduleFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  // Server Action はページを経由せず直接叩ける別の入口なので、ここで独立に確かめる。
  const { organization } = await requireOrganization(slug);

  const parsed = insertDividerSchema.safeParse({
    anchorKey: String(formData.get("anchorKey") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    insertDivider(
      insertDividerInDb,
      { organizationId: organization.id, tournamentId },
      parsed.data,
    ),
  );

  if (Exit.isFailure(exit)) {
    return scheduleErrorFormState(exit.cause);
  }
  if (!exit.value.found) {
    notFound();
  }

  revalidateSchedule(slug, tournamentId);
  return { error: null };
};
```

- [ ] **Step 9: テストが通ることを確かめる**

Run: `pnpm exec vitest run src/features/schedule`
Expected: PASS

Run: `pnpm typecheck`
Expected: エラー無し

- [ ] **Step 10: Commit**

```bash
git add src/features/schedule/insert-divider
git commit -m "feat(schedule): add insert-divider slice"
```

---

### Task 9: update-divider スライス

**Files:**
- Create: `src/features/schedule/update-divider/schema.ts`
- Create: `src/features/schedule/update-divider/schema.test.ts`
- Create: `src/features/schedule/update-divider/repository.ts`
- Create: `src/features/schedule/update-divider/usecase.ts`
- Create: `src/features/schedule/update-divider/handler.ts`
- Create: `src/features/schedule/update-divider/handler.test.ts`

**Interfaces:**
- Consumes: Task 5 の `updateDividerRow`、Task 6 の `runSchedule`
- Produces: `updateDividerAction: ScheduleFormAction`。FormData のキーは `slug` / `tournamentId` / `itemId` / `label` / `startsAt`（`datetime-local` の `YYYY-MM-DDTHH:mm`。空文字は未設定）。

- [ ] **Step 1: schema のテストを書く**

Create `src/features/schedule/update-divider/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { updateDividerSchema } from "./schema";

const input = (label: string, startsAt: string) => ({
  itemId: "s1",
  label,
  startsAt,
});

describe("updateDividerSchema", () => {
  it("ラベルをトリムして通す", () => {
    expect(updateDividerSchema.parse(input("  午前の部  ", ""))).toEqual({
      itemId: "s1",
      label: "午前の部",
      startsAt: null,
    });
  });

  it("datetime-local の値を Date にする", () => {
    const parsed = updateDividerSchema.parse(
      input("午前の部", "2026-09-05T09:00"),
    );
    expect(parsed.startsAt).toEqual(new Date("2026-09-05T09:00"));
  });

  it("空のラベルは拒否する", () => {
    const result = updateDividerSchema.safeParse(input("   ", ""));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("見出しを入力してください");
    }
  });

  it("100 文字を超えるラベルは拒否する", () => {
    const result = updateDividerSchema.safeParse(input("あ".repeat(101), ""));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "見出しは100文字以内で入力してください",
      );
    }
  });

  it("datetime-local 以外の日時形式は拒否する", () => {
    const result = updateDividerSchema.safeParse(
      input("午前の部", "2026-09-05"),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "開始予定時刻の形式が正しくありません",
      );
    }
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `pnpm exec vitest run src/features/schedule/update-divider/schema.test.ts`
Expected: FAIL（`Failed to resolve import "./schema"`）

- [ ] **Step 3: schema を書く**

Create `src/features/schedule/update-divider/schema.ts`:

```ts
import { z } from "zod";

// <input type="datetime-local"> が送ってくる値は YYYY-MM-DDTHH:mm 固定。
// Date.parse はこれよりずっと広い形式（日付のみ、タイムゾーン付きなど）も
// 受け付けてしまうため、正規表現で入力欄が実際に出力する形に絞る。
// features/tournament/schema-parts.ts の startsAtSchema と同じ考え方だが、
// 同列カテゴリなので共有せずこちらに持つ。
const DATETIME_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export const updateDividerSchema = z.object({
  itemId: z.string().min(1, "区切りの指定が不正です"),
  label: z
    .string()
    .transform((raw) => raw.trim())
    .pipe(
      z
        .string()
        .min(1, "見出しを入力してください")
        .max(100, "見出しは100文字以内で入力してください"),
    ),
  /**
   * 開始予定時刻は任意。未入力は空文字で送られてくるので null に畳む。
   * Date.parse はローカル時刻として解釈するので、表示側の
   * toDateTimeLocalValue と対になる。
   */
  startsAt: z
    .string()
    .transform((raw) => raw.trim())
    .refine(
      (value) =>
        value === "" ||
        (DATETIME_LOCAL_PATTERN.test(value) &&
          !Number.isNaN(Date.parse(value))),
      "開始予定時刻の形式が正しくありません",
    )
    .transform((value) => (value === "" ? null : new Date(value))),
});

export type UpdateDividerInput = z.infer<typeof updateDividerSchema>;
```

- [ ] **Step 4: schema のテストが通ることを確かめる**

Run: `pnpm exec vitest run src/features/schedule/update-divider/schema.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 5: repository と usecase を書く**

Create `src/features/schedule/update-divider/repository.ts`:

```ts
import "server-only";
import type { Effect } from "effect";
import { updateDividerRow } from "../domain";
import { type ScheduleError, ScheduleItemNotFoundError } from "../errors";
import {
  runSchedule,
  type ScheduleIds,
  type ScheduleOutcome,
} from "../schedule-store";
import type { UpdateDividerInput } from "./schema";

export type UpdateDividerPort = (
  ids: ScheduleIds,
  input: UpdateDividerInput,
) => Effect.Effect<ScheduleOutcome<null>, ScheduleError>;

/**
 * 区切りのラベルと開始予定時刻を差し替える。並びは変えない。
 * 対象が無い（消えている、または試合行の id を指している）場合は
 * 「見つからない」として扱う。
 */
export const updateDividerInDb: UpdateDividerPort = (ids, input) =>
  runSchedule(ids, (rows) => {
    const next = updateDividerRow(
      rows,
      input.itemId,
      input.label,
      input.startsAt,
    );
    if (next === null) {
      throw new ScheduleItemNotFoundError({ itemId: input.itemId });
    }
    return { next, value: null };
  });
```

Create `src/features/schedule/update-divider/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { ScheduleError } from "../errors";
import type { ScheduleIds, ScheduleOutcome } from "../schedule-store";
import type { UpdateDividerPort } from "./repository";
import type { UpdateDividerInput } from "./schema";

export const updateDivider = (
  port: UpdateDividerPort,
  ids: ScheduleIds,
  input: UpdateDividerInput,
): Effect.Effect<ScheduleOutcome<null>, ScheduleError> => port(ids, input);
```

- [ ] **Step 6: handler のテストを書く**

Create `src/features/schedule/update-divider/handler.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_SCHEDULE_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const updateDividerInDb = vi.fn();
const revalidateSchedule = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

let calls: string[] = [];

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => {
    calls.push("requireOrganization");
    return requireOrganization(slug);
  },
}));
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("../revalidate", () => ({
  revalidateSchedule: (slug: string, tournamentId: string) =>
    revalidateSchedule(slug, tournamentId),
}));
vi.mock("./repository", () => ({
  updateDividerInDb: (ids: unknown, input: unknown) => {
    calls.push("updateDividerInDb");
    return updateDividerInDb(ids, input);
  },
}));

const { updateDividerAction } = await import("./handler");

const formData = (label: string, startsAt: string) => {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("tournamentId", "t1");
  data.set("itemId", "s1");
  data.set("label", label);
  data.set("startsAt", startsAt);
  return data;
};

beforeEach(() => {
  calls = [];
  requireOrganization.mockReset();
  updateDividerInDb.mockReset();
  revalidateSchedule.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({ organization: { id: "o1" } });
  updateDividerInDb.mockReturnValue(
    Effect.succeed({ found: true, value: null }),
  );
});

describe("updateDividerAction", () => {
  it("認可を独立に確かめ、トリム済みの入力をポートへ渡す", async () => {
    await updateDividerAction(
      INITIAL_SCHEDULE_FORM_STATE,
      formData(" 午前の部 ", "2026-09-05T09:00"),
    );

    expect(requireOrganization).toHaveBeenCalledWith("acme");
    expect(updateDividerInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1" },
      {
        itemId: "s1",
        label: "午前の部",
        startsAt: new Date("2026-09-05T09:00"),
      },
    );
    expect(calls).toEqual(["requireOrganization", "updateDividerInDb"]);
  });

  it("成功したら再検証する", async () => {
    const state = await updateDividerAction(
      INITIAL_SCHEDULE_FORM_STATE,
      formData("午前の部", ""),
    );

    expect(revalidateSchedule).toHaveBeenCalledWith("acme", "t1");
    expect(state.error).toBeNull();
  });

  it("見出しが空なら入力エラーにする", async () => {
    const state = await updateDividerAction(
      INITIAL_SCHEDULE_FORM_STATE,
      formData("  ", ""),
    );

    expect(state.error).toBe("見出しを入力してください");
    expect(updateDividerInDb).not.toHaveBeenCalled();
  });

  it("対象の区切りが無ければ文言を返す", async () => {
    const { ScheduleItemNotFoundError } = await import("../errors");
    updateDividerInDb.mockReturnValue(
      Effect.fail(new ScheduleItemNotFoundError({ itemId: "s1" })),
    );

    const state = await updateDividerAction(
      INITIAL_SCHEDULE_FORM_STATE,
      formData("午前の部", ""),
    );

    expect(state.error).toBe(
      "対象の区切りが見つかりません。画面を再読み込みしてください",
    );
  });

  it("大会が無ければ 404 にする", async () => {
    updateDividerInDb.mockReturnValue(Effect.succeed({ found: false }));

    await expect(
      updateDividerAction(
        INITIAL_SCHEDULE_FORM_STATE,
        formData("午前の部", ""),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
```

- [ ] **Step 7: テストが落ちることを確かめる**

Run: `pnpm exec vitest run src/features/schedule/update-divider/handler.test.ts`
Expected: FAIL（`Failed to resolve import "./handler"`）

- [ ] **Step 8: handler を書く**

Create `src/features/schedule/update-divider/handler.ts`:

```ts
"use server";

import { Effect, Exit } from "effect";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { scheduleErrorFormState } from "../effect-to-form-state";
import { revalidateSchedule } from "../revalidate";
import type { ScheduleFormState } from "../state";
import { updateDividerInDb } from "./repository";
import { updateDividerSchema } from "./schema";
import { updateDivider } from "./usecase";

export const updateDividerAction = async (
  _prevState: ScheduleFormState,
  formData: FormData,
): Promise<ScheduleFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  // Server Action はページを経由せず直接叩ける別の入口なので、ここで独立に確かめる。
  const { organization } = await requireOrganization(slug);

  const parsed = updateDividerSchema.safeParse({
    itemId: String(formData.get("itemId") ?? ""),
    label: String(formData.get("label") ?? ""),
    startsAt: String(formData.get("startsAt") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    updateDivider(
      updateDividerInDb,
      { organizationId: organization.id, tournamentId },
      parsed.data,
    ),
  );

  if (Exit.isFailure(exit)) {
    return scheduleErrorFormState(exit.cause);
  }
  if (!exit.value.found) {
    notFound();
  }

  revalidateSchedule(slug, tournamentId);
  return { error: null };
};
```

- [ ] **Step 9: テストが通ることを確かめる**

Run: `pnpm exec vitest run src/features/schedule`
Expected: PASS

Run: `pnpm typecheck`
Expected: エラー無し

- [ ] **Step 10: Commit**

```bash
git add src/features/schedule/update-divider
git commit -m "feat(schedule): add update-divider slice"
```

---

### Task 10: remove-divider スライス

**Files:**
- Create: `src/features/schedule/remove-divider/schema.ts`
- Create: `src/features/schedule/remove-divider/repository.ts`
- Create: `src/features/schedule/remove-divider/usecase.ts`
- Create: `src/features/schedule/remove-divider/handler.ts`
- Create: `src/features/schedule/remove-divider/handler.test.ts`

**Interfaces:**
- Consumes: Task 5 の `removeDividerRow`、Task 6 の `runSchedule`
- Produces: `removeDividerAction: ScheduleFormAction`。FormData のキーは `slug` / `tournamentId` / `itemId`。

- [ ] **Step 1: schema・repository・usecase を書く**

Create `src/features/schedule/remove-divider/schema.ts`:

```ts
import { z } from "zod";

export const removeDividerSchema = z.object({
  itemId: z.string().min(1, "区切りの指定が不正です"),
});

export type RemoveDividerInput = z.infer<typeof removeDividerSchema>;
```

Create `src/features/schedule/remove-divider/repository.ts`:

```ts
import "server-only";
import type { Effect } from "effect";
import { removeDividerRow } from "../domain";
import { type ScheduleError, ScheduleItemNotFoundError } from "../errors";
import {
  runSchedule,
  type ScheduleIds,
  type ScheduleOutcome,
} from "../schedule-store";
import type { RemoveDividerInput } from "./schema";

export type RemoveDividerPort = (
  ids: ScheduleIds,
  input: RemoveDividerInput,
) => Effect.Effect<ScheduleOutcome<null>, ScheduleError>;

/**
 * 区切りを 1 つ取り除く。残りの行は詰めて order を振り直す（store の save）。
 * 対象が無い場合は「見つからない」として扱う。
 */
export const removeDividerInDb: RemoveDividerPort = (ids, input) =>
  runSchedule(ids, (rows) => {
    const next = removeDividerRow(rows, input.itemId);
    if (next === null) {
      throw new ScheduleItemNotFoundError({ itemId: input.itemId });
    }
    return { next, value: null };
  });
```

Create `src/features/schedule/remove-divider/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { ScheduleError } from "../errors";
import type { ScheduleIds, ScheduleOutcome } from "../schedule-store";
import type { RemoveDividerPort } from "./repository";
import type { RemoveDividerInput } from "./schema";

export const removeDivider = (
  port: RemoveDividerPort,
  ids: ScheduleIds,
  input: RemoveDividerInput,
): Effect.Effect<ScheduleOutcome<null>, ScheduleError> => port(ids, input);
```

- [ ] **Step 2: handler のテストを書く**

Create `src/features/schedule/remove-divider/handler.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_SCHEDULE_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const removeDividerInDb = vi.fn();
const revalidateSchedule = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

let calls: string[] = [];

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => {
    calls.push("requireOrganization");
    return requireOrganization(slug);
  },
}));
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("../revalidate", () => ({
  revalidateSchedule: (slug: string, tournamentId: string) =>
    revalidateSchedule(slug, tournamentId),
}));
vi.mock("./repository", () => ({
  removeDividerInDb: (ids: unknown, input: unknown) => {
    calls.push("removeDividerInDb");
    return removeDividerInDb(ids, input);
  },
}));

const { removeDividerAction } = await import("./handler");

const formData = (itemId: string) => {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("tournamentId", "t1");
  data.set("itemId", itemId);
  return data;
};

beforeEach(() => {
  calls = [];
  requireOrganization.mockReset();
  removeDividerInDb.mockReset();
  revalidateSchedule.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({ organization: { id: "o1" } });
  removeDividerInDb.mockReturnValue(
    Effect.succeed({ found: true, value: null }),
  );
});

describe("removeDividerAction", () => {
  it("認可を独立に確かめ、id をポートへ渡す", async () => {
    await removeDividerAction(INITIAL_SCHEDULE_FORM_STATE, formData("s1"));

    expect(requireOrganization).toHaveBeenCalledWith("acme");
    expect(removeDividerInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1" },
      { itemId: "s1" },
    );
    expect(calls).toEqual(["requireOrganization", "removeDividerInDb"]);
  });

  it("成功したら再検証する", async () => {
    const state = await removeDividerAction(
      INITIAL_SCHEDULE_FORM_STATE,
      formData("s1"),
    );

    expect(revalidateSchedule).toHaveBeenCalledWith("acme", "t1");
    expect(state.error).toBeNull();
  });

  it("id が空なら入力エラーにする", async () => {
    const state = await removeDividerAction(
      INITIAL_SCHEDULE_FORM_STATE,
      formData(""),
    );

    expect(state.error).toBe("区切りの指定が不正です");
    expect(removeDividerInDb).not.toHaveBeenCalled();
  });

  it("対象の区切りが無ければ文言を返す", async () => {
    const { ScheduleItemNotFoundError } = await import("../errors");
    removeDividerInDb.mockReturnValue(
      Effect.fail(new ScheduleItemNotFoundError({ itemId: "s1" })),
    );

    const state = await removeDividerAction(
      INITIAL_SCHEDULE_FORM_STATE,
      formData("s1"),
    );

    expect(state.error).toBe(
      "対象の区切りが見つかりません。画面を再読み込みしてください",
    );
  });

  it("大会が無ければ 404 にする", async () => {
    removeDividerInDb.mockReturnValue(Effect.succeed({ found: false }));

    await expect(
      removeDividerAction(INITIAL_SCHEDULE_FORM_STATE, formData("s1")),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
```

- [ ] **Step 3: テストが落ちることを確かめる**

Run: `pnpm exec vitest run src/features/schedule/remove-divider/handler.test.ts`
Expected: FAIL（`Failed to resolve import "./handler"`）

- [ ] **Step 4: handler を書く**

Create `src/features/schedule/remove-divider/handler.ts`:

```ts
"use server";

import { Effect, Exit } from "effect";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { scheduleErrorFormState } from "../effect-to-form-state";
import { revalidateSchedule } from "../revalidate";
import type { ScheduleFormState } from "../state";
import { removeDividerInDb } from "./repository";
import { removeDividerSchema } from "./schema";
import { removeDivider } from "./usecase";

export const removeDividerAction = async (
  _prevState: ScheduleFormState,
  formData: FormData,
): Promise<ScheduleFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  // Server Action はページを経由せず直接叩ける別の入口なので、ここで独立に確かめる。
  const { organization } = await requireOrganization(slug);

  const parsed = removeDividerSchema.safeParse({
    itemId: String(formData.get("itemId") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    removeDivider(
      removeDividerInDb,
      { organizationId: organization.id, tournamentId },
      parsed.data,
    ),
  );

  if (Exit.isFailure(exit)) {
    return scheduleErrorFormState(exit.cause);
  }
  if (!exit.value.found) {
    notFound();
  }

  revalidateSchedule(slug, tournamentId);
  return { error: null };
};
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `pnpm exec vitest run src/features/schedule`
Expected: PASS

Run: `pnpm typecheck`
Expected: エラー無し

- [ ] **Step 6: Commit**

```bash
git add src/features/schedule/remove-divider
git commit -m "feat(schedule): add remove-divider slice"
```

---
### Task 11: @dnd-kit/sortable の追加と D&D の判断関数

**Files:**
- Modify: `package.json` / `pnpm-lock.yaml`（`pnpm add` が書き換える）
- Create: `src/components/schedule/schedule-drag.ts`
- Create: `src/components/schedule/schedule-drag.test.ts`

**Interfaces:**
- Consumes: なし（純粋関数）
- Produces: `resolveDragReorder(keys: string[], activeId: string, overId: string | null): string[] | null`

- [ ] **Step 1: 依存を足す**

```bash
pnpm add @dnd-kit/sortable
```

Run: `node -e "console.log(require('./package.json').dependencies['@dnd-kit/sortable'])"`
Expected: バージョン文字列が出る（例 `^10.0.0`）

- [ ] **Step 2: 失敗するテストを書く**

Create `src/components/schedule/schedule-drag.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveDragReorder } from "./schedule-drag";

const keys = ["a", "b", "c", "d"];

describe("resolveDragReorder", () => {
  it("下へ動かすと落とした位置に入る", () => {
    expect(resolveDragReorder(keys, "a", "c")).toEqual(["b", "c", "a", "d"]);
  });

  it("上へ動かすと落とした位置に入る", () => {
    expect(resolveDragReorder(keys, "d", "b")).toEqual(["a", "d", "b", "c"]);
  });

  it("落とし先が無ければ null", () => {
    expect(resolveDragReorder(keys, "a", null)).toBeNull();
  });

  it("同じ行に落としたら null", () => {
    expect(resolveDragReorder(keys, "a", "a")).toBeNull();
  });

  it("知らないキーなら null", () => {
    expect(resolveDragReorder(keys, "z", "a")).toBeNull();
    expect(resolveDragReorder(keys, "a", "z")).toBeNull();
  });

  it("元の配列を書き換えない", () => {
    const original = [...keys];
    resolveDragReorder(keys, "a", "c");
    expect(keys).toEqual(original);
  });
});
```

- [ ] **Step 3: テストが落ちることを確かめる**

Run: `pnpm exec vitest run src/components/schedule/schedule-drag.test.ts`
Expected: FAIL（`Failed to resolve import "./schedule-drag"`）

- [ ] **Step 4: 実装する**

Create `src/components/schedule/schedule-drag.ts`:

```ts
/**
 * ドラッグの結果を並べ替え後のキー配列に直す。並べ替えにならない場合は null。
 *
 * D&D の実操作は jsdom で再現しにくいので、判断をここへ切り出して
 * 単体でテストできるようにしてある。コンポーネントは呼ぶだけにする
 * （components/division/matching-drag.ts と同じ形）。
 *
 * @dnd-kit/sortable の arrayMove を使わないのは、この関数を
 * ライブラリに依存しない純粋関数に保ってテストを軽くするため。
 */
export const resolveDragReorder = (
  keys: string[],
  activeId: string,
  overId: string | null,
): string[] | null => {
  if (overId === null || activeId === overId) {
    return null;
  }

  const from = keys.indexOf(activeId);
  const to = keys.indexOf(overId);
  if (from === -1 || to === -1) {
    return null;
  }

  const next = [...keys];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `pnpm exec vitest run src/components/schedule/schedule-drag.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/components/schedule/schedule-drag.ts src/components/schedule/schedule-drag.test.ts
git commit -m "feat(schedule): add @dnd-kit/sortable and drag resolution helper"
```

---

### Task 12: 一覧コンポーネント

**Files:**
- Create: `src/components/schedule/ScheduleMatchRow.tsx`
- Create: `src/components/schedule/ScheduleDividerRow.tsx`
- Create: `src/components/schedule/ScheduleList.tsx`
- Create: `src/components/schedule/ScheduleList.test.tsx`

**Interfaces:**
- Consumes: Task 3 の `ScheduleRowView` / `ScheduleFormAction` / `INITIAL_SCHEDULE_FORM_STATE`、Task 11 の `resolveDragReorder`、既存の `toDateTimeLocalValue`（`@/features/tournament/format`。components からは任意の feature を import してよい）
- Produces: `ScheduleList` コンポーネント。props は `{ slug, tournamentId, rows, reorderAction, insertDividerAction, updateDividerAction, removeDividerAction }`。

- [ ] **Step 1: 行コンポーネントを書く**

Create `src/components/schedule/ScheduleMatchRow.tsx`:

```tsx
"use client";

import type { ScheduleRowView } from "@/features/schedule/types";

type MatchRow = Extract<ScheduleRowView, { kind: "match" }>;

export function ScheduleMatchRow({ row }: { row: MatchRow }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="flex items-center gap-2 text-sm text-slate-800">
        <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-bold">
          第{row.matchNumber}試合
        </span>
        <span className="truncate font-medium">{row.card}</span>
      </p>
      <p className="truncate text-xs text-slate-500">
        {row.divisionName} / {row.label}
      </p>
    </div>
  );
}
```

Create `src/components/schedule/ScheduleDividerRow.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import {
  INITIAL_SCHEDULE_FORM_STATE,
  type ScheduleFormAction,
} from "@/features/schedule/state";
import type { ScheduleRowView } from "@/features/schedule/types";
import { toDateTimeLocalValue } from "@/features/tournament/format";

type DividerRow = Extract<ScheduleRowView, { kind: "divider" }>;

/**
 * 区切りの見出しと開始予定時刻をその場で編集する。1 行 1 フォームにして
 * useActionState を行ごとに持たせ、エラーをその行の隣に出す
 * （components/division/MatchNumberList.tsx と同じ形）。
 */
export function ScheduleDividerRow({
  row,
  slug,
  tournamentId,
  updateAction,
  removeAction,
}: {
  row: DividerRow;
  slug: string;
  tournamentId: string;
  updateAction: ScheduleFormAction;
  removeAction: ScheduleFormAction;
}) {
  const [updateState, update, updating] = useActionState(
    updateAction,
    INITIAL_SCHEDULE_FORM_STATE,
  );
  const [removeState, remove, removing] = useActionState(
    removeAction,
    INITIAL_SCHEDULE_FORM_STATE,
  );

  return (
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden="true" className="text-xs text-slate-400">
          -----
        </span>

        <form action={update} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="tournamentId" value={tournamentId} />
          <input type="hidden" name="itemId" value={row.id} />
          <input
            type="text"
            name="label"
            defaultValue={row.label}
            aria-label="区切りの見出し"
            className="w-48 rounded border border-slate-300 px-2 py-1 text-sm font-bold"
          />
          <input
            type="datetime-local"
            name="startsAt"
            defaultValue={toDateTimeLocalValue(row.startsAt)}
            aria-label="区切りの開始予定時刻"
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <button
            type="submit"
            disabled={updating}
            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-30"
          >
            保存
          </button>
        </form>

        <form action={remove}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="tournamentId" value={tournamentId} />
          <input type="hidden" name="itemId" value={row.id} />
          <button
            type="submit"
            disabled={removing}
            className="rounded border border-slate-300 px-2 py-1 text-xs text-red-600 disabled:opacity-30"
          >
            区切りを削除
          </button>
        </form>
      </div>

      {updateState.error !== null && (
        <p role="alert" className="text-xs text-red-600">
          {updateState.error}
        </p>
      )}
      {removeState.error !== null && (
        <p role="alert" className="text-xs text-red-600">
          {removeState.error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 一覧コンポーネントのテストを書く**

Create `src/components/schedule/ScheduleList.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ScheduleFormState } from "@/features/schedule/state";
import type { ScheduleRowView } from "@/features/schedule/types";
import { ScheduleList } from "./ScheduleList";

const rows: ScheduleRowView[] = [
  {
    kind: "divider",
    key: "divider:s1",
    id: "s1",
    label: "午前の部",
    startsAt: null,
  },
  {
    kind: "match",
    key: "match:dA:m1-0",
    divisionId: "dA",
    divisionName: "男子シングルス",
    matchId: "m1-0",
    matchNumber: "1",
    label: "1回戦 第1試合",
    card: "山田 vs 佐藤",
  },
];

const noop = async (): Promise<ScheduleFormState> => ({ error: null });

const renderList = (
  overrides: {
    rows?: ScheduleRowView[];
    insertDividerAction?: typeof noop;
  } = {},
) =>
  render(
    <ScheduleList
      slug="acme"
      tournamentId="t1"
      rows={overrides.rows ?? rows}
      reorderAction={noop}
      insertDividerAction={overrides.insertDividerAction ?? noop}
      updateDividerAction={noop}
      removeDividerAction={noop}
    />,
  );

describe("ScheduleList", () => {
  it("試合行に試合番号・対戦カード・部門名を出す", () => {
    renderList();

    expect(screen.getByText("第1試合")).toBeInTheDocument();
    expect(screen.getByText("山田 vs 佐藤")).toBeInTheDocument();
    expect(
      screen.getByText("男子シングルス / 1回戦 第1試合"),
    ).toBeInTheDocument();
  });

  it("区切り行を編集できる形で出す", () => {
    renderList();

    expect(screen.getByLabelText("区切りの見出し")).toHaveValue("午前の部");
    expect(screen.getByLabelText("区切りの開始予定時刻")).toHaveValue("");
  });

  it("試合が無ければその旨を出す", () => {
    renderList({ rows: [] });

    expect(screen.getByText("まだ試合がありません")).toBeInTheDocument();
  });

  it("先頭への挿入は空文字のアンカーを送る", async () => {
    const anchors: (string | null)[] = [];
    const insertDividerAction = vi.fn(
      async (_state: ScheduleFormState, data: FormData) => {
        anchors.push(data.get("anchorKey") as string | null);
        return { error: null };
      },
    );
    renderList({ insertDividerAction });

    await userEvent.click(
      screen.getByRole("button", { name: "先頭に区切りを挿入" }),
    );

    expect(anchors).toEqual([""]);
  });

  it("行の挿入ボタンはその行のキーをアンカーに送る", async () => {
    const anchors: (string | null)[] = [];
    const insertDividerAction = vi.fn(
      async (_state: ScheduleFormState, data: FormData) => {
        anchors.push(data.get("anchorKey") as string | null);
        return { error: null };
      },
    );
    renderList({ insertDividerAction });

    const buttons = screen.getAllByRole("button", {
      name: "この下に区切りを挿入",
    });
    await userEvent.click(buttons[1]);

    expect(anchors).toEqual(["match:dA:m1-0"]);
  });
});
```

- [ ] **Step 3: テストが落ちることを確かめる**

Run: `pnpm exec vitest run src/components/schedule/ScheduleList.test.tsx`
Expected: FAIL（`Failed to resolve import "./ScheduleList"`）

- [ ] **Step 4: 一覧コンポーネントを書く**

Create `src/components/schedule/ScheduleList.tsx`:

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
import {
  INITIAL_SCHEDULE_FORM_STATE,
  type ScheduleFormAction,
} from "@/features/schedule/state";
import type { ScheduleRowView } from "@/features/schedule/types";
import { ScheduleDividerRow } from "./ScheduleDividerRow";
import { ScheduleMatchRow } from "./ScheduleMatchRow";
import { resolveDragReorder } from "./schedule-drag";

/**
 * 1 行ぶんの並べ替え可能な枠。掴む場所をハンドルのボタンに限るのは、
 * 行の中に見出しの入力欄や保存ボタンがあり、行全体を掴めるようにすると
 * 文字を選択できなくなるため。
 *
 * transform を translate3d に自前で直しているのは、@dnd-kit/utilities を
 * 依存に足さないため。縦一列の並べ替えなので y だけ見れば足りる。
 */
function SortableRow({ id, children }: { id: string; children: ReactNode }) {
  const sortable = useSortable({ id });

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
          ? "flex items-start gap-3 rounded border border-slate-800 bg-slate-50 px-3 py-2"
          : "flex items-start gap-3 rounded border border-slate-200 bg-white px-3 py-2"
      }
    >
      <button
        type="button"
        aria-label="ドラッグして並べ替え"
        className="cursor-grab rounded px-1 text-slate-400"
        {...sortable.listeners}
        {...sortable.attributes}
      >
        ⠿
      </button>
      {children}
    </li>
  );
}

export function ScheduleList({
  slug,
  tournamentId,
  rows,
  reorderAction,
  insertDividerAction,
  updateDividerAction,
  removeDividerAction,
}: {
  slug: string;
  tournamentId: string;
  /** 進行順に並べて渡す。この並びがそのまま画面の並びになる。 */
  rows: ScheduleRowView[];
  reorderAction: ScheduleFormAction;
  insertDividerAction: ScheduleFormAction;
  updateDividerAction: ScheduleFormAction;
  removeDividerAction: ScheduleFormAction;
}) {
  const [reorderState, reorder] = useActionState(
    reorderAction,
    INITIAL_SCHEDULE_FORM_STATE,
  );
  const [insertState, insert] = useActionState(
    insertDividerAction,
    INITIAL_SCHEDULE_FORM_STATE,
  );
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const keys = rows.map((row) => row.key);

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
    for (const key of next) {
      data.append("key", key);
    }
    startTransition(() => reorder(data));
  };

  const insertAfter = (anchorKey: string): void => {
    const data = new FormData();
    data.set("slug", slug);
    data.set("tournamentId", tournamentId);
    data.set("anchorKey", anchorKey);
    startTransition(() => insert(data));
  };

  if (rows.length === 0) {
    return <p className="text-sm text-slate-600">まだ試合がありません</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        左端をドラッグすると進行順を入れ替えられます
      </p>

      {reorderState.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {reorderState.error}
        </p>
      )}
      {insertState.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {insertState.error}
        </p>
      )}

      <button
        type="button"
        onClick={() => insertAfter("")}
        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
      >
        先頭に区切りを挿入
      </button>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={keys} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {rows.map((row) => (
              <SortableRow key={row.key} id={row.key}>
                {row.kind === "match" ? (
                  <ScheduleMatchRow row={row} />
                ) : (
                  <ScheduleDividerRow
                    row={row}
                    slug={slug}
                    tournamentId={tournamentId}
                    updateAction={updateDividerAction}
                    removeAction={removeDividerAction}
                  />
                )}
                <button
                  type="button"
                  onClick={() => insertAfter(row.key)}
                  className="shrink-0 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
                >
                  この下に区切りを挿入
                </button>
              </SortableRow>
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `pnpm exec vitest run src/components/schedule`
Expected: PASS（ScheduleList 5 件 + schedule-drag 6 件）

Run: `pnpm typecheck`
Expected: エラー無し

- [ ] **Step 6: Commit**

```bash
git add src/components/schedule
git commit -m "feat(schedule): add sortable schedule list with divider rows"
```

---

### Task 13: 試合一覧ページと大会ページからの導線

**Files:**
- Create: `src/app/orgs/[slug]/tournaments/[tournamentId]/matches/page.tsx`
- Create: `src/app/orgs/[slug]/tournaments/[tournamentId]/matches/page.test.tsx`
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/page.tsx`（「試合一覧」へのリンクを足す）

**Interfaces:**
- Consumes: Task 6 の `loadScheduleView`、Task 7〜10 の 4 つの Action、Task 12 の `ScheduleList`、既存の `requireOrganization` / `findTournamentInOrganization` / `AppHeader`
- Produces: ルート `/orgs/[slug]/tournaments/[tournamentId]/matches`

- [ ] **Step 1: ページを書く**

Create `src/app/orgs/[slug]/tournaments/[tournamentId]/matches/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScheduleList } from "@/components/schedule/ScheduleList";
import { insertDividerAction } from "@/features/schedule/insert-divider/handler";
import { removeDividerAction } from "@/features/schedule/remove-divider/handler";
import { reorderScheduleAction } from "@/features/schedule/reorder/handler";
import { loadScheduleView } from "@/features/schedule/repository";
import { updateDividerAction } from "@/features/schedule/update-divider/handler";
import { findTournamentInOrganization } from "@/features/tournament/repository";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function TournamentMatchesPage({
  params,
}: PageProps<"/orgs/[slug]/tournaments/[tournamentId]/matches">) {
  const { slug, tournamentId } = await params;
  const { session, organization } = await requireOrganization(slug);

  const tournament = await findTournamentInOrganization(
    organization.id,
    tournamentId,
  );
  if (!tournament) {
    notFound();
  }

  const rows = await loadScheduleView(organization.id, tournamentId);

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
          { label: "試合一覧" },
        ]}
        userName={session.user.name}
      />

      <div className="mx-auto max-w-3xl space-y-4 px-6 py-8">
        <div>
          <h2 className="text-sm font-bold text-slate-700">試合一覧</h2>
          <p className="text-xs text-slate-500">
            全部門の試合を進行順に並べます。この並びは組み合わせ（ブラケット）には影響しません。
          </p>
        </div>

        <ScheduleList
          slug={slug}
          tournamentId={tournament.id}
          rows={rows}
          reorderAction={reorderScheduleAction}
          insertDividerAction={insertDividerAction}
          updateDividerAction={updateDividerAction}
          removeDividerAction={removeDividerAction}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: ルートの型を生成する**

Run: `pnpm exec next typegen`
Expected: 正常終了（`PageProps<"/orgs/[slug]/tournaments/[tournamentId]/matches">` が使えるようになる）

Run: `pnpm typecheck`
Expected: エラー無し

- [ ] **Step 3: ページのテストを書く**

Create `src/app/orgs/[slug]/tournaments/[tournamentId]/matches/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// LogoutButton は authClient / useRouter に依存するクライアントコンポーネントで、
// ページ本体の検証に集中したいので他のページテストと同じ方針で差し替える。
vi.mock("@/components/auth/LogoutButton", () => ({
  LogoutButton: () => <button type="button">ログアウト</button>,
}));

const requireOrganization = vi.fn();
const findTournamentInOrganization = vi.fn();
const loadScheduleView = vi.fn();
const notFound = vi.fn(() => {
  // next/navigation の notFound は例外を投げて制御を打ち切る。
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
  loadScheduleView: (organizationId: string, tournamentId: string) =>
    loadScheduleView(organizationId, tournamentId),
}));

// Server Action はページ本体の検証に関係しないので、素通しの関数へ差し替える。
vi.mock("@/features/schedule/reorder/handler", () => ({
  reorderScheduleAction: async () => ({ error: null }),
}));
vi.mock("@/features/schedule/insert-divider/handler", () => ({
  insertDividerAction: async () => ({ error: null }),
}));
vi.mock("@/features/schedule/update-divider/handler", () => ({
  updateDividerAction: async () => ({ error: null }),
}));
vi.mock("@/features/schedule/remove-divider/handler", () => ({
  removeDividerAction: async () => ({ error: null }),
}));

const { default: Page } = await import("./page");

const pageProps = (slug: string, tournamentId: string) => ({
  params: Promise.resolve({ slug, tournamentId }),
  searchParams: Promise.resolve({}),
});

const session = { user: { id: "u1", name: "竹添" } };
// id と slug をわざと異なる値にする。揃えてしまうと取り違えを見逃す。
const organization = { id: "o1", name: "テニス部", slug: "tennis" };
const tournament = { id: "t1", name: "春季大会" };

beforeEach(() => {
  requireOrganization.mockReset();
  findTournamentInOrganization.mockReset();
  loadScheduleView.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({ session, organization });
  findTournamentInOrganization.mockResolvedValue(tournament);
  loadScheduleView.mockResolvedValue([
    {
      kind: "match",
      key: "match:dA:m1-0",
      divisionId: "dA",
      divisionName: "男子シングルス",
      matchId: "m1-0",
      matchNumber: "1",
      label: "1回戦 第1試合",
      card: "山田 vs 佐藤",
    },
  ]);
});

describe("TournamentMatchesPage", () => {
  it("組織 id で一覧を読み、試合を描く", async () => {
    render(await Page(pageProps("tennis", "t1")));

    expect(requireOrganization).toHaveBeenCalledWith("tennis");
    expect(loadScheduleView).toHaveBeenCalledWith("o1", "t1");
    expect(screen.getByText("山田 vs 佐藤")).toBeInTheDocument();
  });

  it("大会が無ければ 404 にする", async () => {
    findTournamentInOrganization.mockResolvedValue(null);

    await expect(Page(pageProps("tennis", "t1"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(loadScheduleView).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `pnpm exec vitest run "src/app/orgs/[slug]/tournaments/[tournamentId]/matches"`
Expected: PASS（2 tests）

- [ ] **Step 5: 大会ページに導線を足す**

`src/app/orgs/[slug]/tournaments/[tournamentId]/page.tsx` の `<TournamentDetailView slug={slug} tournament={tournament} />` の直後に、次の `<Link>` を挿す（`Link` はこのファイルで既に import 済み）。

```tsx
        <TournamentDetailView slug={slug} tournament={tournament} />

        <Link
          href={`/orgs/${slug}/tournaments/${tournament.id}/matches`}
          className="inline-block rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800"
        >
          試合一覧
        </Link>
```

- [ ] **Step 6: 大会ページの既存テストが通ることを確かめる**

Run: `pnpm exec vitest run "src/app/orgs/[slug]/tournaments/[tournamentId]/page.test.tsx"`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add "src/app/orgs/[slug]/tournaments/[tournamentId]"
git commit -m "feat(schedule): add tournament match list page"
```

---

### Task 14: 依存制約の lint とドキュメント、全体検証

**Files:**
- Modify: `biome.json`（`src/features/schedule/**` の override を追加）
- Modify: `docs/code-design/architecture.md`（`features/schedule` の節を追加）

**Interfaces:**
- Consumes: これまでの全タスク
- Produces: なし（仕上げ）

- [ ] **Step 1: Biome の override を足す**

`biome.json` の `overrides` 配列の末尾（`src/features/tournament/delete/**` のブロックの後）に、次の要素を追加する。

```json
    {
      "includes": ["src/features/schedule/**"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "patterns": [
                  {
                    "group": [
                      "@/features/auth/**",
                      "@/features/auth",
                      "@/features/bracket/**",
                      "@/features/bracket",
                      "@/features/division/**",
                      "@/features/division",
                      "@/features/member/**",
                      "@/features/member",
                      "@/features/organization/**",
                      "@/features/organization",
                      "@/features/organization-user/**",
                      "@/features/organization-user",
                      "@/features/tournament/**",
                      "@/features/tournament",
                      "@/components/**",
                      "**/components/**",
                      "@/app/**",
                      "**/app/**"
                    ],
                    "message": "features/schedule は他の機能・UI・app に依存できません。試合の表示ロジックのように features/division と共有したいものは src/lib/division へ下ろしてください。"
                  }
                ]
              }
            }
          }
        }
      }
    }
```

- [ ] **Step 2: lint が通ることを確かめる**

Run: `pnpm exec biome check --write src/features/schedule src/components/schedule src/lib/division "src/app/orgs/[slug]/tournaments/[tournamentId]"`
Expected: 整形が適用されて終了。

Run: `pnpm lint`
Expected: 出力の中に `noRestrictedImports` の指摘が 1 件も無いこと。CRLF 由来の
`format` の指摘は Windows チェックアウトでは全ファイルに出るので、そちらは無視する。

- [ ] **Step 3: アーキテクチャ文書に節を足す**

`docs/code-design/architecture.md` の「## テナント分離の 2 原則」という見出しの直前に、次の節を挿す。

```markdown
## features/schedule

大会の「進行順」（試合一覧の並びと区切り行）を持つ。試合の実体は
`Division.matchingConfig`（Json）の中にあり、`ScheduleItem` は
`(divisionId, matchId)` の文字列で指すだけなので、行と実体は必ずずれうる
（組み合わせの再生成、部門の削除、新しい部門の組み合わせ）。

このずれは読み出しの純粋関数 `buildScheduleView` が吸収する。保存された行を
`order` 昇順に並べ、実体の無い行を落とし、行を持たない試合を
「部門の order 昇順 → round 昇順 → order 昇順」で末尾へ足す。読み出しは
副作用を持たず、DB の掃除は次の保存（全行の書き直し）でまとめて片付く。

`schedule-store.ts` は 4 スライス（`reorder` / `insert-divider` /
`update-divider` / `remove-divider`）共通の read-modify-write を持つ。
`setup-store.ts` と同じ役割で、所有権つきの読み出し、マージ、変形、
`deleteMany` + `createMany` による `order` の 0..n-1 振り直しを 1 つの
トランザクションにまとめる。全行を作り直すため `@@unique([tournamentId, order])`
に対する退避操作（`features/division/reorder` の `PARKING_ORDER`）は要らない。

`features/schedule` は同列の `features/division` に依存できないため、
試合の表示文言（「山田 vs 第 3 試合の勝者」）は `src/lib/division/label.ts` に
下ろして共有する。`features/bracket` が `lib/division` を参照するのと同じ向きである。

並べ替えは楽観ロックの列を持たない。送られたキーの集合が現在のマージ結果と
一致するかどうかの確認（`reorderRows`）がその役目を果たす。
```

- [ ] **Step 4: 全体を検証する**

Run: `pnpm test`
Expected: 全件 PASS（失敗が 1 件でもあれば直してから次へ）

Run: `pnpm typecheck`
Expected: エラー無し

Run: `pnpm build`
Expected: 正常終了

- [ ] **Step 5: Commit**

```bash
git add biome.json docs/code-design/architecture.md
git commit -m "chore(schedule): enforce import boundary and document the category"
```
