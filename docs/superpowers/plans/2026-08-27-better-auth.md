# Better Auth 導入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** tournament-program に Better Auth を導入し、メール+パスワードと Google OAuth でログインできるようにして、アプリ全体をログイン必須にする。

**Architecture:** Better Auth がハンドラ・DB アクセス・パスワードハッシュ・セッションを所有する。自前のコードは (1) Better Auth の設定、(2) Zod による入力検証、(3) Better Auth のエラーコードを Effect のタグ付きエラーへ写像する usecase 層、(4) React のフォーム、の 4 つだけ。アクセス保護は二層で、`src/proxy.ts` は Cookie の有無だけを見る最適化、`requireSession()` が DB を検証する実際のセキュリティ境界。

**Tech Stack:** Next.js 16.3.3 (App Router) / React 19.2 / Prisma 7.10 (PostgreSQL + `@prisma/adapter-pg`) / better-auth 1.7.2 / zod 4 / effect 3 / vitest 4 / biome 2.4

**設計書:** [docs/superpowers/specs/2026-08-27-better-auth-design.md](../specs/2026-08-27-better-auth-design.md)

## Global Constraints

これらは全タスクの要件に含まれる。

- パッケージマネージャは **pnpm** を使う（`pnpm add`, `pnpm exec`）。npm / yarn は使わない。
- バージョン下限: `better-auth@^1.7.2`, `@better-auth/prisma-adapter@^1.7.2`, `zod@^4`, `effect@^3.22.1`
- Prisma アダプタの import は **`@better-auth/prisma-adapter`** から行う。`better-auth/adapters/prisma` は同一実装への再エクスポートにすぎないので使わない。
- Next.js 16 では `middleware.ts` は廃止され **`proxy.ts`** になっている。`middleware.ts` を作らない。
- コードのフォーマットは biome（スペース 2 インデント、ダブルクォート）。各タスクの最後に `pnpm lint:fix` を通す。
- コメントと UI 文言は日本語。既存コードのコメント密度に合わせ、「なぜ」を書く。「何を」は書かない。
- `AGENTS.md` 冒頭のブロックは `next dev` が自動生成する。差分から消しても再生成されるので、変更があれば一緒にコミットしてよい。
- 新しい worktree では `pnpm typecheck` の前に **`pnpm exec next typegen`** が必要（`LayoutProps` / `PageProps` の型が解決できないため）。
- Better Auth のエラーコード文字列は `@better-auth/core` の `BASE_ERROR_CODES` のキー名と一致する。本計画に出てくるコード名は実パッケージ (1.7.2) から確認済みで、勝手に変えてはならない。
- `docs/code-design/architecture.md` の依存ルール: **`src/features/` 配下では上位ディレクトリのみ依存してよい。同列（兄弟）・下位ディレクトリへの依存は禁止。** 他の機能カテゴリへの依存も禁止。
- UI コンポーネントは `src/components/` に置く。`src/features/` 配下に `.tsx` は置かない。`src/components/` は `src/features/` に依存してよい（逆は不可）。

---

## File Structure

### 新規作成

| ファイル | 責務 |
| --- | --- |
| `src/shared/db/prisma.ts` | Prisma クライアントのシングルトン（`src/lib/prisma.ts` から移動） |
| `src/shared/lib/password-policy.ts` | パスワード長の定数。サーバー設定とクライアント側 Zod の両方から参照する |
| `src/shared/lib/email.ts` | `normalizeEmail`。signup / login 両スライスが使う |
| `src/shared/lib/auth.ts` | `betterAuth({...})` サーバー設定 |
| `src/shared/lib/auth-client.ts` | `createAuthClient()` クライアント設定 |
| `src/shared/errors/auth-error.ts` | `Data.TaggedError` による認証エラー型と `toAuthError` 写像 |
| `src/shared/lib/auth-effect.ts` | `runAuthCall`。Better Auth のクライアント呼び出しを `Effect` に包む共通処理 |
| `src/shared/testing/exit.ts` | `failureTag`。テストで `Exit` から失敗タグを取り出すヘルパ |
| `src/shared/middleware/require-session.ts` | `requireSession()`。実際のセキュリティ境界 |
| `src/features/auth/messages.ts` | `AuthError` → 日本語文言。`Match.exhaustive` で網羅性を保証 |
| `src/features/auth/signup/schema.ts` | サインアップの Zod スキーマ |
| `src/features/auth/signup/domain.ts` | `isPasswordLengthValid` |
| `src/features/auth/signup/usecase.ts` | `signup` (Effect) |
| `src/features/auth/login/schema.ts` | ログインの Zod スキーマ |
| `src/features/auth/login/domain.ts` | `safeRedirectPath` |
| `src/features/auth/login/usecase.ts` | `login` (Effect) |
| `src/components/auth/SignupForm.tsx` | サインアップフォーム |
| `src/components/auth/LoginForm.tsx` | ログインフォーム + Google ボタン |
| `src/components/auth/LogoutButton.tsx` | ログアウトボタン |
| `src/app/api/auth/[...all]/route.ts` | Better Auth のエンドポイント |
| `src/app/(auth)/login/page.tsx` | `/login` |
| `src/app/(auth)/signup/page.tsx` | `/signup` |
| `src/proxy.ts` | 未ログインの最適化リダイレクト |

テストは実装と同じディレクトリに `*.test.ts` として置く。

### 変更

| ファイル | 変更内容 |
| --- | --- |
| `prisma/schema.prisma` | `User` に `emailVerified` / `image` / リレーションを追加、`Session` / `Account` / `Verification` を新規追加 |
| `src/app/page.tsx` | import 先の変更、冒頭で `requireSession()`、ヘッダーにユーザー名とログアウトボタン |
| `biome.json` | `overrides` で features 配下の依存制約を lint で強制する |
| `package.json` | 依存追加 |
| `.env.example` | 認証用の環境変数 |
| `README.md` | Google OAuth のセットアップ手順 |

### 移動（Task 7 の構成移行）

| 移動元 | 移動先 |
| --- | --- |
| `src/features/tournament/components/*.tsx` | `src/components/tournament/` |
| `src/features/tournament/lib/*.ts` | `src/features/tournament/`（1 階層上げる） |

### 削除

| ファイル | 理由 |
| --- | --- |
| `src/lib/prisma.ts` | `src/shared/db/prisma.ts` へ移動。現時点で import 元は 0 件なので影響なし |

### 設計書からの変更点

1. 設計書では `normalizeEmail` を `signup/domain.ts` に置くとしていたが、`login/schema.ts` からも使うため
   `src/shared/lib/email.ts` に移す。スライス間の横断 import を避けるための調整。
2. `docs/code-design/architecture.md` が更新され、`src/components/`（UI コンポーネント）が追加された。
   認証フォームは `src/features/auth/*/` ではなく `src/components/auth/` に置く。
3. 同じ更新で「features 以下は上位ディレクトリのみ依存可、同列・下位は不可」「lint で制約をかける」が
   追加された。Task 7 でこの制約を biome に入れ、既存の `features/tournament` を新構成へ移行する。

---

## Task 1: 依存の追加と Prisma クライアントの移動

**Files:**
- Modify: `package.json`
- Create: `src/shared/db/prisma.ts`
- Delete: `src/lib/prisma.ts`
- Create: `src/shared/lib/password-policy.ts`
- Create: `src/shared/lib/email.ts`
- Create: `src/shared/lib/email.test.ts`

**Interfaces:**
- Consumes: なし（最初のタスク）
- Produces:
  - `import { prisma } from "@/shared/db/prisma"`
  - `export const MIN_PASSWORD_LENGTH = 8` / `export const MAX_PASSWORD_LENGTH = 128` from `@/shared/lib/password-policy`
  - `export const normalizeEmail: (raw: string) => string` from `@/shared/lib/email`

- [ ] **Step 1: 依存を追加する**

```bash
pnpm add better-auth@^1.7.2 @better-auth/prisma-adapter@^1.7.2 zod@^4 effect@^3.22.1
```

`postinstall` で `prisma generate` が走る。エラーが出ないことを確認する。

- [ ] **Step 2: Prisma クライアントを移動する**

`src/lib/prisma.ts` の中身は変えずに `src/shared/db/prisma.ts` へ移す。

```bash
mkdir -p src/shared/db
git mv src/lib/prisma.ts src/shared/db/prisma.ts
rmdir src/lib
```

移動後の `src/shared/db/prisma.ts` は以下のままであること（変更しない）:

```ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const createPrismaClient = () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
};

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

// 開発時の HMR でコネクションが増え続けないよう、グローバルに 1 つだけ保持する。
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 3: 移動漏れがないことを確認する**

```bash
grep -rn "@/lib/prisma" src --include=*.ts --include=*.tsx
```

Expected: 出力なし（該当なし）。1 件でも出たら `@/shared/db/prisma` に書き換える。

- [ ] **Step 4: パスワードポリシーの定数を作る**

`src/shared/lib/password-policy.ts`:

```ts
// Better Auth のサーバー設定とクライアント側の Zod スキーマが同じ境界を使うための定数。
// どちらか一方だけを変えると、UI が通した値をサーバーが弾く不整合が起きる。
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
```

- [ ] **Step 5: normalizeEmail の失敗するテストを書く**

`src/shared/lib/email.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeEmail } from "./email";

