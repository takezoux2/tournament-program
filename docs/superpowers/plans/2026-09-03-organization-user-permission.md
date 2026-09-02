# Organization ユーザー管理 + Permission 化 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 組織に所属するユーザーの一覧・追加・削除・権限編集を画面から行えるようにし、認可の仕組みを `OrganizationUser.role` から Permission テーブル + CASL に置き換える。

**Architecture:** Permission はマスタテーブル（`id` Int autoincrement、`code` unique）とし、`OrganizationUserPermission` 中間テーブルで組織ユーザーへ割り当てる。権限コードは `"<subject>.<action>"` 形式で、`shared/authz/ability.ts` が CASL の Ability に変換する。認可の境界は `requireOrganization` / `requirePermission`（`shared/middleware`）で、ページ冒頭と Server Action 冒頭の両方で独立に呼ぶ。機能コードは既存の垂直スライス構成（`schema` / `handler` / `usecase` / `repository`）に従い `src/features/organization-user/` に置く。

**Tech Stack:** Next.js 16 (App Router) / React 19 / TypeScript / Prisma 7 (PostgreSQL) / Effect 3 / Zod 4 / CASL 7 / Better Auth 1.7 / Vitest 4 / Testing Library / Biome 2

**元となる設計:** `docs/superpowers/specs/2026-09-03-organization-user-permission-design.md`

## Global Constraints

- パッケージマネージャは **pnpm**。`pnpm add` / `pnpm exec` / `pnpm test` を使う。`npm` / `yarn` は使わない。
- `src/features/**` から `@/components/**` `@/app/**` へ import してはならない（Biome の `noRestrictedImports` で禁止済み）。UI は必ず `src/components/**` に置く。
- `src/features/**` 配下に `.tsx` を置かない。
- features のスライス同士（同列ディレクトリ）は依存禁止。共有物は 1 つ上の階層（`src/features/organization-user/` 直下）か `src/shared/` に置く。
- `src/features/organization-user` から `src/features/organization` / `src/features/tournament` を import しない。
- DB を触る `repository.ts` は先頭に `import "server-only";` を書く。
- Server Action ファイルは先頭に `"use server";` を書く。
- 所有権チェックはクエリの `where` に入れる。取得後に条件で弾かない。`update` / `delete` ではなく `updateMany` / `deleteMany` を使い、0 件は `notFound()` にする。
- 権限が無い場合は 403 ではなく `notFound()`（存在自体を漏らさない既存方針）。
- 画面文言はすべて日本語。
- テストは Vitest。DB は常に `vi.mock("@/shared/db/prisma", ...)` でモックする。実 DB に接続するテストは書かない。
- コミットメッセージは `<type>(<scope>): <subject>` 形式（既存の履歴に合わせる）。末尾に `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` を付ける。
- 各タスクの最後に `pnpm test` / `pnpm typecheck` / `pnpm lint` の 3 つがすべて通ることを確認してからコミットする。
- 新しい worktree で作業を始めた場合、`pnpm typecheck` が `PageProps` 型で失敗する。その場合はまず `pnpm exec next typegen` を実行する。

## ファイル構成（全タスク完了後）

```
prisma/
├── schema.prisma                                          変更（Task 2）
└── migrations/2026...._replace_role_with_permission/
    └── migration.sql                                      新規（Task 2）

src/shared/authz/
├── ability.ts              PERMISSION_CODES / AppAbility / defineAbilityFor / canByCode   新規（Task 1）
└── ability.test.ts                                                                        新規（Task 1）

src/shared/middleware/
├── require-organization.ts  role → ability。requirePermission を追加                       変更（Task 2）
└── require-organization.test.ts                                                            変更（Task 2）

src/shared/lib/auth.ts       Better Auth に username の additionalFields を追加             変更（Task 3）

src/features/organization/create/repository.ts   role 撤廃 + 全権限付与                     変更（Task 2）

src/features/auth/signup/schema.ts               username を追加                            変更（Task 3）

src/features/organization-user/
├── errors.ts                OrganizationUserError と Prisma 例外の写像                     新規（Task 4）
├── messages.ts              エラー → 日本語文言                                            新規（Task 4）
├── state.ts                 フォーム状態と Server Action の型                              新規（Task 4）
├── effect-to-form-state.ts  Cause → フォーム状態                                           新規（Task 4）
├── repository.ts            一覧取得 / Permission 全件 / 所属 1 件取得                     新規（Task 4）
├── search/{schema,usecase,repository,handler}.ts                                           新規（Task 5）
├── add/{schema,usecase,repository,handler}.ts                                              新規（Task 6）
├── remove/{schema,usecase,repository,handler}.ts                                           新規（Task 7）
└── grant/{schema,usecase,repository,handler}.ts                                            新規（Task 8）

src/components/organization-user/
├── UserAvatar.tsx           アイコン（image が無ければ頭文字）                              新規（Task 9）
├── OrganizationUserList.tsx 一覧                                                            新規（Task 9）
├── AddUserForm.tsx          検索 → 確認 → 追加                                             新規（Task 9）
├── RemoveUserForm.tsx       削除確認                                                        新規（Task 10）
└── PermissionEditForm.tsx   権限チェックボックス                                            新規（Task 11）

src/components/auth/SignupForm.tsx               username 入力を追加                        変更（Task 3）

src/app/orgs/[slug]/page.tsx                     ユーザー管理へのリンクを追加               変更（Task 10）
src/app/orgs/[slug]/users/page.tsx               一覧 + 追加 + 削除                          新規（Task 10）
src/app/orgs/[slug]/users/[userId]/permissions/page.tsx  権限編集                            新規（Task 11）
```

---

## Task 1: CASL による Ability 変換

権限コードの一覧と、それを CASL の Ability に変換する純粋関数を作る。DB にも Next.js にも依存しないため、このタスクだけで完結する。

**Files:**
- Create: `src/shared/authz/ability.ts`
- Test: `src/shared/authz/ability.test.ts`
- Modify: `package.json`（`@casl/ability` の追加）

**Interfaces:**
- Consumes: なし
- Produces:
  - `PERMISSION_CODES: readonly ["user.view", "user.add", "user.remove", "user.grant", "tournament.create", "tournament.edit", "tournament.delete", "org.edit", "org.delete"]`
  - `type PermissionCode = (typeof PERMISSION_CODES)[number]`
  - `type AppAbility`（CASL の `MongoAbility`）
  - `parsePermissionCode(code: string): { subject: string; action: string } | null`
  - `defineAbilityFor(codes: readonly string[]): AppAbility`
  - `canByCode(ability: AppAbility, code: string): boolean`

- [ ] **Step 1: CASL を追加する**

```bash
pnpm add @casl/ability@^7.0.1
```

期待: `package.json` の `dependencies` に `"@casl/ability": "^7.0.1"` が入る。

- [ ] **Step 2: 失敗するテストを書く**

`src/shared/authz/ability.test.ts` を新規作成:

```typescript
import { describe, expect, it } from "vitest";
import {
  canByCode,
  defineAbilityFor,
  parsePermissionCode,
  PERMISSION_CODES,
} from "./ability";

describe("parsePermissionCode", () => {
  it('"user.add" を subject と action に分解する', () => {
    expect(parsePermissionCode("user.add")).toEqual({
      subject: "user",
      action: "add",
    });
  });

  it("区切りが無い場合は null を返す", () => {
    expect(parsePermissionCode("useradd")).toBeNull();
  });

  it("ドットが 2 つ以上ある場合は null を返す", () => {
    expect(parsePermissionCode("a.b.c")).toBeNull();
  });

  it("subject または action が空の場合は null を返す", () => {
    expect(parsePermissionCode(".add")).toBeNull();
    expect(parsePermissionCode("user.")).toBeNull();
  });
});

describe("defineAbilityFor", () => {
  it("与えた code の操作だけを許可する", () => {
    const ability = defineAbilityFor(["user.view", "user.add"]);

    expect(ability.can("view", "user")).toBe(true);
    expect(ability.can("add", "user")).toBe(true);
    expect(ability.can("remove", "user")).toBe(false);
  });

  it("空配列なら何も許可しない", () => {
    const ability = defineAbilityFor([]);

    for (const code of PERMISSION_CODES) {
      expect(canByCode(ability, code)).toBe(false);
    }
  });

  it("PERMISSION_CODES を全部渡せば全部許可される", () => {
    const ability = defineAbilityFor(PERMISSION_CODES);

    for (const code of PERMISSION_CODES) {
      expect(canByCode(ability, code)).toBe(true);
    }
  });

  it("subject が同じでも action が違えば許可されない（横断許可の回帰テスト）", () => {
    // "user.view" だけで user への全操作が通ってしまう実装に後退すると落ちる。
    const ability = defineAbilityFor(["user.view"]);

    expect(canByCode(ability, "user.view")).toBe(true);
    expect(canByCode(ability, "user.add")).toBe(false);
    expect(canByCode(ability, "user.remove")).toBe(false);
    expect(canByCode(ability, "user.grant")).toBe(false);
  });

  it("不正な形式の code は無視し、権限を増やす方向には倒れない", () => {
    const ability = defineAbilityFor(["こわれた", "user.view"]);

    expect(canByCode(ability, "user.view")).toBe(true);
    expect(canByCode(ability, "user.add")).toBe(false);
  });
});

describe("canByCode", () => {
  it("不正な形式の code には false を返す", () => {
    const ability = defineAbilityFor(PERMISSION_CODES);

    expect(canByCode(ability, "こわれた")).toBe(false);
  });
});
```

- [ ] **Step 3: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/shared/authz/ability.test.ts
```

期待: `Failed to resolve import "./ability"` で FAIL。

- [ ] **Step 4: 実装する**

`src/shared/authz/ability.ts` を新規作成:

```typescript
import {
  AbilityBuilder,
  createMongoAbility,
  type MongoAbility,
} from "@casl/ability";

/**
 * 権限コードの一覧。DB の Permission.code と 1:1 で対応させる。
 * migration のシードもこの並びに合わせること。
 */
export const PERMISSION_CODES = [
  "user.view",
  "user.add",
  "user.remove",
  "user.grant",
  "tournament.create",
  "tournament.edit",
  "tournament.delete",
  "org.edit",
  "org.delete",
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

/** "user.add" を CASL の [action, subject] = ["add", "user"] に写す。 */
type ToAbilityTuple<T extends string> = T extends `${infer S}.${infer A}`
  ? [A, S]
  : never;

export type AppAbility = MongoAbility<ToAbilityTuple<PermissionCode>>;

/**
 * 文字列から動的に規則を積むための緩い型。CASL の can は
 * action と subject の組み合わせを型で縛るが、DB から来た文字列は
 * その組み合わせを静的に持たないため、ここだけ型を外す。
 * 組み合わせの正しさは PERMISSION_CODES に対するテストで担保する。
 */
type LooseRuleAdder = (action: string, subject: string) => void;
type LooseChecker = (action: string, subject: string) => boolean;

/**
 * "<subject>.<action>" を分解する。区切りが無い・前後どちらかが空・
 * ドットが 2 つ以上ある場合は null を返す。
 */
export const parsePermissionCode = (
  code: string,
): { subject: string; action: string } | null => {
  const parts = code.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [subject, action] = parts;
  if (subject === "" || action === "") {
    return null;
  }
  return { subject, action };
};

/**
 * 保有する権限コードから CASL の Ability を組む。純粋関数なので
 * DB にも Next.js にも依存せず、そのままテストできる。
 */
export const defineAbilityFor = (codes: readonly string[]): AppAbility => {
  const builder = new AbilityBuilder<AppAbility>(createMongoAbility);
  const addRule = builder.can as unknown as LooseRuleAdder;

  for (const code of codes) {
    const parsed = parsePermissionCode(code);
    // 不正な形式は無視する。DB に想定外の行が混ざっても、
    // 許可が増える方向には倒れない。
    if (parsed === null) {
      continue;
    }
    addRule(parsed.action, parsed.subject);
  }

  return builder.build();
};

/** 権限コードのまま可否を問い合わせる。呼び出し側に分解させないための入口。 */
export const canByCode = (ability: AppAbility, code: string): boolean => {
  const parsed = parsePermissionCode(code);
  if (parsed === null) {
    return false;
  }
  const check = ability.can.bind(ability) as unknown as LooseChecker;
  return check(parsed.action, parsed.subject);
};
```

- [ ] **Step 5: テストが通ることを確認する**

```bash
pnpm exec vitest run src/shared/authz/ability.test.ts
```

期待: 全 PASS。

- [ ] **Step 6: 型チェックと lint**

```bash
pnpm typecheck && pnpm lint
```

期待: どちらもエラー 0。`pnpm typecheck` が `PageProps` 関連で落ちる場合は先に `pnpm exec next typegen` を実行する。

- [ ] **Step 7: コミット**

```bash
git add package.json pnpm-lock.yaml src/shared/authz
git commit -m "feat(authz): add CASL ability built from permission codes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: Prisma スキーマと migration、role の撤廃

`role` 列を落とすと `require-organization.ts` と `features/organization/create/repository.ts` が同時に壊れるため、この 3 つは 1 タスクにまとめる。分けると途中でツリーがビルドできなくなる。

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_replace_role_with_permission/migration.sql`
- Modify: `src/shared/middleware/require-organization.ts`
- Modify: `src/shared/middleware/require-organization.test.ts`
- Modify: `src/features/organization/create/repository.ts`
- Modify: `src/features/organization/create/repository.test.ts`
- Modify: `src/app/orgs/[slug]/page.test.tsx`（`role: "OWNER"` を返すモックを差し替え）
- Modify: `src/app/orgs/[slug]/edit/page.test.tsx` ほか `role` をモックしている page テスト全部

**Interfaces:**
- Consumes: Task 1 の `PERMISSION_CODES` / `PermissionCode` / `AppAbility` / `defineAbilityFor` / `canByCode`
- Produces:
  - `requireOrganization(slug: string): Promise<{ session; organization; permissionCodes: string[]; ability: AppAbility }>`
  - `requirePermission(slug: string, code: PermissionCode): Promise<同上>`
  - Prisma モデル `Permission { id: Int; code: String; description: String; createdAt: DateTime }`
  - Prisma モデル `OrganizationUserPermission { organizationId; userId; permissionId; grantedAt }`
  - `User.username: String`（unique）

- [ ] **Step 1: schema.prisma を書き換える**

`prisma/schema.prisma` の該当箇所を次のように変更する。

`User` モデルに `username` を追加（`email` の下）:

```prisma
model User {
  id            String   @id @default(uuid())
  email         String   @unique
  /// ログイン名。組織へのユーザー追加時の検索キーに使う。
  username      String   @unique
  name          String
  emailVerified Boolean  @default(false)
  image         String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  memberships OrganizationUser[]
  sessions    Session[]
  accounts    Account[]
}
```

`OrganizationUser` から `role` を削除し、権限リレーションを追加:

```prisma
/// 組織 N-N ユーザー の中間テーブル。
model OrganizationUser {
  organizationId String
  userId         String
  joinedAt       DateTime @default(now())

  organization Organization                 @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user         User                         @relation(fields: [userId], references: [id], onDelete: Cascade)
  permissions  OrganizationUserPermission[]

  @@id([organizationId, userId])
  @@index([userId])
}

/// 権限マスタ。migration の SQL でデータを挿入する。
/// code は "<subject>.<action>" 形式で、shared/authz/ability.ts の
/// PERMISSION_CODES と 1:1 に対応させる。
model Permission {
  id          Int      @id @default(autoincrement())
  code        String   @unique
  description String
  createdAt   DateTime @default(now())

  grants OrganizationUserPermission[]
}

/// 組織ユーザーへの権限割当。
model OrganizationUserPermission {
  organizationId String
  userId         String
  permissionId   Int
  grantedAt      DateTime @default(now())

  organizationUser OrganizationUser @relation(fields: [organizationId, userId], references: [organizationId, userId], onDelete: Cascade)
  permission       Permission       @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@id([organizationId, userId, permissionId])
  @@index([permissionId])
}
```

`enum OrganizationRole { OWNER ADMIN MEMBER }` のブロックを**丸ごと削除**する。

- [ ] **Step 2: migration を SQL 付きで生成する**

```bash
pnpm exec prisma migrate dev --create-only --name replace_role_with_permission
```

期待: `prisma/migrations/<timestamp>_replace_role_with_permission/migration.sql` が生成される（まだ適用はされない）。

- [ ] **Step 3: 生成された migration.sql を書き換える**

生成された SQL は `username` を NOT NULL で足そうとして既存行があると失敗し、Permission のシードも入っていない。ファイルの中身を**すべて次の内容に置き換える**:

```sql
/*
  Warnings:

  - `OrganizationUser.role` と `OrganizationRole` を削除し、Permission テーブルに置き換える。
  - `User.username` を必須・unique で追加する。既存行は email のローカル部で埋め、
    衝突時は連番を付ける。開発 DB 前提の簡易対応であり、本番データには使えない。

*/

-- AlterTable: User.username を段階的に足す（既存行を埋めてから NOT NULL にする）
ALTER TABLE "User" ADD COLUMN "username" TEXT;

UPDATE "User" SET "username" = split_part("email", '@', 1);

-- 同じローカル部が複数あった場合に連番を付ける（2 件目以降が taro2, taro3 ...）
UPDATE "User" AS u
SET "username" = u."username" || d."rn"::text
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "username" ORDER BY "createdAt", "id") AS "rn"
  FROM "User"
) AS d
WHERE u."id" = d."id" AND d."rn" > 1;

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateTable
CREATE TABLE "Permission" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateTable
CREATE TABLE "OrganizationUserPermission" (
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissionId" INTEGER NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationUserPermission_pkey" PRIMARY KEY ("organizationId","userId","permissionId")
);

