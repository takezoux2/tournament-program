# Organization メンバー管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 組織メンバー（Member）の一覧・追加・削除を行う `/orgs/[slug]/members` 画面を、`member.*` 権限で保護して新設する。

**Architecture:** 既存の `features/organization-user` と同じ垂直スライス（schema/handler/repository + Effect によるエラー写像）を `features/member` に作る。権限は `member.view` / `member.add` / `member.remove` を PERMISSION_CODES と Permission マスタに追加し、ページと Server Action の両方で `requirePermission` を呼ぶ。

**Tech Stack:** Next.js (App Router, Server Actions), Prisma (PostgreSQL), Effect, Zod, CASL, Vitest + Testing Library, Biome。

**Spec:** `docs/superpowers/specs/2026-09-04-organization-member-crud-design.md`

## Global Constraints

- パッケージ管理は `pnpm`。テストは `pnpm test <path>`（vitest）で実行する
- 新規 worktree では `pnpm exec next typegen` を先に実行しないと `pnpm typecheck` が `PageProps` で失敗する
- コミット前に `pnpm exec biome check --write <files>` で整形する（プロジェクトは biome を使用）
- Server Action の冒頭で必ず `requirePermission` を呼ぶ（ページで確認済みでも独立に呼ぶ）
- 所有権チェックは `where` に `organizationId` を入れる（`deleteMany` で 0 件判定）
- `features/member` から他の同列スライス（`features/organization` 等）へ import しない
- エラー文言（コピーはこの通りに使う）:
  - メンバー不在: `該当するメンバーが見つかりません`
  - 参加記録あり: `大会への参加記録があるため削除できません`
  - 想定外: `処理に失敗しました。時間をおいて再度お試しください`
  - 0 件表示: `この組織に登録されているメンバーはいません`

---

### Task 1: member.* 権限コードと migration

**Files:**
- Modify: `src/shared/authz/ability.ts:11-21`（PERMISSION_CODES に 3 コード追加）
- Create: `prisma/migrations/<timestamp>_add_member_permissions/migration.sql`

**Interfaces:**
- Produces: `PermissionCode` 型に `"member.view" | "member.add" | "member.remove"` が加わる。後続タスクは `requirePermission(slug, "member.view")` 等で使う。

- [ ] **Step 1: PERMISSION_CODES に member.* を追加**

`src/shared/authz/ability.ts` の配列を次のように変更（`user.grant` の直後に挿入）:

```typescript
export const PERMISSION_CODES = [
  "user.view",
  "user.add",
  "user.remove",
  "user.grant",
  "member.view",
  "member.add",
  "member.remove",
  "tournament.create",
  "tournament.edit",
  "tournament.delete",
  "org.edit",
  "org.delete",
] as const;
```

- [ ] **Step 2: 既存テストが通ることを確認**

Run: `pnpm test src/shared/authz/ability.test.ts`
Expected: PASS（既存テストは PERMISSION_CODES をループで検証しており、追加してもすべて `<subject>.<action>` 形式なので通る）

- [ ] **Step 3: migration ファイルを作成（--create-only）**

Run: `pnpm exec prisma migrate dev --create-only --name add_member_permissions`
Expected: `prisma/migrations/<timestamp>_add_member_permissions/migration.sql` に空ファイルが作られる（schema.prisma は変更していないため差分なし）

- [ ] **Step 4: migration.sql にシードを書く**

作成された `migration.sql` に以下を書く:

```sql
-- Seed: member.* 権限を追加する。shared/authz/ability.ts の PERMISSION_CODES と対応させる。
INSERT INTO "Permission" ("code", "description") VALUES
  ('member.view', '組織メンバーの閲覧'),
  ('member.add', '組織メンバーの追加'),
  ('member.remove', '組織メンバーの削除');

-- 既存の所属ユーザー全員に新権限を付与する（新機能で誰もアクセスできない状態を防ぐ。
-- role 撤廃時の migration と同じ方針）
INSERT INTO "OrganizationUserPermission" ("organizationId", "userId", "permissionId")
SELECT ou."organizationId", ou."userId", p."id"
FROM "OrganizationUser" AS ou
CROSS JOIN "Permission" AS p
WHERE p."code" IN ('member.view', 'member.add', 'member.remove');
```

- [ ] **Step 5: migration を適用**

Run: `pnpm exec prisma migrate dev`
Expected: `add_member_permissions` が applied になる（エラーなし）

なお組織の新規作成者は `src/features/organization/create/repository.ts` が Permission 全件を引いて付与するため、追加コードも自動で付与される（変更不要）。

- [ ] **Step 6: Commit**

```bash
git add src/shared/authz/ability.ts prisma/migrations
git commit -m "feat(member): add member.* permission codes and seed migration"
```

---

### Task 2: features/member 共通基盤（errors / messages / state / effect-to-form-state）

**Files:**
- Create: `src/features/member/errors.ts`
- Create: `src/features/member/errors.test.ts`
- Create: `src/features/member/messages.ts`
- Create: `src/features/member/messages.test.ts`
- Create: `src/features/member/state.ts`
- Create: `src/features/member/effect-to-form-state.ts`
- Create: `src/features/member/effect-to-form-state.test.ts`

**Interfaces:**
- Produces:
  - `MemberNotFound`（`{ memberId: string }`）/ `MemberHasParticipants`（`{ memberId: string }`）/ `UnexpectedMemberError`（`{ reason: unknown }`）と合併型 `MemberError`
  - `toMemberError(reason: unknown, memberId: string): MemberError`（P2003 → MemberHasParticipants）
  - `memberErrorMessage(error: MemberError): string`
  - `MemberFormState = { error: string | null }` / `INITIAL_MEMBER_FORM_STATE` / `MemberFormAction`
  - `memberErrorFormState(cause: Cause.Cause<MemberError>): MemberFormState`

- [ ] **Step 1: errors のテストを書く**

`src/features/member/errors.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { toMemberError } from "./errors";

const knownError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("boom", {
    code,
    clientVersion: "test",
  });

describe("toMemberError", () => {
  it("P2003（外部キー違反）は参加記録ありに写す", () => {
    // Member を参照するのは Participant だけなので、削除時の FK 違反は
    // 「大会に参加記録がある」ことを意味する。
    const error = toMemberError(knownError("P2003"), "m1");

    expect(error._tag).toBe("MemberHasParticipants");
  });

  it("その他の Prisma エラーは想定外に写す", () => {
    const error = toMemberError(knownError("P2002"), "m1");

    expect(error._tag).toBe("UnexpectedMemberError");
  });

  it("Prisma 以外の例外も想定外に写す", () => {
    const error = toMemberError(new Error("network"), "m1");

    expect(error._tag).toBe("UnexpectedMemberError");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test src/features/member/errors.test.ts`
