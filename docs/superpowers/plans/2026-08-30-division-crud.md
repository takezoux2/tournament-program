# Division CRUD 画面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Division`（画面上の呼称は「部門」）の作成・一覧・詳細・編集・削除・並べ替えを画面から行えるようにする。

**Architecture:** 既存の `features/tournament` スライスと `components/tournament/` を、大会の一段下にそのまま重ねる。`features/division` に create / update / delete / reorder の 4 スライスを置き、Server Action から `requireOrganization` → Zod 検証 → Effect の usecase → Prisma repository と流す。ブラケット描画は `features/bracket/from-division.ts` という新規アダプタで `lib/division` の Json 型を描画側の型へ変換する。

**Tech Stack:** Next.js 16 (App Router / Server Actions)、React 19 (`useActionState`)、Prisma 7、Zod 4、Effect 3、Tailwind CSS 4、Vitest + Testing Library、Biome。

**設計元:** `docs/superpowers/specs/2026-08-30-division-crud-design.md`

## Global Constraints

- パッケージマネージャは **pnpm**。`npm` / `yarn` は使わない。
- 画面文言は日本語。`Division` の呼称は必ず **「部門」**。「ステージ」とは書かない。
- スキーマ変更・マイグレーションは **行わない**。`prisma/schema.prisma` に触れない。
- `features/division` から `features/tournament` / `features/bracket` を import しない（同列スライスへの依存禁止）。祖先方向（`features/division/*` → `features/division/`）と下位共通層（`lib/` / `shared/`）のみ許可。
- 認可境界 `requireOrganization(slug)` は、ページ冒頭と **Server Action 冒頭でそれぞれ独立に** 呼ぶ。
- 所有権はクエリの `where` に入れる。更新・削除は `updateMany` / `deleteMany` を使い、`where: { id, tournament: { id: tournamentId, organizationId } }` の形にする。0 件は `notFound()`。
- 編集対象は `name` / `format` / `order` のみ。`entries` / `matchingConfig` / `results` / `revision` は読み取り専用。
- ブラケット描画は `SINGLE_ELIMINATION` のみ対応。
- 各タスクの最後に `pnpm lint` と `pnpm typecheck` が通ることを確認してからコミットする。
- **worktree の初回セットアップ:** 作業開始時に `pnpm install` の後、必ず `pnpm exec next typegen` を実行する。これを飛ばすと `PageProps<...>` が未生成で `pnpm typecheck` が落ちる。ルートを追加した後（Task 10）も再実行する。

---

### Task 0: 作業環境のセットアップ

**Files:**
- なし（環境準備のみ）

**Interfaces:**
- Consumes: なし
- Produces: 以降のすべてのタスクが `pnpm test` / `pnpm typecheck` を実行できる状態

- [ ] **Step 1: 依存をインストールする**

```bash
pnpm install
```

- [ ] **Step 2: Next.js の型を生成する**

```bash
pnpm exec next typegen
```

これを飛ばすと `PageProps<"/orgs/[slug]/...">` が未定義で `pnpm typecheck` が落ちる。

- [ ] **Step 3: 既存のテストと型が通ることを確認する**

```bash
pnpm test
pnpm typecheck
pnpm lint
```

Expected: すべて PASS。ここが崩れている状態で先へ進まない。

- [ ] **Step 4: `next dev` が書き戻す AGENTS.md の差分を確認する**

```bash
git status --short
```

Expected: 差分なし。もし `AGENTS.md` に差分が出ていたら、それは `next dev` が書き戻したものなので、そのままコミットに含めてよい（AGENTS.md に明記されている）。

---

### Task 1: 基盤（エラー・文言・フォーム状態・ラベル・スキーマ部品）

`features/division` の土台。create / update / delete / reorder の 4 スライスが祖先方向に参照する共通部品をまとめて置く。

**Files:**
- Create: `src/features/division/errors.ts`
- Create: `src/features/division/messages.ts`
- Create: `src/features/division/state.ts`
- Create: `src/features/division/effect-to-form-state.ts`
- Create: `src/features/division/format.ts`
- Create: `src/features/division/schema-parts.ts`
- Test: `src/features/division/errors.test.ts`
- Test: `src/features/division/messages.test.ts`
- Test: `src/features/division/format.test.ts`
- Test: `src/features/division/schema-parts.test.ts`

**Interfaces:**
- Consumes: `Prisma` from `@/generated/prisma/client`、`DivisionFormat` from `@/generated/prisma/enums`
- Produces:
  - `DivisionOrderConflictError` / `UnexpectedDivisionError` / `type DivisionError`
  - `toDivisionError(reason: unknown, tournamentId: string): DivisionError`
  - `divisionErrorMessage(error: DivisionError): string`
  - `type DivisionFormState = { error: string | null }`
  - `INITIAL_DIVISION_FORM_STATE: DivisionFormState`
  - `type DivisionFormAction = (state: DivisionFormState, formData: FormData) => Promise<DivisionFormState>`
  - `divisionErrorFormState(cause: Cause.Cause<DivisionError>): DivisionFormState`
  - `DIVISION_FORMAT_LABELS: Record<DivisionFormat, string>`
  - `DIVISION_FORMATS: DivisionFormat[]`
  - `divisionNameSchema`（出力 `string`）/ `divisionFormatSchema`（出力 `DivisionFormat`）

- [ ] **Step 1: エラーの失敗テストを書く**

`src/features/division/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { toDivisionError } from "./errors";

/** P2002（unique 制約違反）を模した Prisma のエラーを作る。organization/errors.test.ts と同じ組み立て方。 */
const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "7.10.0",
  });

describe("toDivisionError", () => {
  it("P2002 は DivisionOrderConflictError に写像し、大会 id を保持する", () => {
    const error = toDivisionError(uniqueViolation(), "t1");

    expect(error._tag).toBe("DivisionOrderConflictError");
    expect(error).toMatchObject({ tournamentId: "t1" });
  });

  it("P2002 以外の Prisma エラーは UnexpectedDivisionError に落とす", () => {
    const reason = new Prisma.PrismaClientKnownRequestError("not found", {
      code: "P2025",
      clientVersion: "7.10.0",
    });

    const error = toDivisionError(reason, "t1");

    expect(error._tag).toBe("UnexpectedDivisionError");
    expect(error).toMatchObject({ reason });
  });

  it("Prisma 由来でない例外も握り潰さず reason に残す", () => {
    const reason = new Error("network");

    const error = toDivisionError(reason, "t1");

    expect(error._tag).toBe("UnexpectedDivisionError");
    expect(error).toMatchObject({ reason });
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/features/division/errors.test.ts`
Expected: FAIL — `Failed to resolve import "./errors"`

- [ ] **Step 3: errors.ts を実装する**

`src/features/division/errors.ts`:

```ts
import { Data } from "effect";
import { Prisma } from "@/generated/prisma/client";

/**
 * order の unique 制約（@@unique([tournamentId, order])）に触れたことを表す。
 * 作成時の同時採番と、並べ替えの退避値どうしの衝突の両方でここに来る。
 */
export class DivisionOrderConflictError extends Data.TaggedError(
  "DivisionOrderConflictError",
)<{
  readonly tournamentId: string;
}> {}

export class UnexpectedDivisionError extends Data.TaggedError(
  "UnexpectedDivisionError",
)<{
  // Error が持つ cause と名前が衝突しないよう reason にしている。
  readonly reason: unknown;
}> {}

export type DivisionError = DivisionOrderConflictError | UnexpectedDivisionError;

/**
 * Prisma の例外をドメインのエラーに写像する。ここで写像しておくことで、
 * usecase より上の層に Prisma の型が漏れない。
 */
export const toDivisionError = (
  reason: unknown,
  tournamentId: string,
): DivisionError => {
  if (
    reason instanceof Prisma.PrismaClientKnownRequestError &&
    reason.code === "P2002"
  ) {
    return new DivisionOrderConflictError({ tournamentId });
  }
  return new UnexpectedDivisionError({ reason });
};
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run src/features/division/errors.test.ts`
Expected: PASS（3 件）

- [ ] **Step 5: 文言の失敗テストを書く**

`src/features/division/messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DivisionOrderConflictError, UnexpectedDivisionError } from "./errors";
import { divisionErrorMessage } from "./messages";

describe("divisionErrorMessage", () => {
  it("並び順の衝突は再試行を促す", () => {
    const message = divisionErrorMessage(
      new DivisionOrderConflictError({ tournamentId: "t1" }),
    );

    expect(message).toBe("並び順が競合しました。もう一度お試しください");
  });

  it("予期しない失敗は内部の理由を画面に出さない", () => {
    const message = divisionErrorMessage(
      new UnexpectedDivisionError({ reason: new Error("connect ECONNREFUSED") }),
    );

    expect(message).toBe("処理に失敗しました。時間をおいて再度お試しください");
    expect(message).not.toContain("ECONNREFUSED");
  });
});
```

- [ ] **Step 6: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/features/division/messages.test.ts`
Expected: FAIL — `Failed to resolve import "./messages"`

- [ ] **Step 7: messages.ts を実装する**

`src/features/division/messages.ts`:

```ts
import { Match } from "effect";
import type { DivisionError } from "./errors";

/**
 * Match.exhaustive により、errors.ts にタグを足して文言を書き忘れると
 * コンパイルエラーになる。
 */
export const divisionErrorMessage: (error: DivisionError) => string =
  Match.type<DivisionError>().pipe(
    Match.tag(
      "DivisionOrderConflictError",
      () => "並び順が競合しました。もう一度お試しください",
    ),
    Match.tag(
      "UnexpectedDivisionError",
      () => "処理に失敗しました。時間をおいて再度お試しください",
    ),
    Match.exhaustive,
  );
```

- [ ] **Step 8: テストが通ることを確認する**

Run: `pnpm exec vitest run src/features/division/messages.test.ts`
Expected: PASS（2 件）

- [ ] **Step 9: ラベルの失敗テストを書く**

`src/features/division/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DivisionFormat } from "@/generated/prisma/enums";
import { DIVISION_FORMAT_LABELS, DIVISION_FORMATS } from "./format";

describe("DIVISION_FORMAT_LABELS", () => {
  it("DivisionFormat のすべての値に日本語ラベルを持つ", () => {
    for (const format of Object.values(DivisionFormat)) {
      expect(DIVISION_FORMAT_LABELS[format]).toBeTruthy();
    }
  });

  it("DIVISION_FORMATS はスキーマの enum と同じ集合を返す", () => {
    expect([...DIVISION_FORMATS].sort()).toEqual(
      Object.values(DivisionFormat).sort(),
    );
  });
});
```

- [ ] **Step 10: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/features/division/format.test.ts`
Expected: FAIL — `Failed to resolve import "./format"`

- [ ] **Step 11: format.ts を実装する**

`src/features/division/format.ts`:

```ts
import type { DivisionFormat } from "@/generated/prisma/enums";

/**
 * Record のキーを DivisionFormat に固定しているため、enum に値を足して
 * 文言を書き忘れるとコンパイルエラーになる。TOURNAMENT_STATUS_LABELS と同じ形。
 */
export const DIVISION_FORMAT_LABELS: Record<DivisionFormat, string> = {
  SINGLE_ELIMINATION: "シングルエリミネーション",
  DOUBLE_ELIMINATION_GRAND_FINAL: "ダブルエリミネーション（優勝決定戦あり）",
  DOUBLE_ELIMINATION_THIRD_PLACE: "ダブルエリミネーション（敗者側優勝が3位）",
  ROUND_ROBIN: "リーグ（総当たり）",
};

/** 選択肢の描画順。ラベルのキー順＝スキーマの宣言順に従う。 */
export const DIVISION_FORMATS = Object.keys(
  DIVISION_FORMAT_LABELS,
) as DivisionFormat[];
```

- [ ] **Step 12: テストが通ることを確認する**

Run: `pnpm exec vitest run src/features/division/format.test.ts`
Expected: PASS（2 件）

- [ ] **Step 13: スキーマ部品の失敗テストを書く**

`src/features/division/schema-parts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { divisionFormatSchema, divisionNameSchema } from "./schema-parts";

describe("divisionNameSchema", () => {
  it("前後の空白を落とす", () => {
    expect(divisionNameSchema.parse("  男子シングルス  ")).toBe(
      "男子シングルス",
    );
  });

  it("空白だけの入力は空扱いにして弾く", () => {
    const result = divisionNameSchema.safeParse("   ");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("部門名を入力してください");
    }
  });

  it("100文字を超える名前を弾く", () => {
    const result = divisionNameSchema.safeParse("あ".repeat(101));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "部門名は100文字以内で入力してください",
      );
    }
  });

  it("ちょうど100文字は通す", () => {
    expect(divisionNameSchema.parse("あ".repeat(100))).toHaveLength(100);
  });
});

describe("divisionFormatSchema", () => {
  it("スキーマの enum 値を通す", () => {
    expect(divisionFormatSchema.parse("SINGLE_ELIMINATION")).toBe(
      "SINGLE_ELIMINATION",
    );
    expect(divisionFormatSchema.parse("ROUND_ROBIN")).toBe("ROUND_ROBIN");
  });

  it("enum に無い値を弾く", () => {
    const result = divisionFormatSchema.safeParse("SWISS");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("試合形式を選択してください");
    }
  });

  it("未選択（空文字）も弾く", () => {
    expect(divisionFormatSchema.safeParse("").success).toBe(false);
  });
});
```

- [ ] **Step 14: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/features/division/schema-parts.test.ts`
Expected: FAIL — `Failed to resolve import "./schema-parts"`

- [ ] **Step 15: schema-parts.ts を実装する**

`src/features/division/schema-parts.ts`:

```ts
import { z } from "zod";
import { DivisionFormat } from "@/generated/prisma/enums";

/**
 * 部門名と試合形式の検証。create / update の両スライスが使う。
 * スライス同士は依存できないが祖先方向は許可されているため、
 * カテゴリ直下に置いて両方から参照する。tournament/schema-parts.ts と同じ形。
 */
export const divisionNameSchema = z
  .string()
  .transform((raw) => raw.trim())
  .pipe(
    z
      .string()
      .min(1, "部門名を入力してください")
      .max(100, "部門名は100文字以内で入力してください"),
  );

/**
 * z.enum に生成された enum オブジェクトを渡しているので、スキーマに形式を足すと
 * ここは自動で追従する。出力型は DivisionFormat になる。
 */
export const divisionFormatSchema = z.enum(DivisionFormat, {
  error: "試合形式を選択してください",
});
```

- [ ] **Step 16: テストが通ることを確認する**

Run: `pnpm exec vitest run src/features/division/schema-parts.test.ts`
Expected: PASS（7 件）

Zod のバージョン差で `{ error: ... }` が効かずメッセージが既定文言になる場合は `{ message: ... }` に替えて再実行する。どちらでも通らなければ次に置き換える:

```ts
export const divisionFormatSchema = z
  .string()
  .refine(
    (value): value is DivisionFormat =>
      (Object.values(DivisionFormat) as string[]).includes(value),
    "試合形式を選択してください",
  );
```

- [ ] **Step 17: フォーム状態と変換を実装する**

この 2 ファイルは型と定数だけで分岐を持たないため、単体テストは書かない（`features/tournament/state.ts` / `effect-to-form-state.ts` も同じ扱い）。振る舞いは Task 3 以降の handler テストで覆われる。

`src/features/division/state.ts`:

```ts
export type DivisionFormState = {
  error: string | null;
};

export const INITIAL_DIVISION_FORM_STATE: DivisionFormState = {
  error: null,
};