-- CreateIndex
CREATE INDEX "OrganizationUserPermission_permissionId_idx" ON "OrganizationUserPermission"("permissionId");

-- AddForeignKey
ALTER TABLE "OrganizationUserPermission" ADD CONSTRAINT "OrganizationUserPermission_organizationId_userId_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "OrganizationUser"("organizationId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationUserPermission" ADD CONSTRAINT "OrganizationUserPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed: 権限マスタ。shared/authz/ability.ts の PERMISSION_CODES と対応させる。
INSERT INTO "Permission" ("code", "description") VALUES
  ('user.view', '組織ユーザーの閲覧'),
  ('user.add', '組織ユーザーの追加'),
  ('user.remove', '組織ユーザーの削除'),
  ('user.grant', '組織ユーザーへの権限付与・剥奪'),
  ('tournament.create', '大会の作成'),
  ('tournament.edit', '大会の編集'),
  ('tournament.delete', '大会の削除'),
  ('org.edit', '組織の編集'),
  ('org.delete', '組織の削除');

-- 既存の所属ユーザーには全権限を付与する（role 撤廃で権限を失わせないため）
INSERT INTO "OrganizationUserPermission" ("organizationId", "userId", "permissionId")
SELECT ou."organizationId", ou."userId", p."id"
FROM "OrganizationUser" AS ou
CROSS JOIN "Permission" AS p;

-- AlterTable
ALTER TABLE "OrganizationUser" DROP COLUMN "role";

-- DropEnum
DROP TYPE "OrganizationRole";
```

- [ ] **Step 4: migration を適用してクライアントを再生成する**

```bash
pnpm exec prisma migrate dev
```

期待: `Your database is now in sync with your schema.` と表示され、`src/generated/prisma` が再生成される。エラーになる場合は `DATABASE_URL` が設定されているか確認する。

- [ ] **Step 5: require-organization のテストを書き換える**

`src/shared/middleware/require-organization.test.ts` の中身を**すべて次に置き換える**:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { canByCode } from "@/shared/authz/ability";

const requireSession = vi.fn();
const findFirst = vi.fn();
const notFound = vi.fn(() => {
  // next/navigation の notFound は例外を投げて制御を打ち切る。同じ形を模す。
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
}));

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    organizationUser: { findFirst: (args: unknown) => findFirst(args) },
  },
}));

vi.mock("./require-session", () => ({
  requireSession: () => requireSession(),
}));

const { requireOrganization, requirePermission } = await import(
  "./require-organization"
);

const session = { user: { id: "u1", name: "竹添" } };
const organization = {
  id: "o1",
  name: "テニス部",
  slug: "tennis",
  createdAt: new Date("2026-08-01T00:00:00Z"),
  updatedAt: new Date("2026-08-01T00:00:00Z"),
};

/** findFirst が返す所属行を、権限コードの配列から組み立てる。 */
const membershipWith = (codes: string[]) => ({
  organization,
  permissions: codes.map((code) => ({ permission: { code } })),
});

describe("requireOrganization", () => {
  beforeEach(() => {
    requireSession.mockReset();
    findFirst.mockReset();
    notFound.mockClear();
    requireSession.mockResolvedValue(session);
  });

  it("所属していれば組織と権限コードを返す", async () => {
    findFirst.mockResolvedValue(membershipWith(["user.view", "user.add"]));

    const result = await requireOrganization("tennis");

    expect(result.session).toBe(session);
    expect(result.organization).toEqual(organization);
    expect(result.permissionCodes).toEqual(["user.view", "user.add"]);
    expect(notFound).not.toHaveBeenCalled();
  });

  it("保有する権限だけを許可する ability を返す", async () => {
    findFirst.mockResolvedValue(membershipWith(["user.view"]));

    const { ability } = await requireOrganization("tennis");

    expect(canByCode(ability, "user.view")).toBe(true);
    expect(canByCode(ability, "user.remove")).toBe(false);
  });

  it("所属していなければ notFound を呼ぶ", async () => {
    findFirst.mockResolvedValue(null);

    await expect(requireOrganization("tennis")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFound).toHaveBeenCalled();
  });

  it("ログインしていなければ requireSession の時点で打ち切られ、DB を引かない", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(requireOrganization("tennis")).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("slug と userId の両方を where に含めて引く", async () => {
    // 横断アクセス防止の回帰テスト。slug だけで引くと他人の組織が見える。
    findFirst.mockResolvedValue(membershipWith([]));

    await requireOrganization("tennis");

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization: { slug: "tennis" }, userId: "u1" },
      }),
    );
  });
});

describe("requirePermission", () => {
  beforeEach(() => {
    requireSession.mockReset();
    findFirst.mockReset();
    notFound.mockClear();
    requireSession.mockResolvedValue(session);
  });

  it("権限を持っていれば requireOrganization と同じ結果を返す", async () => {
    findFirst.mockResolvedValue(membershipWith(["user.view"]));

    const result = await requirePermission("tennis", "user.view");

    expect(result.organization).toEqual(organization);
    expect(notFound).not.toHaveBeenCalled();
  });

  it("権限を持っていなければ notFound を呼ぶ（403 ではなく 404）", async () => {
    findFirst.mockResolvedValue(membershipWith(["user.view"]));

    await expect(requirePermission("tennis", "user.remove")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFound).toHaveBeenCalled();
  });

  it("所属していなければ権限判定に入る前に notFound を呼ぶ", async () => {
    findFirst.mockResolvedValue(null);

    await expect(requirePermission("tennis", "user.view")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});
```

- [ ] **Step 6: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/shared/middleware/require-organization.test.ts
```

期待: `requirePermission is not a function` などで FAIL。

- [ ] **Step 7: require-organization.ts を実装する**

`src/shared/middleware/require-organization.ts` の中身を**すべて次に置き換える**:

```typescript
import { notFound } from "next/navigation";
import {
  type AppAbility,
  canByCode,
  defineAbilityFor,
  type PermissionCode,
} from "@/shared/authz/ability";
import { prisma } from "@/shared/db/prisma";
import { requireSession } from "./require-session";

/**
 * 組織スコープの実際のセキュリティ境界。/orgs/[slug] 配下の Server Component と
 * Server Action の冒頭で必ず呼ぶ。ページで確認済みでも Server Action は
 * 独立した入口であり、素通しにはできない。
 */
export const requireOrganization = async (slug: string) => {
  const session = await requireSession();

  const membership = await prisma.organizationUser.findFirst({
    where: { organization: { slug }, userId: session.user.id },
    include: {
      organization: true,
      permissions: { include: { permission: true } },
    },
  });

  // 非所属を 403 ではなく 404 にするのは、組織の存在自体を漏らさないため。
  if (!membership) {
    notFound();
  }

  const permissionCodes = membership.permissions.map(
    (grant) => grant.permission.code,
  );

  return {
    session,
    organization: membership.organization,
    permissionCodes,
    ability: defineAbilityFor(permissionCodes),
  };
};

export type OrganizationContext = Awaited<
  ReturnType<typeof requireOrganization>
>;

/**
 * 所属に加えて特定の権限も要る場合の境界。権限が無い場合も notFound にするのは、
 * 「権限が無い」と「そもそも無い」を区別させないため（requireOrganization と同じ方針）。
 */
export const requirePermission = async (
  slug: string,
  code: PermissionCode,
): Promise<OrganizationContext> => {
  const context = await requireOrganization(slug);

  if (!canByCode(context.ability, code)) {
    notFound();
  }

  return context;
};

export type { AppAbility };
```

- [ ] **Step 8: テストが通ることを確認する**

```bash
pnpm exec vitest run src/shared/middleware/require-organization.test.ts
```

期待: 全 PASS。

- [ ] **Step 9: 組織作成の repository を全権限付与に変える**

`src/features/organization/create/repository.ts` の中身を**すべて次に置き換える**:

```typescript
import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type OrganizationError, toOrganizationError } from "../errors";
import type { CreateOrganizationInput } from "./schema";

export type CreateOrganizationPort = (
  input: CreateOrganizationInput & { ownerUserId: string },
) => Effect.Effect<{ slug: string }, OrganizationError>;

export const createOrganizationInDb: CreateOrganizationPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      // 組織・作成者の所属行・その全権限は必ず同時に作る。途中で切れると
      // 誰も操作できない組織が残る。1 トランザクションにまとめて原子的に入れる。
      const permissions = await prisma.permission.findMany({
        select: { id: true },
      });

      return prisma.organization.create({
        data: {
          name: input.name,
          slug: input.slug,
          users: {
            create: {
              userId: input.ownerUserId,
              // 作成者は組織を運営できなければ意味がないため全権限を持たせる。
              permissions: {
                create: permissions.map((permission) => ({
                  permissionId: permission.id,
                })),
              },
            },
          },
        },
        select: { slug: true },
      });
    },
    catch: (reason) => toOrganizationError(reason, input.slug),
  });
```

- [ ] **Step 10: 組織作成 repository のテストを書き換える**

`src/features/organization/create/repository.test.ts` の中身を**すべて次に置き換える**:

```typescript
import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { failureTag } from "@/shared/testing/exit";

const create = vi.fn();
const findManyPermission = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    organization: { create: (args: unknown) => create(args) },
    permission: { findMany: (args: unknown) => findManyPermission(args) },
  },
}));

const { createOrganizationInDb } = await import("./repository");

/** P2002（unique 制約違反）を模した Prisma のエラーを作る。errors.test.ts と同じ組み立て方。 */
const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "7.10.0",
  });

const input = {
  name: "テニス部",
  slug: "tennis",
  ownerUserId: "u1",
};

describe("createOrganizationInDb", () => {
  beforeEach(() => {
    create.mockReset();
    findManyPermission.mockReset();
    findManyPermission.mockResolvedValue([{ id: 1 }, { id: 2 }]);
  });

  it("組織・所属行・全権限を 1 回の nested write でまとめて作る（原子性の回帰テスト）", async () => {
    // create が複数回に分かれる実装へ後退すると、権限だけ入らずに
    // 誰も操作できない組織が残り得る。
    create.mockResolvedValue({ slug: "tennis" });

    const exit = await Effect.runPromiseExit(createOrganizationInDb(input));

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: "テニス部",
          slug: "tennis",
          users: {
            create: {
              userId: "u1",
              permissions: {
                create: [{ permissionId: 1 }, { permissionId: 2 }],
              },
            },
          },
        },
      }),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ slug: "tennis" });
    }
  });

  it("Permission が 1 件も無ければ権限を付けずに作る（シード漏れでも組織作成は落とさない）", async () => {
    findManyPermission.mockResolvedValue([]);
    create.mockResolvedValue({ slug: "tennis" });

    await Effect.runPromiseExit(createOrganizationInDb(input));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          users: {
            create: { userId: "u1", permissions: { create: [] } },
          },
        }),
      }),
    );
  });

  it("P2002 は SlugTaken に写像し、試みたスラッグを保持する", async () => {
    create.mockRejectedValue(uniqueViolation());

    const exit = await Effect.runPromiseExit(createOrganizationInDb(input));

    expect(failureTag(exit)).toBe("SlugTaken");
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toMatchObject({ slug: "tennis" });
    }
  });

  it("P2002 以外の例外は握り潰さず UnexpectedOrganizationError の reason に残す", async () => {
    const cause = new Error("network");
    create.mockRejectedValue(cause);

    const exit = await Effect.runPromiseExit(createOrganizationInDb(input));

    expect(failureTag(exit)).toBe("UnexpectedOrganizationError");
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toMatchObject({ reason: cause });
    }
  });
});
```

- [ ] **Step 11: role をモックしている page テストを直す**

`role: "OWNER"` / `role: "MEMBER"` を `requireOrganization` のモック戻り値に含めている箇所を探す:

```bash
grep -rn 'role: "' src/app
```

見つかった各ファイルで、モックの戻り値から `role: "..."` の行を削除し、代わりに次の 2 行を足す（`PERMISSION_CODES` は `@/shared/authz/ability` から import する）:

```typescript
      permissionCodes: [...PERMISSION_CODES],
      ability: defineAbilityFor(PERMISSION_CODES),
```

例として `src/app/orgs/[slug]/page.test.tsx` の `beforeEach` は次のようになる:

```typescript
    requireOrganization.mockResolvedValue({
      session,
      organization,
      permissionCodes: [...PERMISSION_CODES],
      ability: defineAbilityFor(PERMISSION_CODES),
    });
```

ファイル冒頭に次の import を足す:

```typescript
import { defineAbilityFor, PERMISSION_CODES } from "@/shared/authz/ability";
```

- [ ] **Step 12: 全テストと型チェックと lint**

```bash
pnpm test && pnpm typecheck && pnpm lint
```

期待: すべてエラー 0。落ちたテストがあれば、`role` を参照している残りの箇所を `grep -rn '\brole\b' src` で探して直す。

- [ ] **Step 13: コミット**

```bash
git add prisma src/shared/middleware src/features/organization/create src/app src/generated
git commit -m "feat(authz): replace OrganizationUser.role with Permission tables

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

（`src/generated` が `.gitignore` されている場合は `git add` から外す。`git status` で確認する。）

---

## Task 3: サインアップに username を追加

**Files:**
- Modify: `src/features/auth/signup/schema.ts`
- Modify: `src/features/auth/signup/schema.test.ts`
- Modify: `src/shared/lib/auth.ts`
- Modify: `src/components/auth/SignupForm.tsx`
- Modify: `src/components/auth/SignupForm.test.tsx`

**Interfaces:**
- Consumes: Task 2 の `User.username`
- Produces: `SignupInput` に `username: string` が加わる

- [ ] **Step 1: schema のテストを追加する**

`src/features/auth/signup/schema.test.ts` を開き、`describe("signupSchema", ...)` の中に次のテストを追加する（既存のテストはそのまま残す）:

```typescript
  it("username は前後の空白を落として受け取る", () => {
    const parsed = signupSchema.safeParse({
      name: "竹添",
      username: "  takezo  ",
      email: "takezo@example.com",
      password: "password123",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.username).toBe("takezo");
    }
  });

  it("username が空なら弾く", () => {
    const parsed = signupSchema.safeParse({
      name: "竹添",
      username: "   ",
      email: "takezo@example.com",
      password: "password123",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe(
        "ユーザー名を入力してください",
      );
    }
  });

  it("username に使えない文字が含まれていれば弾く", () => {
    const parsed = signupSchema.safeParse({
      name: "竹添",
      username: "take zo",
      email: "takezo@example.com",
      password: "password123",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe(
        "ユーザー名は半角英数字・アンダースコア・ハイフンのみ使えます",
      );
    }
  });
```

既存のテストで `signupSchema.safeParse({...})` を呼んでいる箇所には `username: "takezo",` を足す（無いと `username` 必須で全部落ちる）。

- [ ] **Step 2: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/features/auth/signup/schema.test.ts
```

期待: FAIL。

- [ ] **Step 3: schema を実装する**

`src/features/auth/signup/schema.ts` の `signupSchema` に `username` を追加する。`name` の直後に次を挿入:

```typescript
  username: z
    .string()
    .transform((raw) => raw.trim())
    .pipe(
      z
        .string()
        .min(1, "ユーザー名を入力してください")
        .max(50, "ユーザー名は50文字以内で入力してください")
        .regex(
          /^[A-Za-z0-9_-]+$/,
          "ユーザー名は半角英数字・アンダースコア・ハイフンのみ使えます",
        ),
    ),
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
pnpm exec vitest run src/features/auth/signup/schema.test.ts
```

期待: 全 PASS。

- [ ] **Step 5: Better Auth に username を認識させる**

`src/shared/lib/auth.ts` の `betterAuth({ ... })` の中、`account: { ... }` の直前に次を追加する:

```typescript
  user: {
    // username は User テーブルの必須列。ここに宣言しないと signUp の
    // 入力から落とされ、NOT NULL 制約で登録が失敗する。
    additionalFields: {
      username: { type: "string", required: true, input: true },
    },
  },