Expected: FAIL（`./errors` が存在しない）

- [ ] **Step 3: errors.ts を実装**

`src/features/member/errors.ts`:

```typescript
import { Data } from "effect";
import { Prisma } from "@/generated/prisma/client";

/** 対象メンバーがこの組織に居ない（他組織の ID・削除済み ID を含む）。 */
export class MemberNotFound extends Data.TaggedError("MemberNotFound")<{
  readonly memberId: string;
}> {}

/**
 * 大会への参加記録（Participant）が残っている。Participant → Member は
 * onDelete: Restrict なので、削除は FK 違反で止まる。
 */
export class MemberHasParticipants extends Data.TaggedError(
  "MemberHasParticipants",
)<{
  readonly memberId: string;
}> {}

export class UnexpectedMemberError extends Data.TaggedError(
  "UnexpectedMemberError",
)<{
  // Error が持つ cause と名前が衝突しないよう reason にしている。
  readonly reason: unknown;
}> {}

export type MemberError =
  | MemberNotFound
  | MemberHasParticipants
  | UnexpectedMemberError;

/**
 * Prisma の例外をドメインのエラーに写像する。ここで写像しておくことで、
 * usecase より上の層に Prisma の型が漏れない。
 */
export const toMemberError = (
  reason: unknown,
  memberId: string,
): MemberError => {
  if (reason instanceof Prisma.PrismaClientKnownRequestError) {
    if (reason.code === "P2003") {
      // Member を参照する外部キーは Participant だけ。
      return new MemberHasParticipants({ memberId });
    }
  }
  return new UnexpectedMemberError({ reason });
};
```

- [ ] **Step 4: errors のテストが通ることを確認**

Run: `pnpm test src/features/member/errors.test.ts`
Expected: PASS（3 件）

- [ ] **Step 5: messages のテストを書く**

`src/features/member/messages.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  MemberHasParticipants,
  MemberNotFound,
  UnexpectedMemberError,
} from "./errors";
import { memberErrorMessage } from "./messages";

describe("memberErrorMessage", () => {
  it("メンバー不在の文言", () => {
    expect(memberErrorMessage(new MemberNotFound({ memberId: "m1" }))).toBe(
      "該当するメンバーが見つかりません",
    );
  });

  it("参加記録ありの文言", () => {
    expect(
      memberErrorMessage(new MemberHasParticipants({ memberId: "m1" })),
    ).toBe("大会への参加記録があるため削除できません");
  });

  it("想定外の文言", () => {
    expect(
      memberErrorMessage(new UnexpectedMemberError({ reason: "boom" })),
    ).toBe("処理に失敗しました。時間をおいて再度お試しください");
  });
});
```

- [ ] **Step 6: テストが失敗することを確認**

Run: `pnpm test src/features/member/messages.test.ts`
Expected: FAIL（`./messages` が存在しない）

- [ ] **Step 7: messages.ts を実装**

`src/features/member/messages.ts`:

```typescript
import { Match } from "effect";
import type { MemberError } from "./errors";

/**
 * Match.exhaustive により、MemberError にタグを足したのにここへ
 * 文言を足し忘れるとコンパイルエラーになる。
 */
export const memberErrorMessage: (error: MemberError) => string =
  Match.type<MemberError>().pipe(
    Match.tag("MemberNotFound", () => "該当するメンバーが見つかりません"),
    Match.tag(
      "MemberHasParticipants",
      () => "大会への参加記録があるため削除できません",
    ),
    Match.tag(
      "UnexpectedMemberError",
      () => "処理に失敗しました。時間をおいて再度お試しください",
    ),
    Match.exhaustive,
  );
```

- [ ] **Step 8: messages のテストが通ることを確認**

Run: `pnpm test src/features/member/messages.test.ts`
Expected: PASS（3 件）

- [ ] **Step 9: state.ts を実装（型のみ、テスト不要）**

`src/features/member/state.ts`:

```typescript
/**
 * メンバーのフォームが Server Action から受け取る状態。
 * handler（features）とフォーム（components）の両方が参照するため、
 * どちらからも依存できる features 直下に置く。
 */
export type MemberFormState = {
  error: string | null;
};

export const INITIAL_MEMBER_FORM_STATE: MemberFormState = {
  error: null,
};

export type MemberFormAction = (
  state: MemberFormState,
  formData: FormData,
) => Promise<MemberFormState>;
```

- [ ] **Step 10: effect-to-form-state のテストを書く**

`src/features/member/effect-to-form-state.test.ts`:

```typescript
import { Cause } from "effect";
import { describe, expect, it } from "vitest";
import { memberErrorFormState } from "./effect-to-form-state";
import { MemberNotFound } from "./errors";

describe("memberErrorFormState", () => {
  it("失敗は文言に写す", () => {
    const cause = Cause.fail(new MemberNotFound({ memberId: "m1" }));

    expect(memberErrorFormState(cause)).toEqual({
      error: "該当するメンバーが見つかりません",
    });
  });

  it("die などの失敗以外はフォールバック文言にする", () => {
    const cause = Cause.die(new Error("boom"));

    expect(memberErrorFormState(cause)).toEqual({
      error: "処理に失敗しました。時間をおいて再度お試しください",
    });
  });
});
```

- [ ] **Step 11: テストが失敗することを確認**

Run: `pnpm test src/features/member/effect-to-form-state.test.ts`
Expected: FAIL（`./effect-to-form-state` が存在しない）

- [ ] **Step 12: effect-to-form-state.ts を実装**

`src/features/member/effect-to-form-state.ts`:

```typescript
import { Cause, Option } from "effect";
import type { MemberError } from "./errors";
import { memberErrorMessage } from "./messages";
import type { MemberFormState } from "./state";

const FALLBACK_MESSAGE = "処理に失敗しました。時間をおいて再度お試しください";

/** add / remove の両スライスが同じ変換を持つのを避けるため、共有先として直下に置く。 */
export const memberErrorFormState = (
  cause: Cause.Cause<MemberError>,
): MemberFormState => {
  const failure = Cause.failureOption(cause);
  return {
    error: Option.isSome(failure)
      ? memberErrorMessage(failure.value)
      : FALLBACK_MESSAGE,
  };
};
```

- [ ] **Step 13: テストが通ることを確認**

Run: `pnpm test src/features/member`
Expected: PASS（errors 3 件 + messages 3 件 + effect-to-form-state 2 件）

- [ ] **Step 14: 整形して Commit**

```bash
pnpm exec biome check --write src/features/member
git add src/features/member
git commit -m "feat(member): add member feature error/message/form-state foundation"
```

