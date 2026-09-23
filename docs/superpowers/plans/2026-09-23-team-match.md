# 団体戦（TEAM_MATCH）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2 チームが同じ人数の選手を並べ、出場順が同じ者どうしが 1 ペアずつ戦う「団体戦」を、新しい部門形式 `TEAM_MATCH` として実装する。

**Architecture:** 大会単位の `Team` テーブルを足して所属を構造化し、`DivisionFormat` に `TEAM_MATCH` を 1 値足す。組み合わせは `features/division/team-match/build.ts` が「位置 i どうしを 1 試合にする」だけの純粋関数として組み立て、人数差は既存の `bye` スロットで吸収する。勝敗集計も純粋関数（`team-match/standings.ts`）で、勝利数 → 本数 → 引き分けの順に決める。

**Tech Stack:** Next.js (App Router, Server Actions) / React 19 / Prisma 7 (PostgreSQL) / Effect / Zod / Vitest + Testing Library / Biome / pnpm

設計の出典: `docs/superpowers/specs/2026-09-23-team-match-design.md`

## Global Constraints

- パッケージマネージャは **pnpm**。`pnpm exec <cmd>` / `pnpm test` を使う。`npm` / `yarn` は使わない
- アーキテクチャは垂直スライス（`docs/code-design/architecture.md`）。`features/<category>/<action>/` に `schema.ts` / `handler.ts` / `usecase.ts` / `repository.ts` を置く
- `features/` 配下のスライスは **同列・下位のスライスに依存しない**。共有はカテゴリ直下か `src/lib/` に下ろす
- `features/` 配下に `.tsx` を置かない。画面は `src/components/<category>/` に置く
- 認可境界（`requirePermission(slug, "tournament.edit")`）は**ページの冒頭と Server Action の冒頭で独立に呼ぶ**
- 所有権はクエリの `where` に入れる。`update` / `delete` ではなく `updateMany` / `deleteMany` を使い、0 件は `notFound()` に倒す
- 権限なし・非所属は 403 ではなく `notFound()`（404）
- バリデーションは Zod、副作用は Effect（`Effect.tryPromise` + `Data.TaggedError`）
- エラー文言は `Match.exhaustive` で網羅する（種類を足したら文言の追加がコンパイルエラーになる）
- 形式ごとの分岐は `Record<DivisionFormat, _>` か網羅的 `switch`（`const exhaustive: never = x`）で書き、書き忘れをコンパイルエラーにする
- テストは TDD。失敗するテスト → 最小実装 → 通す → コミット
- コミットメッセージは日本語の本文 + 末尾に `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- Windows チェックアウトのため Biome は CRLF 由来のエラーを全域で出す。lint の合否は**自分が変更した内容**で判断する

## File Structure

### Phase 1: Team の基盤

| ファイル | 責務 |
| --- | --- |
| `prisma/schema.prisma` | `Team` モデル、`Participant.teamId` / `team Team?`、`Participant.team`(String) の削除 |
| `prisma/migrations/<ts>_add_team/migration.sql` | テーブル作成 + 自由文字列からのデータ移行 + 旧列の削除 |
| `src/features/team/scope.ts` | `TeamIds` / `TeamOutcome<T>` |
| `src/features/team/errors.ts` | `TeamError` と `toTeamError` |
| `src/features/team/messages.ts` | エラー → 日本語文言 |
| `src/features/team/state.ts` | `TeamFormState` / `TeamFormAction` |
| `src/features/team/effect-to-form-state.ts` | Exit-failure → `TeamFormState` |
| `src/features/team/revalidate.ts` | 再検証するパスの一覧 |
| `src/features/team/schema-parts.ts` | `teamNameSchema`（全スライス共有） |
| `src/features/team/repository.ts` | 読み出し `listTeamsInTournament` |
| `src/features/team/create/` | チームを作る |
| `src/features/team/rename/` | チーム名を変える |
| `src/features/team/delete/` | チームを消す（所属は外れるだけ） |
| `src/features/team/reorder/` | 表示順を 1 つ動かす |
| `src/features/team/assign-participant/` | 参加者の所属を付け替える／外す |
| `src/components/team/TeamList.tsx` | チームと所属者の一覧 |
| `src/components/team/AddTeamForm.tsx` | チーム追加フォーム |
| `src/components/team/TeamRowActions.tsx` | 改名・削除・並べ替え |
| `src/components/team/AssignParticipantForm.tsx` | 未所属の参加者をチームに入れる |
| `src/app/orgs/[slug]/tournaments/[tournamentId]/teams/page.tsx` | チーム管理画面 |

### Phase 2: TEAM_MATCH 形式

| ファイル | 責務 |
| --- | --- |
| `prisma/schema.prisma` | `DivisionFormat` に `TEAM_MATCH` |
| `src/lib/division/types.ts` | `DivisionEntry.teamId?` / `DivisionEntries.teams?` |
| `src/lib/division/parse.ts` | 上記 2 つの読み取り |
| `src/lib/division/validate.ts` | `validateEntries` を形式対応にする |
| `src/features/division/team-match/build.ts` | 組み合わせの組み立てと形の判定 |
| `src/features/division/matching-strategy.ts` | `TEAM_MATCH` の上限・生成規則 |
| `src/features/division/format.ts` | ラベルと `needsParticipants` |
| `src/features/division/set-teams/` | 2 チームを選ぶ |
| `src/features/division/set-lineup/` | 1 チームの出場順を保存する |
| `src/components/division/TeamMatchSetup.tsx` | 設定画面の本体 |
| `src/components/division/TeamLineupForm.tsx` | 1 チームぶんのオーダー編集（client component） |
| `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/team/page.tsx` | 団体戦の設定画面 |

### Phase 3: 集計と表示

| ファイル | 責務 |
| --- | --- |
| `src/features/division/team-match/standings.ts` | 勝利数 → 本数 → 引き分けの集計 |
| `src/features/division/record-result/schema.ts` | `"draw"` 番兵 |
| `src/components/result/MatchResultRow.tsx` | 「引分」ボタン |
| `src/components/division/prepare-team-match-table.ts` | Json のパースと形の検査 |
| `src/components/division/TeamMatchTable.tsx` | 団体戦の結果表 |
| `src/components/division/DivisionMatchingView.tsx` | 形式ディスパッチ |
| `src/components/print/PrintDivisionSection.tsx` | 印刷の団体戦の節 |
| `docs/code-design/architecture.md` | 団体戦の節を追記 |

---

## Phase 1: Team の基盤

### Task 1: Team テーブルと移行マイグレーション

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_team/migration.sql`
- Modify: `src/features/participant/repository.ts`
- Modify: `src/features/division/repository.ts`

**Interfaces:**
- Consumes: なし（最初のタスク）
- Produces: Prisma の `Team` モデル（`id: string` / `tournamentId: string` / `name: string` / `order: number`）と `Participant.teamId: string | null` / `Participant.team: Team | null`。後続タスクはすべてこれを前提にする

- [ ] **Step 1: schema.prisma に Team を足す**

`prisma/schema.prisma` の `Member` モデルの直後に足す。

```prisma
/// チーム。大会単位のマスタで、団体戦部門から参照する。
/// 大会をまたいでは使い回さない（同じ学校でも大会ごとに別の行になる）。
model Team {
  id           String   @id @default(uuid())
  tournamentId String
  name         String
  /// 大会内での表示順。0 始まり。
  order        Int
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  tournament   Tournament    @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  participants Participant[]

  @@unique([tournamentId, order])
  @@index([tournamentId])
}
```

`Tournament` モデルのリレーションに 1 行足す。

```prisma
  scheduleItems ScheduleItem[]
  teams         Team[]
```

`Participant` モデルの `team String?` を削り、代わりに次を書く。

```prisma
  /// 所属チーム。チームを消しても参加者は大会に残るので SetNull。
  teamId       String?
```

リレーションの側は `member` の下に足す。

```prisma
  member     Member     @relation(fields: [memberId], references: [id], onDelete: Restrict)
  team       Team?      @relation(fields: [teamId], references: [id], onDelete: SetNull)
```

インデックスに 1 行足す。

```prisma
  @@index([memberId])
  @@index([teamId])
```

- [ ] **Step 2: マイグレーションの雛形を作る**

Run: `pnpm exec prisma migrate dev --create-only --name add_team`
Expected: `prisma/migrations/<timestamp>_add_team/migration.sql` が生成され、`Applying migration` は走らない

- [ ] **Step 3: migration.sql をデータ移行つきに書き換える**

生成された SQL を次の内容で**丸ごと置き換える**（Prisma は旧列の DROP を先に出すため、順序を自分で組み直す必要がある）。

```sql
-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Team_tournamentId_idx" ON "Team"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_tournamentId_order_key" ON "Team"("tournamentId", "order");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_tournamentId_fkey"
  FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Participant" ADD COLUMN "teamId" TEXT;

-- DataMigration: 既存の自由文字列 Participant.team を Team 行に移す。
-- 大会ごとに非空の distinct な値を名前順に並べ、order を 0 始まりで振る。
-- 窓関数は DISTINCT より先に評価されるため、distinct を副問い合わせに分ける。
INSERT INTO "Team" ("id", "tournamentId", "name", "order", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    d."tournamentId",
    d."team",
    (ROW_NUMBER() OVER (PARTITION BY d."tournamentId" ORDER BY d."team"))::int - 1,
    NOW(),
    NOW()
FROM (
    SELECT DISTINCT "tournamentId", "team"
    FROM "Participant"
    WHERE "team" IS NOT NULL AND "team" <> ''
) d;

UPDATE "Participant" p
SET "teamId" = t."id"
FROM "Team" t
WHERE t."tournamentId" = p."tournamentId" AND t."name" = p."team";

-- AlterTable: 移行が済んだので旧列を落とす。所属の情報源を 1 つにする。
ALTER TABLE "Participant" DROP COLUMN "team";

-- CreateIndex
CREATE INDEX "Participant_teamId_idx" ON "Participant"("teamId");

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 4: マイグレーションを適用してクライアントを再生成**

Run: `pnpm db:migrate`
Expected: `The following migration(s) have been applied` に `add_team` が出て、`Generated Prisma Client` で終わる

ローカル DB に drift がある場合は `pnpm exec prisma migrate status` で確認してから進める（DB は全ワークツリー共通）。

- [ ] **Step 5: repository の select を読み替える（型エラーを潰す）**

Run: `pnpm typecheck`
Expected: `src/features/participant/repository.ts` と `src/features/division/repository.ts` で `team` が Prisma の select に無いという型エラーが出る

`src/features/participant/repository.ts` の select を直す。

```ts
        team: { select: { name: true } },
```

DTO へ写す箇所を直す（`team?: string` という公開の型は変えない）。

```ts
      // team は省略可能なプロパティ。未所属の null は運ばない。
      team: row.team?.name ?? undefined,
```

`src/features/division/repository.ts` も同じ 2 か所を同じ内容で直す。

- [ ] **Step 6: 型検査とテストを通す**

Run: `pnpm typecheck`
Expected: エラーなし（終了コード 0）

Run: `pnpm test`
Expected: 全件 PASS。`ParticipantList.test.tsx` などは DTO の形が変わっていないので手を入れずに通る

- [ ] **Step 7: コミット**

```bash
git add prisma/schema.prisma prisma/migrations src/features/participant/repository.ts src/features/division/repository.ts src/generated/prisma
git commit -m "$(cat <<'EOF'
feat(team): 大会単位の Team テーブルを足す

Participant.team（自由文字列）を Team 行へ移し、Participant.teamId から
参照する形にする。所属の情報源を 1 つにするため旧列は落とす。
表示側の DTO は team?: string のまま変えないので画面は触らない。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: features/team の土台

**Files:**
- Create: `src/features/team/scope.ts`
- Create: `src/features/team/errors.ts`
- Create: `src/features/team/errors.test.ts`
- Create: `src/features/team/messages.ts`
- Create: `src/features/team/messages.test.ts`
- Create: `src/features/team/state.ts`
- Create: `src/features/team/effect-to-form-state.ts`
- Create: `src/features/team/revalidate.ts`
- Create: `src/features/team/schema-parts.ts`
- Create: `src/features/team/repository.ts`
- Create: `src/features/team/repository.test.ts`

**Interfaces:**
- Consumes: Task 1 の `Team` モデル
- Produces:
  - `type TeamIds = { organizationId: string; tournamentId: string }`
  - `type TeamOutcome<T> = { found: false } | { found: true; value: T }`
  - `type TeamError`、`toTeamError(reason: unknown): TeamError`
  - `teamErrorMessage(error: TeamError): string`
  - `type TeamFormState = { error: string | null }`、`INITIAL_TEAM_FORM_STATE`、`type TeamFormAction`
  - `teamErrorFormState(cause: Cause.Cause<TeamError>): TeamFormState`
  - `revalidateTeams(slug: string, tournamentId: string): void`
  - `teamNameSchema: z.ZodString`
  - `type TournamentTeam = { id: string; name: string; order: number; participants: TeamParticipant[] }`
  - `type TeamParticipant = { id: string; name: string; playerNumber: string }`
  - `listTeamsInTournament(organizationId: string, tournamentId: string): Promise<TournamentTeam[]>`
  - `listUnassignedParticipants(organizationId: string, tournamentId: string): Promise<TeamParticipant[]>`

- [ ] **Step 1: 失敗するテストを書く（errors）**

`src/features/team/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TeamNameTakenError, toTeamError, UnexpectedTeamError } from "./errors";

describe("toTeamError", () => {
  it("ドメインエラーはそのまま通す", () => {
    const error = new TeamNameTakenError({ name: "A中学" });
    expect(toTeamError(error)).toBe(error);
  });

  it("それ以外は UnexpectedTeamError に包む", () => {
    const result = toTeamError(new Error("boom"));
    expect(result).toBeInstanceOf(UnexpectedTeamError);
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `pnpm exec vitest run src/features/team/errors.test.ts`
Expected: FAIL（`Failed to resolve import "./errors"`）

- [ ] **Step 3: errors.ts を書く**

```ts
import { Data } from "effect";

export class UnexpectedTeamError extends Data.TaggedError(
  "UnexpectedTeamError",
)<{
  readonly reason: unknown;
}> {}

/** 同じ大会に同じ名前のチームを 2 つ作ろうとした。 */
export class TeamNameTakenError extends Data.TaggedError("TeamNameTakenError")<{
  readonly name: string;
}> {}

export type TeamError = UnexpectedTeamError | TeamNameTakenError;

/**
 * ドメインエラーはそのまま通し、それ以外を包む。
 * トランザクションの中から throw したドメインエラーが
 * Effect.tryPromise の catch までそのまま届くため。
 */
export const toTeamError = (reason: unknown): TeamError =>
  reason instanceof TeamNameTakenError
    ? reason
    : new UnexpectedTeamError({ reason });
```

- [ ] **Step 4: 通ることを確認**

Run: `pnpm exec vitest run src/features/team/errors.test.ts`
Expected: PASS（2 件）

- [ ] **Step 5: 失敗するテストを書く（messages）**

`src/features/team/messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TeamNameTakenError, UnexpectedTeamError } from "./errors";
import { teamErrorMessage } from "./messages";

describe("teamErrorMessage", () => {
  it("名前の重複はチーム名を文言に出す", () => {
    expect(teamErrorMessage(new TeamNameTakenError({ name: "A中学" }))).toBe(
      "「A中学」はすでにこの大会にあります",
    );
  });

  it("想定外は汎用の文言にする", () => {
    expect(teamErrorMessage(new UnexpectedTeamError({ reason: null }))).toBe(
      "処理に失敗しました。時間をおいて再度お試しください",
    );
  });
});
```

- [ ] **Step 6: 実行して失敗を確認**

Run: `pnpm exec vitest run src/features/team/messages.test.ts`
Expected: FAIL（`Failed to resolve import "./messages"`）

- [ ] **Step 7: messages.ts を書く**

```ts
import { Match } from "effect";
import type { TeamError } from "./errors";

export const teamErrorMessage: (error: TeamError) => string =
  Match.type<TeamError>().pipe(
    Match.tag(
      "TeamNameTakenError",
      (error) => `「${error.name}」はすでにこの大会にあります`,
    ),
    Match.tag(
      "UnexpectedTeamError",
      () => "処理に失敗しました。時間をおいて再度お試しください",
    ),
    Match.exhaustive,
  );
```

- [ ] **Step 8: 通ることを確認**

Run: `pnpm exec vitest run src/features/team/messages.test.ts`
Expected: PASS（2 件）

- [ ] **Step 9: テストの無い共有モジュールをまとめて書く**

`src/features/team/scope.ts`:

```ts
/**
 * 所有権の 2 段。チームは大会単位の属性なので部門は要らない。
 * 全スライスがこの形で受け渡す。スライスどうしは import できないため、
 * features/participant/scope.ts と同じくカテゴリ直下に置く。
 */
export type TeamIds = {
  organizationId: string;
  tournamentId: string;
};

/**
 * found: false は「この組織のこの大会が見つからない」。存在しない場合と
 * 権限が無い場合を区別しない。呼び出し側は notFound() へ倒す。
 */
export type TeamOutcome<T> = { found: false } | { found: true; value: T };
```

`src/features/team/state.ts`:

```ts
export type TeamFormState = {
  error: string | null;
};

export const INITIAL_TEAM_FORM_STATE: TeamFormState = {
  error: null,
};

export type TeamFormAction = (
  state: TeamFormState,
  formData: FormData,
) => Promise<TeamFormState>;
```

`src/features/team/effect-to-form-state.ts`:

```ts
import { Cause, Option } from "effect";
import type { TeamError } from "./errors";
import { teamErrorMessage } from "./messages";
import type { TeamFormState } from "./state";

/**
 * Exit-failure → 日本語文言の変換。全スライスが使う。
 * スライスどうしは依存できないため、共有先としてカテゴリ直下に置く。
 */
export const teamErrorFormState = (
  cause: Cause.Cause<TeamError>,
): TeamFormState => {
  const failure = Cause.failureOption(cause);
  return {
    error: Option.isSome(failure)
      ? teamErrorMessage(failure.value)
      : "処理に失敗しました。時間をおいて再度お試しください",
  };
};
```

`src/features/team/revalidate.ts`:

```ts
import { revalidatePath } from "next/cache";

/**
 * チームを変えたあとに再検証すべきページ。
 * 参加者一覧もチーム名を出すので一緒に叩く（公開側も同じ）。
 */
export const revalidateTeams = (slug: string, tournamentId: string): void => {
  revalidatePath(`/orgs/${slug}/tournaments/${tournamentId}/teams`);
  revalidatePath(`/orgs/${slug}/tournaments/${tournamentId}/participants`);
  revalidatePath(`/t/${tournamentId}/participants`);
};
```

`src/features/team/schema-parts.ts`:

```ts
import { z } from "zod";

/** チーム名。全スライスで共有する。 */
export const teamNameSchema = z
  .string()
  .trim()
  .min(1, { message: "チーム名を入力してください" })
  .max(60, { message: "チーム名は60文字以内で入力してください" });
```

- [ ] **Step 10: 失敗するテストを書く（repository）**

`src/features/team/repository.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const participantFindMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    team: { findMany: (args: unknown) => findMany(args) },
    participant: { findMany: (args: unknown) => participantFindMany(args) },
  },
}));

const { listTeamsInTournament, listUnassignedParticipants } = await import(
  "./repository"
);

beforeEach(() => {
  findMany.mockReset();
  participantFindMany.mockReset();
});

describe("listTeamsInTournament", () => {
  it("組織と大会を where に入れて order 昇順で引く", async () => {
    findMany.mockResolvedValue([]);

    await listTeamsInTournament("o1", "t1");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournamentId: "t1", tournament: { organizationId: "o1" } },
        orderBy: { order: "asc" },
      }),
    );
  });

  it("所属者を選手番号の自然順に並べて返す", async () => {
    findMany.mockResolvedValue([
      {
        id: "team1",
        name: "A中学",
        order: 0,
        participants: [
          { id: "p10", playerNumber: "10", member: { name: "鈴木" } },
          { id: "p2", playerNumber: "2", member: { name: "佐藤" } },
        ],
      },
    ]);

    const result = await listTeamsInTournament("o1", "t1");

    expect(result).toEqual([
      {
        id: "team1",
        name: "A中学",
        order: 0,
        participants: [
          { id: "p2", name: "佐藤", playerNumber: "2" },
          { id: "p10", name: "鈴木", playerNumber: "10" },
        ],
      },
    ]);
  });
});

describe("listUnassignedParticipants", () => {
  it("teamId が null の参加者だけを引く", async () => {
    participantFindMany.mockResolvedValue([]);

    await listUnassignedParticipants("o1", "t1");

    expect(participantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tournamentId: "t1",
          teamId: null,
          tournament: { organizationId: "o1" },
        },
      }),
    );
  });
});
```

- [ ] **Step 11: 実行して失敗を確認**

Run: `pnpm exec vitest run src/features/team/repository.test.ts`
Expected: FAIL（`Failed to resolve import "./repository"`）

- [ ] **Step 12: repository.ts を書く**

`src/lib/participant/player-number.ts` に選手番号の自然順比較があるか確認し、無ければ `localeCompare` の数値オプションで並べる。

```ts
import "server-only";
import { prisma } from "@/shared/db/prisma";

/** チームに所属する参加者 1 人ぶんの表示材料。 */
export type TeamParticipant = {
  id: string;
  name: string;
  playerNumber: string;
};

/** チーム 1 つと、その所属者。 */
export type TournamentTeam = {
  id: string;
  name: string;
  order: number;
  participants: TeamParticipant[];
};

/** 選手番号の自然順。"2" が "10" より前に来るようにする。 */
const byPlayerNumber = (left: TeamParticipant, right: TeamParticipant): number =>
  left.playerNumber.localeCompare(right.playerNumber, "ja", { numeric: true });

const toTeamParticipant = (row: {
  id: string;
  playerNumber: string;
  member: { name: string };
}): TeamParticipant => ({
  id: row.id,
  name: row.member.name,
  playerNumber: row.playerNumber,
});

/**
 * 大会のチームを所属者つきで返す。
 * 所有権はリレーションフィルタで担保する。取ってから弾く形にはしない。
 */