```

- [ ] **Step 6: SignupForm に入力欄を足す**

`src/components/auth/SignupForm.tsx` の `signupSchema.safeParse({...})` に `username` を追加する:

```typescript
    const parsed = signupSchema.safeParse({
      name: formData.get("name"),
      username: formData.get("username"),
      email: formData.get("email"),
      password: formData.get("password"),
    });
```

そして「名前」の入力ブロックの直後に、次の入力ブロックを挿入する:

```tsx
        <div className="space-y-1">
          <label
            htmlFor="username"
            className="block text-sm font-medium text-slate-700"
          >
            ユーザー名
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            required
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-slate-500">
            半角英数字・アンダースコア・ハイフン。組織へ招待されるときの目印になります
          </p>
        </div>
```

- [ ] **Step 7: SignupForm のテストを直す**

`src/components/auth/SignupForm.test.tsx` を開き、フォームに入力しているテストで「ユーザー名」欄にも入力する。既存の入力操作の並びに合わせて次を追加する:

```typescript
    await user.type(screen.getByLabelText("ユーザー名"), "takezo");
```

さらに、`authClient.signUp.email` に渡る値を検証しているテストがあれば、期待値に `username: "takezo"` を追加する。加えて次のテストを `describe` 内に追加する:

```typescript
  it("ユーザー名の入力欄がある", () => {
    render(<SignupForm redirectTo="/" />);

    expect(screen.getByLabelText("ユーザー名")).toBeInTheDocument();
  });
```

- [ ] **Step 8: 全テストと型チェックと lint**

```bash
pnpm test && pnpm typecheck && pnpm lint
```

期待: すべてエラー 0。

- [ ] **Step 9: コミット**

```bash
git add src/features/auth src/shared/lib/auth.ts src/components/auth
git commit -m "feat(auth): add required username to signup

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: organization-user スライスの共通部分

エラー型・文言・フォーム状態・読み取り用リポジトリを先に作る。以降の 4 スライス（search / add / remove / grant）がすべてここに依存する。

**Files:**
- Create: `src/features/organization-user/errors.ts`
- Create: `src/features/organization-user/messages.ts`
- Create: `src/features/organization-user/state.ts`
- Create: `src/features/organization-user/effect-to-form-state.ts`
- Create: `src/features/organization-user/repository.ts`
- Test: `src/features/organization-user/errors.test.ts`
- Test: `src/features/organization-user/messages.test.ts`
- Test: `src/features/organization-user/effect-to-form-state.test.ts`
- Test: `src/features/organization-user/repository.test.ts`

**Interfaces:**
- Consumes: Task 2 の Prisma モデル
- Produces:
  - `UserNotFound` / `AlreadyMember` / `NotAMember` / `UnexpectedOrganizationUserError` と型 `OrganizationUserError`
  - `toOrganizationUserError(reason: unknown, targetId: string): OrganizationUserError`
  - `organizationUserErrorMessage(error: OrganizationUserError): string`
  - `type OrganizationUserFormState = { error: string | null }` / `INITIAL_ORGANIZATION_USER_FORM_STATE` / `type OrganizationUserFormAction`
  - `type FoundUser = { id; name; username; email; image: string | null; alreadyMember: boolean }`
  - `type UserSearchState = { error: string | null; user: FoundUser | null }` / `INITIAL_USER_SEARCH_STATE` / `type UserSearchAction`
  - `organizationUserErrorFormState(cause): OrganizationUserFormState`
  - `organizationUserErrorSearchState(cause): UserSearchState`
  - `type OrganizationUserSummary = { userId; name; username; email; image: string | null; permissionCodes: string[]; joinedAt: Date }`
  - `listUsersInOrganization(organizationId: string): Promise<OrganizationUserSummary[]>`
  - `listAllPermissions(): Promise<PermissionSummary[]>` where `PermissionSummary = { id: number; code: string; description: string }`
  - `findOrganizationUser(organizationId: string, userId: string): Promise<OrganizationUserSummary | null>`

- [ ] **Step 1: errors のテストを書く**

`src/features/organization-user/errors.test.ts` を新規作成:

```typescript
import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { toOrganizationUserError } from "./errors";

const knownError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("failed", {
    code,
    clientVersion: "7.10.0",
  });

describe("toOrganizationUserError", () => {
  it("P2002（unique 制約違反）は AlreadyMember に写す", () => {
    const error = toOrganizationUserError(knownError("P2002"), "u1");

    expect(error._tag).toBe("AlreadyMember");
    expect(error).toMatchObject({ userId: "u1" });
  });

  it("P2003（外部キー違反）は UserNotFound に写す", () => {
    // 追加時に対象ユーザーが消えていた場合にこれが飛ぶ。
    const error = toOrganizationUserError(knownError("P2003"), "u1");

    expect(error._tag).toBe("UserNotFound");
  });

  it("それ以外は握り潰さず reason に残す", () => {
    const cause = new Error("network");

    const error = toOrganizationUserError(cause, "u1");

    expect(error._tag).toBe("UnexpectedOrganizationUserError");
    expect(error).toMatchObject({ reason: cause });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/features/organization-user/errors.test.ts
```

期待: `Failed to resolve import "./errors"` で FAIL。

- [ ] **Step 3: errors.ts を実装する**

`src/features/organization-user/errors.ts` を新規作成:

```typescript
import { Data } from "effect";
import { Prisma } from "@/generated/prisma/client";

/** 検索で該当ユーザーが見つからない、または追加直前に消えていた。 */
export class UserNotFound extends Data.TaggedError("UserNotFound")<{
  readonly query: string;
}> {}

/** 既にこの組織に所属している。 */
export class AlreadyMember extends Data.TaggedError("AlreadyMember")<{
  readonly userId: string;
}> {}

/** 対象がこの組織に所属していない（権限編集・削除の対象違い）。 */
export class NotAMember extends Data.TaggedError("NotAMember")<{
  readonly userId: string;
}> {}

export class UnexpectedOrganizationUserError extends Data.TaggedError(
  "UnexpectedOrganizationUserError",
)<{
  // Error が持つ cause と名前が衝突しないよう reason にしている。
  readonly reason: unknown;
}> {}

export type OrganizationUserError =
  | UserNotFound
  | AlreadyMember
  | NotAMember
  | UnexpectedOrganizationUserError;

/**
 * Prisma の例外をドメインのエラーに写像する。ここで写像しておくことで、
 * usecase より上の層に Prisma の型が漏れない。
 *
 * targetId は操作対象を指す文字列。追加・削除・権限編集では User.id が、
 * 検索では入力された検索語が渡る。エラーに載せて画面や調査で辿れるようにするだけで、
 * 分岐には使わない。
 */
export const toOrganizationUserError = (
  reason: unknown,
  targetId: string,
): OrganizationUserError => {
  if (reason instanceof Prisma.PrismaClientKnownRequestError) {
    if (reason.code === "P2002") {
      return new AlreadyMember({ userId: targetId });
    }
    if (reason.code === "P2003") {
      // 外部キー違反は、追加しようとした先のユーザーか組織が消えたことを意味する。
      return new UserNotFound({ query: targetId });
    }
  }
  return new UnexpectedOrganizationUserError({ reason });
};
```

- [ ] **Step 4: messages のテストを書く**

`src/features/organization-user/messages.test.ts` を新規作成:

```typescript
import { describe, expect, it } from "vitest";
import {
  AlreadyMember,
  NotAMember,
  UnexpectedOrganizationUserError,
  UserNotFound,
} from "./errors";
import { organizationUserErrorMessage } from "./messages";

describe("organizationUserErrorMessage", () => {
  it("UserNotFound には見つからない旨を返す", () => {
    expect(
      organizationUserErrorMessage(new UserNotFound({ query: "takezo" })),
    ).toBe("該当するユーザーが見つかりません");
  });

  it("AlreadyMember には所属済みの旨を返す", () => {
    expect(
      organizationUserErrorMessage(new AlreadyMember({ userId: "u1" })),
    ).toBe("このユーザーは既にこの組織に所属しています");
  });

  it("NotAMember には非所属の旨を返す", () => {
    expect(organizationUserErrorMessage(new NotAMember({ userId: "u1" }))).toBe(
      "このユーザーはこの組織に所属していません",
    );
  });

  it("想定外のエラーには内部の詳細を出さない汎用文言を返す", () => {
    expect(
      organizationUserErrorMessage(
        new UnexpectedOrganizationUserError({ reason: new Error("network") }),
      ),
    ).toBe("処理に失敗しました。時間をおいて再度お試しください");
  });
});
```

- [ ] **Step 5: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/features/organization-user/messages.test.ts
```

期待: FAIL。

- [ ] **Step 6: messages.ts と state.ts を実装する**

`src/features/organization-user/messages.ts` を新規作成:

```typescript
import { Match } from "effect";
import type { OrganizationUserError } from "./errors";

/**
 * Match.exhaustive により、OrganizationUserError にタグを足したのにここへ
 * 文言を足し忘れるとコンパイルエラーになる。
 */
export const organizationUserErrorMessage: (
  error: OrganizationUserError,
) => string = Match.type<OrganizationUserError>().pipe(
  Match.tag("UserNotFound", () => "該当するユーザーが見つかりません"),
  Match.tag(
    "AlreadyMember",
    () => "このユーザーは既にこの組織に所属しています",
  ),
  Match.tag("NotAMember", () => "このユーザーはこの組織に所属していません"),
  Match.tag(
    "UnexpectedOrganizationUserError",
    () => "処理に失敗しました。時間をおいて再度お試しください",
  ),
  Match.exhaustive,
);
```

`src/features/organization-user/state.ts` を新規作成:

```typescript
/**
 * 組織ユーザーのフォームが Server Action から受け取る状態。
 * handler（features）とフォーム（components）の両方が参照するため、
 * どちらからも依存できる features 直下に置く。
 */
export type OrganizationUserFormState = {
  error: string | null;
};

export const INITIAL_ORGANIZATION_USER_FORM_STATE: OrganizationUserFormState = {
  error: null,
};

export type OrganizationUserFormAction = (
  state: OrganizationUserFormState,
  formData: FormData,
) => Promise<OrganizationUserFormState>;

/** 追加前の確認表示に必要な、検索でヒットしたユーザーの情報。 */
export type FoundUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  image: string | null;
  /** 既にこの組織に所属しているか。追加ボタンの出し分けに使う。 */
  alreadyMember: boolean;
};

/**
 * 検索は「見つかったユーザー」を持ち回る必要があるため、
 * 追加・削除・権限編集とは別の状態にしている。
 */
export type UserSearchState = {
  error: string | null;
  user: FoundUser | null;
};

export const INITIAL_USER_SEARCH_STATE: UserSearchState = {
  error: null,
  user: null,
};

export type UserSearchAction = (
  state: UserSearchState,
  formData: FormData,
) => Promise<UserSearchState>;
```

- [ ] **Step 7: effect-to-form-state のテストを書く**

`src/features/organization-user/effect-to-form-state.test.ts` を新規作成:

```typescript
import { Cause } from "effect";
import { describe, expect, it } from "vitest";
import { AlreadyMember } from "./errors";
import {
  organizationUserErrorFormState,
  organizationUserErrorSearchState,
} from "./effect-to-form-state";

describe("organizationUserErrorFormState", () => {
  it("Fail のときはエラーに対応する文言を返す", () => {
    const cause = Cause.fail(new AlreadyMember({ userId: "u1" }));

    expect(organizationUserErrorFormState(cause)).toEqual({
      error: "このユーザーは既にこの組織に所属しています",
    });
  });

  it("Die など Fail 以外のときは汎用文言を返す", () => {
    const cause = Cause.die(new Error("boom"));

    expect(organizationUserErrorFormState(cause)).toEqual({
      error: "処理に失敗しました。時間をおいて再度お試しください",
    });
  });
});

describe("organizationUserErrorSearchState", () => {
  it("検索結果は null にしたうえで文言を返す", () => {
    const cause = Cause.fail(new AlreadyMember({ userId: "u1" }));

    expect(organizationUserErrorSearchState(cause)).toEqual({
      error: "このユーザーは既にこの組織に所属しています",
      user: null,
    });
  });
});
```

- [ ] **Step 8: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/features/organization-user/effect-to-form-state.test.ts
```

期待: FAIL。

- [ ] **Step 9: effect-to-form-state.ts を実装する**

`src/features/organization-user/effect-to-form-state.ts` を新規作成:

```typescript
import { Cause, Option } from "effect";
import type { OrganizationUserError } from "./errors";
import { organizationUserErrorMessage } from "./messages";
import type { OrganizationUserFormState, UserSearchState } from "./state";

const FALLBACK_MESSAGE = "処理に失敗しました。時間をおいて再度お試しください";

/**
 * 4 つのスライスがそれぞれ同じ変換を持つのを避けるため、
 * 共有先として features/organization-user 直下に置く。
 */
const causeMessage = (cause: Cause.Cause<OrganizationUserError>): string => {
  const failure = Cause.failureOption(cause);
  return Option.isSome(failure)
    ? organizationUserErrorMessage(failure.value)
    : FALLBACK_MESSAGE;
};

export const organizationUserErrorFormState = (
  cause: Cause.Cause<OrganizationUserError>,
): OrganizationUserFormState => ({ error: causeMessage(cause) });

export const organizationUserErrorSearchState = (
  cause: Cause.Cause<OrganizationUserError>,
): UserSearchState => ({ error: causeMessage(cause), user: null });
```

- [ ] **Step 10: repository のテストを書く**

`src/features/organization-user/repository.test.ts` を新規作成:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const findManyOrganizationUser = vi.fn();
const findFirstOrganizationUser = vi.fn();
const findManyPermission = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    organizationUser: {
      findMany: (args: unknown) => findManyOrganizationUser(args),
      findFirst: (args: unknown) => findFirstOrganizationUser(args),
    },
    permission: { findMany: (args: unknown) => findManyPermission(args) },
  },
}));

const { findOrganizationUser, listAllPermissions, listUsersInOrganization } =
  await import("./repository");

const row = {
  joinedAt: new Date("2026-08-01T00:00:00Z"),
  user: {
    id: "u1",
    name: "竹添",
    username: "takezo",
    email: "takezo@example.com",
    image: null,
  },
  permissions: [
    { permission: { code: "user.view" } },
    { permission: { code: "user.add" } },
  ],
};

describe("listUsersInOrganization", () => {
  beforeEach(() => {
    findManyOrganizationUser.mockReset();
  });

  it("organizationId で絞り込み、参加順に返す", async () => {
    findManyOrganizationUser.mockResolvedValue([row]);

    const users = await listUsersInOrganization("o1");

    expect(findManyOrganizationUser).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "o1" },
        orderBy: { joinedAt: "asc" },
      }),
    );
    expect(users).toEqual([
      {
        userId: "u1",
        name: "竹添",
        username: "takezo",
        email: "takezo@example.com",
        image: null,
        permissionCodes: ["user.view", "user.add"],
        joinedAt: new Date("2026-08-01T00:00:00Z"),
      },
    ]);
  });

  it("権限が 0 件でも空配列として返す", async () => {
    findManyOrganizationUser.mockResolvedValue([{ ...row, permissions: [] }]);

    const users = await listUsersInOrganization("o1");

    expect(users[0].permissionCodes).toEqual([]);
  });
});

describe("listAllPermissions", () => {
  beforeEach(() => {
    findManyPermission.mockReset();
  });

  it("id 昇順で全件返す（画面での並びを migration のシード順に固定する）", async () => {
    findManyPermission.mockResolvedValue([
      { id: 1, code: "user.view", description: "組織ユーザーの閲覧" },
    ]);

    const permissions = await listAllPermissions();

    expect(findManyPermission).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { id: "asc" } }),
    );
    expect(permissions).toEqual([
      { id: 1, code: "user.view", description: "組織ユーザーの閲覧" },
    ]);
  });
});

describe("findOrganizationUser", () => {
  beforeEach(() => {
    findFirstOrganizationUser.mockReset();
  });

  it("organizationId と userId の両方を where に含めて引く", async () => {
    // 横断アクセス防止の回帰テスト。userId だけで引くと他組織の所属が見える。
    findFirstOrganizationUser.mockResolvedValue(row);

    await findOrganizationUser("o1", "u1");

    expect(findFirstOrganizationUser).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "o1", userId: "u1" },
      }),
    );
  });

  it("所属していなければ null を返す", async () => {
    findFirstOrganizationUser.mockResolvedValue(null);

    await expect(findOrganizationUser("o1", "u1")).resolves.toBeNull();
  });
});
```

- [ ] **Step 11: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/features/organization-user/repository.test.ts
```