---

### Task 3: 一覧 repository

**Files:**
- Create: `src/features/member/repository.ts`
- Create: `src/features/member/repository.test.ts`

**Interfaces:**
- Produces: `MemberSummary = { id: string; name: string; nameKana: string }` と `listMembersInOrganization(organizationId: string): Promise<MemberSummary[]>`

同名の関数が `src/features/organization/repository.ts` にもある（部門エントリーの選択肢用）が、同列スライス依存の禁止によりそちらは import せず、`features/member` に自前で持つ。

- [ ] **Step 1: テストを書く**

`src/features/member/repository.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

const findMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    member: { findMany: (args: unknown) => findMany(args) },
  },
}));

const { listMembersInOrganization } = await import("./repository");

describe("listMembersInOrganization", () => {
  it("organizationId で絞り、読み順で返す", async () => {
    // organizationId を落とすと他組織のメンバーまで見えてしまう。
    const members = [{ id: "m1", name: "竹添", nameKana: "たけぞえ" }];
    findMany.mockResolvedValue(members);

    const result = await listMembersInOrganization("o1");

    expect(findMany).toHaveBeenCalledWith({
      where: { organizationId: "o1" },
      orderBy: { nameKana: "asc" },
      select: { id: true, name: true, nameKana: true },
    });
    expect(result).toEqual(members);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test src/features/member/repository.test.ts`
Expected: FAIL（`./repository` が存在しない）

- [ ] **Step 3: repository.ts を実装**

`src/features/member/repository.ts`:

```typescript
import "server-only";
import { prisma } from "@/shared/db/prisma";

export type MemberSummary = {
  id: string;
  name: string;
  nameKana: string;
};

/**
 * 組織のメンバーを読み順で返す。
 * Member は組織スコープなので、organizationId が絞り込みの境界そのものになる。
 */
export const listMembersInOrganization = (
  organizationId: string,
): Promise<MemberSummary[]> =>
  prisma.member.findMany({
    where: { organizationId },
    orderBy: { nameKana: "asc" },
    select: { id: true, name: true, nameKana: true },
  });
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test src/features/member/repository.test.ts`
Expected: PASS（1 件）

- [ ] **Step 5: 整形して Commit**

```bash
pnpm exec biome check --write src/features/member
git add src/features/member/repository.ts src/features/member/repository.test.ts
git commit -m "feat(member): add member list repository"
```

---

### Task 4: 追加スライス（add）

**Files:**
- Create: `src/features/member/add/schema.ts`
- Create: `src/features/member/add/schema.test.ts`
- Create: `src/features/member/add/repository.ts`
- Create: `src/features/member/add/repository.test.ts`
- Create: `src/features/member/add/handler.ts`
- Create: `src/features/member/add/handler.test.ts`

**Interfaces:**
- Consumes: Task 2 の `MemberError` / `UnexpectedMemberError` / `memberErrorFormState` / `MemberFormState`
- Produces:
  - `addMemberSchema`（`{ name: string; nameKana: string }`、trim + 1〜100 文字）と `AddMemberInput`
  - `AddMemberPort = (input: AddMemberInput & { organizationId: string }) => Effect.Effect<void, MemberError>` と実装 `addMemberInDb`
  - Server Action `addMemberAction(prevState, formData): Promise<MemberFormState>`（form fields: `slug`, `name`, `nameKana`）

usecase 層は置かない（引数の受け渡し以外にドメインの判断が無いため。`features/division/add-entry` と同じ構成）。

- [ ] **Step 1: schema のテストを書く**

`src/features/member/add/schema.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { addMemberSchema } from "./schema";

describe("addMemberSchema", () => {
  it("前後の空白を落として受け付ける", () => {
    const parsed = addMemberSchema.safeParse({
      name: " 竹添 ",
      nameKana: " たけぞえ ",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({ name: "竹添", nameKana: "たけぞえ" });
    }
  });

  it("氏名が空白のみならエラー", () => {
    const parsed = addMemberSchema.safeParse({
      name: "  ",
      nameKana: "たけぞえ",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe("氏名を入力してください");
    }
  });

  it("かなが空ならエラー", () => {
    const parsed = addMemberSchema.safeParse({ name: "竹添", nameKana: "" });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe(
        "氏名（かな）を入力してください",
      );
    }
  });

  it("101 文字はエラー", () => {
    const parsed = addMemberSchema.safeParse({
      name: "あ".repeat(101),
      nameKana: "たけぞえ",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe(
        "氏名は100文字以内で入力してください",
      );
    }
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test src/features/member/add/schema.test.ts`
Expected: FAIL（`./schema` が存在しない）

- [ ] **Step 3: schema.ts を実装**

`src/features/member/add/schema.ts`（`features/division/add-entry/schema.ts` の trimmedName と同じ作り）:

```typescript
import { z } from "zod";

const trimmedName = (label: string) =>
  z
    .string()
    .transform((raw) => raw.trim())
    .pipe(
      z
        .string()
        .min(1, `${label}を入力してください`)
        .max(100, `${label}は100文字以内で入力してください`),
    );

export const addMemberSchema = z.object({
  name: trimmedName("氏名"),
  nameKana: trimmedName("氏名（かな）"),
});

export type AddMemberInput = z.infer<typeof addMemberSchema>;
```

- [ ] **Step 4: schema のテストが通ることを確認**

Run: `pnpm test src/features/member/add/schema.test.ts`
Expected: PASS（4 件）

- [ ] **Step 5: repository のテストを書く**

`src/features/member/add/repository.test.ts`:

```typescript
import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";

const create = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    member: { create: (args: unknown) => create(args) },
  },
}));

const { addMemberInDb } = await import("./repository");

describe("addMemberInDb", () => {
  beforeEach(() => {
    create.mockReset();
  });

  it("organizationId 付きでメンバーを作る", async () => {
    create.mockResolvedValue({ id: "m1" });

    const exit = await Effect.runPromiseExit(
      addMemberInDb({
        name: "竹添",
        nameKana: "たけぞえ",
        organizationId: "o1",
      }),
    );

    expect(create).toHaveBeenCalledWith({
      data: { organizationId: "o1", name: "竹添", nameKana: "たけぞえ" },
      select: { id: true },
    });
    expect(Exit.isSuccess(exit)).toBe(true);
  });

  it("例外は UnexpectedMemberError に写す", async () => {
    create.mockRejectedValue(new Error("network"));

    const exit = await Effect.runPromiseExit(
      addMemberInDb({
        name: "竹添",
        nameKana: "たけぞえ",
        organizationId: "o1",
      }),
    );

    expect(failureTag(exit)).toBe("UnexpectedMemberError");
  });
});
```