export type DivisionFormAction = (
  state: DivisionFormState,
  formData: FormData,
) => Promise<DivisionFormState>;
```

`src/features/division/effect-to-form-state.ts`:

```ts
import { Cause, Option } from "effect";
import type { DivisionError } from "./errors";
import { divisionErrorMessage } from "./messages";
import type { DivisionFormState } from "./state";

/**
 * Exit-failure → 日本語文言の変換。create / update / delete / reorder の
 * 4 スライスが使うため、スライスの外（カテゴリ直下）に置く。
 */
export const divisionErrorFormState = (
  cause: Cause.Cause<DivisionError>,
): DivisionFormState => {
  const failure = Cause.failureOption(cause);
  return {
    error: Option.isSome(failure)
      ? divisionErrorMessage(failure.value)
      : "処理に失敗しました。時間をおいて再度お試しください",
  };
};
```

- [ ] **Step 18: 全体の検証**

```bash
pnpm exec vitest run src/features/division
pnpm lint
pnpm typecheck
```

Expected: すべて PASS

- [ ] **Step 19: コミット**

```bash
git add src/features/division
git commit -m "feat(division): add errors, messages, form state and schema parts"
```

---

### Task 2: 読み取り repository（一覧・詳細・参加者）

ページが使う読み取り専用のクエリ。所有権を `where` に入れる形をここで固める。

**Files:**
- Create: `src/features/division/repository.ts`
- Test: `src/features/division/repository.test.ts`

**Interfaces:**
- Consumes: Task 1 の何も使わない（型だけ `@/generated/prisma/enums` から）
- Produces:
  - `type DivisionSummary = { id: string; name: string; order: number; format: DivisionFormat }`
  - `type DivisionDetail = DivisionSummary & { entries: unknown; matchingConfig: unknown; results: unknown; createdAt: Date }`
  - `type DivisionParticipant = { id: string; name: string; team?: string }`
  - `listDivisionsInTournament(organizationId: string, tournamentId: string): Promise<DivisionSummary[]>`
  - `findDivisionInTournament(organizationId: string, tournamentId: string, divisionId: string): Promise<DivisionDetail | null>`
  - `listParticipantsInTournament(organizationId: string, tournamentId: string): Promise<DivisionParticipant[]>`

- [ ] **Step 1: 失敗テストを書く**

`src/features/division/repository.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const findFirst = vi.fn();
const participantFindMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    division: {
      findMany: (args: unknown) => findMany(args),
      findFirst: (args: unknown) => findFirst(args),
    },
    participant: {
      findMany: (args: unknown) => participantFindMany(args),
    },
  },
}));

const {
  findDivisionInTournament,
  listDivisionsInTournament,
  listParticipantsInTournament,
} = await import("./repository");

beforeEach(() => {
  findMany.mockReset();
  findFirst.mockReset();
  participantFindMany.mockReset();
});

describe("listDivisionsInTournament", () => {
  it("組織と大会の両方を where に入れ、order 昇順で引く", async () => {
    findMany.mockResolvedValue([]);

    await listDivisionsInTournament("o1", "t1");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournament: { id: "t1", organizationId: "o1" } },
        orderBy: { order: "asc" },
      }),
    );
  });
});

describe("findDivisionInTournament", () => {
  // 所有権を where から外して「引いてから弾く」形に後退すると、
  // 弾き忘れた経路がそのまま越境アクセスの穴になる。
  it("組織・大会・部門の 3 つを where に入れる", async () => {
    findFirst.mockResolvedValue(null);

    await findDivisionInTournament("o1", "t1", "d1");

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d1", tournament: { id: "t1", organizationId: "o1" } },
      }),
    );
  });

  it("Json 3 列と作成日時も select する", async () => {
    findFirst.mockResolvedValue(null);

    await findDivisionInTournament("o1", "t1", "d1");

    const args = findFirst.mock.calls[0][0] as { select: Record<string, true> };
    expect(args.select).toMatchObject({
      id: true,
      name: true,
      order: true,
      format: true,
      entries: true,
      matchingConfig: true,
      results: true,
      createdAt: true,
    });
  });
});

describe("listParticipantsInTournament", () => {
  it("組織と大会を where に入れ、表示名を Member から解決する", async () => {
    participantFindMany.mockResolvedValue([
      { id: "p1", team: "青葉クラブ", member: { name: "佐藤 蓮" } },
      { id: "p2", team: null, member: { name: "鈴木 陽菜" } },
    ]);

    const participants = await listParticipantsInTournament("o1", "t1");

    expect(participantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournament: { id: "t1", organizationId: "o1" } },
      }),
    );
    // team は bracket 側で省略可能なプロパティなので、null は undefined に畳む。
    expect(participants).toEqual([
      { id: "p1", name: "佐藤 蓮", team: "青葉クラブ" },
      { id: "p2", name: "鈴木 陽菜", team: undefined },
    ]);
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/features/division/repository.test.ts`
Expected: FAIL — `Failed to resolve import "./repository"`

- [ ] **Step 3: repository.ts を実装する**

`src/features/division/repository.ts`:

```ts
import "server-only";
import type { DivisionFormat } from "@/generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";

export type DivisionSummary = {
  id: string;
  name: string;
  order: number;
  format: DivisionFormat;
};

/**
 * Json 3 列は Prisma が JsonValue で返す。ここでは形を保証せず unknown として運び、
 * 検証は lib/division の parse 関数に任せる。
 */
export type DivisionDetail = DivisionSummary & {
  entries: unknown;
  matchingConfig: unknown;
  results: unknown;
  createdAt: Date;
};

/** ブラケット描画に渡す参加者。表示名は Member から解決済み。 */
export type DivisionParticipant = {
  id: string;
  name: string;
  team?: string;
};

/**
 * 部門一覧。order は連番で欠番なく採番しているため、そのまま昇順で並べる。
 * where を tournament 経由にすることで、組織と大会の所有権を 1 クエリで担保する。
 */
export const listDivisionsInTournament = (
  organizationId: string,
  tournamentId: string,
): Promise<DivisionSummary[]> =>
  prisma.division.findMany({
    where: { tournament: { id: tournamentId, organizationId } },
    orderBy: { order: "asc" },
    select: { id: true, name: true, order: true, format: true },
  });

/**
 * 組織 → 大会 → 部門の 3 段の所有権を where に入れる。
 * id だけで引いて後から所属を検証する形にすると、検証を書き忘れた箇所が
 * そのまま穴になる。この形なら書き忘れは「見つからない」に倒れる。
 */
export const findDivisionInTournament = (
  organizationId: string,
  tournamentId: string,
  divisionId: string,
): Promise<DivisionDetail | null> =>
  prisma.division.findFirst({
    where: { id: divisionId, tournament: { id: tournamentId, organizationId } },
    select: {
      id: true,
      name: true,
      order: true,
      format: true,
      entries: true,
      matchingConfig: true,
      results: true,
      createdAt: true,
    },
  });

/**
 * 大会の参加者。表示名は Participant ではなく Member が持つため join して解決する。
 * 解決済みの形で返すことで、描画側のアダプタ（features/bracket/from-division.ts）を
 * DB を知らない純粋関数に保てる。
 */
export const listParticipantsInTournament = async (
  organizationId: string,
  tournamentId: string,
): Promise<DivisionParticipant[]> => {
  const rows = await prisma.participant.findMany({
    where: { tournament: { id: tournamentId, organizationId } },
    select: { id: true, team: true, member: { select: { name: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.member.name,
    // bracket 側の Participant.team は省略可能なプロパティ。null は運ばない。
    team: row.team ?? undefined,
  }));
};
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run src/features/division/repository.test.ts`
Expected: PASS（4 件）

- [ ] **Step 5: 検証してコミット**

```bash
pnpm lint
pnpm typecheck
git add src/features/division/repository.ts src/features/division/repository.test.ts
git commit -m "feat(division): add read repository scoped by organization and tournament"
```

---

### Task 3: create スライス

部門の作成。`order` はトランザクション内で `max(order) + 1` を採番する。

**Files:**
- Create: `src/features/division/create/schema.ts`
- Create: `src/features/division/create/repository.ts`
- Create: `src/features/division/create/usecase.ts`
- Create: `src/features/division/create/handler.ts`
- Test: `src/features/division/create/repository.test.ts`
- Test: `src/features/division/create/usecase.test.ts`
- Test: `src/features/division/create/handler.test.ts`

**Interfaces:**
- Consumes: Task 1 の `divisionNameSchema` / `divisionFormatSchema` / `toDivisionError` / `DivisionError` / `DivisionFormState` / `divisionErrorFormState`
- Produces:
  - `createDivisionSchema`、`type CreateDivisionInput = { name: string; format: DivisionFormat }`
  - `type CreateDivisionPort = (input: CreateDivisionInput & { organizationId: string; tournamentId: string }) => Effect.Effect<{ id: string } | null, DivisionError>`（`null` = その組織にその大会が無い）
  - `createDivisionInDb: CreateDivisionPort`
  - `createDivision(port, input, organizationId, tournamentId): Effect.Effect<{ id: string } | null, DivisionError>`
  - `createDivisionAction: DivisionFormAction`

- [ ] **Step 1: schema.ts を実装する（テストは Task 1 で済んでいる）**

部品はすべて Task 1 でテスト済みなので、束ねるだけのこのファイルに固有のテストは書かない（`features/tournament/create/schema.ts` と同じ扱い）。

`src/features/division/create/schema.ts`:

```ts
import { z } from "zod";
import { divisionFormatSchema, divisionNameSchema } from "../schema-parts";

export const createDivisionSchema = z.object({
  name: divisionNameSchema,
  format: divisionFormatSchema,
});

export type CreateDivisionInput = z.infer<typeof createDivisionSchema>;
```

- [ ] **Step 2: repository の失敗テストを書く**

`src/features/division/create/repository.test.ts`:

```ts
import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { failureTag } from "@/shared/testing/exit";

const tournamentFindFirst = vi.fn();
const divisionAggregate = vi.fn();
const divisionCreate = vi.fn();

// $transaction には「トランザクション用クライアント」を受け取るコールバックを渡す。
// テストでは同じモック群をそのまま渡し、呼ばれた引数だけを見る。
const tx = {
  tournament: { findFirst: (args: unknown) => tournamentFindFirst(args) },
  division: {
    aggregate: (args: unknown) => divisionAggregate(args),
    create: (args: unknown) => divisionCreate(args),
  },
};

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

const { createDivisionInDb } = await import("./repository");

const input = {
  organizationId: "o1",
  tournamentId: "t1",
  name: "男子シングルス",
  format: "SINGLE_ELIMINATION",
} as const;

beforeEach(() => {
  tournamentFindFirst.mockReset();
  divisionAggregate.mockReset();
  divisionCreate.mockReset();
});

describe("createDivisionInDb", () => {
  it("大会が組織のものであることを確かめてから採番する", async () => {
    tournamentFindFirst.mockResolvedValue({ id: "t1" });
    divisionAggregate.mockResolvedValue({ _max: { order: 2 } });
    divisionCreate.mockResolvedValue({ id: "d1" });

    const exit = await Effect.runPromiseExit(createDivisionInDb({ ...input }));

    expect(tournamentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "t1", organizationId: "o1" } }),
    );
    expect(divisionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          tournamentId: "t1",
          name: "男子シングルス",
          format: "SINGLE_ELIMINATION",
          order: 3,
        },
      }),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ id: "d1" });
    }
  });

  it("最初の部門は order 0 で作る", async () => {
    tournamentFindFirst.mockResolvedValue({ id: "t1" });
    divisionAggregate.mockResolvedValue({ _max: { order: null } });
    divisionCreate.mockResolvedValue({ id: "d1" });

    await Effect.runPromiseExit(createDivisionInDb({ ...input }));

    expect(divisionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ order: 0 }),
      }),
    );
  });

  it("その組織に大会が無ければ作らず null を返す", async () => {
    tournamentFindFirst.mockResolvedValue(null);

    const exit = await Effect.runPromiseExit(createDivisionInDb({ ...input }));

    expect(divisionCreate).not.toHaveBeenCalled();
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toBeNull();
    }
  });

  it("採番の競合（P2002）は DivisionOrderConflictError に写像する", async () => {
    tournamentFindFirst.mockResolvedValue({ id: "t1" });
    divisionAggregate.mockResolvedValue({ _max: { order: 0 } });
    divisionCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "7.10.0",
      }),
    );

    const exit = await Effect.runPromiseExit(createDivisionInDb({ ...input }));

    expect(failureTag(exit)).toBe("DivisionOrderConflictError");
  });
});
```

- [ ] **Step 3: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/features/division/create/repository.test.ts`
Expected: FAIL — `Failed to resolve import "./repository"`

- [ ] **Step 4: create/repository.ts を実装する**

`src/features/division/create/repository.ts`:

```ts
import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type DivisionError, toDivisionError } from "../errors";
import type { CreateDivisionInput } from "./schema";

/** null は「この組織にその大会が無い」。呼び出し側は notFound() に倒す。 */
export type CreateDivisionPort = (
  input: CreateDivisionInput & {
    organizationId: string;
    tournamentId: string;
  },
) => Effect.Effect<{ id: string } | null, DivisionError>;

export const createDivisionInDb: CreateDivisionPort = (input) =>
  Effect.tryPromise({
    try: () =>
      // 採番（max+1）と作成を 1 つのトランザクションに入れる。分けると、
      // 間に別の作成が挟まったときに同じ order を 2 件が掴む窓が広がる。
      prisma.$transaction(async (tx) => {
        // create は where を持てないので、所有権はここで別途確かめる。
        const tournament = await tx.tournament.findFirst({
          where: { id: input.tournamentId, organizationId: input.organizationId },
          select: { id: true },
        });
        if (!tournament) {
          return null;
        }

        const aggregate = await tx.division.aggregate({
          where: { tournamentId: input.tournamentId },
          _max: { order: true },
        });

        const created = await tx.division.create({
          data: {
            tournamentId: input.tournamentId,
            name: input.name,
            format: input.format,
            // 0 件なら null が返る。+1 して 0 始まりにする。
            order: (aggregate._max.order ?? -1) + 1,
          },
          select: { id: true },
        });

        return { id: created.id };
      }),
    catch: (reason) => toDivisionError(reason, input.tournamentId),
  });
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm exec vitest run src/features/division/create/repository.test.ts`
Expected: PASS（4 件）

- [ ] **Step 6: usecase の失敗テストを書く**

`src/features/division/create/usecase.test.ts`:

```ts
import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import type { CreateDivisionPort } from "./repository";
import { createDivision } from "./usecase";

describe("createDivision", () => {
  it("組織 id と大会 id をポートへ渡す", async () => {
    const port = vi.fn(() =>
      Effect.succeed({ id: "d1" }),
    ) as unknown as CreateDivisionPort;

    const exit = await Effect.runPromiseExit(
      createDivision(
        port,
        { name: "男子シングルス", format: "SINGLE_ELIMINATION" },
        "o1",
        "t1",
      ),
    );

    expect(port).toHaveBeenCalledWith({
      name: "男子シングルス",
      format: "SINGLE_ELIMINATION",
      organizationId: "o1",
      tournamentId: "t1",
    });
    expect(Exit.isSuccess(exit)).toBe(true);
  });
});
```

- [ ] **Step 7: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/features/division/create/usecase.test.ts`
Expected: FAIL — `Failed to resolve import "./usecase"`

- [ ] **Step 8: create/usecase.ts を実装する**

`src/features/division/create/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { CreateDivisionPort } from "./repository";
import type { CreateDivisionInput } from "./schema";