期待: FAIL。

- [ ] **Step 12: repository.ts を実装する**

`src/features/organization-user/repository.ts` を新規作成:

```typescript
import "server-only";
import { prisma } from "@/shared/db/prisma";

export type OrganizationUserSummary = {
  userId: string;
  name: string;
  username: string;
  email: string;
  image: string | null;
  permissionCodes: string[];
  joinedAt: Date;
};

export type PermissionSummary = {
  id: number;
  code: string;
  description: string;
};

/** 所属行 1 件を画面用の形に均す。findMany と findFirst で同じ形にするため切り出す。 */
type MembershipRow = {
  joinedAt: Date;
  user: {
    id: string;
    name: string;
    username: string;
    email: string;
    image: string | null;
  };
  permissions: { permission: { code: string } }[];
};

const toSummary = (row: MembershipRow): OrganizationUserSummary => ({
  userId: row.user.id,
  name: row.user.name,
  username: row.user.username,
  email: row.user.email,
  image: row.user.image,
  permissionCodes: row.permissions.map((grant) => grant.permission.code),
  joinedAt: row.joinedAt,
});

const MEMBERSHIP_SELECT = {
  joinedAt: true,
  user: {
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      image: true,
    },
  },
  permissions: { select: { permission: { select: { code: true } } } },
} as const;

/**
 * 組織に所属するユーザーを参加順に返す。
 * organizationId を where に入れるのが横断アクセス防止の要。
 */
export const listUsersInOrganization = async (
  organizationId: string,
): Promise<OrganizationUserSummary[]> => {
  const rows = await prisma.organizationUser.findMany({
    where: { organizationId },
    orderBy: { joinedAt: "asc" },
    select: MEMBERSHIP_SELECT,
  });

  return rows.map(toSummary);
};

/**
 * 権限マスタの全件。並びは migration のシード順（= id 昇順）に固定する。
 * 画面のチェックボックスの並びが実行のたびに変わらないようにするため。
 */
export const listAllPermissions = (): Promise<PermissionSummary[]> =>
  prisma.permission.findMany({
    orderBy: { id: "asc" },
    select: { id: true, code: true, description: true },
  });

/** 権限編集ページ用。組織に属していなければ null。 */
export const findOrganizationUser = async (
  organizationId: string,
  userId: string,
): Promise<OrganizationUserSummary | null> => {
  const row = await prisma.organizationUser.findFirst({
    where: { organizationId, userId },
    select: MEMBERSHIP_SELECT,
  });

  return row === null ? null : toSummary(row);
};
```

- [ ] **Step 13: このタスクの全テストが通ることを確認する**

```bash
pnpm exec vitest run src/features/organization-user
```

期待: 全 PASS。

- [ ] **Step 14: 全テストと型チェックと lint**

```bash
pnpm test && pnpm typecheck && pnpm lint
```

期待: すべてエラー 0。

- [ ] **Step 15: コミット**

```bash
git add src/features/organization-user
git commit -m "feat(org-user): add shared errors, state and read repository

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: ユーザー検索スライス

追加の前段。username または email の完全一致で 1 件引き、所属済みかどうかも併せて返す。

**Files:**
- Create: `src/features/organization-user/search/schema.ts`
- Create: `src/features/organization-user/search/repository.ts`
- Create: `src/features/organization-user/search/usecase.ts`
- Create: `src/features/organization-user/search/handler.ts`
- Test: `src/features/organization-user/search/schema.test.ts`
- Test: `src/features/organization-user/search/repository.test.ts`
- Test: `src/features/organization-user/search/usecase.test.ts`

**Interfaces:**
- Consumes: Task 4 の `FoundUser` / `UserSearchState` / `OrganizationUserError` / `toOrganizationUserError` / `organizationUserErrorSearchState`、Task 2 の `requirePermission`
- Produces:
  - `searchUserSchema` / `type SearchUserInput = { query: string }`
  - `type SearchUserPort = (input: { query: string; organizationId: string }) => Effect.Effect<FoundUser, OrganizationUserError>`
  - `searchUserInDb: SearchUserPort`
  - `searchUser(port, input, organizationId): Effect.Effect<FoundUser, OrganizationUserError>`
  - `searchUserAction: UserSearchAction`（`"use server"`）

- [ ] **Step 1: schema のテストを書く**

`src/features/organization-user/search/schema.test.ts` を新規作成:

```typescript
import { describe, expect, it } from "vitest";
import { searchUserSchema } from "./schema";

describe("searchUserSchema", () => {
  it("前後の空白を落とす", () => {
    const parsed = searchUserSchema.safeParse({ query: "  takezo  " });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.query).toBe("takezo");
    }
  });

  it("空文字は弾く", () => {
    const parsed = searchUserSchema.safeParse({ query: "   " });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe(
        "ユーザー名またはメールアドレスを入力してください",
      );
    }
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/features/organization-user/search/schema.test.ts
```

期待: FAIL。

- [ ] **Step 3: schema.ts を実装する**

`src/features/organization-user/search/schema.ts` を新規作成:

```typescript
import { z } from "zod";

export const searchUserSchema = z.object({
  query: z
    .string()
    .transform((raw) => raw.trim())
    .pipe(
      z
        .string()
        .min(1, "ユーザー名またはメールアドレスを入力してください")
        .max(255, "入力が長すぎます"),
    ),
});

export type SearchUserInput = z.infer<typeof searchUserSchema>;
```

- [ ] **Step 4: repository のテストを書く**

`src/features/organization-user/search/repository.test.ts` を新規作成:

```typescript
import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";

const findFirst = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    user: { findFirst: (args: unknown) => findFirst(args) },
  },
}));

const { searchUserInDb } = await import("./repository");

const found = {
  id: "u1",
  name: "竹添",
  username: "takezo",
  email: "takezo@example.com",
  image: null,
  memberships: [],
};

describe("searchUserInDb", () => {
  beforeEach(() => {
    findFirst.mockReset();
  });

  it("username と正規化した email の OR で引く", async () => {
    findFirst.mockResolvedValue(found);

    await Effect.runPromiseExit(
      searchUserInDb({ query: "TAKEZO@Example.com", organizationId: "o1" }),
    );

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { username: "TAKEZO@Example.com" },
            { email: "takezo@example.com" },
          ],
        },
      }),
    );
  });

  it("所属の有無を alreadyMember に畳んで返す", async () => {
    findFirst.mockResolvedValue({ ...found, memberships: [{ userId: "u1" }] });

    const exit = await Effect.runPromiseExit(
      searchUserInDb({ query: "takezo", organizationId: "o1" }),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({
        id: "u1",
        name: "竹添",
        username: "takezo",
        email: "takezo@example.com",
        image: null,
        alreadyMember: true,
      });
    }
  });

  it("所属を数えるときも organizationId で絞る", async () => {
    // 絞りを外すと、他組織に所属しているだけで「所属済み」と誤判定する。
    findFirst.mockResolvedValue(found);

    await Effect.runPromiseExit(
      searchUserInDb({ query: "takezo", organizationId: "o1" }),
    );

    const args = findFirst.mock.calls[0][0] as {
      select: { memberships: { where: { organizationId: string } } };
    };
    expect(args.select.memberships.where).toEqual({ organizationId: "o1" });
  });

  it("見つからなければ UserNotFound を返す", async () => {
    findFirst.mockResolvedValue(null);

    const exit = await Effect.runPromiseExit(
      searchUserInDb({ query: "takezo", organizationId: "o1" }),
    );

    expect(failureTag(exit)).toBe("UserNotFound");
  });

  it("例外は握り潰さず UnexpectedOrganizationUserError の reason に残す", async () => {
    const cause = new Error("network");
    findFirst.mockRejectedValue(cause);

    const exit = await Effect.runPromiseExit(
      searchUserInDb({ query: "takezo", organizationId: "o1" }),
    );

    expect(failureTag(exit)).toBe("UnexpectedOrganizationUserError");
  });
});
```

- [ ] **Step 5: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/features/organization-user/search/repository.test.ts
```

期待: FAIL。

- [ ] **Step 6: repository.ts を実装する**

`src/features/organization-user/search/repository.ts` を新規作成:

```typescript
import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { normalizeEmail } from "@/shared/lib/email";
import {
  type OrganizationUserError,
  toOrganizationUserError,
  UserNotFound,
} from "../errors";
import type { FoundUser } from "../state";

export type SearchUserPort = (input: {
  query: string;
  organizationId: string;
}) => Effect.Effect<FoundUser, OrganizationUserError>;

/**
 * username / email はどちらも unique なので、完全一致なら候補は最大 1 件。
 * 部分一致にしないのは、無関係なユーザーの存在を列挙させないため。
 */
export const searchUserInDb: SearchUserPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { username: input.query },
            // メールは大文字小文字を吸収する。username はそのまま照合する。
            { email: normalizeEmail(input.query) },
          ],
        },
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          image: true,
          // 所属済みかどうかを同じクエリで取る。organizationId で絞らないと
          // 他組織の所属を「所属済み」と誤判定する。
          memberships: {
            where: { organizationId: input.organizationId },
            select: { userId: true },
          },
        },
      });

      if (user === null) {
        throw new UserNotFound({ query: input.query });
      }

      return {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        image: user.image,
        alreadyMember: user.memberships.length > 0,
      };
    },
    catch: (reason) =>
      // UserNotFound は自分で投げた制御用の値なので、そのまま通す。
      reason instanceof UserNotFound
        ? reason
        : toOrganizationUserError(reason, input.query),
  });
```

- [ ] **Step 7: テストが通ることを確認する**

```bash
pnpm exec vitest run src/features/organization-user/search/repository.test.ts
```

期待: 全 PASS。

- [ ] **Step 8: usecase のテストを書く**

`src/features/organization-user/search/usecase.test.ts` を新規作成:

```typescript
import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import { UserNotFound } from "../errors";
import type { SearchUserPort } from "./repository";
import { searchUser } from "./usecase";

const found = {
  id: "u1",
  name: "竹添",
  username: "takezo",
  email: "takezo@example.com",
  image: null,
  alreadyMember: false,
};

describe("searchUser", () => {
  it("入力と組織 id を合わせて port に渡す", async () => {
    const port = vi.fn(() =>
      Effect.succeed(found),
    ) as unknown as SearchUserPort;

    const exit = await Effect.runPromiseExit(
      searchUser(port, { query: "takezo" }, "o1"),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({ query: "takezo", organizationId: "o1" });
  });

  it("port の失敗をそのまま伝える", async () => {
    const port: SearchUserPort = () =>
      Effect.fail(new UserNotFound({ query: "takezo" }));

    const exit = await Effect.runPromiseExit(
      searchUser(port, { query: "takezo" }, "o1"),
    );

    expect(failureTag(exit)).toBe("UserNotFound");
  });
});
```

- [ ] **Step 9: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/features/organization-user/search/usecase.test.ts
```

期待: FAIL。

- [ ] **Step 10: usecase.ts を実装する**

`src/features/organization-user/search/usecase.ts` を新規作成:

```typescript
import type { Effect } from "effect";
import type { OrganizationUserError } from "../errors";
import type { FoundUser } from "../state";
import type { SearchUserPort } from "./repository";
import type { SearchUserInput } from "./schema";

/**
 * port を引数で受けるのは、テストで DB を差し替えられるようにするため。
 * 既存の features/organization/create/usecase.ts と同じ形にしている。
 */
export const searchUser = (
  port: SearchUserPort,
  input: SearchUserInput,
  organizationId: string,
): Effect.Effect<FoundUser, OrganizationUserError> =>
  port({ ...input, organizationId });
```

- [ ] **Step 11: テストが通ることを確認する**

```bash
pnpm exec vitest run src/features/organization-user/search
```

期待: 全 PASS。

- [ ] **Step 12: handler.ts を実装する**

`src/features/organization-user/search/handler.ts` を新規作成:

```typescript
"use server";

import { Effect, Exit } from "effect";
import { requirePermission } from "@/shared/middleware/require-organization";
import { organizationUserErrorSearchState } from "../effect-to-form-state";
import type { UserSearchState } from "../state";
import { searchUserInDb } from "./repository";
import { searchUserSchema } from "./schema";
import { searchUser } from "./usecase";