- [ ] **Step 6: テストが失敗することを確認**

Run: `pnpm test src/features/member/add/repository.test.ts`
Expected: FAIL（`./repository` が存在しない）

- [ ] **Step 7: repository.ts を実装**

`src/features/member/add/repository.ts`:

```typescript
import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type MemberError, UnexpectedMemberError } from "../errors";
import type { AddMemberInput } from "./schema";

export type AddMemberPort = (
  input: AddMemberInput & { organizationId: string },
) => Effect.Effect<void, MemberError>;

export const addMemberInDb: AddMemberPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      // Member に一意制約は無いため衝突エラーは起きない。実在の同姓同名を
      // 排除できないので、重複チェックは意図的にしない（設計どおり）。
      await prisma.member.create({
        data: {
          organizationId: input.organizationId,
          name: input.name,
          nameKana: input.nameKana,
        },
        select: { id: true },
      });
    },
    catch: (reason) => new UnexpectedMemberError({ reason }),
  });
```

- [ ] **Step 8: repository のテストが通ることを確認**

Run: `pnpm test src/features/member/add/repository.test.ts`
Expected: PASS（2 件）

- [ ] **Step 9: handler のテストを書く**

`src/features/member/add/handler.test.ts`:

```typescript
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermission = vi.fn();
const addMemberInDb = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/shared/middleware/require-organization", () => ({
  requirePermission: (slug: string, code: string) =>
    requirePermission(slug, code),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

vi.mock("./repository", () => ({
  addMemberInDb: (input: unknown) => addMemberInDb(input),
}));

const { addMemberAction } = await import("./handler");

const formData = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
};

const initial = { error: null };

describe("addMemberAction", () => {
  beforeEach(() => {
    requirePermission.mockReset();
    addMemberInDb.mockReset();
    revalidatePath.mockReset();
    requirePermission.mockResolvedValue({
      organization: { id: "o1", slug: "tennis" },
    });
    // AddMemberPort は Effect を返す契約なので、素の Promise を返すモックだと
    // Effect.runPromiseExit が "Not a valid effect" で die してしまう。
    addMemberInDb.mockImplementation(() => Effect.void);
  });

  it("member.add を要求する", async () => {
    await addMemberAction(
      initial,
      formData({ slug: "tennis", name: "竹添", nameKana: "たけぞえ" }),
    );

    expect(requirePermission).toHaveBeenCalledWith("tennis", "member.add");
  });

  it("URL の slug ではなく organization.id で作る", async () => {
    await addMemberAction(
      initial,
      formData({ slug: "tennis", name: "竹添", nameKana: "たけぞえ" }),
    );

    expect(addMemberInDb).toHaveBeenCalledWith({
      name: "竹添",
      nameKana: "たけぞえ",
      organizationId: "o1",
    });
  });

  it("追加できたら一覧を再検証する", async () => {
    const state = await addMemberAction(
      initial,
      formData({ slug: "tennis", name: "竹添", nameKana: "たけぞえ" }),
    );

    expect(state).toEqual({ error: null });
    expect(revalidatePath).toHaveBeenCalledWith("/orgs/tennis/members");
  });

  it("氏名が空ならバリデーションエラーを返し、DB を触らない", async () => {
    const state = await addMemberAction(
      initial,
      formData({ slug: "tennis", name: " ", nameKana: "たけぞえ" }),
    );

    expect(state.error).toBe("氏名を入力してください");
    expect(addMemberInDb).not.toHaveBeenCalled();
  });

  it("権限が無ければ requirePermission の時点で打ち切られ、DB を触らない", async () => {
    requirePermission.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(
      addMemberAction(
        initial,
        formData({ slug: "tennis", name: "竹添", nameKana: "たけぞえ" }),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(addMemberInDb).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 10: テストが失敗することを確認**

Run: `pnpm test src/features/member/add/handler.test.ts`
Expected: FAIL（`./handler` が存在しない）

- [ ] **Step 11: handler.ts を実装**

`src/features/member/add/handler.ts`:

```typescript
"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/shared/middleware/require-organization";
import { memberErrorFormState } from "../effect-to-form-state";
import type { MemberFormState } from "../state";
import { addMemberInDb } from "./repository";
import { addMemberSchema } from "./schema";

export const addMemberAction = async (
  _prevState: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const { organization } = await requirePermission(slug, "member.add");

  const parsed = addMemberSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    nameKana: String(formData.get("nameKana") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    addMemberInDb({ ...parsed.data, organizationId: organization.id }),
  );

  if (Exit.isFailure(exit)) {
    return memberErrorFormState(exit.cause);
  }

  // 追加は即時反映。一覧を描き直したいだけなので redirect はしない。
  revalidatePath(`/orgs/${slug}/members`);
  return { error: null };
};
```

- [ ] **Step 12: テストが通ることを確認**

Run: `pnpm test src/features/member/add`
Expected: PASS（schema 4 件 + repository 2 件 + handler 5 件）

- [ ] **Step 13: 整形して Commit**

```bash
pnpm exec biome check --write src/features/member
git add src/features/member/add
git commit -m "feat(member): add member-add slice (schema/repository/handler)"
```

---

### Task 5: 削除スライス（remove）

**Files:**
- Create: `src/features/member/remove/schema.ts`
- Create: `src/features/member/remove/repository.ts`
- Create: `src/features/member/remove/repository.test.ts`
- Create: `src/features/member/remove/handler.ts`
- Create: `src/features/member/remove/handler.test.ts`

**Interfaces:**
- Consumes: Task 2 の `MemberError` / `MemberNotFound` / `toMemberError` / `memberErrorFormState` / `MemberFormState`
- Produces:
  - `removeMemberSchema`（`{ memberId: string }`）と `RemoveMemberInput`
  - `RemoveMemberPort = (input: { memberId: string; organizationId: string }) => Effect.Effect<{ removed: number }, MemberError>` と実装 `removeMemberInDb`
  - Server Action `removeMemberAction(prevState, formData): Promise<MemberFormState>`（form fields: `slug`, `memberId`)

参加記録ありの検出は事前クエリではなく FK（onDelete: Restrict）違反の P2003 を `toMemberError` で写す。削除と判定が原子的になり、レースも起きない。

- [ ] **Step 1: schema.ts を実装（テスト不要の単純な形）**

`src/features/member/remove/schema.ts`:

```typescript
import { z } from "zod";

export const removeMemberSchema = z.object({
  memberId: z.string().min(1, "削除するメンバーを選んでください"),
});

export type RemoveMemberInput = z.infer<typeof removeMemberSchema>;
```

- [ ] **Step 2: repository のテストを書く**

`src/features/member/remove/repository.test.ts`:

```typescript
import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { failureTag } from "@/shared/testing/exit";

const deleteMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    member: { deleteMany: (args: unknown) => deleteMany(args) },
  },
}));

const { removeMemberInDb } = await import("./repository");

describe("removeMemberInDb", () => {
  beforeEach(() => {
    deleteMany.mockReset();
  });

  it("organizationId と id の両方を where に含めて消す", async () => {
    // memberId だけで消すと、他組織のメンバーまで巻き添えで消える。
    deleteMany.mockResolvedValue({ count: 1 });

    const exit = await Effect.runPromiseExit(
      removeMemberInDb({ memberId: "m1", organizationId: "o1" }),
    );

    expect(deleteMany).toHaveBeenCalledWith({
      where: { organizationId: "o1", id: "m1" },
    });
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ removed: 1 });
    }
  });

  it("0 件でもエラーにせず件数として返す（不在判定は handler の仕事）", async () => {
    deleteMany.mockResolvedValue({ count: 0 });

    const exit = await Effect.runPromiseExit(
      removeMemberInDb({ memberId: "m1", organizationId: "o1" }),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ removed: 0 });
    }
  });

  it("FK 違反（参加記録あり）は MemberHasParticipants に写す", async () => {
    // Participant → Member は onDelete: Restrict。削除と判定を分けると
    // 間にエントリーが入るレースがあるため、FK に判定させる。
    deleteMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("fk", {
        code: "P2003",
        clientVersion: "test",
      }),
    );

    const exit = await Effect.runPromiseExit(
      removeMemberInDb({ memberId: "m1", organizationId: "o1" }),
    );

    expect(failureTag(exit)).toBe("MemberHasParticipants");
  });

  it("その他の例外は UnexpectedMemberError に写す", async () => {
    deleteMany.mockRejectedValue(new Error("network"));

    const exit = await Effect.runPromiseExit(
      removeMemberInDb({ memberId: "m1", organizationId: "o1" }),
    );

    expect(failureTag(exit)).toBe("UnexpectedMemberError");
  });
});
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `pnpm test src/features/member/remove/repository.test.ts`
Expected: FAIL（`./repository` が存在しない）

- [ ] **Step 4: repository.ts を実装**

`src/features/member/remove/repository.ts`:

```typescript
import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type MemberError, toMemberError } from "../errors";

export type RemoveMemberPort = (input: {
  memberId: string;
  organizationId: string;
}) => Effect.Effect<{ removed: number }, MemberError>;

/**
 * 参加記録の有無は事前に数えず、FK（onDelete: Restrict）の P2003 を
 * toMemberError で MemberHasParticipants に写す。削除と判定が原子的になる。
 */
export const removeMemberInDb: RemoveMemberPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      // deleteMany を使うのは、所有権を where に残したまま件数を取るため。
      const result = await prisma.member.deleteMany({
        where: { organizationId: input.organizationId, id: input.memberId },
      });
      return { removed: result.count };
    },
    catch: (reason) => toMemberError(reason, input.memberId),
  });
```

- [ ] **Step 5: repository のテストが通ることを確認**

Run: `pnpm test src/features/member/remove/repository.test.ts`
Expected: PASS(4 件)

- [ ] **Step 6: handler のテストを書く**

`src/features/member/remove/handler.test.ts`:

```typescript
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermission = vi.fn();
const removeMemberInDb = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/shared/middleware/require-organization", () => ({
  requirePermission: (slug: string, code: string) =>
    requirePermission(slug, code),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

vi.mock("./repository", () => ({
  removeMemberInDb: (input: unknown) => removeMemberInDb(input),
}));

const { removeMemberAction } = await import("./handler");

const formData = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
};

const initial = { error: null };

describe("removeMemberAction", () => {
  beforeEach(() => {
    requirePermission.mockReset();
    removeMemberInDb.mockReset();
    revalidatePath.mockReset();
    requirePermission.mockResolvedValue({
      organization: { id: "o1", slug: "tennis" },
    });
    removeMemberInDb.mockImplementation(() => Effect.succeed({ removed: 1 }));
  });

  it("member.remove を要求する", async () => {
    await removeMemberAction(
      initial,
      formData({ slug: "tennis", memberId: "m1" }),
    );

    expect(requirePermission).toHaveBeenCalledWith("tennis", "member.remove");
  });

  it("URL の slug ではなく organization.id で絞って消す", async () => {
    await removeMemberAction(
      initial,
      formData({ slug: "tennis", memberId: "m1" }),
    );

    expect(removeMemberInDb).toHaveBeenCalledWith({
      memberId: "m1",
      organizationId: "o1",
    });
  });

  it("削除できたら一覧を再検証する", async () => {
    const state = await removeMemberAction(
      initial,
      formData({ slug: "tennis", memberId: "m1" }),
    );

    expect(state).toEqual({ error: null });
    expect(revalidatePath).toHaveBeenCalledWith("/orgs/tennis/members");
  });

  it("0 件（表示後に消えた・他組織の ID）は不在エラーを返す", async () => {
    removeMemberInDb.mockImplementation(() => Effect.succeed({ removed: 0 }));

    const state = await removeMemberAction(
      initial,
      formData({ slug: "tennis", memberId: "m1" }),
    );

    expect(state.error).toBe("該当するメンバーが見つかりません");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("参加記録ありは文言にして返す", async () => {
    const { MemberHasParticipants } = await import("../errors");
    removeMemberInDb.mockImplementation(() =>
      Effect.fail(new MemberHasParticipants({ memberId: "m1" })),
    );

    const state = await removeMemberAction(
      initial,
      formData({ slug: "tennis", memberId: "m1" }),
    );

    expect(state.error).toBe("大会への参加記録があるため削除できません");
  });

  it("権限が無ければ requirePermission の時点で打ち切られ、DB を触らない", async () => {
    requirePermission.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(
      removeMemberAction(initial, formData({ slug: "tennis", memberId: "m1" })),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(removeMemberInDb).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: テストが失敗することを確認**

Run: `pnpm test src/features/member/remove/handler.test.ts`
Expected: FAIL（`./handler` が存在しない）

- [ ] **Step 8: handler.ts を実装**

`src/features/member/remove/handler.ts`:

```typescript
"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/shared/middleware/require-organization";
import { memberErrorFormState } from "../effect-to-form-state";
import { MemberNotFound } from "../errors";
import { memberErrorMessage } from "../messages";
import type { MemberFormState } from "../state";
import { removeMemberInDb } from "./repository";
import { removeMemberSchema } from "./schema";