export const createDivision = (
  port: CreateDivisionPort,
  input: CreateDivisionInput,
  organizationId: string,
  tournamentId: string,
): Effect.Effect<{ id: string } | null, DivisionError> =>
  port({ ...input, organizationId, tournamentId });
```

- [ ] **Step 9: テストが通ることを確認する**

Run: `pnpm exec vitest run src/features/division/create/usecase.test.ts`
Expected: PASS（1 件）

- [ ] **Step 10: handler の失敗テストを書く**

`src/features/division/create/handler.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_DIVISION_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const createDivisionInDb = vi.fn();
const revalidatePath = vi.fn();
const notFound = vi.fn(() => {
  // next/navigation の notFound は例外を投げて制御を打ち切る。
  throw new Error("NEXT_NOT_FOUND");
});
const redirect = vi.fn((_path: string) => {
  throw new Error("NEXT_REDIRECT");
});

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => requireOrganization(slug),
}));

vi.mock("./repository", () => ({
  createDivisionInDb: (input: unknown) => createDivisionInDb(input),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  redirect: (path: string) => redirect(path),
}));

const { createDivisionAction } = await import("./handler");

// name と slug をあえて別物にしておく。取り違えた実装を見分けるため。
const organization = {
  id: "o1",
  name: "テニス部",
  slug: "tennis-club",
  createdAt: new Date("2026-08-01T00:00:00Z"),
  updatedAt: new Date("2026-08-01T00:00:00Z"),
};

const buildFormData = (
  name: string,
  format = "SINGLE_ELIMINATION",
): FormData => {
  const data = new FormData();
  data.set("slug", organization.slug);
  data.set("tournamentId", "t1");
  data.set("name", name);
  data.set("format", format);
  return data;
};

beforeEach(() => {
  requireOrganization.mockReset();
  createDivisionInDb.mockReset();
  revalidatePath.mockReset();
  notFound.mockReset();
  redirect.mockReset();
  requireOrganization.mockResolvedValue({ organization, role: "OWNER" });
  notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
  redirect.mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
});

describe("createDivisionAction", () => {
  it("Server Action の冒頭でも認可境界を独立に呼ぶ", async () => {
    createDivisionInDb.mockReturnValue(Effect.succeed({ id: "d1" }));

    await expect(
      createDivisionAction(INITIAL_DIVISION_FORM_STATE, buildFormData("男子")),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(requireOrganization).toHaveBeenCalledWith("tennis-club");
  });

  it("成功したら部門詳細へ送り、一覧と詳細を再検証する", async () => {
    createDivisionInDb.mockReturnValue(Effect.succeed({ id: "d1" }));

    await expect(
      createDivisionAction(INITIAL_DIVISION_FORM_STATE, buildFormData("男子")),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(revalidatePath).toHaveBeenCalledWith(
      "/orgs/tennis-club/tournaments/t1",
    );
    expect(redirect).toHaveBeenCalledWith(
      "/orgs/tennis-club/tournaments/t1/divisions/d1",
    );
  });

  it("入力が不正なら DB を触らずエラー文言を返す", async () => {
    const state = await createDivisionAction(
      INITIAL_DIVISION_FORM_STATE,
      buildFormData("   "),
    );

    expect(createDivisionInDb).not.toHaveBeenCalled();
    expect(state.error).toBe("部門名を入力してください");
  });

  it("形式が不正なら DB を触らずエラー文言を返す", async () => {
    const state = await createDivisionAction(
      INITIAL_DIVISION_FORM_STATE,
      buildFormData("男子", "SWISS"),
    );

    expect(createDivisionInDb).not.toHaveBeenCalled();
    expect(state.error).toBe("試合形式を選択してください");
  });

  it("その組織に大会が無ければ 404 にし、存在を漏らさない", async () => {
    createDivisionInDb.mockReturnValue(Effect.succeed(null));

    await expect(
      createDivisionAction(INITIAL_DIVISION_FORM_STATE, buildFormData("男子")),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(redirect).not.toHaveBeenCalled();
  });

  it("採番が競合したら文言を返し、遷移しない", async () => {
    const { DivisionOrderConflictError } = await import("../errors");
    createDivisionInDb.mockReturnValue(
      Effect.fail(new DivisionOrderConflictError({ tournamentId: "t1" })),
    );

    const state = await createDivisionAction(
      INITIAL_DIVISION_FORM_STATE,
      buildFormData("男子"),
    );

    expect(state.error).toBe("並び順が競合しました。もう一度お試しください");
    expect(redirect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 11: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/features/division/create/handler.test.ts`
Expected: FAIL — `Failed to resolve import "./handler"`

- [ ] **Step 12: create/handler.ts を実装する**

`src/features/division/create/handler.ts`:

```ts
"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import type { DivisionFormState } from "../state";
import { createDivisionInDb } from "./repository";
import { createDivisionSchema } from "./schema";
import { createDivision } from "./usecase";

export const createDivisionAction = async (
  _prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  // ページで確認済みでも Server Action は独立した入口なので、ここでも呼ぶ。
  const { organization } = await requireOrganization(slug);

  const parsed = createDivisionSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    format: String(formData.get("format") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    createDivision(
      createDivisionInDb,
      parsed.data,
      organization.id,
      tournamentId,
    ),
  );

  if (Exit.isFailure(exit)) {
    return divisionErrorFormState(exit.cause);
  }

  // null は「この組織にその大会が無い」を意味する。存在を漏らさないよう 404。
  if (exit.value === null) {
    notFound();
  }

  revalidatePath(`/orgs/${slug}/tournaments/${tournamentId}`);
  redirect(`/orgs/${slug}/tournaments/${tournamentId}/divisions/${exit.value.id}`);
};
```

- [ ] **Step 13: テストが通ることを確認する**

Run: `pnpm exec vitest run src/features/division/create/handler.test.ts`
Expected: PASS（6 件）

- [ ] **Step 14: 検証してコミット**

```bash
pnpm exec vitest run src/features/division
pnpm lint
pnpm typecheck
git add src/features/division/create
git commit -m "feat(division): add create slice with transactional order assignment"
```

---

### Task 4: update スライス

部門名と試合形式の更新。`order` はここでは触らない（Task 6 の並べ替えが担当）。

**Files:**
- Create: `src/features/division/update/schema.ts`
- Create: `src/features/division/update/repository.ts`
- Create: `src/features/division/update/usecase.ts`
- Create: `src/features/division/update/handler.ts`
- Test: `src/features/division/update/repository.test.ts`
- Test: `src/features/division/update/handler.test.ts`

**Interfaces:**
- Consumes: Task 1 の `divisionNameSchema` / `divisionFormatSchema` / `toDivisionError` / `DivisionError` / `DivisionFormState` / `divisionErrorFormState`
- Produces:
  - `updateDivisionSchema`、`type UpdateDivisionInput = { name: string; format: DivisionFormat }`
  - `type UpdateDivisionPort = (input: { organizationId: string; tournamentId: string; divisionId: string; name: string; format: DivisionFormat }) => Effect.Effect<{ updated: number }, DivisionError>`
  - `updateDivisionInDb: UpdateDivisionPort`
  - `updateDivision(port, input, organizationId, tournamentId, divisionId): Effect.Effect<{ updated: number }, DivisionError>`
  - `updateDivisionAction: DivisionFormAction`

- [ ] **Step 1: schema.ts を実装する**

`src/features/division/update/schema.ts`:

```ts
import { z } from "zod";
import { divisionFormatSchema, divisionNameSchema } from "../schema-parts";

/**
 * 入力の形は作成時と同じだが、create から import はしない（同列スライスへの
 * 依存は禁止）。共通の部品は features/division 直下の schema-parts.ts に置き、
 * 両スライスがそこを祖先方向に参照する。
 */
export const updateDivisionSchema = z.object({
  name: divisionNameSchema,
  format: divisionFormatSchema,
});

export type UpdateDivisionInput = z.infer<typeof updateDivisionSchema>;
```

- [ ] **Step 2: repository の失敗テストを書く**

`src/features/division/update/repository.test.ts`:

```ts
import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";

const updateMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    division: { updateMany: (args: unknown) => updateMany(args) },
  },
}));

const { updateDivisionInDb } = await import("./repository");

const input = {
  organizationId: "o1",
  tournamentId: "t1",
  divisionId: "d1",
  name: "男子ダブルス",
  format: "ROUND_ROBIN",
} as const;

beforeEach(() => {
  updateMany.mockReset();
});

describe("updateDivisionInDb", () => {
  // update（単数形）は unique な where しか受け付けず、id 単独になってしまう。
  // updateMany なら where に所有条件を残せる。ここが越境更新を止める要。
  it("組織・大会・部門の 3 つを where に残したまま更新する", async () => {
    updateMany.mockResolvedValue({ count: 1 });

    const exit = await Effect.runPromiseExit(updateDivisionInDb({ ...input }));

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "d1", tournament: { id: "t1", organizationId: "o1" } },
      data: { name: "男子ダブルス", format: "ROUND_ROBIN" },
    });
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ updated: 1 });
    }
  });

  it("order には触れない", async () => {
    updateMany.mockResolvedValue({ count: 1 });

    await Effect.runPromiseExit(updateDivisionInDb({ ...input }));

    const args = updateMany.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(args.data).not.toHaveProperty("order");
  });

  it("0 件更新もエラーにせず件数として返す", async () => {
    updateMany.mockResolvedValue({ count: 0 });

    const exit = await Effect.runPromiseExit(updateDivisionInDb({ ...input }));

    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ updated: 0 });
    }
  });

  it("例外は握り潰さず UnexpectedDivisionError に写像する", async () => {
    updateMany.mockRejectedValue(new Error("network"));

    const exit = await Effect.runPromiseExit(updateDivisionInDb({ ...input }));

    expect(failureTag(exit)).toBe("UnexpectedDivisionError");
  });
});
```

- [ ] **Step 3: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/features/division/update/repository.test.ts`
Expected: FAIL — `Failed to resolve import "./repository"`

- [ ] **Step 4: update/repository.ts を実装する**

`src/features/division/update/repository.ts`:

```ts
import "server-only";
import { Effect } from "effect";
import type { DivisionFormat } from "@/generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { type DivisionError, toDivisionError } from "../errors";

export type UpdateDivisionPort = (input: {
  organizationId: string;
  tournamentId: string;
  divisionId: string;
  name: string;
  format: DivisionFormat;
}) => Effect.Effect<{ updated: number }, DivisionError>;

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
        data: { name: input.name, format: input.format },
      });
      return { updated: result.count };
    },
    catch: (reason) => toDivisionError(reason, input.tournamentId),
  });
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm exec vitest run src/features/division/update/repository.test.ts`
Expected: PASS（4 件）

- [ ] **Step 6: update/usecase.ts を実装する**

ポートへ引数を組み替えて渡すだけで分岐がないため、固有のテストは書かない（`features/tournament/update/usecase.ts` と同じ扱い。振る舞いは handler テストで覆う）。

`src/features/division/update/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { UpdateDivisionPort } from "./repository";
import type { UpdateDivisionInput } from "./schema";

export const updateDivision = (
  port: UpdateDivisionPort,
  input: UpdateDivisionInput,
  organizationId: string,
  tournamentId: string,
  divisionId: string,
): Effect.Effect<{ updated: number }, DivisionError> =>
  port({
    organizationId,
    tournamentId,
    divisionId,
    name: input.name,
    format: input.format,
  });
```

- [ ] **Step 7: handler の失敗テストを書く**

`src/features/division/update/handler.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_DIVISION_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const updateDivisionInDb = vi.fn();
const revalidatePath = vi.fn();
const notFound = vi.fn();
const redirect = vi.fn();

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => requireOrganization(slug),
}));

vi.mock("./repository", () => ({
  updateDivisionInDb: (input: unknown) => updateDivisionInDb(input),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  redirect: (path: string) => redirect(path),
}));

const { updateDivisionAction } = await import("./handler");

const organization = {
  id: "o1",
  name: "テニス部",
  slug: "tennis-club",
  createdAt: new Date("2026-08-01T00:00:00Z"),
  updatedAt: new Date("2026-08-01T00:00:00Z"),
};

const buildFormData = (
  name: string,
  format = "SINGLE_ELIMINATION",
): FormData => {
  const data = new FormData();
  data.set("slug", organization.slug);
  data.set("tournamentId", "t1");
  data.set("divisionId", "d1");
  data.set("name", name);
  data.set("format", format);
  return data;
};

beforeEach(() => {
  requireOrganization.mockReset();
  updateDivisionInDb.mockReset();
  revalidatePath.mockReset();
  notFound.mockReset();
  redirect.mockReset();
  requireOrganization.mockResolvedValue({ organization, role: "OWNER" });
  notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
  redirect.mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
});

describe("updateDivisionAction", () => {
  it("Server Action の冒頭でも認可境界を独立に呼ぶ", async () => {
    updateDivisionInDb.mockReturnValue(Effect.succeed({ updated: 1 }));

    await expect(
      updateDivisionAction(INITIAL_DIVISION_FORM_STATE, buildFormData("男子")),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(requireOrganization).toHaveBeenCalledWith("tennis-club");
  });

  it("成功したら部門詳細へ戻し、一覧と詳細を再検証する", async () => {
    updateDivisionInDb.mockReturnValue(Effect.succeed({ updated: 1 }));

    await expect(
      updateDivisionAction(INITIAL_DIVISION_FORM_STATE, buildFormData("男子")),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(revalidatePath).toHaveBeenCalledWith(
      "/orgs/tennis-club/tournaments/t1",
    );
    expect(revalidatePath).toHaveBeenCalledWith(
      "/orgs/tennis-club/tournaments/t1/divisions/d1",
    );
    expect(redirect).toHaveBeenCalledWith(
      "/orgs/tennis-club/tournaments/t1/divisions/d1",
    );
  });

  it("入力が不正なら DB を触らずエラー文言を返す", async () => {
    const state = await updateDivisionAction(
      INITIAL_DIVISION_FORM_STATE,
      buildFormData(""),
    );

    expect(updateDivisionInDb).not.toHaveBeenCalled();
    expect(state.error).toBe("部門名を入力してください");
  });

  it("0 件更新は 404 にし、部門の存在を漏らさない", async () => {
    updateDivisionInDb.mockReturnValue(Effect.succeed({ updated: 0 }));

    await expect(
      updateDivisionAction(INITIAL_DIVISION_FORM_STATE, buildFormData("男子")),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(redirect).not.toHaveBeenCalled();
  });

  it("失敗は文言に畳んで返し、遷移しない", async () => {
    const { UnexpectedDivisionError } = await import("../errors");
    updateDivisionInDb.mockReturnValue(
      Effect.fail(new UnexpectedDivisionError({ reason: new Error("boom") })),
    );

    const state = await updateDivisionAction(
      INITIAL_DIVISION_FORM_STATE,
      buildFormData("男子"),
    );

    expect(state.error).toBe(
      "処理に失敗しました。時間をおいて再度お試しください",
    );
    expect(redirect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 8: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/features/division/update/handler.test.ts`
Expected: FAIL — `Failed to resolve import "./handler"`

- [ ] **Step 9: update/handler.ts を実装する**

`src/features/division/update/handler.ts`:

```ts
"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import type { DivisionFormState } from "../state";
import { updateDivisionInDb } from "./repository";
import { updateDivisionSchema } from "./schema";
import { updateDivision } from "./usecase";

export const updateDivisionAction = async (
  _prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const divisionId = String(formData.get("divisionId") ?? "");
  const { organization } = await requireOrganization(slug);

  const parsed = updateDivisionSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    format: String(formData.get("format") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    updateDivision(
      updateDivisionInDb,
      parsed.data,
      organization.id,
      tournamentId,
      divisionId,
    ),
  );

  if (Exit.isFailure(exit)) {
    return divisionErrorFormState(exit.cause);
  }

  // 0 件は「この組織のこの大会にその部門が無い」を意味する。存在を漏らさないよう 404。
  if (exit.value.updated === 0) {
    notFound();
  }

  revalidatePath(`/orgs/${slug}/tournaments/${tournamentId}`);
  revalidatePath(`/orgs/${slug}/tournaments/${tournamentId}/divisions/${divisionId}`);
  redirect(`/orgs/${slug}/tournaments/${tournamentId}/divisions/${divisionId}`);
};
```

- [ ] **Step 10: テストが通ることを確認する**

Run: `pnpm exec vitest run src/features/division/update/handler.test.ts`
Expected: PASS（5 件）

- [ ] **Step 11: 検証してコミット**

```bash
pnpm exec vitest run src/features/division
pnpm lint
pnpm typecheck
git add src/features/division/update
git commit -m "feat(division): add update slice"
```

---

### Task 5: delete スライス

部門の削除。確認は部門名の入力で、境界はハンドラ側の DB 突き合わせ。

**Files:**
- Create: `src/features/division/delete/schema.ts`
- Create: `src/features/division/delete/repository.ts`
- Create: `src/features/division/delete/usecase.ts`
- Create: `src/features/division/delete/handler.ts`
- Test: `src/features/division/delete/repository.test.ts`
- Test: `src/features/division/delete/handler.test.ts`

**Interfaces:**
- Consumes: Task 1 の `toDivisionError` / `DivisionError` / `DivisionFormState` / `divisionErrorFormState`、Task 2 の `findDivisionInTournament`
- Produces:
  - `deleteDivisionSchema`、`type DeleteDivisionInput = { confirmName: string }`
  - `type DeleteDivisionPort = (input: { organizationId: string; tournamentId: string; divisionId: string }) => Effect.Effect<{ deleted: number }, DivisionError>`
  - `deleteDivisionInDb: DeleteDivisionPort`
  - `deleteDivision(port, organizationId, tournamentId, divisionId): Effect.Effect<{ deleted: number }, DivisionError>`
  - `deleteDivisionAction: DivisionFormAction`

- [ ] **Step 1: schema.ts を実装する**

`src/features/division/delete/schema.ts`:

```ts
import { z } from "zod";

/**
 * 削除確認の入力。ここでは「何か入っている」ことしか見ない。
 * 部門名と一致するかは handler が DB の値と突き合わせる。
 */
export const deleteDivisionSchema = z.object({
  confirmName: z
    .string()
    .transform((raw) => raw.trim())
    .pipe(z.string().min(1, "確認のため部門名を入力してください")),
});

export type DeleteDivisionInput = z.infer<typeof deleteDivisionSchema>;
```

- [ ] **Step 2: repository の失敗テストを書く**

`src/features/division/delete/repository.test.ts`:

```ts
import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";

const deleteMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    division: { deleteMany: (args: unknown) => deleteMany(args) },
  },
}));

const { deleteDivisionInDb } = await import("./repository");

const input = {
  organizationId: "o1",
  tournamentId: "t1",
  divisionId: "d1",
} as const;

beforeEach(() => {
  deleteMany.mockReset();
});

describe("deleteDivisionInDb", () => {
  it("組織・大会・部門の 3 つを where に残したまま削除する", async () => {
    deleteMany.mockResolvedValue({ count: 1 });

    const exit = await Effect.runPromiseExit(deleteDivisionInDb({ ...input }));

    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: "d1", tournament: { id: "t1", organizationId: "o1" } },
    });
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ deleted: 1 });
    }
  });

  it("0 件削除もエラーにせず件数として返す", async () => {
    deleteMany.mockResolvedValue({ count: 0 });

    const exit = await Effect.runPromiseExit(deleteDivisionInDb({ ...input }));

    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ deleted: 0 });
    }
  });

  it("例外は握り潰さず UnexpectedDivisionError に写像する", async () => {
    deleteMany.mockRejectedValue(new Error("network"));

    const exit = await Effect.runPromiseExit(deleteDivisionInDb({ ...input }));

    expect(failureTag(exit)).toBe("UnexpectedDivisionError");
  });
});
```

- [ ] **Step 3: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/features/division/delete/repository.test.ts`
Expected: FAIL — `Failed to resolve import "./repository"`

- [ ] **Step 4: delete/repository.ts と delete/usecase.ts を実装する**

`src/features/division/delete/repository.ts`:

```ts
import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type DivisionError, toDivisionError } from "../errors";

export type DeleteDivisionPort = (input: {
  organizationId: string;
  tournamentId: string;
  divisionId: string;
}) => Effect.Effect<{ deleted: number }, DivisionError>;

export const deleteDivisionInDb: DeleteDivisionPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      // updateMany と同じ理由で deleteMany を使う。where に所有条件を残す。
      const result = await prisma.division.deleteMany({
        where: {
          id: input.divisionId,
          tournament: {
            id: input.tournamentId,
            organizationId: input.organizationId,
          },
        },
      });
      return { deleted: result.count };
    },
    catch: (reason) => toDivisionError(reason, input.tournamentId),
  });
```

`src/features/division/delete/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DeleteDivisionPort } from "./repository";

export const deleteDivision = (
  port: DeleteDivisionPort,
  organizationId: string,
  tournamentId: string,
  divisionId: string,
): Effect.Effect<{ deleted: number }, DivisionError> =>
  port({ organizationId, tournamentId, divisionId });
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm exec vitest run src/features/division/delete/repository.test.ts`
Expected: PASS（3 件）

- [ ] **Step 6: handler の失敗テストを書く**

`src/features/division/delete/handler.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_DIVISION_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const findDivisionInTournament = vi.fn();
const deleteDivisionInDb = vi.fn();
const revalidatePath = vi.fn();
const notFound = vi.fn();
const redirect = vi.fn();

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => requireOrganization(slug),
}));

vi.mock("../repository", () => ({
  findDivisionInTournament: (
    organizationId: string,
    tournamentId: string,
    divisionId: string,
  ) => findDivisionInTournament(organizationId, tournamentId, divisionId),
}));

vi.mock("./repository", () => ({
  deleteDivisionInDb: (input: unknown) => deleteDivisionInDb(input),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  redirect: (path: string) => redirect(path),
}));

const { deleteDivisionAction } = await import("./handler");

const organization = {
  id: "o1",
  name: "テニス部",
  slug: "tennis-club",
  createdAt: new Date("2026-08-01T00:00:00Z"),
  updatedAt: new Date("2026-08-01T00:00:00Z"),
};

const division = {
  id: "d1",
  name: "男子シングルス",
  order: 0,
  format: "SINGLE_ELIMINATION" as const,
  entries: { version: 1, entries: [] },
  matchingConfig: { version: 1, matches: [] },
  results: { version: 1, matches: [] },
  createdAt: new Date("2026-08-01T00:00:00Z"),
};

const buildFormData = (confirmName: string): FormData => {
  const data = new FormData();
  data.set("slug", organization.slug);
  data.set("tournamentId", "t1");
  data.set("divisionId", "d1");
  data.set("confirmName", confirmName);
  return data;
};

beforeEach(() => {
  requireOrganization.mockReset();
  findDivisionInTournament.mockReset();
  deleteDivisionInDb.mockReset();
  revalidatePath.mockReset();
  notFound.mockReset();
  redirect.mockReset();
  requireOrganization.mockResolvedValue({ organization, role: "OWNER" });
  findDivisionInTournament.mockResolvedValue(division);
  notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
  redirect.mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
});