export const searchUserAction = async (
  _prevState: UserSearchState,
  formData: FormData,
): Promise<UserSearchState> => {
  const slug = String(formData.get("slug") ?? "");
  // ページで確認済みでも Server Action は独立した入口なので、ここでも呼ぶ。
  // 検索はユーザーの存在を照会する操作なので user.add で守る。
  const { organization } = await requirePermission(slug, "user.add");

  const parsed = searchUserSchema.safeParse({
    query: String(formData.get("query") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, user: null };
  }

  const exit = await Effect.runPromiseExit(
    searchUser(searchUserInDb, parsed.data, organization.id),
  );

  if (Exit.isFailure(exit)) {
    return organizationUserErrorSearchState(exit.cause);
  }

  return { error: null, user: exit.value };
};
```

- [ ] **Step 13: 全テストと型チェックと lint**

```bash
pnpm test && pnpm typecheck && pnpm lint
```

期待: すべてエラー 0。

- [ ] **Step 14: コミット**

```bash
git add src/features/organization-user/search
git commit -m "feat(org-user): add user search by username or email

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: ユーザー追加スライス

**Files:**
- Create: `src/features/organization-user/add/schema.ts`
- Create: `src/features/organization-user/add/repository.ts`
- Create: `src/features/organization-user/add/usecase.ts`
- Create: `src/features/organization-user/add/handler.ts`
- Test: `src/features/organization-user/add/repository.test.ts`
- Test: `src/features/organization-user/add/usecase.test.ts`

**Interfaces:**
- Consumes: Task 4 の共通部分、Task 2 の `requirePermission`
- Produces:
  - `addUserSchema` / `type AddUserInput = { userId: string }`
  - `type AddUserPort = (input: { userId: string; organizationId: string }) => Effect.Effect<void, OrganizationUserError>`
  - `addUserInDb: AddUserPort`
  - `addUser(port, input, organizationId): Effect.Effect<void, OrganizationUserError>`
  - `addUserAction: OrganizationUserFormAction`（`"use server"`）

- [ ] **Step 1: repository のテストを書く**

`src/features/organization-user/add/repository.test.ts` を新規作成:

```typescript
import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { failureTag } from "@/shared/testing/exit";

const create = vi.fn();
const findManyPermission = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    organizationUser: { create: (args: unknown) => create(args) },
    permission: { findMany: (args: unknown) => findManyPermission(args) },
  },
}));

const { addUserInDb } = await import("./repository");

const input = { userId: "u1", organizationId: "o1" };

describe("addUserInDb", () => {
  beforeEach(() => {
    create.mockReset();
    findManyPermission.mockReset();
    findManyPermission.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    create.mockResolvedValue({ userId: "u1" });
  });

  it("所属行と全権限を 1 回の nested write でまとめて作る", async () => {
    // 所属だけ作って権限が入らない実装に後退すると、追加直後に
    // 何もできないユーザーが生まれる。
    const exit = await Effect.runPromiseExit(addUserInDb(input));

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          organizationId: "o1",
          userId: "u1",
          permissions: {
            create: [{ permissionId: 1 }, { permissionId: 2 }],
          },
        },
      }),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
  });

  it("P2002 は AlreadyMember に写す", async () => {
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "7.10.0",
      }),
    );

    const exit = await Effect.runPromiseExit(addUserInDb(input));

    expect(failureTag(exit)).toBe("AlreadyMember");
  });

  it("P2003 は UserNotFound に写す（追加直前にユーザーが消えた場合）", async () => {
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("fk", {
        code: "P2003",
        clientVersion: "7.10.0",
      }),
    );

    const exit = await Effect.runPromiseExit(addUserInDb(input));

    expect(failureTag(exit)).toBe("UserNotFound");
  });

  it("それ以外の例外は UnexpectedOrganizationUserError に写す", async () => {
    create.mockRejectedValue(new Error("network"));

    const exit = await Effect.runPromiseExit(addUserInDb(input));

    expect(failureTag(exit)).toBe("UnexpectedOrganizationUserError");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/features/organization-user/add/repository.test.ts
```

期待: FAIL。

- [ ] **Step 3: schema.ts と repository.ts を実装する**

`src/features/organization-user/add/schema.ts` を新規作成:

```typescript
import { z } from "zod";

export const addUserSchema = z.object({
  // 検索結果から渡ってくる User.id。値の正当性は DB の外部キーが担保する。
  userId: z.string().min(1, "追加するユーザーを選んでください"),
});

export type AddUserInput = z.infer<typeof addUserSchema>;
```

`src/features/organization-user/add/repository.ts` を新規作成:

```typescript
import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type OrganizationUserError, toOrganizationUserError } from "../errors";

export type AddUserPort = (input: {
  userId: string;
  organizationId: string;
}) => Effect.Effect<void, OrganizationUserError>;

export const addUserInDb: AddUserPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      const permissions = await prisma.permission.findMany({
        select: { id: true },
      });

      // 所属行と権限は必ず同時に作る。分けると、権限を持たないまま
      // 何もできないユーザーが残り得る。
      await prisma.organizationUser.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          // 設計どおり、追加されたユーザーには全権限を付与する。
          permissions: {
            create: permissions.map((permission) => ({
              permissionId: permission.id,
            })),
          },
        },
      });
    },
    catch: (reason) => toOrganizationUserError(reason, input.userId),
  });
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
pnpm exec vitest run src/features/organization-user/add/repository.test.ts
```

期待: 全 PASS。

- [ ] **Step 5: usecase のテストを書く**

`src/features/organization-user/add/usecase.test.ts` を新規作成:

```typescript
import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import { AlreadyMember } from "../errors";
import type { AddUserPort } from "./repository";
import { addUser } from "./usecase";

describe("addUser", () => {
  it("入力と組織 id を合わせて port に渡す", async () => {
    const port = vi.fn(() =>
      Effect.succeed(undefined),
    ) as unknown as AddUserPort;

    const exit = await Effect.runPromiseExit(
      addUser(port, { userId: "u1" }, "o1"),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({ userId: "u1", organizationId: "o1" });
  });

  it("port の失敗をそのまま伝える", async () => {
    const port: AddUserPort = () =>
      Effect.fail(new AlreadyMember({ userId: "u1" }));

    const exit = await Effect.runPromiseExit(
      addUser(port, { userId: "u1" }, "o1"),
    );

    expect(failureTag(exit)).toBe("AlreadyMember");
  });
});
```

- [ ] **Step 6: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/features/organization-user/add/usecase.test.ts
```

期待: FAIL。

- [ ] **Step 7: usecase.ts を実装する**

`src/features/organization-user/add/usecase.ts` を新規作成:

```typescript
import type { Effect } from "effect";
import type { OrganizationUserError } from "../errors";
import type { AddUserPort } from "./repository";
import type { AddUserInput } from "./schema";

export const addUser = (
  port: AddUserPort,
  input: AddUserInput,
  organizationId: string,
): Effect.Effect<void, OrganizationUserError> =>
  port({ ...input, organizationId });
```

- [ ] **Step 8: handler.ts を実装する**

`src/features/organization-user/add/handler.ts` を新規作成:

```typescript
"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/shared/middleware/require-organization";
import { organizationUserErrorFormState } from "../effect-to-form-state";
import type { OrganizationUserFormState } from "../state";
import { addUserInDb } from "./repository";
import { addUserSchema } from "./schema";
import { addUser } from "./usecase";

export const addUserAction = async (
  _prevState: OrganizationUserFormState,
  formData: FormData,
): Promise<OrganizationUserFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const { organization } = await requirePermission(slug, "user.add");

  const parsed = addUserSchema.safeParse({
    userId: String(formData.get("userId") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    addUser(addUserInDb, parsed.data, organization.id),
  );

  if (Exit.isFailure(exit)) {
    return organizationUserErrorFormState(exit.cause);
  }

  // 追加は即時反映。一覧を描き直したいだけなので redirect はしない。
  revalidatePath(`/orgs/${slug}/users`);
  return { error: null };
};
```

- [ ] **Step 9: 全テストと型チェックと lint**

```bash
pnpm test && pnpm typecheck && pnpm lint
```

期待: すべてエラー 0。

- [ ] **Step 10: コミット**

```bash
git add src/features/organization-user/add
git commit -m "feat(org-user): add user to organization with all permissions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: ユーザー削除スライス

自分自身は削除できない。ボタンを隠すだけでは境界にならないので、handler でも拒否する。

**Files:**
- Create: `src/features/organization-user/remove/schema.ts`
- Create: `src/features/organization-user/remove/repository.ts`
- Create: `src/features/organization-user/remove/usecase.ts`
- Create: `src/features/organization-user/remove/handler.ts`
- Test: `src/features/organization-user/remove/repository.test.ts`
- Test: `src/features/organization-user/remove/usecase.test.ts`
- Test: `src/features/organization-user/remove/handler.test.ts`

**Interfaces:**
- Consumes: Task 4 の共通部分、Task 2 の `requirePermission`
- Produces:
  - `removeUserSchema` / `type RemoveUserInput = { userId: string }`
  - `type RemoveUserPort = (input: { userId: string; organizationId: string }) => Effect.Effect<{ removed: number }, OrganizationUserError>`
  - `removeUserInDb: RemoveUserPort`
  - `removeUser(port, input, organizationId): Effect.Effect<{ removed: number }, OrganizationUserError>`
  - `removeUserAction: OrganizationUserFormAction`（`"use server"`）

- [ ] **Step 1: repository のテストを書く**

`src/features/organization-user/remove/repository.test.ts` を新規作成:

```typescript
import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";

const deleteMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    organizationUser: { deleteMany: (args: unknown) => deleteMany(args) },
  },
}));

const { removeUserInDb } = await import("./repository");

describe("removeUserInDb", () => {
  beforeEach(() => {
    deleteMany.mockReset();
  });

  it("organizationId と userId の両方を where に含めて消す", async () => {
    // userId だけで消すと、他組織の所属まで巻き添えで消える。
    deleteMany.mockResolvedValue({ count: 1 });

    const exit = await Effect.runPromiseExit(
      removeUserInDb({ userId: "u1", organizationId: "o1" }),
    );

    expect(deleteMany).toHaveBeenCalledWith({
      where: { organizationId: "o1", userId: "u1" },
    });
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ removed: 1 });
    }
  });

  it("0 件でもエラーにせず件数として返す（404 判定は handler の仕事）", async () => {
    deleteMany.mockResolvedValue({ count: 0 });

    const exit = await Effect.runPromiseExit(
      removeUserInDb({ userId: "u1", organizationId: "o1" }),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ removed: 0 });
    }
  });

  it("例外は UnexpectedOrganizationUserError に写す", async () => {
    deleteMany.mockRejectedValue(new Error("network"));

    const exit = await Effect.runPromiseExit(
      removeUserInDb({ userId: "u1", organizationId: "o1" }),
    );

    expect(failureTag(exit)).toBe("UnexpectedOrganizationUserError");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/features/organization-user/remove/repository.test.ts
```

期待: FAIL。

- [ ] **Step 3: schema.ts / repository.ts / usecase.ts を実装する**

`src/features/organization-user/remove/schema.ts` を新規作成:

```typescript
import { z } from "zod";

export const removeUserSchema = z.object({
  userId: z.string().min(1, "削除するユーザーを選んでください"),
});

export type RemoveUserInput = z.infer<typeof removeUserSchema>;
```

`src/features/organization-user/remove/repository.ts` を新規作成:

```typescript
import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type OrganizationUserError, toOrganizationUserError } from "../errors";

export type RemoveUserPort = (input: {
  userId: string;
  organizationId: string;
}) => Effect.Effect<{ removed: number }, OrganizationUserError>;

export const removeUserInDb: RemoveUserPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      // deleteMany を使うのは、所有権を where に残したまま件数を取るため。
      // 権限行は OrganizationUserPermission の onDelete: Cascade で一緒に消える。
      const result = await prisma.organizationUser.deleteMany({
        where: { organizationId: input.organizationId, userId: input.userId },
      });
      return { removed: result.count };
    },
    catch: (reason) => toOrganizationUserError(reason, input.userId),
  });
```

`src/features/organization-user/remove/usecase.ts` を新規作成:

```typescript
import type { Effect } from "effect";
import type { OrganizationUserError } from "../errors";
import type { RemoveUserPort } from "./repository";
import type { RemoveUserInput } from "./schema";

export const removeUser = (
  port: RemoveUserPort,
  input: RemoveUserInput,
  organizationId: string,
): Effect.Effect<{ removed: number }, OrganizationUserError> =>
  port({ ...input, organizationId });
```

- [ ] **Step 4: usecase のテストを書く**

`src/features/organization-user/remove/usecase.test.ts` を新規作成:

```typescript
import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import { UnexpectedOrganizationUserError } from "../errors";
import type { RemoveUserPort } from "./repository";
import { removeUser } from "./usecase";

describe("removeUser", () => {
  it("入力と組織 id を合わせて port に渡す", async () => {
    const port = vi.fn(() =>
      Effect.succeed({ removed: 1 }),
    ) as unknown as RemoveUserPort;

    const exit = await Effect.runPromiseExit(
      removeUser(port, { userId: "u1" }, "o1"),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({ userId: "u1", organizationId: "o1" });
  });

  it("port の失敗をそのまま伝える", async () => {
    const port: RemoveUserPort = () =>
      Effect.fail(new UnexpectedOrganizationUserError({ reason: "boom" }));

    const exit = await Effect.runPromiseExit(
      removeUser(port, { userId: "u1" }, "o1"),
    );

    expect(failureTag(exit)).toBe("UnexpectedOrganizationUserError");
  });
});
```

- [ ] **Step 5: handler のテストを書く**

`src/features/organization-user/remove/handler.test.ts` を新規作成:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermission = vi.fn();
const removeUserInDb = vi.fn();
const revalidatePath = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/shared/middleware/require-organization", () => ({
  requirePermission: (slug: string, code: string) =>
    requirePermission(slug, code),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
}));

vi.mock("./repository", () => ({
  removeUserInDb: (input: unknown) => removeUserInDb(input),
}));

const { removeUserAction } = await import("./handler");

const formData = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
};

const initial = { error: null };