export const listTeamsInTournament = async (
  organizationId: string,
  tournamentId: string,
): Promise<TournamentTeam[]> => {
  const rows = await prisma.team.findMany({
    where: { tournamentId, tournament: { organizationId } },
    orderBy: { order: "asc" },
    select: {
      id: true,
      name: true,
      order: true,
      participants: {
        select: { id: true, playerNumber: true, member: { select: { name: true } } },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    order: row.order,
    participants: row.participants.map(toTeamParticipant).sort(byPlayerNumber),
  }));
};

/** まだどのチームにも入っていない参加者。チームへの追加候補になる。 */
export const listUnassignedParticipants = async (
  organizationId: string,
  tournamentId: string,
): Promise<TeamParticipant[]> => {
  const rows = await prisma.participant.findMany({
    where: { tournamentId, teamId: null, tournament: { organizationId } },
    select: { id: true, playerNumber: true, member: { select: { name: true } } },
  });

  return rows.map(toTeamParticipant).sort(byPlayerNumber);
};
```

- [ ] **Step 13: 通ることを確認**

Run: `pnpm exec vitest run src/features/team/`
Expected: PASS（errors 2 件 + messages 2 件 + repository 3 件）

- [ ] **Step 14: 型検査**

Run: `pnpm typecheck`
Expected: エラーなし

- [ ] **Step 15: コミット**

```bash
git add src/features/team
git commit -m "$(cat <<'EOF'
feat(team): features/team の共有モジュールと読み出しを足す

スコープ型・エラー・文言・フォーム状態・再検証・チーム名スキーマと、
チーム一覧／未所属参加者一覧の読み出し。スライスはまだ無い。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: create / rename / delete スライス

**Files:**
- Create: `src/features/team/create/{schema.ts,repository.ts,usecase.ts,handler.ts,repository.test.ts,handler.test.ts}`
- Create: `src/features/team/rename/{schema.ts,repository.ts,usecase.ts,handler.ts,repository.test.ts}`
- Create: `src/features/team/delete/{schema.ts,repository.ts,usecase.ts,handler.ts,repository.test.ts}`

**Interfaces:**
- Consumes: Task 2 の `TeamIds` / `TeamOutcome` / `TeamError` / `toTeamError` / `TeamNameTakenError` / `teamErrorFormState` / `TeamFormState` / `revalidateTeams` / `teamNameSchema`
- Produces:
  - `createTeamAction: TeamFormAction`（`formData`: `slug` / `tournamentId` / `name`）
  - `renameTeamAction: TeamFormAction`（`slug` / `tournamentId` / `teamId` / `name`）
  - `deleteTeamAction: TeamFormAction`（`slug` / `tournamentId` / `teamId`）

- [ ] **Step 1: create の schema / usecase を書く**

`src/features/team/create/schema.ts`:

```ts
import { z } from "zod";
import { teamNameSchema } from "../schema-parts";

export const createTeamSchema = z.object({
  name: teamNameSchema,
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
```

`src/features/team/create/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { TeamError } from "../errors";
import type { TeamIds, TeamOutcome } from "../scope";
import type { CreateTeamPort, CreateTeamResult } from "./repository";
import type { CreateTeamInput } from "./schema";

export const createTeam = (
  port: CreateTeamPort,
  ids: TeamIds,
  input: CreateTeamInput,
): Effect.Effect<TeamOutcome<CreateTeamResult>, TeamError> => port(ids, input);
```

- [ ] **Step 2: create の失敗するリポジトリテストを書く**

`src/features/team/create/repository.test.ts`:

```ts
import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamNameTakenError } from "../errors";

const tournamentFindFirst = vi.fn();
const teamFindFirst = vi.fn();
const teamAggregate = vi.fn();
const teamCreate = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) =>
      Promise.resolve(
        fn({
          tournament: { findFirst: (a: unknown) => tournamentFindFirst(a) },
          team: {
            findFirst: (a: unknown) => teamFindFirst(a),
            aggregate: (a: unknown) => teamAggregate(a),
            create: (a: unknown) => teamCreate(a),
          },
        }),
      ),
  },
}));

const { createTeamInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1" };

beforeEach(() => {
  tournamentFindFirst.mockReset();
  teamFindFirst.mockReset();
  teamAggregate.mockReset();
  teamCreate.mockReset();
  tournamentFindFirst.mockResolvedValue({ id: "t1" });
  teamFindFirst.mockResolvedValue(null);
  teamAggregate.mockResolvedValue({ _max: { order: null } });
  teamCreate.mockResolvedValue({ id: "team1" });
});

describe("createTeamInDb", () => {
  it("大会の所有権を確かめてから作る", async () => {
    await Effect.runPromise(createTeamInDb(ids, { name: "A中学" }));

    expect(tournamentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "t1", organizationId: "o1" } }),
    );
  });

  it("他組織の大会なら found: false を返して作らない", async () => {
    tournamentFindFirst.mockResolvedValue(null);

    const result = await Effect.runPromise(
      createTeamInDb(ids, { name: "A中学" }),
    );

    expect(result).toEqual({ found: false });
    expect(teamCreate).not.toHaveBeenCalled();
  });

  it("最初のチームの order は 0", async () => {
    await Effect.runPromise(createTeamInDb(ids, { name: "A中学" }));

    expect(teamCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { tournamentId: "t1", name: "A中学", order: 0 },
      }),
    );
  });

  it("既存がある場合は末尾に足す", async () => {
    teamAggregate.mockResolvedValue({ _max: { order: 2 } });

    await Effect.runPromise(createTeamInDb(ids, { name: "B中学" }));

    expect(teamCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { tournamentId: "t1", name: "B中学", order: 3 },
      }),
    );
  });

  it("同じ名前があれば TeamNameTakenError", async () => {
    teamFindFirst.mockResolvedValue({ id: "team1" });

    const exit = await Effect.runPromiseExit(
      createTeamInDb(ids, { name: "A中学" }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(exit.cause.toString()).toContain(
        new TeamNameTakenError({ name: "A中学" })._tag,
      );
    }
  });
});
```

- [ ] **Step 3: 実行して失敗を確認**

Run: `pnpm exec vitest run src/features/team/create/repository.test.ts`
Expected: FAIL（`Failed to resolve import "./repository"`）

- [ ] **Step 4: create の repository.ts を書く**

```ts
import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type TeamError, TeamNameTakenError, toTeamError } from "../errors";
import type { TeamIds, TeamOutcome } from "../scope";
import type { CreateTeamInput } from "./schema";

export type CreateTeamResult = { teamId: string };

export type CreateTeamPort = (
  ids: TeamIds,
  input: CreateTeamInput,
) => Effect.Effect<TeamOutcome<CreateTeamResult>, TeamError>;

/**
 * チームを作る。team.create は tournamentId を直接持つため、
 * 同じトランザクションで大会の所属を先に確かめる。ここで確かめないと
 * 他組織の大会 ID を送るだけでチームを作れてしまう。
 *
 * 名前の重複は DB の制約ではなくここで見る。大会が変われば同じ名前を
 * 使ってよいし、既存データの移行で重複が入る余地も残すため。
 */
export const createTeamInDb: CreateTeamPort = (ids, input) =>
  Effect.tryPromise({
    try: () =>
      prisma.$transaction(
        async (tx): Promise<TeamOutcome<CreateTeamResult>> => {
          const tournament = await tx.tournament.findFirst({
            where: { id: ids.tournamentId, organizationId: ids.organizationId },
            select: { id: true },
          });
          if (!tournament) {
            return { found: false };
          }

          const existing = await tx.team.findFirst({
            where: { tournamentId: ids.tournamentId, name: input.name },
            select: { id: true },
          });
          if (existing) {
            throw new TeamNameTakenError({ name: input.name });
          }

          // order は末尾に付ける。@@unique([tournamentId, order]) があるため
          // 最大値 + 1 を取る。1 件も無ければ _max.order は null になる。
          const max = await tx.team.aggregate({
            where: { tournamentId: ids.tournamentId },
            _max: { order: true },
          });

          const created = await tx.team.create({
            data: {
              tournamentId: ids.tournamentId,
              name: input.name,
              order: (max._max.order ?? -1) + 1,
            },
            select: { id: true },
          });

          return { found: true, value: { teamId: created.id } };
        },
      ),
    catch: toTeamError,
  });
```

- [ ] **Step 5: 通ることを確認**

Run: `pnpm exec vitest run src/features/team/create/repository.test.ts`
Expected: PASS（5 件）

- [ ] **Step 6: create の handler.ts を書く**

```ts
"use server";

import { Effect, Exit } from "effect";
import { notFound } from "next/navigation";
import { requirePermission } from "@/shared/middleware/require-organization";
import { teamErrorFormState } from "../effect-to-form-state";
import { revalidateTeams } from "../revalidate";
import type { TeamFormState } from "../state";
import { createTeamInDb } from "./repository";
import { createTeamSchema } from "./schema";
import { createTeam } from "./usecase";

export const createTeamAction = async (
  _prevState: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  // 画面でフォームを隠していても Server Action は直接叩ける。境界はここ。
  const { organization } = await requirePermission(slug, "tournament.edit");

  const parsed = createTeamSchema.safeParse({
    name: String(formData.get("name") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    createTeam(
      createTeamInDb,
      { organizationId: organization.id, tournamentId },
      parsed.data,
    ),
  );

  if (Exit.isFailure(exit)) {
    return teamErrorFormState(exit.cause);
  }
  // 見つからないことと権限が無いことを区別させないため 404 に倒す。
  if (!exit.value.found) {
    notFound();
  }

  revalidateTeams(slug, tournamentId);
  return { error: null };
};
```

- [ ] **Step 7: create の失敗するハンドラテストを書く**

`src/features/team/create/handler.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineAbilityFor, PERMISSION_CODES } from "@/shared/authz/ability";
import { INITIAL_TEAM_FORM_STATE } from "../state";

const requirePermission = vi.fn();
const createTeamInDb = vi.fn();
const revalidatePath = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/shared/middleware/require-organization", () => ({
  requirePermission: (slug: string, code: string) =>
    requirePermission(slug, code),
}));
vi.mock("./repository", () => ({
  createTeamInDb: (ids: unknown, input: unknown) => createTeamInDb(ids, input),
}));
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));

const { createTeamAction } = await import("./handler");

const organization = {
  id: "o1",
  name: "剣道部",
  slug: "kendo-club",
};

const buildFormData = (name: string): FormData => {
  const data = new FormData();
  data.set("slug", organization.slug);
  data.set("tournamentId", "t1");
  data.set("name", name);
  return data;
};

beforeEach(() => {
  requirePermission.mockReset();
  createTeamInDb.mockReset();
  revalidatePath.mockReset();
  notFound.mockReset();
  requirePermission.mockResolvedValue({
    organization,
    session: { user: { id: "u1" } },
    permissionCodes: [...PERMISSION_CODES],
    ability: defineAbilityFor(PERMISSION_CODES),
  });
  notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
  createTeamInDb.mockReturnValue(
    Effect.succeed({ found: true, value: { teamId: "team1" } }),
  );
});

describe("createTeamAction", () => {
  it("Server Action の冒頭でも認可境界を独立に呼ぶ", async () => {
    await createTeamAction(INITIAL_TEAM_FORM_STATE, buildFormData("A中学"));

    expect(requirePermission).toHaveBeenCalledWith(
      "kendo-club",
      "tournament.edit",
    );
  });

  it("空のチーム名は DB に触らずエラーにする", async () => {
    const result = await createTeamAction(
      INITIAL_TEAM_FORM_STATE,
      buildFormData("   "),
    );

    expect(result.error).toBe("チーム名を入力してください");
    expect(createTeamInDb).not.toHaveBeenCalled();
  });

  it("成功したらチーム画面と参加者一覧を再検証する", async () => {
    const result = await createTeamAction(
      INITIAL_TEAM_FORM_STATE,
      buildFormData("A中学"),
    );

    expect(result).toEqual({ error: null });
    expect(revalidatePath).toHaveBeenCalledWith(
      "/orgs/kendo-club/tournaments/t1/teams",
    );
  });

  it("found: false は 404 に倒す", async () => {
    createTeamInDb.mockReturnValue(Effect.succeed({ found: false }));

    await expect(
      createTeamAction(INITIAL_TEAM_FORM_STATE, buildFormData("A中学")),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
```

- [ ] **Step 8: 通ることを確認**

Run: `pnpm exec vitest run src/features/team/create/`
Expected: PASS（repository 5 件 + handler 4 件）

- [ ] **Step 9: rename スライスを書く**

`src/features/team/rename/schema.ts`:

```ts
import { z } from "zod";
import { teamNameSchema } from "../schema-parts";

export const renameTeamSchema = z.object({
  teamId: z.string().min(1, { message: "チームが指定されていません" }),
  name: teamNameSchema,
});

export type RenameTeamInput = z.infer<typeof renameTeamSchema>;
```

`src/features/team/rename/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { TeamError } from "../errors";
import type { TeamIds, TeamOutcome } from "../scope";
import type { RenameTeamPort } from "./repository";
import type { RenameTeamInput } from "./schema";

export const renameTeam = (
  port: RenameTeamPort,
  ids: TeamIds,
  input: RenameTeamInput,
): Effect.Effect<TeamOutcome<null>, TeamError> => port(ids, input);
```

`src/features/team/rename/repository.ts`:

```ts
import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type TeamError, TeamNameTakenError, toTeamError } from "../errors";
import type { TeamIds, TeamOutcome } from "../scope";
import type { RenameTeamInput } from "./schema";

export type RenameTeamPort = (
  ids: TeamIds,
  input: RenameTeamInput,
) => Effect.Effect<TeamOutcome<null>, TeamError>;

/**
 * 名前を変える。where に 2 段の所有条件を残すため update ではなく
 * updateMany を使う。0 件は「この組織のこの大会にそのチームが無い」。
 */
export const renameTeamInDb: RenameTeamPort = (ids, input) =>
  Effect.tryPromise({
    try: () =>
      prisma.$transaction(async (tx): Promise<TeamOutcome<null>> => {
        const taken = await tx.team.findFirst({
          where: {
            tournamentId: ids.tournamentId,
            name: input.name,
            id: { not: input.teamId },
          },
          select: { id: true },
        });
        if (taken) {
          throw new TeamNameTakenError({ name: input.name });
        }

        const updated = await tx.team.updateMany({
          where: {
            id: input.teamId,
            tournamentId: ids.tournamentId,
            tournament: { organizationId: ids.organizationId },
          },
          data: { name: input.name },
        });

        return updated.count === 0
          ? { found: false }
          : { found: true, value: null };
      }),
    catch: toTeamError,
  });
```

`src/features/team/rename/handler.ts`（create の handler と同じ骨格。差分は schema / port / 読み取る formData の項目だけ）:

```ts
"use server";

import { Effect, Exit } from "effect";
import { notFound } from "next/navigation";
import { requirePermission } from "@/shared/middleware/require-organization";
import { teamErrorFormState } from "../effect-to-form-state";
import { revalidateTeams } from "../revalidate";
import type { TeamFormState } from "../state";
import { renameTeamInDb } from "./repository";
import { renameTeamSchema } from "./schema";
import { renameTeam } from "./usecase";

export const renameTeamAction = async (
  _prevState: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const { organization } = await requirePermission(slug, "tournament.edit");

  const parsed = renameTeamSchema.safeParse({
    teamId: String(formData.get("teamId") ?? ""),
    name: String(formData.get("name") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    renameTeam(
      renameTeamInDb,
      { organizationId: organization.id, tournamentId },
      parsed.data,
    ),
  );

  if (Exit.isFailure(exit)) {
    return teamErrorFormState(exit.cause);
  }
  if (!exit.value.found) {
    notFound();
  }

  revalidateTeams(slug, tournamentId);
  return { error: null };
};
```

- [ ] **Step 10: rename のリポジトリテストを書いて通す**

`src/features/team/rename/repository.test.ts` は create のテストと同じ mock の作り（`$transaction` に `team.findFirst` / `team.updateMany` を持つ tx を渡す）で、次の 3 件を確かめる。

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const teamFindFirst = vi.fn();
const teamUpdateMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) =>
      Promise.resolve(
        fn({
          team: {
            findFirst: (a: unknown) => teamFindFirst(a),
            updateMany: (a: unknown) => teamUpdateMany(a),
          },
        }),
      ),
  },
}));

const { renameTeamInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1" };

beforeEach(() => {
  teamFindFirst.mockReset();
  teamUpdateMany.mockReset();
  teamFindFirst.mockResolvedValue(null);
  teamUpdateMany.mockResolvedValue({ count: 1 });
});

describe("renameTeamInDb", () => {
  it("3 段の所有権を where に入れる", async () => {
    await Effect.runPromise(
      renameTeamInDb(ids, { teamId: "team1", name: "A中学" }),
    );

    expect(teamUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "team1",
        tournamentId: "t1",
        tournament: { organizationId: "o1" },
      },
      data: { name: "A中学" },
    });
  });

  it("0 件なら found: false", async () => {
    teamUpdateMany.mockResolvedValue({ count: 0 });

    const result = await Effect.runPromise(
      renameTeamInDb(ids, { teamId: "team1", name: "A中学" }),
    );

    expect(result).toEqual({ found: false });
  });

  it("自分以外に同名があれば書き換えない", async () => {
    teamFindFirst.mockResolvedValue({ id: "team2" });

    await Effect.runPromise(
      renameTeamInDb(ids, { teamId: "team1", name: "A中学" }),
    ).catch(() => undefined);

    expect(teamUpdateMany).not.toHaveBeenCalled();
  });
});
```

Run: `pnpm exec vitest run src/features/team/rename/`
Expected: PASS（3 件）

- [ ] **Step 11: delete スライスを書く**

`src/features/team/delete/schema.ts`:

```ts
import { z } from "zod";

export const deleteTeamSchema = z.object({
  teamId: z.string().min(1, { message: "チームが指定されていません" }),
});

export type DeleteTeamInput = z.infer<typeof deleteTeamSchema>;
```

`src/features/team/delete/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { TeamError } from "../errors";
import type { TeamIds, TeamOutcome } from "../scope";
import type { DeleteTeamPort } from "./repository";
import type { DeleteTeamInput } from "./schema";

export const deleteTeam = (
  port: DeleteTeamPort,
  ids: TeamIds,
  input: DeleteTeamInput,
): Effect.Effect<TeamOutcome<null>, TeamError> => port(ids, input);
```

`src/features/team/delete/repository.ts`:

```ts
import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type TeamError, toTeamError } from "../errors";
import type { TeamIds, TeamOutcome } from "../scope";
import type { DeleteTeamInput } from "./schema";

export type DeleteTeamPort = (
  ids: TeamIds,
  input: DeleteTeamInput,
) => Effect.Effect<TeamOutcome<null>, TeamError>;

/**
 * チームを消す。所属していた参加者は Participant.teamId の
 * onDelete: SetNull で所属が外れるだけで、大会には残る。
 *
 * 団体戦部門の entries.teams がこのチームを指したままになりうるが、
 * その食い違いは設定画面の読み出し（prepare-team-match-table）が
 * 案内に倒して吸収する。ここで部門の Json を書き換えには行かない。
 */
export const deleteTeamInDb: DeleteTeamPort = (ids, input) =>
  Effect.tryPromise({
    try: async (): Promise<TeamOutcome<null>> => {
      const deleted = await prisma.team.deleteMany({
        where: {
          id: input.teamId,
          tournamentId: ids.tournamentId,
          tournament: { organizationId: ids.organizationId },
        },
      });
      return deleted.count === 0
        ? { found: false }
        : { found: true, value: null };
    },
    catch: toTeamError,
  });
```

`src/features/team/delete/handler.ts` は rename の handler と同じ骨格で、`renameTeamSchema` → `deleteTeamSchema`、`renameTeamInDb` → `deleteTeamInDb`、`renameTeam` → `deleteTeam`、`safeParse` に渡すのは `teamId` のみに置き換える。

```ts
"use server";

import { Effect, Exit } from "effect";
import { notFound } from "next/navigation";
import { requirePermission } from "@/shared/middleware/require-organization";
import { teamErrorFormState } from "../effect-to-form-state";
import { revalidateTeams } from "../revalidate";
import type { TeamFormState } from "../state";
import { deleteTeamInDb } from "./repository";
import { deleteTeamSchema } from "./schema";
import { deleteTeam } from "./usecase";

export const deleteTeamAction = async (
  _prevState: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const { organization } = await requirePermission(slug, "tournament.edit");

  const parsed = deleteTeamSchema.safeParse({
    teamId: String(formData.get("teamId") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    deleteTeam(
      deleteTeamInDb,
      { organizationId: organization.id, tournamentId },
      parsed.data,
    ),
  );

  if (Exit.isFailure(exit)) {
    return teamErrorFormState(exit.cause);
  }
  if (!exit.value.found) {
    notFound();
  }

  revalidateTeams(slug, tournamentId);
  return { error: null };
};
```

- [ ] **Step 12: delete のリポジトリテストを書いて通す**

`src/features/team/delete/repository.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: { team: { deleteMany: (a: unknown) => deleteMany(a) } },
}));

const { deleteTeamInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1" };

beforeEach(() => {
  deleteMany.mockReset();
  deleteMany.mockResolvedValue({ count: 1 });
});

describe("deleteTeamInDb", () => {
  it("3 段の所有権を where に入れる", async () => {
    await Effect.runPromise(deleteTeamInDb(ids, { teamId: "team1" }));

    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        id: "team1",
        tournamentId: "t1",
        tournament: { organizationId: "o1" },
      },
    });
  });

  it("0 件なら found: false", async () => {
    deleteMany.mockResolvedValue({ count: 0 });

    const result = await Effect.runPromise(
      deleteTeamInDb(ids, { teamId: "team1" }),
    );

    expect(result).toEqual({ found: false });
  });
});
```

Run: `pnpm exec vitest run src/features/team/`
Expected: PASS（errors 2 + messages 2 + repository 3 + create 9 + rename 3 + delete 2 = 21 件）

- [ ] **Step 13: 型検査と lint**

Run: `pnpm typecheck`
Expected: エラーなし

Run: `pnpm exec biome check src/features/team`
Expected: CRLF 由来の `format` エラー以外が出ないこと。出たら `pnpm exec biome check --write src/features/team` で直す

- [ ] **Step 14: コミット**

```bash
git add src/features/team
git commit -m "$(cat <<'EOF'
feat(team): チームの作成・改名・削除スライスを足す

所有権はすべて where に入れ、0 件は found: false として handler が
notFound() に倒す。同じ大会での名前の重複は TeamNameTakenError で弾く。
チームを消しても参加者は SetNull で大会に残る。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: reorder スライス

**Files:**
- Create: `src/features/team/reorder/{schema.ts,repository.ts,usecase.ts,handler.ts,repository.test.ts}`

**Interfaces:**
- Consumes: Task 2 の共有モジュール
- Produces: `reorderTeamAction: TeamFormAction`（`slug` / `tournamentId` / `teamId` / `direction` が `"up"` か `"down"`）

- [ ] **Step 1: schema.ts と usecase.ts を書く**

```ts
import { z } from "zod";

export const reorderTeamSchema = z.object({
  teamId: z.string().min(1, { message: "チームが指定されていません" }),
  direction: z.enum(["up", "down"]),
});

export type ReorderTeamInput = z.infer<typeof reorderTeamSchema>;
```

```ts
import type { Effect } from "effect";
import type { TeamError } from "../errors";
import type { TeamIds } from "../scope";
import type { ReorderTeamPort, ReorderTeamResult } from "./repository";
import type { ReorderTeamInput } from "./schema";

export const reorderTeam = (
  port: ReorderTeamPort,
  ids: TeamIds,
  input: ReorderTeamInput,
): Effect.Effect<ReorderTeamResult, TeamError> => port(ids, input);
```

- [ ] **Step 2: 失敗するテストを書く**

`src/features/team/reorder/repository.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();
const updateMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) =>
      Promise.resolve(
        fn({
          team: {
            findFirst: (a: unknown) => findFirst(a),
            updateMany: (a: unknown) => updateMany(a),
          },
        }),
      ),
  },
}));

const { reorderTeamInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1" };

beforeEach(() => {
  findFirst.mockReset();
  updateMany.mockReset();
  updateMany.mockResolvedValue({ count: 1 });
});

describe("reorderTeamInDb", () => {
  it("隣が無ければ何も書かずに swapped: false を返す", async () => {
    findFirst
      .mockResolvedValueOnce({ id: "team1", order: 0 })
      .mockResolvedValueOnce(null);

    const result = await Effect.runPromise(
      reorderTeamInDb(ids, { teamId: "team1", direction: "up" }),
    );

    expect(result).toEqual({ swapped: false });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("対象が見つからなくても swapped: false（存在を漏らさない）", async () => {
    findFirst.mockResolvedValueOnce(null);

    const result = await Effect.runPromise(
      reorderTeamInDb(ids, { teamId: "team1", direction: "up" }),
    );

    expect(result).toEqual({ swapped: false });
  });

  it("退避を挟んで 3 回書き、order を入れ替える", async () => {
    findFirst
      .mockResolvedValueOnce({ id: "team2", order: 1 })
      .mockResolvedValueOnce({ id: "team1", order: 0 });

    const result = await Effect.runPromise(
      reorderTeamInDb(ids, { teamId: "team2", direction: "up" }),
    );

    expect(result).toEqual({ swapped: true });
    expect(updateMany).toHaveBeenCalledTimes(3);
    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "team2", tournamentId: "t1" },
      data: { order: -1 },
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "team1", tournamentId: "t1" },
      data: { order: 1 },
    });
    expect(updateMany).toHaveBeenNthCalledWith(3, {
      where: { id: "team2", tournamentId: "t1" },
      data: { order: 0 },
    });
  });
});
```

- [ ] **Step 3: 実行して失敗を確認**

Run: `pnpm exec vitest run src/features/team/reorder/repository.test.ts`
Expected: FAIL（`Failed to resolve import "./repository"`）

- [ ] **Step 4: repository.ts を書く**

```ts
import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type TeamError, toTeamError } from "../errors";
import type { TeamIds } from "../scope";
import type { ReorderTeamInput } from "./schema";

/**
 * 退避用の order。@@unique([tournamentId, order]) があるため、
 * 2 行の order をそのまま入れ替えると途中で必ず衝突する。
 * features/division/reorder/repository.ts と同じ手口。
 */
const PARKING_ORDER = -1;

export type ReorderTeamResult = { swapped: boolean };

export type ReorderTeamPort = (
  ids: TeamIds,
  input: ReorderTeamInput,
) => Effect.Effect<ReorderTeamResult, TeamError>;

/**
 * 隣のチームと表示順を入れ替える。
 *
 * swapped: false は「端まで来ている」と「そのチームが無い」の両方を表す。
 * features/division/reorder と同じで、どちらも成功として返すことで
 * 存在の有無を漏らさない。
 */
export const reorderTeamInDb: ReorderTeamPort = (ids, input) =>
  Effect.tryPromise({
    try: () =>
      prisma.$transaction(async (tx): Promise<ReorderTeamResult> => {
        const target = await tx.team.findFirst({
          where: {
            id: input.teamId,
            tournamentId: ids.tournamentId,
            tournament: { organizationId: ids.organizationId },
          },
          select: { id: true, order: true },
        });
        if (!target) {
          return { swapped: false };
        }

        const neighbor = await tx.team.findFirst({
          where: {
            tournamentId: ids.tournamentId,
            order:
              input.direction === "up"
                ? { lt: target.order }
                : { gt: target.order },
          },
          orderBy: { order: input.direction === "up" ? "desc" : "asc" },
          select: { id: true, order: true },
        });
        if (!neighbor) {
          return { swapped: false };
        }

        await tx.team.updateMany({
          where: { id: target.id, tournamentId: ids.tournamentId },
          data: { order: PARKING_ORDER },
        });
        await tx.team.updateMany({
          where: { id: neighbor.id, tournamentId: ids.tournamentId },
          data: { order: target.order },
        });
        await tx.team.updateMany({
          where: { id: target.id, tournamentId: ids.tournamentId },
          data: { order: neighbor.order },
        });

        return { swapped: true };
      }),
    catch: toTeamError,
  });
```

- [ ] **Step 5: 通ることを確認**

Run: `pnpm exec vitest run src/features/team/reorder/repository.test.ts`
Expected: PASS（3 件）

- [ ] **Step 6: handler.ts を書く**

```ts
"use server";

import { Effect, Exit } from "effect";
import { requirePermission } from "@/shared/middleware/require-organization";
import { teamErrorFormState } from "../effect-to-form-state";
import { revalidateTeams } from "../revalidate";
import type { TeamFormState } from "../state";
import { reorderTeamInDb } from "./repository";
import { reorderTeamSchema } from "./schema";
import { reorderTeam } from "./usecase";

/**
 * 並べ替えは 404 に倒さない。端まで来ている場合とチームが無い場合を
 * 区別せず、どちらも成功として返す（features/division/reorder と同じ）。
 */
export const reorderTeamAction = async (
  _prevState: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const { organization } = await requirePermission(slug, "tournament.edit");

  const parsed = reorderTeamSchema.safeParse({
    teamId: String(formData.get("teamId") ?? ""),
    direction: String(formData.get("direction") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    reorderTeam(
      reorderTeamInDb,
      { organizationId: organization.id, tournamentId },
      parsed.data,
    ),
  );

  if (Exit.isFailure(exit)) {
    return teamErrorFormState(exit.cause);
  }

  revalidateTeams(slug, tournamentId);
  return { error: null };
};
```

- [ ] **Step 7: 型検査とコミット**

Run: `pnpm typecheck`
Expected: エラーなし

```bash
git add src/features/team/reorder
git commit -m "$(cat <<'EOF'
feat(team): チームの表示順を入れ替えるスライスを足す

@@unique([tournamentId, order]) があるため、features/division/reorder と
同じく order = -1 へ退避してから 3 回書く。端まで来ている場合と対象が
無い場合はどちらも swapped: false にして、存在の有無を漏らさない。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: assign-participant スライス

**Files:**
- Create: `src/features/team/assign-participant/{schema.ts,repository.ts,usecase.ts,handler.ts,repository.test.ts}`

**Interfaces:**
- Consumes: Task 2 の共有モジュール
- Produces: `assignParticipantToTeamAction: TeamFormAction`（`slug` / `tournamentId` / `participantId` / `teamId`。`teamId` が空文字なら所属を外す）

- [ ] **Step 1: schema.ts と usecase.ts を書く**

```ts
import { z } from "zod";

/**
 * teamId が空文字なら所属を外す。付ける／外すで別スライスにすると
 * 画面のフォームが 2 つに割れるため、1 つの操作にまとめる。
 */
export const assignParticipantSchema = z.object({
  participantId: z
    .string()
    .min(1, { message: "参加者が指定されていません" }),
  teamId: z.string(),
});