describe("normalizeEmail", () => {
  it("前後の空白を落とす", () => {
    expect(normalizeEmail("  user@example.com  ")).toBe("user@example.com");
  });

  it("小文字に揃える", () => {
    expect(normalizeEmail("User@Example.COM")).toBe("user@example.com");
  });

  it("空文字はそのまま空文字を返す", () => {
    expect(normalizeEmail("")).toBe("");
  });

  it("空白だけの文字列は空文字になる", () => {
    expect(normalizeEmail("   ")).toBe("");
  });
});
```

- [ ] **Step 6: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/shared/lib/email.test.ts
```

Expected: FAIL。`Failed to resolve import "./email"` のようなエラーになる。

- [ ] **Step 7: normalizeEmail を実装する**

`src/shared/lib/email.ts`:

```ts
// signup と login の両方で使うため、どちらのスライスにも属さない shared に置く。
export const normalizeEmail = (raw: string): string => raw.trim().toLowerCase();
```

- [ ] **Step 8: テストが通ることを確認する**

```bash
pnpm exec vitest run src/shared/lib/email.test.ts
```

Expected: PASS（4 tests passed）。

- [ ] **Step 9: 既存のテストと型が壊れていないことを確認する**

```bash
pnpm exec next typegen && pnpm typecheck && pnpm test && pnpm lint:fix
```

Expected: すべて成功。既存の tournament のテストも通ること。

- [ ] **Step 10: コミット**

```bash
git add -A
git commit -m "chore: add auth dependencies and move prisma client to shared/db"
```

---

## Task 2: Prisma スキーマへの認証テーブル追加

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_better_auth/migration.sql`（Prisma が生成）
- Create: `src/shared/lib/auth.ts`
- Create: `src/app/api/auth/[...all]/route.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `prisma` from `@/shared/db/prisma`、`MIN_PASSWORD_LENGTH` / `MAX_PASSWORD_LENGTH` from `@/shared/lib/password-policy`（Task 1）
- Produces:
  - `export const auth` from `@/shared/lib/auth`。`auth.api.getSession({ headers })` が使える
  - `/api/auth/*` エンドポイント

**前提:** `DATABASE_URL` が指す PostgreSQL が起動していること。起動していない場合、Step 6 のマイグレーションが失敗する。

- [ ] **Step 1: 環境変数のひな形を追記する**

`.env.example` の末尾に追記する:

```
# Better Auth
# BETTER_AUTH_SECRET は `openssl rand -base64 32` などで生成する
BETTER_AUTH_SECRET="replace-with-a-random-32-byte-string"
BETTER_AUTH_URL="http://localhost:3000"

# Google OAuth（Google Cloud Console で発行する。手順は README を参照）
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
```

- [ ] **Step 2: ローカルの .env に値を入れる**

`.env` に同じキーを追加する。`BETTER_AUTH_SECRET` は実際にランダム値を生成して入れる:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` はこの時点では空文字で構わない。Google ログインを試すときに埋める。

- [ ] **Step 3: Better Auth のサーバー設定を作る**

`src/shared/lib/auth.ts`:

```ts
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/shared/db/prisma";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@/shared/lib/password-policy";

export const auth = betterAuth({
  // 未設定だと Google が受け取るコールバック URL が組み立てられず redirect_uri_mismatch になる。
  baseURL: process.env.BETTER_AUTH_URL,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    maxPasswordLength: MAX_PASSWORD_LENGTH,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  account: {
    // Google は検証済みのメールアドレスを返すため、同じメールの既存ユーザーへ
    // メール確認を挟まずに連携してよい。
    accountLinking: { enabled: true, trustedProviders: ["google"] },
  },
  // nextCookies は Server Action から Cookie を書けるようにする。plugins 配列の
  // 最後に置く必要がある。
  plugins: [nextCookies()],
});
```

- [ ] **Step 4: スキーマを生成する**

Better Auth の CLI に `prisma/schema.prisma` を更新させる。既存の `User` モデルには不足フィールドが追記され、`Session` / `Account` / `Verification` が新規追加される。

```bash
pnpm dlx auth@1.7.2 generate --config src/shared/lib/auth.ts --output prisma/schema.prisma -y
```

**CLI が失敗した場合のフォールバック:** Prisma 7 の `prisma7.config.ts` やカスタム出力先 `src/generated/prisma` を CLI が解釈できない可能性がある。失敗したら Step 5 の内容を手で書く。

- [ ] **Step 5: 生成結果をレビューし、必要なら手で補正する**

`prisma/schema.prisma` の差分を確認する。

```bash
git diff prisma/schema.prisma
```

最終的に以下の状態になっていること。`User` の既存フィールドは消さない。

```prisma
/// ユーザー。組織に所属して大会を運営する側の人。
model User {
  id            String   @id @default(uuid())
  email         String   @unique
  name          String
  emailVerified Boolean  @default(false)
  image         String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  memberships OrganizationMember[]
  sessions    Session[]
  accounts    Account[]
}