describe("deleteDivisionAction", () => {
  it("Server Action の冒頭でも認可境界を独立に呼ぶ", async () => {
    deleteDivisionInDb.mockReturnValue(Effect.succeed({ deleted: 1 }));

    await expect(
      deleteDivisionAction(
        INITIAL_DIVISION_FORM_STATE,
        buildFormData("男子シングルス"),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(requireOrganization).toHaveBeenCalledWith("tennis-club");
  });

  it("名前が一致したら削除し、大会詳細へ戻す", async () => {
    deleteDivisionInDb.mockReturnValue(Effect.succeed({ deleted: 1 }));

    await expect(
      deleteDivisionAction(
        INITIAL_DIVISION_FORM_STATE,
        buildFormData("男子シングルス"),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(revalidatePath).toHaveBeenCalledWith(
      "/orgs/tennis-club/tournaments/t1",
    );
    expect(redirect).toHaveBeenCalledWith("/orgs/tennis-club/tournaments/t1");
  });

  // クライアント側の disabled は体感のためのもので、境界はここ。
  it("名前が一致しなければ削除しない", async () => {
    const state = await deleteDivisionAction(
      INITIAL_DIVISION_FORM_STATE,
      buildFormData("女子シングルス"),
    );

    expect(deleteDivisionInDb).not.toHaveBeenCalled();
    expect(state.error).toBe("部門名が一致しません");
  });

  it("確認欄が空なら削除しない", async () => {
    const state = await deleteDivisionAction(
      INITIAL_DIVISION_FORM_STATE,
      buildFormData("   "),
    );

    expect(deleteDivisionInDb).not.toHaveBeenCalled();
    expect(state.error).toBe("確認のため部門名を入力してください");
  });

  it("その組織のその大会に部門が無ければ 404 にする", async () => {
    findDivisionInTournament.mockResolvedValue(null);

    await expect(
      deleteDivisionAction(
        INITIAL_DIVISION_FORM_STATE,
        buildFormData("男子シングルス"),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(deleteDivisionInDb).not.toHaveBeenCalled();
  });

  it("突き合わせ後に 0 件削除だった場合も 404 にする", async () => {
    deleteDivisionInDb.mockReturnValue(Effect.succeed({ deleted: 0 }));

    await expect(
      deleteDivisionAction(
        INITIAL_DIVISION_FORM_STATE,
        buildFormData("男子シングルス"),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(redirect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/features/division/delete/handler.test.ts`
Expected: FAIL — `Failed to resolve import "./handler"`

- [ ] **Step 8: delete/handler.ts を実装する**

`src/features/division/delete/handler.ts`:

```ts
"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import { findDivisionInTournament } from "../repository";
import type { DivisionFormState } from "../state";
import { deleteDivisionInDb } from "./repository";
import { deleteDivisionSchema } from "./schema";
import { deleteDivision } from "./usecase";

export const deleteDivisionAction = async (
  _prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const divisionId = String(formData.get("divisionId") ?? "");
  const { organization } = await requireOrganization(slug);

  const division = await findDivisionInTournament(
    organization.id,
    tournamentId,
    divisionId,
  );
  if (!division) {
    notFound();
  }

  const parsed = deleteDivisionSchema.safeParse({
    confirmName: String(formData.get("confirmName") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // クライアント側の入力チェックは体感のためのもので、境界はここ。
  if (parsed.data.confirmName !== division.name) {
    return { error: "部門名が一致しません" };
  }

  const exit = await Effect.runPromiseExit(
    deleteDivision(
      deleteDivisionInDb,
      organization.id,
      tournamentId,
      divisionId,
    ),
  );

  if (Exit.isFailure(exit)) {
    return divisionErrorFormState(exit.cause);
  }

  // 0 件は「この組織のこの大会にその部門が無い」を意味する。存在を漏らさないよう 404。
  if (exit.value.deleted === 0) {
    notFound();
  }

  revalidatePath(`/orgs/${slug}/tournaments/${tournamentId}`);
  redirect(`/orgs/${slug}/tournaments/${tournamentId}`);
};
```

削除で order に欠番ができるが、`listDivisionsInTournament` は order 昇順で並べるだけなので表示は崩れない。詰め直しは行わない（YAGNI）。

- [ ] **Step 9: テストが通ることを確認する**

Run: `pnpm exec vitest run src/features/division/delete/handler.test.ts`
Expected: PASS（6 件）

- [ ] **Step 10: 検証してコミット**

```bash
pnpm exec vitest run src/features/division
pnpm lint
pnpm typecheck
git add src/features/division/delete
git commit -m "feat(division): add delete slice with name confirmation"
```

---

### Task 6: reorder スライス（並べ替え）

隣接 2 件の `order` を入れ替える。`@@unique([tournamentId, order])` があるため、退避値を経由した 3 段更新にする。

**Files:**
- Create: `src/features/division/reorder/domain.ts`
- Create: `src/features/division/reorder/schema.ts`
- Create: `src/features/division/reorder/repository.ts`
- Create: `src/features/division/reorder/usecase.ts`
- Create: `src/features/division/reorder/handler.ts`
- Test: `src/features/division/reorder/domain.test.ts`
- Test: `src/features/division/reorder/repository.test.ts`
- Test: `src/features/division/reorder/handler.test.ts`

**Interfaces:**
- Consumes: Task 1 の `toDivisionError` / `DivisionError` / `DivisionFormState` / `divisionErrorFormState`
- Produces:
  - `type ReorderDirection = "up" | "down"`
  - `type OrderedDivision = { id: string; order: number }`
  - `type DivisionSwapPair = { target: OrderedDivision; neighbor: OrderedDivision }`
  - `findSwapPair(divisions: OrderedDivision[], divisionId: string, direction: ReorderDirection): DivisionSwapPair | null`
  - `reorderDivisionSchema`、`type ReorderDivisionInput = { direction: ReorderDirection }`
  - `type ReorderDivisionPort = (input: { organizationId: string; tournamentId: string; divisionId: string; direction: ReorderDirection }) => Effect.Effect<{ swapped: boolean }, DivisionError>`
  - `reorderDivisionInDb: ReorderDivisionPort`
  - `reorderDivision(port, organizationId, tournamentId, divisionId, direction): Effect.Effect<{ swapped: boolean }, DivisionError>`
  - `reorderDivisionAction: DivisionFormAction`

- [ ] **Step 1: domain の失敗テストを書く**

`src/features/division/reorder/domain.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { findSwapPair } from "./domain";

// order に欠番がある状態をあえて使う。削除で欠番はできるため、
// 「index で隣を選び、order の値を入れ替える」形でないと壊れる。
const divisions = [
  { id: "d1", order: 0 },
  { id: "d2", order: 3 },
  { id: "d3", order: 7 },
];

describe("findSwapPair", () => {
  it("上へ動かすとき、1 つ前の部門を相手に選ぶ", () => {
    expect(findSwapPair(divisions, "d2", "up")).toEqual({
      target: { id: "d2", order: 3 },
      neighbor: { id: "d1", order: 0 },
    });
  });

  it("下へ動かすとき、1 つ後ろの部門を相手に選ぶ", () => {
    expect(findSwapPair(divisions, "d2", "down")).toEqual({
      target: { id: "d2", order: 3 },
      neighbor: { id: "d3", order: 7 },
    });
  });

  it("先頭を上へは動かせない", () => {
    expect(findSwapPair(divisions, "d1", "up")).toBeNull();
  });

  it("末尾を下へは動かせない", () => {
    expect(findSwapPair(divisions, "d3", "down")).toBeNull();
  });

  it("一覧に無い部門は null", () => {
    expect(findSwapPair(divisions, "unknown", "up")).toBeNull();
  });

  it("1 件しかなければどちらへも動かせない", () => {
    const single = [{ id: "d1", order: 0 }];

    expect(findSwapPair(single, "d1", "up")).toBeNull();
    expect(findSwapPair(single, "d1", "down")).toBeNull();
  });

  // 入力が order 順に並んでいるとは限らない。並べ替えてから隣を決める。
  it("入力の並び順に依存しない", () => {
    const shuffled = [
      { id: "d3", order: 7 },
      { id: "d1", order: 0 },
      { id: "d2", order: 3 },
    ];

    expect(findSwapPair(shuffled, "d3", "up")).toEqual({
      target: { id: "d3", order: 7 },
      neighbor: { id: "d2", order: 3 },
    });
  });

  it("元の配列を破壊しない", () => {
    const input = [
      { id: "d3", order: 7 },
      { id: "d1", order: 0 },
    ];

    findSwapPair(input, "d3", "up");

    expect(input[0].id).toBe("d3");
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/features/division/reorder/domain.test.ts`
Expected: FAIL — `Failed to resolve import "./domain"`

- [ ] **Step 3: reorder/domain.ts を実装する**

`src/features/division/reorder/domain.ts`:

```ts
export type ReorderDirection = "up" | "down";

export type OrderedDivision = {
  id: string;
  order: number;
};

/** 入れ替える 2 件。order の値をこの 2 件のあいだで交換する。 */
export type DivisionSwapPair = {
  target: OrderedDivision;
  neighbor: OrderedDivision;
};

/**
 * 動かしたい部門と向きから、order を交換する相手を決める。
 *
 * 削除で order に欠番ができるため、order の値を ±1 して相手を探す形にはしない。
 * order 昇順に並べたうえで「隣の要素」を index で取り、その order 値どうしを
 * 交換する。端（先頭の up / 末尾の down）と未知の id は null を返す。
 */
export const findSwapPair = (
  divisions: OrderedDivision[],
  divisionId: string,
  direction: ReorderDirection,
): DivisionSwapPair | null => {
  const sorted = [...divisions].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((division) => division.id === divisionId);
  if (index === -1) {
    return null;
  }

  const target = sorted[index];
  const neighbor = sorted[direction === "up" ? index - 1 : index + 1];
  if (!neighbor) {
    return null;
  }

  return { target, neighbor };
};
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run src/features/division/reorder/domain.test.ts`
Expected: PASS（8 件）

- [ ] **Step 5: schema.ts を実装する**

`src/features/division/reorder/schema.ts`:

```ts
import { z } from "zod";

export const reorderDivisionSchema = z.object({
  direction: z.enum(["up", "down"], { error: "並べ替えの向きが不正です" }),
});

export type ReorderDivisionInput = z.infer<typeof reorderDivisionSchema>;
```

Zod のバージョン差で `{ error: ... }` が効かない場合は `{ message: ... }` に替える（Task 1 Step 16 と同じ）。

- [ ] **Step 6: repository の失敗テストを書く**

`src/features/division/reorder/repository.test.ts`:

```ts
import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { failureTag } from "@/shared/testing/exit";

const findMany = vi.fn();
const updateMany = vi.fn();

const tx = {
  division: {
    findMany: (args: unknown) => findMany(args),
    updateMany: (args: unknown) => updateMany(args),
  },
};

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

const { reorderDivisionInDb } = await import("./repository");

const input = {
  organizationId: "o1",
  tournamentId: "t1",
  divisionId: "d2",
  direction: "up",
} as const;

beforeEach(() => {
  findMany.mockReset();
  updateMany.mockReset();
  updateMany.mockResolvedValue({ count: 1 });
});

describe("reorderDivisionInDb", () => {
  it("並べ替え対象の一覧も所有条件つきで引く", async () => {
    findMany.mockResolvedValue([
      { id: "d1", order: 0 },
      { id: "d2", order: 1 },
    ]);

    await Effect.runPromiseExit(reorderDivisionInDb({ ...input }));

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournament: { id: "t1", organizationId: "o1" } },
      }),
    );
  });

  // 直接入れ替えると中間状態が @@unique([tournamentId, order]) に触れる。
  // 退避値を経由する 3 段更新でないと、DB によっては必ず失敗する。
  it("退避値 -1 を経由した 3 段更新で order を交換する", async () => {
    findMany.mockResolvedValue([
      { id: "d1", order: 0 },
      { id: "d2", order: 1 },
    ]);

    const exit = await Effect.runPromiseExit(reorderDivisionInDb({ ...input }));

    expect(updateMany).toHaveBeenCalledTimes(3);
    expect(updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "d2", tournamentId: "t1" },
      data: { order: -1 },
    });
    expect(updateMany.mock.calls[1][0]).toMatchObject({
      where: { id: "d1", tournamentId: "t1" },
      data: { order: 1 },
    });
    expect(updateMany.mock.calls[2][0]).toMatchObject({
      where: { id: "d2", tournamentId: "t1" },
      data: { order: 0 },
    });
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ swapped: true });
    }
  });

  it("端は何も更新せず swapped: false を返す", async () => {
    findMany.mockResolvedValue([
      { id: "d1", order: 0 },
      { id: "d2", order: 1 },
    ]);

    const exit = await Effect.runPromiseExit(
      reorderDivisionInDb({ ...input, divisionId: "d1" }),
    );

    expect(updateMany).not.toHaveBeenCalled();
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ swapped: false });
    }
  });

  it("その組織のその大会に部門が無ければ swapped: false", async () => {
    findMany.mockResolvedValue([]);

    const exit = await Effect.runPromiseExit(reorderDivisionInDb({ ...input }));

    expect(updateMany).not.toHaveBeenCalled();
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ swapped: false });
    }
  });

  // 同じ大会で並べ替えが同時に走ると、退避値 -1 どうしが衝突しうる。
  it("退避値の衝突（P2002）も DivisionOrderConflictError に写像する", async () => {
    findMany.mockResolvedValue([
      { id: "d1", order: 0 },
      { id: "d2", order: 1 },
    ]);
    updateMany.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "7.10.0",
      }),
    );

    const exit = await Effect.runPromiseExit(reorderDivisionInDb({ ...input }));

    expect(failureTag(exit)).toBe("DivisionOrderConflictError");
  });
});
```

- [ ] **Step 7: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/features/division/reorder/repository.test.ts`
Expected: FAIL — `Failed to resolve import "./repository"`

- [ ] **Step 8: reorder/repository.ts を実装する**

`src/features/division/reorder/repository.ts`:

```ts
import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type DivisionError, toDivisionError } from "../errors";
import { findSwapPair, type ReorderDirection } from "./domain";

/** 退避先。order は 0 始まりで採番するため、負数は通常の行と衝突しない。 */
const PARKING_ORDER = -1;

/** swapped: false は「端まで来ている」または「その大会にその部門が無い」。 */
export type ReorderDivisionPort = (input: {
  organizationId: string;
  tournamentId: string;
  divisionId: string;
  direction: ReorderDirection;
}) => Effect.Effect<{ swapped: boolean }, DivisionError>;

export const reorderDivisionInDb: ReorderDivisionPort = (input) =>
  Effect.tryPromise({
    try: () =>
      prisma.$transaction(async (tx) => {
        // 一覧の取得も所有条件つきで行う。ここを素通しにすると、
        // 他組織の部門を相手に選んでしまう。
        const divisions = await tx.division.findMany({
          where: {
            tournament: {
              id: input.tournamentId,
              organizationId: input.organizationId,
            },
          },
          select: { id: true, order: true },
        });

        const pair = findSwapPair(divisions, input.divisionId, input.direction);
        if (!pair) {
          return { swapped: false };
        }

        // @@unique([tournamentId, order]) があるため直接は交換できない。
        // 片方を退避値へ逃がしてから 2 段で入れ替える。
        await tx.division.updateMany({
          where: { id: pair.target.id, tournamentId: input.tournamentId },
          data: { order: PARKING_ORDER },
        });
        await tx.division.updateMany({
          where: { id: pair.neighbor.id, tournamentId: input.tournamentId },
          data: { order: pair.target.order },
        });
        await tx.division.updateMany({
          where: { id: pair.target.id, tournamentId: input.tournamentId },
          data: { order: pair.neighbor.order },
        });

        return { swapped: true };
      }),
    catch: (reason) => toDivisionError(reason, input.tournamentId),
  });
```

- [ ] **Step 9: テストが通ることを確認する**

Run: `pnpm exec vitest run src/features/division/reorder/repository.test.ts`
Expected: PASS（5 件）

- [ ] **Step 10: reorder/usecase.ts を実装する**

ポートへ引数を渡すだけなので固有のテストは書かない（他スライスの usecase と同じ扱い）。

`src/features/division/reorder/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { ReorderDirection } from "./domain";
import type { ReorderDivisionPort } from "./repository";

export const reorderDivision = (
  port: ReorderDivisionPort,
  organizationId: string,
  tournamentId: string,
  divisionId: string,
  direction: ReorderDirection,
): Effect.Effect<{ swapped: boolean }, DivisionError> =>
  port({ organizationId, tournamentId, divisionId, direction });
```

- [ ] **Step 11: handler の失敗テストを書く**

`src/features/division/reorder/handler.test.ts`:

```ts
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_DIVISION_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const reorderDivisionInDb = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => requireOrganization(slug),
}));

vi.mock("./repository", () => ({
  reorderDivisionInDb: (input: unknown) => reorderDivisionInDb(input),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

const { reorderDivisionAction } = await import("./handler");

const organization = {
  id: "o1",
  name: "テニス部",
  slug: "tennis-club",
  createdAt: new Date("2026-08-01T00:00:00Z"),
  updatedAt: new Date("2026-08-01T00:00:00Z"),
};

const buildFormData = (direction: string): FormData => {
  const data = new FormData();
  data.set("slug", organization.slug);
  data.set("tournamentId", "t1");
  data.set("divisionId", "d2");
  data.set("direction", direction);
  return data;
};

beforeEach(() => {
  requireOrganization.mockReset();
  reorderDivisionInDb.mockReset();
  revalidatePath.mockReset();
  requireOrganization.mockResolvedValue({ organization, role: "OWNER" });
});

describe("reorderDivisionAction", () => {
  it("Server Action の冒頭でも認可境界を独立に呼ぶ", async () => {
    reorderDivisionInDb.mockReturnValue(Effect.succeed({ swapped: true }));

    await reorderDivisionAction(INITIAL_DIVISION_FORM_STATE, buildFormData("up"));

    expect(requireOrganization).toHaveBeenCalledWith("tennis-club");
  });

  it("入れ替えたら大会詳細を再検証し、エラー無しで返す", async () => {
    reorderDivisionInDb.mockReturnValue(Effect.succeed({ swapped: true }));

    const state = await reorderDivisionAction(
      INITIAL_DIVISION_FORM_STATE,
      buildFormData("up"),
    );

    expect(reorderDivisionInDb).toHaveBeenCalledWith({
      organizationId: "o1",
      tournamentId: "t1",
      divisionId: "d2",
      direction: "up",
    });
    expect(revalidatePath).toHaveBeenCalledWith(
      "/orgs/tennis-club/tournaments/t1",
    );
    expect(state.error).toBeNull();
  });

  // 端のボタンは disabled にしてあるが、それは体感のためで境界ではない。
  // 動かせない要求はエラーにせず、ただ何も起きなかったことにする。
  it("端で動かせなくてもエラーにはしない", async () => {
    reorderDivisionInDb.mockReturnValue(Effect.succeed({ swapped: false }));

    const state = await reorderDivisionAction(
      INITIAL_DIVISION_FORM_STATE,
      buildFormData("up"),
    );

    expect(state.error).toBeNull();
  });

  it("向きが不正なら DB を触らない", async () => {
    const state = await reorderDivisionAction(
      INITIAL_DIVISION_FORM_STATE,
      buildFormData("sideways"),
    );

    expect(reorderDivisionInDb).not.toHaveBeenCalled();
    expect(state.error).toBe("並べ替えの向きが不正です");
  });

  it("退避値が競合したら文言を返す", async () => {
    const { DivisionOrderConflictError } = await import("../errors");
    reorderDivisionInDb.mockReturnValue(
      Effect.fail(new DivisionOrderConflictError({ tournamentId: "t1" })),
    );

    const state = await reorderDivisionAction(
      INITIAL_DIVISION_FORM_STATE,
      buildFormData("down"),
    );

    expect(state.error).toBe("並び順が競合しました。もう一度お試しください");
  });
});
```

- [ ] **Step 12: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/features/division/reorder/handler.test.ts`
Expected: FAIL — `Failed to resolve import "./handler"`

- [ ] **Step 13: reorder/handler.ts を実装する**

`src/features/division/reorder/handler.ts`:

```ts
"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import type { DivisionFormState } from "../state";
import { reorderDivisionInDb } from "./repository";
import { reorderDivisionSchema } from "./schema";
import { reorderDivision } from "./usecase";

export const reorderDivisionAction = async (
  _prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const divisionId = String(formData.get("divisionId") ?? "");
  const { organization } = await requireOrganization(slug);

  const parsed = reorderDivisionSchema.safeParse({
    direction: String(formData.get("direction") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    reorderDivision(
      reorderDivisionInDb,
      organization.id,
      tournamentId,
      divisionId,
      parsed.data.direction,
    ),
  );

  if (Exit.isFailure(exit)) {
    return divisionErrorFormState(exit.cause);
  }

  // swapped: false は「端まで来ている」か「その部門が無い」。どちらも
  // 画面上は何も起きなかったのと同じで、エラーにする必要はない。
  // 並べ替えは大会詳細ページに留まる操作なので redirect はしない。
  revalidatePath(`/orgs/${slug}/tournaments/${tournamentId}`);
  return { error: null };
};
```

- [ ] **Step 14: テストが通ることを確認する**

Run: `pnpm exec vitest run src/features/division/reorder/handler.test.ts`
Expected: PASS（5 件）

- [ ] **Step 15: 検証してコミット**

```bash
pnpm exec vitest run src/features/division
pnpm lint
pnpm typecheck
git add src/features/division/reorder
git commit -m "feat(division): add reorder slice with parked-order swap"
```

---

### Task 7: ブラケット描画アダプタ

`lib/division` の永続化型を `features/bracket` の描画型へ変換する。`features/bracket` 側に置くのは、逆向き（`features/division` → `features/bracket`）が同列スライスへの依存になり禁止されているため。

**Files:**
- Create: `src/features/bracket/from-division.ts`
- Test: `src/features/bracket/from-division.test.ts`

**Interfaces:**
- Consumes: `@/lib/division/types` の `DivisionEntries` / `MatchingConfig` / `DivisionResults` / `SlotSource`、`./types` の `Bracket` / `Match` / `MatchResult` / `Participant` / `SlotSource`、`@/generated/prisma/enums` の `DivisionFormat`
- Produces:
  - `type DivisionSourceParticipant = { id: string; name: string; team?: string }`
  - `type FromDivisionInput = { id: string; name: string; format: DivisionFormat; entries: DivisionEntries; matchingConfig: MatchingConfig; results: DivisionResults; participants: DivisionSourceParticipant[] }`
  - `type FromDivisionResult = { participants: Participant[]; bracket: Bracket; results: MatchResult[] }`
  - `fromDivision(input: FromDivisionInput): FromDivisionResult | null`

- [ ] **Step 1: 失敗テストを書く**

`src/features/bracket/from-division.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type {
  DivisionEntries,
  DivisionResults,
  MatchingConfig,
} from "@/lib/division/types";
import { fromDivision } from "./from-division";

const entries: DivisionEntries = {
  version: 1,
  entries: [
    { id: "e1", participantId: "p1", seed: 0 },
    { id: "e2", participantId: "p2", seed: 1 },
  ],
};

const matchingConfig: MatchingConfig = {
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
};

const emptyResults: DivisionResults = { version: 1, matches: [] };

const participants = [
  { id: "p1", name: "佐藤 蓮", team: "青葉クラブ" },
  { id: "p2", name: "鈴木 陽菜" },
];

const buildInput = (overrides: Partial<Parameters<typeof fromDivision>[0]> = {}) => ({
  id: "d1",
  name: "男子シングルス",
  format: "SINGLE_ELIMINATION" as const,
  entries,
  matchingConfig,
  results: emptyResults,
  participants,
  ...overrides,
});

describe("fromDivision", () => {
  it("エントリーを描画用の参加者へ写し、部門内シードを使う", () => {
    const result = fromDivision(buildInput());

    expect(result).not.toBeNull();
    // 描画側の participantId には entryId を使う。matchingConfig と results が
    // どちらも entryId で参照しているため、そのまま突き合わせられる。
    expect(result?.participants).toEqual([
      { id: "e1", name: "佐藤 蓮", seed: 0, team: "青葉クラブ" },
      { id: "e2", name: "鈴木 陽菜", seed: 1, team: undefined },
    ]);
  });

  it("試合のスロットを entryId 参照へ写す", () => {
    const result = fromDivision(buildInput());

    expect(result?.bracket).toEqual({
      id: "d1",
      name: "男子シングルス",
      matches: [
        {
          id: "m1",
          round: 1,
          order: 0,
          slots: [
            { kind: "participant", participantId: "e1" },
            { kind: "participant", participantId: "e2" },
          ],
        },
      ],
    });
  });

  it("winnerOf と bye はそのまま運ぶ", () => {
    const result = fromDivision(
      buildInput({
        matchingConfig: {
          version: 1,
          matches: [
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
              round: 2,
              order: 0,
              slots: [
                { kind: "winnerOf", matchId: "m1" },
                { kind: "entry", entryId: "e2" },
              ],
            },
          ],
        },
      }),
    );

    expect(result?.bracket.matches[0].slots[1]).toEqual({ kind: "bye" });
    expect(result?.bracket.matches[1].slots[0]).toEqual({
      kind: "winnerOf",
      matchId: "m1",
    });
  });

  it("勝者記録を entryId のまま運ぶ", () => {
    const result = fromDivision(
      buildInput({
        results: {
          version: 1,
          matches: [{ matchId: "m1", winnerEntryId: "e1", score: "3-1" }],
        },
      }),
    );

    expect(result?.results).toEqual([
      { matchId: "m1", winnerId: "e1", score: "3-1" },
    ]);
  });

  // 引き分けは ROUND_ROBIN 専用の概念で、描画側の MatchResult.winnerId は
  // null を取れない。結果ごと捨てて未決の試合として描く。
  it("引き分け（winnerEntryId: null）は結果を捨てて未決扱いにする", () => {
    const result = fromDivision(
      buildInput({
        results: {
          version: 1,
          matches: [{ matchId: "m1", winnerEntryId: null }],
        },
      }),
    );

    expect(result?.results).toEqual([]);
  });

  it("SINGLE_ELIMINATION 以外は null", () => {
    expect(fromDivision(buildInput({ format: "ROUND_ROBIN" }))).toBeNull();
    expect(
      fromDivision(buildInput({ format: "DOUBLE_ELIMINATION_GRAND_FINAL" })),
    ).toBeNull();
  });

  it("組み合わせが未作成なら null", () => {
    expect(
      fromDivision(buildInput({ matchingConfig: { version: 1, matches: [] } })),
    ).toBeNull();
  });

  it("loserOf を含むなら null", () => {
    expect(
      fromDivision(
        buildInput({
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
                  { kind: "loserOf", matchId: "m0" },
                ],
              },
            ],
          },
        }),
      ),
    ).toBeNull();
  });

  it("winners 以外のブラケットを含むなら null", () => {
    expect(
      fromDivision(
        buildInput({
          matchingConfig: {
            version: 1,
            matches: [
              {
                id: "m1",
                bracket: "losers",
                round: 1,
                order: 0,
                slots: [
                  { kind: "entry", entryId: "e1" },
                  { kind: "entry", entryId: "e2" },
                ],
              },
            ],
          },
        }),
      ),
    ).toBeNull();
  });

  it("エントリーの参照先の参加者が居なければ null", () => {
    expect(fromDivision(buildInput({ participants: [participants[0]] }))).toBeNull();
  });

  it("エントリーに現れない参加者は描画対象に含めない", () => {
    const result = fromDivision(
      buildInput({
        participants: [...participants, { id: "p3", name: "高橋 大和" }],
      }),
    );

    expect(result?.participants.map((p) => p.name)).toEqual([
      "佐藤 蓮",
      "鈴木 陽菜",
    ]);
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/features/bracket/from-division.test.ts`
Expected: FAIL — `Failed to resolve import "./from-division"`

- [ ] **Step 3: from-division.ts を実装する**

`src/features/bracket/from-division.ts`:

```ts
import type { DivisionFormat } from "@/generated/prisma/enums";
import type {
  DivisionEntries,
  DivisionResults,
  MatchingConfig,
  SlotSource as DivisionSlotSource,
} from "@/lib/division/types";
import type {
  Bracket,
  Match,
  MatchResult,
  Participant,
  SlotSource,
} from "./types";

/** 表示名を解決済みの参加者。DB からの取得は呼び出し側（repository）が行う。 */
export type DivisionSourceParticipant = {
  id: string;
  name: string;
  team?: string;
};

export type FromDivisionInput = {
  /** Division.id。Bracket.id に使う */
  id: string;
  /** Division.name。Bracket.name に使う */
  name: string;
  format: DivisionFormat;
  entries: DivisionEntries;
  matchingConfig: MatchingConfig;
  results: DivisionResults;
  participants: DivisionSourceParticipant[];
};

export type FromDivisionResult = {
  participants: Participant[];
  bracket: Bracket;
  results: MatchResult[];
};

/**
 * 描画側の SlotSource へ写す。対応できない種類は null を返し、呼び出し元が
 * 部門ごと描画対象から外す。
 */
const toSlotSource = (source: DivisionSlotSource): SlotSource | null => {
  switch (source.kind) {
    case "entry":
      // 描画側の participantId には entryId をそのまま使う。matchingConfig も
      // results も entryId で参照しているため、写像を 1 つに保てる。
      return { kind: "participant", participantId: source.entryId };
    case "winnerOf":
      return { kind: "winnerOf", matchId: source.matchId };
    case "bye":
      return { kind: "bye" };
    case "loserOf":
      // 敗者復活は features/bracket が扱えない。
      return null;
  }
};

/**
 * Division の Json を features/bracket の描画型へ変換する。
 *
 * 対応するのは SINGLE_ELIMINATION のみ。描画側は勝ち上がり木を前提にしており、
 * 敗者ブラケットのレイアウトもリーグの星取表も持たないため、扱えない部門は
 * null を返して呼び出し元に案内を出させる。
 */
export function fromDivision(
  input: FromDivisionInput,
): FromDivisionResult | null {
  if (input.format !== "SINGLE_ELIMINATION") {
    return null;
  }
  if (input.matchingConfig.matches.length === 0) {
    return null;
  }

  const sourceById = new Map(input.participants.map((p) => [p.id, p]));

  // entries に現れるものだけを描画対象にする。大会には他の部門にしか出ない
  // 参加者も居るため、そのまま全員を渡すと関係のない名前が混ざる。
  const participants: Participant[] = [];
  for (const entry of input.entries.entries) {
    const source = sourceById.get(entry.participantId);
    if (!source) {
      // エントリーの参照先が欠けている＝データ不整合。描かない。
      return null;
    }
    participants.push({
      id: entry.id,
      name: source.name,
      // 部門内シード。大会全体の Participant.seed ではない。
      seed: entry.seed,
      team: source.team,
    });
  }

  const matches: Match[] = [];
  for (const source of input.matchingConfig.matches) {
    if (source.bracket !== "winners") {
      return null;
    }
    const first = toSlotSource(source.slots[0]);
    const second = toSlotSource(source.slots[1]);
    if (first === null || second === null) {
      return null;
    }
    matches.push({
      id: source.id,
      round: source.round,
      order: source.order,
      slots: [first, second],
    });
  }

  const results: MatchResult[] = [];
  for (const record of input.results.matches) {
    // 引き分けは ROUND_ROBIN 専用で、描画側の winnerId は null を取れない。
    // 結果ごと捨てて、その試合は未決として描く。
    if (record.winnerEntryId === null) {
      continue;
    }
    results.push({
      matchId: record.matchId,
      winnerId: record.winnerEntryId,
      score: record.score,
    });
  }

  return {
    participants,
    bracket: { id: input.id, name: input.name, matches },
    results,
  };
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run src/features/bracket/from-division.test.ts`
Expected: PASS（12 件）

- [ ] **Step 5: 検証してコミット**

```bash
pnpm exec vitest run src/features/bracket
pnpm lint
pnpm typecheck
git add src/features/bracket/from-division.ts src/features/bracket/from-division.test.ts
git commit -m "feat(bracket): add adapter from division json to bracket types"
```

---

### Task 8: 一覧と並べ替えボタンのコンポーネント

**Files:**
- Create: `src/components/division/DivisionReorderButtons.tsx`
- Create: `src/components/division/DivisionList.tsx`
- Test: `src/components/division/DivisionReorderButtons.test.tsx`
- Test: `src/components/division/DivisionList.test.tsx`

**Interfaces:**
- Consumes: Task 1 の `INITIAL_DIVISION_FORM_STATE` / `DivisionFormAction` / `DIVISION_FORMAT_LABELS`、Task 2 の `DivisionSummary`
- Produces:
  - `DivisionReorderButtons({ action, slug, tournamentId, divisionId, canMoveUp, canMoveDown })`
  - `DivisionList({ slug, tournamentId, divisions, reorderAction })`

- [ ] **Step 1: 並べ替えボタンの失敗テストを書く**

`src/components/division/DivisionReorderButtons.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DivisionFormAction } from "@/features/division/state";
import { DivisionReorderButtons } from "./DivisionReorderButtons";

const noopAction: DivisionFormAction = async () => ({ error: null });

const renderButtons = (canMoveUp: boolean, canMoveDown: boolean) =>
  render(
    <DivisionReorderButtons
      action={noopAction}
      slug="tennis"
      tournamentId="t1"
      divisionId="d1"
      canMoveUp={canMoveUp}
      canMoveDown={canMoveDown}
    />,
  );

describe("DivisionReorderButtons", () => {
  it("向きを submit ボタンの値として送る", () => {
    renderButtons(true, true);

    expect(screen.getByRole("button", { name: "上へ移動" })).toHaveAttribute(
      "value",
      "up",
    );
    expect(screen.getByRole("button", { name: "下へ移動" })).toHaveAttribute(
      "value",
      "down",
    );
  });

  it("どの部門を動かすかを hidden で持つ", () => {
    const { container } = renderButtons(true, true);

    expect(container.querySelector('input[name="slug"]')).toHaveValue("tennis");
    expect(container.querySelector('input[name="tournamentId"]')).toHaveValue(
      "t1",
    );
    expect(container.querySelector('input[name="divisionId"]')).toHaveValue(
      "d1",
    );
  });

  // 活性の判定は体感のためのもので、境界ではない。端の要求は handler が
  // swapped: false として受け流す。
  it("先頭では上へ、末尾では下へを押せなくする", () => {
    renderButtons(false, true);

    expect(screen.getByRole("button", { name: "上へ移動" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下へ移動" })).toBeEnabled();
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/components/division/DivisionReorderButtons.test.tsx`
Expected: FAIL — `Failed to resolve import "./DivisionReorderButtons"`

- [ ] **Step 3: DivisionReorderButtons.tsx を実装する**

`src/components/division/DivisionReorderButtons.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import {
  type DivisionFormAction,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";

/**
 * 隣接する部門と並び順を入れ替えるボタン。2 つの submit ボタンが同じ name を
 * 持ち、押された方の value が direction として送られる。
 */
export function DivisionReorderButtons({
  action,
  slug,
  tournamentId,
  divisionId,
  canMoveUp,
  canMoveDown,
}: {
  action: DivisionFormAction;
  slug: string;
  tournamentId: string;
  divisionId: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_DIVISION_FORM_STATE,
  );

  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="divisionId" value={divisionId} />

      <button
        type="submit"
        name="direction"
        value="up"
        aria-label="上へ移動"
        // 活性の判定は体感のためで、境界ではない。端の要求は handler が受け流す。
        disabled={pending || !canMoveUp}
        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-30"
      >
        ↑
      </button>
      <button
        type="submit"
        name="direction"
        value="down"
        aria-label="下へ移動"
        disabled={pending || !canMoveDown}
        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-30"
      >
        ↓
      </button>

      {state.error !== null && (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run src/components/division/DivisionReorderButtons.test.tsx`
Expected: PASS（3 件）

- [ ] **Step 5: 一覧の失敗テストを書く**

`src/components/division/DivisionList.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DivisionSummary } from "@/features/division/repository";
import type { DivisionFormAction } from "@/features/division/state";
import { DivisionList } from "./DivisionList";

const noopAction: DivisionFormAction = async () => ({ error: null });

const divisions: DivisionSummary[] = [
  { id: "d1", name: "男子シングルス", order: 0, format: "SINGLE_ELIMINATION" },
  { id: "d2", name: "女子シングルス", order: 1, format: "ROUND_ROBIN" },
  { id: "d3", name: "決勝トーナメント", order: 2, format: "SINGLE_ELIMINATION" },
];

const renderList = (items: DivisionSummary[]) =>
  render(
    <DivisionList
      slug="tennis"
      tournamentId="t1"
      divisions={items}
      reorderAction={noopAction}
    />,
  );

describe("DivisionList", () => {
  it("部門名を詳細ページへのリンクとして表示する", () => {
    renderList(divisions);

    expect(screen.getByRole("link", { name: "男子シングルス" })).toHaveAttribute(
      "href",
      "/orgs/tennis/tournaments/t1/divisions/d1",
    );
  });

  it("試合形式を日本語ラベルで出す", () => {
    renderList(divisions);

    expect(screen.getByText("シングルエリミネーション")).toBeInTheDocument();
    expect(screen.getByText("リーグ（総当たり）")).toBeInTheDocument();
  });

  it("先頭は上へ、末尾は下へを押せなくする", () => {
    renderList(divisions);

    const up = screen.getAllByRole("button", { name: "上へ移動" });
    const down = screen.getAllByRole("button", { name: "下へ移動" });

    expect(up[0]).toBeDisabled();
    expect(up[1]).toBeEnabled();
    expect(down[2]).toBeDisabled();
    expect(down[1]).toBeEnabled();
  });

  it("1 件だけならどちらへも動かせない", () => {
    renderList([divisions[0]]);

    expect(screen.getByRole("button", { name: "上へ移動" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下へ移動" })).toBeDisabled();
  });

  it("部門が無いときは空であることを伝える", () => {
    renderList([]);

    expect(screen.getByText("まだ部門がありません")).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
```

- [ ] **Step 6: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/components/division/DivisionList.test.tsx`
Expected: FAIL — `Failed to resolve import "./DivisionList"`

- [ ] **Step 7: DivisionList.tsx を実装する**

`src/components/division/DivisionList.tsx`:

```tsx
import Link from "next/link";
import { DIVISION_FORMAT_LABELS } from "@/features/division/format";
import type { DivisionSummary } from "@/features/division/repository";
import type { DivisionFormAction } from "@/features/division/state";
import { DivisionReorderButtons } from "./DivisionReorderButtons";

export function DivisionList({
  slug,
  tournamentId,
  divisions,
  reorderAction,
}: {
  slug: string;
  tournamentId: string;
  /** order 昇順で渡す。端の判定にこの並びを使う。 */
  divisions: DivisionSummary[];
  reorderAction: DivisionFormAction;
}) {
  if (divisions.length === 0) {
    return <p className="text-sm text-slate-600">まだ部門がありません</p>;
  }

  return (
    <ul className="space-y-2">
      {divisions.map((division, index) => (
        <li
          key={division.id}
          className="flex items-center justify-between gap-4 rounded border border-slate-200 bg-white px-4 py-3"
        >
          <div>
            <Link
              href={`/orgs/${slug}/tournaments/${tournamentId}/divisions/${division.id}`}
              className="font-medium text-slate-800 underline"
            >
              {division.name}
            </Link>
            <p className="text-xs text-slate-500">
              {DIVISION_FORMAT_LABELS[division.format]}
            </p>
          </div>

          <DivisionReorderButtons
            action={reorderAction}
            slug={slug}
            tournamentId={tournamentId}
            divisionId={division.id}
            canMoveUp={index > 0}
            canMoveDown={index < divisions.length - 1}
          />
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 8: テストが通ることを確認する**

Run: `pnpm exec vitest run src/components/division/DivisionList.test.tsx`
Expected: PASS（5 件）

- [ ] **Step 9: 検証してコミット**

```bash
pnpm lint
pnpm typecheck
git add src/components/division
git commit -m "feat(division): add list and reorder button components"
```

---

### Task 9: フォーム・削除・詳細のコンポーネント

**Files:**
- Create: `src/components/division/DivisionForm.tsx`
- Create: `src/components/division/DeleteDivisionForm.tsx`
- Create: `src/components/division/DivisionDetail.tsx`
- Create: `src/components/division/DivisionBracket.tsx`
- Test: `src/components/division/DivisionForm.test.tsx`
- Test: `src/components/division/DeleteDivisionForm.test.tsx`
- Test: `src/components/division/DivisionBracket.test.tsx`

**Interfaces:**
- Consumes: Task 1 の `INITIAL_DIVISION_FORM_STATE` / `DivisionFormAction` / `DIVISION_FORMATS` / `DIVISION_FORMAT_LABELS`、Task 2 の `DivisionDetail` / `DivisionParticipant`、Task 7 の `fromDivision`
- Produces:
  - `DivisionForm({ action, slug, tournamentId, submitLabel, defaultName?, defaultFormat?, divisionId? })`
  - `DeleteDivisionForm({ action, divisionName, slug, tournamentId, divisionId })`
  - `DivisionDetailView({ slug, tournamentId, division })`
  - `DivisionBracket({ division, participants })`

- [ ] **Step 1: フォームの失敗テストを書く**

`src/components/division/DivisionForm.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DivisionFormAction } from "@/features/division/state";
import { DivisionForm } from "./DivisionForm";

const noopAction: DivisionFormAction = async () => ({ error: null });

describe("DivisionForm", () => {
  it("試合形式を日本語ラベルの選択肢として出す", () => {
    render(
      <DivisionForm
        action={noopAction}
        slug="tennis"
        tournamentId="t1"
        submitLabel="作成する"
      />,
    );

    const select = screen.getByLabelText("試合形式");
    expect(select).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "シングルエリミネーション" }),
    ).toHaveValue("SINGLE_ELIMINATION");
    expect(screen.getByRole("option", { name: "リーグ（総当たり）" })).toHaveValue(
      "ROUND_ROBIN",
    );
  });

  it("作成時は divisionId を送らない", () => {
    const { container } = render(
      <DivisionForm
        action={noopAction}
        slug="tennis"
        tournamentId="t1"
        submitLabel="作成する"
      />,
    );

    expect(container.querySelector('input[name="divisionId"]')).toBeNull();
    expect(screen.getByRole("button", { name: "作成する" })).toBeInTheDocument();
  });

  it("編集時は既定値と divisionId を持つ", () => {
    const { container } = render(
      <DivisionForm
        action={noopAction}
        slug="tennis"
        tournamentId="t1"
        submitLabel="保存する"
        defaultName="男子シングルス"
        defaultFormat="ROUND_ROBIN"
        divisionId="d1"
      />,
    );

    expect(screen.getByLabelText("部門名")).toHaveValue("男子シングルス");
    expect(screen.getByLabelText("試合形式")).toHaveValue("ROUND_ROBIN");
    expect(container.querySelector('input[name="divisionId"]')).toHaveValue(
      "d1",
    );
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/components/division/DivisionForm.test.tsx`
Expected: FAIL — `Failed to resolve import "./DivisionForm"`

- [ ] **Step 3: DivisionForm.tsx を実装する**

`src/components/division/DivisionForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import {
  DIVISION_FORMAT_LABELS,
  DIVISION_FORMATS,
} from "@/features/division/format";
import {
  type DivisionFormAction,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";
import type { DivisionFormat } from "@/generated/prisma/enums";

export function DivisionForm({
  action,
  slug,
  tournamentId,
  submitLabel,
  defaultName = "",
  defaultFormat = "SINGLE_ELIMINATION",
  divisionId,
}: {
  action: DivisionFormAction;
  slug: string;
  tournamentId: string;
  submitLabel: string;
  defaultName?: string;
  defaultFormat?: DivisionFormat;
  /** 編集時に渡す。どの部門を更新するかを handler へ伝える。 */
  divisionId?: string;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_DIVISION_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="tournamentId" value={tournamentId} />
      {divisionId !== undefined && (
        <input type="hidden" name="divisionId" value={divisionId} />
      )}

      <div className="space-y-1">
        <label
          htmlFor="name"
          className="block text-sm font-medium text-slate-700"
        >
          部門名
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={defaultName}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label
          htmlFor="format"
          className="block text-sm font-medium text-slate-700"
        >
          試合形式
        </label>
        <select
          id="format"
          name="format"
          required
          defaultValue={defaultFormat}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        >
          {DIVISION_FORMATS.map((format) => (
            <option key={format} value={format}>
              {DIVISION_FORMAT_LABELS[format]}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500">
          ブラケット表示に対応しているのはシングルエリミネーションのみ
        </p>
      </div>

      {state.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "送信中..." : submitLabel}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run src/components/division/DivisionForm.test.tsx`
Expected: PASS（3 件）

- [ ] **Step 5: 削除フォームの失敗テストを書く**

`src/components/division/DeleteDivisionForm.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { DivisionFormAction } from "@/features/division/state";
import { DeleteDivisionForm } from "./DeleteDivisionForm";

const noopAction: DivisionFormAction = async () => ({ error: null });

const renderForm = () =>
  render(
    <DeleteDivisionForm
      action={noopAction}
      divisionName="男子シングルス"
      slug="tennis"
      tournamentId="t1"
      divisionId="d1"
    />,
  );

describe("DeleteDivisionForm", () => {
  it("結果ごと失われることを伝える", () => {
    renderForm();

    expect(
      screen.getByText(
        "エントリー・組み合わせ・勝敗記録もすべて削除されます。元に戻せません。",
      ),
    ).toBeInTheDocument();
  });

  it("部門名を入力するまで削除できない", async () => {
    renderForm();

    const button = screen.getByRole("button", { name: "この部門を削除する" });
    expect(button).toBeDisabled();

    await userEvent.type(
      screen.getByLabelText("確認のため部門名を入力"),
      "男子シングルス",
    );

    expect(button).toBeEnabled();
  });

  it("入力が一致しないうちは押せない", async () => {
    renderForm();

    await userEvent.type(
      screen.getByLabelText("確認のため部門名を入力"),
      "男子",
    );

    expect(
      screen.getByRole("button", { name: "この部門を削除する" }),
    ).toBeDisabled();
  });
});
```

- [ ] **Step 6: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/components/division/DeleteDivisionForm.test.tsx`
Expected: FAIL — `Failed to resolve import "./DeleteDivisionForm"`

- [ ] **Step 7: DeleteDivisionForm.tsx を実装する**

`src/components/division/DeleteDivisionForm.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import {
  type DivisionFormAction,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";

export function DeleteDivisionForm({
  action,
  divisionName,
  slug,
  tournamentId,
  divisionId,
}: {
  action: DivisionFormAction;
  divisionName: string;
  slug: string;
  tournamentId: string;
  divisionId: string;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_DIVISION_FORM_STATE,
  );
  const [confirmName, setConfirmName] = useState("");

  return (
    <form
      action={formAction}
      className="space-y-3 rounded border border-red-200 bg-red-50 p-4"
    >
      <h2 className="text-sm font-bold text-red-800">部門を削除</h2>
      <p className="text-xs text-red-700">
        エントリー・組み合わせ・勝敗記録もすべて削除されます。元に戻せません。
      </p>

      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="divisionId" value={divisionId} />

      <div className="space-y-1">
        <label
          htmlFor="confirmName"
          className="block text-sm font-medium text-red-800"
        >
          確認のため部門名を入力
        </label>
        <input
          id="confirmName"
          name="confirmName"
          type="text"
          value={confirmName}
          onChange={(event) => setConfirmName(event.target.value)}
          className="w-full rounded border border-red-300 bg-white px-3 py-2 text-sm"
        />
      </div>

      {state.error !== null && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        // 活性の判定は体感のためで、境界ではない。一致は handler が DB と突き合わせる。
        disabled={pending || confirmName !== divisionName}
        className="rounded bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "削除中..." : "この部門を削除する"}
      </button>
    </form>
  );
}
```

- [ ] **Step 8: テストが通ることを確認する**

Run: `pnpm exec vitest run src/components/division/DeleteDivisionForm.test.tsx`
Expected: PASS（3 件）

- [ ] **Step 9: ブラケット表示の失敗テストを書く**

`src/components/division/DivisionBracket.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DivisionDetail } from "@/features/division/repository";

// @xyflow/react は jsdom で実寸を測れないため、描画そのものは差し替える。
// ここで確かめたいのは「描くか、どんな案内を出すか」の分岐。
vi.mock("@/components/tournament/TournamentFlow", () => ({
  TournamentFlow: ({ nodes }: { nodes: unknown[] }) => (
    <div data-testid="flow">{nodes.length}</div>
  ),
}));

const { DivisionBracket } = await import("./DivisionBracket");

const participants = [
  { id: "p1", name: "佐藤 蓮" },
  { id: "p2", name: "鈴木 陽菜" },
];

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
  results: { version: 1, matches: [] },
  createdAt: new Date("2026-08-01T00:00:00Z"),
  ...overrides,
});

describe("DivisionBracket", () => {
  it("組み合わせがあれば描画する", () => {
    render(
      <DivisionBracket division={buildDivision()} participants={participants} />,
    );

    expect(screen.getByTestId("flow")).toHaveTextContent("1");
  });

  it("組み合わせが未作成ならその旨を案内する", () => {
    render(
      <DivisionBracket
        division={buildDivision({ matchingConfig: { version: 1, matches: [] } })}
        participants={participants}
      />,
    );

    expect(screen.getByText("組み合わせが未作成です")).toBeInTheDocument();
    expect(screen.queryByTestId("flow")).toBeNull();
  });

  it("対応していない形式は形式名を添えて案内する", () => {
    render(
      <DivisionBracket
        division={buildDivision({ format: "ROUND_ROBIN" })}
        participants={participants}
      />,
    );

    expect(
      screen.getByText(
        "「リーグ（総当たり）」のブラケット表示はまだ対応していません",
      ),
    ).toBeInTheDocument();
  });

  it("敗者復活を含む組み合わせは未対応として案内する", () => {
    render(
      <DivisionBracket
        division={buildDivision({
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
                  { kind: "loserOf", matchId: "m0" },
                ],
              },
            ],
          },
        })}
        participants={participants}
      />,
    );

    expect(
      screen.getByText("この組み合わせはまだ表示に対応していません"),
    ).toBeInTheDocument();
  });

  // Json は DB の列で、アプリの外から壊れた値が入りうる。ページ全体を
  // 落とさず、この区画だけで受け止める。
  it("Json が壊れていてもページを落とさない", () => {
    render(
      <DivisionBracket
        division={buildDivision({ matchingConfig: { version: 2 } })}
        participants={participants}
      />,
    );

    expect(
      screen.getByText("ブラケットのデータを読み込めませんでした"),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 10: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/components/division/DivisionBracket.test.tsx`
Expected: FAIL — `Failed to resolve import "./DivisionBracket"`

- [ ] **Step 11: DivisionBracket.tsx を実装する**

`src/components/division/DivisionBracket.tsx`:

```tsx
import { TournamentFlow } from "@/components/tournament/TournamentFlow";
import { fromDivision } from "@/features/bracket/from-division";
import { layoutBracket } from "@/features/bracket/layout-bracket";
import { resolveBracket } from "@/features/bracket/resolve-bracket";
import { toFlowElements } from "@/features/bracket/to-flow-elements";
import { DIVISION_FORMAT_LABELS } from "@/features/division/format";
import type {
  DivisionDetail,
  DivisionParticipant,
} from "@/features/division/repository";
import {
  parseDivisionEntries,
  parseDivisionResults,
  parseMatchingConfig,
} from "@/lib/division/parse";

const Notice = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-600">
    {children}
  </p>
);

export function DivisionBracket({
  division,
  participants,
}: {
  division: DivisionDetail;
  participants: DivisionParticipant[];
}) {
  // Json は DB の列で、アプリの外から壊れた値が入りうる。パースの失敗は
  // この区画で受け止め、ページ全体は落とさない。
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
    return <Notice>ブラケットのデータを読み込めませんでした</Notice>;
  }

  if (parsed.matchingConfig.matches.length === 0) {
    return <Notice>組み合わせが未作成です</Notice>;
  }

  if (division.format !== "SINGLE_ELIMINATION") {
    return (
      <Notice>
        「{DIVISION_FORMAT_LABELS[division.format]}
        」のブラケット表示はまだ対応していません
      </Notice>
    );
  }

  const converted = fromDivision({
    id: division.id,
    name: division.name,
    format: division.format,
    entries: parsed.entries,
    matchingConfig: parsed.matchingConfig,
    results: parsed.results,
    participants,
  });
  if (converted === null) {
    return <Notice>この組み合わせはまだ表示に対応していません</Notice>;
  }

  // resolveBracket / layoutBracket は矛盾したデータで例外を投げる設計。
  // ここも同じくページを落とさず区画で受け止める。
  let elements: ReturnType<typeof toFlowElements>;
  try {
    const resolved = resolveBracket(
      converted.participants,
      converted.bracket,
      converted.results,
    );
    elements = toFlowElements(resolved, layoutBracket(resolved));
  } catch {
    return <Notice>ブラケットを組み立てられませんでした</Notice>;
  }

  return (
    <div className="h-[28rem] rounded border border-slate-200 bg-white">
      <TournamentFlow nodes={elements.nodes} edges={elements.edges} />
    </div>
  );
}
```

- [ ] **Step 12: テストが通ることを確認する**

Run: `pnpm exec vitest run src/components/division/DivisionBracket.test.tsx`
Expected: PASS（5 件）

- [ ] **Step 13: DivisionDetail.tsx を実装する**

メタ情報を並べるだけで分岐を持たないため、固有のテストは書かない（`TournamentDetail.tsx` にはテストがあるが、あちらは `formatStartsAt` の分岐を含む。こちらはラベル引きのみで、それは Task 1 の format.test.ts が覆っている）。

`src/components/division/DivisionDetail.tsx`:

```tsx
import Link from "next/link";
import { DIVISION_FORMAT_LABELS } from "@/features/division/format";
import type { DivisionDetail } from "@/features/division/repository";
import { formatStartsAt } from "@/features/tournament/format";

export function DivisionDetailView({
  slug,
  tournamentId,
  division,
}: {
  slug: string;
  tournamentId: string;
  division: DivisionDetail;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <h1 className="text-lg font-bold text-slate-800">{division.name}</h1>
        <Link
          href={`/orgs/${slug}/tournaments/${tournamentId}/divisions/${division.id}/edit`}
          className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
        >
          部門を編集
        </Link>
      </div>

      <dl className="space-y-2 rounded border border-slate-200 bg-white px-4 py-3 text-sm">
        <div className="flex gap-4">
          <dt className="w-24 text-slate-500">試合形式</dt>
          <dd className="text-slate-800">
            {DIVISION_FORMAT_LABELS[division.format]}
          </dd>
        </div>
        <div className="flex gap-4">
          <dt className="w-24 text-slate-500">作成日時</dt>
          <dd className="text-slate-800">
            {formatStartsAt(division.createdAt)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
```

`formatStartsAt` を `features/tournament` から取っているが、これはコンポーネント層（`src/components/`）からの参照で、features 同士の依存ではないため制約に触れない。`app/` と `components/` はどの feature も参照してよい層。

- [ ] **Step 14: 検証してコミット**

```bash
pnpm exec vitest run src/components/division
pnpm lint
pnpm typecheck
git add src/components/division
git commit -m "feat(division): add form, delete, detail and bracket components"
```

---

### Task 10: ページの配線とドキュメント更新

ここまでで作った部品をルーティングに繋ぐ。ルートを増やすので `next typegen` の再実行が要る。

**Files:**
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/page.tsx`
- Modify: `src/app/orgs/[slug]/tournaments/[tournamentId]/page.test.tsx`
- Create: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/new/page.tsx`
- Create: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/page.tsx`
- Create: `src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/edit/page.tsx`
- Modify: `docs/code-design/architecture.md`

**Interfaces:**
- Consumes: Task 2 の `listDivisionsInTournament` / `findDivisionInTournament` / `listParticipantsInTournament`、Task 3〜6 の各 Action、Task 8〜9 の各コンポーネント
- Produces: 画面（他のタスクが参照する型は無い）

- [ ] **Step 1: 既存の大会詳細ページのテストを確認する**

```bash
cat "src/app/orgs/[slug]/tournaments/[tournamentId]/page.test.tsx"
pnpm exec vitest run "src/app/orgs/[slug]/tournaments/[tournamentId]/page.test.tsx"
```

Expected: PASS。既存のモックの形をそのまま踏襲する。

- [ ] **Step 2: 大会詳細ページに部門一覧を出す失敗テストを足す**

`src/app/orgs/[slug]/tournaments/[tournamentId]/page.test.tsx` に次の 3 点を足す。

既存の `vi.mock("@/features/tournament/repository", ...)` の直後に、モック定義を足す（`vi.mock` のファクトリは巻き上げられるので、`const` の宣言は既存のモック変数群と同じ位置に置く）:

```tsx
const listDivisionsInTournament = vi.fn();

vi.mock("@/features/division/repository", () => ({
  listDivisionsInTournament: (organizationId: string, tournamentId: string) =>
    listDivisionsInTournament(organizationId, tournamentId),
}));

// Server Action はページ本体の検証に関係しないので、素通しの関数へ差し替える。
vi.mock("@/features/division/reorder/handler", () => ({
  reorderDivisionAction: async () => ({ error: null }),
}));
```

既存の `beforeEach` の末尾に既定値を足す:

```tsx
    listDivisionsInTournament.mockReset();
    listDivisionsInTournament.mockResolvedValue([]);
```

`describe("TournamentPage", ...)` の末尾にテストを 3 件足す:

```tsx
  it("部門一覧も slug ではなく organization.id で絞り込む", async () => {
    await Page(pageProps("tennis", "t1"));

    expect(listDivisionsInTournament).toHaveBeenCalledWith("o1", "t1");
  });

  it("部門名を詳細ページへのリンクとして描画する", async () => {
    listDivisionsInTournament.mockResolvedValue([
      {
        id: "d1",
        name: "男子シングルス",
        order: 0,
        format: "SINGLE_ELIMINATION",
      },
    ]);

    const element = await Page(pageProps("tennis", "t1"));
    render(element);

    expect(screen.getByRole("link", { name: "男子シングルス" })).toHaveAttribute(
      "href",
      "/orgs/tennis/tournaments/t1/divisions/d1",
    );
  });

  it("部門の作成ページへの導線を出す", async () => {
    const element = await Page(pageProps("tennis", "t1"));
    render(element);

    expect(screen.getByRole("link", { name: "部門を作成" })).toHaveAttribute(
      "href",
      "/orgs/tennis/tournaments/t1/divisions/new",
    );
  });
```

- [ ] **Step 3: テストが落ちることを確認する**

Run: `pnpm exec vitest run "src/app/orgs/[slug]/tournaments/[tournamentId]/page.test.tsx"`
Expected: FAIL — 3 件とも失敗（`@/features/division/repository` が未作成、または「部門を作成」のリンクが無い）

- [ ] **Step 4: 大会詳細ページに部門一覧を足す**

`src/app/orgs/[slug]/tournaments/[tournamentId]/page.tsx` を次の内容にする:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { DivisionList } from "@/components/division/DivisionList";
import { AppHeader } from "@/components/layout/AppHeader";
import { TournamentDetailView } from "@/components/tournament/TournamentDetail";
import { reorderDivisionAction } from "@/features/division/reorder/handler";
import { listDivisionsInTournament } from "@/features/division/repository";
import { findTournamentInOrganization } from "@/features/tournament/repository";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function TournamentPage({
  params,
}: PageProps<"/orgs/[slug]/tournaments/[tournamentId]">) {
  const { slug, tournamentId } = await params;
  const { session, organization } = await requireOrganization(slug);

  const tournament = await findTournamentInOrganization(
    organization.id,
    tournamentId,
  );
  if (!tournament) {
    notFound();
  }

  const divisions = await listDivisionsInTournament(
    organization.id,
    tournamentId,
  );

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        crumbs={[
          { label: "組織", href: "/" },
          { label: organization.name, href: `/orgs/${slug}` },
          { label: tournament.name },
        ]}
        userName={session.user.name}
      />

      <div className="mx-auto max-w-2xl space-y-4 px-6 py-8">
        <TournamentDetailView slug={slug} tournament={tournament} />

        <div className="flex items-center justify-between pt-4">
          <h2 className="text-sm font-bold text-slate-700">部門</h2>
          <Link
            href={`/orgs/${slug}/tournaments/${tournament.id}/divisions/new`}
            className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white"
          >
            部門を作成
          </Link>
        </div>

        <DivisionList
          slug={slug}
          tournamentId={tournament.id}
          divisions={divisions}
          reorderAction={reorderDivisionAction}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm exec vitest run "src/app/orgs/[slug]/tournaments/[tournamentId]/page.test.tsx"`
Expected: PASS（既存 5 件 + 追加 3 件 = 8 件）

- [ ] **Step 6: 作成ページを作る**

`src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/new/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { DivisionForm } from "@/components/division/DivisionForm";
import { AppHeader } from "@/components/layout/AppHeader";
import { createDivisionAction } from "@/features/division/create/handler";
import { findTournamentInOrganization } from "@/features/tournament/repository";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function NewDivisionPage({
  params,
}: PageProps<"/orgs/[slug]/tournaments/[tournamentId]/divisions/new">) {
  const { slug, tournamentId } = await params;
  const { session, organization } = await requireOrganization(slug);

  // パンくずに大会名を出すため取得する。同時に、この組織の大会であることも確かめる。
  const tournament = await findTournamentInOrganization(
    organization.id,
    tournamentId,
  );
  if (!tournament) {
    notFound();
  }

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
          { label: "部門を作成" },
        ]}
        userName={session.user.name}
      />

      <div className="mx-auto max-w-sm space-y-6 px-6 py-8">
        <h1 className="text-lg font-bold text-slate-800">部門を作成</h1>
        <DivisionForm
          action={createDivisionAction}
          slug={slug}
          tournamentId={tournament.id}
          submitLabel="作成する"
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 7: 詳細ページを作る**

`src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { DivisionBracket } from "@/components/division/DivisionBracket";
import { DivisionDetailView } from "@/components/division/DivisionDetail";
import { AppHeader } from "@/components/layout/AppHeader";
import {
  findDivisionInTournament,
  listParticipantsInTournament,
} from "@/features/division/repository";
import { findTournamentInOrganization } from "@/features/tournament/repository";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function DivisionPage({
  params,
}: PageProps<"/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]">) {
  const { slug, tournamentId, divisionId } = await params;
  const { session, organization } = await requireOrganization(slug);

  const [tournament, division] = await Promise.all([
    findTournamentInOrganization(organization.id, tournamentId),
    findDivisionInTournament(organization.id, tournamentId, divisionId),
  ]);
  if (!tournament || !division) {
    notFound();
  }

  const participants = await listParticipantsInTournament(
    organization.id,
    tournamentId,
  );

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
          { label: division.name },
        ]}
        userName={session.user.name}
      />

      <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <DivisionDetailView
          slug={slug}
          tournamentId={tournament.id}
          division={division}
        />

        <div className="space-y-2">
          <h2 className="text-sm font-bold text-slate-700">組み合わせ</h2>
          <DivisionBracket division={division} participants={participants} />
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 8: 編集ページを作る**

`src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/edit/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { DeleteDivisionForm } from "@/components/division/DeleteDivisionForm";
import { DivisionForm } from "@/components/division/DivisionForm";
import { AppHeader } from "@/components/layout/AppHeader";
import { deleteDivisionAction } from "@/features/division/delete/handler";
import { findDivisionInTournament } from "@/features/division/repository";
import { updateDivisionAction } from "@/features/division/update/handler";
import { findTournamentInOrganization } from "@/features/tournament/repository";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function EditDivisionPage({
  params,
}: PageProps<"/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/edit">) {
  const { slug, tournamentId, divisionId } = await params;
  const { session, organization } = await requireOrganization(slug);

  const [tournament, division] = await Promise.all([
    findTournamentInOrganization(organization.id, tournamentId),
    findDivisionInTournament(organization.id, tournamentId, divisionId),
  ]);
  if (!tournament || !division) {
    notFound();
  }

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
          { label: "編集" },
        ]}
        userName={session.user.name}
      />

      <div className="mx-auto max-w-sm space-y-8 px-6 py-8">
        <div className="space-y-4">
          <h1 className="text-lg font-bold text-slate-800">部門を編集</h1>
          <DivisionForm
            action={updateDivisionAction}
            slug={slug}
            tournamentId={tournament.id}
            submitLabel="保存する"
            defaultName={division.name}
            defaultFormat={division.format}
            divisionId={division.id}
          />
        </div>

        <DeleteDivisionForm
          action={deleteDivisionAction}
          divisionName={division.name}
          slug={slug}
          tournamentId={tournament.id}
          divisionId={division.id}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 9: 新しいルートの型を生成する**

```bash
pnpm exec next typegen
```

これを飛ばすと、新しい 3 ページの `PageProps<"...">` が未定義で `pnpm typecheck` が落ちる。

- [ ] **Step 10: 全体が通ることを確認する**

```bash
pnpm test
pnpm lint
pnpm typecheck
```

Expected: すべて PASS

- [ ] **Step 11: architecture.md に部門を書き足す**

`docs/code-design/architecture.md` の「テナント分離の 2 原則」の節の冒頭を次に差し替える:

```markdown
## テナント分離の 2 原則

`features/organization` と `features/tournament` と `features/division` は組織単位の
テナント分離が要る。次の 2 点は次のスライスを書くときに必ず守る。
```

同じ節の末尾に次を足す:

```markdown
`features/division` は組織 → 大会 → 部門の 3 段になるが、原則は変わらない。
リレーションフィルタを使って `where: { id: divisionId, tournament: { id: tournamentId,
organizationId } }` と書き、3 段の所有権を 1 クエリで担保する。
`create` だけは `where` を持てないため、同じトランザクションの中で大会の所属を
別途確かめてから作る。
```

さらに「`features/bracket` と `features/tournament` の違い」の節の末尾に次を足す:

```markdown
`features/bracket/from-division.ts` は `lib/division` の永続化型を描画型へ変換する
アダプタ。`features/division` 側に置くと同列スライスへの依存になるため、
`features/bracket` から下位共通層の `lib/division` を参照する向きにしてある。
対応するのは `SINGLE_ELIMINATION` のみで、それ以外は `null` を返す。
```

- [ ] **Step 12: 手で動作確認する**

`.env` に `BYPASS_AUTH=1` を設定して開発サーバーを起動する。

```bash
pnpm dev
```

ブラウザで DevTools のコンソールから Cookie を入れる（AGENTS.md の「ローカル実行時のテスト」に従い `USER_ID` は `1`）:

```js
document.cookie = "USER_ID=1; path=/";
```

次を順に確認する:

1. 大会詳細ページに「部門」の見出しと「部門を作成」ボタンが出る
2. 部門を 2 件作ると、作成順に上から並ぶ
3. 2 件目の ↑ を押すと順序が入れ替わり、先頭の ↑ と末尾の ↓ が押せない
4. 部門名リンクから詳細ページへ行き、「組み合わせが未作成です」が出る
5. 「部門を編集」から名前と形式を変えて保存すると、詳細へ戻って反映されている
6. 編集ページの削除フォームは、部門名を正しく入れるまでボタンが押せない
7. 削除すると大会詳細へ戻り、一覧から消えている

`USER_ID=1` のユーザーが所属する組織と大会が無い場合は、先に画面から組織と大会を作る。

- [ ] **Step 13: コミット**

```bash
git add "src/app/orgs/[slug]/tournaments" docs/code-design/architecture.md
git commit -m "feat(division): wire division CRUD pages and update architecture doc"
```

- [ ] **Step 14: ブランチ全体の最終確認**

```bash
pnpm test
pnpm lint
pnpm typecheck
git status --short
```

Expected: テスト・lint・型がすべて PASS。`git status` は clean（`next dev` が書き戻した `AGENTS.md` の差分があれば、それもコミットに含める）。

---

## 実装後の確認

計画のすべてのタスクが終わったら、`superpowers:requesting-code-review` でレビューを依頼し、その後 `superpowers:finishing-a-development-branch` で統合方法を決める。

## 意図的に作らないもの

次は今回のスコープ外。混同して作り込まないこと。

- エントリー登録・組み合わせ作成・結果入力の画面（`entries` / `matchingConfig` / `results` への書き込み）
- `DOUBLE_ELIMINATION_*` と `ROUND_ROBIN` のブラケット描画（`features/bracket` の拡張が要る）
- 削除でできた `order` の欠番の詰め直し（表示は order 昇順で並べるだけなので崩れない）
- ドラッグ&ドロップによる並べ替え（↑↓ で足りる）
- 部門の複製・テンプレート