export const removeMemberAction = async (
  _prevState: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> => {
  const slug = String(formData.get("slug") ?? "");
  // 一覧でボタンを隠していても Server Action は直接叩ける。境界はここ。
  const { organization } = await requirePermission(slug, "member.remove");

  const parsed = removeMemberSchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    removeMemberInDb({
      memberId: parsed.data.memberId,
      organizationId: organization.id,
    }),
  );

  if (Exit.isFailure(exit)) {
    return memberErrorFormState(exit.cause);
  }

  // 0 件は一覧表示後にメンバーが消えたか、他組織の ID を渡されたことを意味する。
  // Member はこの画面の外（部門エントリー）からも消え得るため、404 ではなく
  // 行内のエラー文言として返す。
  if (exit.value.removed === 0) {
    return {
      error: memberErrorMessage(
        new MemberNotFound({ memberId: parsed.data.memberId }),
      ),
    };
  }

  revalidatePath(`/orgs/${slug}/members`);
  return { error: null };
};
```

- [ ] **Step 9: テストが通ることを確認**

Run: `pnpm test src/features/member/remove`
Expected: PASS（repository 4 件 + handler 6 件）

- [ ] **Step 10: 整形して Commit**

```bash
pnpm exec biome check --write src/features/member
git add src/features/member/remove
git commit -m "feat(member): add member-remove slice with participant guard"
```

---

### Task 6: コンポーネント（AddMemberForm / MemberList）

**Files:**
- Create: `src/components/member/AddMemberForm.tsx`
- Create: `src/components/member/AddMemberForm.test.tsx`
- Create: `src/components/member/MemberList.tsx`
- Create: `src/components/member/MemberList.test.tsx`

**Interfaces:**
- Consumes: Task 2 の `INITIAL_MEMBER_FORM_STATE` / `MemberFormAction`、Task 3 の `MemberSummary`
- Produces:
  - `AddMemberForm({ slug, addAction }: { slug: string; addAction: MemberFormAction })`
  - `MemberList({ slug, members, canRemove, removeAction }: { slug: string; members: MemberSummary[]; canRemove: boolean; removeAction: MemberFormAction })`

- [ ] **Step 1: AddMemberForm のテストを書く**

`src/components/member/AddMemberForm.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AddMemberForm } from "./AddMemberForm";