/// Better Auth のセッション。DB 保存のため個別失効ができる。
model Session {
  id        String   @id @default(uuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  ipAddress String?
  userAgent String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

/// Better Auth のアカウント。パスワードのハッシュと OAuth プロバイダの連携情報を持つ。
model Account {
  id                    String    @id @default(uuid())
  issuer                String
  userId                String
  accountId             String
  providerId            String
  accessToken           String?
  refreshToken          String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  idToken               String?
  password              String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([issuer, accountId])
  @@index([userId])
}

/// Better Auth の検証トークン置き場。
model Verification {
  id         String   @id @default(uuid())
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([identifier])
}
```

パスワードは `Account.password` に入る。`User` に `passwordHash` を足してはならない。

`Account.issuer` は必須で、一意制約は `[providerId, accountId]` ではなく **`[issuer, accountId]`** に張る。
Better Auth 1.7 は資格情報アカウントに `issuer = "local:credential"` を書き込むため、
このフィールドが無いとサインアップが `Unknown argument \`issuer\`` で 500 になる。

CLI 出力のうち採用しないもの:
- `@@map("user")` などのテーブル名マッピング。既存テーブルは `"User"` であり、付けると壊れる
- `@id` から `@default(uuid())` を落とす変更。Better Auth は自前で id を採番するが、
  既定値を残しておいても害はない

- [ ] **Step 6: スキーマの妥当性を確認する**

```bash
pnpm exec prisma validate
pnpm exec prisma format
```

Expected: `The schema at prisma/schema.prisma is valid`。

- [ ] **Step 7: マイグレーションを作成して適用する**

```bash
pnpm db:migrate --name add_better_auth
```

Expected: `prisma/migrations/<timestamp>_add_better_auth/` が作られ、DB に適用される。

DB に接続できずに失敗する場合は PostgreSQL を起動してから再実行する。既存の `User` 行がある状態で
`emailVerified` を非 null で追加するが `@default(false)` があるため既存行があっても失敗しない。

- [ ] **Step 8: Prisma クライアントを再生成する**

```bash
pnpm db:generate
```

Expected: `src/generated/prisma/models/Session.ts` などが生成される。

- [ ] **Step 9: API ルートを作る**

`src/app/api/auth/[...all]/route.ts`:

```ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/shared/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
```

- [ ] **Step 10: 型と lint を通す**

```bash
pnpm exec next typegen && pnpm typecheck && pnpm lint:fix && pnpm test
```

Expected: すべて成功。

`prismaAdapter(prisma, ...)` で型エラーが出る場合、Prisma 7 のカスタム出力先クライアントと
アダプタの `PrismaClient` 型が構造的に一致していない可能性がある。その場合は
`prismaAdapter(prisma as never, { provider: "postgresql" })` ではなく、まず
`@better-auth/prisma-adapter` の `PrismaConfig` 型定義を読んで原因を特定すること。

- [ ] **Step 11: エンドポイントの疎通を確認する**

```bash
pnpm dev
```

別のターミナルで:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/auth/get-session
```

Expected: `200`。ボディは未ログインなので `null`。`500` が返る場合はサーバーログを見て
`BETTER_AUTH_SECRET` の設定漏れや DB 接続を疑う。確認後 `pnpm dev` を止める。

- [ ] **Step 12: コミット**

```bash
git add -A
git commit -m "feat: add Better Auth server config and auth tables"
```

---

## Task 3: 認証エラー型・Effect ヘルパ・日本語文言

**Files:**
- Create: `src/shared/errors/auth-error.ts`
- Create: `src/shared/errors/auth-error.test.ts`
- Create: `src/shared/testing/exit.ts`
- Create: `src/shared/lib/auth-effect.ts`
- Create: `src/shared/lib/auth-effect.test.ts`
- Create: `src/features/auth/messages.ts`
- Create: `src/features/auth/messages.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `AuthError` 型 = `InvalidCredentials | EmailAlreadyExists | WeakPassword | UnexpectedAuthError`
  - `toAuthError(code: string | undefined, cause: unknown): AuthError`
  - `type AuthCallPort<I> = (input: I) => Promise<{ error?: { code?: string } | null }>`
  - `runAuthCall<I>(port: AuthCallPort<I>, input: I): Effect.Effect<void, AuthError>`
  - `failureTag<A, E extends { _tag: string }>(exit: Exit.Exit<A, E>): string`
  - `authErrorMessage(error: AuthError): string`
  - 各エラークラスは `_tag` と `code: string` を持つ。`UnexpectedAuthError` のみ `reason: unknown` も持つ

- [ ] **Step 1: toAuthError の失敗するテストを書く**

`src/shared/errors/auth-error.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toAuthError } from "./auth-error";

describe("toAuthError", () => {
  it("INVALID_EMAIL_OR_PASSWORD を InvalidCredentials に写像する", () => {
    expect(toAuthError("INVALID_EMAIL_OR_PASSWORD", null)._tag).toBe(
      "InvalidCredentials",
    );
  });

  it("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL を EmailAlreadyExists に写像する", () => {
    expect(toAuthError("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", null)._tag).toBe(
      "EmailAlreadyExists",
    );
  });

  it("USER_ALREADY_EXISTS を EmailAlreadyExists に写像する", () => {
    expect(toAuthError("USER_ALREADY_EXISTS", null)._tag).toBe(
      "EmailAlreadyExists",
    );
  });

  it("PASSWORD_TOO_SHORT を WeakPassword に写像する", () => {
    expect(toAuthError("PASSWORD_TOO_SHORT", null)._tag).toBe("WeakPassword");
  });

  it("PASSWORD_TOO_LONG を WeakPassword に写像する", () => {
    expect(toAuthError("PASSWORD_TOO_LONG", null)._tag).toBe("WeakPassword");
  });

  it("未知のコードは UnexpectedAuthError になる", () => {
    const error = toAuthError("SOMETHING_WE_DO_NOT_HANDLE", null);
    expect(error._tag).toBe("UnexpectedAuthError");
    expect(error.code).toBe("SOMETHING_WE_DO_NOT_HANDLE");
  });

  it("コードが undefined でも UnexpectedAuthError になり code は UNKNOWN になる", () => {
    const cause = new Error("network down");
    const error = toAuthError(undefined, cause);
    expect(error._tag).toBe("UnexpectedAuthError");
    expect(error.code).toBe("UNKNOWN");
    expect(error).toHaveProperty("reason", cause);
  });

  it("元のコードを保持する", () => {
    expect(toAuthError("PASSWORD_TOO_SHORT", null).code).toBe(
      "PASSWORD_TOO_SHORT",
    );
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/shared/errors/auth-error.test.ts
```

Expected: FAIL。`Failed to resolve import "./auth-error"`。

- [ ] **Step 3: エラー型を実装する**

`src/shared/errors/auth-error.ts`:

```ts
import { Data } from "effect";

export class InvalidCredentials extends Data.TaggedError("InvalidCredentials")<{
  readonly code: string;
}> {}

export class EmailAlreadyExists extends Data.TaggedError("EmailAlreadyExists")<{
  readonly code: string;
}> {}

export class WeakPassword extends Data.TaggedError("WeakPassword")<{
  readonly code: string;
}> {}

export class UnexpectedAuthError extends Data.TaggedError(
  "UnexpectedAuthError",
)<{
  readonly code: string;
  // Error が持つ cause と名前が衝突しないよう reason にしている。
  readonly reason: unknown;
}> {}

export type AuthError =
  | InvalidCredentials
  | EmailAlreadyExists
  | WeakPassword
  | UnexpectedAuthError;

/**
 * Better Auth のエラーコードを AuthError に写像する。
 * コード文字列は @better-auth/core の BASE_ERROR_CODES のキー名と一致する。
 * 未知のコードを握り潰さず UnexpectedAuthError として残すことで、
 * ライブラリ更新でコードが増えたときに元のコードが追える。
 */
export const toAuthError = (
  code: string | undefined,
  cause: unknown,
): AuthError => {
  switch (code) {
    case "INVALID_EMAIL_OR_PASSWORD":
    case "USER_NOT_FOUND":
    case "CREDENTIAL_ACCOUNT_NOT_FOUND":
      return new InvalidCredentials({ code });
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return new EmailAlreadyExists({ code });
    case "PASSWORD_TOO_SHORT":
    case "PASSWORD_TOO_LONG":
      return new WeakPassword({ code });
    default:
      return new UnexpectedAuthError({ code: code ?? "UNKNOWN", reason: cause });
  }
};
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
pnpm exec vitest run src/shared/errors/auth-error.test.ts
```

Expected: PASS（8 tests passed）。

- [ ] **Step 5: テスト用の Exit ヘルパを作る**

signup / login 双方の usecase テストが使うため、スライスに属さない場所に置く。

`src/shared/testing/exit.ts`:

```ts
import { Exit } from "effect";

/**
 * Exit から失敗値のタグを取り出す。成功していた場合はテストを落とす。
 * Effect を返す関数の分岐を検証するテストで使う。
 */
export const failureTag = <A, E extends { _tag: string }>(
  exit: Exit.Exit<A, E>,
): string => {
  if (Exit.isSuccess(exit)) {
    throw new Error("失敗を期待したが成功した");
  }
  const cause = exit.cause;
  if (cause._tag !== "Fail") {
    throw new Error(`Fail を期待したが ${cause._tag} だった`);
  }
  return cause.error._tag;
};
```

このファイルは本番コードから import されないため、専用のテストは書かない。
Task 4 / Task 5 の usecase テストが実質的な検証になる。

- [ ] **Step 6: runAuthCall の失敗するテストを書く**

`src/shared/lib/auth-effect.test.ts`:

```ts
import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import type { AuthCallPort } from "./auth-effect";
import { runAuthCall } from "./auth-effect";

const input = { email: "user@example.com" };

describe("runAuthCall", () => {
  it("エラーが無ければ成功し、入力をそのまま渡す", async () => {
    const port: AuthCallPort<typeof input> = vi
      .fn()
      .mockResolvedValue({ error: null });
    const exit = await Effect.runPromiseExit(runAuthCall(port, input));
    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith(input);
  });

  it("error が undefined でも成功として扱う", async () => {
    const port: AuthCallPort<typeof input> = vi.fn().mockResolvedValue({});
    const exit = await Effect.runPromiseExit(runAuthCall(port, input));
    expect(Exit.isSuccess(exit)).toBe(true);
  });

  it("エラーコードを AuthError に写像する", async () => {
    const port: AuthCallPort<typeof input> = vi
      .fn()
      .mockResolvedValue({ error: { code: "INVALID_EMAIL_OR_PASSWORD" } });
    const exit = await Effect.runPromiseExit(runAuthCall(port, input));
    expect(failureTag(exit)).toBe("InvalidCredentials");
  });

  it("未知のコードは UnexpectedAuthError にする", async () => {
    const port: AuthCallPort<typeof input> = vi
      .fn()
      .mockResolvedValue({ error: { code: "WAT" } });
    const exit = await Effect.runPromiseExit(runAuthCall(port, input));
    expect(failureTag(exit)).toBe("UnexpectedAuthError");
  });

  it("Promise が reject したら UnexpectedAuthError にする", async () => {
    const port: AuthCallPort<typeof input> = vi
      .fn()
      .mockRejectedValue(new Error("network"));
    const exit = await Effect.runPromiseExit(runAuthCall(port, input));
    expect(failureTag(exit)).toBe("UnexpectedAuthError");
  });
});
```

- [ ] **Step 7: runAuthCall を実装してテストを通す**

まずテストが失敗することを確認する。

```bash
pnpm exec vitest run src/shared/lib/auth-effect.test.ts
```

Expected: FAIL。`Failed to resolve import "./auth-effect"`。

`src/shared/lib/auth-effect.ts`:

```ts
import { Effect } from "effect";
import { type AuthError, toAuthError } from "@/shared/errors/auth-error";

/**
 * Better Auth のクライアントメソッドが満たす最小の形。
 * 実体を引数で受けることで、テストから Better Auth 本体を呼ばずに分岐を検証できる。
 */
export type AuthCallPort<I> = (
  input: I,
) => Promise<{ error?: { code?: string } | null }>;

/**
 * Better Auth の呼び出しを Effect に包み、失敗を AuthError に揃える。
 * Better Auth のクライアントは例外を投げずに { error } を返すため、
 * reject と error の 2 経路をここで 1 つに畳む。
 */
export const runAuthCall = <I>(
  port: AuthCallPort<I>,
  input: I,
): Effect.Effect<void, AuthError> =>
  Effect.tryPromise({
    try: () => port(input),
    // ネットワーク断などで Promise 自体が reject した場合。コードは無い。
    catch: (cause) => toAuthError(undefined, cause),
  }).pipe(
    Effect.flatMap((result) =>
      result.error
        ? Effect.fail(toAuthError(result.error.code, result.error))
        : Effect.void,
    ),
  );
```

再度テストを実行する。

```bash
pnpm exec vitest run src/shared/lib/auth-effect.test.ts
```

Expected: PASS（5 tests passed）。

- [ ] **Step 8: 文言マッパの失敗するテストを書く**

`src/features/auth/messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toAuthError } from "@/shared/errors/auth-error";
import { authErrorMessage } from "./messages";

describe("authErrorMessage", () => {
  it("ログイン失敗ではどちらが誤りか示さない", () => {
    const message = authErrorMessage(
      toAuthError("INVALID_EMAIL_OR_PASSWORD", null),
    );
    expect(message).toBe("メールアドレスまたはパスワードが正しくありません");
  });

  it("メール重複を伝える", () => {
    expect(
      authErrorMessage(toAuthError("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", null)),
    ).toBe("このメールアドレスは既に登録されています");
  });

  it("パスワード長の不備を伝える", () => {
    expect(authErrorMessage(toAuthError("PASSWORD_TOO_SHORT", null))).toBe(
      "パスワードの長さが要件を満たしていません",
    );
  });

  it("未知の失敗は汎用文言にする", () => {
    expect(authErrorMessage(toAuthError(undefined, new Error("boom")))).toBe(
      "処理に失敗しました。時間をおいて再度お試しください",
    );
  });
});
```

- [ ] **Step 9: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/features/auth/messages.test.ts
```

Expected: FAIL。`Failed to resolve import "./messages"`。

- [ ] **Step 10: 文言マッパを実装する**

`src/features/auth/messages.ts`:

```ts
import { Match } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";

/**
 * Match.exhaustive により、AuthError にタグを足したのにここへ文言を足し忘れると
 * コンパイルエラーになる。Effect を使う主な理由がこの網羅性チェック。
 */
export const authErrorMessage: (error: AuthError) => string = Match.type<
  AuthError
>().pipe(
  Match.tag(
    "InvalidCredentials",
    // どちらが誤りかを示すとアカウントの存在を推測されるため、まとめた文言にする。
    () => "メールアドレスまたはパスワードが正しくありません",
  ),
  Match.tag(
    "EmailAlreadyExists",
    () => "このメールアドレスは既に登録されています",
  ),
  Match.tag("WeakPassword", () => "パスワードの長さが要件を満たしていません"),
  Match.tag(
    "UnexpectedAuthError",
    () => "処理に失敗しました。時間をおいて再度お試しください",
  ),
  Match.exhaustive,
);
```

- [ ] **Step 11: テストが通ることを確認する**

```bash
pnpm exec vitest run src/features/auth/messages.test.ts
```

Expected: PASS（4 tests passed）。

- [ ] **Step 12: 型と lint を通す**

```bash
pnpm typecheck && pnpm lint:fix && pnpm test
```

Expected: すべて成功。

- [ ] **Step 13: コミット**

```bash
git add -A
git commit -m "feat: add tagged auth errors and Japanese messages"
```

---

## Task 4: サインアップのスライス

**Files:**
- Create: `src/features/auth/signup/domain.ts`
- Create: `src/features/auth/signup/domain.test.ts`
- Create: `src/features/auth/signup/schema.ts`
- Create: `src/features/auth/signup/schema.test.ts`
- Create: `src/features/auth/signup/usecase.ts`
- Create: `src/features/auth/signup/usecase.test.ts`

**Interfaces:**
- Consumes: `normalizeEmail`, `MIN_PASSWORD_LENGTH`, `MAX_PASSWORD_LENGTH`（Task 1）、`AuthError`, `AuthCallPort`, `runAuthCall`, `failureTag`（Task 3）
- Produces:
  - `isPasswordLengthValid(password: string): boolean`
  - `signupSchema` (Zod) と `type SignupInput = { name: string; email: string; password: string }`
  - `type SignUpPort = AuthCallPort<SignupInput>`
  - `signup(port: SignUpPort, input: SignupInput): Effect.Effect<void, AuthError>`

- [ ] **Step 1: domain の失敗するテストを書く**

`src/features/auth/signup/domain.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@/shared/lib/password-policy";
import { isPasswordLengthValid } from "./domain";

describe("isPasswordLengthValid", () => {
  it("下限ちょうどは通る", () => {
    expect(isPasswordLengthValid("a".repeat(MIN_PASSWORD_LENGTH))).toBe(true);
  });

  it("下限より 1 文字短いと弾く", () => {
    expect(isPasswordLengthValid("a".repeat(MIN_PASSWORD_LENGTH - 1))).toBe(
      false,
    );
  });

  it("上限ちょうどは通る", () => {
    expect(isPasswordLengthValid("a".repeat(MAX_PASSWORD_LENGTH))).toBe(true);
  });

  it("上限より 1 文字長いと弾く", () => {
    expect(isPasswordLengthValid("a".repeat(MAX_PASSWORD_LENGTH + 1))).toBe(
      false,
    );
  });

  it("空文字は弾く", () => {
    expect(isPasswordLengthValid("")).toBe(false);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/features/auth/signup/domain.test.ts
```

Expected: FAIL。`Failed to resolve import "./domain"`。

- [ ] **Step 3: domain を実装する**

`src/features/auth/signup/domain.ts`:

```ts
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@/shared/lib/password-policy";

export const isPasswordLengthValid = (password: string): boolean =>
  password.length >= MIN_PASSWORD_LENGTH &&
  password.length <= MAX_PASSWORD_LENGTH;
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
pnpm exec vitest run src/features/auth/signup/domain.test.ts
```

Expected: PASS（5 tests passed）。

- [ ] **Step 5: schema の失敗するテストを書く**

`src/features/auth/signup/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH } from "@/shared/lib/password-policy";
import { signupSchema } from "./schema";

const valid = {
  name: "竹添",
  email: "user@example.com",
  password: "a".repeat(MIN_PASSWORD_LENGTH),
};

describe("signupSchema", () => {
  it("正しい入力を通す", () => {
    const result = signupSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("メールアドレスを正規化する", () => {
    const result = signupSchema.safeParse({
      ...valid,
      email: "  User@Example.COM ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@example.com");
    }
  });

  it("名前の前後の空白を落とす", () => {
    const result = signupSchema.safeParse({ ...valid, name: "  竹添  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("竹添");
    }
  });

  it("名前が空だと弾く", () => {
    expect(signupSchema.safeParse({ ...valid, name: "   " }).success).toBe(
      false,
    );
  });

  it("メール形式が不正だと弾く", () => {
    expect(
      signupSchema.safeParse({ ...valid, email: "not-an-email" }).success,
    ).toBe(false);
  });

  it("パスワードが下限より短いと弾く", () => {
    expect(
      signupSchema.safeParse({
        ...valid,
        password: "a".repeat(MIN_PASSWORD_LENGTH - 1),
      }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 6: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/features/auth/signup/schema.test.ts
```

Expected: FAIL。`Failed to resolve import "./schema"`。

- [ ] **Step 7: schema を実装する**

`src/features/auth/signup/schema.ts`:

```ts
import { z } from "zod";
import { normalizeEmail } from "@/shared/lib/email";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@/shared/lib/password-policy";

export const signupSchema = z.object({
  name: z
    .string()
    .transform((raw) => raw.trim())
    .pipe(
      z
        .string()
        .min(1, "名前を入力してください")
        .max(100, "名前は100文字以内で入力してください"),
    ),
  email: z
    .string()
    .transform(normalizeEmail)
    .pipe(z.email("メールアドレスの形式が正しくありません")),
  password: z
    .string()
    .min(
      MIN_PASSWORD_LENGTH,
      `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください`,
    )
    .max(
      MAX_PASSWORD_LENGTH,
      `パスワードは${MAX_PASSWORD_LENGTH}文字以内で入力してください`,
    ),
});

export type SignupInput = z.infer<typeof signupSchema>;
```

- [ ] **Step 8: テストが通ることを確認する**

```bash
pnpm exec vitest run src/features/auth/signup/schema.test.ts
```

Expected: PASS（6 tests passed）。

`z.email` が存在しないというエラーが出た場合、インストールされた zod が v3 系。
`pnpm add zod@^4` を再実行して v4 になっていることを `pnpm list zod` で確認する。

- [ ] **Step 9: usecase の失敗するテストを書く**

`src/features/auth/signup/usecase.test.ts`:

```ts
import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import type { SignUpPort } from "./usecase";
import { signup } from "./usecase";

const input = {
  name: "竹添",
  email: "user@example.com",
  password: "password123",
};

// Effect への包み方と AuthError への写像そのものは
// src/shared/lib/auth-effect.test.ts が網羅している。ここでは signup が
// サインアップ固有の入力をポートへ渡し、失敗を素通しすることだけを見る。
describe("signup", () => {
  it("入力をそのままポートへ渡し、エラーが無ければ成功する", async () => {
    const port: SignUpPort = vi.fn().mockResolvedValue({ error: null });
    const exit = await Effect.runPromiseExit(signup(port, input));
    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith(input);
  });

  it("メール重複を EmailAlreadyExists として返す", async () => {
    const port: SignUpPort = vi.fn().mockResolvedValue({
      error: { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" },
    });
    const exit = await Effect.runPromiseExit(signup(port, input));
    expect(failureTag(exit)).toBe("EmailAlreadyExists");
  });
});
```

- [ ] **Step 10: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/features/auth/signup/usecase.test.ts
```

Expected: FAIL。`Failed to resolve import "./usecase"`。

- [ ] **Step 11: usecase を実装する**

`src/features/auth/signup/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";
import { type AuthCallPort, runAuthCall } from "@/shared/lib/auth-effect";
import type { SignupInput } from "./schema";

/** authClient.signUp.email が満たす最小の形。 */
export type SignUpPort = AuthCallPort<SignupInput>;

export const signup = (
  port: SignUpPort,
  input: SignupInput,
): Effect.Effect<void, AuthError> => runAuthCall(port, input);
```

- [ ] **Step 12: テストが通ることを確認する**

```bash
pnpm exec vitest run src/features/auth/signup/usecase.test.ts
```

Expected: PASS（2 tests passed）。

- [ ] **Step 13: 型と lint を通す**

```bash
pnpm typecheck && pnpm lint:fix && pnpm test
```

Expected: すべて成功。

- [ ] **Step 14: コミット**

```bash
git add -A
git commit -m "feat: add signup slice with schema, domain and usecase"
```

---

## Task 5: ログインのスライス

**Files:**
- Create: `src/features/auth/login/domain.ts`
- Create: `src/features/auth/login/domain.test.ts`
- Create: `src/features/auth/login/schema.ts`
- Create: `src/features/auth/login/schema.test.ts`
- Create: `src/features/auth/login/usecase.ts`
- Create: `src/features/auth/login/usecase.test.ts`

**Interfaces:**
- Consumes: `normalizeEmail`（Task 1）、`AuthError`, `AuthCallPort`, `runAuthCall`, `failureTag`（Task 3）
- Produces:
  - `safeRedirectPath(raw: string | null | undefined): string`
  - `loginSchema` (Zod) と `type LoginInput = { email: string; password: string }`
  - `type SignInPort = AuthCallPort<LoginInput>`
  - `login(port: SignInPort, input: LoginInput): Effect.Effect<void, AuthError>`

- [ ] **Step 1: safeRedirectPath の失敗するテストを書く**

`src/features/auth/login/domain.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./domain";

describe("safeRedirectPath", () => {
  it("同一オリジンの絶対パスは通す", () => {
    expect(safeRedirectPath("/dashboard")).toBe("/dashboard");
  });

  it("クエリ付きのパスも通す", () => {
    expect(safeRedirectPath("/tournaments?page=2")).toBe("/tournaments?page=2");
  });

  it("null は / にする", () => {
    expect(safeRedirectPath(null)).toBe("/");
  });

  it("undefined は / にする", () => {
    expect(safeRedirectPath(undefined)).toBe("/");
  });

  it("空文字は / にする", () => {
    expect(safeRedirectPath("")).toBe("/");
  });

  it("絶対 URL は / にする", () => {
    expect(safeRedirectPath("https://evil.example.com")).toBe("/");
  });

  it("プロトコル相対 URL は / にする", () => {
    expect(safeRedirectPath("//evil.example.com")).toBe("/");
  });

  it("バックスラッシュを使ったプロトコル相対 URL は / にする", () => {
    expect(safeRedirectPath("/\\evil.example.com")).toBe("/");
  });

  it("相対パスは / にする", () => {
    expect(safeRedirectPath("dashboard")).toBe("/");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/features/auth/login/domain.test.ts
```

Expected: FAIL。`Failed to resolve import "./domain"`。

- [ ] **Step 3: safeRedirectPath を実装する**

`src/features/auth/login/domain.ts`:

```ts
/**
 * ログイン後の遷移先として安全な値だけを通す。
 * 外部サイトへ飛ばされるオープンリダイレクトを防ぐため、同一オリジンの
 * 絶対パスに限定する。ブラウザは "//host" と "/\host" をどちらも
 * プロトコル相対 URL として解釈するため、この 2 つを明示的に弾く。
 */
export const safeRedirectPath = (raw: string | null | undefined): string => {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
};
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
pnpm exec vitest run src/features/auth/login/domain.test.ts
```

Expected: PASS（9 tests passed）。

- [ ] **Step 5: schema の失敗するテストを書く**

`src/features/auth/login/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loginSchema } from "./schema";

describe("loginSchema", () => {
  it("正しい入力を通す", () => {
    expect(
      loginSchema.safeParse({ email: "user@example.com", password: "x" })
        .success,
    ).toBe(true);
  });

  it("メールアドレスを正規化する", () => {
    const result = loginSchema.safeParse({
      email: " User@Example.COM ",
      password: "x",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@example.com");
    }
  });

  it("メール形式が不正だと弾く", () => {
    expect(
      loginSchema.safeParse({ email: "nope", password: "x" }).success,
    ).toBe(false);
  });

  it("パスワードが空だと弾く", () => {
    expect(
      loginSchema.safeParse({ email: "user@example.com", password: "" })
        .success,
    ).toBe(false);
  });
});
```

ログイン側はパスワード長の下限を課さない。既存ユーザーのパスワードが将来の
ポリシー変更より短い場合でも、長さ不足を理由にログインを拒んではならないため。

- [ ] **Step 6: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/features/auth/login/schema.test.ts
```

Expected: FAIL。`Failed to resolve import "./schema"`。

- [ ] **Step 7: schema を実装する**

`src/features/auth/login/schema.ts`:

```ts
import { z } from "zod";
import { normalizeEmail } from "@/shared/lib/email";

export const loginSchema = z.object({
  email: z
    .string()
    .transform(normalizeEmail)
    .pipe(z.email("メールアドレスの形式が正しくありません")),
  // 既存ユーザーのパスワードがポリシー変更前の長さでも弾かないよう、
  // ここでは空でないことだけを確認する。
  password: z.string().min(1, "パスワードを入力してください"),
});

export type LoginInput = z.infer<typeof loginSchema>;
```

- [ ] **Step 8: テストが通ることを確認する**

```bash
pnpm exec vitest run src/features/auth/login/schema.test.ts
```

Expected: PASS（4 tests passed）。

- [ ] **Step 9: usecase の失敗するテストを書く**

`src/features/auth/login/usecase.test.ts`:

```ts
import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import type { SignInPort } from "./usecase";
import { login } from "./usecase";

const input = { email: "user@example.com", password: "password123" };

// Effect への包み方と AuthError への写像そのものは
// src/shared/lib/auth-effect.test.ts が網羅している。ここでは login が
// ログイン固有の入力をポートへ渡し、失敗を素通しすることだけを見る。
describe("login", () => {
  it("入力をそのままポートへ渡し、エラーが無ければ成功する", async () => {
    const port: SignInPort = vi.fn().mockResolvedValue({ error: null });
    const exit = await Effect.runPromiseExit(login(port, input));
    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith(input);
  });

  it("資格情報の誤りを InvalidCredentials として返す", async () => {
    const port: SignInPort = vi
      .fn()
      .mockResolvedValue({ error: { code: "INVALID_EMAIL_OR_PASSWORD" } });
    const exit = await Effect.runPromiseExit(login(port, input));
    expect(failureTag(exit)).toBe("InvalidCredentials");
  });
});
```

- [ ] **Step 10: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/features/auth/login/usecase.test.ts
```

Expected: FAIL。`Failed to resolve import "./usecase"`。

- [ ] **Step 11: usecase を実装する**

`src/features/auth/login/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";
import { type AuthCallPort, runAuthCall } from "@/shared/lib/auth-effect";
import type { LoginInput } from "./schema";

/** authClient.signIn.email が満たす最小の形。 */
export type SignInPort = AuthCallPort<LoginInput>;

export const login = (
  port: SignInPort,
  input: LoginInput,
): Effect.Effect<void, AuthError> => runAuthCall(port, input);
```

- [ ] **Step 12: テストが通ることを確認する**

```bash
pnpm exec vitest run src/features/auth/login/usecase.test.ts
```

Expected: PASS（2 tests passed）。

- [ ] **Step 13: 型と lint を通す**

```bash
pnpm typecheck && pnpm lint:fix && pnpm test
```

Expected: すべて成功。

- [ ] **Step 14: コミット**

```bash
git add -A
git commit -m "feat: add login slice with redirect guard, schema and usecase"
```

---

## Task 6: アクセス保護の二層

**Files:**
- Create: `src/shared/middleware/require-session.ts`
- Create: `src/shared/middleware/require-session.test.ts`
- Create: `src/proxy.ts`

**Interfaces:**
- Consumes: `auth` from `@/shared/lib/auth`（Task 2）
- Produces: `requireSession(): Promise<Session>`。戻り値は `auth.api.getSession` の非 null な戻り値

- [ ] **Step 1: requireSession の失敗するテストを書く**

`src/shared/middleware/require-session.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const redirect = vi.fn(() => {
  // next/navigation の redirect は例外を投げて制御を打ち切る。同じ形を模す。
  throw new Error("NEXT_REDIRECT");
});

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirect(path),
}));

vi.mock("@/shared/lib/auth", () => ({
  auth: { api: { getSession: (args: unknown) => getSession(args) } },
}));

const { requireSession } = await import("./require-session");

describe("requireSession", () => {
  beforeEach(() => {
    getSession.mockReset();
    redirect.mockClear();
  });

  it("セッションがあればそれを返す", async () => {
    const session = { user: { id: "u1", name: "竹添" } };
    getSession.mockResolvedValue(session);
    await expect(requireSession()).resolves.toBe(session);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("セッションが無ければ /login にリダイレクトする", async () => {
    getSession.mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
pnpm exec vitest run src/shared/middleware/require-session.test.ts
```

Expected: FAIL。`Failed to resolve import "./require-session"`。

- [ ] **Step 3: requireSession を実装する**

`src/shared/middleware/require-session.ts`:

```ts
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/shared/lib/auth";

/**
 * 認証の実際のセキュリティ境界。保護したい Server Component / Server Action の
 * 冒頭で必ず呼ぶ。proxy.ts の Cookie チェックは体感速度のための最適化であって
 * 署名検証をしていないため、境界として当てにしてはならない。
 */
export const requireSession = async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }
  return session;
};
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
pnpm exec vitest run src/shared/middleware/require-session.test.ts
```

Expected: PASS（2 tests passed）。

- [ ] **Step 5: proxy を実装する**

`src/proxy.ts`（`src/app` と同じ階層。プロジェクトルートではない）:

```ts
import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

/**
 * 未ログインのまま保護ページを開いたときに、レンダリングを始める前に
 * /login へ送るための最適化。
 *
 * セッション Cookie の「存在」しか見ておらず署名も有効期限も検証していない。
 * ここを通過したことは認証済みを意味しない。実際の境界は requireSession()。
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set(
    "redirect",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // 認証エンドポイントとログイン系の画面、静的アセットは除外する。
  matcher: [
    "/((?!api/auth|login|signup|_next/static|_next/image|favicon.ico).*)",
  ],
};
```

- [ ] **Step 6: middleware.ts を作っていないことを確認する**

```bash
ls src/middleware.ts middleware.ts 2>/dev/null
```

Expected: `No such file or directory`。Next.js 16 では `middleware.ts` は廃止されている。

- [ ] **Step 7: 型と lint を通す**

```bash
pnpm typecheck && pnpm lint:fix && pnpm test
```

Expected: すべて成功。

- [ ] **Step 8: コミット**

```bash
git add -A
git commit -m "feat: add requireSession boundary and proxy redirect"
```

---

## Task 7: 構成の移行と依存制約の lint 化

**Files:**
- Create: `biome.json` への `overrides` 追加（既存ファイルを変更）
- Move: `src/features/tournament/components/*.tsx` → `src/components/tournament/`
- Move: `src/features/tournament/lib/*.ts` → `src/features/tournament/`
- Modify: 移動に伴う相対 import、`src/app/page.tsx`

**Interfaces:**
- Consumes: なし（既存コードの再配置のみ）
- Produces: `src/components/` 配下に UI コンポーネントを置く規約と、それを守らせる lint 設定

**背景:** `docs/code-design/architecture.md` が更新され、`src/components/`（UI コンポーネント）が
追加された。あわせて「features 以下は上位ディレクトリのみ依存可、同列・下位は不可」「lint で制約を
かける」というルールが明文化された。既存の `features/tournament` は `components/` が同列の `lib/` を
import しており、この新ルールに違反している。Task 8 で認証 UI を新構成に置く前に、既存コードを
先に移行しておく。

**移行後の形:**

```
src/
├── components/
│   └── tournament/
│       ├── MatchCard.tsx
│       ├── MatchCard.test.tsx
│       ├── MatchNode.tsx
│       └── TournamentFlow.tsx
└── features/tournament/
    ├── types.ts
    ├── layout-bracket.ts        + layout-bracket.test.ts
    ├── resolve-bracket.ts       + resolve-bracket.test.ts
    ├── to-flow-elements.ts      + to-flow-elements.test.ts
    └── mock/
        ├── bracket.ts / participants.ts / results.ts
        └── mock.test.ts
```

`lib/` を 1 階層上げるのは、`mock/mock.test.ts` が `../lib/*` を参照しており、これが
同列ディレクトリ間の依存にあたるため。上げてしまえば `../layout-bracket` という上位参照になり
ルールを満たす。`components/` は `src/features/` の外に出るので、`@/features/tournament/*` を
import してよい。

`src/lib/division/` は本タスクの対象外。並行作業中のため触らない。

- [ ] **Step 1: 移行前のテスト本数を記録する**

```bash
pnpm test
```

Expected: PASS。この本数を控えておく。移行はファイルの移動だけなので、
完了時に**同じ本数**が通らなければならない。

- [ ] **Step 2: UI コンポーネントを src/components/tournament/ へ移す**

```bash
mkdir -p src/components/tournament
git mv src/features/tournament/components/MatchCard.tsx src/components/tournament/MatchCard.tsx
git mv src/features/tournament/components/MatchCard.test.tsx src/components/tournament/MatchCard.test.tsx
git mv src/features/tournament/components/MatchNode.tsx src/components/tournament/MatchNode.tsx
git mv src/features/tournament/components/TournamentFlow.tsx src/components/tournament/TournamentFlow.tsx
rmdir src/features/tournament/components
```

- [ ] **Step 3: lib/ を 1 階層上げる**

```bash
git mv src/features/tournament/lib/layout-bracket.ts src/features/tournament/layout-bracket.ts
git mv src/features/tournament/lib/layout-bracket.test.ts src/features/tournament/layout-bracket.test.ts
git mv src/features/tournament/lib/resolve-bracket.ts src/features/tournament/resolve-bracket.ts
git mv src/features/tournament/lib/resolve-bracket.test.ts src/features/tournament/resolve-bracket.test.ts
git mv src/features/tournament/lib/to-flow-elements.ts src/features/tournament/to-flow-elements.ts
git mv src/features/tournament/lib/to-flow-elements.test.ts src/features/tournament/to-flow-elements.test.ts
rmdir src/features/tournament/lib
```

- [ ] **Step 4: import を書き換える**

移動したファイルの相対 import が壊れているので直す。書き換えの対応表:

| ファイル | 旧 | 新 |
| --- | --- | --- |
| `src/components/tournament/MatchCard.tsx` | `../lib/layout-bracket` | `@/features/tournament/layout-bracket` |
| `src/components/tournament/MatchCard.tsx` | `../types` | `@/features/tournament/types` |
| `src/components/tournament/MatchCard.test.tsx` | `../types` | `@/features/tournament/types` |
| `src/components/tournament/MatchCard.test.tsx` | `./MatchCard` | 変更なし |
| `src/components/tournament/MatchNode.tsx` | `../lib/to-flow-elements` | `@/features/tournament/to-flow-elements` |
| `src/components/tournament/MatchNode.tsx` | `./MatchCard` | 変更なし |
| `src/components/tournament/TournamentFlow.tsx` | `../lib/to-flow-elements` | `@/features/tournament/to-flow-elements` |
| `src/components/tournament/TournamentFlow.tsx` | `./MatchNode` | 変更なし |
| `src/features/tournament/*.ts`（旧 lib） | `../types` | `./types` |
| `src/features/tournament/mock/mock.test.ts` | `../lib/layout-bracket` | `../layout-bracket` |
| `src/features/tournament/mock/mock.test.ts` | `../lib/resolve-bracket` | `../resolve-bracket` |
| `src/features/tournament/mock/mock.test.ts` | `../lib/to-flow-elements` | `../to-flow-elements` |

`src/app/page.tsx` の import も直す:

```
@/features/tournament/components/TournamentFlow → @/components/tournament/TournamentFlow
@/features/tournament/lib/layout-bracket        → @/features/tournament/layout-bracket
@/features/tournament/lib/resolve-bracket       → @/features/tournament/resolve-bracket
@/features/tournament/lib/to-flow-elements      → @/features/tournament/to-flow-elements
```

- [ ] **Step 5: 移行が壊れていないことを確認する**

```bash
pnpm exec next typegen && pnpm typecheck && pnpm lint:fix && pnpm test
```

Expected: すべて成功し、テスト本数が Step 1 と**同じ**であること。減っていたら
テストファイルの移動漏れか、vitest の `include`（`src/**/*.{test,spec}.{ts,tsx}`）から
外れている。

- [ ] **Step 6: 残った違反がないことを確認する**

```bash
grep -rn "from \"\.\./lib/\|from \"\.\./components/" src/features src/components --include=*.ts --include=*.tsx
```

Expected: 出力なし。

```bash
grep -rln "\.tsx$" /dev/null; find src/features -name "*.tsx"
```

Expected: 出力なし。`src/features/` 配下に `.tsx` は残らない。

- [ ] **Step 7: 依存制約を biome に入れる**

`biome.json` の末尾（`assist` の後、閉じ括弧の前）に `overrides` を追加する。
`noRestrictedImports` は `style` グループにあり、既定の severity は warn なので
`"level": "error"` を明示する。

**重要:** biome の `overrides` は、同じルールの `options` を**マージせず置き換える**。
`src/features/auth/**` と `src/features/auth/login/**` の両方にマッチしたとき、後者の
`patterns` が前者を丸ごと上書きしてしまう。そのため、スライス単位の override には
auth 全体のパターンを**再掲する**必要がある。以下の JSON はその形になっている。

```json
  "overrides": [
    {
      "includes": ["src/features/auth/**"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "patterns": [
                  {
                    "group": ["@/features/tournament/**", "@/components/**", "@/app/**"],
                    "message": "features/auth は他の機能・UI・app に依存できません。共通処理は src/shared に置いてください。"
                  }
                ]
              }
            }
          }
        }
      }
    },
    {
      "includes": ["src/features/auth/login/**"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "patterns": [
                  {
                    "group": ["@/features/tournament/**", "@/components/**", "@/app/**"],
                    "message": "features/auth は他の機能・UI・app に依存できません。共通処理は src/shared に置いてください。"
                  },
                  {
                    "group": ["@/features/auth/signup/**", "@/features/auth/logout/**", "../signup/**", "../logout/**"],
                    "message": "同列のスライスには依存できません。共有するものは features/auth 直下か src/shared へ。"
                  }
                ]
              }
            }
          }
        }
      }
    },
    {
      "includes": ["src/features/auth/signup/**"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "patterns": [
                  {
                    "group": ["@/features/tournament/**", "@/components/**", "@/app/**"],
                    "message": "features/auth は他の機能・UI・app に依存できません。共通処理は src/shared に置いてください。"
                  },
                  {
                    "group": ["@/features/auth/login/**", "@/features/auth/logout/**", "../login/**", "../logout/**"],
                    "message": "同列のスライスには依存できません。共有するものは features/auth 直下か src/shared へ。"
                  }
                ]
              }
            }
          }
        }
      }
    },
    {
      "includes": ["src/features/tournament/**"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "patterns": [
                  {
                    "group": ["@/features/auth/**", "@/components/**", "@/app/**"],
                    "message": "features/tournament は他の機能・UI・app に依存できません。"
                  }
                ]
              }
            }
          }
        }
      }
    }
  ]
```

- [ ] **Step 8: lint 設定が効いていることを実際に確かめる**

設定を書いただけでは効いている保証がない。わざと違反する import を一時的に入れて、
lint が落ちることを確認する。

```bash
printf 'import { layoutBracket } from "@/features/tournament/layout-bracket";\nexport const x = layoutBracket;\n' > src/features/auth/login/violation-probe.ts
pnpm exec biome check src/features/auth/login/violation-probe.ts
```

Expected: `noRestrictedImports` の error が出て終了コードが非 0 になる。
出なければ `includes` のパターンか `group` の書き方が誤っている。直してから進む。

確認できたらプローブを消す。

```bash
rm src/features/auth/login/violation-probe.ts
```

- [ ] **Step 9: 全体を通す**

```bash
pnpm exec next typegen && pnpm typecheck && pnpm lint && pnpm test
```

Expected: すべて成功。`pnpm lint`（`--write` なし）が通ること。

- [ ] **Step 10: コミット**

```bash
git add -A
git commit -m "refactor: move UI to src/components and enforce feature boundaries"
```

---

## Task 8: ログインとサインアップの画面

**Files:**
- Create: `src/shared/lib/auth-client.ts`
- Create: `src/components/auth/LoginForm.tsx`
- Create: `src/components/auth/SignupForm.tsx`
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/signup/page.tsx`

**Interfaces:**
- Consumes: `loginSchema` / `login` / `SignInPort` / `safeRedirectPath`（Task 5）、`signupSchema` / `signup` / `SignUpPort`（Task 4）、`authErrorMessage`（Task 3）
- Produces:
  - `authClient` from `@/shared/lib/auth-client`（`signIn.email` / `signIn.social` / `signUp.email` / `signOut` / `useSession`）
  - `<LoginForm redirectTo={string} />` / `<SignupForm redirectTo={string} />`
  - `/login` と `/signup` のページ

- [ ] **Step 1: 認証クライアントを作る**

`src/shared/lib/auth-client.ts`:

```ts
"use client";

import { createAuthClient } from "better-auth/react";

// baseURL を渡さない場合、リクエスト元と同じオリジンの /api/auth が使われる。
export const authClient = createAuthClient();
```

- [ ] **Step 2: ログインフォームを作る**

`src/components/auth/LoginForm.tsx`:

```tsx
"use client";

import { Cause, Effect, Exit, Option } from "effect";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { loginSchema } from "@/features/auth/login/schema";
import { login } from "@/features/auth/login/usecase";
import { authErrorMessage } from "@/features/auth/messages";
import { authClient } from "@/shared/lib/auth-client";

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (formData: FormData) => {
    setError(null);

    const parsed = loginSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setPending(true);
    const exit = await Effect.runPromiseExit(
      login((input) => authClient.signIn.email(input), parsed.data),
    );
    setPending(false);

    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      setError(
        Option.isSome(failure)
          ? authErrorMessage(failure.value)
          : "処理に失敗しました。時間をおいて再度お試しください",
      );
      return;
    }

    router.push(redirectTo);
    // Server Component 側のセッションを読み直させる。
    router.refresh();
  };

  return (
    <div className="w-full max-w-sm space-y-6">
      <h1 className="text-xl font-bold text-slate-800">ログイン</h1>

      <form action={onSubmit} className="space-y-4">
        <div className="space-y-1">
          <label
            htmlFor="email"
            className="block text-sm font-medium text-slate-700"
          >
            メールアドレス
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-slate-700"
          >
            パスワード
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        {error !== null && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "ログイン中..." : "ログイン"}
        </button>
      </form>

      <button
        type="button"
        onClick={() =>
          authClient.signIn.social({
            provider: "google",
            callbackURL: redirectTo,
          })
        }
        className="w-full rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
      >
        Google でログイン
      </button>

      <p className="text-sm text-slate-600">
        アカウントをお持ちでない方は{" "}
        <Link href="/signup" className="underline">
          新規登録
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 3: サインアップフォームを作る**

`src/components/auth/SignupForm.tsx`:

```tsx
"use client";

import { Cause, Effect, Exit, Option } from "effect";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authErrorMessage } from "@/features/auth/messages";
import { signupSchema } from "@/features/auth/signup/schema";
import { signup } from "@/features/auth/signup/usecase";
import { authClient } from "@/shared/lib/auth-client";
import { MIN_PASSWORD_LENGTH } from "@/shared/lib/password-policy";

export function SignupForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (formData: FormData) => {
    setError(null);

    const parsed = signupSchema.safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setPending(true);
    const exit = await Effect.runPromiseExit(
      signup((input) => authClient.signUp.email(input), parsed.data),
    );
    setPending(false);

    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      setError(
        Option.isSome(failure)
          ? authErrorMessage(failure.value)
          : "処理に失敗しました。時間をおいて再度お試しください",
      );
      return;
    }

    // autoSignIn: true のため、登録が済めばそのままログイン済みになる。
    router.push(redirectTo);
    router.refresh();
  };

  return (
    <div className="w-full max-w-sm space-y-6">
      <h1 className="text-xl font-bold text-slate-800">新規登録</h1>

      <form action={onSubmit} className="space-y-4">
        <div className="space-y-1">
          <label
            htmlFor="name"
            className="block text-sm font-medium text-slate-700"
          >
            名前
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="email"
            className="block text-sm font-medium text-slate-700"
          >
            メールアドレス
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-slate-700"
          >
            パスワード
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-slate-500">
            {MIN_PASSWORD_LENGTH} 文字以上
          </p>
        </div>

        {error !== null && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "登録中..." : "登録する"}
        </button>
      </form>

      <button
        type="button"
        onClick={() =>
          authClient.signIn.social({
            provider: "google",
            callbackURL: redirectTo,
          })
        }
        className="w-full rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
      >
        Google で登録
      </button>

      <p className="text-sm text-slate-600">
        既にアカウントをお持ちの方は{" "}
        <Link href="/login" className="underline">
          ログイン
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 4: ログインページを作る**

`src/app/(auth)/login/page.tsx`:

```tsx
import { safeRedirectPath } from "@/features/auth/login/domain";
import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const raw = params.redirect;
  const redirectTo = safeRedirectPath(typeof raw === "string" ? raw : null);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <LoginForm redirectTo={redirectTo} />
    </main>
  );
}
```

- [ ] **Step 5: サインアップページを作る**

`src/app/(auth)/signup/page.tsx`:

```tsx
import { safeRedirectPath } from "@/features/auth/login/domain";
import { SignupForm } from "@/components/auth/SignupForm";

export default async function SignupPage({
  searchParams,
}: PageProps<"/signup">) {
  const params = await searchParams;
  const raw = params.redirect;
  const redirectTo = safeRedirectPath(typeof raw === "string" ? raw : null);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <SignupForm redirectTo={redirectTo} />
    </main>
  );
}
```

- [ ] **Step 6: 型を再生成して通す**

`PageProps<"/login">` は `next typegen` が生成する型なので、ページを作ってから再生成する。

```bash
pnpm exec next typegen && pnpm typecheck && pnpm lint:fix && pnpm test
```

Expected: すべて成功。

`PageProps<"/login">` が見つからないというエラーが続く場合、ルートグループ `(auth)` は
URL に現れないため、パスは `"/login"` であって `"/(auth)/login"` ではないことを確認する。

- [ ] **Step 7: 画面を目で確認する**

```bash
pnpm dev
```

ブラウザで `http://localhost:3000/login` と `http://localhost:3000/signup` を開き、
フォームが表示されることを確認する。まだトップページの保護は入っていないので、
`/` は従来どおり表示される。確認後 `pnpm dev` を止める。

- [ ] **Step 8: コミット**

```bash
git add -A
git commit -m "feat: add login and signup screens"
```

---

## Task 9: ログアウトとトップページの保護

**Files:**
- Create: `src/components/auth/LogoutButton.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `authClient`（Task 7）、`requireSession`（Task 6）
- Produces: `<LogoutButton />`

- [ ] **Step 1: ログアウトボタンを作る**

`src/components/auth/LogoutButton.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/shared/lib/auth-client";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const onClick = async () => {
    setPending(true);
    await authClient.signOut();
    setPending(false);
    router.push("/login");
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-700 disabled:opacity-50"
    >
      {pending ? "ログアウト中..." : "ログアウト"}
    </button>
  );
}
```

- [ ] **Step 2: トップページを保護する**

`src/app/page.tsx` を以下に置き換える。既存のトーナメント表示ロジックはそのまま残し、
冒頭のガードとヘッダーのユーザー表示だけを足す。

```tsx
import { LogoutButton } from "@/components/auth/LogoutButton";
import { TournamentFlow } from "@/components/tournament/TournamentFlow";
import { layoutBracket } from "@/features/tournament/layout-bracket";
import { resolveBracket } from "@/features/tournament/resolve-bracket";
import { toFlowElements } from "@/features/tournament/to-flow-elements";
import { mockBracket } from "@/features/tournament/mock/bracket";
import { mockParticipants } from "@/features/tournament/mock/participants";
import { mockResults } from "@/features/tournament/mock/results";
import { requireSession } from "@/shared/middleware/require-session";

export default async function Home() {
  const session = await requireSession();

  const resolved = resolveBracket(mockParticipants, mockBracket, mockResults);
  const { nodes, edges } = toFlowElements(resolved, layoutBracket(resolved));

  return (
    <main className="flex h-screen flex-col bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div>
          <h1 className="text-lg font-bold text-slate-800">
            {mockBracket.name}
          </h1>
          <p className="text-xs text-slate-500">
            シングルエリミネーション / 参加者 {mockParticipants.length} 名
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-700">{session.user.name}</span>
          <LogoutButton />
        </div>
      </header>
      <div className="flex-1">
        <TournamentFlow nodes={nodes} edges={edges} />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: 型と lint を通す**

```bash
pnpm exec next typegen && pnpm typecheck && pnpm lint:fix && pnpm test
```

Expected: すべて成功。

`session.user.name` で型エラーが出る場合、`requireSession` の戻り値が
`Session | null` と推論されている。`redirect()` の戻り値型が `never` であることを
TypeScript が使えるよう、`if (!session) { redirect("/login"); }` の形になっているか確認する。

- [ ] **Step 4: 未ログインでリダイレクトされることを確認する**

```bash
pnpm dev
```

シークレットウィンドウで `http://localhost:3000/` を開く。

Expected: `http://localhost:3000/login?redirect=%2F` にリダイレクトされる。

- [ ] **Step 5: サインアップからトップ表示までを通しで確認する**

同じブラウザで:

1. `/signup` を開き、名前・メール・8 文字以上のパスワードで登録する
2. トップページが表示され、ヘッダーに登録した名前が出る
3. 「ログアウト」を押すと `/login` に戻る
4. 同じメールとパスワードでログインすると、またトップページが表示される

Expected: 4 つとも通る。確認後 `pnpm dev` を止める。

- [ ] **Step 6: DB に行が入っていることを確認する**

```bash
pnpm db:studio
```

`User` に 1 行、`Account` に `providerId = "credential"` の 1 行、`Session` に 1 行以上
入っていること。`Account.password` にハッシュ文字列が入っており、平文でないこと。
確認後 Studio を止める。

- [ ] **Step 7: コミット**

```bash
git add -A
git commit -m "feat: require login for the tournament page and add logout"
```

---

## Task 10: ドキュメントと最終検証

**Files:**
- Modify: `README.md`
- Modify: `docs/code-design/architecture.md`

**Interfaces:**
- Consumes: すべて
- Produces: なし

- [ ] **Step 1: README にセットアップ手順を追記する**

`README.md` の末尾に追記する:

```markdown
## 認証のセットアップ

認証には [Better Auth](https://www.better-auth.com/) を使っている。
メール+パスワードと Google OAuth に対応している。

### 環境変数

`.env.example` をコピーして `.env` を作り、以下を設定する。

| 変数 | 内容 |
| --- | --- |
| `BETTER_AUTH_SECRET` | セッショントークンの署名鍵。`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` で生成する |
| `BETTER_AUTH_URL` | アプリの URL。開発時は `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` | 下記の手順で発行する |
| `GOOGLE_CLIENT_SECRET` | 下記の手順で発行する |

### Google OAuth クライアントの発行

この作業は自動化できないため手動で行う。

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成する
2. 「APIとサービス」→「認証情報」→「認証情報を作成」→「OAuth クライアント ID」を選ぶ
3. アプリケーションの種類に「ウェブアプリケーション」を選ぶ
4. 「承認済みのリダイレクト URI」に `http://localhost:3000/api/auth/callback/google` を追加する
   （本番環境では `https://<ドメイン>/api/auth/callback/google` も追加する）
5. 発行された「クライアント ID」と「クライアント シークレット」を `.env` に設定する

`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` が空でも、メール+パスワードのログインは動作する。

### 認証まわりの構成

| パス | 役割 |
| --- | --- |
| `src/shared/lib/auth.ts` | Better Auth のサーバー設定 |
| `src/shared/lib/auth-client.ts` | ブラウザ側のクライアント |
| `src/shared/middleware/require-session.ts` | **認証の実際の境界。** 保護するページ・Server Action の冒頭で呼ぶ |
| `src/proxy.ts` | 未ログインを `/login` へ送る最適化。Cookie の有無しか見ておらず、境界ではない |
| `src/features/auth/` | ログイン / サインアップ / ログアウトの各スライス |

新しく保護したいページを追加するときは、`requireSession()` を呼ぶこと。
`src/proxy.ts` の matcher を通ったことは認証済みを意味しない。
```

- [ ] **Step 2: architecture.md に auth スライスの例外を追記する**

`docs/code-design/architecture.md` の末尾に追記する:

```markdown
## 例外: features/auth

`features/auth` の各スライスには `handler.ts` と `repository.ts` を置いていない。

* ルーティングは Next.js の `app/` が所有する（`app/api/auth/[...all]/route.ts` が唯一のエントリポイント）
* 認証テーブルへの DB 操作は Better Auth のアダプタが所有する

このため、スライス側に置くと委譲するだけの空ファイルになる。
`schema.ts` / `domain.ts` / `usecase.ts` と画面のコンポーネントのみを置く。
```

- [ ] **Step 3: 依存が意図どおりであることを確認する**

```bash
pnpm list better-auth @better-auth/prisma-adapter zod effect --depth 0
```

Expected: `better-auth 1.7.x`, `@better-auth/prisma-adapter 1.7.x`, `zod 4.x`, `effect 3.x`。

- [ ] **Step 4: next-auth が混入していないことを確認する**

```bash
grep -rn "next-auth" src package.json
```

Expected: 出力なし。`better-auth/next-js` は別物なので誤検出しない。

- [ ] **Step 5: 全検証を通す**

```bash
pnpm exec next typegen && pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Expected: 5 つすべて成功。`pnpm build` が `DATABASE_URL is not set` で落ちる場合、
ビルド時に `src/app/page.tsx` を静的生成しようとしている。`requireSession()` が
`headers()` を読むためページは動的になるはずだが、落ちるようなら
`export const dynamic = "force-dynamic";` を `src/app/page.tsx` に足す。

- [ ] **Step 6: Google ログインを手動で確認する**

`.env` に実際の `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` を設定してから:

```bash
pnpm dev
```

1. `/login` で「Google でログイン」を押す
2. Google の同意画面を経てトップページに戻る
3. `pnpm db:studio` で `Account` に `providerId = "google"` の行ができていること

さらに連携の確認として、Task 8 で作ったメール+パスワードのアカウントと**同じメールアドレス**の
Google アカウントでログインし、`User` の行が増えず、その `User` に `credential` と `google` の
`Account` が 2 行ぶら下がることを確認する。

環境変数が用意できない場合はこのステップを飛ばし、飛ばしたことを報告する。

- [ ] **Step 7: コミット**

```bash
git add -A
git commit -m "docs: document auth setup and Google OAuth steps"
```

---

## Self-Review 結果

**Spec coverage:**

| 設計書の要件 | 対応タスク |
| --- | --- |
| 依存追加（better-auth / adapter / zod / effect） | Task 1 |
| Prisma スキーマと 1 本のマイグレーション | Task 2 |
| `src/lib/prisma.ts` の移動 | Task 1 |
| Better Auth 設定（baseURL / adapter / emailAndPassword / google / accountLinking / nextCookies） | Task 2 |
| API ルート | Task 2 |
| Effect のタグ付きエラー 4 種 | Task 3 |
| `Match.exhaustive` による文言写像 | Task 3 |
| signup スライス（schema / domain / usecase） | Task 4 |
| login スライス（schema / domain / usecase） | Task 5 |
| `safeRedirectPath` によるオープンリダイレクト対策 | Task 5 |
| `requireSession()` を境界とする | Task 6 |
| `proxy.ts` を最適化に留める | Task 6 |
| `/login` `/signup` 画面と Google ボタン | Task 7 |
| ヘッダーのユーザー名とログアウト | Task 8 |
| アプリ全体をログイン必須 | Task 8 |
| 環境変数と Google Cloud Console 手順 | Task 2（`.env.example`）/ Task 9（README） |
| 検証手順 7 項目 | Task 9 Step 5・6、Task 8 Step 4・5 |
| パスワード長定数の共有 | Task 1（`password-policy.ts`）、Task 2・4 で参照 |

未対応の要件なし。

**設計書からの意図的な差分:**

1. `normalizeEmail` を `signup/domain.ts` ではなく `shared/lib/email.ts` に置いた。
   `login/schema.ts` からも使うため、スライス間の横断 import を避けた。
2. パスワード長の定数を `shared/lib/password-policy.ts` に分離した。
   `shared/lib/auth.ts` に置くとクライアント側の Zod スキーマがサーバー設定ごと
   バンドルに引き込んでしまうため。
3. 設計書では触れていない `features/auth/messages.ts` を追加した。
   `Match.exhaustive` を置く場所として必要。