export type AssignParticipantInput = z.infer<typeof assignParticipantSchema>;
```

```ts
import type { Effect } from "effect";
import type { TeamError } from "../errors";
import type { TeamIds, TeamOutcome } from "../scope";
import type { AssignParticipantPort } from "./repository";
import type { AssignParticipantInput } from "./schema";

export const assignParticipant = (
  port: AssignParticipantPort,
  ids: TeamIds,
  input: AssignParticipantInput,
): Effect.Effect<TeamOutcome<null>, TeamError> => port(ids, input);
```

- [ ] **Step 2: 失敗するテストを書く**

`src/features/team/assign-participant/repository.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const teamFindFirst = vi.fn();
const participantUpdateMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) =>
      Promise.resolve(
        fn({
          team: { findFirst: (a: unknown) => teamFindFirst(a) },
          participant: {
            updateMany: (a: unknown) => participantUpdateMany(a),
          },
        }),
      ),
  },
}));

const { assignParticipantInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1" };

beforeEach(() => {
  teamFindFirst.mockReset();
  participantUpdateMany.mockReset();
  teamFindFirst.mockResolvedValue({ id: "team1" });
  participantUpdateMany.mockResolvedValue({ count: 1 });
});

describe("assignParticipantInDb", () => {
  it("チームの所属を where で確かめてから張る", async () => {
    await Effect.runPromise(
      assignParticipantInDb(ids, {
        participantId: "p1",
        teamId: "team1",
      }),
    );

    expect(teamFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "team1",
          tournamentId: "t1",
          tournament: { organizationId: "o1" },
        },
      }),
    );
    expect(participantUpdateMany).toHaveBeenCalledWith({
      where: { id: "p1", tournamentId: "t1" },
      data: { teamId: "team1" },
    });
  });

  it("他の大会のチーム ID なら found: false で何も書かない", async () => {
    teamFindFirst.mockResolvedValue(null);

    const result = await Effect.runPromise(
      assignParticipantInDb(ids, { participantId: "p1", teamId: "team9" }),
    );

    expect(result).toEqual({ found: false });
    expect(participantUpdateMany).not.toHaveBeenCalled();
  });

  it("空文字なら所属を外し、チームの確認はしない", async () => {
    await Effect.runPromise(
      assignParticipantInDb(ids, { participantId: "p1", teamId: "" }),
    );

    expect(teamFindFirst).not.toHaveBeenCalled();
    expect(participantUpdateMany).toHaveBeenCalledWith({
      where: { id: "p1", tournamentId: "t1" },
      data: { teamId: null },
    });
  });

  it("参加者が大会に無ければ found: false", async () => {
    participantUpdateMany.mockResolvedValue({ count: 0 });

    const result = await Effect.runPromise(
      assignParticipantInDb(ids, { participantId: "p9", teamId: "" }),
    );

    expect(result).toEqual({ found: false });
  });
});
```

- [ ] **Step 3: 実行して失敗を確認**

Run: `pnpm exec vitest run src/features/team/assign-participant/repository.test.ts`
Expected: FAIL（`Failed to resolve import "./repository"`）

- [ ] **Step 4: repository.ts を書く**

```ts
import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type TeamError, toTeamError } from "../errors";
import type { TeamIds, TeamOutcome } from "../scope";
import type { AssignParticipantInput } from "./schema";

export type AssignParticipantPort = (
  ids: TeamIds,
  input: AssignParticipantInput,
) => Effect.Effect<TeamOutcome<null>, TeamError>;

/**
 * 参加者の所属を付け替える。teamId が空文字なら外す。
 *
 * 参加者の側は updateMany の where に tournamentId を入れて担保し、
 * その tournamentId 自体は付け先チームの findFirst（3 段の where）で
 * 確かめている。外す場合はチームを見ないため、参加者の 0 件だけが
 * 「この大会にその参加者が無い」の判定になる。
 */
export const assignParticipantInDb: AssignParticipantPort = (ids, input) =>
  Effect.tryPromise({
    try: () =>
      prisma.$transaction(async (tx): Promise<TeamOutcome<null>> => {
        if (input.teamId !== "") {
          const team = await tx.team.findFirst({
            where: {
              id: input.teamId,
              tournamentId: ids.tournamentId,
              tournament: { organizationId: ids.organizationId },
            },
            select: { id: true },
          });
          if (!team) {
            return { found: false };
          }
        }

        const updated = await tx.participant.updateMany({
          where: { id: input.participantId, tournamentId: ids.tournamentId },
          data: { teamId: input.teamId === "" ? null : input.teamId },
        });

        return updated.count === 0
          ? { found: false }
          : { found: true, value: null };
      }),
    catch: toTeamError,
  });
```

- [ ] **Step 5: 通ることを確認**

Run: `pnpm exec vitest run src/features/team/assign-participant/repository.test.ts`
Expected: PASS（4 件）

- [ ] **Step 6: handler.ts を書く**

```ts
"use server";

import { Effect, Exit } from "effect";
import { notFound } from "next/navigation";
import { requirePermission } from "@/shared/middleware/require-organization";
import { teamErrorFormState } from "../effect-to-form-state";
import { revalidateTeams } from "../revalidate";
import type { TeamFormState } from "../state";
import { assignParticipantInDb } from "./repository";
import { assignParticipantSchema } from "./schema";
import { assignParticipant } from "./usecase";