describe("AddMemberForm", () => {
  it("氏名とかなの入力欄と追加ボタンを出す", () => {
    render(<AddMemberForm slug="tennis" addAction={vi.fn()} />);

    expect(screen.getByLabelText("氏名")).toBeInTheDocument();
    expect(screen.getByLabelText("氏名（かな）")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "追加" })).toBeInTheDocument();
  });

  it("送信すると slug と入力値がアクションへ渡る", async () => {
    const addAction = vi.fn(async (_state, formData: FormData) => {
      expect(formData.get("slug")).toBe("tennis");
      expect(formData.get("name")).toBe("竹添");
      expect(formData.get("nameKana")).toBe("たけぞえ");
      return { error: null };
    });
    const user = userEvent.setup();
    render(<AddMemberForm slug="tennis" addAction={addAction} />);

    await user.type(screen.getByLabelText("氏名"), "竹添");
    await user.type(screen.getByLabelText("氏名（かな）"), "たけぞえ");
    await user.click(screen.getByRole("button", { name: "追加" }));

    expect(addAction).toHaveBeenCalled();
  });

  it("アクションがエラーを返したら表示する", async () => {
    const addAction = vi.fn(async () => ({
      error: "氏名を入力してください",
    }));
    const user = userEvent.setup();
    render(<AddMemberForm slug="tennis" addAction={addAction} />);

    await user.click(screen.getByRole("button", { name: "追加" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "氏名を入力してください",
    );
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test src/components/member/AddMemberForm.test.tsx`
Expected: FAIL（`./AddMemberForm` が存在しない）

- [ ] **Step 3: AddMemberForm.tsx を実装**

`src/components/member/AddMemberForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import {
  INITIAL_MEMBER_FORM_STATE,
  type MemberFormAction,
} from "@/features/member/state";

export function AddMemberForm({
  slug,
  addAction,
}: {
  slug: string;
  addAction: MemberFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    addAction,
    INITIAL_MEMBER_FORM_STATE,
  );

  return (
    <section className="space-y-3 rounded border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-bold text-slate-700">メンバーを追加</h2>

      <form action={formAction} className="space-y-2">
        <input type="hidden" name="slug" value={slug} />

        <label
          htmlFor="member-name"
          className="block text-sm font-medium text-slate-700"
        >
          氏名
        </label>
        <input
          id="member-name"
          name="name"
          type="text"
          required
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />

        <label
          htmlFor="member-name-kana"
          className="block text-sm font-medium text-slate-700"
        >
          氏名（かな）
        </label>
        <input
          id="member-name-kana"
          name="nameKana"
          type="text"
          required
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />

        <button
          type="submit"
          disabled={pending}
          className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "追加中..." : "追加"}
        </button>

        {state.error !== null && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
      </form>
    </section>
  );
}
```

- [ ] **Step 4: AddMemberForm のテストが通ることを確認**

Run: `pnpm test src/components/member/AddMemberForm.test.tsx`
Expected: PASS（3 件）

- [ ] **Step 5: MemberList のテストを書く**

`src/components/member/MemberList.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberSummary } from "@/features/member/repository";
import { MemberList } from "./MemberList";

const removeAction = vi.fn(async () => ({ error: null }));

const members: MemberSummary[] = [
  { id: "m1", name: "竹添", nameKana: "たけぞえ" },
  { id: "m2", name: "山田", nameKana: "やまだ" },
];

const renderList = (
  overrides: Partial<Parameters<typeof MemberList>[0]> = {},
) =>
  render(
    <MemberList
      slug="tennis"
      members={members}
      canRemove={true}
      removeAction={removeAction}
      {...overrides}
    />,
  );

describe("MemberList", () => {
  beforeEach(() => {
    removeAction.mockClear();
  });

  it("メンバーの氏名とかなを出す", () => {
    renderList();

    expect(screen.getByText("竹添")).toBeInTheDocument();
    expect(screen.getByText("たけぞえ")).toBeInTheDocument();
  });

  it("canRemove が false なら削除ボタンを出さない", () => {
    renderList({ canRemove: false });

    expect(screen.queryByRole("button", { name: /削除/ })).toBeNull();
  });

  it("メンバーが 0 人なら案内を出す", () => {
    renderList({ members: [] });

    expect(
      screen.getByText("この組織に登録されているメンバーはいません"),
    ).toBeInTheDocument();
  });

  describe("削除の確認ダイアログ", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("確認をキャンセルすると削除アクションを呼ばない", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const user = userEvent.setup();
      renderList();

      await user.click(screen.getByRole("button", { name: "竹添 を削除" }));

      expect(removeAction).not.toHaveBeenCalled();
    });

    it("確認を承諾すると削除アクションを呼ぶ", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const user = userEvent.setup();
      renderList();

      await user.click(screen.getByRole("button", { name: "竹添 を削除" }));

      expect(removeAction).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 6: テストが失敗することを確認**

Run: `pnpm test src/components/member/MemberList.test.tsx`
Expected: FAIL（`./MemberList` が存在しない）

- [ ] **Step 7: MemberList.tsx を実装**

`src/components/member/MemberList.tsx`（行ごとの削除フォームは `OrganizationUserList` の RemoveUserButton と同じ作り）:

```tsx
"use client";

import { useActionState } from "react";
import type { MemberSummary } from "@/features/member/repository";
import {
  INITIAL_MEMBER_FORM_STATE,
  type MemberFormAction,
} from "@/features/member/state";

/**
 * 行ごとの削除フォーム。useActionState は 1 行に 1 つ要るため、
 * 行のコンポーネントとして切り出している。
 */
function RemoveMemberButton({
  slug,
  member,
  action,
}: {
  slug: string;
  member: MemberSummary;
  action: MemberFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_MEMBER_FORM_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="memberId" value={member.id} />
      <button
        type="submit"
        disabled={pending}
        // 確認は onSubmit ではなく onClick で挟む。キャンセル時に
        // フォームの送信自体を起こさないため。
        onClick={(event) => {
          if (
            !window.confirm(`${member.name} をこの組織から削除しますか？`)
          ) {
            event.preventDefault();
          }
        }}
        className="rounded border border-red-300 px-3 py-1 text-xs text-red-700 disabled:opacity-50"
      >
        {pending ? "削除中..." : `${member.name} を削除`}
      </button>
      {state.error !== null && (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function MemberList({
  slug,
  members,
  canRemove,
  removeAction,
}: {
  slug: string;
  members: MemberSummary[];
  canRemove: boolean;
  removeAction: MemberFormAction;
}) {
  if (members.length === 0) {
    return (
      <p className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-500">
        この組織に登録されているメンバーはいません
      </p>
    );
  }

  return (
    <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
      {members.map((member) => (
        <li key={member.id} className="flex items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">
              {member.name}
            </p>
            <p className="truncate text-xs text-slate-500">
              {member.nameKana}
            </p>
          </div>

          {/* ボタンを隠すのは体感のためで、拒否の境界は Server Action 側にある。 */}
          {canRemove && (
            <RemoveMemberButton
              slug={slug}
              member={member}
              action={removeAction}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 8: テストが通ることを確認**

Run: `pnpm test src/components/member`
Expected: PASS（AddMemberForm 3 件 + MemberList 5 件）

- [ ] **Step 9: 整形して Commit**

```bash
pnpm exec biome check --write src/components/member
git add src/components/member
git commit -m "feat(member): add member list and add-form components"
```

---

### Task 7: メンバー管理ページ

**Files:**
- Create: `src/app/orgs/[slug]/members/page.tsx`
- Create: `src/app/orgs/[slug]/members/page.test.tsx`

**Interfaces:**
- Consumes: Task 3 の `listMembersInOrganization`、Task 4 の `addMemberAction`、Task 5 の `removeMemberAction`、Task 6 の `AddMemberForm` / `MemberList`

- [ ] **Step 0: 型を生成（新規ルートのため）**

Run: `pnpm exec next typegen`
Expected: `PageProps<"/orgs/[slug]/members">` が使えるようになる

- [ ] **Step 1: ページのテストを書く**

`src/app/orgs/[slug]/members/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineAbilityFor, PERMISSION_CODES } from "@/shared/authz/ability";

vi.mock("@/components/auth/LogoutButton", () => ({
  LogoutButton: () => <button type="button">ログアウト</button>,
}));

const callOrder: string[] = [];

const requirePermission = vi.fn();
const listMembersInOrganization = vi.fn();

vi.mock("@/shared/middleware/require-organization", () => ({
  requirePermission: (slug: string, code: string) => {
    callOrder.push("requirePermission");
    return requirePermission(slug, code);
  },
}));

vi.mock("@/features/member/repository", () => ({
  listMembersInOrganization: (organizationId: string) => {
    callOrder.push("listMembersInOrganization");
    return listMembersInOrganization(organizationId);
  },
}));

// Server Action は import されるだけで、このテストでは呼ばれない。
vi.mock("@/features/member/add/handler", () => ({
  addMemberAction: vi.fn(),
}));
vi.mock("@/features/member/remove/handler", () => ({
  removeMemberAction: vi.fn(),
}));

const { default: OrganizationMembersPage } = await import("./page");

const pageProps = (slug: string) => ({
  params: Promise.resolve({ slug }),
  searchParams: Promise.resolve({}),
});

const session = { user: { id: "me", name: "竹添" } };
// id と slug をわざと異なる値にする。揃えると取り違えを見逃す。
const organization = {
  id: "o1",
  name: "テニス部",
  slug: "tennis",
  createdAt: new Date("2026-08-01T00:00:00Z"),
  updatedAt: new Date("2026-08-01T00:00:00Z"),
};

const contextWith = (codes: readonly string[]) => ({
  session,
  organization,
  permissionCodes: [...codes],
  ability: defineAbilityFor(codes),
});

const members = [{ id: "m1", name: "山田", nameKana: "やまだ" }];

describe("OrganizationMembersPage", () => {
  beforeEach(() => {
    requirePermission.mockReset();
    listMembersInOrganization.mockReset();
    callOrder.length = 0;
    requirePermission.mockResolvedValue(contextWith(PERMISSION_CODES));
    listMembersInOrganization.mockResolvedValue(members);
  });

  it("member.view を要求する", async () => {
    await OrganizationMembersPage(pageProps("tennis"));

    expect(requirePermission).toHaveBeenCalledWith("tennis", "member.view");
  });

  it("一覧は URL の slug ではなく organization.id で絞り込む", async () => {
    await OrganizationMembersPage(pageProps("tennis"));

    expect(listMembersInOrganization).toHaveBeenCalledWith("o1");
  });

  it("requirePermission を一覧取得より先に呼ぶ", async () => {
    await OrganizationMembersPage(pageProps("tennis"));

    expect(callOrder).toEqual([
      "requirePermission",
      "listMembersInOrganization",
    ]);
  });

  it("権限が無ければ(notFound)一覧取得は行わずページも失敗する", async () => {
    requirePermission.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(
      OrganizationMembersPage(pageProps("tennis")),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(listMembersInOrganization).not.toHaveBeenCalled();
  });

  it("メンバーを描画する", async () => {
    const element = await OrganizationMembersPage(pageProps("tennis"));
    render(element);

    expect(screen.getByText("山田")).toBeInTheDocument();
    expect(screen.getByText("やまだ")).toBeInTheDocument();
  });

  it("member.add を持たなければ追加フォームを出さない", async () => {
    requirePermission.mockResolvedValue(contextWith(["member.view"]));

    const element = await OrganizationMembersPage(pageProps("tennis"));
    render(element);

    expect(screen.queryByText("メンバーを追加")).toBeNull();
  });

  it("member.add を持てば追加フォームを出す", async () => {
    requirePermission.mockResolvedValue(
      contextWith(["member.view", "member.add"]),
    );

    const element = await OrganizationMembersPage(pageProps("tennis"));
    render(element);

    expect(screen.getByText("メンバーを追加")).toBeInTheDocument();
  });

  it("member.remove を持たなければ削除ボタンを出さない", async () => {
    requirePermission.mockResolvedValue(contextWith(["member.view"]));

    const element = await OrganizationMembersPage(pageProps("tennis"));
    render(element);

    expect(screen.queryByRole("button", { name: /削除/ })).toBeNull();
  });

  it("member.remove を持てば削除ボタンを出す", async () => {
    requirePermission.mockResolvedValue(
      contextWith(["member.view", "member.remove"]),
    );

    const element = await OrganizationMembersPage(pageProps("tennis"));
    render(element);

    expect(
      screen.getByRole("button", { name: "山田 を削除" }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test "src/app/orgs/[slug]/members/page.test.tsx"`
Expected: FAIL（`./page` が存在しない）

- [ ] **Step 3: page.tsx を実装**

`src/app/orgs/[slug]/members/page.tsx`:

```tsx
import { AppHeader } from "@/components/layout/AppHeader";
import { AddMemberForm } from "@/components/member/AddMemberForm";
import { MemberList } from "@/components/member/MemberList";
import { addMemberAction } from "@/features/member/add/handler";
import { removeMemberAction } from "@/features/member/remove/handler";
import { listMembersInOrganization } from "@/features/member/repository";
import { canByCode } from "@/shared/authz/ability";
import { requirePermission } from "@/shared/middleware/require-organization";

export default async function OrganizationMembersPage({
  params,
}: PageProps<"/orgs/[slug]/members">) {
  const { slug } = await params;
  const { session, organization, ability } = await requirePermission(
    slug,
    "member.view",
  );
  const members = await listMembersInOrganization(organization.id);

  // UI の出し分けは体感のためで、境界は各 Server Action の requirePermission。
  const canAdd = canByCode(ability, "member.add");
  const canRemove = canByCode(ability, "member.remove");

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        crumbs={[
          { label: "組織", href: "/" },
          { label: organization.name, href: `/orgs/${slug}` },
          { label: "メンバー" },
        ]}
        userName={session.user.name}
      />

      <div className="mx-auto max-w-2xl space-y-4 px-6 py-8">
        <h1 className="text-lg font-bold text-slate-800">メンバー</h1>

        {canAdd && <AddMemberForm slug={slug} addAction={addMemberAction} />}

        <MemberList
          slug={slug}
          members={members}
          canRemove={canRemove}
          removeAction={removeMemberAction}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test "src/app/orgs/[slug]/members/page.test.tsx"`
Expected: PASS（10 件）

- [ ] **Step 5: 整形して Commit**

```bash
pnpm exec biome check --write "src/app/orgs/[slug]/members"
git add "src/app/orgs/[slug]/members"
git commit -m "feat(member): add organization members page"
```

---

### Task 8: 組織詳細ページにリンクを追加

**Files:**
- Modify: `src/app/orgs/[slug]/page.tsx:14,32-39`（`canViewMembers` の算出と「メンバー管理」リンク）
- Modify: `src/app/orgs/[slug]/page.test.tsx`（リンク出し分けのテスト追加）

**Interfaces:**
- Consumes: Task 1 の `member.view` コード

- [ ] **Step 1: テストを追加する**

`src/app/orgs/[slug]/page.test.tsx` の describe 末尾に追加（既存の `contextWith` 相当のモック構成をそのまま使う。既存テストでは `requireOrganization` をモックしているので、そのモック変数名に合わせること）:

```tsx
  it("member.view を持てばメンバー管理へのリンクを出す", async () => {
    const element = await OrganizationPage(pageProps("tennis"));
    render(element);

    expect(
      screen.getByRole("link", { name: "メンバー管理" }),
    ).toHaveAttribute("href", "/orgs/tennis/members");
  });

  it("member.view を持たなければメンバー管理のリンクを出さない", async () => {
    requireOrganization.mockResolvedValue(contextWith(["user.view"]));

    const element = await OrganizationPage(pageProps("tennis"));
    render(element);

    expect(screen.queryByRole("link", { name: "メンバー管理" })).toBeNull();
  });
```

既存テストが `contextWith` ヘルパーを持たない場合は、`ability: defineAbilityFor([...])` を含む同等のモック値を組み立てる（既存ファイルの `requireOrganization.mockResolvedValue` の形に合わせる）。

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test "src/app/orgs/[slug]/page.test.tsx"`
Expected: FAIL（「メンバー管理」リンクが無い）

- [ ] **Step 3: page.tsx にリンクを追加**

`src/app/orgs/[slug]/page.tsx` の `canViewUsers` の下に追加:

```tsx
  const canViewMembers = canByCode(ability, "member.view");
```

「ユーザー管理」リンクの直後（同じ `flex` コンテナ内）に追加:

```tsx
            {canViewMembers && (
              <Link
                href={`/orgs/${slug}/members`}
                className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
              >
                メンバー管理
              </Link>
            )}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test "src/app/orgs/[slug]/page.test.tsx"`
Expected: PASS（既存テスト + 追加 2 件）

- [ ] **Step 5: 全体確認と Commit**

Run: `pnpm test` および `pnpm typecheck`
Expected: すべて PASS

```bash
pnpm exec biome check --write "src/app/orgs/[slug]/page.tsx" "src/app/orgs/[slug]/page.test.tsx"
git add "src/app/orgs/[slug]/page.tsx" "src/app/orgs/[slug]/page.test.tsx"
git commit -m "feat(member): link members page from organization page"
```

---

## 完了条件

- `pnpm test` が全件 PASS
- `pnpm typecheck` が PASS
- `BYPASS_AUTH=1` + Cookie `USER_ID=1` でローカル起動し、`/orgs/<slug>/members` で一覧・追加・削除（確認ダイアログ）・参加記録ありメンバーの削除エラーを目視確認