describe("removeUserAction", () => {
  beforeEach(() => {
    requirePermission.mockReset();
    removeUserInDb.mockReset();
    revalidatePath.mockReset();
    notFound.mockClear();
    requirePermission.mockResolvedValue({
      session: { user: { id: "me" } },
      organization: { id: "o1", slug: "tennis" },
    });
    removeUserInDb.mockImplementation(async () => ({ removed: 1 }));
  });

  it("user.remove を要求する", async () => {
    await removeUserAction(initial, formData({ slug: "tennis", userId: "u1" }));

    expect(requirePermission).toHaveBeenCalledWith("tennis", "user.remove");
  });

  it("自分自身を削除しようとしたら拒否し、DB を触らない", async () => {
    // ボタンを隠すのは体感のためで、境界はここ。Server Action は直接叩ける。
    const state = await removeUserAction(
      initial,
      formData({ slug: "tennis", userId: "me" }),
    );

    expect(state.error).toBe("自分自身をこの組織から削除することはできません");
    expect(removeUserInDb).not.toHaveBeenCalled();
  });

  it("削除できたら一覧を再検証する", async () => {
    const state = await removeUserAction(
      initial,
      formData({ slug: "tennis", userId: "u1" }),
    );

    expect(state).toEqual({ error: null });
    expect(revalidatePath).toHaveBeenCalledWith("/orgs/tennis/users");
  });

  it("0 件なら notFound を呼ぶ（表示後に所属が消えていた場合）", async () => {
    removeUserInDb.mockImplementation(async () => ({ removed: 0 }));

    await expect(
      removeUserAction(initial, formData({ slug: "tennis", userId: "u1" })),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("権限が無ければ requirePermission の時点で打ち切られ、DB を触らない", async () => {
    requirePermission.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(
      removeUserAction(initial, formData({ slug: "tennis", userId: "u1" })),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(removeUserInDb).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/features/organization-user/remove
```

期待: `Failed to resolve import "./handler"` で FAIL。

- [ ] **Step 7: handler.ts を実装する**

`src/features/organization-user/remove/handler.ts` を新規作成:

```typescript
"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { requirePermission } from "@/shared/middleware/require-organization";
import { organizationUserErrorFormState } from "../effect-to-form-state";
import type { OrganizationUserFormState } from "../state";
import { removeUserInDb } from "./repository";
import { removeUserSchema } from "./schema";
import { removeUser } from "./usecase";

export const removeUserAction = async (
  _prevState: OrganizationUserFormState,
  formData: FormData,
): Promise<OrganizationUserFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const { session, organization } = await requirePermission(
    slug,
    "user.remove",
  );

  const parsed = removeUserSchema.safeParse({
    userId: String(formData.get("userId") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // 一覧でボタンを隠していても Server Action は直接叩ける。境界はここ。
  // 自分を消せると、権限を持つ最後の 1 人が抜けて誰も操作できなくなり得る。
  if (parsed.data.userId === session.user.id) {
    return { error: "自分自身をこの組織から削除することはできません" };
  }

  const exit = await Effect.runPromiseExit(
    removeUser(removeUserInDb, parsed.data, organization.id),
  );

  if (Exit.isFailure(exit)) {
    return organizationUserErrorFormState(exit.cause);
  }

  // 0 件は一覧表示後に所属が消えたことを意味する。存在を漏らさないよう 404。
  if (exit.value.removed === 0) {
    notFound();
  }

  revalidatePath(`/orgs/${slug}/users`);
  return { error: null };
};
```

- [ ] **Step 8: テストが通ることを確認する**

```bash
pnpm exec vitest run src/features/organization-user/remove
```

期待: 全 PASS。

- [ ] **Step 9: 全テストと型チェックと lint**

```bash
pnpm test && pnpm typecheck && pnpm lint
```

期待: すべてエラー 0。

- [ ] **Step 10: コミット**

```bash
git add src/features/organization-user/remove
git commit -m "feat(org-user): remove user from organization

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 8: 権限付与・剥奪スライス

チェックボックスの状態を丸ごと受け取り、その組織ユーザーの権限を置き換える。自分の `user.grant` は外せない。

**Files:**
- Create: `src/features/organization-user/grant/schema.ts`
- Create: `src/features/organization-user/grant/repository.ts`
- Create: `src/features/organization-user/grant/usecase.ts`
- Create: `src/features/organization-user/grant/handler.ts`
- Test: `src/features/organization-user/grant/schema.test.ts`
- Test: `src/features/organization-user/grant/repository.test.ts`
- Test: `src/features/organization-user/grant/handler.test.ts`

**Interfaces:**
- Consumes: Task 4 の共通部分、Task 2 の `requirePermission`
- Produces:
  - `grantPermissionsSchema` / `type GrantPermissionsInput = { userId: string; codes: string[] }`
  - `type GrantPermissionsPort = (input: { userId: string; organizationId: string; codes: string[] }) => Effect.Effect<{ updated: number }, OrganizationUserError>`
  - `grantPermissionsInDb: GrantPermissionsPort`
  - `grantPermissions(port, input, organizationId): Effect.Effect<{ updated: number }, OrganizationUserError>`
  - `grantPermissionsAction: OrganizationUserFormAction`（`"use server"`）

- [ ] **Step 1: schema のテストを書く**

`src/features/organization-user/grant/schema.test.ts` を新規作成:

```typescript
import { describe, expect, it } from "vitest";
import { grantPermissionsSchema } from "./schema";

describe("grantPermissionsSchema", () => {
  it("既知の権限コードだけを受け取る", () => {
    const parsed = grantPermissionsSchema.safeParse({
      userId: "u1",
      codes: ["user.view", "user.add"],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.codes).toEqual(["user.view", "user.add"]);
    }
  });

  it("チェックが 0 件でも受け取る（全権限の剥奪は正当な操作）", () => {
    const parsed = grantPermissionsSchema.safeParse({
      userId: "u1",
      codes: [],
    });

    expect(parsed.success).toBe(true);
  });

  it("未知のコードが混ざっていたら弾く", () => {
    // 画面に無いコードを送り込んで権限を捏造されないようにする。
    const parsed = grantPermissionsSchema.safeParse({
      userId: "u1",
      codes: ["user.view", "system.root"],
    });

    expect(parsed.success).toBe(false);
  });

  it("重複したコードは 1 つにまとめる", () => {
    const parsed = grantPermissionsSchema.safeParse({
      userId: "u1",
      codes: ["user.view", "user.view"],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.codes).toEqual(["user.view"]);
    }
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/features/organization-user/grant/schema.test.ts
```

期待: FAIL。

- [ ] **Step 3: schema.ts を実装する**

`src/features/organization-user/grant/schema.ts` を新規作成:

```typescript
import { z } from "zod";
import { PERMISSION_CODES } from "@/shared/authz/ability";

export const grantPermissionsSchema = z.object({
  userId: z.string().min(1, "対象のユーザーが不明です"),
  codes: z
    // enum で縛ることで、画面に無いコードを送り込んで権限を捏造されるのを防ぐ。
    .array(z.enum(PERMISSION_CODES))
    // 同じ値が 2 度来ても複合主キーの衝突にならないよう、ここで潰す。
    .transform((values) => [...new Set(values)]),
});

export type GrantPermissionsInput = z.infer<typeof grantPermissionsSchema>;
```

- [ ] **Step 4: repository のテストを書く**

`src/features/organization-user/grant/repository.test.ts` を新規作成:

```typescript
import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";

const findFirstMembership = vi.fn();
const findManyPermission = vi.fn();
const deleteManyGrant = vi.fn();
const createManyGrant = vi.fn();
const transaction = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    // $transaction にはコールバックを渡す。tx として同じモック群を渡すことで、
    // トランザクション内の呼び出しもそのまま検証できる。
    $transaction: (callback: (tx: unknown) => unknown) => {
      transaction(callback);
      return callback({
        organizationUser: {
          findFirst: (args: unknown) => findFirstMembership(args),
        },
        permission: { findMany: (args: unknown) => findManyPermission(args) },
        organizationUserPermission: {
          deleteMany: (args: unknown) => deleteManyGrant(args),
          createMany: (args: unknown) => createManyGrant(args),
        },
      });
    },
  },
}));

const { grantPermissionsInDb } = await import("./repository");

const input = {
  userId: "u1",
  organizationId: "o1",
  codes: ["user.view", "user.add"],
};

describe("grantPermissionsInDb", () => {
  beforeEach(() => {
    findFirstMembership.mockReset();
    findManyPermission.mockReset();
    deleteManyGrant.mockReset();
    createManyGrant.mockReset();
    transaction.mockReset();
    findFirstMembership.mockResolvedValue({ userId: "u1" });
    findManyPermission.mockResolvedValue([
      { id: 1, code: "user.view" },
      { id: 2, code: "user.add" },
    ]);
    deleteManyGrant.mockResolvedValue({ count: 3 });
    createManyGrant.mockResolvedValue({ count: 2 });
  });

  it("所属を確認してから、既存の権限を消して指定分を入れ直す", async () => {
    const exit = await Effect.runPromiseExit(grantPermissionsInDb(input));

    expect(findFirstMembership).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "o1", userId: "u1" },
      }),
    );
    expect(deleteManyGrant).toHaveBeenCalledWith({
      where: { organizationId: "o1", userId: "u1" },
    });
    expect(createManyGrant).toHaveBeenCalledWith({
      data: [
        { organizationId: "o1", userId: "u1", permissionId: 1 },
        { organizationId: "o1", userId: "u1", permissionId: 2 },
      ],
    });
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ updated: 1 });
    }
  });

  it("削除と挿入を 1 つのトランザクションで行う（権限が空のまま残る窓を作らない）", async () => {
    await Effect.runPromiseExit(grantPermissionsInDb(input));

    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("codes が空なら削除だけ行い、createMany は呼ばない", async () => {
    await Effect.runPromiseExit(
      grantPermissionsInDb({ ...input, codes: [] }),
    );

    expect(deleteManyGrant).toHaveBeenCalled();
    expect(createManyGrant).not.toHaveBeenCalled();
  });

  it("所属していなければ NotAMember を返し、権限を触らない", async () => {
    findFirstMembership.mockResolvedValue(null);

    const exit = await Effect.runPromiseExit(grantPermissionsInDb(input));

    expect(failureTag(exit)).toBe("NotAMember");
    expect(deleteManyGrant).not.toHaveBeenCalled();
  });

  it("例外は UnexpectedOrganizationUserError に写す", async () => {
    deleteManyGrant.mockRejectedValue(new Error("network"));

    const exit = await Effect.runPromiseExit(grantPermissionsInDb(input));

    expect(failureTag(exit)).toBe("UnexpectedOrganizationUserError");
  });
});
```

- [ ] **Step 5: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/features/organization-user/grant/repository.test.ts
```

期待: FAIL。

- [ ] **Step 6: repository.ts と usecase.ts を実装する**

`src/features/organization-user/grant/repository.ts` を新規作成:

```typescript
import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import {
  NotAMember,
  type OrganizationUserError,
  toOrganizationUserError,
} from "../errors";

export type GrantPermissionsPort = (input: {
  userId: string;
  organizationId: string;
  codes: string[];
}) => Effect.Effect<{ updated: number }, OrganizationUserError>;

/**
 * 差分を計算せず、まとめて消してから入れ直す。チェックボックスの状態が
 * そのまま「あるべき権限の全体」なので、差分計算は状態を増やすだけになる。
 */
export const grantPermissionsInDb: GrantPermissionsPort = (input) =>
  Effect.tryPromise({
    try: () =>
      prisma.$transaction(async (tx) => {
        // 所有権のチェック。organizationId を where に含めることで、
        // 他組織のユーザーの権限を書き換えられない。
        const membership = await tx.organizationUser.findFirst({
          where: { organizationId: input.organizationId, userId: input.userId },
          select: { userId: true },
        });
        if (membership === null) {
          throw new NotAMember({ userId: input.userId });
        }

        const permissions = await tx.permission.findMany({
          where: { code: { in: input.codes } },
          select: { id: true, code: true },
        });

        // 消して入れ直すのを 1 トランザクションに閉じる。分けると、
        // 権限が空のまま見える瞬間ができる。
        await tx.organizationUserPermission.deleteMany({
          where: { organizationId: input.organizationId, userId: input.userId },
        });

        if (permissions.length > 0) {
          await tx.organizationUserPermission.createMany({
            data: permissions.map((permission) => ({
              organizationId: input.organizationId,
              userId: input.userId,
              permissionId: permission.id,
            })),
          });
        }

        return { updated: 1 };
      }),
    catch: (reason) =>
      // NotAMember は自分で投げた制御用の値なので、そのまま通す。
      reason instanceof NotAMember
        ? reason
        : toOrganizationUserError(reason, input.userId),
  });
```

`src/features/organization-user/grant/usecase.ts` を新規作成:

```typescript
import type { Effect } from "effect";
import type { OrganizationUserError } from "../errors";
import type { GrantPermissionsPort } from "./repository";
import type { GrantPermissionsInput } from "./schema";

export const grantPermissions = (
  port: GrantPermissionsPort,
  input: GrantPermissionsInput,
  organizationId: string,
): Effect.Effect<{ updated: number }, OrganizationUserError> =>
  port({ ...input, organizationId });
```

- [ ] **Step 7: テストが通ることを確認する**

```bash
pnpm exec vitest run src/features/organization-user/grant/repository.test.ts
```

期待: 全 PASS。`permission.findMany` の呼び出し引数が期待と違うと落ちるので、その場合はテストの `findManyPermission` の戻り値ではなく実装側の `where` を確認する。

- [ ] **Step 8: handler のテストを書く**

`src/features/organization-user/grant/handler.test.ts` を新規作成:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermission = vi.fn();
const grantPermissionsInDb = vi.fn();
const revalidatePath = vi.fn();
const redirect = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/shared/middleware/require-organization", () => ({
  requirePermission: (slug: string, code: string) =>
    requirePermission(slug, code),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirect(path),
  notFound: () => notFound(),
}));

vi.mock("./repository", () => ({
  grantPermissionsInDb: (input: unknown) => grantPermissionsInDb(input),
}));

const { grantPermissionsAction } = await import("./handler");

/** codes は同名で複数入るため、FormData を直接組み立てる。 */
const formData = (
  fields: { slug: string; userId: string },
  codes: string[],
) => {
  const data = new FormData();
  data.set("slug", fields.slug);
  data.set("userId", fields.userId);
  for (const code of codes) {
    data.append("permissionCode", code);
  }
  return data;
};

const initial = { error: null };

describe("grantPermissionsAction", () => {
  beforeEach(() => {
    requirePermission.mockReset();
    grantPermissionsInDb.mockReset();
    revalidatePath.mockReset();
    redirect.mockClear();
    notFound.mockClear();
    requirePermission.mockResolvedValue({
      session: { user: { id: "me" } },
      organization: { id: "o1", slug: "tennis" },
    });
    grantPermissionsInDb.mockImplementation(async () => ({ updated: 1 }));
  });

  it("user.grant を要求する", async () => {
    await expect(
      grantPermissionsAction(
        initial,
        formData({ slug: "tennis", userId: "u1" }, ["user.view"]),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(requirePermission).toHaveBeenCalledWith("tennis", "user.grant");
  });

  it("チェックされた権限コードだけを渡す", async () => {
    await expect(
      grantPermissionsAction(
        initial,
        formData({ slug: "tennis", userId: "u1" }, ["user.view", "org.edit"]),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(grantPermissionsInDb).toHaveBeenCalledWith({
      userId: "u1",
      organizationId: "o1",
      codes: ["user.view", "org.edit"],
    });
  });

  it("自分自身から user.grant を外そうとしたら拒否し、DB を触らない", async () => {
    // 最後の user.grant 保持者が自分を降格すると、誰も権限を戻せなくなる。
    const state = await grantPermissionsAction(
      initial,
      formData({ slug: "tennis", userId: "me" }, ["user.view"]),
    );

    expect(state.error).toBe("自分自身から権限の付与・剥奪の権限は外せません");
    expect(grantPermissionsInDb).not.toHaveBeenCalled();
  });

  it("自分自身でも user.grant を残していれば保存できる", async () => {
    await expect(
      grantPermissionsAction(
        initial,
        formData({ slug: "tennis", userId: "me" }, ["user.grant", "user.view"]),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(grantPermissionsInDb).toHaveBeenCalled();
  });

  it("保存できたら一覧へ戻す", async () => {
    await expect(
      grantPermissionsAction(
        initial,
        formData({ slug: "tennis", userId: "u1" }, ["user.view"]),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(revalidatePath).toHaveBeenCalledWith("/orgs/tennis/users");
    expect(redirect).toHaveBeenCalledWith("/orgs/tennis/users");
  });

  it("未知の権限コードが混ざっていたらエラーを返し、DB を触らない", async () => {
    const state = await grantPermissionsAction(
      initial,
      formData({ slug: "tennis", userId: "u1" }, ["system.root"]),
    );

    expect(state.error).not.toBeNull();
    expect(grantPermissionsInDb).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 9: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/features/organization-user/grant/handler.test.ts
```

期待: FAIL。

- [ ] **Step 10: handler.ts を実装する**

`src/features/organization-user/grant/handler.ts` を新規作成:

```typescript
"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/shared/middleware/require-organization";
import { organizationUserErrorFormState } from "../effect-to-form-state";
import type { OrganizationUserFormState } from "../state";
import { grantPermissionsInDb } from "./repository";
import { grantPermissionsSchema } from "./schema";
import { grantPermissions } from "./usecase";

export const grantPermissionsAction = async (
  _prevState: OrganizationUserFormState,
  formData: FormData,
): Promise<OrganizationUserFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const { session, organization } = await requirePermission(slug, "user.grant");

  const parsed = grantPermissionsSchema.safeParse({
    userId: String(formData.get("userId") ?? ""),
    // チェックボックスは同名で複数送られるため getAll で受ける。
    codes: formData.getAll("permissionCode").map((value) => String(value)),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // 最後の user.grant 保持者が自分から権限を外すと、誰も権限を戻せなくなる。
  // チェックボックスの無効化は体感のためで、境界はここ。
  if (
    parsed.data.userId === session.user.id &&
    !parsed.data.codes.includes("user.grant")
  ) {
    return { error: "自分自身から権限の付与・剥奪の権限は外せません" };
  }

  const exit = await Effect.runPromiseExit(
    grantPermissions(grantPermissionsInDb, parsed.data, organization.id),
  );

  if (Exit.isFailure(exit)) {
    return organizationUserErrorFormState(exit.cause);
  }

  if (exit.value.updated === 0) {
    notFound();
  }

  revalidatePath(`/orgs/${slug}/users`);
  // redirect は例外を投げて制御を打ち切るため、Effect の実行が終わった後に呼ぶ。
  redirect(`/orgs/${slug}/users`);
};
```

- [ ] **Step 11: テストが通ることを確認する**

```bash
pnpm exec vitest run src/features/organization-user/grant
```

期待: 全 PASS。

- [ ] **Step 12: 全テストと型チェックと lint**

```bash
pnpm test && pnpm typecheck && pnpm lint
```

期待: すべてエラー 0。

- [ ] **Step 13: コミット**

```bash
git add src/features/organization-user/grant
git commit -m "feat(org-user): grant and revoke permissions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 9: 一覧と追加フォームのコンポーネント

**Files:**
- Create: `src/components/organization-user/UserAvatar.tsx`
- Create: `src/components/organization-user/OrganizationUserList.tsx`
- Create: `src/components/organization-user/AddUserForm.tsx`
- Test: `src/components/organization-user/UserAvatar.test.tsx`
- Test: `src/components/organization-user/OrganizationUserList.test.tsx`
- Test: `src/components/organization-user/AddUserForm.test.tsx`

**Interfaces:**
- Consumes: Task 4 の `OrganizationUserSummary` / `UserSearchAction` / `OrganizationUserFormAction` / `INITIAL_USER_SEARCH_STATE` / `INITIAL_ORGANIZATION_USER_FORM_STATE`
- Produces:
  - `UserAvatar({ name, image })`
  - `OrganizationUserList({ slug, users, currentUserId, canRemove, canGrant, removeAction })`
  - `AddUserForm({ slug, searchAction, addAction })`

- [ ] **Step 1: UserAvatar のテストを書く**

`src/components/organization-user/UserAvatar.test.tsx` を新規作成:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UserAvatar } from "./UserAvatar";

describe("UserAvatar", () => {
  it("image があれば画像を表示する", () => {
    render(<UserAvatar name="竹添" image="https://example.com/a.png" />);

    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://example.com/a.png",
    );
  });

  it("image が無ければ名前の頭文字を表示する", () => {
    render(<UserAvatar name="竹添" image={null} />);

    expect(screen.getByText("竹")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("名前が空文字でも落ちない", () => {
    render(<UserAvatar name="" image={null} />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/components/organization-user/UserAvatar.test.tsx
```

期待: FAIL。

- [ ] **Step 3: UserAvatar.tsx を実装する**

`src/components/organization-user/UserAvatar.tsx` を新規作成:

```tsx
/**
 * ユーザーのアイコン。image は Google などの外部プロバイダの URL が入るため、
 * next/image の remotePatterns 設定なしで表示できる素の img を使う。
 */
export function UserAvatar({
  name,
  image,
}: {
  name: string;
  image: string | null;
}) {
  if (image !== null) {
    return (
      // biome-ignore lint/performance/noImgElement: 外部プロバイダのアイコン URL を設定なしで表示するため
      <img
        src={image}
        alt=""
        className="h-9 w-9 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-medium text-slate-600"
    >
      {name.slice(0, 1)}
    </span>
  );
}
```

`pnpm lint` が別のルール名を報告した場合は、`biome-ignore` の行をその名前に置き換える。ルール違反にならない場合は `biome-ignore` の行ごと削除する。

- [ ] **Step 4: テストが通ることを確認する**

```bash
pnpm exec vitest run src/components/organization-user/UserAvatar.test.tsx
```

期待: 全 PASS。

- [ ] **Step 5: OrganizationUserList のテストを書く**

`src/components/organization-user/OrganizationUserList.test.tsx` を新規作成:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrganizationUserSummary } from "@/features/organization-user/repository";
import { OrganizationUserList } from "./OrganizationUserList";

const removeAction = vi.fn(async () => ({ error: null }));

const users: OrganizationUserSummary[] = [
  {
    userId: "me",
    name: "竹添",
    username: "takezo",
    email: "takezo@example.com",
    image: null,
    permissionCodes: ["user.view", "user.add"],
    joinedAt: new Date("2026-08-01T00:00:00Z"),
  },
  {
    userId: "u2",
    name: "山田",
    username: "yamada",
    email: "yamada@example.com",
    image: null,
    permissionCodes: ["user.view"],
    joinedAt: new Date("2026-08-02T00:00:00Z"),
  },
];

const renderList = (
  overrides: Partial<Parameters<typeof OrganizationUserList>[0]> = {},
) =>
  render(
    <OrganizationUserList
      slug="tennis"
      users={users}
      currentUserId="me"
      canRemove={true}
      canGrant={true}
      removeAction={removeAction}
      {...overrides}
    />,
  );

describe("OrganizationUserList", () => {
  beforeEach(() => {
    removeAction.mockClear();
  });

  it("所属ユーザーの表示名とユーザー名とメールを出す", () => {
    renderList();

    expect(screen.getByText("竹添")).toBeInTheDocument();
    expect(screen.getByText("takezo")).toBeInTheDocument();
    expect(screen.getByText("takezo@example.com")).toBeInTheDocument();
  });

  it("保有権限の件数を出す", () => {
    renderList();

    expect(screen.getByText("権限 2 件")).toBeInTheDocument();
    expect(screen.getByText("権限 1 件")).toBeInTheDocument();
  });

  it("canGrant なら権限編集へのリンクを出す", () => {
    renderList();

    expect(
      screen.getByRole("link", { name: "山田 の権限を編集" }),
    ).toHaveAttribute("href", "/orgs/tennis/users/u2/permissions");
  });

  it("canGrant が false なら権限編集のリンクを出さない", () => {
    renderList({ canGrant: false });

    expect(screen.queryByRole("link", { name: /権限を編集/ })).toBeNull();
  });

  it("canRemove が false なら削除ボタンを出さない", () => {
    renderList({ canRemove: false });

    expect(screen.queryByRole("button", { name: /削除/ })).toBeNull();
  });

  it("自分自身の行には削除ボタンを出さない", () => {
    renderList();

    // 「山田 を削除」はあるが「竹添 を削除」は無い。
    expect(
      screen.getByRole("button", { name: "山田 を削除" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "竹添 を削除" })).toBeNull();
  });

  it("ユーザーが 0 人なら案内を出す", () => {
    renderList({ users: [] });

    expect(
      screen.getByText("この組織に所属しているユーザーはいません"),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/components/organization-user/OrganizationUserList.test.tsx
```

期待: FAIL。

- [ ] **Step 7: OrganizationUserList.tsx と RemoveUserButton を実装する**

`src/components/organization-user/OrganizationUserList.tsx` を新規作成:

```tsx
"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { OrganizationUserSummary } from "@/features/organization-user/repository";
import {
  INITIAL_ORGANIZATION_USER_FORM_STATE,
  type OrganizationUserFormAction,
} from "@/features/organization-user/state";
import { UserAvatar } from "./UserAvatar";

/**
 * 行ごとの削除フォーム。useActionState は 1 行に 1 つ要るため、
 * 行のコンポーネントとして切り出している。
 */
function RemoveUserButton({
  slug,
  user,
  action,
}: {
  slug: string;
  user: OrganizationUserSummary;
  action: OrganizationUserFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_ORGANIZATION_USER_FORM_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="userId" value={user.userId} />
      <button
        type="submit"
        disabled={pending}
        // 確認は onSubmit ではなく onClick で挟む。キャンセル時に
        // フォームの送信自体を起こさないため。
        onClick={(event) => {
          if (
            !window.confirm(`${user.name} をこの組織から削除しますか？`)
          ) {
            event.preventDefault();
          }
        }}
        className="rounded border border-red-300 px-3 py-1 text-xs text-red-700 disabled:opacity-50"
      >
        {pending ? "削除中..." : `${user.name} を削除`}
      </button>
      {state.error !== null && (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function OrganizationUserList({
  slug,
  users,
  currentUserId,
  canRemove,
  canGrant,
  removeAction,
}: {
  slug: string;
  users: OrganizationUserSummary[];
  currentUserId: string;
  canRemove: boolean;
  canGrant: boolean;
  removeAction: OrganizationUserFormAction;
}) {
  if (users.length === 0) {
    return (
      <p className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-500">
        この組織に所属しているユーザーはいません
      </p>
    );
  }

  return (
    <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
      {users.map((user) => (
        <li key={user.userId} className="flex items-center gap-3 p-4">
          <UserAvatar name={user.name} image={user.image} />

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">
              {user.name}
            </p>
            <p className="truncate text-xs text-slate-500">{user.username}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>

          <p className="shrink-0 text-xs text-slate-500">
            権限 {user.permissionCodes.length} 件
          </p>

          {canGrant && (
            <Link
              href={`/orgs/${slug}/users/${user.userId}/permissions`}
              className="shrink-0 rounded border border-slate-300 px-3 py-1 text-xs text-slate-700"
            >
              {user.name} の権限を編集
            </Link>
          )}

          {/* 自分を消せると、権限を持つ最後の 1 人が抜けて誰も操作できなくなり得る。
              ボタンを隠すのは体感のためで、拒否の境界は Server Action 側にある。 */}
          {canRemove && user.userId !== currentUserId && (
            <RemoveUserButton slug={slug} user={user} action={removeAction} />
          )}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 8: テストが通ることを確認する**

```bash
pnpm exec vitest run src/components/organization-user/OrganizationUserList.test.tsx
```

期待: 全 PASS。

- [ ] **Step 9: AddUserForm のテストを書く**

`src/components/organization-user/AddUserForm.test.tsx` を新規作成:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FoundUser } from "@/features/organization-user/state";
import { AddUserForm } from "./AddUserForm";

const searchAction = vi.fn();
const addAction = vi.fn(async () => ({ error: null }));

const found: FoundUser = {
  id: "u2",
  name: "山田",
  username: "yamada",
  email: "yamada@example.com",
  image: null,
  alreadyMember: false,
};

const renderForm = () =>
  render(
    <AddUserForm
      slug="tennis"
      searchAction={searchAction}
      addAction={addAction}
    />,
  );

describe("AddUserForm", () => {
  beforeEach(() => {
    searchAction.mockReset();
    addAction.mockClear();
    searchAction.mockImplementation(async () => ({
      error: null,
      user: found,
    }));
  });

  it("検索前は確認欄を出さない", () => {
    renderForm();

    expect(screen.queryByRole("button", { name: "追加" })).toBeNull();
  });

  it("検索するとアイコン・表示名・ユーザー名を出して確認させる", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(
      screen.getByLabelText("ユーザー名またはメールアドレス"),
      "yamada",
    );
    await user.click(screen.getByRole("button", { name: "検索" }));

    expect(await screen.findByText("山田")).toBeInTheDocument();
    expect(screen.getByText("yamada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "追加" })).toBeInTheDocument();
  });

  it("既に所属しているユーザーには追加ボタンを出さない", async () => {
    searchAction.mockImplementation(async () => ({
      error: null,
      user: { ...found, alreadyMember: true },
    }));
    const user = userEvent.setup();
    renderForm();

    await user.type(
      screen.getByLabelText("ユーザー名またはメールアドレス"),
      "yamada",
    );
    await user.click(screen.getByRole("button", { name: "検索" }));

    expect(await screen.findByText("既に所属しています")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "追加" })).toBeNull();
  });

  it("検索が失敗したら文言を出す", async () => {
    searchAction.mockImplementation(async () => ({
      error: "該当するユーザーが見つかりません",
      user: null,
    }));
    const user = userEvent.setup();
    renderForm();

    await user.type(
      screen.getByLabelText("ユーザー名またはメールアドレス"),
      "nobody",
    );
    await user.click(screen.getByRole("button", { name: "検索" }));

    expect(
      await screen.findByText("該当するユーザーが見つかりません"),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 10: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/components/organization-user/AddUserForm.test.tsx
```

期待: FAIL。

- [ ] **Step 11: AddUserForm.tsx を実装する**

`src/components/organization-user/AddUserForm.tsx` を新規作成:

```tsx
"use client";

import { useActionState } from "react";
import {
  INITIAL_ORGANIZATION_USER_FORM_STATE,
  INITIAL_USER_SEARCH_STATE,
  type OrganizationUserFormAction,
  type UserSearchAction,
} from "@/features/organization-user/state";
import { UserAvatar } from "./UserAvatar";

/**
 * 検索と追加で別の form にしているのは、1 つの form が持てる action が
 * 1 つだけだから。検索結果は searchState に残るので、追加の送信後も
 * 確認欄は消えずに残る。
 */
export function AddUserForm({
  slug,
  searchAction,
  addAction,
}: {
  slug: string;
  searchAction: UserSearchAction;
  addAction: OrganizationUserFormAction;
}) {
  const [searchState, runSearch, searching] = useActionState(
    searchAction,
    INITIAL_USER_SEARCH_STATE,
  );
  const [addState, runAdd, adding] = useActionState(
    addAction,
    INITIAL_ORGANIZATION_USER_FORM_STATE,
  );

  return (
    <section className="space-y-3 rounded border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-bold text-slate-700">ユーザーを追加</h2>

      <form action={runSearch} className="space-y-2">
        <input type="hidden" name="slug" value={slug} />
        <label
          htmlFor="query"
          className="block text-sm font-medium text-slate-700"
        >
          ユーザー名またはメールアドレス
        </label>
        <div className="flex gap-2">
          <input
            id="query"
            name="query"
            type="text"
            required
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={searching}
            className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 disabled:opacity-50"
          >
            {searching ? "検索中..." : "検索"}
          </button>
        </div>
        <p className="text-xs text-slate-500">完全一致で 1 件だけ探します</p>
        {searchState.error !== null && (
          <p role="alert" className="text-sm text-red-600">
            {searchState.error}
          </p>
        )}
      </form>

      {searchState.user !== null && (
        <form
          action={runAdd}
          className="flex items-center gap-3 rounded border border-slate-200 bg-slate-50 p-3"
        >
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="userId" value={searchState.user.id} />

          <UserAvatar
            name={searchState.user.name}
            image={searchState.user.image}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">
              {searchState.user.name}
            </p>
            <p className="truncate text-xs text-slate-500">
              {searchState.user.username}
            </p>
          </div>

          {searchState.user.alreadyMember ? (
            <p className="shrink-0 text-xs text-slate-500">
              既に所属しています
            </p>
          ) : (
            <button
              type="submit"
              disabled={adding}
              className="shrink-0 rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {adding ? "追加中..." : "追加"}
            </button>
          )}
        </form>
      )}

      {addState.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {addState.error}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 12: 全テストと型チェックと lint**

```bash
pnpm test && pnpm typecheck && pnpm lint
```

期待: すべてエラー 0。

- [ ] **Step 13: コミット**

```bash
git add src/components/organization-user
git commit -m "feat(org-user): add user list and add-user form components

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 10: ユーザー一覧ページ

**Files:**
- Create: `src/app/orgs/[slug]/users/page.tsx`
- Test: `src/app/orgs/[slug]/users/page.test.tsx`
- Modify: `src/app/orgs/[slug]/page.tsx`（ユーザー管理へのリンク追加）
- Modify: `src/app/orgs/[slug]/page.test.tsx`（リンクの有無のテスト追加）

**Interfaces:**
- Consumes: Task 2 の `requirePermission` / `canByCode`、Task 4 の `listUsersInOrganization`、Task 5〜7 の各 Action、Task 9 のコンポーネント
- Produces: `/orgs/[slug]/users` のページ

- [ ] **Step 1: ページのテストを書く**

`src/app/orgs/[slug]/users/page.test.tsx` を新規作成:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineAbilityFor, PERMISSION_CODES } from "@/shared/authz/ability";

vi.mock("@/components/auth/LogoutButton", () => ({
  LogoutButton: () => <button type="button">ログアウト</button>,
}));

const callOrder: string[] = [];

const requirePermission = vi.fn();
const listUsersInOrganization = vi.fn();

vi.mock("@/shared/middleware/require-organization", () => ({
  requirePermission: (slug: string, code: string) => {
    callOrder.push("requirePermission");
    return requirePermission(slug, code);
  },
}));

vi.mock("@/features/organization-user/repository", () => ({
  listUsersInOrganization: (organizationId: string) => {
    callOrder.push("listUsersInOrganization");
    return listUsersInOrganization(organizationId);
  },
}));

// Server Action は import されるだけで、このテストでは呼ばれない。
vi.mock("@/features/organization-user/search/handler", () => ({
  searchUserAction: vi.fn(),
}));
vi.mock("@/features/organization-user/add/handler", () => ({
  addUserAction: vi.fn(),
}));
vi.mock("@/features/organization-user/remove/handler", () => ({
  removeUserAction: vi.fn(),
}));

const { default: OrganizationUsersPage } = await import("./page");

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

const users = [
  {
    userId: "me",
    name: "竹添",
    username: "takezo",
    email: "takezo@example.com",
    image: null,
    permissionCodes: ["user.view"],
    joinedAt: new Date("2026-08-01T00:00:00Z"),
  },
];

describe("OrganizationUsersPage", () => {
  beforeEach(() => {
    requirePermission.mockReset();
    listUsersInOrganization.mockReset();
    callOrder.length = 0;
    requirePermission.mockResolvedValue(contextWith(PERMISSION_CODES));
    listUsersInOrganization.mockResolvedValue(users);
  });

  it("user.view を要求する", async () => {
    await OrganizationUsersPage(pageProps("tennis"));

    expect(requirePermission).toHaveBeenCalledWith("tennis", "user.view");
  });

  it("一覧は URL の slug ではなく organization.id で絞り込む", async () => {
    await OrganizationUsersPage(pageProps("tennis"));

    expect(listUsersInOrganization).toHaveBeenCalledWith("o1");
  });

  it("requirePermission を一覧取得より先に呼ぶ", async () => {
    await OrganizationUsersPage(pageProps("tennis"));

    expect(callOrder).toEqual([
      "requirePermission",
      "listUsersInOrganization",
    ]);
  });

  it("権限が無ければ(notFound)一覧取得は行わずページも失敗する", async () => {
    requirePermission.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(
      OrganizationUsersPage(pageProps("tennis")),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(listUsersInOrganization).not.toHaveBeenCalled();
  });

  it("所属ユーザーを描画する", async () => {
    const element = await OrganizationUsersPage(pageProps("tennis"));
    render(element);

    expect(screen.getByText("takezo@example.com")).toBeInTheDocument();
  });

  it("user.add を持たなければ追加フォームを出さない", async () => {
    requirePermission.mockResolvedValue(contextWith(["user.view"]));

    const element = await OrganizationUsersPage(pageProps("tennis"));
    render(element);

    expect(screen.queryByText("ユーザーを追加")).toBeNull();
  });

  it("user.add を持てば追加フォームを出す", async () => {
    requirePermission.mockResolvedValue(
      contextWith(["user.view", "user.add"]),
    );

    const element = await OrganizationUsersPage(pageProps("tennis"));
    render(element);

    expect(screen.getByText("ユーザーを追加")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
pnpm exec vitest run "src/app/orgs/[slug]/users/page.test.tsx"
```

期待: `Failed to resolve import "./page"` で FAIL。

- [ ] **Step 3: ページを実装する**

`src/app/orgs/[slug]/users/page.tsx` を新規作成:

```tsx
import { AppHeader } from "@/components/layout/AppHeader";
import { AddUserForm } from "@/components/organization-user/AddUserForm";
import { OrganizationUserList } from "@/components/organization-user/OrganizationUserList";
import { addUserAction } from "@/features/organization-user/add/handler";
import { removeUserAction } from "@/features/organization-user/remove/handler";
import { listUsersInOrganization } from "@/features/organization-user/repository";
import { searchUserAction } from "@/features/organization-user/search/handler";
import { canByCode } from "@/shared/authz/ability";
import { requirePermission } from "@/shared/middleware/require-organization";

export default async function OrganizationUsersPage({
  params,
}: PageProps<"/orgs/[slug]/users">) {
  const { slug } = await params;
  const { session, organization, ability } = await requirePermission(
    slug,
    "user.view",
  );
  const users = await listUsersInOrganization(organization.id);

  // UI の出し分けは体感のためで、境界は各 Server Action の requirePermission。
  const canAdd = canByCode(ability, "user.add");
  const canRemove = canByCode(ability, "user.remove");
  const canGrant = canByCode(ability, "user.grant");

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        crumbs={[
          { label: "組織", href: "/" },
          { label: organization.name, href: `/orgs/${slug}` },
          { label: "ユーザー" },
        ]}
        userName={session.user.name}
      />

      <div className="mx-auto max-w-2xl space-y-4 px-6 py-8">
        <h1 className="text-lg font-bold text-slate-800">ユーザー</h1>

        {canAdd && (
          <AddUserForm
            slug={slug}
            searchAction={searchUserAction}
            addAction={addUserAction}
          />
        )}

        <OrganizationUserList
          slug={slug}
          users={users}
          currentUserId={session.user.id}
          canRemove={canRemove}
          canGrant={canGrant}
          removeAction={removeUserAction}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
pnpm exec vitest run "src/app/orgs/[slug]/users/page.test.tsx"
```

期待: 全 PASS。`PageProps<"/orgs/[slug]/users">` が未定義の型エラーになる場合は `pnpm exec next typegen` を実行する。

- [ ] **Step 5: 組織詳細ページにリンクを追加する**

`src/app/orgs/[slug]/page.tsx` を次のように変更する。

import に 2 行追加:

```typescript
import { canByCode } from "@/shared/authz/ability";
```

`requireOrganization` の呼び出しから `ability` を受け取り、判定を足す:

```typescript
  const { session, organization, ability } = await requireOrganization(slug);
  const tournaments = await listTournamentsInOrganization(organization.id);
  const canViewUsers = canByCode(ability, "user.view");
```

「組織を編集」リンクの直前に、次のリンクを挿入する:

```tsx
            {canViewUsers && (
              <Link
                href={`/orgs/${slug}/users`}
                className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
              >
                ユーザー管理
              </Link>
            )}
```

- [ ] **Step 6: 組織詳細ページのテストにリンクの検証を足す**

`src/app/orgs/[slug]/page.test.tsx` の `describe` 内に次の 2 つを追加する:

```typescript
  it("user.view を持てばユーザー管理へのリンクを出す", async () => {
    const element = await OrganizationPage(pageProps("tennis"));
    render(element);

    expect(
      screen.getByRole("link", { name: "ユーザー管理" }),
    ).toHaveAttribute("href", "/orgs/tennis/users");
  });

  it("user.view を持たなければユーザー管理へのリンクを出さない", async () => {
    requireOrganization.mockResolvedValue({
      session,
      organization,
      permissionCodes: [],
      ability: defineAbilityFor([]),
    });

    const element = await OrganizationPage(pageProps("tennis"));
    render(element);

    expect(screen.queryByRole("link", { name: "ユーザー管理" })).toBeNull();
  });
```

- [ ] **Step 7: 全テストと型チェックと lint**

```bash
pnpm test && pnpm typecheck && pnpm lint
```

期待: すべてエラー 0。

- [ ] **Step 8: コミット**

```bash
git add "src/app/orgs/[slug]"
git commit -m "feat(org-user): add organization users page

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 11: 権限編集ページ

**Files:**
- Create: `src/components/organization-user/PermissionEditForm.tsx`
- Create: `src/app/orgs/[slug]/users/[userId]/permissions/page.tsx`
- Test: `src/components/organization-user/PermissionEditForm.test.tsx`
- Test: `src/app/orgs/[slug]/users/[userId]/permissions/page.test.tsx`

**Interfaces:**
- Consumes: Task 4 の `listAllPermissions` / `findOrganizationUser` / `PermissionSummary` / `OrganizationUserSummary`、Task 8 の `grantPermissionsAction`、Task 2 の `requirePermission`
- Produces:
  - `PermissionEditForm({ slug, user, permissions, isSelf, action })`
  - `/orgs/[slug]/users/[userId]/permissions` のページ

- [ ] **Step 1: PermissionEditForm のテストを書く**

`src/components/organization-user/PermissionEditForm.test.tsx` を新規作成:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  OrganizationUserSummary,
  PermissionSummary,
} from "@/features/organization-user/repository";
import { PermissionEditForm } from "./PermissionEditForm";

const action = vi.fn(async () => ({ error: null }));

const permissions: PermissionSummary[] = [
  { id: 1, code: "user.view", description: "組織ユーザーの閲覧" },
  { id: 2, code: "user.grant", description: "組織ユーザーへの権限付与・剥奪" },
  { id: 3, code: "org.delete", description: "組織の削除" },
];

const user: OrganizationUserSummary = {
  userId: "u2",
  name: "山田",
  username: "yamada",
  email: "yamada@example.com",
  image: null,
  permissionCodes: ["user.view"],
  joinedAt: new Date("2026-08-01T00:00:00Z"),
};

const renderForm = (
  overrides: Partial<Parameters<typeof PermissionEditForm>[0]> = {},
) =>
  render(
    <PermissionEditForm
      slug="tennis"
      user={user}
      permissions={permissions}
      isSelf={false}
      action={action}
      {...overrides}
    />,
  );

describe("PermissionEditForm", () => {
  it("権限マスタの全件をチェックボックスで出す", () => {
    renderForm();

    expect(screen.getByLabelText(/組織ユーザーの閲覧/)).toBeInTheDocument();
    expect(screen.getByLabelText(/組織の削除/)).toBeInTheDocument();
  });

  it("保有している権限だけ初期チェックが入る", () => {
    renderForm();

    expect(screen.getByLabelText(/組織ユーザーの閲覧/)).toBeChecked();
    expect(screen.getByLabelText(/組織の削除/)).not.toBeChecked();
  });

  it("権限コードも併記する", () => {
    renderForm();

    expect(screen.getByLabelText(/user\.view/)).toBeInTheDocument();
  });

  it("自分自身の user.grant は外せないよう無効化する", () => {
    // 最後の user.grant 保持者が自分を降格すると、誰も権限を戻せなくなる。
    renderForm({
      isSelf: true,
      user: { ...user, permissionCodes: ["user.view", "user.grant"] },
    });

    const grant = screen.getByLabelText(/組織ユーザーへの権限付与・剥奪/);
    expect(grant).toBeChecked();
    expect(grant).toBeDisabled();
  });

  it("他人の user.grant は無効化しない", () => {
    renderForm({
      user: { ...user, permissionCodes: ["user.grant"] },
    });

    expect(
      screen.getByLabelText(/組織ユーザーへの権限付与・剥奪/),
    ).not.toBeDisabled();
  });

  it("自分自身のときは user.grant を hidden でも送る（disabled は送信されないため）", () => {
    const { container } = renderForm({
      isSelf: true,
      user: { ...user, permissionCodes: ["user.view", "user.grant"] },
    });

    const hidden = container.querySelector(
      'input[type="hidden"][name="permissionCode"][value="user.grant"]',
    );
    expect(hidden).not.toBeNull();
  });

  it("対象ユーザーの名前を出す", () => {
    renderForm();

    expect(screen.getByText("山田")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/components/organization-user/PermissionEditForm.test.tsx
```

期待: FAIL。

- [ ] **Step 3: PermissionEditForm.tsx を実装する**

`src/components/organization-user/PermissionEditForm.tsx` を新規作成:

```tsx
"use client";

import Link from "next/link";
import { useActionState } from "react";
import type {
  OrganizationUserSummary,
  PermissionSummary,
} from "@/features/organization-user/repository";
import {
  INITIAL_ORGANIZATION_USER_FORM_STATE,
  type OrganizationUserFormAction,
} from "@/features/organization-user/state";
import { UserAvatar } from "./UserAvatar";

/** 自分から外せない権限。外すと誰も権限を戻せなくなる。 */
const SELF_LOCKED_CODE = "user.grant";

export function PermissionEditForm({
  slug,
  user,
  permissions,
  isSelf,
  action,
}: {
  slug: string;
  user: OrganizationUserSummary;
  permissions: PermissionSummary[];
  isSelf: boolean;
  action: OrganizationUserFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_ORGANIZATION_USER_FORM_STATE,
  );
  const held = new Set(user.permissionCodes);
  const lockGrant = isSelf && held.has(SELF_LOCKED_CODE);

  return (
    <form
      action={formAction}
      className="space-y-4 rounded border border-slate-200 bg-white p-4"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="userId" value={user.userId} />
      {/* disabled なチェックボックスは送信されないため、固定分は hidden で補う。 */}
      {lockGrant && (
        <input type="hidden" name="permissionCode" value={SELF_LOCKED_CODE} />
      )}

      <div className="flex items-center gap-3">
        <UserAvatar name={user.name} image={user.image} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800">
            {user.name}
          </p>
          <p className="truncate text-xs text-slate-500">{user.username}</p>
        </div>
      </div>

      <ul className="space-y-2">
        {permissions.map((permission) => {
          const locked = lockGrant && permission.code === SELF_LOCKED_CODE;
          return (
            <li key={permission.id}>
              <label
                htmlFor={`permission-${permission.id}`}
                className="flex items-center gap-2 text-sm text-slate-700"
              >
                <input
                  id={`permission-${permission.id}`}
                  type="checkbox"
                  name="permissionCode"
                  value={permission.code}
                  defaultChecked={held.has(permission.code)}
                  disabled={locked}
                  className="h-4 w-4"
                />
                <span>{permission.description}</span>
                <span className="text-xs text-slate-400">
                  {permission.code}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {lockGrant && (
        <p className="text-xs text-slate-500">
          自分自身から「{SELF_LOCKED_CODE}」を外すことはできません
        </p>
      )}

      {state.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "保存中..." : "保存する"}
        </button>
        <Link
          href={`/orgs/${slug}/users`}
          className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700"
        >
          キャンセル
        </Link>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
pnpm exec vitest run src/components/organization-user/PermissionEditForm.test.tsx
```

期待: 全 PASS。

- [ ] **Step 5: ページのテストを書く**

`src/app/orgs/[slug]/users/[userId]/permissions/page.test.tsx` を新規作成:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineAbilityFor, PERMISSION_CODES } from "@/shared/authz/ability";

vi.mock("@/components/auth/LogoutButton", () => ({
  LogoutButton: () => <button type="button">ログアウト</button>,
}));

const requirePermission = vi.fn();
const findOrganizationUser = vi.fn();
const listAllPermissions = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/shared/middleware/require-organization", () => ({
  requirePermission: (slug: string, code: string) =>
    requirePermission(slug, code),
}));

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
}));

vi.mock("@/features/organization-user/repository", () => ({
  findOrganizationUser: (organizationId: string, userId: string) =>
    findOrganizationUser(organizationId, userId),
  listAllPermissions: () => listAllPermissions(),
}));

vi.mock("@/features/organization-user/grant/handler", () => ({
  grantPermissionsAction: vi.fn(),
}));

const { default: PermissionsPage } = await import("./page");

const pageProps = (slug: string, userId: string) => ({
  params: Promise.resolve({ slug, userId }),
  searchParams: Promise.resolve({}),
});

const session = { user: { id: "me", name: "竹添" } };
const organization = {
  id: "o1",
  name: "テニス部",
  slug: "tennis",
  createdAt: new Date("2026-08-01T00:00:00Z"),
  updatedAt: new Date("2026-08-01T00:00:00Z"),
};

const target = {
  userId: "u2",
  name: "山田",
  username: "yamada",
  email: "yamada@example.com",
  image: null,
  permissionCodes: ["user.view"],
  joinedAt: new Date("2026-08-01T00:00:00Z"),
};

describe("PermissionsPage", () => {
  beforeEach(() => {
    requirePermission.mockReset();
    findOrganizationUser.mockReset();
    listAllPermissions.mockReset();
    notFound.mockClear();
    requirePermission.mockResolvedValue({
      session,
      organization,
      permissionCodes: [...PERMISSION_CODES],
      ability: defineAbilityFor(PERMISSION_CODES),
    });
    findOrganizationUser.mockResolvedValue(target);
    listAllPermissions.mockResolvedValue([
      { id: 1, code: "user.view", description: "組織ユーザーの閲覧" },
    ]);
  });

  it("user.grant を要求する", async () => {
    await PermissionsPage(pageProps("tennis", "u2"));

    expect(requirePermission).toHaveBeenCalledWith("tennis", "user.grant");
  });

  it("対象ユーザーは URL の slug ではなく organization.id で絞り込む", async () => {
    await PermissionsPage(pageProps("tennis", "u2"));

    expect(findOrganizationUser).toHaveBeenCalledWith("o1", "u2");
  });

  it("対象が所属していなければ notFound を呼ぶ", async () => {
    findOrganizationUser.mockResolvedValue(null);

    await expect(
      PermissionsPage(pageProps("tennis", "u2")),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("権限が無ければ(notFound)対象の取得を行わない", async () => {
    requirePermission.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(
      PermissionsPage(pageProps("tennis", "u2")),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(findOrganizationUser).not.toHaveBeenCalled();
  });

  it("対象ユーザーと権限マスタを描画する", async () => {
    const element = await PermissionsPage(pageProps("tennis", "u2"));
    render(element);

    expect(screen.getByText("山田")).toBeInTheDocument();
    expect(screen.getByLabelText(/組織ユーザーの閲覧/)).toBeChecked();
  });

  it("自分自身のページでは isSelf として扱う（user.grant を無効化する）", async () => {
    findOrganizationUser.mockResolvedValue({
      ...target,
      userId: "me",
      name: "竹添",
      permissionCodes: ["user.grant"],
    });
    listAllPermissions.mockResolvedValue([
      {
        id: 2,
        code: "user.grant",
        description: "組織ユーザーへの権限付与・剥奪",
      },
    ]);

    const element = await PermissionsPage(pageProps("tennis", "me"));
    render(element);

    expect(
      screen.getByLabelText(/組織ユーザーへの権限付与・剥奪/),
    ).toBeDisabled();
  });
});
```

- [ ] **Step 6: テストが失敗することを確認する**

```bash
pnpm exec vitest run "src/app/orgs/[slug]/users/[userId]/permissions/page.test.tsx"
```

期待: FAIL。

- [ ] **Step 7: ページを実装する**

`src/app/orgs/[slug]/users/[userId]/permissions/page.tsx` を新規作成:

```tsx
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { PermissionEditForm } from "@/components/organization-user/PermissionEditForm";
import { grantPermissionsAction } from "@/features/organization-user/grant/handler";
import {
  findOrganizationUser,
  listAllPermissions,
} from "@/features/organization-user/repository";
import { requirePermission } from "@/shared/middleware/require-organization";

export default async function PermissionsPage({
  params,
}: PageProps<"/orgs/[slug]/users/[userId]/permissions">) {
  const { slug, userId } = await params;
  const { session, organization } = await requirePermission(slug, "user.grant");

  const [target, permissions] = await Promise.all([
    findOrganizationUser(organization.id, userId),
    listAllPermissions(),
  ]);

  // 所属していない相手の権限は編集させない。存在を漏らさないよう 404。
  if (target === null) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        crumbs={[
          { label: "組織", href: "/" },
          { label: organization.name, href: `/orgs/${slug}` },
          { label: "ユーザー", href: `/orgs/${slug}/users` },
          { label: target.name },
        ]}
        userName={session.user.name}
      />

      <div className="mx-auto max-w-2xl space-y-4 px-6 py-8">
        <h1 className="text-lg font-bold text-slate-800">権限を編集</h1>

        <PermissionEditForm
          slug={slug}
          user={target}
          permissions={permissions}
          isSelf={target.userId === session.user.id}
          action={grantPermissionsAction}
        />
      </div>
    </main>
  );
}
```

`findOrganizationUser` と `listAllPermissions` を並行に呼んでいるが、`requirePermission` はその前に `await` しているため、認可が先に効く順序は保たれる。

- [ ] **Step 8: テストが通ることを確認する**

```bash
pnpm exec vitest run "src/app/orgs/[slug]/users"
```

期待: 全 PASS。`PageProps<"/orgs/[slug]/users/[userId]/permissions">` が未定義なら `pnpm exec next typegen` を実行する。

- [ ] **Step 9: 全テストと型チェックと lint**

```bash
pnpm test && pnpm typecheck && pnpm lint
```

期待: すべてエラー 0。

- [ ] **Step 10: 実 DB での手動確認**

開発サーバを起動する:

```bash
BYPASS_AUTH=1 pnpm dev
```

ブラウザで Cookie `USER_ID=1` を設定したうえで（`AGENTS.md` の方針）、次を順に確認する:

1. `/orgs/<slug>` に「ユーザー管理」リンクが出る
2. `/orgs/<slug>/users` で自分が一覧に出て、権限件数が 9 件と表示される
3. 追加フォームで既存ユーザーの username を入れて検索すると、アイコンと表示名が出る
4. 「追加」を押すとその場で一覧に増える
5. 追加したユーザーの「権限を編集」から権限を減らして保存すると、一覧の件数が減る
6. 自分の行に削除ボタンが出ていない
7. 自分の権限編集ページで `user.grant` のチェックが無効になっている

確認できたらサーバを停止する。うまく動かない場合は `pnpm exec prisma studio` で `Permission` が 9 件シードされているかを確かめる。

- [ ] **Step 11: コミット**

```bash
git add src/components/organization-user "src/app/orgs/[slug]/users"
git commit -m "feat(org-user): add permission edit page

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 完了条件

- `pnpm test` / `pnpm typecheck` / `pnpm lint` がすべて通る
- `OrganizationUser.role` と `OrganizationRole` がコードベースから消えている（`grep -rn "OrganizationRole" src prisma` が 0 件）
- `/orgs/[slug]/users` でユーザーの一覧・検索・追加・削除ができる
- `/orgs/[slug]/users/[userId]/permissions` で権限の付与・剥奪ができる
- 自分自身の削除と、自分からの `user.grant` 剥奪が拒否される