export const assignParticipantToTeamAction = async (
  _prevState: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const { organization } = await requirePermission(slug, "tournament.edit");

  const parsed = assignParticipantSchema.safeParse({
    participantId: String(formData.get("participantId") ?? ""),
    teamId: String(formData.get("teamId") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    assignParticipant(
      assignParticipantInDb,
      { organizationId: organization.id, tournamentId },
      parsed.data,
    ),
  );

  if (Exit.isFailure(exit)) {
    return teamErrorFormState(exit.cause);
  }
  if (!exit.value.found) {
    notFound();
  }

  revalidateTeams(slug, tournamentId);
  return { error: null };
};
```

- [ ] **Step 7: 全体のテストと型検査**

Run: `pnpm test`
Expected: 全件 PASS

Run: `pnpm typecheck`
Expected: エラーなし

- [ ] **Step 8: コミット**

```bash
git add src/features/team/assign-participant
git commit -m "$(cat <<'EOF'
feat(team): 参加者の所属を付け替えるスライスを足す

teamId が空文字なら所属を外す。付け先チームは 3 段の where で
確かめてから張るので、他の大会のチーム ID を送っても通らない。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: チーム管理画面

**Files:**
- Create: `src/components/team/AddTeamForm.tsx`
- Create: `src/components/team/AddTeamForm.test.tsx`
- Create: `src/components/team/TeamRowActions.tsx`
- Create: `src/components/team/AssignParticipantForm.tsx`
- Create: `src/components/team/TeamList.tsx`
- Create: `src/components/team/TeamList.test.tsx`
- Create: `src/app/orgs/[slug]/tournaments/[tournamentId]/teams/page.tsx`
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/page.tsx`（チーム画面への導線）

**Interfaces:**
- Consumes: Task 2〜5 のアクション（`createTeamAction` / `renameTeamAction` / `deleteTeamAction` / `reorderTeamAction` / `assignParticipantToTeamAction`）、`listTeamsInTournament` / `listUnassignedParticipants` / `TournamentTeam` / `TeamParticipant`
- Produces: `/orgs/[slug]/tournaments/[tournamentId]/teams` のページ

- [ ] **Step 1: AddTeamForm の失敗するテストを書く**

`src/components/team/AddTeamForm.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AddTeamForm } from "./AddTeamForm";

describe("AddTeamForm", () => {
  it("slug と tournamentId を hidden で送る", () => {
    const { container } = render(
      <AddTeamForm
        slug="kendo-club"
        tournamentId="t1"
        action={vi.fn()}
      />,
    );

    expect(container.querySelector('input[name="slug"]')).toHaveValue(
      "kendo-club",
    );
    expect(container.querySelector('input[name="tournamentId"]')).toHaveValue(
      "t1",
    );
  });

  it("チーム名の入力欄と追加ボタンを出す", () => {
    render(<AddTeamForm slug="s" tournamentId="t1" action={vi.fn()} />);

    expect(screen.getByLabelText("チーム名")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "追加" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `pnpm exec vitest run src/components/team/AddTeamForm.test.tsx`
Expected: FAIL（`Failed to resolve import "./AddTeamForm"`）

- [ ] **Step 3: AddTeamForm.tsx を書く**

```tsx
"use client";

import { useActionState, useId } from "react";
import {
  INITIAL_TEAM_FORM_STATE,
  type TeamFormAction,
} from "@/features/team/state";

/** 大会にチームを 1 つ足すフォーム。 */
export function AddTeamForm({
  slug,
  tournamentId,
  action,
}: {
  slug: string;
  tournamentId: string;
  action: TeamFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_TEAM_FORM_STATE,
  );
  const nameId = useId();

  return (
    <form
      action={formAction}
      className="space-y-2 rounded border border-slate-200 bg-white p-4"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <label
        htmlFor={nameId}
        className="block text-sm font-medium text-slate-700"
      >
        チーム名
      </label>
      <div className="flex gap-2">
        <input
          id={nameId}
          name="name"
          required
          maxLength={60}
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-400"
        >
          追加
        </button>
      </div>
      {state.error !== null && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
    </form>
  );
}
```

- [ ] **Step 4: 通ることを確認**

Run: `pnpm exec vitest run src/components/team/AddTeamForm.test.tsx`
Expected: PASS（2 件）

- [ ] **Step 5: TeamRowActions.tsx を書く**

`useActionState` は 1 行に 1 つ要るため、行ごとのコンポーネントにする（`RemoveParticipantButton` と同じ理由）。

```tsx
"use client";

import { useActionState, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { TournamentTeam } from "@/features/team/repository";
import {
  INITIAL_TEAM_FORM_STATE,
  type TeamFormAction,
} from "@/features/team/state";

/** 1 チームぶんの改名・並べ替え・削除。 */
export function TeamRowActions({
  slug,
  tournamentId,
  team,
  renameAction,
  reorderAction,
  deleteAction,
}: {
  slug: string;
  tournamentId: string;
  team: TournamentTeam;
  renameAction: TeamFormAction;
  reorderAction: TeamFormAction;
  deleteAction: TeamFormAction;
}) {
  const [renameState, renameFormAction, renaming] = useActionState(
    renameAction,
    INITIAL_TEAM_FORM_STATE,
  );
  const [, reorderFormAction, reordering] = useActionState(
    reorderAction,
    INITIAL_TEAM_FORM_STATE,
  );
  const [, deleteFormAction, deleting] = useActionState(
    deleteAction,
    INITIAL_TEAM_FORM_STATE,
  );
  const [confirming, setConfirming] = useState(false);

  const hidden = (
    <>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="teamId" value={team.id} />
    </>
  );

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <form action={renameFormAction} className="flex items-center gap-1">
          {hidden}
          <input
            name="name"
            defaultValue={team.name}
            required
            maxLength={60}
            aria-label={`${team.name} のチーム名`}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <button
            type="submit"
            disabled={renaming}
            className="rounded border border-slate-300 px-3 py-1 text-xs disabled:text-slate-400"
          >
            保存
          </button>
        </form>

        <form action={reorderFormAction} className="flex gap-1">
          {hidden}
          <button
            type="submit"
            name="direction"
            value="up"
            disabled={reordering}
            aria-label={`${team.name} を上へ`}
            className="rounded border border-slate-300 px-2 py-1 text-xs disabled:text-slate-400"
          >
            ▲
          </button>
          <button
            type="submit"
            name="direction"
            value="down"
            disabled={reordering}
            aria-label={`${team.name} を下へ`}
            className="rounded border border-slate-300 px-2 py-1 text-xs disabled:text-slate-400"
          >
            ▼
          </button>
        </form>

        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={deleting}
          className="rounded border border-red-300 px-3 py-1 text-xs text-red-700 disabled:text-slate-400"
        >
          削除
        </button>
      </div>

      {renameState.error !== null && (
        <p className="text-sm text-red-600">{renameState.error}</p>
      )}

      {confirming && (
        <ConfirmDialog
          title={`「${team.name}」を削除しますか`}
          description="所属していた参加者はチームから外れますが、大会には残ります。"
          confirmLabel="削除する"
          onCancel={() => setConfirming(false)}
        >
          <form action={deleteFormAction}>
            {hidden}
            <button
              type="submit"
              className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white"
            >
              削除する
            </button>
          </form>
        </ConfirmDialog>
      )}
    </div>
  );
}
```

`src/components/ui/ConfirmDialog.tsx` の実際の props を読み、合わない場合はそのシグネチャに合わせて呼び出しを直す（`RemoveParticipantButton.tsx` の使い方が手本）。

- [ ] **Step 6: AssignParticipantForm.tsx を書く**

```tsx
"use client";

import { useActionState, useId } from "react";
import type {
  TeamParticipant,
  TournamentTeam,
} from "@/features/team/repository";
import {
  INITIAL_TEAM_FORM_STATE,
  type TeamFormAction,
} from "@/features/team/state";

/**
 * 参加者 1 人の所属を変えるフォーム。teamId の空文字が「所属なし」で、
 * 付ける／外すを 1 つの操作にまとめてある（assign-participant/schema.ts）。
 */
export function AssignParticipantForm({
  slug,
  tournamentId,
  participant,
  teams,
  currentTeamId,
  action,
}: {
  slug: string;
  tournamentId: string;
  participant: TeamParticipant;
  teams: TournamentTeam[];
  currentTeamId: string;
  action: TeamFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_TEAM_FORM_STATE,
  );
  const selectId = useId();

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="participantId" value={participant.id} />
      <label htmlFor={selectId} className="text-sm text-slate-700">
        <span className="mr-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
          No.{participant.playerNumber}
        </span>
        {participant.name}
      </label>
      <select
        id={selectId}
        name="teamId"
        defaultValue={currentTeamId}
        className="rounded border border-slate-300 px-2 py-1 text-sm"
      >
        <option value="">所属なし</option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-slate-300 px-3 py-1 text-xs disabled:text-slate-400"
      >
        変更
      </button>
      {state.error !== null && (
        <span className="text-sm text-red-600">{state.error}</span>
      )}
    </form>
  );
}
```

- [ ] **Step 7: TeamList の失敗するテストを書く**

`src/components/team/TeamList.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TournamentTeam } from "@/features/team/repository";
import { TeamList } from "./TeamList";

const teams: TournamentTeam[] = [
  {
    id: "team1",
    name: "A中学",
    order: 0,
    participants: [{ id: "p1", name: "山田", playerNumber: "1" }],
  },
  { id: "team2", name: "B中学", order: 1, participants: [] },
];

const actions = {
  renameAction: vi.fn(),
  reorderAction: vi.fn(),
  deleteAction: vi.fn(),
  assignAction: vi.fn(),
};

describe("TeamList", () => {
  it("1 チームも無ければ案内を出す", () => {
    render(
      <TeamList
        slug="s"
        tournamentId="t1"
        teams={[]}
        unassigned={[]}
        canEdit
        {...actions}
      />,
    );

    expect(screen.getByText("まだチームがありません")).toBeInTheDocument();
  });

  it("チーム名と所属者を出す", () => {
    render(
      <TeamList
        slug="s"
        tournamentId="t1"
        teams={teams}
        unassigned={[]}
        canEdit={false}
        {...actions}
      />,
    );

    expect(screen.getByText("A中学")).toBeInTheDocument();
    expect(screen.getByText("山田")).toBeInTheDocument();
  });

  it("所属者が居ないチームにはその旨を出す", () => {
    render(
      <TeamList
        slug="s"
        tournamentId="t1"
        teams={teams}
        unassigned={[]}
        canEdit={false}
        {...actions}
      />,
    );

    expect(screen.getByText("所属者なし")).toBeInTheDocument();
  });

  it("canEdit が false なら削除ボタンを出さない", () => {
    render(
      <TeamList
        slug="s"
        tournamentId="t1"
        teams={teams}
        unassigned={[]}
        canEdit={false}
        {...actions}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "削除" }),
    ).not.toBeInTheDocument();
  });

  it("未所属の参加者が居れば所属変更フォームを出す", () => {
    render(
      <TeamList
        slug="s"
        tournamentId="t1"
        teams={teams}
        unassigned={[{ id: "p9", name: "佐藤", playerNumber: "9" }]}
        canEdit
        {...actions}
      />,
    );

    expect(screen.getByText("佐藤")).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: 実行して失敗を確認**

Run: `pnpm exec vitest run src/components/team/TeamList.test.tsx`
Expected: FAIL（`Failed to resolve import "./TeamList"`）

- [ ] **Step 9: TeamList.tsx を書く**

```tsx
import type {
  TeamParticipant,
  TournamentTeam,
} from "@/features/team/repository";
import type { TeamFormAction } from "@/features/team/state";
import { AssignParticipantForm } from "./AssignParticipantForm";
import { TeamRowActions } from "./TeamRowActions";

/**
 * チームと所属者の一覧。並びは repository が order 昇順で決めているので
 * ここでは並べ替えない。canEdit は体感のための出し分けで、境界は
 * 各 Server Action の requirePermission にある。
 */
export function TeamList({
  slug,
  tournamentId,
  teams,
  unassigned,
  canEdit,
  renameAction,
  reorderAction,
  deleteAction,
  assignAction,
}: {
  slug: string;
  tournamentId: string;
  teams: TournamentTeam[];
  unassigned: TeamParticipant[];
  canEdit: boolean;
  renameAction: TeamFormAction;
  reorderAction: TeamFormAction;
  deleteAction: TeamFormAction;
  assignAction: TeamFormAction;
}) {
  if (teams.length === 0) {
    return (
      <p className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-500">
        まだチームがありません
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {teams.map((team) => (
          <li
            key={team.id}
            className="space-y-2 rounded border border-slate-200 bg-white p-4"
          >
            <p className="text-sm font-medium text-slate-800">{team.name}</p>

            {team.participants.length === 0 ? (
              <p className="text-xs text-slate-400">所属者なし</p>
            ) : (
              <ul className="space-y-1">
                {team.participants.map((participant) => (
                  <li key={participant.id}>
                    {canEdit ? (
                      <AssignParticipantForm
                        slug={slug}
                        tournamentId={tournamentId}
                        participant={participant}
                        teams={teams}
                        currentTeamId={team.id}
                        action={assignAction}
                      />
                    ) : (
                      <p className="text-sm text-slate-700">
                        <span className="mr-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                          No.{participant.playerNumber}
                        </span>
                        {participant.name}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {canEdit && (
              <TeamRowActions
                slug={slug}
                tournamentId={tournamentId}
                team={team}
                renameAction={renameAction}
                reorderAction={reorderAction}
                deleteAction={deleteAction}
              />
            )}
          </li>
        ))}
      </ul>

      {canEdit && unassigned.length > 0 && (
        <section className="space-y-2 rounded border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-medium text-slate-700">未所属の参加者</h3>
          <ul className="space-y-1">
            {unassigned.map((participant) => (
              <li key={participant.id}>
                <AssignParticipantForm
                  slug={slug}
                  tournamentId={tournamentId}
                  participant={participant}
                  teams={teams}
                  currentTeamId=""
                  action={assignAction}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 10: 通ることを確認**

Run: `pnpm exec vitest run src/components/team/`
Expected: PASS（AddTeamForm 2 件 + TeamList 5 件）

- [ ] **Step 11: ページを書く**

`src/app/orgs/[slug]/tournaments/[tournamentId]/teams/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { AddTeamForm } from "@/components/team/AddTeamForm";
import { TeamList } from "@/components/team/TeamList";
import { assignParticipantToTeamAction } from "@/features/team/assign-participant/handler";
import { createTeamAction } from "@/features/team/create/handler";
import { deleteTeamAction } from "@/features/team/delete/handler";
import { renameTeamAction } from "@/features/team/rename/handler";
import { reorderTeamAction } from "@/features/team/reorder/handler";
import {
  listTeamsInTournament,
  listUnassignedParticipants,
} from "@/features/team/repository";
import { findTournamentInOrganization } from "@/features/tournament/repository";
import { canByCode } from "@/shared/authz/ability";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function TournamentTeamsPage({
  params,
}: PageProps<"/orgs/[slug]/tournaments/[tournamentId]/teams">) {
  const { slug, tournamentId } = await params;
  // 閲覧は参加者一覧と同じく、組織のメンバーであれば可。
  const { session, organization, ability } = await requireOrganization(slug);

  const tournament = await findTournamentInOrganization(
    organization.id,
    tournamentId,
  );
  if (!tournament) {
    notFound();
  }

  const [teams, unassigned] = await Promise.all([
    listTeamsInTournament(organization.id, tournamentId),
    listUnassignedParticipants(organization.id, tournamentId),
  ]);

  // UI の出し分けは体感のためで、境界は各 Server Action の requirePermission。
  const canEdit = canByCode(ability, "tournament.edit");

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
          { label: "チーム" },
        ]}
        userName={session.user.name}
        userEmail={session.user.email}
      />

      <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        <h1 className="text-xl font-bold text-slate-900">チーム</h1>
        <p className="text-sm text-slate-600">
          団体戦の部門は、ここで作ったチームから 2 つを選んで組みます。
        </p>

        {canEdit && (
          <AddTeamForm
            slug={slug}
            tournamentId={tournamentId}
            action={createTeamAction}
          />
        )}

        <TeamList
          slug={slug}
          tournamentId={tournamentId}
          teams={teams}
          unassigned={unassigned}
          canEdit={canEdit}
          renameAction={renameTeamAction}
          reorderAction={reorderTeamAction}
          deleteAction={deleteTeamAction}
          assignAction={assignParticipantToTeamAction}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 12: 大会詳細から導線を足す**

`src/app/orgs/[slug]/tournaments/[tournamentId]/page.tsx` を開き、「参加者」へのリンクを出している箇所を探して、その隣に同じ書式で次を足す。

```tsx
<Link
  href={`/orgs/${slug}/tournaments/${tournament.id}/teams`}
  className="..."
>
  チーム
</Link>
```

`className` は隣の「参加者」リンクからそのまま写す。

- [ ] **Step 13: 型検査・テスト・lint**

Run: `pnpm typecheck`
Expected: エラーなし。`PageProps<"/orgs/[slug]/tournaments/[tournamentId]/teams">` が未知だと言われたら `pnpm exec next typegen` を実行してから再度確認する

Run: `pnpm test`
Expected: 全件 PASS

Run: `pnpm exec biome check --write src/components/team src/app/orgs`
Expected: 自分が追加した内容に対する指摘が残らないこと

- [ ] **Step 14: 画面を目で確かめる**

Run: `pnpm dev`（バックグラウンド）し、ログに出た実ポートで
`/orgs/<slug>/tournaments/<id>/teams` を開く。`BYPASS_AUTH=1` のときは Cookie に `USER_ID=1` を入れる。

確認すること: チームを追加できる / 名前を変えられる / ▲▼ で並びが変わる / 未所属の参加者をチームに入れられる / 削除すると所属者が「未所属の参加者」に移る

- [ ] **Step 15: コミット**

```bash
git add src/components/team src/app/orgs
git commit -m "$(cat <<'EOF'
feat(team): チーム管理画面を足す

チームの追加・改名・並べ替え・削除と、参加者の所属の付け替えを
1 画面にまとめる。canEdit による出し分けは体感のためで、境界は
各 Server Action の requirePermission にある。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

Phase 1 はここで完結する。団体戦はまだ無いが、チームという概念だけが動く状態になる。

---

## Phase 2: TEAM_MATCH 形式

### Task 7: enum・型・パーサ

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_team_match_format/migration.sql`
- Modify: `src/lib/division/types.ts`
- Modify: `src/lib/division/parse.ts`
- Modify: `src/lib/division/parse.test.ts`

**Interfaces:**
- Consumes: Task 1 の `Team`
- Produces:
  - `DivisionFormat` に `"TEAM_MATCH"`
  - `DivisionEntry` に `teamId?: string`
  - `DivisionEntries` に `teams?: [string, string]`
  - `parseDivisionEntries` が上記 2 つを読む

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/division/parse.test.ts` の `parseDivisionEntries` の describe に足す。

```ts
  it("teamId と teams を読む", () => {
    const result = parseDivisionEntries({
      version: 1,
      teams: ["team1", "team2"],
      entries: [
        { id: "e1", participantId: "p1", seed: 0, teamId: "team1" },
        { id: "e2", participantId: "p2", seed: 0, teamId: "team2" },
      ],
    });

    expect(result.teams).toEqual(["team1", "team2"]);
    expect(result.entries[0].teamId).toBe("team1");
  });

  it("teams が無いときは省略したまま返す（既存データ）", () => {
    const result = parseDivisionEntries({
      version: 1,
      entries: [{ id: "e1", participantId: "p1", seed: 0 }],
    });

    expect(result.teams).toBeUndefined();
    expect(result.entries[0].teamId).toBeUndefined();
  });

  it("teams が 2 件でなければ弾く", () => {
    expect(() =>
      parseDivisionEntries({ version: 1, teams: ["team1"], entries: [] }),
    ).toThrow(DivisionJsonError);
  });

  it("teams の中身が文字列でなければ弾く", () => {
    expect(() =>
      parseDivisionEntries({ version: 1, teams: ["team1", 2], entries: [] }),
    ).toThrow(DivisionJsonError);
  });
```

`DivisionJsonError` がファイル冒頭で import 済みであることを確認する（未 import なら `import { DivisionJsonError, parseDivisionEntries, ... } from "./parse";` に足す）。

- [ ] **Step 2: 実行して失敗を確認**

Run: `pnpm exec vitest run src/lib/division/parse.test.ts`
Expected: FAIL（`result.teams` が `undefined`、不正な `teams` が throw しない）

- [ ] **Step 3: types.ts を直す**

`DivisionEntry` に 1 フィールド足す。

```ts
/** Division.entries の 1 要素。「誰がこの部門に何番シードで出るか」。 */
export type DivisionEntry = {
  /** 部門内で一意。matchingConfig / results はこの id で参照する */
  id: string;
  /** Participant.id */
  participantId: string;
  /**
   * 部門内でのシード順。0 始まり。
   * TEAM_MATCH では「チーム内の出場順」（0 = 先鋒）になり、
   * 一意なのは (teamId, seed) の組に変わる。
   */
  seed: number;
  /** TEAM_MATCH でのみ入る。どちらのチームの選手か（Team.id） */
  teamId?: string;
};
```

`DivisionEntries` に 1 フィールド足す。

```ts
/** Division.entries の全体。 */
export type DivisionEntries = {
  version: 1;
  entries: DivisionEntry[];
  /**
   * TEAM_MATCH でのみ入る。左・右の順に Team.id を 2 つ。
   * 列を増やさずここに置くのは、setup-store.ts の read-modify-write が
   * そのまま使えるため（列を増やすと全スライスがその列を運ぶ必要が出る）。
   */
  teams?: [string, string];
};
```

- [ ] **Step 4: parse.ts を直す**

`parseDivisionEntry` に `teamId` の読み取りを足す。

```ts
const parseDivisionEntry = (value: unknown, path: string): DivisionEntry => {
  const record = asRecord(value, path);
  const parsed: DivisionEntry = {
    id: asString(record.id, `${path}.id`),
    participantId: asString(record.participantId, `${path}.participantId`),
    seed: asInt(record.seed, `${path}.seed`),
  };
  // 省略可能なプロパティ。個人戦の既存データには無い。
  if (record.teamId !== undefined) {
    parsed.teamId = asString(record.teamId, `${path}.teamId`);
  }
  return parsed;
};
```

`parseDivisionEntries` の直前に足す。

```ts
/** entries.teams。TEAM_MATCH でのみ入る 2 件の Team.id。 */
const parseTeams = (value: unknown, path: string): [string, string] => {
  const list = asArray(value, path);
  if (list.length !== 2) {
    return fail(path, "要素 2 個の配列");
  }
  return [asString(list[0], `${path}[0]`), asString(list[1], `${path}[1]`)];
};
```

`parseDivisionEntries` を直す。

```ts
/** Division.entries の Json を検証して返す。不正なら DivisionJsonError。 */
export const parseDivisionEntries = (value: unknown): DivisionEntries => {
  const record = asRecord(value, "entries");
  const parsed: DivisionEntries = {
    version: asVersion1(record.version, "entries.version"),
    entries: asArray(record.entries, "entries.entries").map((item, index) =>
      parseDivisionEntry(item, `entries.entries[${index}]`),
    ),
  };
  if (record.teams !== undefined) {
    parsed.teams = parseTeams(record.teams, "entries.teams");
  }
  return parsed;
};
```

- [ ] **Step 5: 通ることを確認**

Run: `pnpm exec vitest run src/lib/division/parse.test.ts`
Expected: PASS（既存 + 追加 4 件）

- [ ] **Step 6: DivisionFormat に TEAM_MATCH を足す**

`prisma/schema.prisma`:

```prisma
enum DivisionFormat {
  /// シングルエリミネーション
  SINGLE_ELIMINATION
  /// ダブルエリミネーション。勝者トーナメント優勝者と敗者トーナメント優勝者が最終試合を行う。
  DOUBLE_ELIMINATION_GRAND_FINAL
  /// ダブルエリミネーション。敗者トーナメント優勝者が 3 位となる。
  DOUBLE_ELIMINATION_THIRD_PLACE
  /// リーグ（総当たり）
  ROUND_ROBIN
  /// 団体戦。2 チームが同じ人数の選手を並べ、出場順が同じ者どうしが 1 ペアずつ戦う。
  TEAM_MATCH
}
```

- [ ] **Step 7: マイグレーションを作って適用する**

Run: `pnpm exec prisma migrate dev --create-only --name add_team_match_format`

生成された SQL が次の 1 行であることを確認する（PostgreSQL は同じトランザクション内で追加した enum 値を使えないが、この移行では使わないので問題ない）。

```sql
-- AlterEnum
ALTER TYPE "DivisionFormat" ADD VALUE 'TEAM_MATCH';
```

Run: `pnpm db:migrate`
Expected: `add_team_match_format` が適用され、`Generated Prisma Client` で終わる

- [ ] **Step 8: 型検査で分岐の漏れを洗い出す**

Run: `pnpm typecheck`
Expected: 次の 4 ファイルで `TEAM_MATCH` が足りないという型エラーが出る（これが Task 10 の作業一覧になる）

- `src/features/division/format.ts`（`DIVISION_FORMAT_LABELS` / `USES_PARTICIPANTS`）
- `src/components/division/DivisionMatchingView.tsx`
- `src/components/print/PrintDivisionSection.tsx`
- `src/features/bracket/from-division.ts`（`BRACKET_FORMATS` の型次第で出ないこともある）

この時点では**直さない**。型エラーを残したまま次のタスクへ進む（Task 10 でまとめて潰す）。

- [ ] **Step 9: コミット**

型エラーが残っている状態でのコミットになる。Phase 2 の途中であることを本文に書く。

```bash
git add prisma src/lib/division src/generated/prisma
git commit -m "$(cat <<'EOF'
feat(division): TEAM_MATCH 形式とチーム付きエントリーの型を足す

DivisionFormat に TEAM_MATCH を 1 値、DivisionEntry に teamId、
DivisionEntries に teams（Team.id を 2 件）を足し、パーサを対応させる。
形式ディスパッチの分岐はまだ足していないため型エラーが残る。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: validateEntries の形式対応

**Files:**
- Modify: `src/lib/division/validate.ts`
- Modify: `src/lib/division/validate.test.ts`
- Modify: `src/features/division/setup-store.ts`

**Interfaces:**
- Consumes: Task 7 の `DivisionEntries.teams` / `DivisionEntry.teamId`
- Produces: `validateEntries(entries: DivisionEntries, existingParticipantIds: readonly string[], format: DivisionFormat): ValidationErrors`（**第 3 引数が増える破壊的変更**）

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/division/validate.test.ts` の既存の `validateEntries` の呼び出しはすべて第 3 引数 `"SINGLE_ELIMINATION"` を足して直し、末尾に describe を足す。

```ts
describe("validateEntries（TEAM_MATCH）", () => {
  const participantIds = ["p1", "p2", "p3", "p4"];

  it("チームごとに seed が 0 から重なっていてもよい", () => {
    const errors = validateEntries(
      {
        version: 1,
        teams: ["team1", "team2"],
        entries: [
          { id: "e1", participantId: "p1", seed: 0, teamId: "team1" },
          { id: "e2", participantId: "p2", seed: 0, teamId: "team2" },
          { id: "e3", participantId: "p3", seed: 1, teamId: "team1" },
          { id: "e4", participantId: "p4", seed: 1, teamId: "team2" },
        ],
      },
      participantIds,
      "TEAM_MATCH",
    );

    expect(errors).toEqual([]);
  });

  it("同じチームの中で seed が重なれば弾く", () => {
    const errors = validateEntries(
      {
        version: 1,
        teams: ["team1", "team2"],
        entries: [
          { id: "e1", participantId: "p1", seed: 0, teamId: "team1" },
          { id: "e2", participantId: "p2", seed: 0, teamId: "team1" },
        ],
      },
      participantIds,
      "TEAM_MATCH",
    );

    expect(errors).toContain(
      "同じチームの中で entries[].seed が重複しています: team1 / 0",
    );
  });

  it("teams が無ければ弾く", () => {
    const errors = validateEntries(
      { version: 1, entries: [] },
      participantIds,
      "TEAM_MATCH",
    );

    expect(errors).toContain("entries.teams にチームが 2 つ選ばれていません");
  });

  it("同じチームを 2 回選べない", () => {
    const errors = validateEntries(
      { version: 1, teams: ["team1", "team1"], entries: [] },
      participantIds,
      "TEAM_MATCH",
    );

    expect(errors).toContain("entries.teams に同じチームが 2 回あります");
  });

  it("teams に無いチームの選手は弾く", () => {
    const errors = validateEntries(
      {
        version: 1,
        teams: ["team1", "team2"],
        entries: [
          { id: "e1", participantId: "p1", seed: 0, teamId: "team9" },
        ],
      },
      participantIds,
      "TEAM_MATCH",
    );

    expect(errors).toContain(
      "entries[].teamId が teams のどちらでもありません: team9",
    );
  });

  it("teamId が無い選手は弾く", () => {
    const errors = validateEntries(
      {
        version: 1,
        teams: ["team1", "team2"],
        entries: [{ id: "e1", participantId: "p1", seed: 0 }],
      },
      participantIds,
      "TEAM_MATCH",
    );

    expect(errors).toContain("entries[].teamId がありません: e1");
  });

  it("同じ参加者が両チームに入っていれば弾く", () => {
    const errors = validateEntries(
      {
        version: 1,
        teams: ["team1", "team2"],
        entries: [
          { id: "e1", participantId: "p1", seed: 0, teamId: "team1" },
          { id: "e2", participantId: "p1", seed: 0, teamId: "team2" },
        ],
      },
      participantIds,
      "TEAM_MATCH",
    );

    expect(errors).toContain("同じ参加者が二重にエントリーしています: p1");
  });
});
```

`validateResults` の describe に 1 件足す。

```ts
  it("TEAM_MATCH でも引き分けを許す", () => {
    const errors = validateResults(
      { version: 1, matches: [{ matchId: "t1-0", winnerEntryId: null }] },
      {
        version: 1,
        matches: [
          {
            id: "t1-0",
            bracket: "winners",
            round: 1,
            order: 0,
            matchName: "第{{OverallSeq}}試合",
            slots: [
              { kind: "entry", entryId: "e1" },
              { kind: "entry", entryId: "e2" },
            ],
          },
        ],
      },
      "TEAM_MATCH",
    );

    expect(errors).toEqual([]);
  });
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `pnpm exec vitest run src/lib/division/validate.test.ts`
Expected: FAIL（引数の数が合わない型エラー、または TEAM_MATCH の検査が無くエラー配列が空）

- [ ] **Step 3: validate.ts を直す**

`duplicates` の下に足す。

```ts
/** TEAM_MATCH だけの検査。teams の形と、各選手がどちらのチームに属するか。 */
const validateTeamEntries = (entries: DivisionEntries): ValidationErrors => {
  const errors: ValidationErrors = [];
  const teams = entries.teams;

  if (teams === undefined) {
    errors.push("entries.teams にチームが 2 つ選ばれていません");
    return errors;
  }
  if (teams[0] === teams[1]) {
    errors.push("entries.teams に同じチームが 2 回あります");
  }

  const known = new Set<string>(teams);
  for (const entry of entries.entries) {
    if (entry.teamId === undefined) {
      errors.push(`entries[].teamId がありません: ${entry.id}`);
      continue;
    }
    if (!known.has(entry.teamId)) {
      errors.push(
        `entries[].teamId が teams のどちらでもありません: ${entry.teamId}`,
      );
    }
  }

  // seed の一意性はチームの中でだけ見る。両チームの先鋒はどちらも seed 0。
  for (const key of duplicates(
    entries.entries
      .filter((entry) => entry.teamId !== undefined)
      .map((entry) => `${entry.teamId} / ${entry.seed}`),
  )) {
    errors.push(`同じチームの中で entries[].seed が重複しています: ${key}`);
  }

  return errors;
};
```

`validateEntries` を直す。

```ts
/**
 * エントリーの整合性を検証する（spec のルール 1〜3）。
 * existingParticipantIds は、この部門が属する大会の Participant.id の一覧。
 *
 * format を取るのは seed の一意性の単位が形式で変わるため。TEAM_MATCH は
 * 「チーム内の出場順」なので両チームの先鋒がどちらも 0 になり、
 * entries 全体で一意という規則が成り立たない。
 */
export const validateEntries = (
  entries: DivisionEntries,
  existingParticipantIds: readonly string[],
  format: DivisionFormat,
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

  if (format === "TEAM_MATCH") {
    errors.push(...validateTeamEntries(entries));
  } else {
    for (const seed of duplicates(list.map((entry) => entry.seed))) {
      errors.push(`entries[].seed が重複しています: ${seed}`);
    }
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
```

`validateResults` の引き分けの分岐を直す。

```ts
    if (record.winnerEntryId === null) {
      // 引き分けは、勝ち上がりを持たない形式でだけ許す。トーナメントで
      // 引き分けると次のスロットに誰を進めるか決まらなくなるため。
      if (format !== "ROUND_ROBIN" && format !== "TEAM_MATCH") {
        errors.push(
          `引き分けは ROUND_ROBIN / TEAM_MATCH でのみ許可されます: ${record.matchId}`,
        );
      }
      continue;
    }
```

既存テストの文言の期待値もこの新しい文字列に合わせて直す。

- [ ] **Step 4: setup-store.ts の呼び出しを直す**

`save` の中の `validateEntries` に第 3 引数を渡す。

```ts
  const errors = [
    ...validateEntries(
      next.entries,
      participants.map((participant) => participant.id),
      next.format,
    ),
    ...validateMatchingConfig(next.matchingConfig, next.entries),
  ];
```

- [ ] **Step 5: 他の呼び出し元も直す**

Run: `pnpm exec grep -rn "validateEntries" src --include=*.ts` の代わりに Grep で `validateEntries` を検索し、第 3 引数の無い呼び出しをすべて直す。

Run: `pnpm typecheck`
Expected: `validateEntries` に関する型エラーが消え、Task 7 で出した形式ディスパッチの型エラーだけが残る

- [ ] **Step 6: 通ることを確認**

Run: `pnpm exec vitest run src/lib/division/validate.test.ts`
Expected: PASS

Run: `pnpm exec vitest run src/features/division/`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add src/lib/division src/features/division/setup-store.ts
git commit -m "$(cat <<'EOF'
feat(division): エントリー検証を形式対応にする

TEAM_MATCH の seed は「チーム内の出場順」なので、一意性を
(teamId, seed) の組で見る。teams が 2 件で相異なること、各選手の
teamId がそのどちらかであることも合わせて検査する。
引き分けは ROUND_ROBIN に加えて TEAM_MATCH でも許す。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: team-match/build.ts

**Files:**
- Create: `src/features/division/team-match/build.ts`
- Create: `src/features/division/team-match/build.test.ts`

**Interfaces:**
- Consumes: Task 7 の `DivisionEntries` / `DivisionEntry.teamId`
- Produces:
  - `buildTeamMatch(entries: DivisionEntries): MatchingConfig`
  - `isTeamMatchShape(config: MatchingConfig): boolean`

- [ ] **Step 1: 失敗するテストを書く**

`src/features/division/team-match/build.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_MATCH_NAME } from "@/lib/division/match-name";
import type { DivisionEntries } from "@/lib/division/types";
import { buildTeamMatch, isTeamMatchShape } from "./build";

/** 「A チーム n 人 / B チーム m 人」のエントリーを作る。seed は 0 始まり。 */
const buildEntries = (left: number, right: number): DivisionEntries => ({
  version: 1,
  teams: ["team1", "team2"],
  entries: [
    ...Array.from({ length: left }, (_, index) => ({
      id: `a${index}`,
      participantId: `pa${index}`,
      seed: index,
      teamId: "team1",
    })),
    ...Array.from({ length: right }, (_, index) => ({
      id: `b${index}`,
      participantId: `pb${index}`,
      seed: index,
      teamId: "team2",
    })),
  ],
});

describe("buildTeamMatch", () => {
  it("teams が無ければ空を返す", () => {
    expect(
      buildTeamMatch({ version: 1, entries: [] }).matches,
    ).toHaveLength(0);
  });

  it("片方のチームが 0 人なら空を返す", () => {
    expect(buildTeamMatch(buildEntries(3, 0)).matches).toHaveLength(0);
  });

  it("3 人対 3 人なら 3 試合で、位置どうしが組まれる", () => {
    const config = buildTeamMatch(buildEntries(3, 3));

    expect(config.matches).toHaveLength(3);
    expect(config.matches[0]).toEqual({
      id: "t1-0",
      bracket: "winners",
      round: 1,
      order: 0,
      matchName: DEFAULT_MATCH_NAME,
      slots: [
        { kind: "entry", entryId: "a0" },
        { kind: "entry", entryId: "b0" },
      ],
    });
    expect(config.matches[2].slots).toEqual([
      { kind: "entry", entryId: "a2" },
      { kind: "entry", entryId: "b2" },
    ]);
  });

  it("3 人対 2 人なら 3 試合で、3 本目の右が bye", () => {
    const config = buildTeamMatch(buildEntries(3, 2));

    expect(config.matches).toHaveLength(3);
    expect(config.matches[2].slots).toEqual([
      { kind: "entry", entryId: "a2" },
      { kind: "bye" },
    ]);
  });

  it("2 人対 3 人なら 3 本目の左が bye", () => {
    const config = buildTeamMatch(buildEntries(2, 3));

    expect(config.matches[2].slots).toEqual([
      { kind: "bye" },
      { kind: "entry", entryId: "b2" },
    ]);
  });

  it("seed が飛び飛びでも昇順に詰めて組む", () => {
    const config = buildTeamMatch({
      version: 1,
      teams: ["team1", "team2"],
      entries: [
        { id: "a1", participantId: "pa1", seed: 5, teamId: "team1" },
        { id: "a0", participantId: "pa0", seed: 2, teamId: "team1" },
        { id: "b0", participantId: "pb0", seed: 0, teamId: "team2" },
        { id: "b1", participantId: "pb1", seed: 9, teamId: "team2" },
      ],
    });

    expect(config.matches[0].slots).toEqual([
      { kind: "entry", entryId: "a0" },
      { kind: "entry", entryId: "b0" },
    ]);
    expect(config.matches[1].slots).toEqual([
      { kind: "entry", entryId: "a1" },
      { kind: "entry", entryId: "b1" },
    ]);
  });

  it("teams に属さない選手は組み合わせに入れない", () => {
    const entries = buildEntries(1, 1);
    entries.entries.push({
      id: "x0",
      participantId: "px0",
      seed: 0,
      teamId: "team9",
    });

    expect(buildTeamMatch(entries).matches).toHaveLength(1);
  });
});

describe("isTeamMatchShape", () => {
  it("entry と bye だけなら true", () => {
    expect(isTeamMatchShape(buildTeamMatch(buildEntries(3, 2)))).toBe(true);
  });

  it("空の組み合わせは true（まだ作っていないだけ）", () => {
    expect(isTeamMatchShape({ version: 1, matches: [] })).toBe(true);
  });

  it("winnerOf を含む木は false", () => {
    expect(
      isTeamMatchShape({
        version: 1,
        matches: [
          {
            id: "m2-0",
            bracket: "winners",
            round: 2,
            order: 0,
            matchName: DEFAULT_MATCH_NAME,
            slots: [
              { kind: "winnerOf", matchId: "m1-0" },
              { kind: "winnerOf", matchId: "m1-1" },
            ],
          },
        ],
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `pnpm exec vitest run src/features/division/team-match/build.test.ts`
Expected: FAIL（`Failed to resolve import "./build"`）

- [ ] **Step 3: build.ts を書く**

```ts
import { DEFAULT_MATCH_NAME } from "@/lib/division/match-name";
import type {
  BracketMatch,
  DivisionEntries,
  DivisionEntry,
  MatchingConfig,
  SlotSource,
} from "@/lib/division/types";

/**
 * 試合 id。位置（0 = 先鋒）だけから決まる。接頭辞を
 * `m{round}-{order}`（トーナメント）・`r1-{order}`（リーグ）と変えてあるのは、
 * 形式を取り違えたデータが混ざったときに見分けられるようにするため。
 * `1` は「団体戦に節は無い（round は常に 1）」ことを表す。
 */
const matchId = (position: number): string => `t1-${position}`;

/** 片方のチームの出場者を seed 昇順に並べる。 */
const lineup = (entries: DivisionEntry[], teamId: string): DivisionEntry[] =>
  entries
    .filter((entry) => entry.teamId === teamId)
    .sort((left, right) => left.seed - right.seed);

const slotOf = (entry: DivisionEntry | undefined): SlotSource =>
  entry === undefined ? { kind: "bye" } : { kind: "entry", entryId: entry.id };

/**
 * 2 チームのオーダーから団体戦の組み合わせを組み立てる。
 * 位置 i どうしを 1 試合にするだけで、勝ち上がりは持たない。
 *
 * 人数が揃わない場合は多い側に合わせて試合を作り、足りない側を bye にする。
 * bye の試合は lib/division/resolve.ts の decideWinner が記録なしで勝者を
 * 決めるため、不戦勝の集計をここで書く必要はない。
 *
 * どちらかが 0 人なら空を返す。全試合が不戦勝になる組み合わせは団体戦として
 * 読めないので「作れなかった」に倒す。呼び出し側はそれを見て案内を出す。
 */
export const buildTeamMatch = (entries: DivisionEntries): MatchingConfig => {
  const teams = entries.teams;
  if (teams === undefined) {
    return { version: 1, matches: [] };
  }

  const left = lineup(entries.entries, teams[0]);
  const right = lineup(entries.entries, teams[1]);
  if (left.length === 0 || right.length === 0) {
    return { version: 1, matches: [] };
  }

  const count = Math.max(left.length, right.length);
  const matches: BracketMatch[] = Array.from(
    { length: count },
    (_, position) => ({
      id: matchId(position),
      bracket: "winners",
      round: 1,
      order: position,
      matchName: DEFAULT_MATCH_NAME,
      slots: [slotOf(left[position]), slotOf(right[position])],
    }),
  );

  return { version: 1, matches };
};

/**
 * 保存されている組み合わせが団体戦の形をしているか。
 *
 * 部門の編集画面（/edit）は format を無条件に書き換えられるため、
 * トーナメントの木を持ったまま TEAM_MATCH になった部門が存在しうる。
 * その木は winnerOf / loserOf を含むので、全スロットが entry か bye か
 * どうかで見分けられる。リーグの isRoundRobinShape と同じ役割で、
 * bye を許す点だけが違う（人数差の吸収に使うため）。
 * 空の組み合わせは「まだ作っていない」であって形が違うわけではないので true。
 */
export const isTeamMatchShape = (config: MatchingConfig): boolean =>
  config.matches.every((match) =>
    match.slots.every((slot) => slot.kind === "entry" || slot.kind === "bye"),
  );
```

- [ ] **Step 4: 通ることを確認**

Run: `pnpm exec vitest run src/features/division/team-match/build.test.ts`
Expected: PASS（buildTeamMatch 7 件 + isTeamMatchShape 3 件）

- [ ] **Step 5: コミット**

```bash
git add src/features/division/team-match
git commit -m "$(cat <<'EOF'
feat(division): 団体戦の組み合わせを組み立てる純粋関数を足す

2 チームのオーダーから、位置 i どうしを 1 試合にするだけの組み合わせを
作る。人数差は多い側に合わせて bye で埋め、不戦勝は既存の
resolve.ts の decideWinner がそのまま扱う。どちらかが 0 人なら空を返す。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: 形式ディスパッチへの組み込み

このタスクで Task 7 が残した型エラーをすべて潰す。

**Files:**
- Modify: `src/features/division/matching-strategy.ts`
- Modify: `src/features/division/matching-strategy.test.ts`
- Modify: `src/features/division/format.ts`
- Modify: `src/features/division/format.test.ts`
- Modify: `src/features/division/add-entry/repository.ts`
- Modify: `src/features/division/remove-entry/repository.ts`
- Modify: `src/features/division/reorder-entry/repository.ts`
- Modify: `src/features/division/generate-matching/repository.ts`
- Modify: `src/components/division/prepare-bracket.ts`
- Modify: `src/components/division/DivisionMatchingView.tsx`
- Modify: `src/components/print/PrintDivisionSection.tsx`
- Modify: `src/features/bracket/from-division.ts`

**Interfaces:**
- Consumes: Task 9 の `buildTeamMatch` / `isTeamMatchShape`
- Produces（**引数の型が変わる破壊的変更**）:
  - `regenerateMatching(format: EditableFormat, entries: DivisionEntries): MatchingConfig`
  - `applyEntryAdded(format: EditableFormat, current: MatchingConfig, entries: DivisionEntries, addedEntryId: string): MatchingConfig`
  - `applyEntryReordered(format: EditableFormat, current: MatchingConfig, entries: DivisionEntries): MatchingConfig`
  - `maxEntries("TEAM_MATCH") === 40` / `minEntries("TEAM_MATCH") === 2`

- [ ] **Step 1: 失敗するテストを書く**

`src/features/division/matching-strategy.test.ts` の既存の呼び出しを、`DivisionEntry[]` ではなく `DivisionEntries`（`{ version: 1, entries: [...] }`）を渡す形に直す。そのうえで末尾に足す。

```ts
describe("TEAM_MATCH", () => {
  const teamEntries = (left: number, right: number): DivisionEntries => ({
    version: 1,
    teams: ["team1", "team2"],
    entries: [
      ...Array.from({ length: left }, (_, index) => ({
        id: `a${index}`,
        participantId: `pa${index}`,
        seed: index,
        teamId: "team1",
      })),
      ...Array.from({ length: right }, (_, index) => ({
        id: `b${index}`,
        participantId: `pb${index}`,
        seed: index,
        teamId: "team2",
      })),
    ],
  });

  it("編集できる形式に含まれる", () => {
    expect(isEditableFormat("TEAM_MATCH")).toBe(true);
  });

  it("スロット型ではない（D&D エディタと swap-slots の対象外）", () => {
    expect(isSlotBracketFormat("TEAM_MATCH")).toBe(false);
  });

  it("上限は 40 人、下限は 2 人", () => {
    expect(maxEntries("TEAM_MATCH")).toBe(40);
    expect(minEntries("TEAM_MATCH")).toBe(2);
  });

  it("regenerateMatching が位置どうしの組み合わせを作る", () => {
    const config = regenerateMatching("TEAM_MATCH", teamEntries(2, 2));

    expect(config.matches).toHaveLength(2);
    expect(config.matches[0].id).toBe("t1-0");
  });

  it("上限を超えたら空を返す", () => {
    const config = regenerateMatching("TEAM_MATCH", teamEntries(21, 21));

    expect(config.matches).toHaveLength(0);
  });

  it("エントリー追加後はまるごと作り直す", () => {
    const current = regenerateMatching("TEAM_MATCH", teamEntries(2, 2));
    const next = applyEntryAdded(
      "TEAM_MATCH",
      current,
      teamEntries(3, 2),
      "a2",
    );

    expect(next.matches).toHaveLength(3);
    expect(next.matches[2].slots).toEqual([
      { kind: "entry", entryId: "a2" },
      { kind: "bye" },
    ]);
  });

  it("組み合わせが未作成なら追加しても空のまま", () => {
    const next = applyEntryAdded(
      "TEAM_MATCH",
      { version: 1, matches: [] },
      teamEntries(3, 2),
      "a2",
    );

    expect(next.matches).toHaveLength(0);
  });

  it("並べ替え後もまるごと作り直す", () => {
    const current = regenerateMatching("TEAM_MATCH", teamEntries(2, 2));
    const swapped: DivisionEntries = {
      version: 1,
      teams: ["team1", "team2"],
      entries: [
        { id: "a0", participantId: "pa0", seed: 1, teamId: "team1" },
        { id: "a1", participantId: "pa1", seed: 0, teamId: "team1" },
        { id: "b0", participantId: "pb0", seed: 0, teamId: "team2" },
        { id: "b1", participantId: "pb1", seed: 1, teamId: "team2" },
      ],
    };

    const next = applyEntryReordered("TEAM_MATCH", current, swapped);

    expect(next.matches[0].slots[0]).toEqual({ kind: "entry", entryId: "a1" });
  });
});
```

`src/features/division/format.test.ts` に足す。

```ts
  it("TEAM_MATCH のラベルは「団体戦」", () => {
    expect(DIVISION_FORMAT_LABELS.TEAM_MATCH).toBe("団体戦");
  });

  it("TEAM_MATCH は参加者名を使う", () => {
    expect(needsParticipants("TEAM_MATCH")).toBe(true);
  });
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `pnpm exec vitest run src/features/division/matching-strategy.test.ts src/features/division/format.test.ts`
Expected: FAIL（`TEAM_MATCH` の分岐が無い・引数の型が合わない）

- [ ] **Step 3: format.ts を直す**

```ts
export const DIVISION_FORMAT_LABELS: Record<DivisionFormat, string> = {
  SINGLE_ELIMINATION: "シングルエリミネーション",
  DOUBLE_ELIMINATION_GRAND_FINAL: "ダブルエリミネーション（優勝決定戦あり）",
  DOUBLE_ELIMINATION_THIRD_PLACE: "ダブルエリミネーション（敗者側優勝が3位）",
  ROUND_ROBIN: "リーグ（総当たり）",
  TEAM_MATCH: "団体戦",
};
```

```ts
const USES_PARTICIPANTS: Record<DivisionFormat, boolean> = {
  SINGLE_ELIMINATION: true,
  ROUND_ROBIN: true,
  DOUBLE_ELIMINATION_GRAND_FINAL: true,
  DOUBLE_ELIMINATION_THIRD_PLACE: true,
  TEAM_MATCH: true,
};
```

- [ ] **Step 4: matching-strategy.ts を直す**

import を足す。

```ts
import type {
  DivisionEntries,
  MatchingConfig,
  SlotSource,
} from "@/lib/division/types";
import { buildTeamMatch } from "./team-match/build";
```

（`DivisionEntry` の import は使わなくなるので消す。）

`EDITABLE_FORMATS` に足す。

```ts
export const EDITABLE_FORMATS = [
  "SINGLE_ELIMINATION",
  "ROUND_ROBIN",
  "DOUBLE_ELIMINATION_GRAND_FINAL",
  "DOUBLE_ELIMINATION_THIRD_PLACE",
  "TEAM_MATCH",
] as const satisfies readonly DivisionFormat[];
```

`MAX_ENTRIES` / `MIN_ENTRIES` に足す。

```ts
const MAX_ENTRIES: Record<EditableFormat, number> = {
  SINGLE_ELIMINATION: 128,
  ROUND_ROBIN: 16,
  DOUBLE_ELIMINATION_GRAND_FINAL: 64,
  DOUBLE_ELIMINATION_THIRD_PLACE: 64,
  // 2 チーム合計。1 チーム 20 人まで。位置ごとに 1 試合なので
  // 試合数は人数に比例するが、1 つの団体戦として回せる規模で切る。
  TEAM_MATCH: 40,
};
```

```ts
const MIN_ENTRIES: Record<EditableFormat, number> = {
  SINGLE_ELIMINATION: 2,
  ROUND_ROBIN: 2,
  DOUBLE_ELIMINATION_GRAND_FINAL: 3,
  DOUBLE_ELIMINATION_THIRD_PLACE: 3,
  // entries 全体の数しか見ないので「各チーム 1 人以上」は
  // buildTeamMatch（片側 0 人なら空）が担保する。
  TEAM_MATCH: 2,
};
```

`SlotBracketFormat` の定義を直す（`ROUND_ROBIN` だけを除く形では `TEAM_MATCH` が混ざってしまう）。

```ts
/**
 * 勝者側 1 回戦のスロット割当を唯一の情報源にする形式。
 * 1 回戦の入れ替え（swap-slots）と D&D エディタはこれらでだけ意味を持つ。
 */
export type SlotBracketFormat = Exclude<
  EditableFormat,
  "ROUND_ROBIN" | "TEAM_MATCH"
>;
```

`isSlotBracketFormat` の実装は 3 つの形式を列挙しているだけなので変更不要（`TEAM_MATCH` は false になる）。

`buildRoundRobinWithinCap` の下に足す。

```ts
/**
 * 団体戦の組み合わせを上限内でだけ組み立てる。
 *
 * buildRoundRobinWithinCap と同じ理由（/edit は format を無条件に
 * 書き換えられ、生成ボタンを経由しない remove-entry / reorder からも
 * regenerateMatching が呼ばれる）で、128 人のトーナメントがそのまま
 * TEAM_MATCH（40 人まで）になっていることがある。buildTeamMatch 自身は
 * 上限を知らないため、ここで弾く。
 */
const buildTeamMatchWithinCap = (entries: DivisionEntries): MatchingConfig =>
  entries.entries.length > MAX_ENTRIES.TEAM_MATCH
    ? { version: 1, matches: [] }
    : buildTeamMatch(entries);
```

3 つの公開関数の引数を `DivisionEntries` に変え、`TEAM_MATCH` の枝を足す。

```ts
export const regenerateMatching = (
  format: EditableFormat,
  entries: DivisionEntries,
): MatchingConfig => {
  switch (format) {
    case "SINGLE_ELIMINATION":
      return buildSlotBracket(format, generateSlots(entries.entries));
    case "DOUBLE_ELIMINATION_GRAND_FINAL":
    case "DOUBLE_ELIMINATION_THIRD_PLACE":
      return buildSlotBracketWithinCap(format, entries.entries);
    case "ROUND_ROBIN":
      return buildRoundRobinWithinCap(entries.entries);
    case "TEAM_MATCH":
      return buildTeamMatchWithinCap(entries);
  }
};
```

```ts
export const applyEntryAdded = (
  format: EditableFormat,
  current: MatchingConfig,
  entries: DivisionEntries,
  addedEntryId: string,
): MatchingConfig => {
  if (current.matches.length === 0) {
    return current;
  }

  switch (format) {
    case "SINGLE_ELIMINATION":
    case "DOUBLE_ELIMINATION_GRAND_FINAL":
    case "DOUBLE_ELIMINATION_THIRD_PLACE":
      if (!matchesSlotBracketShape(format, current)) {
        return current;
      }
      return buildSlotBracket(
        format,
        placeEntry(toSlots(current), addedEntryId),
      );
    case "ROUND_ROBIN":
      return buildRoundRobin(entries.entries);
    // 1 人増えれば以降の全位置がずれるため、リーグと同じくまるごと作り直す。
    case "TEAM_MATCH":
      return buildTeamMatchWithinCap(entries);
  }
};
```

```ts
export const applyEntryReordered = (
  format: EditableFormat,
  current: MatchingConfig,
  entries: DivisionEntries,
): MatchingConfig => {
  if (current.matches.length === 0) {
    return current;
  }

  switch (format) {
    case "SINGLE_ELIMINATION":
    case "DOUBLE_ELIMINATION_GRAND_FINAL":
    case "DOUBLE_ELIMINATION_THIRD_PLACE":
      return current;
    case "ROUND_ROBIN":
      return buildRoundRobinWithinCap(entries.entries);
    // 出場順がそのまま対戦カードを決めるので、触らないと画面が食い違う。
    case "TEAM_MATCH":
      return buildTeamMatchWithinCap(entries);
  }
};
```

- [ ] **Step 5: 4 つの呼び出し元を直す**

次の 4 か所で、第 3（または第 2）引数の `entries.entries` を `entries` に、`current.entries` を渡していれば同様に `DivisionEntries` を渡す形に直す。

- `src/features/division/add-entry/repository.ts:71` 付近の `applyEntryAdded(...)`
- `src/features/division/remove-entry/repository.ts:78` の `regenerateMatching(current.format, entries.entries)` → `regenerateMatching(current.format, entries)`
- `src/features/division/reorder-entry/repository.ts:55` 付近の `applyEntryReordered(...)`
- `src/features/division/generate-matching/repository.ts:34` 付近の `regenerateMatching(...)`

Run: `pnpm typecheck`
Expected: これら 4 ファイルの型エラーが消える

- [ ] **Step 6: prepare-bracket.ts を直す**

形式を文字列で否定していると、形式を足すたびに書き漏らす。肯定形（ブラケットで描く形式だけを通す）に変える。

```ts
import { isSlotBracketFormat } from "@/features/division/matching-strategy";
```

```ts
  // リーグは星取表、団体戦は団体戦表で描く（DivisionMatchingView）。
  // ここへ来るのは誤用なので案内に倒す。否定形で列挙すると形式を足した
  // ときに書き漏らすため、ブラケットで描く形式だけを肯定形で通す。
  if (!isSlotBracketFormat(division.format)) {
    return {
      kind: "notice",
      message: `「${DIVISION_FORMAT_LABELS[division.format]}」のブラケット表示はまだ対応していません`,
    };
  }
```

- [ ] **Step 7: DivisionMatchingView.tsx に仮の枝を足す**

本体（`TeamMatchTable`）は Phase 3 で作るので、ここでは案内に倒して型エラーだけ消す。

```tsx
    case "TEAM_MATCH":
      // 団体戦の結果表は Phase 3 で入れる。
      return <Notice>団体戦の表示はまだ対応していません</Notice>;
```

- [ ] **Step 8: PrintDivisionSection.tsx に仮の枝を足す**

```tsx
          case "TEAM_MATCH":
            // 印刷の団体戦は Phase 3 で入れる。
            return null;
```

- [ ] **Step 9: from-division.ts を確認する**

`BRACKET_FORMATS` の定義を読む。`readonly DivisionFormat[]` なら `TEAM_MATCH` を足す必要はなく（`includes` が false を返す）、`Record<DivisionFormat, _>` なら `TEAM_MATCH: false` を足す。型エラーが出ていなければ何もしない。

- [ ] **Step 10: 全体を通す**

Run: `pnpm typecheck`
Expected: **エラーなし**（Task 7 で残した型エラーがここですべて消える）

Run: `pnpm test`
Expected: 全件 PASS

- [ ] **Step 11: コミット**

```bash
git add src/features/division src/components/division src/components/print src/features/bracket
git commit -m "$(cat <<'EOF'
feat(division): TEAM_MATCH を形式ディスパッチに組み込む

matching-strategy に上限 40 人・下限 2 人と、追加／並べ替えでまるごと
作り直す規則を足す。出場順が対戦カードを決めるため部分更新は無い。
regenerateMatching 系は teams を見る必要があるので、引数を
DivisionEntry[] から DivisionEntries に変えた。
表示（部門ビュー・印刷）はまだ案内に倒してあり、Phase 3 で実装する。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: set-teams / set-lineup スライス

**Files:**
- Modify: `src/features/division/add-entry/repository.ts`
- Modify: `src/features/division/remove-entry/repository.ts`
- Modify: `src/features/division/reorder-entry/repository.ts`
- Create: `src/features/division/set-teams/{schema.ts,repository.ts,usecase.ts,handler.ts,repository.test.ts}`
- Create: `src/features/division/set-lineup/{schema.ts,repository.ts,usecase.ts,handler.ts,repository.test.ts}`
- Modify: `src/features/division/revalidate.ts`

**Interfaces:**
- Consumes: `runDivisionSetup` / `DivisionIds` / `DivisionSetup`（`setup-store.ts`）、`regenerateMatching`、Task 1 の `Team`
- Produces:
  - `setTeamsAction: DivisionFormAction`（`slug` / `tournamentId` / `divisionId` / `teamId0` / `teamId1`）
  - `setLineupAction: DivisionFormAction`（`slug` / `tournamentId` / `divisionId` / `teamId` / `participantId` を出場順に 0 個以上）

- [ ] **Step 1: 既存 3 スライスが teams を落とさないようにする**

`add-entry` / `remove-entry` / `reorder-entry` の各 `repository.ts` は、次のように `DivisionEntries` をリテラルで作り直している。

```ts
    const entries: DivisionEntries = {
      version: 1,
      entries: [...current.entries.entries, added],
    };
```

これだと `teams` が落ちる。3 か所とも現在の `entries` を広げる形に直す。

```ts
    // teams（TEAM_MATCH のときだけ入る）を落とさないよう現在の値を広げる。
    // 個人戦の部門では teams が無いので、この変更で挙動は変わらない。
    const entries: DivisionEntries = {
      ...current.entries,
      entries: [...current.entries.entries, added],
    };
```

団体戦の部門でこれらの Server Action を直接叩くと `teamId` の無いエントリーができるが、`setup-store.ts` の `save` が `validateEntries` で弾いて書き込まない（`DivisionDataError`）。画面からは到達しない経路なので、専用の案内は用意しない。

Run: `pnpm test`
Expected: 全件 PASS（挙動は変わらない）

- [ ] **Step 2: set-teams の schema / usecase を書く**

`src/features/division/set-teams/schema.ts`:

```ts
import { z } from "zod";

export const setTeamsSchema = z
  .object({
    teamId0: z.string().min(1, { message: "左のチームを選んでください" }),
    teamId1: z.string().min(1, { message: "右のチームを選んでください" }),
  })
  .refine((input) => input.teamId0 !== input.teamId1, {
    message: "違うチームを 2 つ選んでください",
  });

export type SetTeamsInput = z.infer<typeof setTeamsSchema>;
```

`src/features/division/set-teams/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { SetTeamsPort } from "./repository";
import type { SetTeamsInput } from "./schema";

export const setTeams = (
  port: SetTeamsPort,
  ids: DivisionIds,
  input: SetTeamsInput,
): Effect.Effect<DivisionSetupOutcome<null>, DivisionError> =>
  port(ids, input);
```

- [ ] **Step 3: set-teams の失敗するテストを書く**

`src/features/division/set-teams/repository.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DivisionSetup } from "../setup-store";

const runDivisionSetup = vi.fn();
const teamFindMany = vi.fn();

vi.mock("../setup-store", () => ({
  runDivisionSetup: (ids: unknown, mutate: unknown) =>
    runDivisionSetup(ids, mutate),
}));

const { setTeamsInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };

const tx = { team: { findMany: (a: unknown) => teamFindMany(a) } };

/** mutate をその場で呼んで、返ってきた next を検査するための足場。 */
const capture = async (current: DivisionSetup) => {
  let captured: { next: DivisionSetup | null; value: unknown } | undefined;
  runDivisionSetup.mockImplementation(
    async (_ids: unknown, mutate: (tx: unknown, c: DivisionSetup) => unknown) => {
      captured = (await mutate(tx, current)) as typeof captured;
      return { found: true, value: null };
    },
  );
  return { captured: () => captured };
};

const teamMatchSetup = (): DivisionSetup => ({
  format: "TEAM_MATCH",
  entries: {
    version: 1,
    teams: ["team1", "team2"],
    entries: [
      { id: "e1", participantId: "p1", seed: 0, teamId: "team1" },
      { id: "e2", participantId: "p2", seed: 0, teamId: "team2" },
    ],
  },
  matchingConfig: { version: 1, matches: [] },
});

beforeEach(() => {
  runDivisionSetup.mockReset();
  teamFindMany.mockReset();
  teamFindMany.mockResolvedValue([{ id: "team1" }, { id: "team3" }]);
});

describe("setTeamsInDb", () => {
  it("2 チームの所属を大会の where で確かめる", async () => {
    const handle = await capture(teamMatchSetup());

    await Effect.runPromise(
      setTeamsInDb(ids, { teamId0: "team1", teamId1: "team3" }),
    );

    expect(teamFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ["team1", "team3"] },
          tournamentId: "t1",
          tournament: { organizationId: "o1" },
        },
      }),
    );
    expect(handle.captured()?.next).not.toBeNull();
  });

  it("外れたチームの選手はエントリーから落とす", async () => {
    const handle = await capture(teamMatchSetup());

    await Effect.runPromise(
      setTeamsInDb(ids, { teamId0: "team1", teamId1: "team3" }),
    );

    const next = handle.captured()?.next;
    expect(next?.entries.teams).toEqual(["team1", "team3"]);
    expect(next?.entries.entries).toEqual([
      { id: "e1", participantId: "p1", seed: 0, teamId: "team1" },
    ]);
  });

  it("大会に無いチーム ID なら何も書かない", async () => {
    teamFindMany.mockResolvedValue([{ id: "team1" }]);
    const handle = await capture(teamMatchSetup());

    await Effect.runPromise(
      setTeamsInDb(ids, { teamId0: "team1", teamId1: "team9" }),
    );

    expect(handle.captured()?.next).toBeNull();
  });

  it("TEAM_MATCH 以外の部門では何も書かない", async () => {
    const handle = await capture({
      format: "ROUND_ROBIN",
      entries: { version: 1, entries: [] },
      matchingConfig: { version: 1, matches: [] },
    });

    await Effect.runPromise(
      setTeamsInDb(ids, { teamId0: "team1", teamId1: "team3" }),
    );

    expect(handle.captured()?.next).toBeNull();
    expect(teamFindMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: 実行して失敗を確認**

Run: `pnpm exec vitest run src/features/division/set-teams/repository.test.ts`
Expected: FAIL（`Failed to resolve import "./repository"`）

- [ ] **Step 5: set-teams の repository.ts を書く**

```ts
import "server-only";
import type { Effect } from "effect";
import type { DivisionEntries } from "@/lib/division/types";
import type { DivisionError } from "../errors";
import { regenerateMatching } from "../matching-strategy";
import {
  type DivisionIds,
  type DivisionSetupOutcome,
  runDivisionSetup,
} from "../setup-store";
import type { SetTeamsInput } from "./schema";

export type SetTeamsPort = (
  ids: DivisionIds,
  input: SetTeamsInput,
) => Effect.Effect<DivisionSetupOutcome<null>, DivisionError>;

/**
 * 団体戦の対戦カード（2 チーム）を決める。
 *
 * setup-store の読み出しは編集画面を持つ形式すべてを通すので、
 * 団体戦だけの操作であることをスライス側でさらに絞る（swap-slots が
 * SINGLE_ELIMINATION に絞るのと同じ）。対象外なら next: null で書かない。
 *
 * 選び直しで外れたチームの選手はエントリーから落とす。残しておくと
 * validateEntries の「teams のどちらでもない」で保存が通らなくなる。
 */
export const setTeamsInDb: SetTeamsPort = (ids, input) =>
  runDivisionSetup(ids, async (tx, current) => {
    if (current.format !== "TEAM_MATCH") {
      return { next: null, value: null };
    }

    const teams = [input.teamId0, input.teamId1];
    // 所有権は where に入れる。取ってから条件で弾く形にはしない。
    const found = await tx.team.findMany({
      where: {
        id: { in: teams },
        tournamentId: ids.tournamentId,
        tournament: { organizationId: ids.organizationId },
      },
      select: { id: true },
    });
    if (found.length !== 2) {
      return { next: null, value: null };
    }

    const kept = new Set(teams);
    const entries: DivisionEntries = {
      version: 1,
      teams: [input.teamId0, input.teamId1],
      entries: current.entries.entries.filter(
        (entry) => entry.teamId !== undefined && kept.has(entry.teamId),
      ),
    };

    return {
      next: {
        format: current.format,
        entries,
        matchingConfig: regenerateMatching(current.format, entries),
      },
      value: null,
    };
  });
```

- [ ] **Step 6: 通ることを確認**

Run: `pnpm exec vitest run src/features/division/set-teams/repository.test.ts`
Expected: PASS（4 件）

- [ ] **Step 7: set-teams の handler.ts を書く**

`src/features/division/revalidate.ts` を開き、`revalidateDivisionSetup` が叩く 3 本のパスに `/team` を足す（`/setup` と `/league` の隣）。

```ts
  revalidatePath(`${base}/league`);
  revalidatePath(`${base}/team`);
```

`src/features/division/set-teams/handler.ts`:

```ts
"use server";

import { Effect, Exit } from "effect";
import { notFound } from "next/navigation";
import { requirePermission } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import { revalidateDivisionSetup } from "../revalidate";
import type { DivisionFormState } from "../state";
import { setTeamsInDb } from "./repository";
import { setTeamsSchema } from "./schema";
import { setTeams } from "./usecase";

export const setTeamsAction = async (
  _prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const divisionId = String(formData.get("divisionId") ?? "");
  const { organization } = await requirePermission(slug, "tournament.edit");

  const parsed = setTeamsSchema.safeParse({
    teamId0: String(formData.get("teamId0") ?? ""),
    teamId1: String(formData.get("teamId1") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    setTeams(
      setTeamsInDb,
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

`divisionErrorFormState` / `DivisionFormState` / `revalidateDivisionSetup` の正確な名前は
`src/features/division/effect-to-form-state.ts` / `state.ts` / `revalidate.ts` を開いて確認し、
既存スライス（例: `generate-matching/handler.ts`）の import 行をそのまま写す。

- [ ] **Step 8: set-lineup の schema / usecase を書く**

`src/features/division/set-lineup/schema.ts`:

```ts
import { z } from "zod";

/**
 * 1 チームぶんの出場順。participantIds の並びがそのまま
 * 先鋒 → 大将の順になる。空配列は「このチームは誰も出さない」。
 */
export const setLineupSchema = z.object({
  teamId: z.string().min(1, { message: "チームが指定されていません" }),
  participantIds: z
    .array(z.string().min(1))
    .max(20, { message: "1 チームの出場者は20人までです" })
    .refine(
      (ids) => new Set(ids).size === ids.length,
      { message: "同じ選手を 2 回は出せません" },
    ),
});

export type SetLineupInput = z.infer<typeof setLineupSchema>;
```

`src/features/division/set-lineup/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { SetLineupPort } from "./repository";
import type { SetLineupInput } from "./schema";

export const setLineup = (
  port: SetLineupPort,
  ids: DivisionIds,
  input: SetLineupInput,
): Effect.Effect<DivisionSetupOutcome<null>, DivisionError> =>
  port(ids, input);
```

- [ ] **Step 9: set-lineup の失敗するテストを書く**

`src/features/division/set-lineup/repository.test.ts`（`set-teams` のテストと同じ `capture` の足場を使う。`tx` は `participant.findMany` を持つ）:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DivisionSetup } from "../setup-store";

const runDivisionSetup = vi.fn();
const participantFindMany = vi.fn();

vi.mock("../setup-store", () => ({
  runDivisionSetup: (ids: unknown, mutate: unknown) =>
    runDivisionSetup(ids, mutate),
}));

const { setLineupInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };
const tx = { participant: { findMany: (a: unknown) => participantFindMany(a) } };

const capture = async (current: DivisionSetup) => {
  let captured: { next: DivisionSetup | null; value: unknown } | undefined;
  runDivisionSetup.mockImplementation(
    async (_ids: unknown, mutate: (tx: unknown, c: DivisionSetup) => unknown) => {
      captured = (await mutate(tx, current)) as typeof captured;
      return { found: true, value: null };
    },
  );
  return { captured: () => captured };
};

const setup = (): DivisionSetup => ({
  format: "TEAM_MATCH",
  entries: {
    version: 1,
    teams: ["team1", "team2"],
    entries: [
      { id: "e1", participantId: "p1", seed: 0, teamId: "team1" },
      { id: "e9", participantId: "p9", seed: 0, teamId: "team2" },
    ],
  },
  matchingConfig: { version: 1, matches: [] },
});

beforeEach(() => {
  runDivisionSetup.mockReset();
  participantFindMany.mockReset();
  participantFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
});

describe("setLineupInDb", () => {
  it("送られた並びの順に seed を 0 から振り直す", async () => {
    const handle = await capture(setup());

    await Effect.runPromise(
      setLineupInDb(ids, { teamId: "team1", participantIds: ["p2", "p1"] }),
    );

    const entries = handle.captured()?.next?.entries.entries ?? [];
    expect(
      entries
        .filter((entry) => entry.teamId === "team1")
        .map((entry) => [entry.participantId, entry.seed]),
    ).toEqual([
      ["p2", 0],
      ["p1", 1],
    ]);
  });

  it("もう一方のチームのエントリーはそのまま残す", async () => {
    const handle = await capture(setup());

    await Effect.runPromise(
      setLineupInDb(ids, { teamId: "team1", participantIds: ["p1"] }),
    );

    expect(handle.captured()?.next?.entries.entries).toContainEqual({
      id: "e9",
      participantId: "p9",
      seed: 0,
      teamId: "team2",
    });
  });

  it("そのチームに所属していない参加者が混ざれば何も書かない", async () => {
    participantFindMany.mockResolvedValue([{ id: "p1" }]);
    const handle = await capture(setup());

    await Effect.runPromise(
      setLineupInDb(ids, { teamId: "team1", participantIds: ["p1", "p5"] }),
    );

    expect(handle.captured()?.next).toBeNull();
  });

  it("teams に無いチームなら何も書かない", async () => {
    const handle = await capture(setup());

    await Effect.runPromise(
      setLineupInDb(ids, { teamId: "team9", participantIds: [] }),
    );

    expect(handle.captured()?.next).toBeNull();
    expect(participantFindMany).not.toHaveBeenCalled();
  });

  it("所属とチームを where に入れて引く", async () => {
    await capture(setup());

    await Effect.runPromise(
      setLineupInDb(ids, { teamId: "team1", participantIds: ["p1", "p2"] }),
    );

    expect(participantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ["p1", "p2"] },
          tournamentId: "t1",
          teamId: "team1",
          tournament: { organizationId: "o1" },
        },
      }),
    );
  });

  it("空の並びならそのチームの出場者が居なくなる", async () => {
    const handle = await capture(setup());

    await Effect.runPromise(
      setLineupInDb(ids, { teamId: "team1", participantIds: [] }),
    );

    const entries = handle.captured()?.next?.entries.entries ?? [];
    expect(entries.filter((entry) => entry.teamId === "team1")).toEqual([]);
  });
});
```

- [ ] **Step 10: 実行して失敗を確認**

Run: `pnpm exec vitest run src/features/division/set-lineup/repository.test.ts`
Expected: FAIL（`Failed to resolve import "./repository"`）

- [ ] **Step 11: set-lineup の repository.ts を書く**

```ts
import "server-only";
import { randomUUID } from "node:crypto";
import type { Effect } from "effect";
import type { DivisionEntries } from "@/lib/division/types";
import type { DivisionError } from "../errors";
import { regenerateMatching } from "../matching-strategy";
import {
  type DivisionIds,
  type DivisionSetupOutcome,
  runDivisionSetup,
} from "../setup-store";
import type { SetLineupInput } from "./schema";

export type SetLineupPort = (
  ids: DivisionIds,
  input: SetLineupInput,
) => Effect.Effect<DivisionSetupOutcome<null>, DivisionError>;

/**
 * 1 チームぶんの出場順を丸ごと差し替える。
 *
 * 出場する／しないと並びを 1 回の保存にまとめてあるので、部分更新は無い。
 * エントリー id は毎回振り直す。setup-store の読み出しが「勝敗が 1 件でも
 * 記録されていれば編集させない」で守っているため、id を指す results は
 * この経路では存在しない。
 *
 * 参加者がそのチームに所属しているかは where（tournamentId + teamId +
 * 組織）で確かめる。1 人でも引けなければ何も書かない。
 */
export const setLineupInDb: SetLineupPort = (ids, input) =>
  runDivisionSetup(ids, async (tx, current) => {
    if (current.format !== "TEAM_MATCH") {
      return { next: null, value: null };
    }
    const teams = current.entries.teams;
    if (teams === undefined || !teams.includes(input.teamId)) {
      return { next: null, value: null };
    }

    if (input.participantIds.length > 0) {
      const found = await tx.participant.findMany({
        where: {
          id: { in: input.participantIds },
          tournamentId: ids.tournamentId,
          teamId: input.teamId,
          tournament: { organizationId: ids.organizationId },
        },
        select: { id: true },
      });
      if (found.length !== input.participantIds.length) {
        return { next: null, value: null };
      }
    }

    const entries: DivisionEntries = {
      version: 1,
      teams,
      entries: [
        // もう一方のチームはそのまま残す。この保存は 1 チームぶんの操作。
        ...current.entries.entries.filter(
          (entry) => entry.teamId !== input.teamId,
        ),
        ...input.participantIds.map((participantId, index) => ({
          id: randomUUID(),
          participantId,
          seed: index,
          teamId: input.teamId,
        })),
      ],
    };

    return {
      next: {
        format: current.format,
        entries,
        matchingConfig: regenerateMatching(current.format, entries),
      },
      value: null,
    };
  });
```

- [ ] **Step 12: 通ることを確認**

Run: `pnpm exec vitest run src/features/division/set-lineup/repository.test.ts`
Expected: PASS（6 件）

- [ ] **Step 13: set-lineup の handler.ts を書く**

`participantIds` は同名フィールドの繰り返しなので `getAll` で受ける。

```ts
"use server";

import { Effect, Exit } from "effect";
import { notFound } from "next/navigation";
import { requirePermission } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import { revalidateDivisionSetup } from "../revalidate";
import type { DivisionFormState } from "../state";
import { setLineupInDb } from "./repository";
import { setLineupSchema } from "./schema";
import { setLineup } from "./usecase";

export const setLineupAction = async (
  _prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const divisionId = String(formData.get("divisionId") ?? "");
  const { organization } = await requirePermission(slug, "tournament.edit");

  // 出場順はチェックの入った行を上から並べた同名フィールドで届く。
  // getAll の順は FormData への追加順、つまり画面の並びと同じ。
  const parsed = setLineupSchema.safeParse({
    teamId: String(formData.get("teamId") ?? ""),
    participantIds: formData.getAll("participantId").map(String),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    setLineup(
      setLineupInDb,
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

- [ ] **Step 14: 全体を通してコミット**

Run: `pnpm typecheck`
Expected: エラーなし

Run: `pnpm test`
Expected: 全件 PASS

```bash
git add src/features/division
git commit -m "$(cat <<'EOF'
feat(division): 団体戦の対戦カードと出場順を保存するスライスを足す

set-teams は 2 チームを選び、外れたチームの選手をエントリーから落とす。
set-lineup は 1 チームぶんの出場順を丸ごと差し替え、seed を 0 から振り直す。
どちらも setup-store の read-modify-write に乗せ、TEAM_MATCH 以外の部門では
何も書かない（swap-slots が SINGLE_ELIMINATION に絞るのと同じ）。
あわせて既存 3 スライスが entries を作り直すとき teams を落とさないようにした。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: 団体戦の設定画面

**Files:**
- Create: `src/components/division/prepare-team-setup.ts`
- Create: `src/components/division/prepare-team-setup.test.ts`
- Create: `src/components/division/TeamLineupForm.tsx`
- Create: `src/components/division/TeamLineupForm.test.tsx`
- Create: `src/components/division/TeamMatchSetup.tsx`
- Create: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/team/page.tsx`
- Modify: `src/components/division/DivisionDetail.tsx`（設定画面への導線）

**Interfaces:**
- Consumes: Task 11 の `setTeamsAction` / `setLineupAction`、Task 2 の `listTeamsInTournament` / `TournamentTeam` / `TeamParticipant`、`findDivisionInTournament`
- Produces:
  - `prepareTeamSetup(division, teams): { kind: "notice"; message: string } | { kind: "ready"; selected: [TournamentTeam, TournamentTeam] | null; lineups: TeamLineup[] }`
  - `type TeamLineup = { team: TournamentTeam; entries: { participantId: string; name: string; playerNumber: string }[] }`
  - `/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/team` のページ

- [ ] **Step 1: prepare-team-setup の失敗するテストを書く**

`src/components/division/prepare-team-setup.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { TournamentTeam } from "@/features/team/repository";
import { prepareTeamSetup } from "./prepare-team-setup";

const teams: TournamentTeam[] = [
  {
    id: "team1",
    name: "A中学",
    order: 0,
    participants: [
      { id: "p1", name: "山田", playerNumber: "1" },
      { id: "p2", name: "佐藤", playerNumber: "2" },
    ],
  },
  {
    id: "team2",
    name: "B中学",
    order: 1,
    participants: [{ id: "p3", name: "田中", playerNumber: "3" }],
  },
];

const division = (entries: unknown) => ({
  id: "d1",
  name: "団体戦 決勝",
  format: "TEAM_MATCH" as const,
  entries,
});

describe("prepareTeamSetup", () => {
  it("entries の Json が壊れていれば案内に倒す", () => {
    const result = prepareTeamSetup(division({ version: 2 }), teams);

    expect(result.kind).toBe("notice");
  });

  it("teams が未設定なら selected は null", () => {
    const result = prepareTeamSetup(
      division({ version: 1, entries: [] }),
      teams,
    );

    expect(result).toEqual({ kind: "ready", selected: null, lineups: [] });
  });

  it("選ばれた 2 チームと出場順を並べて返す", () => {
    const result = prepareTeamSetup(
      division({
        version: 1,
        teams: ["team1", "team2"],
        entries: [
          { id: "e2", participantId: "p2", seed: 1, teamId: "team1" },
          { id: "e1", participantId: "p1", seed: 0, teamId: "team1" },
          { id: "e3", participantId: "p3", seed: 0, teamId: "team2" },
        ],
      }),
      teams,
    );

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") {
      return;
    }
    expect(result.selected?.map((team) => team.id)).toEqual([
      "team1",
      "team2",
    ]);
    expect(result.lineups[0].entries.map((entry) => entry.name)).toEqual([
      "山田",
      "佐藤",
    ]);
  });

  it("消えたチームを指していれば案内に倒す", () => {
    const result = prepareTeamSetup(
      division({ version: 1, teams: ["team1", "team9"], entries: [] }),
      teams,
    );

    expect(result.kind).toBe("notice");
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `pnpm exec vitest run src/components/division/prepare-team-setup.test.ts`
Expected: FAIL（`Failed to resolve import "./prepare-team-setup"`）

- [ ] **Step 3: prepare-team-setup.ts を書く**

```ts
import type { TournamentTeam } from "@/features/team/repository";
import { DivisionJsonError, parseDivisionEntries } from "@/lib/division/parse";

/** 1 チームぶんの出場順。並びがそのまま先鋒 → 大将。 */
export type TeamLineup = {
  team: TournamentTeam;
  entries: { participantId: string; name: string; playerNumber: string }[];
};

export type TeamSetupView =
  | { kind: "notice"; message: string }
  | {
      kind: "ready";
      /** まだ 2 チームを選んでいなければ null */
      selected: [TournamentTeam, TournamentTeam] | null;
      lineups: TeamLineup[];
    };

/**
 * 団体戦の設定画面の材料を作る。Json のパースと形の検査をここが受け止める
 * （prepare-league-table.ts と同じ役割）。
 *
 * チームが消えている場合に案内へ倒すのは、features/team の delete が
 * 部門の Json まで書き換えに行かないため。食い違いは読み出しで吸収する。
 */
export const prepareTeamSetup = (
  division: { entries: unknown },
  teams: TournamentTeam[],
): TeamSetupView => {
  let parsed: ReturnType<typeof parseDivisionEntries>;
  try {
    parsed = parseDivisionEntries(division.entries);
  } catch (error) {
    if (error instanceof DivisionJsonError) {
      return { kind: "notice", message: "エントリーの保存データが読めません" };
    }
    throw error;
  }

  const chosen = parsed.teams;
  if (chosen === undefined) {
    return { kind: "ready", selected: null, lineups: [] };
  }

  const byId = new Map(teams.map((team) => [team.id, team]));
  const left = byId.get(chosen[0]);
  const right = byId.get(chosen[1]);
  if (left === undefined || right === undefined) {
    return {
      kind: "notice",
      message:
        "選ばれていたチームが見つかりません。チームを選び直してください",
    };
  }

  const nameById = new Map(
    teams.flatMap((team) =>
      team.participants.map(
        (participant) => [participant.id, participant] as const,
      ),
    ),
  );

  const lineupOf = (team: TournamentTeam): TeamLineup => ({
    team,
    entries: parsed.entries
      .filter((entry) => entry.teamId === team.id)
      .sort((a, b) => a.seed - b.seed)
      .map((entry) => {
        const participant = nameById.get(entry.participantId);
        return {
          participantId: entry.participantId,
          // 引けない参加者を落とさないのは lib/division/label.ts と同じ思想。
          name: participant?.name ?? "（不明な参加者）",
          playerNumber: participant?.playerNumber ?? "-",
        };
      }),
  });

  return {
    kind: "ready",
    selected: [left, right],
    lineups: [lineupOf(left), lineupOf(right)],
  };
};
```

- [ ] **Step 4: 通ることを確認**

Run: `pnpm exec vitest run src/components/division/prepare-team-setup.test.ts`
Expected: PASS（4 件）

- [ ] **Step 5: TeamLineupForm の失敗するテストを書く**

`src/components/division/TeamLineupForm.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TeamLineupForm } from "./TeamLineupForm";

const team = {
  id: "team1",
  name: "A中学",
  order: 0,
  participants: [
    { id: "p1", name: "山田", playerNumber: "1" },
    { id: "p2", name: "佐藤", playerNumber: "2" },
    { id: "p3", name: "鈴木", playerNumber: "3" },
  ],
};

const renderForm = (selected: string[]) =>
  render(
    <TeamLineupForm
      slug="s"
      tournamentId="t1"
      divisionId="d1"
      team={team}
      selectedParticipantIds={selected}
      action={vi.fn()}
    />,
  );

describe("TeamLineupForm", () => {
  it("出場者を選んだ順に hidden で送る", () => {
    const { container } = renderForm(["p2", "p1"]);

    expect(
      [...container.querySelectorAll('input[name="participantId"]')].map(
        (input) => input.getAttribute("value"),
      ),
    ).toEqual(["p2", "p1"]);
  });

  it("未出場の選手は hidden に載せない", () => {
    const { container } = renderForm(["p1"]);

    expect(
      container.querySelectorAll('input[name="participantId"]'),
    ).toHaveLength(1);
  });

  it("▼ を押すと並びが入れ替わる", async () => {
    const user = userEvent.setup();
    const { container } = renderForm(["p1", "p2"]);

    await user.click(screen.getByRole("button", { name: "山田 を下へ" }));

    expect(
      [...container.querySelectorAll('input[name="participantId"]')].map(
        (input) => input.getAttribute("value"),
      ),
    ).toEqual(["p2", "p1"]);
  });

  it("チェックを入れると末尾に足される", async () => {
    const user = userEvent.setup();
    const { container } = renderForm(["p1"]);

    await user.click(screen.getByRole("checkbox", { name: /鈴木/ }));

    expect(
      [...container.querySelectorAll('input[name="participantId"]')].map(
        (input) => input.getAttribute("value"),
      ),
    ).toEqual(["p1", "p3"]);
  });

  it("所属者が居なければ案内を出す", () => {
    render(
      <TeamLineupForm
        slug="s"
        tournamentId="t1"
        divisionId="d1"
        team={{ ...team, participants: [] }}
        selectedParticipantIds={[]}
        action={vi.fn()}
      />,
    );

    expect(
      screen.getByText("このチームにはまだ参加者が居ません"),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: 実行して失敗を確認**

Run: `pnpm exec vitest run src/components/division/TeamLineupForm.test.tsx`
Expected: FAIL（`Failed to resolve import "./TeamLineupForm"`）

- [ ] **Step 7: TeamLineupForm.tsx を書く**

```tsx
"use client";

import { useActionState, useState } from "react";
import type { TournamentTeam } from "@/features/team/repository";
import {
  INITIAL_DIVISION_FORM_STATE,
  type DivisionFormAction,
} from "@/features/division/state";

/**
 * 1 チームぶんの出場順を編集するフォーム。
 *
 * 「出場するか」と「何番手か」を 1 回の保存にまとめる。送るのは選んだ
 * 選手の participantId を並び順に並べた同名の hidden 入力で、
 * FormData.getAll の順がそのまま先鋒 → 大将になる。
 */
export function TeamLineupForm({
  slug,
  tournamentId,
  divisionId,
  team,
  selectedParticipantIds,
  action,
}: {
  slug: string;
  tournamentId: string;
  divisionId: string;
  team: TournamentTeam;
  /** 保存済みの出場順。先鋒から並んでいる */
  selectedParticipantIds: string[];
  action: DivisionFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_DIVISION_FORM_STATE,
  );
  const [order, setOrder] = useState<string[]>(selectedParticipantIds);

  const nameOf = (participantId: string): string =>
    team.participants.find((p) => p.id === participantId)?.name ?? participantId;

  const toggle = (participantId: string): void => {
    setOrder((current) =>
      current.includes(participantId)
        ? current.filter((id) => id !== participantId)
        : // 新しく出す選手は末尾（大将側）に足す。既存の並びを崩さない。
          [...current, participantId],
    );
  };

  const move = (index: number, delta: number): void => {
    setOrder((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) {
        return current;
      }
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  if (team.participants.length === 0) {
    return (
      <div className="space-y-2 rounded border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-800">{team.name}</p>
        <p className="text-sm text-slate-500">
          このチームにはまだ参加者が居ません
        </p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-3 rounded border border-slate-200 bg-white p-4"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="divisionId" value={divisionId} />
      <input type="hidden" name="teamId" value={team.id} />
      {order.map((participantId) => (
        <input
          key={participantId}
          type="hidden"
          name="participantId"
          value={participantId}
        />
      ))}

      <p className="text-sm font-medium text-slate-800">{team.name}</p>

      <ol className="space-y-1">
        {order.map((participantId, index) => (
          <li
            key={participantId}
            className="flex items-center gap-2 text-sm text-slate-800"
          >
            <span className="w-6 shrink-0 text-xs text-slate-500">
              {index + 1}
            </span>
            <span className="flex-1">{nameOf(participantId)}</span>
            <button
              type="button"
              onClick={() => move(index, -1)}
              aria-label={`${nameOf(participantId)} を上へ`}
              className="rounded border border-slate-300 px-2 py-0.5 text-xs"
            >
              ▲
            </button>
            <button
              type="button"
              onClick={() => move(index, 1)}
              aria-label={`${nameOf(participantId)} を下へ`}
              className="rounded border border-slate-300 px-2 py-0.5 text-xs"
            >
              ▼
            </button>
          </li>
        ))}
      </ol>

      <fieldset className="space-y-1">
        <legend className="text-xs text-slate-500">出場する選手</legend>
        {team.participants.map((participant) => (
          <label
            key={participant.id}
            className="flex items-center gap-2 text-sm text-slate-700"
          >
            <input
              type="checkbox"
              checked={order.includes(participant.id)}
              onChange={() => toggle(participant.id)}
            />
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
              No.{participant.playerNumber}
            </span>
            {participant.name}
          </label>
        ))}
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-400"
      >
        この順で保存
      </button>
      {state.error !== null && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
    </form>
  );
}
```

`INITIAL_DIVISION_FORM_STATE` / `DivisionFormAction` の正確な名前は
`src/features/division/state.ts` を開いて確認し、既存の
`components/division/AddEntryForm.tsx` の import 行をそのまま写す。

- [ ] **Step 8: 通ることを確認**

Run: `pnpm exec vitest run src/components/division/TeamLineupForm.test.tsx`
Expected: PASS（5 件）

- [ ] **Step 9: TeamMatchSetup.tsx を書く**

```tsx
import type { TournamentTeam } from "@/features/team/repository";
import type { DivisionFormAction } from "@/features/division/state";
import { Notice } from "./Notice";
import { TeamLineupForm } from "./TeamLineupForm";
import { TeamSelectForm } from "./TeamSelectForm";
import type { TeamSetupView } from "./prepare-team-setup";

/**
 * 団体戦の設定画面の本体。2 チームを選ぶフォームと、チームごとの
 * 出場順フォームを並べる。Json の検査は prepareTeamSetup が済ませている。
 */
export function TeamMatchSetup({
  slug,
  tournamentId,
  divisionId,
  view,
  teams,
  setTeamsAction,
  setLineupAction,
}: {
  slug: string;
  tournamentId: string;
  divisionId: string;
  view: TeamSetupView;
  teams: TournamentTeam[];
  setTeamsAction: DivisionFormAction;
  setLineupAction: DivisionFormAction;
}) {
  if (view.kind === "notice") {
    return <Notice>{view.message}</Notice>;
  }

  return (
    <div className="space-y-4">
      {teams.length < 2 ? (
        <Notice>
          チームが 2 つ以上ないと団体戦を組めません。大会のチーム画面で
          チームを作ってください
        </Notice>
      ) : (
        <TeamSelectForm
          slug={slug}
          tournamentId={tournamentId}
          divisionId={divisionId}
          teams={teams}
          selected={view.selected}
          action={setTeamsAction}
        />
      )}

      {view.lineups.map((lineup) => (
        <TeamLineupForm
          key={lineup.team.id}
          slug={slug}
          tournamentId={tournamentId}
          divisionId={divisionId}
          team={lineup.team}
          selectedParticipantIds={lineup.entries.map(
            (entry) => entry.participantId,
          )}
          action={setLineupAction}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 10: TeamSelectForm.tsx を書く**

`src/components/division/TeamSelectForm.tsx`:

```tsx
"use client";

import { useActionState, useId } from "react";
import {
  INITIAL_DIVISION_FORM_STATE,
  type DivisionFormAction,
} from "@/features/division/state";
import type { TournamentTeam } from "@/features/team/repository";

/** 対戦する 2 チームを選ぶフォーム。選び直すと外れた側の出場順は消える。 */
export function TeamSelectForm({
  slug,
  tournamentId,
  divisionId,
  teams,
  selected,
  action,
}: {
  slug: string;
  tournamentId: string;
  divisionId: string;
  teams: TournamentTeam[];
  selected: [TournamentTeam, TournamentTeam] | null;
  action: DivisionFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_DIVISION_FORM_STATE,
  );
  const leftId = useId();
  const rightId = useId();

  const options = teams.map((team) => (
    <option key={team.id} value={team.id}>
      {team.name}
    </option>
  ));

  return (
    <form
      action={formAction}
      className="space-y-2 rounded border border-slate-200 bg-white p-4"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="divisionId" value={divisionId} />

      <p className="text-sm font-medium text-slate-800">対戦するチーム</p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={leftId} className="sr-only">
          左のチーム
        </label>
        <select
          id={leftId}
          name="teamId0"
          defaultValue={selected?.[0].id ?? ""}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="">選択してください</option>
          {options}
        </select>
        <span className="text-sm text-slate-500">vs</span>
        <label htmlFor={rightId} className="sr-only">
          右のチーム
        </label>
        <select
          id={rightId}
          name="teamId1"
          defaultValue={selected?.[1].id ?? ""}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="">選択してください</option>
          {options}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-400"
        >
          決定
        </button>
      </div>
      <p className="text-xs text-slate-500">
        チームを選び直すと、外れたチームの出場順は消えます
      </p>
      {state.error !== null && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
    </form>
  );
}
```

- [ ] **Step 11: ページを書く**

`src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/team/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { TeamMatchSetup } from "@/components/division/TeamMatchSetup";
import { prepareTeamSetup } from "@/components/division/prepare-team-setup";
import { findDivisionInTournament } from "@/features/division/repository";
import { setLineupAction } from "@/features/division/set-lineup/handler";
import { setTeamsAction } from "@/features/division/set-teams/handler";
import { listTeamsInTournament } from "@/features/team/repository";
import { findTournamentInOrganization } from "@/features/tournament/repository";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function DivisionTeamPage({
  params,
}: PageProps<"/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/team">) {
  const { slug, tournamentId, divisionId } = await params;
  const { session, organization } = await requireOrganization(slug);

  const [tournament, division, teams] = await Promise.all([
    findTournamentInOrganization(organization.id, tournamentId),
    findDivisionInTournament(organization.id, tournamentId, divisionId),
    listTeamsInTournament(organization.id, tournamentId),
  ]);
  if (!tournament || !division) {
    notFound();
  }
  // この画面は団体戦専用。他の形式には別の画面がある。案内より 404 に倒す。
  if (division.format !== "TEAM_MATCH") {
    notFound();
  }

  const view = prepareTeamSetup(division, teams);

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
          {
            label: division.name,
            href: `/orgs/${slug}/tournaments/${tournament.id}/divisions/${division.id}`,
          },
          { label: "対戦チーム・出場順" },
        ]}
        userName={session.user.name}
        userEmail={session.user.email}
      />

      <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        <h1 className="text-xl font-bold text-slate-900">{division.name}</h1>
        <TeamMatchSetup
          slug={slug}
          tournamentId={tournamentId}
          divisionId={divisionId}
          view={view}
          teams={teams}
          setTeamsAction={setTeamsAction}
          setLineupAction={setLineupAction}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 12: 部門詳細から導線を足す**

`src/components/division/DivisionDetail.tsx` を開き、`ROUND_ROBIN` のとき `/league` へ、それ以外のとき `/setup` へ送っているリンクを探す。`TEAM_MATCH` のとき `/team` へ送るよう分岐を足し、リンクの文言は「対戦チーム・出場順」にする。既存の分岐の書き方（`Record` か `switch`）に合わせる。

- [ ] **Step 13: 型検査・テスト・目視**

Run: `pnpm exec next typegen`（新しいルートの `PageProps` を生成する）
Expected: 成功

Run: `pnpm typecheck`
Expected: エラーなし

Run: `pnpm test`
Expected: 全件 PASS

`pnpm dev` を上げて、チームを 2 つ作った大会に `TEAM_MATCH` の部門を作り、
`/divisions/<id>/team` で 2 チームを選び、両チームの出場順を保存して、
部門詳細に試合が並ぶことを確かめる。

- [ ] **Step 14: コミット**

```bash
git add src/components/division src/app/orgs
git commit -m "$(cat <<'EOF'
feat(division): 団体戦の設定画面を足す

リーグの /league と同じ立て付けで /divisions/[divisionId]/team を持つ。
2 チームを選ぶフォームと、チームごとの出場順フォームの 2 段構成で、
出場するかと何番手かを 1 回の保存にまとめる。Json のパースと
チームの消失は prepareTeamSetup が受け止めて案内に倒す。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

Phase 2 はここで完結する。団体戦の部門を作って組み合わせまで組めるが、結果の表示はまだ案内のままである。

---

## Phase 3: 集計と表示

### Task 13: team-match/standings.ts

**Files:**
- Create: `src/features/division/team-match/standings.ts`
- Create: `src/features/division/team-match/standings.test.ts`

**Interfaces:**
- Consumes: `resolveMatchSlots`（`src/lib/division/resolve.ts`）、`aggregateScore`（`src/lib/division/score.ts`）、Task 7 の `DivisionEntries`
- Produces:
  - `type TeamMatchRow`、`type TeamMatchOutcome`、`type TeamMatchStandings`
  - `buildTeamMatchStandings(entries: DivisionEntries, config: MatchingConfig, results: DivisionResults, resultConfig: DivisionResultConfig): TeamMatchStandings | null`

- [ ] **Step 1: 失敗するテストを書く**

`src/features/division/team-match/standings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DIVISION_RESULT_CONFIG,
  type DivisionEntries,
  type DivisionResultConfig,
  type DivisionResults,
} from "@/lib/division/types";
import { buildTeamMatch } from "./build";
import { buildTeamMatchStandings } from "./standings";

const entriesOf = (left: number, right: number): DivisionEntries => ({
  version: 1,
  teams: ["team1", "team2"],
  entries: [
    ...Array.from({ length: left }, (_, index) => ({
      id: `a${index}`,
      participantId: `pa${index}`,
      seed: index,
      teamId: "team1",
    })),
    ...Array.from({ length: right }, (_, index) => ({
      id: `b${index}`,
      participantId: `pb${index}`,
      seed: index,
      teamId: "team2",
    })),
  ],
});

const resultsOf = (
  matches: DivisionResults["matches"],
): DivisionResults => ({ version: 1, matches });

const withScore: DivisionResultConfig = {
  ...DEFAULT_DIVISION_RESULT_CONFIG,
  score: { enabled: true, count: 1, aggregation: "sum" },
};

describe("buildTeamMatchStandings", () => {
  it("teams が無ければ null", () => {
    expect(
      buildTeamMatchStandings(
        { version: 1, entries: [] },
        { version: 1, matches: [] },
        resultsOf([]),
        DEFAULT_DIVISION_RESULT_CONFIG,
      ),
    ).toBeNull();
  });

  it("組み合わせが未作成なら null", () => {
    expect(
      buildTeamMatchStandings(
        entriesOf(2, 2),
        { version: 1, matches: [] },
        resultsOf([]),
        DEFAULT_DIVISION_RESULT_CONFIG,
      ),
    ).toBeNull();
  });

  it("未記録の試合が残っていれば undecided", () => {
    const entries = entriesOf(3, 3);
    const standings = buildTeamMatchStandings(
      entries,
      buildTeamMatch(entries),
      resultsOf([{ matchId: "t1-0", winnerEntryId: "a0" }]),
      DEFAULT_DIVISION_RESULT_CONFIG,
    );

    expect(standings?.outcome).toEqual({ kind: "undecided" });
    expect(standings?.wins).toEqual([1, 0]);
  });

  it("2 勝 1 敗なら勝ち数で決まる", () => {
    const entries = entriesOf(3, 3);
    const standings = buildTeamMatchStandings(
      entries,
      buildTeamMatch(entries),
      resultsOf([
        { matchId: "t1-0", winnerEntryId: "a0" },
        { matchId: "t1-1", winnerEntryId: "b1" },
        { matchId: "t1-2", winnerEntryId: "a2" },
      ]),
      DEFAULT_DIVISION_RESULT_CONFIG,
    );

    expect(standings?.wins).toEqual([2, 1]);
    expect(standings?.outcome).toEqual({ kind: "win", side: 0, by: "wins" });
  });

  it("勝ち数が同じなら本数で決まる", () => {
    const entries = entriesOf(3, 3);
    const standings = buildTeamMatchStandings(
      entries,
      buildTeamMatch(entries),
      resultsOf([
        {
          matchId: "t1-0",
          winnerEntryId: "a0",
          scores: [
            { entryId: "a0", values: [2] },
            { entryId: "b0", values: [0] },
          ],
        },
        {
          matchId: "t1-1",
          winnerEntryId: "b1",
          scores: [
            { entryId: "a1", values: [1] },
            { entryId: "b1", values: [2] },
          ],
        },
        { matchId: "t1-2", winnerEntryId: null },
      ]),
      withScore,
    );

    expect(standings?.wins).toEqual([1, 1]);
    expect(standings?.draws).toBe(1);
    expect(standings?.points).toEqual([3, 2]);
    expect(standings?.outcome).toEqual({ kind: "win", side: 0, by: "points" });
  });

  it("勝ち数も本数も同じなら引き分け", () => {
    const entries = entriesOf(1, 1);
    const standings = buildTeamMatchStandings(
      entries,
      buildTeamMatch(entries),
      resultsOf([
        {
          matchId: "t1-0",
          winnerEntryId: null,
          scores: [
            { entryId: "a0", values: [1] },
            { entryId: "b0", values: [1] },
          ],
        },
      ]),
      withScore,
    );

    expect(standings?.outcome).toEqual({ kind: "draw" });
  });

  it("score が無効なら本数の段を飛ばして引き分け", () => {
    const entries = entriesOf(1, 1);
    const standings = buildTeamMatchStandings(
      entries,
      buildTeamMatch(entries),
      resultsOf([
        {
          matchId: "t1-0",
          winnerEntryId: null,
          scores: [
            { entryId: "a0", values: [5] },
            { entryId: "b0", values: [0] },
          ],
        },
      ]),
      DEFAULT_DIVISION_RESULT_CONFIG,
    );

    expect(standings?.points).toEqual([null, null]);
    expect(standings?.outcome).toEqual({ kind: "draw" });
  });

  it("人数差の BYE は記録なしで不戦勝として数える", () => {
    const entries = entriesOf(3, 2);
    const standings = buildTeamMatchStandings(
      entries,
      buildTeamMatch(entries),
      resultsOf([
        { matchId: "t1-0", winnerEntryId: "b0" },
        { matchId: "t1-1", winnerEntryId: "b1" },
      ]),
      DEFAULT_DIVISION_RESULT_CONFIG,
    );

    expect(standings?.wins).toEqual([1, 2]);
    expect(standings?.rows[2].entryIds).toEqual(["a2", null]);
    expect(standings?.outcome).toEqual({ kind: "win", side: 1, by: "wins" });
  });

  it("片側だけスコアが入っていればその側だけ合計に乗る", () => {
    const entries = entriesOf(1, 1);
    const standings = buildTeamMatchStandings(
      entries,
      buildTeamMatch(entries),
      resultsOf([
        {
          matchId: "t1-0",
          winnerEntryId: "a0",
          scores: [{ entryId: "a0", values: [2] }],
        },
      ]),
      withScore,
    );

    expect(standings?.points).toEqual([2, 0]);
  });

  it("行は位置の順に並び、引き分けが分かる", () => {
    const entries = entriesOf(2, 2);
    const standings = buildTeamMatchStandings(
      entries,
      buildTeamMatch(entries),
      resultsOf([
        { matchId: "t1-0", winnerEntryId: null },
        { matchId: "t1-1", winnerEntryId: "a1" },
      ]),
      DEFAULT_DIVISION_RESULT_CONFIG,
    );

    expect(standings?.rows.map((row) => row.position)).toEqual([0, 1]);
    expect(standings?.rows[0].drawn).toBe(true);
    expect(standings?.rows[1].drawn).toBe(false);
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `pnpm exec vitest run src/features/division/team-match/standings.test.ts`
Expected: FAIL（`Failed to resolve import "./standings"`）

- [ ] **Step 3: standings.ts を書く**

```ts
import { resolveMatchSlots } from "@/lib/division/resolve";
import { aggregateScore } from "@/lib/division/score";
import type {
  DivisionEntries,
  DivisionResultConfig,
  DivisionResults,
  MatchingConfig,
  MatchResultRecord,
} from "@/lib/division/types";

/** 団体戦の 1 本。position 0 が先鋒。 */
export type TeamMatchRow = {
  matchId: string;
  position: number;
  /** スロット順（左チーム / 右チーム）。BYE は null */
  entryIds: [string | null, string | null];
  /** 未記録は null。BYE の自動勝ちを含む */
  winnerEntryId: string | null;
  /** 記録があって winnerEntryId が null なら引き分け */
  drawn: boolean;
  /** resultConfig.score が無効なら [null, null] */
  points: [number | null, number | null];
};

/** 団体戦の決着。side はスロット順（0 = 左のチーム）。 */
export type TeamMatchOutcome =
  | { kind: "undecided" }
  | { kind: "win"; side: 0 | 1; by: "wins" | "points" }
  | { kind: "draw" };

export type TeamMatchStandings = {
  rows: TeamMatchRow[];
  wins: [number, number];
  draws: number;
  /** score が無効なら [null, null] */
  points: [number | null, number | null];
  outcome: TeamMatchOutcome;
};

/** 1 人ぶんの採点を 1 つの数にまとめる。未入力しか無ければ null。 */
const pointOf = (
  record: MatchResultRecord | undefined,
  entryId: string | null,
  config: DivisionResultConfig,
): number | null => {
  if (!config.score.enabled || entryId === null) {
    return null;
  }
  const scores = record?.scores ?? [];
  const found = scores.find((entry) => entry.entryId === entryId);
  return found === undefined
    ? null
    : aggregateScore(found.values, config.score.aggregation);
};

/**
 * 団体戦の星取と決着を組み立てる。
 *
 * 決め方は 勝利数 → 本数の合計 → 引き分け。本数は resultConfig.score が
 * 有効なときだけ見る。無効なら勝ち数が並んだ時点で引き分けになる。
 *
 * aggregation が "average" の部門でも同じ経路を通す。平均の合計は本数として
 * 不自然だが、resultConfig は「表示と入力のフィルタ」でしかないという既存の
 * 思想に合わせ、勝敗判定のために集計方法を上書きはしない。
 *
 * 代表戦は持たない。同数どうしは { kind: "draw" } で止める。
 * ここが後で代表戦を足すときの差し込み口になる。
 *
 * teams が無い・組み合わせが未作成なら null を返す。呼び出し側は案内を出す。
 */
export const buildTeamMatchStandings = (
  entries: DivisionEntries,
  config: MatchingConfig,
  results: DivisionResults,
  resultConfig: DivisionResultConfig,
): TeamMatchStandings | null => {
  if (entries.teams === undefined || config.matches.length === 0) {
    return null;
  }

  const resolved = resolveMatchSlots(config, results);
  const recordById = new Map(
    results.matches.map((record) => [record.matchId, record]),
  );

  const wins: [number, number] = [0, 0];
  const totals: [number, number] = [0, 0];
  let draws = 0;
  let undecided = false;

  const rows: TeamMatchRow[] = [...config.matches]
    .sort((left, right) => left.order - right.order)
    .map((match) => {
      const current = resolved.get(match.id);
      const entryIds: [string | null, string | null] =
        current === undefined
          ? [null, null]
          : [
              current.slots[0].state === "entry"
                ? current.slots[0].entryId
                : null,
              current.slots[1].state === "entry"
                ? current.slots[1].entryId
                : null,
            ];
      const winnerEntryId = current?.winnerEntryId ?? null;
      const record = recordById.get(match.id);
      const drawn = record !== undefined && record.winnerEntryId === null;

      if (winnerEntryId === null && !drawn) {
        undecided = true;
      }
      if (drawn) {
        draws += 1;
      }
      for (const side of [0, 1] as const) {
        if (winnerEntryId !== null && entryIds[side] === winnerEntryId) {
          wins[side] += 1;
        }
      }

      const points: [number | null, number | null] = [
        pointOf(record, entryIds[0], resultConfig),
        pointOf(record, entryIds[1], resultConfig),
      ];
      for (const side of [0, 1] as const) {
        const value = points[side];
        if (value !== null) {
          totals[side] += value;
        }
      }

      return {
        matchId: match.id,
        position: match.order,
        entryIds,
        winnerEntryId,
        drawn,
        points,
      };
    });

  const scored = resultConfig.score.enabled;
  const teamPoints: [number | null, number | null] = scored
    ? [totals[0], totals[1]]
    : [null, null];

  return {
    rows,
    wins,
    draws,
    points: teamPoints,
    outcome: decide(undecided, wins, teamPoints),
  };
};

/** 勝利数 → 本数 → 引き分けの順に決める。 */
const decide = (
  undecided: boolean,
  wins: readonly [number, number],
  points: readonly [number | null, number | null],
): TeamMatchOutcome => {
  if (undecided) {
    return { kind: "undecided" };
  }
  if (wins[0] !== wins[1]) {
    return { kind: "win", side: wins[0] > wins[1] ? 0 : 1, by: "wins" };
  }
  const [left, right] = points;
  if (left !== null && right !== null && left !== right) {
    return { kind: "win", side: left > right ? 0 : 1, by: "points" };
  }
  return { kind: "draw" };
};
```

- [ ] **Step 4: 通ることを確認**

Run: `pnpm exec vitest run src/features/division/team-match/standings.test.ts`
Expected: PASS（10 件）

- [ ] **Step 5: コミット**

```bash
git add src/features/division/team-match
git commit -m "$(cat <<'EOF'
feat(division): 団体戦の勝敗集計を足す

勝利数 → 本数の合計 → 引き分け の順に決める純粋関数。BYE の不戦勝は
resolveMatchSlots が返す勝者にそのまま含まれるので別扱いしない。
本数は resultConfig.score が有効なときだけ見て、無効なら段を飛ばす。
代表戦は持たず、同数どうしは draw で止める。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: 引き分けの入力

**Files:**
- Modify: `src/features/division/record-result/schema.ts`
- Modify: `src/features/division/record-result/repository.ts`
- Modify: `src/features/division/record-result/repository.test.ts`
- Modify: `src/features/schedule/result-rows.ts`
- Modify: `src/features/schedule/result-rows.test.ts`
- Modify: `src/components/result/MatchResultRow.tsx`
- Modify: `src/components/result/MatchResultRow.test.tsx`

**Interfaces:**
- Consumes: Task 8 の `validateResults`（`TEAM_MATCH` / `ROUND_ROBIN` で `null` を許す）
- Produces:
  - `DRAW_VALUE = "draw"`（`record-result/schema.ts`）
  - `ResultRowView` の match 行に `drawAllowed: boolean`

- [ ] **Step 1: 失敗するテストを書く（repository）**

`src/features/division/record-result/repository.test.ts` に足す。`ROUND_ROBIN` の部門を読ませているケースを手本にして書く。

```ts
  it('winnerEntryId が "draw" なら引き分けとして記録する', async () => {
    // 部門は ROUND_ROBIN、両スロットが確定している試合を用意する
    const exit = await Effect.runPromiseExit(
      recordResultInDb(ids, { matchId: "r1-0", winnerEntryId: "draw" }),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          results: expect.objectContaining({
            matches: [{ matchId: "r1-0", winnerEntryId: null }],
          }),
        }),
      }),
    );
  });

  it("すでに引き分けの試合に引き分けを送っても書き込まない", async () => {
    // 既存の results に { matchId: "r1-0", winnerEntryId: null } がある状態
    const exit = await Effect.runPromiseExit(
      recordResultInDb(ids, { matchId: "r1-0", winnerEntryId: "draw" }),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("引き分けの試合に空文字（取り消し）を送ると記録が消える", async () => {
    const exit = await Effect.runPromiseExit(
      recordResultInDb(ids, { matchId: "r1-0", winnerEntryId: "" }),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(updateMany).toHaveBeenCalled();
  });

  it("両スロットが確定していない試合には引き分けも入れられない", async () => {
    // 片側が bye、または winnerOf 待ちの試合 id を渡す
    const exit = await Effect.runPromiseExit(
      recordResultInDb(ids, { matchId: "m2-0", winnerEntryId: "draw" }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("トーナメントの部門では引き分けを保存しない", async () => {
    // 部門は SINGLE_ELIMINATION。validateResults が弾く
    const exit = await Effect.runPromiseExit(
      recordResultInDb(ids, { matchId: "m1-0", winnerEntryId: "draw" }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(updateMany).not.toHaveBeenCalled();
  });
```

既存テストの mock の組み方（`division.findFirst` が返す `format` / `entries` / `matchingConfig` / `results` / `revision`）をそのまま流用し、各ケースの前提に合わせて戻り値を差し替える。

- [ ] **Step 2: 実行して失敗を確認**

Run: `pnpm exec vitest run src/features/division/record-result/repository.test.ts`
Expected: FAIL（`"draw"` が entryId として扱われ、スロットに立っていないため `DivisionSlotNotDecidedError` になる）

- [ ] **Step 3: schema.ts を直す**

```ts
import { z } from "zod";

/**
 * 「引き分け」を表す番兵。DivisionEntry.id は uuid なのでこの語と衝突しない。
 * 空文字（取り消し）と区別するために別の値を置いている。
 */
export const DRAW_VALUE = "draw";

/**
 * winnerEntryId は勝者の DivisionEntry.id。
 * 空文字は「記録を取り消す」、DRAW_VALUE は「引き分け」を表す。
 * 画面の「取り消し」ボタンが value=""、「引分」ボタンが value="draw" で送る。
 */
export const recordResultSchema = z.object({
  matchId: z.string().min(1, "試合の指定が不正です"),
  winnerEntryId: z.string(),
});

export type RecordResultInput = z.infer<typeof recordResultSchema>;
```

- [ ] **Step 4: repository.ts を直す**

import に足す。

```ts
import { DRAW_VALUE } from "./schema";
```

`nextWinner` の計算を 3 値のコマンドに置き換える。`existing` を求めた直後に書く。

```ts
          /**
           * 送られた値の 3 値。winnerEntryId: null が「引き分け」と
           * 「記録なし」の両方を指しうるため、入力の時点で区別しておく。
           */
          type ResultCommand =
            | { kind: "clear" }
            | { kind: "draw" }
            | { kind: "win"; winnerEntryId: string };

          const command: ResultCommand =
            input.winnerEntryId === ""
              ? { kind: "clear" }
              : input.winnerEntryId === DRAW_VALUE
                ? { kind: "draw" }
                : { kind: "win", winnerEntryId: input.winnerEntryId };
```

スロットの確定検査を「取り消し以外」に広げる（引き分けも両者が立っていないと入れられない）。

```ts
          if (command.kind !== "clear") {
            // 画面ではボタンを無効にしているが、Server Action はページを経由せず
            // 直接叩ける別の入口なので、ここで独立に確かめる。両スロットが確定
            // していない試合（未確定・BYE）は入力させない。引き分けも同じ。
            const resolved = resolveMatchSlots(config, current).get(
              input.matchId,
            );
            const standing =
              resolved === undefined
                ? []
                : resolved.slots.flatMap((slot) =>
                    slot.state === "entry" ? [slot.entryId] : [],
                  );
            if (
              standing.length !== 2 ||
              (command.kind === "win" &&
                !standing.includes(command.winnerEntryId))
            ) {
              throw new DivisionSlotNotDecidedError({
                matchId: input.matchId,
              });
            }
          }
```

「変更なし」の判定を 3 値で書き直す。

```ts
          // 「変更なし」は記録の有無と勝者の値の両方で見る。引き分けの記録は
          // winnerEntryId が null なので、記録の有無だけで比べると「記録が無い」
          // と区別が付かない。結果が 1 件でもあれば部門を編集不能にする
          // setup-store の仕様上、取り消しはその唯一の逃げ道なので塞げない。
          const unchanged =
            command.kind === "clear"
              ? existing === undefined
              : command.kind === "draw"
                ? existing !== undefined && existing.winnerEntryId === null
                : existing?.winnerEntryId === command.winnerEntryId;
          if (unchanged) {
            return { found: true, value: { recorded: false } };
          }
```

書き込む内容を 3 値で組む。

```ts
          const cleared = clearResults(
            current,
            downstreamMatchIds(input.matchId, config),
          );
          const carried = {
            ...(existing?.scores !== undefined
              ? { scores: existing.scores }
              : {}),
            ...(existing?.note !== undefined ? { note: existing.note } : {}),
          };
          const next =
            command.kind === "clear"
              ? clearResults(cleared, new Set([input.matchId]))
              : applyMatchResult(cleared, {
                  matchId: input.matchId,
                  winnerEntryId:
                    command.kind === "draw" ? null : command.winnerEntryId,
                  ...carried,
                });
```

引き分けが許されない形式は、この下の `validateResults(next, config, row.format)` が弾く（Task 8 で対応済み）。

- [ ] **Step 5: 通ることを確認**

Run: `pnpm exec vitest run src/features/division/record-result/`
Expected: PASS（既存 + 追加 5 件）

- [ ] **Step 6: result-rows.ts に drawAllowed を足す**

`ResultRowView` の match 行に足す。

```ts
      /** この形式で引き分けを入力できるか。画面のボタンの出し分けに使う */
      drawAllowed: boolean;
```

行を組み立てている箇所で、部門の `format` から求める。

```ts
/**
 * 引き分けを入力できる形式。勝ち上がりを持たない 2 形式だけで、
 * lib/division/validate.ts の validateResults と同じ条件にそろえる。
 */
const drawAllowedFor = (format: DivisionFormat): boolean =>
  format === "ROUND_ROBIN" || format === "TEAM_MATCH";
```

`buildResultRows`（実際の関数名はファイルを開いて確認する）が部門の `format` を
読み出しの材料として受け取っていなければ、`resultConfig` を運んでいるのと同じ経路に
`format` を足す。`resultConfig` を持つ型に `format: DivisionFormat` を 1 つ増やすのが
最小の変更になる。

`src/features/schedule/result-rows.test.ts` に 2 件足す。

```ts
  it("リーグの行は引き分けを入力できる", () => {
    // ROUND_ROBIN の部門で組んだ行を取り出す
    expect(row.drawAllowed).toBe(true);
  });

  it("トーナメントの行は引き分けを入力できない", () => {
    expect(row.drawAllowed).toBe(false);
  });
```

Run: `pnpm exec vitest run src/features/schedule/`
Expected: PASS

- [ ] **Step 7: MatchResultRow に「引分」ボタンを足す**

`src/components/result/MatchResultRow.test.tsx` に足す。

```tsx
  it("引き分けを許す形式では引分ボタンを出す", () => {
    render(
      <MatchResultRow
        row={{ ...readyRow, drawAllowed: true }}
        slug="s"
        tournamentId="t1"
        action={vi.fn()}
        detailAction={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /引き分け/ }),
    ).toBeInTheDocument();
  });

  it("許さない形式では出さない", () => {
    render(
      <MatchResultRow
        row={{ ...readyRow, drawAllowed: false }}
        slug="s"
        tournamentId="t1"
        action={vi.fn()}
        detailAction={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /引き分け/ }),
    ).not.toBeInTheDocument();
  });

  it("記録済みの引き分けはボタンが押された状態になる", () => {
    render(
      <MatchResultRow
        row={{
          ...readyRow,
          drawAllowed: true,
          state: "recorded",
          winnerEntryId: null,
        }}
        slug="s"
        tournamentId="t1"
        action={vi.fn()}
        detailAction={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /引き分け/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
```

`readyRow` は既存テストのフィクスチャ名に合わせる。

`MatchResultRow.tsx` の 2 つ目の `WinnerButton` の直後、「取り消し」ボタンの手前に足す。

```tsx
          {row.drawAllowed && (
            <button
              type="submit"
              name="winnerEntryId"
              value={DRAW_VALUE}
              aria-label={`${row.divisionName} ${row.matchName}は引き分け`}
              aria-pressed={row.state === "recorded" && row.winnerEntryId === null}
              disabled={pending || !editable}
              onClick={confirmIfNeeded(null)}
              className={
                row.state === "recorded" && row.winnerEntryId === null
                  ? "rounded border border-slate-800 bg-slate-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
                  : "rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-40"
              }
            >
              引き分け
            </button>
          )}
```

import に足す。

```tsx
import { DRAW_VALUE } from "@/features/division/record-result/schema";
```

`confirmIfNeeded(null)` を渡すのは、引き分けに変えると下流の記録も消えるため（取り消しと同じ扱い）。引き分けを許す形式に下流は無いが、判定は共通のままでよい（`downstreamRecordedCount` が 0 なので確認は出ない）。

- [ ] **Step 8: 通ることを確認**

Run: `pnpm exec vitest run src/components/result/`
Expected: PASS

Run: `pnpm typecheck`
Expected: エラーなし

Run: `pnpm test`
Expected: 全件 PASS

- [ ] **Step 9: コミット**

```bash
git add src/features/division/record-result src/features/schedule src/components/result
git commit -m "$(cat <<'EOF'
feat(result): 1 試合ごとの引き分けを入力できるようにする

winnerEntryId に番兵 "draw" を足し、空文字（取り消し）と区別して
3 値で扱う。保存できるのは ROUND_ROBIN と TEAM_MATCH だけで、
validateResults が形式を見て弾く。両スロットが確定していない試合には
勝ちと同じく引き分けも入れられない。

これまで一度も埋まらなかったリーグの星取表の「分 / △」列も、
これで動くようになる。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: 団体戦の結果表

**Files:**
- Create: `src/components/division/prepare-team-match-table.ts`
- Create: `src/components/division/prepare-team-match-table.test.ts`
- Create: `src/components/division/TeamMatchTable.tsx`
- Create: `src/components/division/TeamMatchTable.test.tsx`
- Modify: `src/components/division/DivisionMatchingView.tsx`
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/page.tsx`
- Modify: `src/app/t/[tournamentId]/divisions/[divisionId]/page.tsx`

**Interfaces:**
- Consumes: Task 13 の `buildTeamMatchStandings` / `TeamMatchStandings`、`DivisionDetail` / `DivisionParticipant`（`features/division/repository`）、`listTeamsInTournament`
- Produces:
  - `prepareTeamMatchTable(division, participants, teamNames, overallSeq): { kind: "notice"; message: string } | { kind: "table"; table: TeamMatchTableView }`
  - `type TeamMatchTableView = { teamNames: [string, string]; standings: TeamMatchStandings; rows: TeamMatchTableRow[] }`
  - `type TeamMatchTableRow = { matchId: string; matchName: string; names: [string, string]; marks: ["win" | "lose" | "draw" | "none", "win" | "lose" | "draw" | "none"]; points: [string | null, string | null] }`

- [ ] **Step 1: 失敗するテストを書く**

`src/components/division/prepare-team-match-table.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prepareTeamMatchTable } from "./prepare-team-match-table";

const entries = {
  version: 1,
  teams: ["team1", "team2"],
  entries: [
    { id: "a0", participantId: "p1", seed: 0, teamId: "team1" },
    { id: "b0", participantId: "p2", seed: 0, teamId: "team2" },
  ],
};

const matchingConfig = {
  version: 1,
  matches: [
    {
      id: "t1-0",
      bracket: "winners",
      round: 1,
      order: 0,
      matchName: "第{{OverallSeq}}試合",
      slots: [
        { kind: "entry", entryId: "a0" },
        { kind: "entry", entryId: "b0" },
      ],
    },
  ],
};

const division = (results: unknown) => ({
  id: "d1",
  name: "団体戦",
  format: "TEAM_MATCH" as const,
  entries,
  matchingConfig,
  results,
  resultConfig: {
    version: 1,
    winReason: { enabled: false, options: [] },
    score: { enabled: false, count: 1, aggregation: "sum" },
    note: { enabled: false },
  },
});

const participants = [
  { id: "p1", name: "山田" },
  { id: "p2", name: "田中" },
];

const teamNames = new Map([
  ["team1", "A中学"],
  ["team2", "B中学"],
]);

const overallSeq = new Map([["d1:t1-0", 3]]);

describe("prepareTeamMatchTable", () => {
  it("Json が壊れていれば案内に倒す", () => {
    const result = prepareTeamMatchTable(
      { ...division({ version: 1, matches: [] }), entries: { version: 2 } },
      participants,
      teamNames,
      overallSeq,
    );

    expect(result.kind).toBe("notice");
  });

  it("チームが選ばれていなければ案内に倒す", () => {
    const result = prepareTeamMatchTable(
      {
        ...division({ version: 1, matches: [] }),
        entries: { version: 1, entries: [] },
        matchingConfig: { version: 1, matches: [] },
      },
      participants,
      teamNames,
      overallSeq,
    );

    expect(result.kind).toBe("notice");
  });

  it("チーム名と選手名と勝敗の印を並べる", () => {
    const result = prepareTeamMatchTable(
      division({
        version: 1,
        matches: [{ matchId: "t1-0", winnerEntryId: "a0" }],
      }),
      participants,
      teamNames,
      overallSeq,
    );

    expect(result.kind).toBe("table");
    if (result.kind !== "table") {
      return;
    }
    expect(result.table.teamNames).toEqual(["A中学", "B中学"]);
    expect(result.table.rows[0].names).toEqual(["山田", "田中"]);
    expect(result.table.rows[0].marks).toEqual(["win", "lose"]);
    expect(result.table.standings.outcome).toEqual({
      kind: "win",
      side: 0,
      by: "wins",
    });
  });

  it("引き分けの行は両側が draw", () => {
    const result = prepareTeamMatchTable(
      division({
        version: 1,
        matches: [{ matchId: "t1-0", winnerEntryId: null }],
      }),
      participants,
      teamNames,
      overallSeq,
    );

    if (result.kind !== "table") {
      throw new Error("table を期待");
    }
    expect(result.table.rows[0].marks).toEqual(["draw", "draw"]);
  });

  it("未記録の行は両側が none", () => {
    const result = prepareTeamMatchTable(
      division({ version: 1, matches: [] }),
      participants,
      teamNames,
      overallSeq,
    );

    if (result.kind !== "table") {
      throw new Error("table を期待");
    }
    expect(result.table.rows[0].marks).toEqual(["none", "none"]);
  });

  it("団体戦の形をしていない組み合わせは案内に倒す", () => {
    const result = prepareTeamMatchTable(
      {
        ...division({ version: 1, matches: [] }),
        matchingConfig: {
          version: 1,
          matches: [
            {
              id: "m2-0",
              bracket: "winners",
              round: 2,
              order: 0,
              matchName: "第1試合",
              slots: [
                { kind: "winnerOf", matchId: "m1-0" },
                { kind: "winnerOf", matchId: "m1-1" },
              ],
            },
          ],
        },
      },
      participants,
      teamNames,
      overallSeq,
    );

    expect(result.kind).toBe("notice");
  });

  it("消えたチームは名前を引けなくても表を出す", () => {
    const result = prepareTeamMatchTable(
      division({ version: 1, matches: [] }),
      participants,
      new Map([["team1", "A中学"]]),
      overallSeq,
    );

    if (result.kind !== "table") {
      throw new Error("table を期待");
    }
    expect(result.table.teamNames[1]).toBe("（不明なチーム）");
  });

  it("試合名の {{OverallSeq}} を展開する", () => {
    const result = prepareTeamMatchTable(
      division({ version: 1, matches: [] }),
      participants,
      teamNames,
      overallSeq,
    );

    if (result.kind !== "table") {
      throw new Error("table を期待");
    }
    expect(result.table.rows[0].matchName).toBe("第3試合");
  });
});
```

`overallSeq` のキーの形（`"d1:t1-0"` としたところ）は、
`src/components/division/prepare-league-table.ts` が
`overallSeq` をどう引いているかを読んで、同じ形に合わせる。

- [ ] **Step 2: 実行して失敗を確認**

Run: `pnpm exec vitest run src/components/division/prepare-team-match-table.test.ts`
Expected: FAIL（`Failed to resolve import "./prepare-team-match-table"`）

- [ ] **Step 3: prepare-team-match-table.ts を書く**

`prepare-league-table.ts` を開き、Json のパース・`resolveMatchNames` の呼び方・
`overallSeq` の引き方をそのまま写して次を書く。

```ts
import { isTeamMatchShape } from "@/features/division/team-match/build";
import {
  buildTeamMatchStandings,
  type TeamMatchStandings,
} from "@/features/division/team-match/standings";
import type {
  DivisionDetail,
  DivisionParticipant,
} from "@/features/division/repository";
import {
  DivisionJsonError,
  parseDivisionEntries,
  parseDivisionResultConfigOrDefault,
  parseDivisionResults,
  parseMatchingConfig,
} from "@/lib/division/parse";
import { formatScore } from "@/lib/division/score";

/** 勝敗の印。none は未記録 */
export type TeamMatchMark = "win" | "lose" | "draw" | "none";

export type TeamMatchTableRow = {
  matchId: string;
  /** {{OverallSeq}} 展開済み */
  matchName: string;
  names: [string, string];
  marks: [TeamMatchMark, TeamMatchMark];
  /** score が無効なら [null, null] */
  points: [string | null, string | null];
};

export type TeamMatchTableView = {
  teamNames: [string, string];
  standings: TeamMatchStandings;
  rows: TeamMatchTableRow[];
};

export type TeamMatchTableResult =
  | { kind: "notice"; message: string }
  | { kind: "table"; table: TeamMatchTableView };

const markOf = (
  entryId: string | null,
  winnerEntryId: string | null,
  drawn: boolean,
): TeamMatchMark => {
  if (drawn) {
    return "draw";
  }
  if (winnerEntryId === null || entryId === null) {
    return "none";
  }
  return entryId === winnerEntryId ? "win" : "lose";
};

/**
 * 団体戦の結果表の材料を作る。Json のパースと形の検査をここが受け止める
 * （prepare-league-table.ts と同じ役割）。
 *
 * 名前を引けない参加者・チームは落とさずに「（不明な〜）」にする。
 * 一覧が 1 件の食い違いで丸ごと見えなくなる方が困るため。
 */
export const prepareTeamMatchTable = (
  division: Pick<
    DivisionDetail,
    "id" | "entries" | "matchingConfig" | "results" | "resultConfig"
  >,
  participants: DivisionParticipant[],
  teamNames: ReadonlyMap<string, string>,
  overallSeq: ReadonlyMap<string, number>,
): TeamMatchTableResult => {
  let entries: ReturnType<typeof parseDivisionEntries>;
  let config: ReturnType<typeof parseMatchingConfig>;
  let results: ReturnType<typeof parseDivisionResults>;
  try {
    entries = parseDivisionEntries(division.entries);
    config = parseMatchingConfig(division.matchingConfig);
    results = parseDivisionResults(division.results);
  } catch (error) {
    if (error instanceof DivisionJsonError) {
      return { kind: "notice", message: "保存データが読めません" };
    }
    throw error;
  }

  // /edit は format を無条件に書き換えられるため、トーナメントの木を持った
  // まま TEAM_MATCH になった部門が存在しうる。その木をこの表で描くと
  // 意味を成さないので、形が違う時点で案内に倒す。
  if (!isTeamMatchShape(config)) {
    return {
      kind: "notice",
      message: "保存されている組み合わせが団体戦の形をしていません",
    };
  }

  const resultConfig = parseDivisionResultConfigOrDefault(
    division.resultConfig,
  );
  const standings = buildTeamMatchStandings(
    entries,
    config,
    results,
    resultConfig,
  );
  if (standings === null || entries.teams === undefined) {
    return { kind: "notice", message: "対戦するチームと組み合わせが未設定です" };
  }

  const nameByParticipantId = new Map(
    participants.map((participant) => [participant.id, participant.name]),
  );
  const nameByEntryId = new Map(
    entries.entries.map((entry) => [
      entry.id,
      nameByParticipantId.get(entry.participantId) ?? "（不明な参加者）",
    ]),
  );
  // 試合名の展開は prepare-league-table.ts と同じ関数・同じキーの作り方に
  // そろえる（{{OverallSeq}} は大会全体を見ないと決まらない）。
  const matchNames = resolveMatchNames(division.id, config, overallSeq);

  const rows: TeamMatchTableRow[] = standings.rows.map((row) => ({
    matchId: row.matchId,
    matchName: matchNames.get(row.matchId) ?? "",
    names: [
      row.entryIds[0] === null
        ? "BYE"
        : (nameByEntryId.get(row.entryIds[0]) ?? "（不明な参加者）"),
      row.entryIds[1] === null
        ? "BYE"
        : (nameByEntryId.get(row.entryIds[1]) ?? "（不明な参加者）"),
    ],
    marks: [
      markOf(row.entryIds[0], row.winnerEntryId, row.drawn),
      markOf(row.entryIds[1], row.winnerEntryId, row.drawn),
    ],
    points: [formatScore(row.points[0]), formatScore(row.points[1])],
  }));

  return {
    kind: "table",
    table: {
      teamNames: [
        teamNames.get(entries.teams[0]) ?? "（不明なチーム）",
        teamNames.get(entries.teams[1]) ?? "（不明なチーム）",
      ],
      standings,
      rows,
    },
  };
};
```

`resolveMatchNames` の import 行と呼び出しの引数は
`prepare-league-table.ts` からそのまま写す（`@/lib/division/match-name`）。

- [ ] **Step 4: 通ることを確認**

Run: `pnpm exec vitest run src/components/division/prepare-team-match-table.test.ts`
Expected: PASS（8 件）

- [ ] **Step 5: TeamMatchTable の失敗するテストを書く**

`src/components/division/TeamMatchTable.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TeamMatchTableView } from "./prepare-team-match-table";
import { TeamMatchTable } from "./TeamMatchTable";

const base: TeamMatchTableView = {
  teamNames: ["A中学", "B中学"],
  standings: {
    rows: [],
    wins: [2, 1],
    draws: 0,
    points: [null, null],
    outcome: { kind: "win", side: 0, by: "wins" },
  },
  rows: [
    {
      matchId: "t1-0",
      matchName: "第1試合",
      names: ["山田", "田中"],
      marks: ["win", "lose"],
      points: [null, null],
    },
  ],
};

describe("TeamMatchTable", () => {
  it("チーム名と勝ち数を出す", () => {
    render(<TeamMatchTable table={base} />);

    expect(screen.getByText("A中学")).toBeInTheDocument();
    expect(screen.getByText("2 - 1")).toBeInTheDocument();
  });

  it("決着の理由を添えて勝者を出す", () => {
    render(<TeamMatchTable table={base} />);

    expect(screen.getByText("勝者 A中学（勝ち数）")).toBeInTheDocument();
  });

  it("本数差で決まったらそう書く", () => {
    render(
      <TeamMatchTable
        table={{
          ...base,
          standings: {
            ...base.standings,
            wins: [1, 1],
            points: [3, 2],
            outcome: { kind: "win", side: 0, by: "points" },
          },
        }}
      />,
    );

    expect(screen.getByText("勝者 A中学（本数差）")).toBeInTheDocument();
  });

  it("引き分けならそう書く", () => {
    render(
      <TeamMatchTable
        table={{
          ...base,
          standings: { ...base.standings, outcome: { kind: "draw" } },
        }}
      />,
    );

    expect(screen.getByText("引き分け")).toBeInTheDocument();
  });

  it("未決着なら決着の行を出さない", () => {
    render(
      <TeamMatchTable
        table={{
          ...base,
          standings: { ...base.standings, outcome: { kind: "undecided" } },
        }}
      />,
    );

    expect(screen.queryByText(/勝者/)).not.toBeInTheDocument();
  });

  it("各行に試合名と両者の名前を出す", () => {
    render(<TeamMatchTable table={base} />);

    expect(screen.getByText("第1試合")).toBeInTheDocument();
    expect(screen.getByText("山田")).toBeInTheDocument();
    expect(screen.getByText("田中")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: 実行して失敗を確認**

Run: `pnpm exec vitest run src/components/division/TeamMatchTable.test.tsx`
Expected: FAIL（`Failed to resolve import "./TeamMatchTable"`）

- [ ] **Step 7: TeamMatchTable.tsx を書く**

```tsx
import type {
  TeamMatchMark,
  TeamMatchTableView,
} from "./prepare-team-match-table";

const MARK_LABEL: Record<TeamMatchMark, string> = {
  win: "○",
  lose: "−",
  draw: "△",
  none: "",
};

const BY_LABEL = { wins: "勝ち数", points: "本数差" } as const;

/** 決着の 1 行。未決着なら何も描かない。 */
const OutcomeLine = ({
  table,
}: {
  table: TeamMatchTableView;
}) => {
  const { outcome } = table.standings;
  if (outcome.kind === "undecided") {
    return null;
  }
  if (outcome.kind === "draw") {
    return <p className="text-sm font-medium text-slate-700">引き分け</p>;
  }
  return (
    <p className="text-sm font-medium text-slate-800">
      {`勝者 ${table.teamNames[outcome.side]}（${BY_LABEL[outcome.by]}）`}
    </p>
  );
};

/**
 * 団体戦の結果表。管理画面の部門詳細と公開の部門ページが同じ props で呼ぶ。
 * Json のパースと形の検査は prepareTeamMatchTable が済ませている。
 */
export function TeamMatchTable({ table }: { table: TeamMatchTableView }) {
  const { standings } = table;
  const scored = standings.points[0] !== null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-center gap-3">
        <span className="text-base font-bold text-slate-900">
          {table.teamNames[0]}
        </span>
        <span className="text-lg font-bold text-slate-900">
          {`${standings.wins[0]} - ${standings.wins[1]}`}
        </span>
        <span className="text-base font-bold text-slate-900">
          {table.teamNames[1]}
        </span>
      </div>

      <div className="text-center">
        <OutcomeLine table={table} />
        {scored && (
          <p className="text-xs text-slate-500">
            {`本数 ${standings.points[0]} - ${standings.points[1]}`}
          </p>
        )}
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs text-slate-500">
            <th className="px-2 py-1 text-left">試合</th>
            <th className="px-2 py-1 text-right">{table.teamNames[0]}</th>
            <th className="px-2 py-1 text-center">勝敗</th>
            <th className="px-2 py-1 text-left">{table.teamNames[1]}</th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.matchId} className="border-b border-slate-100">
              <td className="px-2 py-1 text-xs text-slate-500">
                {row.matchName}
              </td>
              <td className="px-2 py-1 text-right text-slate-800">
                {row.names[0]}
                {row.points[0] !== null && (
                  <span className="ml-2 text-xs text-slate-500">
                    {row.points[0]}
                  </span>
                )}
              </td>
              <td className="px-2 py-1 text-center text-slate-700">
                {`${MARK_LABEL[row.marks[0]]} ${MARK_LABEL[row.marks[1]]}`.trim() ||
                  "―"}
              </td>
              <td className="px-2 py-1 text-slate-800">
                {row.names[1]}
                {row.points[1] !== null && (
                  <span className="ml-2 text-xs text-slate-500">
                    {row.points[1]}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 8: 通ることを確認**

Run: `pnpm exec vitest run src/components/division/TeamMatchTable.test.tsx`
Expected: PASS（6 件）

- [ ] **Step 9: DivisionMatchingView に本物の枝を入れる**

Task 10 で入れた仮の案内を差し替える。`teamNames` が新しく要るので props を 1 つ増やす。

```tsx
/** 団体戦の結果表。Json のパースと形の検査は prepareTeamMatchTable が受け止める。 */
const TeamMatchSection = ({
  division,
  participants,
  teamNames,
  overallSeq,
}: {
  division: DivisionDetail;
  participants: DivisionParticipant[];
  teamNames: ReadonlyMap<string, string>;
  overallSeq: ReadonlyMap<string, number>;
}) => {
  const prepared = prepareTeamMatchTable(
    division,
    participants,
    teamNames,
    overallSeq,
  );
  if (prepared.kind === "notice") {
    return <Notice>{prepared.message}</Notice>;
  }
  return <TeamMatchTable table={prepared.table} />;
};
```

`DivisionMatchingView` の props に足す。

```tsx
  /** 大会のチーム名。TEAM_MATCH でだけ使う。既定は空の表 */
  teamNames?: ReadonlyMap<string, string>;
```

switch の枝を差し替える。

```tsx
    case "TEAM_MATCH":
      return (
        <TeamMatchSection
          division={division}
          participants={participants}
          teamNames={teamNames ?? new Map()}
          overallSeq={overallSeq}
        />
      );
```

- [ ] **Step 10: 2 つのページから teamNames を渡す**

`src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/page.tsx` と
`src/app/t/[tournamentId]/divisions/[divisionId]/page.tsx` の両方で、
形式が `TEAM_MATCH` のときだけチームを読んで表に変える。

```tsx
import { listTeamsInTournament } from "@/features/team/repository";
```

```tsx
  // 団体戦のときだけチーム名が要る。他の形式で毎回クエリを投げないよう
  // needsParticipants と同じ考え方で読み出しを省く。
  const teamNames =
    division.format === "TEAM_MATCH"
      ? new Map(
          (
            await listTeamsInTournament(organization.id, tournamentId)
          ).map((team) => [team.id, team.name]),
        )
      : undefined;
```

公開ページ（`/t/...`）は組織 ID を持たないので、`listTeamsInTournament` と
同じ内容で大会 ID だけを条件にする読み出しを
`src/features/team/repository.ts` に足す。

```ts
/**
 * 公開ページ用。大会 ID だけで引く。公開の部門ページは組織に属さない
 * 閲覧者も開くため、組織の所有権を条件にできない（部門の公開範囲は
 * Tournament.status がページ側で担保している）。
 */
export const listTeamNamesInTournament = async (
  tournamentId: string,
): Promise<Map<string, string>> => {
  const rows = await prisma.team.findMany({
    where: { tournamentId },
    orderBy: { order: "asc" },
    select: { id: true, name: true },
  });
  return new Map(rows.map((row) => [row.id, row.name]));
};
```

公開ページ側はこれを使う。

```tsx
  const teamNames =
    division.format === "TEAM_MATCH"
      ? await listTeamNamesInTournament(tournamentId)
      : undefined;
```

- [ ] **Step 11: 通す**

Run: `pnpm typecheck`
Expected: エラーなし

Run: `pnpm test`
Expected: 全件 PASS

- [ ] **Step 12: コミット**

```bash
git add src/components/division src/features/team src/app
git commit -m "$(cat <<'EOF'
feat(division): 団体戦の結果表を部門詳細と公開ページに出す

チーム名と勝ち数、位置ごとの 1 本（試合名・両者・○△−・本数）、
決着の理由（勝ち数／本数差／引き分け）を 1 つの表に並べる。
Json のパースとチーム名の食い違いは prepareTeamMatchTable が
受け止めて案内に倒す。チーム名の読み出しは TEAM_MATCH のときだけ行う。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: 印刷と仕上げ

**Files:**
- Modify: `src/components/print/PrintDivisionSection.tsx`
- Modify: `src/components/print/PrintDivisionSection.test.tsx`
- Modify: `src/app/t/[tournamentId]/print/page.tsx`
- Modify: `src/components/public/PublicScheduleList.tsx`
- Modify: `docs/code-design/architecture.md`

**Interfaces:**
- Consumes: Task 15 の `prepareTeamMatchTable` / `TeamMatchTable`、`listTeamNamesInTournament`
- Produces: なし（最後のタスク）

- [ ] **Step 1: 印刷の失敗するテストを書く**

`src/components/print/PrintDivisionSection.test.tsx` に足す。既存の
`LeagueBody` のケースを手本に、`format: "TEAM_MATCH"` の部門を渡す。

```tsx
  it("団体戦はチーム名と星取を出す", () => {
    render(<PrintDivisionSection {...teamMatchProps} />);

    expect(screen.getByText("A中学")).toBeInTheDocument();
    expect(screen.getByText("2 - 1")).toBeInTheDocument();
  });

  it("団体戦の見出しに形式のラベルを出す", () => {
    render(<PrintDivisionSection {...teamMatchProps} />);

    expect(screen.getByText("団体戦")).toBeInTheDocument();
  });
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `pnpm exec vitest run src/components/print/PrintDivisionSection.test.tsx`
Expected: FAIL（Task 10 で入れた仮の `return null` により何も描かれない）

- [ ] **Step 3: PrintDivisionSection.tsx を直す**

`LeagueBody` の隣に足す。

```tsx
/** 印刷の団体戦。画面と同じ表を使う。 */
const TeamMatchBody = ({ division, participants, teamNames, withResults }: BodyProps) => {
  const prepared = prepareTeamMatchTable(
    division,
    participants,
    teamNames ?? new Map(),
    // 印刷も画面と同じ通し番号を使う
    overallSeq,
  );
  if (prepared.kind === "notice") {
    return <p className="text-sm text-slate-600">{prepared.message}</p>;
  }
  return <TeamMatchTable table={prepared.table} />;
};
```

`BodyProps` の実際の形（`withResults` / `overallSeq` をどこから受けているか）を
ファイルを開いて確認し、`LeagueBody` と同じ受け取り方にそろえる。
`teamNames` は `BodyProps` に足し、`src/app/t/[tournamentId]/print/page.tsx` から
`listTeamNamesInTournament(tournamentId)` の結果を渡す。

switch の仮の枝を差し替える。

```tsx
          case "TEAM_MATCH":
            return <TeamMatchBody {...props} />;
```

`withResults` が false（空欄の組み合わせ表）のときの扱いは `LeagueBody` に合わせる。
リーグが空の `results` を渡しているなら団体戦も同じにする。

- [ ] **Step 4: 通ることを確認**

Run: `pnpm exec vitest run src/components/print/`
Expected: PASS

- [ ] **Step 5: 公開の試合一覧を確認する**

`src/components/public/PublicScheduleList.tsx` を開き、`ROUND_ROBIN` を
文字列で比較している箇所を読む。形式ごとに出し分けているのが
「構造上の位置（`1回戦 (1)`）を出すかどうか」だけなら、団体戦も
リーグと同じ扱い（位置を出さない）にする。

`formatDivisionPosition` / `matchPositionLabel`（`src/lib/division/label.ts`）が
`TEAM_MATCH` で空文字を返すことを確かめ、返していなければ
`ROUND_ROBIN` と同じ枝に入れる。あわせて `src/lib/division/label.test.ts` に
1 件足す。

```ts
  it("団体戦は構造上の位置を持たない", () => {
    expect(matchPositionLabel("TEAM_MATCH", match)).toBe("");
  });
```

Run: `pnpm exec vitest run src/lib/division/label.test.ts`
Expected: PASS

- [ ] **Step 6: architecture.md に節を足す**

`## features/division の共有ドメイン` の節の末尾（リーグの説明の後ろ）に足す。

```markdown
団体戦（`team-match/`）も同じ共有ドメインで、2 チームのオーダーから
「位置 i どうしを 1 試合にする」だけの組み合わせを作る。試合 id は
`t1-{位置}` で、`1` は「節が無い（round は常に 1）」ことを表す。
人数が揃わない場合は多い側に合わせて試合を作り、足りない側を `bye` にする。
不戦勝の判定は `lib/division/resolve.ts` の `decideWinner` がすでに持っている
ので、団体戦のためのコードは増えない。どちらかのチームが 0 人なら空を返す。

1 人増えれば以降の全位置がずれるため、リーグと同じく追加・削除・並べ替えの
いずれでも組み合わせを丸ごと作り直す。`regenerateMatching` 系が
`DivisionEntry[]` ではなく `DivisionEntries` を受け取るのは、団体戦が
`entries.teams`（対戦する 2 チーム）を見ないと組めないため。

エントリーの `seed` は形式によって意味が変わる。トーナメントとリーグでは
部門内のシード順で entries 全体で一意だが、団体戦では「チーム内の出場順」
なので両チームの先鋒がどちらも 0 になる。`validateEntries` が `format` を
取るのはこのためで、団体戦のときだけ一意性を `(teamId, seed)` の組で見る。

チームの勝敗は `team-match/standings.ts` が 勝利数 → 本数の合計 →
引き分け の順に決める。本数は `resultConfig.score` が有効なときだけ見る。
代表戦は持たず、同数どうしは `{ kind: "draw" }` で止める。ここが後で
代表戦を足すときの差し込み口になる。

編集画面はリーグの `/league` と同じく専用ページ `/divisions/[divisionId]/team`
を持つ。`isSlotBracketFormat` が false なので、D&D エディタ（`/setup`）と
`swap-slots` は形式の判定だけで自動的に対象外になる。`set-teams` と
`set-lineup` は `setup-store.ts` に乗るが、団体戦だけの操作であることを
スライス側でさらに絞る（`swap-slots` が `SINGLE_ELIMINATION` に絞るのと同じ）。

## Team と Participant.teamId

チームは大会単位のマスタ（`Team`）で、`Participant.teamId` が所属を指す。
`onDelete: SetNull` にしてあるので、チームを消しても参加者は大会に残り、
所属だけが外れる。団体戦部門の `entries.teams` が消えたチームを指したまま
になることはあるが、その食い違いは読み出し（`prepareTeamSetup` /
`prepareTeamMatchTable`）が案内に倒して吸収する。削除の側から部門の Json を
書き換えには行かない。`features/schedule` が `ScheduleItem` のずれを
読み出しで吸収するのと同じ考え方である。

`features/team` は `features/division` と同列なので互いに import できない。
両方を使う画面（団体戦の設定画面、部門詳細、印刷）はページが両方から読んで
組み立てる。チーム名は `ReadonlyMap<string, string>` の形でコンポーネントへ
運び、`TEAM_MATCH` の部門があるときだけ読み出す。

## 引き分けの入力

`record-result` の `winnerEntryId` は 3 値で、空文字が「取り消し」、
`DRAW_VALUE`（`"draw"`）が「引き分け」、それ以外が勝者の `DivisionEntry.id`
である。`MatchResultRecord.winnerEntryId: null` が「引き分け」と「記録なし」の
両方を指しうるため、入力の時点で区別しておく必要がある。

引き分けを保存できるのは `ROUND_ROBIN` と `TEAM_MATCH` だけで、
`validateResults` が形式を見て弾く。トーナメントで引き分けると次のスロットへ
誰を進めるか決まらなくなるためである。画面のボタンは
`ResultRowView.drawAllowed` で出し分けるが、これは体感のためで、
境界は `validateResults` にある。
```

- [ ] **Step 7: 全体を通す**

Run: `pnpm typecheck`
Expected: エラーなし

Run: `pnpm test`
Expected: 全件 PASS

Run: `pnpm exec biome check src`
Expected: CRLF 由来の指摘以外が残らないこと

Run: `pnpm build`
Expected: 成功

- [ ] **Step 8: 通しで目視する**

`pnpm dev` を上げ、次を順に確かめる。

1. 大会にチームを 2 つ作り、参加者をそれぞれに 3 人ずつ入れる
2. `TEAM_MATCH` の部門を作る
3. `/divisions/<id>/team` で 2 チームを選び、両方の出場順を保存する
4. 部門詳細に「A中学 0 - 0 B中学」と 3 行の表が出る
5. 進行順に 3 試合が並ぶ
6. 結果入力で 1 本目に勝ち、2 本目に「引き分け」、3 本目に勝ちを入れる
7. 部門詳細が「2 - 0」「勝者 A中学（勝ち数）」になる
8. 公開ページ（`/t/<id>/divisions/<id>`）と印刷（`/t/<id>/print`）にも同じ表が出る
9. 片方のチームの出場順を 2 人に減らすと、3 本目が BYE になり不戦勝で数えられる

- [ ] **Step 9: コミット**

```bash
git add src/components/print src/components/public src/lib/division src/app docs/code-design
git commit -m "$(cat <<'EOF'
feat(print): 団体戦を印刷と公開の試合一覧に対応させる

印刷の部門セクションは画面と同じ結果表を使う。公開の試合一覧では
リーグと同じく構造上の位置を出さない。
あわせて architecture.md に団体戦・Team・引き分け入力の節を足した。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 完了の確認

すべてのタスクが終わったら、次がすべて満たされていることを確かめる。

- [ ] `pnpm typecheck` がエラーなしで終わる
- [ ] `pnpm test` が全件 PASS する
- [ ] `pnpm build` が成功する
- [ ] `pnpm exec prisma migrate status` が「up to date」になる
- [ ] 上の「通しで目視する」9 項目がすべて通る
- [ ] `git log --oneline` に 16 タスクぶんのコミットが並び、各コミットの
      末尾に `Co-Authored-By: Claude Opus 5 (1M context)` が付いている
