# ユーザープロフィール画面 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ログイン中のユーザーが表示名・メールアドレス・パスワード・Google 連携・アカウント削除を自分で操作でき、所属組織を権限つきで確認でき、ヘッダーのユーザー名から開くメニューでそれらへ辿れるようにする。

**Architecture:** `features/user` カテゴリを新設し、各操作を Server Action を持つ垂直スライスにする。書き込みは全て `auth.api.*`（Better Auth のサーバ API）を port として usecase に渡す形で呼ぶ。読み取りは Prisma 直参照にして `BYPASS_AUTH=1` でも画面が開くようにする。

**Tech Stack:** Next.js 16 (App Router) / React 19 / Better Auth 1.7.2 / Prisma 7 / Effect 3 / Zod 4 / Vitest 4 / Testing Library / Tailwind 4 / Biome 2

**設計:** `docs/superpowers/specs/2026-09-07-user-profile-design.md`

## Global Constraints

- パッケージマネージャは **pnpm**。`pnpm test` / `pnpm typecheck` / `pnpm lint` を使う。
- `features/` 配下に `.tsx` を置かない。画面は `src/components/` に置く。
- `features/` の同列スライス・同列カテゴリへの import は禁止。共有するものは親ディレクトリか `src/shared` へ。
- `src/shared/**` から `@/features/**` を import してはならない（biome の `noRestrictedImports` が禁じている）。
- Server Action の冒頭では、ページで確認済みでも `requireSession()` を独立に呼ぶ。
- 所有権のチェックはクエリの `where` に入れる。取得してから条件で弾かない。
- 文言は日本語。コード中のコメントも既存に合わせて日本語で書く。
- パスワードの長さは `MIN_PASSWORD_LENGTH = 8` / `MAX_PASSWORD_LENGTH = 128`（`src/shared/lib/password-policy.ts`）。
- 既存の CRLF による lint ノイズがある。lint の判定は「自分が触った行の内容」で行い、CRLF だけの差分は無視する。
- コミットメッセージの末尾に `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` を付ける。

## 先行する設計との重なり

`docs/superpowers/specs/2026-09-08-password-reset-design.md`（未実装）と
触る場所が重なる。あちらは `changePassword`（ログイン済みユーザーの変更）を
スコープ外にしているので機能は競合しないが、次の 3 点は同じファイルを触る。

* `src/shared/lib/auth.ts` の設定への追記
* `src/shared/lib/` へのメール文面ビルダーの追加
* `AuthError` へのタグ追加（あちらは `INVALID_TOKEN`）

先に入ったほうに合わせて、後から入る側が追記する。`Match.exhaustive` の
網羅性エラーで型が落ちたら、それは想定どおりの検出であって壊れたわけではない。

## 作業場所

このリポジトリのルールにより、実装は **worktree** で行う。

```bash
git worktree add ../tournament-program-profile -b worktree-user-profile
cd ../tournament-program-profile
pnpm install
cp ../tournament-program/.env .env
pnpm exec next typegen   # PageProps / LayoutProps の型を生成する。これが無いとページの型が付かない
```

`main` の作業ツリーには `LoginForm` と `console-mailer` の未コミット変更がある（パスワードリセットの実装が進行中）。worktree はそれと独立に進む。

## ファイル構成

**新規（`src/features/user/`）**

| ファイル | 責務 |
| --- | --- |
| `state.ts` | `ProfileFormState` / `INITIAL_PROFILE_FORM_STATE` / `ProfileFormAction` |
| `messages.ts` | `AuthError` → プロフィール文脈の日本語 |
| `effect-to-form-state.ts` | `Cause<AuthError>` → `ProfileFormState` |
| `repository.ts` | 連携アカウントの読み出し（Prisma 直参照） |
| `update-name/{schema,usecase,handler}.ts` | 表示名の変更 |
| `change-password/{schema,usecase,handler}.ts` | パスワードの変更 |
| `set-password/{schema,usecase,handler}.ts` | パスワードの設定 |
| `change-email/{schema,usecase,handler}.ts` | メールアドレスの変更 |
| `link-google/handler.ts` | Google 連携の追加 |
| `unlink-account/{usecase,handler}.ts` | Google 連携の解除 |
| `revoke-sessions/handler.ts` | 他端末のログアウト |
| `delete-account/{domain,usecase,handler}.ts` | アカウント削除 |

**新規（`src/shared/`）**

| ファイル | 責務 |
| --- | --- |
| `lib/display-name.ts` | 表示名の規則（signup と共有） |
| `authz/sole-granter.ts` | 「唯一の `user.grant` 保持者である組織」の判定 |
| `lib/auth-email-change-email.ts` | メール変更の確認メールと通知メールの文面 |
| `lib/auth-delete-account-email.ts` | アカウント削除の確認メールの文面 |

**新規（`src/components/`）**

`profile/DisplayNameForm.tsx` / `EmailSection.tsx` / `PasswordSection.tsx` / `LinkedAccountsSection.tsx` / `RevokeSessionsForm.tsx` / `DeleteAccountForm.tsx` / `ProfileOrganizationList.tsx`、`layout/UserMenu.tsx`

**新規（`src/app/`）** `profile/page.tsx` / `profile/orgs/page.tsx`

**変更** `src/shared/errors/auth-error.ts` / `src/shared/lib/auth-effect.ts` / `src/shared/lib/auth.ts` / `src/features/auth/messages.ts` / `src/features/auth/signup/schema.ts` / `src/features/organization/repository.ts` / `src/components/layout/AppHeader.tsx` / `src/components/auth/LogoutButton.tsx` / `biome.json` / AppHeader を描画する全ページ

---

## Task 1: AuthError にタグを足し、`runAuthApiCall` を用意する

サーバ側の `auth.api.*` は `{ error }` を返さず `APIError` を throw する。既存の `runAuthCall` では受けられないので、対になる関数を足す。あわせて、以降のタスクで使うエラーコードを `AuthError` に写像する。

**Files:**
- Modify: `src/shared/errors/auth-error.ts`
- Modify: `src/shared/errors/auth-error.test.ts`
- Modify: `src/shared/lib/auth-effect.ts`
- Modify: `src/shared/lib/auth-effect.test.ts`
- Modify: `src/features/auth/messages.ts`
- Modify: `src/features/auth/messages.test.ts`

**Interfaces:**
- Consumes: 既存の `toAuthError(code, cause)`、`AuthError`
- Produces:
  - タグ `InvalidPassword` / `PasswordAlreadySet` / `SessionNotFresh` / `LastAccountUnlinkForbidden` / `AccountNotFound`（いずれも `{ readonly code: string }`）
  - `runAuthApiCall<I, A>(port: (input: I) => Promise<A>, input: I): Effect.Effect<A, AuthError>`
  - 型 `AuthApiPort<I, A> = (input: I) => Promise<A>`

- [ ] **Step 1: `auth-error.test.ts` に写像の失敗するテストを足す**

`src/shared/errors/auth-error.test.ts` の末尾（`describe("toAuthError", ...)` の中）に足す。

```ts
  it.each([
    ["INVALID_PASSWORD", "InvalidPassword"],
    ["PASSWORD_ALREADY_SET", "PasswordAlreadySet"],
    ["SESSION_NOT_FRESH", "SessionNotFresh"],
    ["FAILED_TO_UNLINK_LAST_ACCOUNT", "LastAccountUnlinkForbidden"],
    ["ACCOUNT_NOT_FOUND", "AccountNotFound"],
  ])("%s を %s に写像する", (code, tag) => {
    expect(toAuthError(code, undefined)._tag).toBe(tag);
  });

  it("写像したコードを保持する（元のコードを追えるようにするため）", () => {
    expect(toAuthError("SESSION_NOT_FRESH", undefined)).toMatchObject({
      code: "SESSION_NOT_FRESH",
    });
  });
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm vitest run src/shared/errors/auth-error.test.ts`
Expected: FAIL。5 件が `UnexpectedAuthError` になり `_tag` が一致しない。

- [ ] **Step 3: `auth-error.ts` にタグと写像を足す**

`src/shared/errors/auth-error.ts` の `UnexpectedAuthError` の宣言の直前に足す。

```ts
/** 現在のパスワードが違う。changePassword / deleteUser で返る。 */
export class InvalidPassword extends Data.TaggedError("InvalidPassword")<{
  readonly code: string;
}> {}

/** 既にパスワードが設定済み。setPassword は上書きを拒む。 */
export class PasswordAlreadySet extends Data.TaggedError("PasswordAlreadySet")<{
  readonly code: string;
}> {}

/**
 * セッションが古い。unlinkAccount が freshSessionMiddleware を使っており、
 * セッション作成から session.freshAge（既定 24 時間）を過ぎると返る。
 */
export class SessionNotFresh extends Data.TaggedError("SessionNotFresh")<{
  readonly code: string;
}> {}

/**
 * 最後の 1 つの認証方法は解除できない。これがあるおかげで、パスワード未設定の
 * まま Google 連携を外して締め出される経路が存在しない。
 */
export class LastAccountUnlinkForbidden extends Data.TaggedError(
  "LastAccountUnlinkForbidden",
)<{
  readonly code: string;
}> {}

/** 解除しようとした連携が見つからない。 */
export class AccountNotFound extends Data.TaggedError("AccountNotFound")<{
  readonly code: string;
}> {}
```

`AuthError` のユニオンに 5 つを足す。

```ts
export type AuthError =
  | InvalidCredentials
  | EmailAlreadyExists
  | UsernameAlreadyExists
  | InvalidUsername
  | WeakPassword
  | EmailNotVerified
  | InvalidPassword
  | PasswordAlreadySet
  | SessionNotFresh
  | LastAccountUnlinkForbidden
  | AccountNotFound
  | UnexpectedAuthError;
```

`toAuthError` の `switch` の `default` の直前に足す。

```ts
    // ここから下はプロフィール画面（features/user）の経路で返るコード。
    // ログイン・登録では起きないが、写像は 1 か所にまとめておく。
    case "INVALID_PASSWORD":
      return new InvalidPassword({ code });
    case "PASSWORD_ALREADY_SET":
      return new PasswordAlreadySet({ code });
    case "SESSION_NOT_FRESH":
      return new SessionNotFresh({ code });
    case "FAILED_TO_UNLINK_LAST_ACCOUNT":
      return new LastAccountUnlinkForbidden({ code });
    case "ACCOUNT_NOT_FOUND":
      return new AccountNotFound({ code });
```

- [ ] **Step 4: テストが通り、`features/auth/messages.ts` が型で落ちることを確認する**

Run: `pnpm vitest run src/shared/errors/auth-error.test.ts`
Expected: PASS

Run: `pnpm typecheck`
Expected: FAIL。`src/features/auth/messages.ts` で `Match.exhaustive` が新しい 5 タグを網羅していないという型エラー。これは想定どおりの検出であって壊れたわけではない。

- [ ] **Step 5: `features/auth/messages.ts` に 5 つの文言を足す**

`Match.tag("UnexpectedAuthError", ...)` の直前に足す。

```ts
    // ここから 5 つはプロフィール画面（features/user）の経路で返るコード。
    // ログイン・登録の画面では起きないが、AuthError は 1 つの型なので
    // Match.exhaustive が網羅を要求する。到達しない前提の無難な文言を置く。
    Match.tag("InvalidPassword", () => "パスワードが正しくありません"),
    Match.tag("PasswordAlreadySet", () => "パスワードは既に設定されています"),
    Match.tag(
      "SessionNotFresh",
      () => "セキュリティのため、再度ログインしてからお試しください",
    ),
    Match.tag(
      "LastAccountUnlinkForbidden",
      () => "最後の認証方法は解除できません",
    ),
    Match.tag("AccountNotFound", () => "連携アカウントが見つかりません"),
```

`src/features/auth/messages.test.ts` の末尾（`describe` の中）に足す。

```ts
  it("プロフィール経路のタグにも文言がある（網羅の抜けを検出するため）", () => {
    expect(
      authErrorMessage(new SessionNotFresh({ code: "SESSION_NOT_FRESH" })),
    ).toBe("セキュリティのため、再度ログインしてからお試しください");
  });
```

`src/features/auth/messages.test.ts` の import に `SessionNotFresh` を足す。

- [ ] **Step 6: 型と既存テストが通ることを確認する**

Run: `pnpm typecheck`
Expected: エラー無し

Run: `pnpm vitest run src/features/auth src/shared/errors`
Expected: PASS

- [ ] **Step 7: `runAuthApiCall` の失敗するテストを書く**

`src/shared/lib/auth-effect.test.ts` の末尾に足す。

```ts
describe("runAuthApiCall", () => {
  /** better-call の APIError は name が "APIError" で body.code を持つ。 */
  const apiError = (code: string): Error => {
    const error = new Error("boom");
    error.name = "APIError";
    Object.assign(error, { body: { code }, status: "BAD_REQUEST" });
    return error;
  };

  it("解決した値をそのまま返す（link-social の url を受け取るため）", async () => {
    const port = vi.fn().mockResolvedValue({ url: "https://example.test/x" });
    const exit = await Effect.runPromiseExit(runAuthApiCall(port, input));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ url: "https://example.test/x" });
    }
    expect(port).toHaveBeenCalledWith(input);
  });

  it("APIError の body.code を AuthError に写像する", async () => {
    const port = vi.fn().mockRejectedValue(apiError("SESSION_NOT_FRESH"));
    const exit = await Effect.runPromiseExit(runAuthApiCall(port, input));
    expect(failureTag(exit)).toBe("SessionNotFresh");
  });

  it("未知のコードの APIError は UnexpectedAuthError にする", async () => {
    const port = vi.fn().mockRejectedValue(apiError("WAT"));
    const exit = await Effect.runPromiseExit(runAuthApiCall(port, input));
    expect(failureTag(exit)).toBe("UnexpectedAuthError");
  });

  it("APIError でない例外も UnexpectedAuthError にする", async () => {
    const port = vi.fn().mockRejectedValue(new Error("network"));
    const exit = await Effect.runPromiseExit(runAuthApiCall(port, input));
    expect(failureTag(exit)).toBe("UnexpectedAuthError");
  });
});
```

import 行を `import { runAuthApiCall, runAuthCall } from "./auth-effect";` に直す。

- [ ] **Step 8: テストが落ちることを確認する**

Run: `pnpm vitest run src/shared/lib/auth-effect.test.ts`
Expected: FAIL。`runAuthApiCall` が export されていない。

- [ ] **Step 9: `runAuthApiCall` を実装する**

`src/shared/lib/auth-effect.ts` の末尾に足す。ファイル先頭の import に
`import { isAPIError } from "better-auth/api";` を加える。

```ts
/**
 * サーバ側の `auth.api.*` が満たす形。クライアントの authClient と違って
 * 解決値をそのまま返し、失敗は APIError の throw で伝える。
 */
export type AuthApiPort<I, A> = (input: I) => Promise<A>;

/**
 * `auth.api.*` の呼び出しを Effect に包み、失敗を AuthError に揃える。
 *
 * runAuthCall（クライアント用）と分けているのは、失敗の伝え方が違うため。
 * クライアントは `{ error }` を返し、サーバは APIError を throw する。
 * 1 つの関数で両方を受けようとすると、どちらの経路も曖昧になる。
 *
 * 解決値を捨てずに返すのは、link-social が遷移先の url を返すため。
 * 値が要らない呼び出し側は無視すればよい。
 */
export const runAuthApiCall = <I, A>(
  port: AuthApiPort<I, A>,
  input: I,
): Effect.Effect<A, AuthError> =>
  Effect.tryPromise({
    try: () => port(input),
    catch: (cause) => {
      if (!isAPIError(cause)) {
        // ネットワーク断やアダプタの不具合。コードは無い。
        return toAuthError(undefined, cause);
      }
      // better-call の APIError は body に { message, code } を持つ。
      // BASE_ERROR_CODES の値が { code, message } の形なので、
      // APIError.from を通ったものは必ず code を持つ。
      const code = (cause as { body?: { code?: unknown } }).body?.code;
      return toAuthError(typeof code === "string" ? code : undefined, cause);
    },
  });
```

- [ ] **Step 10: テストが通ることを確認する**

Run: `pnpm vitest run src/shared/lib/auth-effect.test.ts`
Expected: PASS（4 件の新規テストを含む）

- [ ] **Step 11: 全体を確認してコミットする**

Run: `pnpm typecheck && pnpm vitest run && pnpm lint`
Expected: typecheck エラー無し、テスト全 PASS、lint は CRLF 由来の既存ノイズのみ

```bash
git add src/shared/errors/auth-error.ts src/shared/errors/auth-error.test.ts \
        src/shared/lib/auth-effect.ts src/shared/lib/auth-effect.test.ts \
        src/features/auth/messages.ts src/features/auth/messages.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): map profile-path error codes and add runAuthApiCall

Server-side auth.api.* throws an APIError instead of returning { error },
so runAuthCall cannot receive it. runAuthApiCall folds the throw into the
same AuthError, and keeps the resolved value because link-social returns
the URL to redirect to.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `features/user` の土台を作る

以降の全スライスが乗る共通部分。この時点では画面から使われないが、単体でテストできる。

**Files:**
- Create: `src/features/user/state.ts`
- Create: `src/features/user/messages.ts`
- Create: `src/features/user/messages.test.ts`
- Create: `src/features/user/effect-to-form-state.ts`
- Create: `src/features/user/effect-to-form-state.test.ts`
- Create: `src/features/user/repository.ts`
- Create: `src/features/user/repository.test.ts`
- Modify: `biome.json`

**Interfaces:**
- Consumes: `AuthError`（Task 1）、`prisma`
- Produces:
  - `ProfileFormState = { error: string | null; notice: string | null }`
  - `INITIAL_PROFILE_FORM_STATE`
  - `ProfileFormAction = (state: ProfileFormState, formData: FormData) => Promise<ProfileFormState>`
  - `profileErrorMessage(error: AuthError): string`
  - `profileErrorFormState(cause: Cause.Cause<AuthError>): ProfileFormState`
  - `LinkedAccounts = { hasPassword: boolean; google: { accountId: string; linkedAt: Date } | null }`
  - `findLinkedAccounts(userId: string): Promise<LinkedAccounts>`

- [ ] **Step 1: `state.ts` を書く**

```ts
/**
 * プロフィールのフォームが Server Action から受け取る状態。
 * handler（features）とフォーム（components）の両方が参照するため、
 * どちらからも依存できる features/user 直下に置く。
 *
 * organization の FormState と違って notice を持つのは、プロフィールの操作が
 * 遷移せずその場に留まるため。「保存しました」「確認メールを送信しました」を
 * 出す先がここしかない。
 */
export type ProfileFormState = {
  error: string | null;
  notice: string | null;
};

export const INITIAL_PROFILE_FORM_STATE: ProfileFormState = {
  error: null,
  notice: null,
};

/** useActionState に渡す Server Action の形。 */
export type ProfileFormAction = (
  state: ProfileFormState,
  formData: FormData,
) => Promise<ProfileFormState>;
```

- [ ] **Step 2: `messages.test.ts` を書く（失敗する）**

```ts
import { describe, expect, it } from "vitest";
import {
  AccountNotFound,
  type AuthError,
  InvalidCredentials,
  InvalidPassword,
  LastAccountUnlinkForbidden,
  PasswordAlreadySet,
  SessionNotFresh,
  UnexpectedAuthError,
  WeakPassword,
} from "@/shared/errors/auth-error";
import { profileErrorMessage } from "./messages";

describe("profileErrorMessage", () => {
  it("現在のパスワード違いは、そうと分かる文言にする", () => {
    expect(
      profileErrorMessage(new InvalidPassword({ code: "INVALID_PASSWORD" })),
    ).toBe("現在のパスワードが正しくありません");
  });

  it("パスワード未設定は、ログイン画面と違って言い切る", () => {
    // ログイン画面ではアカウントの存在を推測させないため曖昧にしているが、
    // ここは本人のセッションで見ているので隠す相手がいない。
    expect(
      profileErrorMessage(
        new InvalidCredentials({ code: "CREDENTIAL_ACCOUNT_NOT_FOUND" }),
      ),
    ).toBe("パスワードが設定されていません。先に設定してください");
  });

  it("古いセッションでの解除は、再ログインを促す", () => {
    expect(
      profileErrorMessage(new SessionNotFresh({ code: "SESSION_NOT_FRESH" })),
    ).toBe(
      "セキュリティのため、この操作にはログインし直しが必要です。一度ログアウトしてから再度お試しください",
    );
  });

  it("最後の 1 つの解除は、先にパスワードを設定するよう促す", () => {
    expect(
      profileErrorMessage(
        new LastAccountUnlinkForbidden({
          code: "FAILED_TO_UNLINK_LAST_ACCOUNT",
        }),
      ),
    ).toBe(
      "最後のログイン方法は解除できません。先にパスワードを設定してください",
    );
  });

  it("設定済みのパスワードの再設定は、変更として案内する", () => {
    expect(
      profileErrorMessage(
        new PasswordAlreadySet({ code: "PASSWORD_ALREADY_SET" }),
      ),
    ).toBe("パスワードは既に設定されています。変更から操作してください");
  });

  it("連携が見つからない場合の文言がある", () => {
    expect(
      profileErrorMessage(new AccountNotFound({ code: "ACCOUNT_NOT_FOUND" })),
    ).toBe("その連携は見つかりませんでした");
  });

  it("パスワードの長さ違反の文言がある", () => {
    expect(
      profileErrorMessage(new WeakPassword({ code: "PASSWORD_TOO_SHORT" })),
    ).toBe("パスワードの長さが要件を満たしていません");
  });

  it("未知のエラーは一般的な文言に畳む", () => {
    const error: AuthError = new UnexpectedAuthError({
      code: "WAT",
      reason: new Error("x"),
    });
    expect(profileErrorMessage(error)).toBe(
      "処理に失敗しました。時間をおいて再度お試しください",
    );
  });
});
```

- [ ] **Step 3: テストが落ちることを確認する**

Run: `pnpm vitest run src/features/user/messages.test.ts`
Expected: FAIL。`./messages` が存在しない。

- [ ] **Step 4: `messages.ts` を書く**

```ts
import { Match } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";

/**
 * AuthError をプロフィール画面の文脈で日本語にする。
 *
 * features/auth/messages.ts と別に持つのは 2 つの理由による。
 * 同列のカテゴリ同士は import できないこと。そして文言が文脈で変わること。
 * ログイン画面ではアカウントの存在を推測させないよう意図的に曖昧にしている
 * 文言が、本人のセッションで見るプロフィール画面では隠す相手がおらず、
 * 具体的に何をすればよいか言い切れる。
 *
 * Match.exhaustive により、AuthError にタグを足したのにここへ文言を
 * 足し忘れるとコンパイルエラーになる。
 */
export const profileErrorMessage: (error: AuthError) => string =
  Match.type<AuthError>().pipe(
    Match.tag(
      "InvalidCredentials",
      // この画面で InvalidCredentials に畳まれるのは
      // CREDENTIAL_ACCOUNT_NOT_FOUND（パスワード未設定）だけ。
      // 画面はアカウントの状態を見て設定フォームを出しているので、
      // ここへ来るのは表示後に状態が変わった競合にあたる。
      () => "パスワードが設定されていません。先に設定してください",
    ),
    Match.tag(
      "EmailAlreadyExists",
      // changeEmail は列挙対策で既存メールにも成功を返すため、通常は届かない。
      () => "このメールアドレスは使用できません",
    ),
    Match.tag(
      "UsernameAlreadyExists",
      () => "そのユーザー名は既に使われています",
    ),
    Match.tag("InvalidUsername", () => "ユーザー名の形式が正しくありません"),
    Match.tag("WeakPassword", () => "パスワードの長さが要件を満たしていません"),
    Match.tag(
      "EmailNotVerified",
      () => "メールアドレスが未確認です。確認メールのリンクを開いてください",
    ),
    Match.tag("InvalidPassword", () => "現在のパスワードが正しくありません"),
    Match.tag(
      "PasswordAlreadySet",
      () => "パスワードは既に設定されています。変更から操作してください",
    ),
    Match.tag(
      "SessionNotFresh",
      // unlinkAccount は freshSessionMiddleware を使っており、セッション作成から
      // 24 時間を過ぎると弾かれる。復帰手段はログインし直すことだけ。
      () =>
        "セキュリティのため、この操作にはログインし直しが必要です。一度ログアウトしてから再度お試しください",
    ),
    Match.tag(
      "LastAccountUnlinkForbidden",
      () =>
        "最後のログイン方法は解除できません。先にパスワードを設定してください",
    ),
    Match.tag("AccountNotFound", () => "その連携は見つかりませんでした"),
    Match.tag(
      "UnexpectedAuthError",
      () => "処理に失敗しました。時間をおいて再度お試しください",
    ),
    Match.exhaustive,
  );
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm vitest run src/features/user/messages.test.ts`
Expected: PASS（8 件）

- [ ] **Step 6: `effect-to-form-state.test.ts` を書く（失敗する）**

```ts
import { Cause } from "effect";
import { describe, expect, it } from "vitest";
import { InvalidPassword } from "@/shared/errors/auth-error";
import { profileErrorFormState } from "./effect-to-form-state";

describe("profileErrorFormState", () => {
  it("失敗の中身を文言にして error に入れ、notice は空にする", () => {
    const cause = Cause.fail(
      new InvalidPassword({ code: "INVALID_PASSWORD" }),
    );
    expect(profileErrorFormState(cause)).toEqual({
      error: "現在のパスワードが正しくありません",
      notice: null,
    });
  });

  it("Fail 以外（Die など）は一般的な文言に畳む", () => {
    const cause = Cause.die(new Error("boom"));
    expect(profileErrorFormState(cause)).toEqual({
      error: "処理に失敗しました。時間をおいて再度お試しください",
      notice: null,
    });
  });
});
```

- [ ] **Step 7: テストが落ちることを確認する**

Run: `pnpm vitest run src/features/user/effect-to-form-state.test.ts`
Expected: FAIL。`./effect-to-form-state` が存在しない。

- [ ] **Step 8: `effect-to-form-state.ts` を書く**

```ts
import { type Cause, Option } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";
import { profileErrorMessage } from "./messages";
import type { ProfileFormState } from "./state";

/**
 * 全スライスの handler が同じ変換を持つことになるため、共有先として
 * features/user 直下に置く。features/organization の同名ファイルと同じ役割。
 */
export const profileErrorFormState = (
  cause: Cause.Cause<AuthError>,
): ProfileFormState => {
  const failure = Cause.failureOption(cause);
  return {
    error: Option.isSome(failure)
      ? profileErrorMessage(failure.value)
      : "処理に失敗しました。時間をおいて再度お試しください",
    notice: null,
  };
};
```

`import { type Cause, Option } from "effect";` は `Cause.failureOption` を値として使うため
`import { Cause, Option } from "effect";` に直す。

- [ ] **Step 9: テストが通ることを確認する**

Run: `pnpm vitest run src/features/user/effect-to-form-state.test.ts`
Expected: PASS

- [ ] **Step 10: `repository.test.ts` を書く（失敗する）**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: { account: { findMany: (args: unknown) => findMany(args) } },
}));

const { findLinkedAccounts } = await import("./repository");

describe("findLinkedAccounts", () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it("userId を where に入れて引く（横断参照を防ぐ絞り込みそのもの）", async () => {
    findMany.mockResolvedValue([]);

    await findLinkedAccounts("u1");

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      select: {
        id: true,
        providerId: true,
        password: true,
        createdAt: true,
      },
    });
  });

  it("credential アカウントに password があれば hasPassword を true にする", async () => {
    findMany.mockResolvedValue([
      {
        id: "a1",
        providerId: "credential",
        password: "hashed",
        createdAt: new Date("2026-09-01T00:00:00Z"),
      },
    ]);

    const result = await findLinkedAccounts("u1");

    expect(result).toEqual({ hasPassword: true, google: null });
  });

  it("credential 行があっても password が空なら hasPassword は false", async () => {
    // setPassword は credential 行を作ってから password を埋める作りなので、
    // 行の存在だけを見ると「設定済み」と誤判定しうる。
    findMany.mockResolvedValue([
      {
        id: "a1",
        providerId: "credential",
        password: null,
        createdAt: new Date("2026-09-01T00:00:00Z"),
      },
    ]);

    const result = await findLinkedAccounts("u1");

    expect(result.hasPassword).toBe(false);
  });

  it("google の連携は accountId と連携日を返す", async () => {
    findMany.mockResolvedValue([
      {
        id: "a2",
        providerId: "google",
        password: null,
        createdAt: new Date("2026-09-02T00:00:00Z"),
      },
    ]);

    const result = await findLinkedAccounts("u1");

    expect(result).toEqual({
      hasPassword: false,
      google: {
        accountId: "a2",
        linkedAt: new Date("2026-09-02T00:00:00Z"),
      },
    });
  });

  it("パスワードのハッシュ自体は返さない", async () => {
    findMany.mockResolvedValue([
      {
        id: "a1",
        providerId: "credential",
        password: "hashed",
        createdAt: new Date("2026-09-01T00:00:00Z"),
      },
    ]);

    const result = await findLinkedAccounts("u1");

    expect(JSON.stringify(result)).not.toContain("hashed");
  });
});
```

- [ ] **Step 11: テストが落ちることを確認する**

Run: `pnpm vitest run src/features/user/repository.test.ts`
Expected: FAIL。`./repository` が存在しない。

- [ ] **Step 12: `repository.ts` を書く**

```ts
import "server-only";
import { prisma } from "@/shared/db/prisma";

/** Better Auth がパスワード用のアカウントに使う providerId。 */
const CREDENTIAL_PROVIDER_ID = "credential";

/** このアプリが対応する唯一の OAuth プロバイダ。 */
export const GOOGLE_PROVIDER_ID = "google";

export type LinkedAccounts = {
  /** パスワードでログインできるか。 */
  hasPassword: boolean;
  /** Google 連携。未連携なら null。 */
  google: { accountId: string; linkedAt: Date } | null;
};

/**
 * 連携アカウントの状態を読む。
 *
 * auth.api.listUserAccounts ではなく Prisma を直接引くのは、BYPASS_AUTH=1 の
 * ときに Better Auth のセッションが存在せず、auth.api.* が UNAUTHORIZED に
 * なってプロフィール画面自体が開けなくなるため。architecture.md は
 * 「認証テーブルへの DB 操作は Better Auth のアダプタが所有する」と定めているが、
 * ここは読み取りの射影に限る例外とする。書き込みは一切通さない。
 *
 * password はハッシュそのものを画面へ運ばないよう、真偽値に畳んでから返す。
 */
export const findLinkedAccounts = async (
  userId: string,
): Promise<LinkedAccounts> => {
  const accounts = await prisma.account.findMany({
    where: { userId },
    select: {
      id: true,
      providerId: true,
      password: true,
      createdAt: true,
    },
  });

  const credential = accounts.find(
    (account) => account.providerId === CREDENTIAL_PROVIDER_ID,
  );
  const google = accounts.find(
    (account) => account.providerId === GOOGLE_PROVIDER_ID,
  );

  return {
    // 行の存在ではなく password の中身を見る。setPassword は credential 行を
    // 作ってから password を埋めるため、行だけでは判定にならない。
    hasPassword: Boolean(credential?.password),
    google: google
      ? { accountId: google.id, linkedAt: google.createdAt }
      : null,
  };
};
```

- [ ] **Step 13: テストが通ることを確認する**

Run: `pnpm vitest run src/features/user/repository.test.ts`
Expected: PASS（5 件）

- [ ] **Step 14: `biome.json` に `features/user` の依存制約を足す**

`overrides` 配列の末尾（`src/features/schedule/**` の要素の後ろ）に足す。

```json
    {
      "includes": ["src/features/user/**"],
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
                      "@/features/schedule/**",
                      "@/features/schedule",
                      "@/features/tournament/**",
                      "@/features/tournament",
                      "@/components/**",
                      "**/components/**",
                      "@/app/**",
                      "**/app/**"
                    ],
                    "message": "features/user は他の機能・UI・app に依存できません。共通処理は src/shared に置いてください。"
                  }
                ]
              }
            }
          }
        }
      }
    }
```

- [ ] **Step 15: lint と全体を確認してコミットする**

Run: `pnpm lint 2>&1 | grep -i "features/user"`
Expected: 出力なし（`features/user` に違反が無い）

Run: `pnpm typecheck && pnpm vitest run src/features/user`
Expected: エラー無し、PASS

```bash
git add src/features/user biome.json
git commit -m "$(cat <<'EOF'
feat(user): add the features/user foundation

State, error messages, and the linked-account read that every profile
slice builds on.

The account read goes to Prisma rather than auth.api.listUserAccounts so
the page still renders under BYPASS_AUTH=1, where no Better Auth session
exists. It reads the password column only to fold it into a boolean --
the hash never reaches the page. Writes never go through here.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `/profile` の骨格と表示名の変更

最初の縦切り。ページ・スライス・フォームが一通り通り、以降のタスクはこのページに節を足していく形になる。

**Files:**
- Create: `src/shared/lib/display-name.ts`
- Create: `src/shared/lib/display-name.test.ts`
- Modify: `src/features/auth/signup/schema.ts`
- Create: `src/features/user/update-name/schema.ts`
- Create: `src/features/user/update-name/schema.test.ts`
- Create: `src/features/user/update-name/usecase.ts`
- Create: `src/features/user/update-name/usecase.test.ts`
- Create: `src/features/user/update-name/handler.ts`
- Create: `src/features/user/update-name/handler.test.ts`
- Create: `src/components/profile/DisplayNameForm.tsx`
- Create: `src/components/profile/DisplayNameForm.test.tsx`
- Create: `src/app/profile/page.tsx`
- Create: `src/app/profile/page.test.tsx`

**Interfaces:**
- Consumes: `ProfileFormState` / `INITIAL_PROFILE_FORM_STATE` / `ProfileFormAction` / `profileErrorFormState`（Task 2）、`runAuthApiCall` / `AuthApiPort`（Task 1）、`findLinkedAccounts`（Task 2）、`requireSession`
- Produces:
  - `displayNameSchema`（トリム済みの表示名を返す Zod スキーマ）
  - `updateNameSchema` / `UpdateNameInput = { name: string }`
  - `UpdateNamePort = AuthApiPort<{ body: { name: string }; headers: Headers }, unknown>`
  - `updateName(port, input, headers): Effect.Effect<unknown, AuthError>`
  - `updateNameAction: ProfileFormAction`

- [ ] **Step 1: `display-name.test.ts` を書く（失敗する）**

```ts
import { describe, expect, it } from "vitest";
import { displayNameSchema } from "./display-name";

describe("displayNameSchema", () => {
  it("前後の空白を落とす", () => {
    const result = displayNameSchema.safeParse("  竹添太郎  ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("竹添太郎");
    }
  });

  it("空白だけの名前を弾く", () => {
    const result = displayNameSchema.safeParse("   ");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("名前を入力してください");
    }
  });

  it("100 文字は通す", () => {
    expect(displayNameSchema.safeParse("あ".repeat(100)).success).toBe(true);
  });

  it("101 文字を弾く", () => {
    const result = displayNameSchema.safeParse("あ".repeat(101));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "名前は100文字以内で入力してください",
      );
    }
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm vitest run src/shared/lib/display-name.test.ts`
Expected: FAIL。`./display-name` が存在しない。

- [ ] **Step 3: `display-name.ts` を書き、signup から使う**

`src/shared/lib/display-name.ts`:

```ts
import { z } from "zod";

/**
 * 表示名（User.name）の規則。登録（features/auth/signup）と変更
 * （features/user/update-name）の両方が使う。同列のカテゴリ同士は依存できず、
 * かつ規則が 2 か所に分かれると「登録では通るのに変更で弾かれる」ずれが
 * 起きるため、username.ts / email.ts と同じく shared に 1 つだけ持つ。
 */
export const displayNameSchema = z
  .string()
  .transform((raw) => raw.trim())
  .pipe(
    z
      .string()
      .min(1, "名前を入力してください")
      .max(100, "名前は100文字以内で入力してください"),
  );
```

`src/features/auth/signup/schema.ts` の import に足す。

```ts
import { displayNameSchema } from "@/shared/lib/display-name";
```

`signupSchema` の `name` を差し替える。

```ts
export const signupSchema = z.object({
  // 規則は shared に 1 つだけ持つ。プロフィールの変更側と同じものを使わないと
  // 「登録では通るのに変更で弾かれる」ずれが起きる。
  name: displayNameSchema,
  username: usernameSchema,
```

- [ ] **Step 4: テストが通り、signup の既存テストも壊れていないことを確認する**

Run: `pnpm vitest run src/shared/lib/display-name.test.ts src/features/auth/signup`
Expected: PASS

- [ ] **Step 5: `update-name/schema.test.ts` を書く（失敗する）**

```ts
import { describe, expect, it } from "vitest";
import { updateNameSchema } from "./schema";

describe("updateNameSchema", () => {
  it("妥当な名前を通し、前後の空白を落とす", () => {
    const result = updateNameSchema.safeParse({ name: "  竹添太郎  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "竹添太郎" });
    }
  });

  it("空の名前を弾く", () => {
    const result = updateNameSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("名前を入力してください");
    }
  });

  it("email や username を渡しても落とす（この経路では変えられない）", () => {
    const result = updateNameSchema.safeParse({
      name: "竹添太郎",
      email: "evil@example.test",
      username: "evil",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "竹添太郎" });
    }
  });
});
```

- [ ] **Step 6: テストが落ちることを確認する**

Run: `pnpm vitest run src/features/user/update-name/schema.test.ts`
Expected: FAIL。`./schema` が存在しない。

- [ ] **Step 7: `update-name/schema.ts` を書く**

```ts
import { z } from "zod";
import { displayNameSchema } from "@/shared/lib/display-name";

/**
 * name だけを持つ。Better Auth の updateUser は任意のフィールドを受け取る
 * 作りなので、スキーマで絞らないとフォームに hidden を足すだけで
 * 別の列を書き換えられてしまう。ここが唯一の絞り込み。
 */
export const updateNameSchema = z.object({
  name: displayNameSchema,
});

export type UpdateNameInput = z.infer<typeof updateNameSchema>;
```

- [ ] **Step 8: テストが通ることを確認する**

Run: `pnpm vitest run src/features/user/update-name/schema.test.ts`
Expected: PASS

- [ ] **Step 9: `update-name/usecase.test.ts` を書く（失敗する）**

```ts
import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import type { UpdateNamePort } from "./usecase";
import { updateName } from "./usecase";

const headers = new Headers();

describe("updateName", () => {
  it("name だけを body に入れ、headers をそのまま渡す", async () => {
    const port = vi.fn().mockResolvedValue({ status: true });

    const exit = await Effect.runPromiseExit(
      updateName(port, { name: "竹添太郎" }, headers),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({ body: { name: "竹添太郎" }, headers });
  });

  it("port が投げた APIError を AuthError に写して伝える", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, { body: { code: "SESSION_NOT_FRESH" } });
    const port: UpdateNamePort = () => Promise.reject(apiError);

    const exit = await Effect.runPromiseExit(
      updateName(port, { name: "竹添太郎" }, headers),
    );

    expect(failureTag(exit)).toBe("SessionNotFresh");
  });
});
```

- [ ] **Step 10: テストが落ちることを確認する**

Run: `pnpm vitest run src/features/user/update-name/usecase.test.ts`
Expected: FAIL。`./usecase` が存在しない。

- [ ] **Step 11: `update-name/usecase.ts` を書く**

```ts
import type { Effect } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";
import { type AuthApiPort, runAuthApiCall } from "@/shared/lib/auth-effect";
import type { UpdateNameInput } from "./schema";

/**
 * auth.api.updateUser が満たす最小の形。実体を引数で受けることで、
 * Better Auth 本体を呼ばずに分岐を検証できる。
 * repository.ts を置かないのは、認証テーブルへの書き込みを Better Auth の
 * アダプタが所有しているため（architecture.md の features/auth の例外と同じ）。
 */
export type UpdateNamePort = AuthApiPort<
  { body: { name: string }; headers: Headers },
  unknown
>;

export const updateName = (
  port: UpdateNamePort,
  input: UpdateNameInput,
  headers: Headers,
): Effect.Effect<unknown, AuthError> =>
  runAuthApiCall(port, { body: { name: input.name }, headers });
```

- [ ] **Step 12: テストが通ることを確認する**

Run: `pnpm vitest run src/features/user/update-name/usecase.test.ts`
Expected: PASS

- [ ] **Step 13: `update-name/handler.test.ts` を書く（失敗する）**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_PROFILE_FORM_STATE } from "../state";

const requireSession = vi.fn();
const updateUser = vi.fn();
const revalidatePath = vi.fn();
const nextHeaders = vi.fn();

vi.mock("@/shared/middleware/require-session", () => ({
  requireSession: () => requireSession(),
}));

vi.mock("@/shared/lib/auth", () => ({
  auth: { api: { updateUser: (input: unknown) => updateUser(input) } },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string, type?: string) => revalidatePath(path, type),
}));

vi.mock("next/headers", () => ({
  headers: () => nextHeaders(),
}));

const { updateNameAction } = await import("./handler");

const buildFormData = (name: string): FormData => {
  const data = new FormData();
  data.set("name", name);
  return data;
};

describe("updateNameAction", () => {
  beforeEach(() => {
    requireSession.mockReset();
    updateUser.mockReset();
    revalidatePath.mockClear();
    nextHeaders.mockReset();
    requireSession.mockResolvedValue({ user: { id: "u1", name: "竹添" } });
    nextHeaders.mockResolvedValue(new Headers());
    updateUser.mockResolvedValue({ status: true });
  });

  it("未ログインなら requireSession の時点で打ち切られ、更新に進まない", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(
      updateNameAction(INITIAL_PROFILE_FORM_STATE, buildFormData("竹添太郎")),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(updateUser).not.toHaveBeenCalled();
  });

  it("検証に失敗すれば更新せずエラーを返す", async () => {
    const result = await updateNameAction(
      INITIAL_PROFILE_FORM_STATE,
      buildFormData("   "),
    );

    expect(result).toEqual({ error: "名前を入力してください", notice: null });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("成功したら notice を返し、ヘッダーの名前を更新するため再検証する", async () => {
    const result = await updateNameAction(
      INITIAL_PROFILE_FORM_STATE,
      buildFormData("竹添太郎"),
    );

    expect(result).toEqual({ error: null, notice: "表示名を変更しました" });
    expect(updateUser).toHaveBeenCalledWith({
      body: { name: "竹添太郎" },
      headers: expect.any(Headers),
    });
    // ヘッダーは全ページに出るため、レイアウト全体を作り直させる。
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("Better Auth の失敗は文言に写して返す（例外にしない）", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, { body: { code: "SESSION_NOT_FRESH" } });
    updateUser.mockRejectedValue(apiError);

    const result = await updateNameAction(
      INITIAL_PROFILE_FORM_STATE,
      buildFormData("竹添太郎"),
    );

    expect(result.notice).toBeNull();
    expect(result.error).toContain("ログインし直し");
  });
});
```

- [ ] **Step 14: テストが落ちることを確認する**

Run: `pnpm vitest run src/features/user/update-name/handler.test.ts`
Expected: FAIL。`./handler` が存在しない。

- [ ] **Step 15: `update-name/handler.ts` を書く**

```ts
"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/shared/lib/auth";
import { requireSession } from "@/shared/middleware/require-session";
import { profileErrorFormState } from "../effect-to-form-state";
import type { ProfileFormState } from "../state";
import { updateNameSchema } from "./schema";
import { updateName } from "./usecase";

export const updateNameAction = async (
  _prevState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> => {
  // ページで確認済みでも Server Action は独立した入口なので、ここでも呼ぶ。
  await requireSession();

  const parsed = updateNameSchema.safeParse({
    name: String(formData.get("name") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, notice: null };
  }

  // 誰の名前を変えるかはセッション（Cookie）が決める。userId をフォームから
  // 受け取らないので、他人の行を書き換える経路が存在しない。
  const exit = await Effect.runPromiseExit(
    updateName(
      (input) => auth.api.updateUser(input),
      parsed.data,
      await headers(),
    ),
  );

  if (Exit.isFailure(exit)) {
    return profileErrorFormState(exit.cause);
  }

  // ヘッダーのユーザー名は全ページに出るため、レイアウトごと作り直させる。
  revalidatePath("/", "layout");
  return { error: null, notice: "表示名を変更しました" };
};
```

- [ ] **Step 16: テストが通ることを確認する**

Run: `pnpm vitest run src/features/user/update-name/handler.test.ts`
Expected: PASS（4 件）

- [ ] **Step 17: `DisplayNameForm.test.tsx` を書く（失敗する）**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProfileFormAction } from "@/features/user/state";
import { DisplayNameForm } from "./DisplayNameForm";

const noopAction: ProfileFormAction = async () => ({
  error: null,
  notice: null,
});

describe("DisplayNameForm", () => {
  it("現在の表示名が初期値に入る", () => {
    render(<DisplayNameForm action={noopAction} defaultName="竹添太郎" />);

    expect(screen.getByLabelText("表示名")).toHaveValue("竹添太郎");
  });

  it("保存ボタンがある", () => {
    render(<DisplayNameForm action={noopAction} defaultName="竹添太郎" />);

    expect(
      screen.getByRole("button", { name: "表示名を保存" }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 18: テストが落ちることを確認する**

Run: `pnpm vitest run src/components/profile/DisplayNameForm.test.tsx`
Expected: FAIL。`./DisplayNameForm` が存在しない。

- [ ] **Step 19: `DisplayNameForm.tsx` を書く**

```tsx
"use client";

import { useActionState } from "react";
import {
  INITIAL_PROFILE_FORM_STATE,
  type ProfileFormAction,
} from "@/features/user/state";

export function DisplayNameForm({
  action,
  defaultName,
}: {
  action: ProfileFormAction;
  defaultName: string;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_PROFILE_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1">
        <label
          htmlFor="profile-name"
          className="block text-sm font-medium text-slate-700"
        >
          表示名
        </label>
        <input
          id="profile-name"
          name="name"
          type="text"
          required
          defaultValue={defaultName}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <p className="text-xs text-slate-500">
          ヘッダーや組織のメンバー一覧に表示されます
        </p>
      </div>

      {state.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state.notice !== null && (
        <p role="status" className="text-sm text-emerald-700">
          {state.notice}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "保存中..." : "表示名を保存"}
      </button>
    </form>
  );
}
```

- [ ] **Step 20: テストが通ることを確認する**

Run: `pnpm vitest run src/components/profile/DisplayNameForm.test.tsx`
Expected: PASS

- [ ] **Step 21: `app/profile/page.test.tsx` を書く（失敗する）**

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// LogoutButton は authClient / useRouter に依存するクライアントコンポーネントで、
// テスト環境ではルーターが無く描画できないためモジュールごと差し替える。
vi.mock("@/components/auth/LogoutButton", () => ({
  LogoutButton: () => <button type="button">ログアウト</button>,
}));

const requireSession = vi.fn();
const findLinkedAccounts = vi.fn();

vi.mock("@/shared/middleware/require-session", () => ({
  requireSession: () => requireSession(),
}));

vi.mock("@/features/user/repository", () => ({
  findLinkedAccounts: (userId: string) => findLinkedAccounts(userId),
}));

const { default: ProfilePage } = await import("./page");

describe("ProfilePage", () => {
  beforeEach(() => {
    requireSession.mockReset();
    findLinkedAccounts.mockReset();
    requireSession.mockResolvedValue({
      user: { id: "u1", name: "竹添太郎", email: "taro@example.test" },
    });
    findLinkedAccounts.mockResolvedValue({ hasPassword: true, google: null });
  });

  it("セッションのユーザーの連携状態だけを読む", async () => {
    render(await ProfilePage());

    expect(findLinkedAccounts).toHaveBeenCalledWith("u1");
  });

  it("現在の表示名がフォームの初期値に入る", async () => {
    render(await ProfilePage());

    expect(screen.getByLabelText("表示名")).toHaveValue("竹添太郎");
  });

  it("見出しが出る", async () => {
    render(await ProfilePage());

    expect(
      screen.getByRole("heading", { name: "プロフィール", level: 1 }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 22: テストが落ちることを確認する**

Run: `pnpm vitest run src/app/profile/page.test.tsx`
Expected: FAIL。`./page` が存在しない。

- [ ] **Step 23: `app/profile/page.tsx` を書く**

```tsx
import { AppHeader } from "@/components/layout/AppHeader";
import { DisplayNameForm } from "@/components/profile/DisplayNameForm";
import { findLinkedAccounts } from "@/features/user/repository";
import { updateNameAction } from "@/features/user/update-name/handler";
import { requireSession } from "@/shared/middleware/require-session";

export default async function ProfilePage() {
  const session = await requireSession();
  // 以降のタスクでパスワード節・連携節がこの値を使う。
  await findLinkedAccounts(session.user.id);

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        crumbs={[{ label: "プロフィール" }]}
        userName={session.user.name}
      />

      <div className="mx-auto max-w-xl space-y-8 px-6 py-8">
        <h1 className="text-lg font-bold text-slate-800">プロフィール</h1>

        <section className="space-y-4 rounded border border-slate-200 bg-white px-5 py-4">
          <h2 className="text-sm font-bold text-slate-800">基本情報</h2>
          <DisplayNameForm
            action={updateNameAction}
            defaultName={session.user.name}
          />
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 24: テストが通ることを確認する**

Run: `pnpm vitest run src/app/profile/page.test.tsx`
Expected: PASS（3 件）

- [ ] **Step 25: 全体を確認してコミットする**

Run: `pnpm typecheck && pnpm vitest run && pnpm lint`
Expected: エラー無し、全 PASS

```bash
git add src/shared/lib/display-name.ts src/shared/lib/display-name.test.ts \
        src/features/auth/signup/schema.ts \
        src/features/user/update-name src/components/profile src/app/profile
git commit -m "feat(user): add the profile page and display-name editing"
```

コミット本文には次を含める。

```
The display-name rule moves to shared/lib/display-name.ts so signup and
the profile edit cannot drift into "accepted at signup, rejected on
change".

updateUser takes arbitrary fields, so the schema is what stops a hidden
input from reaching another column. Whose name changes is decided by the
session cookie, never by the form.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 4: `/profile/orgs` — 所属組織を権限つきで一覧する

`features/user` に依存しない独立したタスク。読み取りだけなので Task 3 とは並行して進められる。

**Files:**
- Modify: `src/features/organization/repository.ts`
- Modify: `src/features/organization/repository.test.ts`
- Create: `src/components/profile/ProfileOrganizationList.tsx`
- Create: `src/components/profile/ProfileOrganizationList.test.tsx`
- Create: `src/app/profile/orgs/page.tsx`
- Create: `src/app/profile/orgs/page.test.tsx`

**Interfaces:**
- Consumes: `prisma`、`requireSession`、`AppHeader`
- Produces:
  - `type MembershipSummary = { id: string; name: string; slug: string; joinedAt: Date; permissions: { code: string; description: string }[] }`
  - `listMembershipsForUser(userId: string): Promise<MembershipSummary[]>`
  - `ProfileOrganizationList({ memberships }: { memberships: MembershipSummary[] })`

**注意:** `/profile/orgs` は組織スコープの画面ではないので `requireOrganization` は使わない。
絞り込みは「`userId` を `where` に入れて所属行だけを引く」ことそのものが担う
（既存の `listOrganizationsForUser` と同じ考え方）。

- [ ] **Step 1: `repository.test.ts` に失敗するテストを足す**

`src/features/organization/repository.test.ts` の末尾に足す。既存の `vi.mock` が
`prisma.organizationUser.findMany` を持っていない場合は、モックの定義に足すこと。

```ts
describe("listMembershipsForUser", () => {
  beforeEach(() => {
    organizationUserFindMany.mockReset();
  });

  it("userId を where に入れ、参加順に引く", async () => {
    organizationUserFindMany.mockResolvedValue([]);

    await listMembershipsForUser("u1");

    expect(organizationUserFindMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      orderBy: { joinedAt: "asc" },
      select: {
        joinedAt: true,
        organization: { select: { id: true, name: true, slug: true } },
        permissions: {
          select: { permission: { select: { code: true, description: true } } },
        },
      },
    });
  });

  it("組織と参加日と権限を 1 つの形に均す", async () => {
    organizationUserFindMany.mockResolvedValue([
      {
        joinedAt: new Date("2026-08-01T00:00:00Z"),
        organization: { id: "o1", name: "テニス部", slug: "tennis" },
        permissions: [
          { permission: { code: "user.grant", description: "権限の付与" } },
          { permission: { code: "org.edit", description: "組織の編集" } },
        ],
      },
    ]);

    const result = await listMembershipsForUser("u1");

    expect(result).toEqual([
      {
        id: "o1",
        name: "テニス部",
        slug: "tennis",
        joinedAt: new Date("2026-08-01T00:00:00Z"),
        permissions: [
          { code: "user.grant", description: "権限の付与" },
          { code: "org.edit", description: "組織の編集" },
        ],
      },
    ]);
  });

  it("権限を 1 つも持たない所属も落とさずに返す", async () => {
    // 招待されただけで何も付与されていない状態は正常。ここで消すと
    // 「所属しているのに一覧に出ない」ことになる。
    organizationUserFindMany.mockResolvedValue([
      {
        joinedAt: new Date("2026-08-01T00:00:00Z"),
        organization: { id: "o1", name: "テニス部", slug: "tennis" },
        permissions: [],
      },
    ]);

    const result = await listMembershipsForUser("u1");

    expect(result).toHaveLength(1);
    expect(result[0].permissions).toEqual([]);
  });
});
```

モックは既存ファイルの形に合わせる。無ければ次を足す。

```ts
const organizationUserFindMany = vi.fn();
```

そして `vi.mock("@/shared/db/prisma", ...)` の中に
`organizationUser: { findMany: (args: unknown) => organizationUserFindMany(args) }` を持たせる
（既存のモックに `organizationUser` の別メソッドがある場合は、それを消さずに `findMany` を足す）。
import 行に `listMembershipsForUser` を足す。

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm vitest run src/features/organization/repository.test.ts`
Expected: FAIL。`listMembershipsForUser` が export されていない。

- [ ] **Step 3: `listMembershipsForUser` を実装する**

`src/features/organization/repository.ts` の末尾に足す。

```ts
export type MembershipSummary = {
  id: string;
  name: string;
  slug: string;
  joinedAt: Date;
  permissions: { code: string; description: string }[];
};

/**
 * ユーザーの所属を、その組織で持つ権限つきで参加順に返す。
 * プロフィールの「所属組織」画面が使う。
 *
 * listOrganizationsForUser（トップの移動用一覧）と分けているのは、
 * あちらが移動のための最小限で、権限まで引くと全ページで無駄な結合が
 * 増えるため。用途が違えばクエリも分ける。
 *
 * 絞り込みは userId を where に入れることそのもの。所属していない組織は
 * そもそも返らないので、この関数自体が境界になる。
 */
export const listMembershipsForUser = async (
  userId: string,
): Promise<MembershipSummary[]> => {
  const memberships = await prisma.organizationUser.findMany({
    where: { userId },
    orderBy: { joinedAt: "asc" },
    select: {
      joinedAt: true,
      organization: { select: { id: true, name: true, slug: true } },
      permissions: {
        select: { permission: { select: { code: true, description: true } } },
      },
    },
  });

  return memberships.map((membership) => ({
    id: membership.organization.id,
    name: membership.organization.name,
    slug: membership.organization.slug,
    joinedAt: membership.joinedAt,
    permissions: membership.permissions.map((grant) => ({
      code: grant.permission.code,
      description: grant.permission.description,
    })),
  }));
};
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm vitest run src/features/organization/repository.test.ts`
Expected: PASS（新規 3 件を含む）

- [ ] **Step 5: `ProfileOrganizationList.test.tsx` を書く（失敗する）**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MembershipSummary } from "@/features/organization/repository";
import { ProfileOrganizationList } from "./ProfileOrganizationList";

const membership = (
  overrides: Partial<MembershipSummary> = {},
): MembershipSummary => ({
  id: "o1",
  name: "テニス部",
  slug: "tennis",
  joinedAt: new Date("2026-08-01T00:00:00Z"),
  permissions: [{ code: "org.edit", description: "組織の編集" }],
  ...overrides,
});

describe("ProfileOrganizationList", () => {
  it("所属が無ければその旨を出す", () => {
    render(<ProfileOrganizationList memberships={[]} />);

    expect(
      screen.getByText("所属している組織はありません"),
    ).toBeInTheDocument();
  });

  it("組織名が組織ページへのリンクになる", () => {
    render(<ProfileOrganizationList memberships={[membership()]} />);

    expect(screen.getByRole("link", { name: "テニス部" })).toHaveAttribute(
      "href",
      "/orgs/tennis",
    );
  });

  it("権限は説明で出す（コードそのものは画面に出さない）", () => {
    render(<ProfileOrganizationList memberships={[membership()]} />);

    expect(screen.getByText("組織の編集")).toBeInTheDocument();
    expect(screen.queryByText("org.edit")).toBeNull();
  });

  it("権限が無い所属は、そうと分かる文言を出す", () => {
    render(
      <ProfileOrganizationList
        memberships={[membership({ permissions: [] })]}
      />,
    );

    expect(screen.getByText("権限はありません")).toBeInTheDocument();
  });

  it("参加日を出す", () => {
    render(<ProfileOrganizationList memberships={[membership()]} />);

    expect(screen.getByText(/2026\/8\/1 参加/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: テストが落ちることを確認する**

Run: `pnpm vitest run src/components/profile/ProfileOrganizationList.test.tsx`
Expected: FAIL。`./ProfileOrganizationList` が存在しない。

- [ ] **Step 7: `ProfileOrganizationList.tsx` を書く**

サーバーコンポーネント（`"use client"` を付けない）。日付は `Intl` ではなく
`toLocaleDateString("ja-JP")` で組み立てる。テストとサーバの時刻帯が同じ前提で足りる。

```tsx
import Link from "next/link";
import type { MembershipSummary } from "@/features/organization/repository";

export function ProfileOrganizationList({
  memberships,
}: {
  memberships: MembershipSummary[];
}) {
  if (memberships.length === 0) {
    return <p className="text-sm text-slate-600">所属している組織はありません</p>;
  }

  return (
    <ul className="space-y-3">
      {memberships.map((membership) => (
        <li
          key={membership.id}
          className="space-y-2 rounded border border-slate-200 bg-white px-4 py-3"
        >
          <div>
            <Link
              href={`/orgs/${membership.slug}`}
              className="font-medium text-slate-800 underline"
            >
              {membership.name}
            </Link>
            <p className="text-xs text-slate-500">
              {membership.slug} ・{" "}
              {membership.joinedAt.toLocaleDateString("ja-JP")} 参加
            </p>
          </div>

          {membership.permissions.length === 0 ? (
            <p className="text-xs text-slate-500">権限はありません</p>
          ) : (
            <ul className="flex flex-wrap gap-1">
              {membership.permissions.map((permission) => (
                // 画面にはコードではなく説明を出す。コードは内部の識別子で、
                // 読み手に意味が伝わらない。
                <li
                  key={permission.code}
                  className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                >
                  {permission.description}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 8: テストが通ることを確認する**

Run: `pnpm vitest run src/components/profile/ProfileOrganizationList.test.tsx`
Expected: PASS（5 件）

- [ ] **Step 9: `app/profile/orgs/page.test.tsx` を書く（失敗する）**

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/LogoutButton", () => ({
  LogoutButton: () => <button type="button">ログアウト</button>,
}));

const requireSession = vi.fn();
const listMembershipsForUser = vi.fn();

vi.mock("@/shared/middleware/require-session", () => ({
  requireSession: () => requireSession(),
}));

vi.mock("@/features/organization/repository", () => ({
  listMembershipsForUser: (userId: string) => listMembershipsForUser(userId),
}));

const { default: ProfileOrgsPage } = await import("./page");

describe("ProfileOrgsPage", () => {
  beforeEach(() => {
    requireSession.mockReset();
    listMembershipsForUser.mockReset();
    requireSession.mockResolvedValue({
      user: { id: "u1", name: "竹添太郎", email: "taro@example.test" },
    });
    listMembershipsForUser.mockResolvedValue([
      {
        id: "o1",
        name: "テニス部",
        slug: "tennis",
        joinedAt: new Date("2026-08-01T00:00:00Z"),
        permissions: [{ code: "org.edit", description: "組織の編集" }],
      },
    ]);
  });

  it("セッションのユーザーの所属だけを引く", async () => {
    render(await ProfileOrgsPage());

    expect(listMembershipsForUser).toHaveBeenCalledWith("u1");
  });

  it("所属組織と権限が出る", async () => {
    render(await ProfileOrgsPage());

    expect(screen.getByRole("link", { name: "テニス部" })).toBeInTheDocument();
    expect(screen.getByText("組織の編集")).toBeInTheDocument();
  });

  it("プロフィールへ戻るパンくずがある", async () => {
    render(await ProfileOrgsPage());

    expect(
      screen.getByRole("link", { name: "プロフィール" }),
    ).toHaveAttribute("href", "/profile");
  });
});
```

- [ ] **Step 10: テストが落ちることを確認する**

Run: `pnpm vitest run src/app/profile/orgs/page.test.tsx`
Expected: FAIL。`./page` が存在しない。

- [ ] **Step 11: `app/profile/orgs/page.tsx` を書く**

```tsx
import { AppHeader } from "@/components/layout/AppHeader";
import { ProfileOrganizationList } from "@/components/profile/ProfileOrganizationList";
import { listMembershipsForUser } from "@/features/organization/repository";
import { requireSession } from "@/shared/middleware/require-session";

export default async function ProfileOrgsPage() {
  const session = await requireSession();
  // 組織スコープの画面ではないので requireOrganization は使わない。
  // 絞り込みは userId を where に入れるクエリそのものが担う。
  const memberships = await listMembershipsForUser(session.user.id);

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        crumbs={[
          { label: "プロフィール", href: "/profile" },
          { label: "所属組織" },
        ]}
        userName={session.user.name}
      />

      <div className="mx-auto max-w-xl space-y-4 px-6 py-8">
        <h1 className="text-lg font-bold text-slate-800">所属組織</h1>
        <p className="text-xs text-slate-500">
          組織で行える操作は、その組織で付与された権限で決まります
        </p>

        <ProfileOrganizationList memberships={memberships} />
      </div>
    </main>
  );
}
```

- [ ] **Step 12: テストが通ることを確認する**

Run: `pnpm vitest run src/app/profile/orgs/page.test.tsx`
Expected: PASS（3 件）

- [ ] **Step 13: 全体を確認してコミットする**

Run: `pnpm typecheck && pnpm vitest run && pnpm lint`
Expected: エラー無し、全 PASS

```bash
git add src/features/organization/repository.ts src/features/organization/repository.test.ts \
        src/components/profile/ProfileOrganizationList.tsx \
        src/components/profile/ProfileOrganizationList.test.tsx \
        src/app/profile/orgs
git commit -m "feat(user): list the user's organizations with their permissions"
```

コミット本文には次を含める。

```
This is not an organization-scoped page, so requireOrganization does not
apply. Putting userId in the where clause is itself the boundary: rows
for organizations the user does not belong to are never fetched.

Kept separate from listOrganizationsForUser because the top page only
needs enough to navigate, and joining permissions there would cost every
page that renders it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 5: パスワードの変更と設定

パスワードを持つ人には「変更」、持たない人（Google だけで登録した人）には「設定」を出す。
どちらを出すかは体感のためで、境界ではない。`setPassword` は既に設定済みなら
`PASSWORD_ALREADY_SET` を返し、`changePassword` は未設定なら
`CREDENTIAL_ACCOUNT_NOT_FOUND` を返す。画面の分岐を迂回しても素通りしない。

**Files:**
- Modify: `src/shared/lib/password-policy.ts`
- Create: `src/shared/lib/password-policy.test.ts`
- Create: `src/features/user/change-password/{schema,schema.test,usecase,usecase.test,handler,handler.test}.ts`
- Create: `src/features/user/set-password/{schema,schema.test,usecase,usecase.test,handler,handler.test}.ts`
- Create: `src/components/profile/PasswordSection.tsx`
- Create: `src/components/profile/PasswordSection.test.tsx`
- Modify: `src/app/profile/page.tsx`
- Modify: `src/app/profile/page.test.tsx`

**Interfaces:**
- Consumes: `ProfileFormState` / `ProfileFormAction` / `profileErrorFormState`（Task 2）、`runAuthApiCall` / `AuthApiPort`（Task 1）、`MIN_PASSWORD_LENGTH` / `MAX_PASSWORD_LENGTH`
- Produces:
  - `changePasswordSchema` / `ChangePasswordInput = { currentPassword: string; newPassword: string }`
  - `ChangePasswordPort = AuthApiPort<{ body: { currentPassword: string; newPassword: string }; headers: Headers }, unknown>`
  - `changePassword(port, input, headers): Effect.Effect<unknown, AuthError>`
  - `changePasswordAction: ProfileFormAction`
  - `setPasswordSchema` / `SetPasswordInput = { newPassword: string }`
  - `SetPasswordPort = AuthApiPort<{ body: { newPassword: string }; headers: Headers }, unknown>`
  - `setPassword(port, input, headers): Effect.Effect<unknown, AuthError>`
  - `setPasswordAction: ProfileFormAction`
  - `PasswordSection({ hasPassword, changeAction, setAction })`

**新しいパスワードの規則は `shared/lib/password-policy.ts` に 1 つだけ持つ。**
`change-password` と `set-password` は同列のスライスで互いに import できず、
規則を 2 か所に書くと「設定では通るのに変更で弾かれる」ずれが起きる。
`changePasswordSchema` の `refine`（現在と同じ値を弾く）はオブジェクトに付くので、
フィールドの規則を共有する妨げにならない。未実装のパスワードリセット設計
（`/reset-password`）も同じ規則を要るため、置き場所は shared にする。

**注意:** `auth.api.setPassword` は `createAuthEndpoint.serverOnly` で定義されている。
HTTP のルートに出ないため `authClient` からは呼べず、Server Action から
`auth.api.setPassword` を呼ぶ以外に手段がない。

- [ ] **Step 1: `change-password/schema.test.ts` を書く（失敗する）**

```ts
import { describe, expect, it } from "vitest";
import { changePasswordSchema } from "./schema";

describe("changePasswordSchema", () => {
  it("妥当な組み合わせを通す", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "oldpassword",
      newPassword: "newpassword",
    });
    expect(result.success).toBe(true);
  });

  it("現在のパスワードが空なら弾く", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "",
      newPassword: "newpassword",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "現在のパスワードを入力してください",
      );
    }
  });

  it("現在のパスワードは長さで弾かない（ポリシー変更前の値でも通す）", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "old",
      newPassword: "newpassword",
    });
    expect(result.success).toBe(true);
  });

  it("新しいパスワードが 8 文字未満なら弾く", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "oldpassword",
      newPassword: "short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "パスワードは8文字以上で入力してください",
      );
    }
  });

  it("新しいパスワードが 128 文字を超えたら弾く", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "oldpassword",
      newPassword: "a".repeat(129),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "パスワードは128文字以内で入力してください",
      );
    }
  });

  it("現在と同じパスワードへの変更を弾く", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "samepassword",
      newPassword: "samepassword",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "現在と違うパスワードを入力してください",
      );
    }
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm vitest run src/features/user/change-password/schema.test.ts`
Expected: FAIL。`./schema` が存在しない。

- [ ] **Step 3: 共有の `newPasswordSchema` を足し、`change-password/schema.ts` を書く**

先に `src/shared/lib/password-policy.ts` の末尾へ足す。

```ts
import { z } from "zod";

/**
 * 新しく設定するパスワードの規則。変更（change-password）と設定（set-password）は
 * 同列のスライスで互いに import できないため、規則そのものは shared に 1 つだけ持つ。
 * 2 か所に書くと「設定では通るのに変更で弾かれる」ずれが起きる。
 *
 * 既存パスワードの検証には使わない。ポリシーを変える前に登録した短い
 * パスワードの人が、変更操作そのものをできなくなってしまう。
 */
export const newPasswordSchema = z
  .string()
  .min(
    MIN_PASSWORD_LENGTH,
    `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください`,
  )
  .max(
    MAX_PASSWORD_LENGTH,
    `パスワードは${MAX_PASSWORD_LENGTH}文字以内で入力してください`,
  );
```

`src/shared/lib/password-policy.test.ts` を新規に作る。

```ts
import { describe, expect, it } from "vitest";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  newPasswordSchema,
} from "./password-policy";

describe("newPasswordSchema", () => {
  it("下限ちょうどの長さを通す", () => {
    expect(
      newPasswordSchema.safeParse("a".repeat(MIN_PASSWORD_LENGTH)).success,
    ).toBe(true);
  });

  it("下限より 1 文字短いと弾く", () => {
    const result = newPasswordSchema.safeParse(
      "a".repeat(MIN_PASSWORD_LENGTH - 1),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "パスワードは8文字以上で入力してください",
      );
    }
  });

  it("上限ちょうどの長さを通す", () => {
    expect(
      newPasswordSchema.safeParse("a".repeat(MAX_PASSWORD_LENGTH)).success,
    ).toBe(true);
  });

  it("上限より 1 文字長いと弾く", () => {
    const result = newPasswordSchema.safeParse(
      "a".repeat(MAX_PASSWORD_LENGTH + 1),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "パスワードは128文字以内で入力してください",
      );
    }
  });
});
```

そのうえで `src/features/user/change-password/schema.ts` を書く。

```ts
import { z } from "zod";
import { newPasswordSchema } from "@/shared/lib/password-policy";

export const changePasswordSchema = z
  .object({
    // 現在のパスワードは長さで弾かない。ポリシーを変える前に登録した
    // 短いパスワードの人が、変更操作そのものをできなくなってしまうため。
    currentPassword: z.string().min(1, "現在のパスワードを入力してください"),
    newPassword: newPasswordSchema,
  })
  // Better Auth 側は同じ値への変更を拒まない。黙って「変更しました」と
  // 出るのは誤解を招くので、ここで弾く。
  .refine((input) => input.currentPassword !== input.newPassword, {
    message: "現在と違うパスワードを入力してください",
    path: ["newPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm vitest run src/shared/lib/password-policy.test.ts src/features/user/change-password/schema.test.ts`
Expected: PASS（4 件 + 6 件）

- [ ] **Step 5: `change-password/usecase.test.ts` を書く（失敗する）**

```ts
import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import type { ChangePasswordPort } from "./usecase";
import { changePassword } from "./usecase";

const headers = new Headers();
const input = { currentPassword: "oldpassword", newPassword: "newpassword" };

describe("changePassword", () => {
  it("両方のパスワードを body に入れ、headers をそのまま渡す", async () => {
    const port = vi.fn().mockResolvedValue({ token: null });

    const exit = await Effect.runPromiseExit(
      changePassword(port, input, headers),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({
      body: { currentPassword: "oldpassword", newPassword: "newpassword" },
      headers,
    });
  });

  it("現在のパスワード違いを InvalidPassword として伝える", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, { body: { code: "INVALID_PASSWORD" } });
    const port: ChangePasswordPort = () => Promise.reject(apiError);

    const exit = await Effect.runPromiseExit(
      changePassword(port, input, headers),
    );

    expect(failureTag(exit)).toBe("InvalidPassword");
  });

  it("パスワード未設定を InvalidCredentials として伝える", async () => {
    // 画面が設定フォームを出すべき状態。表示後に状態が変わった競合にあたる。
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, { body: { code: "CREDENTIAL_ACCOUNT_NOT_FOUND" } });
    const port: ChangePasswordPort = () => Promise.reject(apiError);

    const exit = await Effect.runPromiseExit(
      changePassword(port, input, headers),
    );

    expect(failureTag(exit)).toBe("InvalidCredentials");
  });
});
```

- [ ] **Step 6: テストが落ちることを確認する**

Run: `pnpm vitest run src/features/user/change-password/usecase.test.ts`
Expected: FAIL。`./usecase` が存在しない。

- [ ] **Step 7: `change-password/usecase.ts` を書く**

```ts
import type { Effect } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";
import { type AuthApiPort, runAuthApiCall } from "@/shared/lib/auth-effect";
import type { ChangePasswordInput } from "./schema";

/** auth.api.changePassword が満たす最小の形。 */
export type ChangePasswordPort = AuthApiPort<
  {
    body: { currentPassword: string; newPassword: string };
    headers: Headers;
  },
  unknown
>;

/**
 * 他端末のセッションは破棄しない（revokeOtherSessions を渡さない）。
 * 破棄したい場合の明示的な操作を features/user/revoke-sessions が持っており、
 * 副作用としてここに埋め込むと「変更したら勝手に他の端末が落ちた」ことになる。
 */
export const changePassword = (
  port: ChangePasswordPort,
  input: ChangePasswordInput,
  headers: Headers,
): Effect.Effect<unknown, AuthError> =>
  runAuthApiCall(port, {
    body: {
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
    },
    headers,
  });
```

- [ ] **Step 8: テストが通ることを確認する**

Run: `pnpm vitest run src/features/user/change-password/usecase.test.ts`
Expected: PASS（3 件）

- [ ] **Step 9: `change-password/handler.test.ts` を書く（失敗する）**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_PROFILE_FORM_STATE } from "../state";

const requireSession = vi.fn();
const changePasswordApi = vi.fn();
const nextHeaders = vi.fn();

vi.mock("@/shared/middleware/require-session", () => ({
  requireSession: () => requireSession(),
}));

vi.mock("@/shared/lib/auth", () => ({
  auth: {
    api: { changePassword: (input: unknown) => changePasswordApi(input) },
  },
}));

vi.mock("next/headers", () => ({
  headers: () => nextHeaders(),
}));

const { changePasswordAction } = await import("./handler");

const buildFormData = (
  currentPassword: string,
  newPassword: string,
): FormData => {
  const data = new FormData();
  data.set("currentPassword", currentPassword);
  data.set("newPassword", newPassword);
  return data;
};

describe("changePasswordAction", () => {
  beforeEach(() => {
    requireSession.mockReset();
    changePasswordApi.mockReset();
    nextHeaders.mockReset();
    requireSession.mockResolvedValue({ user: { id: "u1" } });
    nextHeaders.mockResolvedValue(new Headers());
    changePasswordApi.mockResolvedValue({ token: null });
  });

  it("未ログインなら requireSession の時点で打ち切られ、変更に進まない", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(
      changePasswordAction(
        INITIAL_PROFILE_FORM_STATE,
        buildFormData("oldpassword", "newpassword"),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(changePasswordApi).not.toHaveBeenCalled();
  });

  it("検証に失敗すれば変更せずエラーを返す", async () => {
    const result = await changePasswordAction(
      INITIAL_PROFILE_FORM_STATE,
      buildFormData("oldpassword", "short"),
    );

    expect(result.error).toBe("パスワードは8文字以上で入力してください");
    expect(changePasswordApi).not.toHaveBeenCalled();
  });

  it("成功したら notice を返す", async () => {
    const result = await changePasswordAction(
      INITIAL_PROFILE_FORM_STATE,
      buildFormData("oldpassword", "newpassword"),
    );

    expect(result).toEqual({
      error: null,
      notice: "パスワードを変更しました",
    });
    expect(changePasswordApi).toHaveBeenCalledWith({
      body: { currentPassword: "oldpassword", newPassword: "newpassword" },
      headers: expect.any(Headers),
    });
  });

  it("現在のパスワード違いは、そうと分かる文言で返す", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, { body: { code: "INVALID_PASSWORD" } });
    changePasswordApi.mockRejectedValue(apiError);

    const result = await changePasswordAction(
      INITIAL_PROFILE_FORM_STATE,
      buildFormData("wrongpassword", "newpassword"),
    );

    expect(result).toEqual({
      error: "現在のパスワードが正しくありません",
      notice: null,
    });
  });
});
```

- [ ] **Step 10: テストが落ちることを確認する**

Run: `pnpm vitest run src/features/user/change-password/handler.test.ts`
Expected: FAIL。`./handler` が存在しない。

- [ ] **Step 11: `change-password/handler.ts` を書く**

```ts
"use server";

import { Effect, Exit } from "effect";
import { headers } from "next/headers";
import { auth } from "@/shared/lib/auth";
import { requireSession } from "@/shared/middleware/require-session";
import { profileErrorFormState } from "../effect-to-form-state";
import type { ProfileFormState } from "../state";
import { changePasswordSchema } from "./schema";
import { changePassword } from "./usecase";

export const changePasswordAction = async (
  _prevState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> => {
  // ページで確認済みでも Server Action は独立した入口なので、ここでも呼ぶ。
  await requireSession();

  const parsed = changePasswordSchema.safeParse({
    currentPassword: String(formData.get("currentPassword") ?? ""),
    newPassword: String(formData.get("newPassword") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, notice: null };
  }

  const exit = await Effect.runPromiseExit(
    changePassword(
      (input) => auth.api.changePassword(input),
      parsed.data,
      await headers(),
    ),
  );

  if (Exit.isFailure(exit)) {
    return profileErrorFormState(exit.cause);
  }

  // 画面に出ている情報は変わらないため revalidatePath は要らない。
  return { error: null, notice: "パスワードを変更しました" };
};
```

- [ ] **Step 12: テストが通ることを確認する**

Run: `pnpm vitest run src/features/user/change-password/handler.test.ts`
Expected: PASS（4 件）

- [ ] **Step 13: `set-password/schema.test.ts` を書く（失敗する）**

```ts
import { describe, expect, it } from "vitest";
import { setPasswordSchema } from "./schema";

describe("setPasswordSchema", () => {
  it("妥当なパスワードを通す", () => {
    const result = setPasswordSchema.safeParse({ newPassword: "newpassword" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ newPassword: "newpassword" });
    }
  });

  it("8 文字未満を弾く", () => {
    const result = setPasswordSchema.safeParse({ newPassword: "short" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "パスワードは8文字以上で入力してください",
      );
    }
  });

  it("128 文字超を弾く", () => {
    const result = setPasswordSchema.safeParse({
      newPassword: "a".repeat(129),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "パスワードは128文字以内で入力してください",
      );
    }
  });

  it("currentPassword を渡しても落とす（設定にはそもそも要らない）", () => {
    const result = setPasswordSchema.safeParse({
      newPassword: "newpassword",
      currentPassword: "anything",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("currentPassword");
    }
  });
});
```

- [ ] **Step 14: テストが落ちることを確認する**

Run: `pnpm vitest run src/features/user/set-password/schema.test.ts`
Expected: FAIL。`./schema` が存在しない。

- [ ] **Step 15: `set-password/schema.ts` を書く**

```ts
import { z } from "zod";
import { newPasswordSchema } from "@/shared/lib/password-policy";

/**
 * 現在のパスワードを受け取らない。この操作が使えるのはそもそも
 * パスワードを持たない人（Google だけで登録した人）だけであり、
 * 本人確認はセッションが担っている。
 *
 * 長さの規則は change-password と同じ newPasswordSchema を使う。
 */
export const setPasswordSchema = z.object({
  newPassword: newPasswordSchema,
});

export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
```

- [ ] **Step 16: テストが通ることを確認する**

Run: `pnpm vitest run src/features/user/set-password/schema.test.ts`
Expected: PASS（4 件）

- [ ] **Step 17: `set-password/usecase.test.ts` を書く（失敗する）**

```ts
import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import type { SetPasswordPort } from "./usecase";
import { setPassword } from "./usecase";

const headers = new Headers();

describe("setPassword", () => {
  it("newPassword を body に入れ、headers をそのまま渡す", async () => {
    const port = vi.fn().mockResolvedValue({ status: true });

    const exit = await Effect.runPromiseExit(
      setPassword(port, { newPassword: "newpassword" }, headers),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({
      body: { newPassword: "newpassword" },
      headers,
    });
  });

  it("設定済みの場合を PasswordAlreadySet として伝える", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, { body: { code: "PASSWORD_ALREADY_SET" } });
    const port: SetPasswordPort = () => Promise.reject(apiError);

    const exit = await Effect.runPromiseExit(
      setPassword(port, { newPassword: "newpassword" }, headers),
    );

    expect(failureTag(exit)).toBe("PasswordAlreadySet");
  });
});
```

- [ ] **Step 18: テストが落ちることを確認する**

Run: `pnpm vitest run src/features/user/set-password/usecase.test.ts`
Expected: FAIL。`./usecase` が存在しない。

- [ ] **Step 19: `set-password/usecase.ts` を書く**

```ts
import type { Effect } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";
import { type AuthApiPort, runAuthApiCall } from "@/shared/lib/auth-effect";
import type { SetPasswordInput } from "./schema";

/**
 * auth.api.setPassword が満たす最小の形。
 *
 * setPassword は createAuthEndpoint.serverOnly で定義されており、HTTP の
 * ルートに出ない。authClient からは呼べないため、Server Action から
 * auth.api を叩く以外の手段が無い。
 */
export type SetPasswordPort = AuthApiPort<
  { body: { newPassword: string }; headers: Headers },
  unknown
>;

export const setPassword = (
  port: SetPasswordPort,
  input: SetPasswordInput,
  headers: Headers,
): Effect.Effect<unknown, AuthError> =>
  runAuthApiCall(port, {
    body: { newPassword: input.newPassword },
    headers,
  });
```

- [ ] **Step 20: テストが通ることを確認する**

Run: `pnpm vitest run src/features/user/set-password/usecase.test.ts`
Expected: PASS

- [ ] **Step 21: `set-password/handler.test.ts` を書く（失敗する）**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_PROFILE_FORM_STATE } from "../state";

const requireSession = vi.fn();
const setPasswordApi = vi.fn();
const revalidatePath = vi.fn();
const nextHeaders = vi.fn();

vi.mock("@/shared/middleware/require-session", () => ({
  requireSession: () => requireSession(),
}));

vi.mock("@/shared/lib/auth", () => ({
  auth: { api: { setPassword: (input: unknown) => setPasswordApi(input) } },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

vi.mock("next/headers", () => ({
  headers: () => nextHeaders(),
}));

const { setPasswordAction } = await import("./handler");

const buildFormData = (newPassword: string): FormData => {
  const data = new FormData();
  data.set("newPassword", newPassword);
  return data;
};

describe("setPasswordAction", () => {
  beforeEach(() => {
    requireSession.mockReset();
    setPasswordApi.mockReset();
    revalidatePath.mockClear();
    nextHeaders.mockReset();
    requireSession.mockResolvedValue({ user: { id: "u1" } });
    nextHeaders.mockResolvedValue(new Headers());
    setPasswordApi.mockResolvedValue({ status: true });
  });

  it("未ログインなら requireSession の時点で打ち切られ、設定に進まない", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(
      setPasswordAction(INITIAL_PROFILE_FORM_STATE, buildFormData("newpassword")),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(setPasswordApi).not.toHaveBeenCalled();
  });

  it("検証に失敗すれば設定せずエラーを返す", async () => {
    const result = await setPasswordAction(
      INITIAL_PROFILE_FORM_STATE,
      buildFormData("short"),
    );

    expect(result.error).toBe("パスワードは8文字以上で入力してください");
    expect(setPasswordApi).not.toHaveBeenCalled();
  });

  it("成功したら notice を返し、節の出し分けが変わるため再検証する", async () => {
    const result = await setPasswordAction(
      INITIAL_PROFILE_FORM_STATE,
      buildFormData("newpassword"),
    );

    expect(result).toEqual({
      error: null,
      notice: "パスワードを設定しました",
    });
    // 設定後は「変更」フォームに切り替わり、連携解除も可能になる。
    expect(revalidatePath).toHaveBeenCalledWith("/profile");
  });

  it("既に設定済みなら、変更から操作するよう促す", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, { body: { code: "PASSWORD_ALREADY_SET" } });
    setPasswordApi.mockRejectedValue(apiError);

    const result = await setPasswordAction(
      INITIAL_PROFILE_FORM_STATE,
      buildFormData("newpassword"),
    );

    expect(result.error).toBe(
      "パスワードは既に設定されています。変更から操作してください",
    );
  });
});
```

- [ ] **Step 22: テストが落ちることを確認する**

Run: `pnpm vitest run src/features/user/set-password/handler.test.ts`
Expected: FAIL。`./handler` が存在しない。

- [ ] **Step 23: `set-password/handler.ts` を書く**

```ts
"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/shared/lib/auth";
import { requireSession } from "@/shared/middleware/require-session";
import { profileErrorFormState } from "../effect-to-form-state";
import type { ProfileFormState } from "../state";
import { setPasswordSchema } from "./schema";
import { setPassword } from "./usecase";

export const setPasswordAction = async (
  _prevState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> => {
  // ページで確認済みでも Server Action は独立した入口なので、ここでも呼ぶ。
  // 画面が設定フォームを出しているかどうかは境界にならない。
  await requireSession();

  const parsed = setPasswordSchema.safeParse({
    newPassword: String(formData.get("newPassword") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, notice: null };
  }

  const exit = await Effect.runPromiseExit(
    setPassword(
      (input) => auth.api.setPassword(input),
      parsed.data,
      await headers(),
    ),
  );

  if (Exit.isFailure(exit)) {
    return profileErrorFormState(exit.cause);
  }

  // 設定後はパスワード節が「変更」に切り替わり、Google 連携の解除も
  // できるようになる。どちらもサーバで読んだ状態に依存するため作り直す。
  revalidatePath("/profile");
  return { error: null, notice: "パスワードを設定しました" };
};
```

- [ ] **Step 24: テストが通ることを確認する**

Run: `pnpm vitest run src/features/user/set-password/handler.test.ts`
Expected: PASS（4 件）

- [ ] **Step 25: `PasswordSection.test.tsx` を書く（失敗する）**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProfileFormAction } from "@/features/user/state";
import { PasswordSection } from "./PasswordSection";

const noopAction: ProfileFormAction = async () => ({
  error: null,
  notice: null,
});

describe("PasswordSection", () => {
  it("パスワード設定済みなら、現在のパスワードを聞く変更フォームを出す", () => {
    render(
      <PasswordSection
        hasPassword
        changeAction={noopAction}
        setAction={noopAction}
      />,
    );

    expect(screen.getByLabelText("現在のパスワード")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "パスワードを変更" }),
    ).toBeInTheDocument();
  });

  it("パスワード未設定なら、現在のパスワードを聞かない設定フォームを出す", () => {
    render(
      <PasswordSection
        hasPassword={false}
        changeAction={noopAction}
        setAction={noopAction}
      />,
    );

    expect(screen.queryByLabelText("現在のパスワード")).toBeNull();
    expect(
      screen.getByRole("button", { name: "パスワードを設定" }),
    ).toBeInTheDocument();
  });

  it("未設定のときは、設定するとどう変わるかを伝える", () => {
    render(
      <PasswordSection
        hasPassword={false}
        changeAction={noopAction}
        setAction={noopAction}
      />,
    );

    expect(
      screen.getByText(
        "設定すると、メールアドレスとパスワードでもログインできるようになります",
      ),
    ).toBeInTheDocument();
  });

  it("新しいパスワードの入力欄には new-password の autoComplete を付ける", () => {
    render(
      <PasswordSection
        hasPassword
        changeAction={noopAction}
        setAction={noopAction}
      />,
    );

    expect(screen.getByLabelText("新しいパスワード")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
  });
});
```

- [ ] **Step 26: テストが落ちることを確認する**

Run: `pnpm vitest run src/components/profile/PasswordSection.test.tsx`
Expected: FAIL。`./PasswordSection` が存在しない。

- [ ] **Step 27: `PasswordSection.tsx` を書く**

```tsx
"use client";

import { useActionState } from "react";
import {
  INITIAL_PROFILE_FORM_STATE,
  type ProfileFormAction,
} from "@/features/user/state";
import { MIN_PASSWORD_LENGTH } from "@/shared/lib/password-policy";

/**
 * 設定済みか未設定かで別のフォームを出す。どちらを出すかは体感のためで、
 * 境界ではない。Server Action は画面の分岐を信じず、Better Auth 側の
 * 検証（PASSWORD_ALREADY_SET / CREDENTIAL_ACCOUNT_NOT_FOUND）を必ず通す。
 */
export function PasswordSection({
  hasPassword,
  changeAction,
  setAction,
}: {
  hasPassword: boolean;
  changeAction: ProfileFormAction;
  setAction: ProfileFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    hasPassword ? changeAction : setAction,
    INITIAL_PROFILE_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-4">
      {hasPassword ? (
        <div className="space-y-1">
          <label
            htmlFor="current-password"
            className="block text-sm font-medium text-slate-700"
          >
            現在のパスワード
          </label>
          <input
            id="current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          設定すると、メールアドレスとパスワードでもログインできるようになります
        </p>
      )}

      <div className="space-y-1">
        <label
          htmlFor="new-password"
          className="block text-sm font-medium text-slate-700"
        >
          新しいパスワード
        </label>
        <input
          id="new-password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <p className="text-xs text-slate-500">{MIN_PASSWORD_LENGTH} 文字以上</p>
      </div>

      {state.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state.notice !== null && (
        <p role="status" className="text-sm text-emerald-700">
          {state.notice}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending
          ? "送信中..."
          : hasPassword
            ? "パスワードを変更"
            : "パスワードを設定"}
      </button>
    </form>
  );
}
```

- [ ] **Step 28: テストが通ることを確認する**

Run: `pnpm vitest run src/components/profile/PasswordSection.test.tsx`
Expected: PASS（4 件）

- [ ] **Step 29: `/profile` にパスワード節を足す**

`src/app/profile/page.tsx` を次のように直す。

```tsx
import { AppHeader } from "@/components/layout/AppHeader";
import { DisplayNameForm } from "@/components/profile/DisplayNameForm";
import { PasswordSection } from "@/components/profile/PasswordSection";
import { changePasswordAction } from "@/features/user/change-password/handler";
import { findLinkedAccounts } from "@/features/user/repository";
import { setPasswordAction } from "@/features/user/set-password/handler";
import { updateNameAction } from "@/features/user/update-name/handler";
import { requireSession } from "@/shared/middleware/require-session";

export default async function ProfilePage() {
  const session = await requireSession();
  const linkedAccounts = await findLinkedAccounts(session.user.id);

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        crumbs={[{ label: "プロフィール" }]}
        userName={session.user.name}
      />

      <div className="mx-auto max-w-xl space-y-8 px-6 py-8">
        <h1 className="text-lg font-bold text-slate-800">プロフィール</h1>

        <section className="space-y-4 rounded border border-slate-200 bg-white px-5 py-4">
          <h2 className="text-sm font-bold text-slate-800">基本情報</h2>
          <DisplayNameForm
            action={updateNameAction}
            defaultName={session.user.name}
          />
        </section>

        <section className="space-y-4 rounded border border-slate-200 bg-white px-5 py-4">
          <h2 className="text-sm font-bold text-slate-800">
            {linkedAccounts.hasPassword ? "パスワードの変更" : "パスワードの設定"}
          </h2>
          <PasswordSection
            hasPassword={linkedAccounts.hasPassword}
            changeAction={changePasswordAction}
            setAction={setPasswordAction}
          />
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 30: `page.test.tsx` に節の出し分けのテストを足す**

`src/app/profile/page.test.tsx` の `describe` の末尾に足す。

```tsx
  it("パスワード設定済みなら変更フォームを出す", async () => {
    findLinkedAccounts.mockResolvedValue({ hasPassword: true, google: null });

    render(await ProfilePage());

    expect(screen.getByLabelText("現在のパスワード")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "パスワードの変更", level: 2 }),
    ).toBeInTheDocument();
  });

  it("パスワード未設定なら設定フォームを出す", async () => {
    findLinkedAccounts.mockResolvedValue({
      hasPassword: false,
      google: { accountId: "a2", linkedAt: new Date("2026-09-02T00:00:00Z") },
    });

    render(await ProfilePage());

    expect(screen.queryByLabelText("現在のパスワード")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "パスワードの設定", level: 2 }),
    ).toBeInTheDocument();
  });
```

- [ ] **Step 31: 全体を確認してコミットする**

Run: `pnpm typecheck && pnpm vitest run && pnpm lint`
Expected: エラー無し、全 PASS

```bash
git add src/features/user/change-password src/features/user/set-password \
        src/components/profile/PasswordSection.tsx \
        src/components/profile/PasswordSection.test.tsx \
        src/app/profile/page.tsx src/app/profile/page.test.tsx
git commit -m "feat(user): let a user change or set their password"
```

コミット本文には次を含める。

```
setPassword is a serverOnly endpoint, so it never appears on an HTTP
route and authClient cannot reach it. A Server Action calling auth.api
is the only way in -- which is why the whole profile writes that way.

Which form the page renders is comfort, not a boundary. The actions run
Better Auth's own checks, so posting the set form with a password
already in place still fails with PASSWORD_ALREADY_SET.

The current password is not length-checked: someone who registered
before the policy tightened would otherwise be unable to change it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 6: メールアドレスの変更

新アドレス宛に確認メールを送り、リンクを踏んだ時点で初めて `User.email` が変わる。
あわせて現アドレスへ通知（リンク無し）を送る。

**`change-email` に `domain.ts` を置かない。** このスライスの純粋ロジックは
「確認メールの url が登録時のものか変更時のものか」の判別だけで、それを使うのは
`src/shared/lib/auth.ts` の `sendVerificationEmail` フック。`shared` は
`@/features/**` を import できないため、判別は `shared` 側に置くしかない。

**Files:**
- Create: `src/shared/lib/mail/html.ts`
- Create: `src/shared/lib/mail/html.test.ts`
- Modify: `src/shared/lib/auth-verification-email.ts`
- Create: `src/shared/lib/auth-email-change-email.ts`
- Create: `src/shared/lib/auth-email-change-email.test.ts`
- Modify: `src/shared/lib/auth.ts`
- Create: `src/features/user/change-email/{schema,schema.test,usecase,usecase.test,handler,handler.test}.ts`
- Create: `src/components/profile/EmailSection.tsx`
- Create: `src/components/profile/EmailSection.test.tsx`
- Modify: `src/app/profile/page.tsx`
- Modify: `src/app/profile/page.test.tsx`

**Interfaces:**
- Consumes: `MailAddress` / `MailMessage`（`shared/lib/mail/types`）、`getMailer` / `resolveMailFrom`、`normalizeEmail`、`VERIFICATION_LINK_EXPIRES_LABEL`、`runAuthApiCall`（Task 1）
- Produces:
  - `EMAIL_CHANGE_CALLBACK_URL = "/profile?emailChanged=1"`
  - `isEmailChangeVerification(url: string): boolean`
  - `buildEmailChangeVerificationEmail({ from, to, url }): MailMessage`
  - `buildEmailChangeNoticeEmail({ from, to, newEmail }): MailMessage`
  - `changeEmailSchema` / `ChangeEmailInput = { newEmail: string }`
  - `ChangeEmailPort = AuthApiPort<{ body: { newEmail: string; callbackURL: string }; headers: Headers }, unknown>`
  - `changeEmail(port, input, headers): Effect.Effect<unknown, AuthError>`
  - `changeEmailAction: ProfileFormAction`
  - `EmailSection({ currentEmail, action })`

**HTML のエスケープと宛名の組み立ては共有する。** 既存の
`auth-verification-email.ts` が持っている `escapeHtml` と
「`name` が空なら `email` を使う」宛名の規則を `src/shared/lib/mail/html.ts` へ
下ろし、既存を含む 3 つの文面ビルダー（登録確認・メール変更確認・変更通知）が
同じものを使う。エスケープ漏れは 1 か所直せば全部に効く形にしておく。

- [ ] **Step 0: `mail/html.ts` を切り出す**

`src/shared/lib/mail/html.test.ts` を新規に作る。

```ts
import { describe, expect, it } from "vitest";
import { escapeHtml, greetingName } from "./html";

describe("escapeHtml", () => {
  it("HTML の意味を持つ 5 文字を実体参照にする", () => {
    expect(escapeHtml("&<>\"'")).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("& を最初に置換するので、実体参照が二重にならない", () => {
    expect(escapeHtml("<")).toBe("&lt;");
  });

  it("エスケープ不要な文字はそのまま返す", () => {
    expect(escapeHtml("竹添太郎")).toBe("竹添太郎");
  });
});

describe("greetingName", () => {
  it("名前があればそれを使う", () => {
    expect(greetingName({ email: "a@example.test", name: "竹添太郎" })).toBe(
      "竹添太郎",
    );
  });

  it("名前が空白だけならメールアドレスを使う", () => {
    expect(greetingName({ email: "a@example.test", name: "  " })).toBe(
      "a@example.test",
    );
  });

  it("名前が無ければメールアドレスを使う", () => {
    expect(greetingName({ email: "a@example.test" })).toBe("a@example.test");
  });
});
```

Run: `pnpm vitest run src/shared/lib/mail/html.test.ts`
Expected: FAIL。`./html` が存在しない。

`src/shared/lib/mail/html.ts` を書く。

```ts
import type { MailAddress } from "./types";

/**
 * HTML の文脈へ差し込む値をエスケープする。name はユーザーの入力、
 * url はクエリに & を含むため、どちらも素通しにはできない。
 *
 * 文面ビルダーが増えるたびに写すのではなく 1 か所に置く。
 * 漏れがあったときに直す場所が 1 つで済む。
 */
export const escapeHtml = (raw: string): string =>
  raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * メールの宛名。User.name はスキーマ上 NOT NULL なので、実運用で
 * 到達しうる欠損の形は undefined ではなく空文字。トリムした上で
 * ?? ではなく || で判定しないと「 様」になってしまう。
 */
export const greetingName = (to: MailAddress): string =>
  to.name?.trim() || to.email;
```

Run: `pnpm vitest run src/shared/lib/mail/html.test.ts`
Expected: PASS（6 件）

既存の `src/shared/lib/auth-verification-email.ts` から `escapeHtml` の定義を消し、
`./mail/html` から import して使う。宛名を組み立てている
`const greetingName = to.name?.trim() || to.email;` の行も消し、
`const greeting = greetingName(to);` に置き換える（import した関数名と
衝突しないよう、局所変数の名前を `greeting` にする）。本体の
`greetingName` の参照 3 か所を `greeting` に直す。

```ts
import { escapeHtml, greetingName } from "./mail/html";
```

Run: `pnpm vitest run src/shared/lib`
Expected: PASS（既存の確認メールのテストがそのまま通る）

- [ ] **Step 1: `auth-email-change-email.test.ts` を書く（失敗する）**

```ts
import { describe, expect, it } from "vitest";
import {
  buildEmailChangeNoticeEmail,
  buildEmailChangeVerificationEmail,
  EMAIL_CHANGE_CALLBACK_URL,
  isEmailChangeVerification,
} from "./auth-email-change-email";

const from = { email: "no-reply@example.test", name: "大会運営" };

describe("isEmailChangeVerification", () => {
  it("callbackURL が /profile ならメール変更と判定する", () => {
    const url = `https://app.test/api/auth/verify-email?token=t&callbackURL=${encodeURIComponent(
      EMAIL_CHANGE_CALLBACK_URL,
    )}`;
    expect(isEmailChangeVerification(url)).toBe(true);
  });

  it("callbackURL が /login なら登録時の確認と判定する", () => {
    const url = `https://app.test/api/auth/verify-email?token=t&callbackURL=${encodeURIComponent(
      "/login?verified=1&redirect=/",
    )}`;
    expect(isEmailChangeVerification(url)).toBe(false);
  });

  it("登録時の redirect が /profile でも、メール変更とは判定しない", () => {
    // /profile を開こうとして /login へ送られた人が登録を完了する経路。
    // callbackURL の中の redirect を見てしまうと、ここで誤判定する。
    // 判定に使うのは callbackURL 自身のパスだけ。
    const url = `https://app.test/api/auth/verify-email?token=t&callbackURL=${encodeURIComponent(
      "/login?verified=1&redirect=/profile",
    )}`;
    expect(isEmailChangeVerification(url)).toBe(false);
  });

  it("callbackURL が無ければ登録時の確認として扱う", () => {
    expect(
      isEmailChangeVerification("https://app.test/api/auth/verify-email?token=t"),
    ).toBe(false);
  });

  it("url として解釈できない値でも例外を投げず false を返す", () => {
    // 文面の選択に失敗して送信そのものが落ちるのは割に合わない。
    expect(isEmailChangeVerification("not a url")).toBe(false);
  });
});

describe("buildEmailChangeVerificationEmail", () => {
  const message = buildEmailChangeVerificationEmail({
    from,
    to: { email: "new@example.test", name: "竹添太郎" },
    url: "https://app.test/api/auth/verify-email?token=t&callbackURL=%2Fprofile",
  });

  it("宛名と本文にリンクを含む", () => {
    expect(message.text).toContain("竹添太郎 様");
    expect(message.text).toContain(
      "https://app.test/api/auth/verify-email?token=t&callbackURL=%2Fprofile",
    );
  });

  it("登録の完了ではなく、変更の確定だと分かる文面にする", () => {
    expect(message.text).toContain("メールアドレスの変更");
    expect(message.text).not.toContain("仮登録");
  });

  it("宛先は新しいアドレス 1 件だけ", () => {
    expect(message.to).toEqual([
      { email: "new@example.test", name: "竹添太郎" },
    ]);
  });

  it("HTML では url をエスケープする", () => {
    expect(message.html).toContain("&amp;callbackURL=");
    expect(message.html).not.toContain("?token=t&callbackURL");
  });

  it("名前が空なら宛名にメールアドレスを使う", () => {
    const withoutName = buildEmailChangeVerificationEmail({
      from,
      to: { email: "new@example.test", name: "  " },
      url: "https://app.test/x",
    });
    expect(withoutName.text).toContain("new@example.test 様");
  });
});

describe("buildEmailChangeNoticeEmail", () => {
  const message = buildEmailChangeNoticeEmail({
    from,
    to: { email: "old@example.test", name: "竹添太郎" },
    newEmail: "new@example.test",
  });

  it("宛先は変更前のアドレス", () => {
    expect(message.to).toEqual([
      { email: "old@example.test", name: "竹添太郎" },
    ]);
  });

  it("変更先のアドレスを伝える", () => {
    expect(message.text).toContain("new@example.test");
  });

  it("リンクを含めない（踏ませる操作がこのメールには無い）", () => {
    expect(message.text).not.toContain("http");
    expect(message.html).not.toContain("<a ");
  });

  it("心当たりが無い場合の案内を含む", () => {
    expect(message.text).toContain("心当たりが無い");
  });

  it("HTML では新しいアドレスをエスケープする", () => {
    const injected = buildEmailChangeNoticeEmail({
      from,
      to: { email: "old@example.test", name: "竹添太郎" },
      newEmail: "<script>@example.test",
    });
    expect(injected.html).toContain("&lt;script&gt;");
    expect(injected.html).not.toContain("<script>");
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm vitest run src/shared/lib/auth-email-change-email.test.ts`
Expected: FAIL。`./auth-email-change-email` が存在しない。

- [ ] **Step 3: `auth-email-change-email.ts` を書く**

```ts
import { escapeHtml, greetingName } from "@/shared/lib/mail/html";
import type { MailAddress, MailMessage } from "@/shared/lib/mail/types";
import { VERIFICATION_LINK_EXPIRES_LABEL } from "./email-verification-policy";

/**
 * メールアドレス変更の確認リンクを踏んだ後に戻る先。
 *
 * この値は 2 つの役目を持つ。1 つは戻り先そのもの。もう 1 つは、
 * Better Auth の sendVerificationEmail フックに渡ってくる url から
 * 「登録時の確認」と「変更時の確認」を見分けるための目印。
 * フックは requestType を受け取らないため、こちらが渡した callbackURL が
 * 唯一の手がかりになる。
 */
export const EMAIL_CHANGE_CALLBACK_URL = "/profile?emailChanged=1";

/** EMAIL_CHANGE_CALLBACK_URL のパス部分。判定はここだけを見る。 */
const EMAIL_CHANGE_CALLBACK_PATH = "/profile";

/**
 * 確認メールの url が、メールアドレス変更のものかどうか。
 *
 * callbackURL の「パス」だけを見る。中身の検索クエリまで見てしまうと、
 * /profile を開こうとして /login へ送られた人の登録確認
 * （callbackURL = "/login?verified=1&redirect=/profile"）を
 * 変更と誤判定してしまう。
 *
 * 解釈できない url では false を返す。文面の選択に失敗して
 * 送信そのものが落ちるほうが損失が大きい。
 */
export const isEmailChangeVerification = (url: string): boolean => {
  try {
    const callbackURL = new URL(url).searchParams.get("callbackURL");
    if (callbackURL === null) {
      return false;
    }
    // callbackURL は相対パス。基準は判定に使わないのでダミーで足りる。
    return (
      new URL(callbackURL, "http://localhost").pathname ===
      EMAIL_CHANGE_CALLBACK_PATH
    );
  } catch {
    return false;
  }
};

export const EMAIL_CHANGE_VERIFICATION_SUBJECT =
  "【大会運営】新しいメールアドレスの確認";

/**
 * 新しいアドレス宛に送る確認メール。リンクを踏むまで User.email は変わらない。
 * 登録時の確認メール（buildVerificationEmail）と文面を分けるのは、
 * 「仮登録の完了」という案内が変更の文脈では意味を成さないため。
 */
export const buildEmailChangeVerificationEmail = ({
  from,
  to,
  url,
}: {
  from: MailAddress;
  to: MailAddress;
  url: string;
}): MailMessage => {
  const greeting = greetingName(to);

  const text = [
    `${greeting} 様`,
    "",
    "メールアドレスの変更を受け付けました。",
    "次のリンクを開くと、このアドレスへの変更が完了します。",
    "",
    url,
    "",
    `このリンクは${VERIFICATION_LINK_EXPIRES_LABEL}で無効になります。`,
    "リンクを開くまで、メールアドレスは変更されません。",
    "",
    "心当たりが無い場合は、このメールを破棄してください。",
  ].join("\n");

  const safeUrl = escapeHtml(url);
  const html = [
    '<html><head><meta charset="utf-8"></head><body>',
    `<p>${escapeHtml(greeting)} 様</p>`,
    "<p>メールアドレスの変更を受け付けました。<br>次のリンクを開くと、このアドレスへの変更が完了します。</p>",
    `<p><a href="${safeUrl}">${safeUrl}</a></p>`,
    `<p>このリンクは${VERIFICATION_LINK_EXPIRES_LABEL}で無効になります。<br>リンクを開くまで、メールアドレスは変更されません。</p>`,
    "<p>心当たりが無い場合は、このメールを破棄してください。</p>",
    "</body></html>",
  ].join("\n");

  return {
    from,
    to: [to],
    subject: EMAIL_CHANGE_VERIFICATION_SUBJECT,
    text,
    html,
  };
};

export const EMAIL_CHANGE_NOTICE_SUBJECT =
  "【大会運営】メールアドレスの変更が申請されました";

/**
 * 変更前のアドレス宛に送る通知。リンクを持たせないのは、この経路で
 * 何かを操作させないため。セッションを奪われた場合に本人が気づける
 * ことだけが目的で、気づいた後の対処は変更前のアドレスでのログインになる。
 */
export const buildEmailChangeNoticeEmail = ({
  from,
  to,
  newEmail,
}: {
  from: MailAddress;
  to: MailAddress;
  newEmail: string;
}): MailMessage => {
  const greeting = greetingName(to);

  const text = [
    `${greeting} 様`,
    "",
    "アカウントのメールアドレスを次のアドレスへ変更する申請がありました。",
    "",
    newEmail,
    "",
    "新しいアドレス宛に確認メールを送信しています。",
    "そのリンクが開かれるまで、メールアドレスは変更されません。",
    "",
    "心当たりが無い場合は、パスワードの変更をご検討ください。",
  ].join("\n");

  const html = [
    '<html><head><meta charset="utf-8"></head><body>',
    `<p>${escapeHtml(greeting)} 様</p>`,
    "<p>アカウントのメールアドレスを次のアドレスへ変更する申請がありました。</p>",
    `<p>${escapeHtml(newEmail)}</p>`,
    "<p>新しいアドレス宛に確認メールを送信しています。<br>そのリンクが開かれるまで、メールアドレスは変更されません。</p>",
    "<p>心当たりが無い場合は、パスワードの変更をご検討ください。</p>",
    "</body></html>",
  ].join("\n");

  return {
    from,
    to: [to],
    subject: EMAIL_CHANGE_NOTICE_SUBJECT,
    text,
    html,
  };
};
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm vitest run src/shared/lib/auth-email-change-email.test.ts`
Expected: PASS（16 件）

- [ ] **Step 5: `auth.ts` で changeEmail を有効にし、文面を出し分ける**

`src/shared/lib/auth.ts` の import に足す。

```ts
import {
  buildEmailChangeVerificationEmail,
  isEmailChangeVerification,
} from "@/shared/lib/auth-email-change-email";
```

`emailVerification.sendVerificationEmail` を差し替える。

```ts
    sendVerificationEmail: async ({ user, url }) => {
      const to = { email: user.email, name: user.name };
      const from = resolveMailFrom(process.env);
      // このフックは登録時の確認とメールアドレス変更の確認の両方で呼ばれ、
      // どちらなのかを示す引数を受け取らない。判別できる手がかりは、
      // こちらが changeEmail へ渡した callbackURL が url に埋まっていること
      // だけ。判定は auth-email-change-email.ts の純粋関数が持つ。
      await getMailer().send(
        isEmailChangeVerification(url)
          ? buildEmailChangeVerificationEmail({ from, to, url })
          : buildVerificationEmail({ from, to, url }),
      );
    },
```

`user: authUserConfig` を差し替える。

```ts
  user: {
    ...authUserConfig,
    // 既定では無効で、有効にしないと changeEmail が CHANGE_EMAIL_DISABLED を返す。
    // sendChangeEmailConfirmation は置かない。置くと確認メールが現アドレス宛に
    // なり、新アドレスの到達性を確かめないまま確定する経路になる。
    // 変更前のアドレスへの通知は features/user/change-email 側から送る。
    changeEmail: { enabled: true },
  },
```

- [ ] **Step 6: 既存のメール周りが壊れていないことを確認する**

Run: `pnpm vitest run src/shared/lib`
Expected: PASS

Run: `pnpm typecheck`
Expected: エラー無し

- [ ] **Step 7: `change-email/schema.test.ts` を書く（失敗する）**

```ts
import { describe, expect, it } from "vitest";
import { changeEmailSchema } from "./schema";

describe("changeEmailSchema", () => {
  it("妥当なメールアドレスを通し、正規化する", () => {
    const result = changeEmailSchema.safeParse({
      newEmail: "  New@Example.Test  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ newEmail: "new@example.test" });
    }
  });

  it("形式が正しくないアドレスを弾く", () => {
    const result = changeEmailSchema.safeParse({ newEmail: "not-an-email" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "メールアドレスの形式が正しくありません",
      );
    }
  });

  it("空のアドレスを弾く", () => {
    expect(changeEmailSchema.safeParse({ newEmail: "" }).success).toBe(false);
  });
});
```

- [ ] **Step 8: テストが落ちることを確認する**

Run: `pnpm vitest run src/features/user/change-email/schema.test.ts`
Expected: FAIL。`./schema` が存在しない。

- [ ] **Step 9: `change-email/schema.ts` を書く**

```ts
import { z } from "zod";
import { normalizeEmail } from "@/shared/lib/email";

/**
 * ログイン・登録と同じ normalizeEmail を通す。ここだけ正規化がずれると、
 * 変更後に自分のアドレスでログインできない、という形で壊れる。
 */
export const changeEmailSchema = z.object({
  newEmail: z
    .string()
    .transform(normalizeEmail)
    .pipe(z.email("メールアドレスの形式が正しくありません")),
});

export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
```

- [ ] **Step 10: テストが通ることを確認する**

Run: `pnpm vitest run src/features/user/change-email/schema.test.ts`
Expected: PASS（3 件）

- [ ] **Step 11: `change-email/usecase.test.ts` を書く（失敗する）**

```ts
import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { EMAIL_CHANGE_CALLBACK_URL } from "@/shared/lib/auth-email-change-email";
import { failureTag } from "@/shared/testing/exit";
import type { ChangeEmailPort } from "./usecase";
import { changeEmail } from "./usecase";

const headers = new Headers();

describe("changeEmail", () => {
  it("新アドレスと戻り先の callbackURL を body に入れる", async () => {
    const port = vi.fn().mockResolvedValue({ status: true });

    const exit = await Effect.runPromiseExit(
      changeEmail(port, { newEmail: "new@example.test" }, headers),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({
      body: {
        newEmail: "new@example.test",
        // この値が確認メールの文面の出し分けにも使われる。
        callbackURL: EMAIL_CHANGE_CALLBACK_URL,
      },
      headers,
    });
  });

  it("port が投げた APIError を AuthError に写して伝える", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, { body: { code: "UNAUTHORIZED" } });
    const port: ChangeEmailPort = () => Promise.reject(apiError);

    const exit = await Effect.runPromiseExit(
      changeEmail(port, { newEmail: "new@example.test" }, headers),
    );

    expect(failureTag(exit)).toBe("UnexpectedAuthError");
  });
});
```

- [ ] **Step 12: テストが落ちることを確認する**

Run: `pnpm vitest run src/features/user/change-email/usecase.test.ts`
Expected: FAIL。`./usecase` が存在しない。

- [ ] **Step 13: `change-email/usecase.ts` を書く**

```ts
import type { Effect } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";
import { type AuthApiPort, runAuthApiCall } from "@/shared/lib/auth-effect";
import { EMAIL_CHANGE_CALLBACK_URL } from "@/shared/lib/auth-email-change-email";
import type { ChangeEmailInput } from "./schema";

/** auth.api.changeEmail が満たす最小の形。 */
export type ChangeEmailPort = AuthApiPort<
  {
    body: { newEmail: string; callbackURL: string };
    headers: Headers;
  },
  unknown
>;

/**
 * callbackURL は入力欄の値ではなく、確認リンクを踏んだ後の戻り先。
 * signup の verificationCallbackURL と同じ立場で、schema には入れない。
 * この値は確認メールの文面の出し分けにも使われる（auth.ts のフックが
 * isEmailChangeVerification でこれを見る）。
 */
export const changeEmail = (
  port: ChangeEmailPort,
  input: ChangeEmailInput,
  headers: Headers,
): Effect.Effect<unknown, AuthError> =>
  runAuthApiCall(port, {
    body: {
      newEmail: input.newEmail,
      callbackURL: EMAIL_CHANGE_CALLBACK_URL,
    },
    headers,
  });
```

- [ ] **Step 14: テストが通ることを確認する**

Run: `pnpm vitest run src/features/user/change-email/usecase.test.ts`
Expected: PASS

- [ ] **Step 15: `change-email/handler.test.ts` を書く（失敗する）**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_PROFILE_FORM_STATE } from "../state";

const requireSession = vi.fn();
const changeEmailApi = vi.fn();
const nextHeaders = vi.fn();
const send = vi.fn();

vi.mock("@/shared/middleware/require-session", () => ({
  requireSession: () => requireSession(),
}));

vi.mock("@/shared/lib/auth", () => ({
  auth: { api: { changeEmail: (input: unknown) => changeEmailApi(input) } },
}));

vi.mock("@/shared/lib/mail", () => ({
  getMailer: () => ({ send }),
  resolveMailFrom: () => ({ email: "no-reply@example.test", name: "大会運営" }),
}));

vi.mock("next/headers", () => ({
  headers: () => nextHeaders(),
}));

const { changeEmailAction } = await import("./handler");

const buildFormData = (newEmail: string): FormData => {
  const data = new FormData();
  data.set("newEmail", newEmail);
  return data;
};

describe("changeEmailAction", () => {
  beforeEach(() => {
    requireSession.mockReset();
    changeEmailApi.mockReset();
    nextHeaders.mockReset();
    send.mockReset();
    requireSession.mockResolvedValue({
      user: { id: "u1", name: "竹添太郎", email: "old@example.test" },
    });
    nextHeaders.mockResolvedValue(new Headers());
    changeEmailApi.mockResolvedValue({ status: true });
    send.mockResolvedValue(undefined);
  });

  it("未ログインなら requireSession の時点で打ち切られ、送信に進まない", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(
      changeEmailAction(
        INITIAL_PROFILE_FORM_STATE,
        buildFormData("new@example.test"),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(changeEmailApi).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("形式が正しくないアドレスは送信せずエラーを返す", async () => {
    const result = await changeEmailAction(
      INITIAL_PROFILE_FORM_STATE,
      buildFormData("not-an-email"),
    );

    expect(result.error).toBe("メールアドレスの形式が正しくありません");
    expect(changeEmailApi).not.toHaveBeenCalled();
  });

  it("今と同じアドレスは、Better Auth へ送らず案内だけ返す", async () => {
    // Better Auth 側は "Email is the same" をコード無しの 400 で返すため、
    // 写像すると「処理に失敗しました」になってしまう。手前で畳む。
    const result = await changeEmailAction(
      INITIAL_PROFILE_FORM_STATE,
      buildFormData("old@example.test"),
    );

    expect(result.error).toBe("現在と違うメールアドレスを入力してください");
    expect(changeEmailApi).not.toHaveBeenCalled();
  });

  it("成功したら新アドレスへの確認と、現アドレスへの通知を送る", async () => {
    const result = await changeEmailAction(
      INITIAL_PROFILE_FORM_STATE,
      buildFormData("new@example.test"),
    );

    expect(changeEmailApi).toHaveBeenCalledWith({
      body: {
        newEmail: "new@example.test",
        callbackURL: "/profile?emailChanged=1",
      },
      headers: expect.any(Headers),
    });
    // 確認メールは Better Auth が送る。ここが送るのは通知だけ。
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toEqual([
      { email: "old@example.test", name: "竹添太郎" },
    ]);
    expect(send.mock.calls[0][0].text).toContain("new@example.test");
    expect(result.notice).toContain("確認メールを送信しました");
  });

  it("通知メールの送信に失敗しても、申請そのものは成功として返す", async () => {
    // 確認メールは既に送られている。通知が届かないことを理由に
    // 「失敗しました」と出すと、実際には進んでいる操作を再試行させる。
    send.mockRejectedValue(new Error("smtp down"));

    const result = await changeEmailAction(
      INITIAL_PROFILE_FORM_STATE,
      buildFormData("new@example.test"),
    );

    expect(result.error).toBeNull();
    expect(result.notice).toContain("確認メールを送信しました");
  });

  it("Better Auth が失敗したら通知を送らず、文言に写して返す", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, { body: { code: "UNAUTHORIZED" } });
    changeEmailApi.mockRejectedValue(apiError);

    const result = await changeEmailAction(
      INITIAL_PROFILE_FORM_STATE,
      buildFormData("new@example.test"),
    );

    expect(send).not.toHaveBeenCalled();
    expect(result.notice).toBeNull();
    expect(result.error).toBe(
      "処理に失敗しました。時間をおいて再度お試しください",
    );
  });
});
```

- [ ] **Step 16: テストが落ちることを確認する**

Run: `pnpm vitest run src/features/user/change-email/handler.test.ts`
Expected: FAIL。`./handler` が存在しない。

- [ ] **Step 17: `change-email/handler.ts` を書く**

```ts
"use server";

import { Effect, Exit } from "effect";
import { headers } from "next/headers";
import { auth } from "@/shared/lib/auth";
import { buildEmailChangeNoticeEmail } from "@/shared/lib/auth-email-change-email";
import { getMailer, resolveMailFrom } from "@/shared/lib/mail";
import { requireSession } from "@/shared/middleware/require-session";
import { profileErrorFormState } from "../effect-to-form-state";
import type { ProfileFormState } from "../state";
import { changeEmailSchema } from "./schema";
import { changeEmail } from "./usecase";

/**
 * 新アドレスが既に他の人のものでも Better Auth は成功を返す
 * （アカウント列挙対策）。そのため、この文言は成否の区別に使えない。
 * 登録画面が requireEmailVerification のもとで取っているのと同じ扱い。
 */
const SENT_NOTICE =
  "確認メールを送信しました。新しいアドレスのリンクを開くと変更が完了します";

export const changeEmailAction = async (
  _prevState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> => {
  // ページで確認済みでも Server Action は独立した入口なので、ここでも呼ぶ。
  const session = await requireSession();

  const parsed = changeEmailSchema.safeParse({
    newEmail: String(formData.get("newEmail") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, notice: null };
  }

  // Better Auth は同じアドレスへの変更をコード無しの 400 で拒む。
  // 写像すると「処理に失敗しました」になってしまうので手前で畳む。
  if (parsed.data.newEmail === session.user.email) {
    return {
      error: "現在と違うメールアドレスを入力してください",
      notice: null,
    };
  }

  const exit = await Effect.runPromiseExit(
    changeEmail(
      (input) => auth.api.changeEmail(input),
      parsed.data,
      await headers(),
    ),
  );

  if (Exit.isFailure(exit)) {
    return profileErrorFormState(exit.cause);
  }

  // 変更前のアドレスへ通知する。セッションを奪われた場合に本人が気づける
  // ようにするためで、確認メール（新アドレス宛）は Better Auth が送っている。
  //
  // 送信の失敗で操作全体を失敗にはしない。確認メールは既に出ており、
  // ここで「失敗しました」と出すと、実際には進んでいる操作を再試行させる。
  try {
    await getMailer().send(
      buildEmailChangeNoticeEmail({
        from: resolveMailFrom(process.env),
        to: { email: session.user.email, name: session.user.name },
        newEmail: parsed.data.newEmail,
      }),
    );
  } catch (reason) {
    console.error("メールアドレス変更の通知メールを送信できませんでした", reason);
  }

  return { error: null, notice: SENT_NOTICE };
};
```

- [ ] **Step 18: テストが通ることを確認する**

Run: `pnpm vitest run src/features/user/change-email/handler.test.ts`
Expected: PASS（6 件）

- [ ] **Step 19: `EmailSection.test.tsx` を書く（失敗する）**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProfileFormAction } from "@/features/user/state";
import { EmailSection } from "./EmailSection";

const noopAction: ProfileFormAction = async () => ({
  error: null,
  notice: null,
});

describe("EmailSection", () => {
  it("現在のアドレスを表示する（入力欄ではなくテキストとして）", () => {
    render(
      <EmailSection currentEmail="old@example.test" action={noopAction} />,
    );

    expect(screen.getByText("old@example.test")).toBeInTheDocument();
  });

  it("新しいアドレスの入力欄は空で始まる", () => {
    render(
      <EmailSection currentEmail="old@example.test" action={noopAction} />,
    );

    expect(screen.getByLabelText("新しいメールアドレス")).toHaveValue("");
  });

  it("リンクを踏むまで変わらないことを伝える", () => {
    render(
      <EmailSection currentEmail="old@example.test" action={noopAction} />,
    );

    expect(
      screen.getByText(
        "新しいアドレスに確認メールを送ります。リンクを開くまでメールアドレスは変更されません",
      ),
    ).toBeInTheDocument();
  });

  it("送信ボタンがある", () => {
    render(
      <EmailSection currentEmail="old@example.test" action={noopAction} />,
    );

    expect(
      screen.getByRole("button", { name: "確認メールを送信" }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 20: テストが落ちることを確認する**

Run: `pnpm vitest run src/components/profile/EmailSection.test.tsx`
Expected: FAIL。`./EmailSection` が存在しない。

- [ ] **Step 21: `EmailSection.tsx` を書く**

```tsx
"use client";

import { useActionState } from "react";
import {
  INITIAL_PROFILE_FORM_STATE,
  type ProfileFormAction,
} from "@/features/user/state";

export function EmailSection({
  currentEmail,
  action,
}: {
  currentEmail: string;
  action: ProfileFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_PROFILE_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1">
        <p className="block text-sm font-medium text-slate-700">
          現在のメールアドレス
        </p>
        <p className="text-sm text-slate-600">{currentEmail}</p>
      </div>

      <div className="space-y-1">
        <label
          htmlFor="new-email"
          className="block text-sm font-medium text-slate-700"
        >
          新しいメールアドレス
        </label>
        <input
          id="new-email"
          name="newEmail"
          type="email"
          autoComplete="email"
          required
          defaultValue=""
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <p className="text-xs text-slate-500">
          新しいアドレスに確認メールを送ります。リンクを開くまでメールアドレスは変更されません
        </p>
      </div>

      {state.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state.notice !== null && (
        <p role="status" className="text-sm text-emerald-700">
          {state.notice}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "送信中..." : "確認メールを送信"}
      </button>
    </form>
  );
}
```

- [ ] **Step 22: テストが通ることを確認する**

Run: `pnpm vitest run src/components/profile/EmailSection.test.tsx`
Expected: PASS（4 件）

- [ ] **Step 23: `/profile` にメール節を足す**

`src/app/profile/page.tsx` の import に足す。

```tsx
import { EmailSection } from "@/components/profile/EmailSection";
import { changeEmailAction } from "@/features/user/change-email/handler";
```

「基本情報」の節と「パスワード」の節の間に足す。

```tsx
        <section className="space-y-4 rounded border border-slate-200 bg-white px-5 py-4">
          <h2 className="text-sm font-bold text-slate-800">メールアドレス</h2>
          <EmailSection
            currentEmail={session.user.email}
            action={changeEmailAction}
          />
        </section>
```

- [ ] **Step 24: `page.test.tsx` にテストを足す**

`src/app/profile/page.test.tsx` の `describe` の末尾に足す。

```tsx
  it("現在のメールアドレスが出る", async () => {
    render(await ProfilePage());

    expect(screen.getByText("taro@example.test")).toBeInTheDocument();
  });
```

- [ ] **Step 25: 全体を確認してコミットする**

Run: `pnpm typecheck && pnpm vitest run && pnpm lint`
Expected: エラー無し、全 PASS

```bash
git add src/shared/lib/auth-email-change-email.ts \
        src/shared/lib/auth-email-change-email.test.ts \
        src/shared/lib/auth.ts src/features/user/change-email \
        src/components/profile/EmailSection.tsx \
        src/components/profile/EmailSection.test.tsx \
        src/app/profile/page.tsx src/app/profile/page.test.tsx
git commit -m "feat(user): let a user change their email address"
```

コミット本文には次を含める。

```
The confirmation goes to the new address, so a typo simply never arrives
and the address stays as it was. The old address gets a notice with no
link, which is what makes a stolen session visible to its owner. A
failure to send that notice does not fail the request: the confirmation
is already out, and reporting failure would push the user to retry
something that already happened.

sendVerificationEmail is called for both signup and email change and is
given no way to tell them apart, so the callbackURL we passed in is the
only signal. The check compares that URL's path only -- reading its query
would misread a signup whose redirect happens to be /profile.

Better Auth answers success even when the new address belongs to someone
else, so the wording cannot depend on the outcome.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 7: Google 連携の追加と解除

**`unlink-account` に `schema.ts` を置かない。** このフォームはボタンだけで、
入力欄を持たない。解除対象の `accountId` は画面から送らせず、セッションの
ユーザー ID と `providerId` からサーバ側で引き当てる。他人の `accountId` を
送りつけられる経路を作らないためで、そうすると検証すべき入力が残らない。

**Files:**
- Create: `src/features/user/link-google/handler.ts`
- Create: `src/features/user/link-google/handler.test.ts`
- Create: `src/features/user/unlink-account/{usecase,usecase.test,handler,handler.test}.ts`
- Create: `src/components/profile/LinkedAccountsSection.tsx`
- Create: `src/components/profile/LinkedAccountsSection.test.tsx`
- Modify: `src/app/profile/page.tsx`
- Modify: `src/app/profile/page.test.tsx`

**Interfaces:**
- Consumes: `findLinkedAccounts` / `GOOGLE_PROVIDER_ID`（Task 2）、`runAuthApiCall` / `AuthApiPort`（Task 1）、`ProfileFormAction`
- Produces:
  - `LinkGooglePort = AuthApiPort<{ body: { provider: "google"; callbackURL: string; errorCallbackURL: string }; headers: Headers }, { url: string }>`
  - `linkGoogleAction: ProfileFormAction`
  - `UnlinkAccountPort = AuthApiPort<{ body: { accountId: string }; headers: Headers }, unknown>`
  - `unlinkAccount(port, accountId, headers): Effect.Effect<unknown, AuthError>`
  - `unlinkGoogleAction: ProfileFormAction`
  - `LinkedAccountsSection({ google, hasPassword, linkAction, unlinkAction })`

- [ ] **Step 1: `link-google/handler.test.ts` を書く（失敗する）**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_PROFILE_FORM_STATE } from "../state";

const requireSession = vi.fn();
const linkSocialAccount = vi.fn();
const nextHeaders = vi.fn();
const redirect = vi.fn((_url: string) => {
  // next/navigation の redirect は例外を投げて制御を打ち切る。
  throw new Error("NEXT_REDIRECT");
});

vi.mock("@/shared/middleware/require-session", () => ({
  requireSession: () => requireSession(),
}));

vi.mock("@/shared/lib/auth", () => ({
  auth: {
    api: { linkSocialAccount: (input: unknown) => linkSocialAccount(input) },
  },
}));

vi.mock("next/headers", () => ({
  headers: () => nextHeaders(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirect(url),
}));

const { linkGoogleAction } = await import("./handler");

describe("linkGoogleAction", () => {
  beforeEach(() => {
    requireSession.mockReset();
    linkSocialAccount.mockReset();
    nextHeaders.mockReset();
    redirect.mockClear();
    requireSession.mockResolvedValue({ user: { id: "u1" } });
    nextHeaders.mockResolvedValue(new Headers());
    linkSocialAccount.mockResolvedValue({
      url: "https://accounts.google.test/o/oauth2/auth?x=1",
      redirect: true,
    });
  });

  it("未ログインなら requireSession の時点で打ち切られ、連携に進まない", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(
      linkGoogleAction(INITIAL_PROFILE_FORM_STATE, new FormData()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(linkSocialAccount).not.toHaveBeenCalled();
  });

  it("成否どちらでも /profile へ戻る callbackURL を渡す", async () => {
    await expect(
      linkGoogleAction(INITIAL_PROFILE_FORM_STATE, new FormData()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(linkSocialAccount).toHaveBeenCalledWith({
      body: {
        provider: "google",
        callbackURL: "/profile",
        errorCallbackURL: "/profile",
      },
      headers: expect.any(Headers),
    });
  });

  it("返った url へ遷移させる", async () => {
    // 成功時は redirect が例外として制御を奪うので、例外側で成功を確認する。
    await expect(
      linkGoogleAction(INITIAL_PROFILE_FORM_STATE, new FormData()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith(
      "https://accounts.google.test/o/oauth2/auth?x=1",
    );
  });

  it("url が返らなければ遷移せずエラーを返す", async () => {
    linkSocialAccount.mockResolvedValue({ url: "", redirect: false });

    const result = await linkGoogleAction(
      INITIAL_PROFILE_FORM_STATE,
      new FormData(),
    );

    expect(redirect).not.toHaveBeenCalled();
    expect(result.error).toBe(
      "処理に失敗しました。時間をおいて再度お試しください",
    );
  });

  it("Better Auth が失敗したら遷移せず文言に写して返す", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, { body: { code: "UNAUTHORIZED" } });
    linkSocialAccount.mockRejectedValue(apiError);

    const result = await linkGoogleAction(
      INITIAL_PROFILE_FORM_STATE,
      new FormData(),
    );

    expect(redirect).not.toHaveBeenCalled();
    expect(result.error).toBe(
      "処理に失敗しました。時間をおいて再度お試しください",
    );
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm vitest run src/features/user/link-google/handler.test.ts`
Expected: FAIL。`./handler` が存在しない。

- [ ] **Step 3: `link-google/handler.ts` を書く**

usecase.ts を分けないのは、この操作に変換すべき入力が無く、handler が
そのまま port を呼ぶだけになるため。フォームは値を持たない。

```ts
"use server";

import { Effect, Exit } from "effect";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/shared/lib/auth";
import { type AuthApiPort, runAuthApiCall } from "@/shared/lib/auth-effect";
import { requireSession } from "@/shared/middleware/require-session";
import { profileErrorFormState } from "../effect-to-form-state";
import type { ProfileFormState } from "../state";

/** auth.api.linkSocialAccount が満たす最小の形。url を返す。 */
export type LinkGooglePort = AuthApiPort<
  {
    body: {
      provider: "google";
      callbackURL: string;
      errorCallbackURL: string;
    };
    headers: Headers;
  },
  { url: string }
>;

export const linkGoogleAction = async (
  _prevState: ProfileFormState,
  _formData: FormData,
): Promise<ProfileFormState> => {
  // ページで確認済みでも Server Action は独立した入口なので、ここでも呼ぶ。
  await requireSession();

  // 宣言した port の型を実際に通すことで、better-auth の戻り値が
  // { url } を持たなくなったらここで型エラーになる。
  const linkGoogle: LinkGooglePort = (input) => auth.api.linkSocialAccount(input);

  const exit = await Effect.runPromiseExit(
    runAuthApiCall(linkGoogle, {
      body: {
        provider: "google" as const,
        // 成否どちらでもプロフィールへ戻す。連携の結果は画面の表示で分かる。
        callbackURL: "/profile",
        errorCallbackURL: "/profile",
      },
      headers: await headers(),
    }),
  );

  if (Exit.isFailure(exit)) {
    return profileErrorFormState(exit.cause);
  }

  // disableRedirect を渡していないので通常は必ず url が返る。空で返るのは
  // 想定外なので、遷移させずエラーとして見せる（空文字へ redirect すると
  // 何が起きたか分からない画面になる）。
  if (!exit.value.url) {
    return {
      error: "処理に失敗しました。時間をおいて再度お試しください",
      notice: null,
    };
  }

  // Google の認証画面はこのアプリの外にある。redirect は例外を投げて
  // 制御を打ち切るため、これ以降は実行されない。
  redirect(exit.value.url);
};
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm vitest run src/features/user/link-google/handler.test.ts`
Expected: PASS（5 件）

- [ ] **Step 5: `unlink-account/usecase.test.ts` を書く（失敗する）**

```ts
import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import type { UnlinkAccountPort } from "./usecase";
import { unlinkAccount } from "./usecase";

const headers = new Headers();

describe("unlinkAccount", () => {
  it("accountId を body に入れ、headers をそのまま渡す", async () => {
    const port = vi.fn().mockResolvedValue({ status: true });

    const exit = await Effect.runPromiseExit(
      unlinkAccount(port, "a2", headers),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({ body: { accountId: "a2" }, headers });
  });

  it("最後の 1 つの解除を LastAccountUnlinkForbidden として伝える", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, {
      body: { code: "FAILED_TO_UNLINK_LAST_ACCOUNT" },
    });
    const port: UnlinkAccountPort = () => Promise.reject(apiError);

    const exit = await Effect.runPromiseExit(
      unlinkAccount(port, "a2", headers),
    );

    expect(failureTag(exit)).toBe("LastAccountUnlinkForbidden");
  });

  it("古いセッションを SessionNotFresh として伝える", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, { body: { code: "SESSION_NOT_FRESH" } });
    const port: UnlinkAccountPort = () => Promise.reject(apiError);

    const exit = await Effect.runPromiseExit(
      unlinkAccount(port, "a2", headers),
    );

    expect(failureTag(exit)).toBe("SessionNotFresh");
  });
});
```

- [ ] **Step 6: テストが落ちることを確認する**

Run: `pnpm vitest run src/features/user/unlink-account/usecase.test.ts`
Expected: FAIL。`./usecase` が存在しない。

- [ ] **Step 7: `unlink-account/usecase.ts` を書く**

```ts
import type { Effect } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";
import { type AuthApiPort, runAuthApiCall } from "@/shared/lib/auth-effect";

/** auth.api.unlinkAccount が満たす最小の形。 */
export type UnlinkAccountPort = AuthApiPort<
  { body: { accountId: string }; headers: Headers },
  unknown
>;

/**
 * accountId は画面から受け取らず、handler がセッションのユーザーの
 * 連携から引き当てたものを渡す。schema.ts を持たないのはそのため。
 *
 * unlinkAccount は freshSessionMiddleware を使っており、セッション作成から
 * 24 時間を過ぎると SESSION_NOT_FRESH になる。回避できないので、
 * 画面は再ログインを促す文言を出す。
 */
export const unlinkAccount = (
  port: UnlinkAccountPort,
  accountId: string,
  headers: Headers,
): Effect.Effect<unknown, AuthError> =>
  runAuthApiCall(port, { body: { accountId }, headers });
```

- [ ] **Step 8: テストが通ることを確認する**

Run: `pnpm vitest run src/features/user/unlink-account/usecase.test.ts`
Expected: PASS（3 件）

- [ ] **Step 9: `unlink-account/handler.test.ts` を書く（失敗する）**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_PROFILE_FORM_STATE } from "../state";

const requireSession = vi.fn();
const findLinkedAccounts = vi.fn();
const unlinkAccountApi = vi.fn();
const revalidatePath = vi.fn();
const nextHeaders = vi.fn();

vi.mock("@/shared/middleware/require-session", () => ({
  requireSession: () => requireSession(),
}));

vi.mock("../repository", () => ({
  findLinkedAccounts: (userId: string) => findLinkedAccounts(userId),
  GOOGLE_PROVIDER_ID: "google",
}));

vi.mock("@/shared/lib/auth", () => ({
  auth: {
    api: { unlinkAccount: (input: unknown) => unlinkAccountApi(input) },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

vi.mock("next/headers", () => ({
  headers: () => nextHeaders(),
}));

const { unlinkGoogleAction } = await import("./handler");

describe("unlinkGoogleAction", () => {
  beforeEach(() => {
    requireSession.mockReset();
    findLinkedAccounts.mockReset();
    unlinkAccountApi.mockReset();
    revalidatePath.mockClear();
    nextHeaders.mockReset();
    requireSession.mockResolvedValue({ user: { id: "u1" } });
    nextHeaders.mockResolvedValue(new Headers());
    findLinkedAccounts.mockResolvedValue({
      hasPassword: true,
      google: { accountId: "a2", linkedAt: new Date("2026-09-02T00:00:00Z") },
    });
    unlinkAccountApi.mockResolvedValue({ status: true });
  });

  it("未ログインなら requireSession の時点で打ち切られ、解除に進まない", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(
      unlinkGoogleAction(INITIAL_PROFILE_FORM_STATE, new FormData()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(unlinkAccountApi).not.toHaveBeenCalled();
  });

  it("解除対象はセッションのユーザーの連携から引き当てる", async () => {
    // accountId をフォームから受け取らないので、他人の連携を指定できない。
    await unlinkGoogleAction(INITIAL_PROFILE_FORM_STATE, new FormData());

    expect(findLinkedAccounts).toHaveBeenCalledWith("u1");
    expect(unlinkAccountApi).toHaveBeenCalledWith({
      body: { accountId: "a2" },
      headers: expect.any(Headers),
    });
  });

  it("連携していなければ解除を呼ばずエラーを返す", async () => {
    findLinkedAccounts.mockResolvedValue({ hasPassword: true, google: null });

    const result = await unlinkGoogleAction(
      INITIAL_PROFILE_FORM_STATE,
      new FormData(),
    );

    expect(unlinkAccountApi).not.toHaveBeenCalled();
    expect(result.error).toBe("Google と連携していません");
  });

  it("成功したら notice を返し、節の表示が変わるため再検証する", async () => {
    const result = await unlinkGoogleAction(
      INITIAL_PROFILE_FORM_STATE,
      new FormData(),
    );

    expect(result).toEqual({
      error: null,
      notice: "Google との連携を解除しました",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/profile");
  });

  it("最後の 1 つなら、先にパスワードを設定するよう促す", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, {
      body: { code: "FAILED_TO_UNLINK_LAST_ACCOUNT" },
    });
    unlinkAccountApi.mockRejectedValue(apiError);

    const result = await unlinkGoogleAction(
      INITIAL_PROFILE_FORM_STATE,
      new FormData(),
    );

    expect(result.error).toBe(
      "最後のログイン方法は解除できません。先にパスワードを設定してください",
    );
  });

  it("セッションが古ければ、ログインし直しを促す", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, { body: { code: "SESSION_NOT_FRESH" } });
    unlinkAccountApi.mockRejectedValue(apiError);

    const result = await unlinkGoogleAction(
      INITIAL_PROFILE_FORM_STATE,
      new FormData(),
    );

    expect(result.error).toContain("ログインし直し");
  });
});
```

- [ ] **Step 10: テストが落ちることを確認する**

Run: `pnpm vitest run src/features/user/unlink-account/handler.test.ts`
Expected: FAIL。`./handler` が存在しない。

- [ ] **Step 11: `unlink-account/handler.ts` を書く**

```ts
"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/shared/lib/auth";
import { requireSession } from "@/shared/middleware/require-session";
import { profileErrorFormState } from "../effect-to-form-state";
import { findLinkedAccounts } from "../repository";
import type { ProfileFormState } from "../state";
import { unlinkAccount } from "./usecase";

export const unlinkGoogleAction = async (
  _prevState: ProfileFormState,
  _formData: FormData,
): Promise<ProfileFormState> => {
  // ページで確認済みでも Server Action は独立した入口なので、ここでも呼ぶ。
  const session = await requireSession();

  // 解除対象はセッションのユーザーの連携から引き当てる。accountId を
  // フォームから受け取ると、他人の連携を指す値を送りつけられる口ができる。
  const linkedAccounts = await findLinkedAccounts(session.user.id);
  if (linkedAccounts.google === null) {
    return { error: "Google と連携していません", notice: null };
  }

  const exit = await Effect.runPromiseExit(
    unlinkAccount(
      (input) => auth.api.unlinkAccount(input),
      linkedAccounts.google.accountId,
      await headers(),
    ),
  );

  if (Exit.isFailure(exit)) {
    return profileErrorFormState(exit.cause);
  }

  // 解除後は連携節が「連携する」に切り替わる。サーバで読んだ状態に
  // 依存するため作り直す。
  revalidatePath("/profile");
  return { error: null, notice: "Google との連携を解除しました" };
};
```

- [ ] **Step 12: テストが通ることを確認する**

Run: `pnpm vitest run src/features/user/unlink-account/handler.test.ts`
Expected: PASS（6 件）

- [ ] **Step 13: `LinkedAccountsSection.test.tsx` を書く（失敗する）**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProfileFormAction } from "@/features/user/state";
import { LinkedAccountsSection } from "./LinkedAccountsSection";

const noopAction: ProfileFormAction = async () => ({
  error: null,
  notice: null,
});

const google = { accountId: "a2", linkedAt: new Date("2026-09-02T00:00:00Z") };

describe("LinkedAccountsSection", () => {
  it("未連携なら連携ボタンを出す", () => {
    render(
      <LinkedAccountsSection
        google={null}
        hasPassword
        linkAction={noopAction}
        unlinkAction={noopAction}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Google と連携する" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "連携を解除" }),
    ).toBeNull();
  });

  it("連携済みなら解除ボタンと連携日を出す", () => {
    render(
      <LinkedAccountsSection
        google={google}
        hasPassword
        linkAction={noopAction}
        unlinkAction={noopAction}
      />,
    );

    expect(
      screen.getByRole("button", { name: "連携を解除" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/2026\/9\/2 連携/)).toBeInTheDocument();
  });

  it("パスワード未設定なら解除ボタンを押せなくし、理由を書く", () => {
    // 押しても Better Auth が FAILED_TO_UNLINK_LAST_ACCOUNT で拒むが、
    // 押す前に理由が読めるほうが親切。境界は依然サーバ側にある。
    render(
      <LinkedAccountsSection
        google={google}
        hasPassword={false}
        linkAction={noopAction}
        unlinkAction={noopAction}
      />,
    );

    expect(screen.getByRole("button", { name: "連携を解除" })).toBeDisabled();
    expect(
      screen.getByText(
        "唯一のログイン方法のため解除できません。先にパスワードを設定してください",
      ),
    ).toBeInTheDocument();
  });

  it("パスワード設定済みなら解除ボタンを押せる", () => {
    render(
      <LinkedAccountsSection
        google={google}
        hasPassword
        linkAction={noopAction}
        unlinkAction={noopAction}
      />,
    );

    expect(
      screen.getByRole("button", { name: "連携を解除" }),
    ).toBeEnabled();
  });
});
```

- [ ] **Step 14: テストが落ちることを確認する**

Run: `pnpm vitest run src/components/profile/LinkedAccountsSection.test.tsx`
Expected: FAIL。`./LinkedAccountsSection` が存在しない。

- [ ] **Step 15: `LinkedAccountsSection.tsx` を書く**

```tsx
"use client";

import { useActionState } from "react";
import {
  INITIAL_PROFILE_FORM_STATE,
  type ProfileFormAction,
} from "@/features/user/state";

/**
 * 解除ボタンを押せなくするのは体感のためで、境界ではない。
 * 最後の 1 つの解除は Better Auth 自身が FAILED_TO_UNLINK_LAST_ACCOUNT で
 * 拒む。ここで無効にしておくのは、押す前に理由が読めるようにするため。
 */
export function LinkedAccountsSection({
  google,
  hasPassword,
  linkAction,
  unlinkAction,
}: {
  google: { accountId: string; linkedAt: Date } | null;
  hasPassword: boolean;
  linkAction: ProfileFormAction;
  unlinkAction: ProfileFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    google === null ? linkAction : unlinkAction,
    INITIAL_PROFILE_FORM_STATE,
  );

  const canUnlink = hasPassword;

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-700">Google</p>
          <p className="text-xs text-slate-500">
            {google === null
              ? "連携していません"
              : `${google.linkedAt.toLocaleDateString("ja-JP")} 連携`}
          </p>
        </div>

        {google === null ? (
          <button
            type="submit"
            disabled={pending}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50"
          >
            {pending ? "処理中..." : "Google と連携する"}
          </button>
        ) : (
          <button
            type="submit"
            disabled={pending || !canUnlink}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50"
          >
            {pending ? "処理中..." : "連携を解除"}
          </button>
        )}
      </div>

      {google !== null && !canUnlink && (
        <p className="text-xs text-slate-500">
          唯一のログイン方法のため解除できません。先にパスワードを設定してください
        </p>
      )}

      {state.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state.notice !== null && (
        <p role="status" className="text-sm text-emerald-700">
          {state.notice}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 16: テストが通ることを確認する**

Run: `pnpm vitest run src/components/profile/LinkedAccountsSection.test.tsx`
Expected: PASS（4 件）

- [ ] **Step 17: `/profile` に連携節を足す**

`src/app/profile/page.tsx` の import に足す。

```tsx
import { LinkedAccountsSection } from "@/components/profile/LinkedAccountsSection";
import { linkGoogleAction } from "@/features/user/link-google/handler";
import { unlinkGoogleAction } from "@/features/user/unlink-account/handler";
```

パスワード節の後ろに足す。

```tsx
        <section className="space-y-4 rounded border border-slate-200 bg-white px-5 py-4">
          <h2 className="text-sm font-bold text-slate-800">連携アカウント</h2>
          <LinkedAccountsSection
            google={linkedAccounts.google}
            hasPassword={linkedAccounts.hasPassword}
            linkAction={linkGoogleAction}
            unlinkAction={unlinkGoogleAction}
          />
        </section>
```

- [ ] **Step 18: `page.test.tsx` にテストを足す**

`src/app/profile/page.test.tsx` の `describe` の末尾に足す。

```tsx
  it("Google 未連携なら連携ボタンを出す", async () => {
    render(await ProfilePage());

    expect(
      screen.getByRole("button", { name: "Google と連携する" }),
    ).toBeInTheDocument();
  });

  it("Google 連携済みなら解除ボタンを出す", async () => {
    findLinkedAccounts.mockResolvedValue({
      hasPassword: true,
      google: { accountId: "a2", linkedAt: new Date("2026-09-02T00:00:00Z") },
    });

    render(await ProfilePage());

    expect(
      screen.getByRole("button", { name: "連携を解除" }),
    ).toBeInTheDocument();
  });
```

- [ ] **Step 19: 全体を確認してコミットする**

Run: `pnpm typecheck && pnpm vitest run && pnpm lint`
Expected: エラー無し、全 PASS

```bash
git add src/features/user/link-google src/features/user/unlink-account \
        src/components/profile/LinkedAccountsSection.tsx \
        src/components/profile/LinkedAccountsSection.test.tsx \
        src/app/profile/page.tsx src/app/profile/page.test.tsx
git commit -m "feat(user): let a user link and unlink their Google account"
```

コミット本文には次を含める。

```
The account to unlink is resolved from the session, never sent by the
form, so there is no way to name someone else's account. That leaves no
input to validate, which is why this slice has no schema.

Disabling the unlink button without a password is comfort; Better Auth
refuses to unlink the last account on its own. Because of that refusal, a
user cannot lock themselves out by removing their only sign-in method.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 8: 他端末のログアウト

**Files:**
- Create: `src/features/user/revoke-sessions/handler.ts`
- Create: `src/features/user/revoke-sessions/handler.test.ts`
- Create: `src/components/profile/RevokeSessionsForm.tsx`
- Create: `src/components/profile/RevokeSessionsForm.test.tsx`
- Modify: `src/app/profile/page.tsx`

**Interfaces:**
- Consumes: `runAuthApiCall`（Task 1）、`ProfileFormAction`
- Produces: `revokeOtherSessionsAction: ProfileFormAction`、`RevokeSessionsForm({ action })`

- [ ] **Step 1: `revoke-sessions/handler.test.ts` を書く（失敗する）**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_PROFILE_FORM_STATE } from "../state";

const requireSession = vi.fn();
const revokeOtherSessions = vi.fn();
const nextHeaders = vi.fn();

vi.mock("@/shared/middleware/require-session", () => ({
  requireSession: () => requireSession(),
}));

vi.mock("@/shared/lib/auth", () => ({
  auth: {
    api: {
      revokeOtherSessions: (input: unknown) => revokeOtherSessions(input),
    },
  },
}));

vi.mock("next/headers", () => ({
  headers: () => nextHeaders(),
}));

const { revokeOtherSessionsAction } = await import("./handler");

describe("revokeOtherSessionsAction", () => {
  beforeEach(() => {
    requireSession.mockReset();
    revokeOtherSessions.mockReset();
    nextHeaders.mockReset();
    requireSession.mockResolvedValue({ user: { id: "u1" } });
    nextHeaders.mockResolvedValue(new Headers());
    revokeOtherSessions.mockResolvedValue({ status: true });
  });

  it("未ログインなら requireSession の時点で打ち切られ、破棄に進まない", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(
      revokeOtherSessionsAction(INITIAL_PROFILE_FORM_STATE, new FormData()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(revokeOtherSessions).not.toHaveBeenCalled();
  });

  it("headers だけを渡す（対象はセッションが決める）", async () => {
    await revokeOtherSessionsAction(INITIAL_PROFILE_FORM_STATE, new FormData());

    expect(revokeOtherSessions).toHaveBeenCalledWith({
      headers: expect.any(Headers),
    });
  });

  it("成功したら、今の端末は残ることが分かる notice を返す", async () => {
    const result = await revokeOtherSessionsAction(
      INITIAL_PROFILE_FORM_STATE,
      new FormData(),
    );

    expect(result).toEqual({
      error: null,
      notice: "この端末以外のログインを解除しました",
    });
  });

  it("失敗は文言に写して返す", async () => {
    revokeOtherSessions.mockRejectedValue(new Error("network"));

    const result = await revokeOtherSessionsAction(
      INITIAL_PROFILE_FORM_STATE,
      new FormData(),
    );

    expect(result.error).toBe(
      "処理に失敗しました。時間をおいて再度お試しください",
    );
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm vitest run src/features/user/revoke-sessions/handler.test.ts`
Expected: FAIL。`./handler` が存在しない。

- [ ] **Step 3: `revoke-sessions/handler.ts` を書く**

```ts
"use server";

import { Effect, Exit } from "effect";
import { headers } from "next/headers";
import { auth } from "@/shared/lib/auth";
import { runAuthApiCall } from "@/shared/lib/auth-effect";
import { requireSession } from "@/shared/middleware/require-session";
import { profileErrorFormState } from "../effect-to-form-state";
import type { ProfileFormState } from "../state";

/**
 * 現在のセッション以外を破棄する。対象はセッション（Cookie）が決めるため、
 * フォームから受け取る値が無く、schema.ts も usecase.ts も要らない。
 */
export const revokeOtherSessionsAction = async (
  _prevState: ProfileFormState,
  _formData: FormData,
): Promise<ProfileFormState> => {
  // ページで確認済みでも Server Action は独立した入口なので、ここでも呼ぶ。
  await requireSession();

  const exit = await Effect.runPromiseExit(
    runAuthApiCall((input) => auth.api.revokeOtherSessions(input), {
      headers: await headers(),
    }),
  );

  if (Exit.isFailure(exit)) {
    return profileErrorFormState(exit.cause);
  }

  return { error: null, notice: "この端末以外のログインを解除しました" };
};
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm vitest run src/features/user/revoke-sessions/handler.test.ts`
Expected: PASS（4 件）

- [ ] **Step 5: `RevokeSessionsForm.test.tsx` を書く（失敗する）**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProfileFormAction } from "@/features/user/state";
import { RevokeSessionsForm } from "./RevokeSessionsForm";

const noopAction: ProfileFormAction = async () => ({
  error: null,
  notice: null,
});

describe("RevokeSessionsForm", () => {
  it("実行ボタンがある", () => {
    render(<RevokeSessionsForm action={noopAction} />);

    expect(
      screen.getByRole("button", { name: "他の端末をログアウト" }),
    ).toBeInTheDocument();
  });

  it("今の端末は残ることを伝える", () => {
    render(<RevokeSessionsForm action={noopAction} />);

    expect(
      screen.getByText(
        "この端末のログインは維持されます。他の端末では再度ログインが必要になります",
      ),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: テストが落ちることを確認する**

Run: `pnpm vitest run src/components/profile/RevokeSessionsForm.test.tsx`
Expected: FAIL。`./RevokeSessionsForm` が存在しない。

- [ ] **Step 7: `RevokeSessionsForm.tsx` を書く**

```tsx
"use client";

import { useActionState } from "react";
import {
  INITIAL_PROFILE_FORM_STATE,
  type ProfileFormAction,
} from "@/features/user/state";

export function RevokeSessionsForm({ action }: { action: ProfileFormAction }) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_PROFILE_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-2">
      <p className="text-xs text-slate-500">
        この端末のログインは維持されます。他の端末では再度ログインが必要になります
      </p>

      {state.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state.notice !== null && (
        <p role="status" className="text-sm text-emerald-700">
          {state.notice}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50"
      >
        {pending ? "処理中..." : "他の端末をログアウト"}
      </button>
    </form>
  );
}
```

- [ ] **Step 8: テストが通ることを確認する**

Run: `pnpm vitest run src/components/profile/RevokeSessionsForm.test.tsx`
Expected: PASS

- [ ] **Step 9: `/profile` に「セキュリティ」節を足す**

`src/app/profile/page.tsx` の import に足す。

```tsx
import { RevokeSessionsForm } from "@/components/profile/RevokeSessionsForm";
import { revokeOtherSessionsAction } from "@/features/user/revoke-sessions/handler";
```

連携節の後ろに足す。

```tsx
        <section className="space-y-4 rounded border border-slate-200 bg-white px-5 py-4">
          <h2 className="text-sm font-bold text-slate-800">セキュリティ</h2>
          <RevokeSessionsForm action={revokeOtherSessionsAction} />
        </section>
```

- [ ] **Step 10: 全体を確認してコミットする**

Run: `pnpm typecheck && pnpm vitest run && pnpm lint`
Expected: エラー無し、全 PASS

```bash
git add src/features/user/revoke-sessions \
        src/components/profile/RevokeSessionsForm.tsx \
        src/components/profile/RevokeSessionsForm.test.tsx \
        src/app/profile/page.tsx
git commit -m "feat(user): let a user sign out their other devices"
```

コミット本文には次を含める。

```
Which sessions get revoked is decided by the cookie, so the form carries
no value -- no schema and no usecase, just the action.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 9: アカウント削除

確認メールのリンクを踏んで初めて削除される。その手前に「組織の孤児化」ガードを置く。

**`delete-account` に `repository.ts` を置かない。** 孤児化の判定クエリは
`src/shared/authz/sole-granter.ts` にある。`src/shared/lib/auth.ts` の
`beforeDelete` フックも同じ判定を使う必要があり、`shared` は `@/features/**` を
import できないため、判定は `shared` 側にしか置けない。スライス側に
repository.ts を置いても委譲するだけになる。

**Files:**
- Create: `src/shared/authz/sole-granter.ts`
- Create: `src/shared/authz/sole-granter.test.ts`
- Create: `src/shared/lib/auth-delete-account-email.ts`
- Create: `src/shared/lib/auth-delete-account-email.test.ts`
- Modify: `src/shared/lib/auth.ts`
- Create: `src/features/user/delete-account/{domain,domain.test,usecase,usecase.test,handler,handler.test}.ts`
- Create: `src/components/profile/DeleteAccountForm.tsx`
- Create: `src/components/profile/DeleteAccountForm.test.tsx`
- Modify: `src/app/profile/page.tsx`

**Interfaces:**
- Consumes: `prisma`、`PERMISSION_CODES`（`shared/authz/ability`）、`runAuthApiCall`（Task 1）、`getMailer` / `resolveMailFrom`、`ProfileFormAction`
- Produces:
  - `type SoleGranterOrganization = { id: string; name: string; slug: string }`
  - `findSoleGranterOrganizations(userId: string): Promise<SoleGranterOrganization[]>`
  - `buildDeleteAccountEmail({ from, to, url }): MailMessage`
  - `soleGranterMessage(organizations: { name: string }[]): string`
  - `DeleteAccountPort = AuthApiPort<{ body: { callbackURL: string }; headers: Headers }, unknown>`
  - `deleteAccount(port, headers): Effect.Effect<unknown, AuthError>`
  - `deleteAccountAction: ProfileFormAction`

- [ ] **Step 1: `sole-granter.test.ts` を書く（失敗する）**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const permissionFindMany = vi.fn();
const organizationFindMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    organizationUserPermission: {
      findMany: (args: unknown) => permissionFindMany(args),
    },
    organization: { findMany: (args: unknown) => organizationFindMany(args) },
  },
}));

const { findSoleGranterOrganizations } = await import("./sole-granter");

describe("findSoleGranterOrganizations", () => {
  beforeEach(() => {
    permissionFindMany.mockReset();
    organizationFindMany.mockReset();
    organizationFindMany.mockResolvedValue([]);
  });

  it("user.grant を 1 つも持たなければ、組織を引かずに空を返す", async () => {
    permissionFindMany.mockResolvedValueOnce([]);

    const result = await findSoleGranterOrganizations("u1");

    expect(result).toEqual([]);
    expect(permissionFindMany).toHaveBeenCalledTimes(1);
    expect(organizationFindMany).not.toHaveBeenCalled();
  });

  it("自分が持つ user.grant を organizationId だけ引く", async () => {
    permissionFindMany.mockResolvedValueOnce([]);

    await findSoleGranterOrganizations("u1");

    expect(permissionFindMany).toHaveBeenNthCalledWith(1, {
      where: { userId: "u1", permission: { code: "user.grant" } },
      select: { organizationId: true },
    });
  });

  it("他にも保持者が居る組織は返さない", async () => {
    permissionFindMany
      .mockResolvedValueOnce([{ organizationId: "o1" }])
      .mockResolvedValueOnce([{ organizationId: "o1" }]);

    const result = await findSoleGranterOrganizations("u1");

    expect(result).toEqual([]);
    expect(organizationFindMany).not.toHaveBeenCalled();
  });

  it("他に保持者が居ない組織だけを返す", async () => {
    permissionFindMany
      .mockResolvedValueOnce([
        { organizationId: "o1" },
        { organizationId: "o2" },
      ])
      // o2 には他の保持者が居る。
      .mockResolvedValueOnce([{ organizationId: "o2" }]);
    organizationFindMany.mockResolvedValue([
      { id: "o1", name: "テニス部", slug: "tennis" },
    ]);

    const result = await findSoleGranterOrganizations("u1");

    expect(organizationFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["o1"] } },
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    });
    expect(result).toEqual([{ id: "o1", name: "テニス部", slug: "tennis" }]);
  });

  it("他の保持者を数えるとき、自分自身は除く", async () => {
    permissionFindMany
      .mockResolvedValueOnce([{ organizationId: "o1" }])
      .mockResolvedValueOnce([]);

    await findSoleGranterOrganizations("u1");

    expect(permissionFindMany).toHaveBeenNthCalledWith(2, {
      where: {
        organizationId: { in: ["o1"] },
        permission: { code: "user.grant" },
        userId: { not: "u1" },
      },
      select: { organizationId: true },
    });
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm vitest run src/shared/authz/sole-granter.test.ts`
Expected: FAIL。`./sole-granter` が存在しない。

- [ ] **Step 3: `sole-granter.ts` を書く**

```ts
import "server-only";
import { prisma } from "@/shared/db/prisma";
import type { PermissionCode } from "./ability";

/**
 * 権限を配れる唯一のコード。これを持つ人が組織から居なくなると、
 * その組織では以後だれも権限を付与できなくなる。
 */
const GRANT_PERMISSION_CODE: PermissionCode = "user.grant";

export type SoleGranterOrganization = {
  id: string;
  name: string;
  slug: string;
};

/**
 * そのユーザーが「唯一の user.grant 保持者」である組織を返す。
 *
 * OrganizationUser は onDelete: Cascade なので、ユーザーを消すと所属も権限も
 * 黙って消える。ここに該当する組織が 1 つでもあれば、削除を通した瞬間に
 * その組織は誰も権限を配れない状態になり、アプリの中からは直せなくなる。
 *
 * 置き場所が shared/authz なのは、features/user の Server Action と
 * shared/lib/auth.ts の beforeDelete フックの両方から使うため。
 * shared は @/features/** を import できないので、features 側には置けない。
 * 権限コードを所有するのもここ（ability.ts）なので、位置としても素直。
 */
export const findSoleGranterOrganizations = async (
  userId: string,
): Promise<SoleGranterOrganization[]> => {
  const ownGrants = await prisma.organizationUserPermission.findMany({
    where: { userId, permission: { code: GRANT_PERMISSION_CODE } },
    select: { organizationId: true },
  });

  const organizationIds = ownGrants.map((grant) => grant.organizationId);
  if (organizationIds.length === 0) {
    return [];
  }

  // 自分以外の保持者を数える。userId: { not } を where に入れることで、
  // 取得してから自分を除く形にしない。
  const otherGrants = await prisma.organizationUserPermission.findMany({
    where: {
      organizationId: { in: organizationIds },
      permission: { code: GRANT_PERMISSION_CODE },
      userId: { not: userId },
    },
    select: { organizationId: true },
  });

  const hasOtherGranter = new Set(
    otherGrants.map((grant) => grant.organizationId),
  );
  const soleIds = organizationIds.filter((id) => !hasOtherGranter.has(id));
  if (soleIds.length === 0) {
    return [];
  }

  return prisma.organization.findMany({
    where: { id: { in: soleIds } },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
};
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm vitest run src/shared/authz/sole-granter.test.ts`
Expected: PASS（5 件）

- [ ] **Step 5: `auth-delete-account-email.test.ts` を書く（失敗する）**

```ts
import { describe, expect, it } from "vitest";
import { buildDeleteAccountEmail } from "./auth-delete-account-email";

const from = { email: "no-reply@example.test", name: "大会運営" };
const url = "https://app.test/api/auth/delete-user/callback?token=t&x=1";

describe("buildDeleteAccountEmail", () => {
  const message = buildDeleteAccountEmail({
    from,
    to: { email: "taro@example.test", name: "竹添太郎" },
    url,
  });

  it("宛名とリンクを含む", () => {
    expect(message.text).toContain("竹添太郎 様");
    expect(message.text).toContain(url);
  });

  it("削除が取り消せないことを伝える", () => {
    expect(message.text).toContain("元に戻せません");
  });

  it("ログイン中のブラウザで開く必要があることを伝える", () => {
    // delete-user/callback は有効なセッションを要求する。
    expect(message.text).toContain("ログイン中のブラウザ");
  });

  it("身に覚えが無い場合の案内を含む", () => {
    expect(message.text).toContain("心当たりが無い");
  });

  it("HTML では url をエスケープする", () => {
    expect(message.html).toContain("&amp;x=1");
    expect(message.html).not.toContain("?token=t&x=1");
  });

  it("名前が空なら宛名にメールアドレスを使う", () => {
    const withoutName = buildDeleteAccountEmail({
      from,
      to: { email: "taro@example.test", name: "" },
      url,
    });
    expect(withoutName.text).toContain("taro@example.test 様");
  });
});
```

- [ ] **Step 6: テストが落ちることを確認する**

Run: `pnpm vitest run src/shared/lib/auth-delete-account-email.test.ts`
Expected: FAIL。`./auth-delete-account-email` が存在しない。

- [ ] **Step 7: `auth-delete-account-email.ts` を書く**

```ts
import { escapeHtml, greetingName } from "@/shared/lib/mail/html";
import type { MailAddress, MailMessage } from "@/shared/lib/mail/types";

export const DELETE_ACCOUNT_EMAIL_SUBJECT =
  "【大会運営】アカウント削除の確認";

/**
 * アカウント削除の確認メール。リンクを踏むまで削除は実行されない。
 *
 * 「ログイン中のブラウザで開く」と書いてあるのは、Better Auth の
 * delete-user/callback が有効なセッションを要求するため。メールを見た
 * スマホで開いても、そこでログインしていなければ進まない。
 */
export const buildDeleteAccountEmail = ({
  from,
  to,
  url,
}: {
  from: MailAddress;
  to: MailAddress;
  url: string;
}): MailMessage => {
  const greeting = greetingName(to);

  const text = [
    `${greeting} 様`,
    "",
    "アカウント削除の申請を受け付けました。",
    "次のリンクをログイン中のブラウザで開くと、削除が実行されます。",
    "",
    url,
    "",
    "削除すると、所属している組織からも外れます。元に戻せません。",
    "",
    "心当たりが無い場合は、このメールを破棄してください。リンクを開かなければ削除されません。",
  ].join("\n");

  const safeUrl = escapeHtml(url);
  const html = [
    '<html><head><meta charset="utf-8"></head><body>',
    `<p>${escapeHtml(greeting)} 様</p>`,
    "<p>アカウント削除の申請を受け付けました。<br>次のリンクをログイン中のブラウザで開くと、削除が実行されます。</p>",
    `<p><a href="${safeUrl}">${safeUrl}</a></p>`,
    "<p>削除すると、所属している組織からも外れます。元に戻せません。</p>",
    "<p>心当たりが無い場合は、このメールを破棄してください。リンクを開かなければ削除されません。</p>",
    "</body></html>",
  ].join("\n");

  return {
    from,
    to: [to],
    subject: DELETE_ACCOUNT_EMAIL_SUBJECT,
    text,
    html,
  };
};
```

- [ ] **Step 8: テストが通ることを確認する**

Run: `pnpm vitest run src/shared/lib/auth-delete-account-email.test.ts`
Expected: PASS（6 件）

- [ ] **Step 9: `delete-account/domain.test.ts` を書く（失敗する）**

```ts
import { describe, expect, it } from "vitest";
import { soleGranterMessage } from "./domain";

describe("soleGranterMessage", () => {
  it("組織名を挙げ、何をすれば進めるかを書く", () => {
    expect(soleGranterMessage([{ name: "テニス部" }])).toBe(
      "テニス部 では、権限を配れるのがあなただけです。他の人に「権限の付与」を渡してから、再度お試しください",
    );
  });

  it("複数の組織は読点で並べる", () => {
    expect(
      soleGranterMessage([{ name: "テニス部" }, { name: "卓球部" }]),
    ).toBe(
      "テニス部、卓球部 では、権限を配れるのがあなただけです。他の人に「権限の付与」を渡してから、再度お試しください",
    );
  });
});
```

- [ ] **Step 10: テストが落ちることを確認する**

Run: `pnpm vitest run src/features/user/delete-account/domain.test.ts`
Expected: FAIL。`./domain` が存在しない。

- [ ] **Step 11: `delete-account/domain.ts` を書く**

```ts
/**
 * 孤児化ガードに引っかかったときの案内。
 *
 * 組織名を挙げるのは、どこを直せばよいか分からないと詰むため。
 * 自分が所属している組織の名前なので、これを見せても何も漏れない。
 */
export const soleGranterMessage = (
  organizations: { name: string }[],
): string => {
  const names = organizations.map((organization) => organization.name).join("、");
  return `${names} では、権限を配れるのがあなただけです。他の人に「権限の付与」を渡してから、再度お試しください`;
};
```

- [ ] **Step 12: テストが通ることを確認する**

Run: `pnpm vitest run src/features/user/delete-account/domain.test.ts`
Expected: PASS

- [ ] **Step 13: `delete-account/usecase.test.ts` を書く（失敗する）**

```ts
import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import type { DeleteAccountPort } from "./usecase";
import { deleteAccount } from "./usecase";

const headers = new Headers();

describe("deleteAccount", () => {
  it("削除後の戻り先を callbackURL に入れる", async () => {
    const port = vi.fn().mockResolvedValue({ success: true });

    const exit = await Effect.runPromiseExit(deleteAccount(port, headers));

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({
      body: { callbackURL: "/login" },
      headers,
    });
  });

  it("port が投げた APIError を AuthError に写して伝える", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, { body: { code: "UNAUTHORIZED" } });
    const port: DeleteAccountPort = () => Promise.reject(apiError);

    const exit = await Effect.runPromiseExit(deleteAccount(port, headers));

    expect(failureTag(exit)).toBe("UnexpectedAuthError");
  });
});
```

- [ ] **Step 14: テストが落ちることを確認する**

Run: `pnpm vitest run src/features/user/delete-account/usecase.test.ts`
Expected: FAIL。`./usecase` が存在しない。

- [ ] **Step 15: `delete-account/usecase.ts` を書く**

```ts
import type { Effect } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";
import { type AuthApiPort, runAuthApiCall } from "@/shared/lib/auth-effect";

/** auth.api.deleteUser が満たす最小の形。 */
export type DeleteAccountPort = AuthApiPort<
  { body: { callbackURL: string }; headers: Headers },
  unknown
>;

/**
 * 削除そのものはここでは起きない。sendDeleteAccountVerification が
 * 設定されているため、この呼び出しは確認メールの送信で終わる。
 * callbackURL はリンクを踏んで削除が完了した後の戻り先で、
 * その時点でセッションは消えているのでログイン画面へ送る。
 */
export const deleteAccount = (
  port: DeleteAccountPort,
  headers: Headers,
): Effect.Effect<unknown, AuthError> =>
  runAuthApiCall(port, { body: { callbackURL: "/login" }, headers });
```

- [ ] **Step 16: テストが通ることを確認する**

Run: `pnpm vitest run src/features/user/delete-account/usecase.test.ts`
Expected: PASS

- [ ] **Step 17: `delete-account/handler.test.ts` を書く（失敗する）**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_PROFILE_FORM_STATE } from "../state";

const requireSession = vi.fn();
const findSoleGranterOrganizations = vi.fn();
const deleteUser = vi.fn();
const nextHeaders = vi.fn();

vi.mock("@/shared/middleware/require-session", () => ({
  requireSession: () => requireSession(),
}));

vi.mock("@/shared/authz/sole-granter", () => ({
  findSoleGranterOrganizations: (userId: string) =>
    findSoleGranterOrganizations(userId),
}));

vi.mock("@/shared/lib/auth", () => ({
  auth: { api: { deleteUser: (input: unknown) => deleteUser(input) } },
}));

vi.mock("next/headers", () => ({
  headers: () => nextHeaders(),
}));

const { deleteAccountAction } = await import("./handler");

describe("deleteAccountAction", () => {
  beforeEach(() => {
    requireSession.mockReset();
    findSoleGranterOrganizations.mockReset();
    deleteUser.mockReset();
    nextHeaders.mockReset();
    requireSession.mockResolvedValue({ user: { id: "u1" } });
    nextHeaders.mockResolvedValue(new Headers());
    findSoleGranterOrganizations.mockResolvedValue([]);
    deleteUser.mockResolvedValue({ success: true, message: "Verification email sent" });
  });

  it("未ログインなら requireSession の時点で打ち切られ、削除に進まない", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(
      deleteAccountAction(INITIAL_PROFILE_FORM_STATE, new FormData()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("唯一の権限保持者である組織があれば、メールを送らず組織名を挙げて断る", async () => {
    findSoleGranterOrganizations.mockResolvedValue([
      { id: "o1", name: "テニス部", slug: "tennis" },
      { id: "o2", name: "卓球部", slug: "takkyu" },
    ]);

    const result = await deleteAccountAction(
      INITIAL_PROFILE_FORM_STATE,
      new FormData(),
    );

    expect(deleteUser).not.toHaveBeenCalled();
    expect(result.error).toBe(
      "テニス部、卓球部 では、権限を配れるのがあなただけです。他の人に「権限の付与」を渡してから、再度お試しください",
    );
  });

  it("判定はセッションのユーザーに対して行う", async () => {
    await deleteAccountAction(INITIAL_PROFILE_FORM_STATE, new FormData());

    expect(findSoleGranterOrganizations).toHaveBeenCalledWith("u1");
  });

  it("問題なければ確認メールを送り、その旨を返す", async () => {
    const result = await deleteAccountAction(
      INITIAL_PROFILE_FORM_STATE,
      new FormData(),
    );

    expect(deleteUser).toHaveBeenCalledWith({
      body: { callbackURL: "/login" },
      headers: expect.any(Headers),
    });
    expect(result).toEqual({
      error: null,
      notice:
        "確認メールを送信しました。ログイン中のこのブラウザでリンクを開くと削除されます",
    });
  });

  it("Better Auth が失敗したら文言に写して返す", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, { body: { code: "UNAUTHORIZED" } });
    deleteUser.mockRejectedValue(apiError);

    const result = await deleteAccountAction(
      INITIAL_PROFILE_FORM_STATE,
      new FormData(),
    );

    expect(result.notice).toBeNull();
    expect(result.error).toBe(
      "処理に失敗しました。時間をおいて再度お試しください",
    );
  });
});
```

- [ ] **Step 18: テストが落ちることを確認する**

Run: `pnpm vitest run src/features/user/delete-account/handler.test.ts`
Expected: FAIL。`./handler` が存在しない。

- [ ] **Step 19: `delete-account/handler.ts` を書く**

```ts
"use server";

import { Effect, Exit } from "effect";
import { headers } from "next/headers";
import { findSoleGranterOrganizations } from "@/shared/authz/sole-granter";
import { auth } from "@/shared/lib/auth";
import { requireSession } from "@/shared/middleware/require-session";
import { profileErrorFormState } from "../effect-to-form-state";
import type { ProfileFormState } from "../state";
import { soleGranterMessage } from "./domain";
import { deleteAccount } from "./usecase";

export const deleteAccountAction = async (
  _prevState: ProfileFormState,
  _formData: FormData,
): Promise<ProfileFormState> => {
  // ページで確認済みでも Server Action は独立した入口なので、ここでも呼ぶ。
  const session = await requireSession();

  // 孤児化ガードの先出し。境界は auth.ts の beforeDelete フックのほうで、
  // ここで弾くのは「メールを開いてリンクを踏んだ後で初めて断られる」
  // という体験にしないため。
  const soleGranterOrganizations = await findSoleGranterOrganizations(
    session.user.id,
  );
  if (soleGranterOrganizations.length > 0) {
    return {
      error: soleGranterMessage(soleGranterOrganizations),
      notice: null,
    };
  }

  const exit = await Effect.runPromiseExit(
    deleteAccount((input) => auth.api.deleteUser(input), await headers()),
  );

  if (Exit.isFailure(exit)) {
    return profileErrorFormState(exit.cause);
  }

  // sendDeleteAccountVerification が設定されているため、この時点では
  // まだ削除されていない。
  return {
    error: null,
    notice:
      "確認メールを送信しました。ログイン中のこのブラウザでリンクを開くと削除されます",
  };
};
```

- [ ] **Step 20: テストが通ることを確認する**

Run: `pnpm vitest run src/features/user/delete-account/handler.test.ts`
Expected: PASS（5 件）

- [ ] **Step 21: `auth.ts` に deleteUser の設定を足す**

`src/shared/lib/auth.ts` の import に足す。

```ts
import { APIError } from "better-auth/api";
import { findSoleGranterOrganizations } from "@/shared/authz/sole-granter";
import { buildDeleteAccountEmail } from "@/shared/lib/auth-delete-account-email";
```

`user` の設定に `deleteUser` を足す（Task 6 で足した `changeEmail` の後ろ）。

```ts
  user: {
    ...authUserConfig,
    changeEmail: { enabled: true },
    deleteUser: {
      // 既定では無効で、有効にしないと deleteUser が 404 を返す。
      enabled: true,
      sendDeleteAccountVerification: async ({ user, url }) => {
        await getMailer().send(
          buildDeleteAccountEmail({
            from: resolveMailFrom(process.env),
            to: { email: user.email, name: user.name },
            url,
          }),
        );
      },
      // 組織の孤児化ガードの本体。features/user/delete-account の
      // Server Action でも同じ判定をしているが、境界はこちら。
      // 確認メールのリンク（/api/auth/delete-user/callback）は Server Action を
      // 経由しない別の入口で、Better Auth はそちらでも beforeDelete を呼ぶ。
      //
      // ここで組織名を出さないのは、この応答が API のエラーとして返るため。
      // 直し方の案内は画面側（先出しのガード）が受け持つ。
      beforeDelete: async (user) => {
        const organizations = await findSoleGranterOrganizations(user.id);
        if (organizations.length > 0) {
          throw new APIError("BAD_REQUEST", {
            message:
              "権限を配れるのがあなただけの組織があるため、削除できません",
            code: "SOLE_GRANTER_ORGANIZATION_EXISTS",
          });
        }
      },
    },
  },
```

- [ ] **Step 22: 型と既存テストを確認する**

Run: `pnpm typecheck`
Expected: エラー無し

Run: `pnpm vitest run src/shared`
Expected: PASS

- [ ] **Step 23: `DeleteAccountForm.test.tsx` を書く（失敗する）**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProfileFormAction } from "@/features/user/state";
import { DeleteAccountForm } from "./DeleteAccountForm";

const noopAction: ProfileFormAction = async () => ({
  error: null,
  notice: null,
});

describe("DeleteAccountForm", () => {
  it("削除ボタンがある", () => {
    render(<DeleteAccountForm action={noopAction} />);

    expect(
      screen.getByRole("button", { name: "アカウントを削除" }),
    ).toBeInTheDocument();
  });

  it("この場では削除されず、メールのリンクで完了することを伝える", () => {
    render(<DeleteAccountForm action={noopAction} />);

    expect(
      screen.getByText(
        "確認メールのリンクを開くまで削除されません。削除すると所属している組織からも外れ、元に戻せません",
      ),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 24: テストが落ちることを確認する**

Run: `pnpm vitest run src/components/profile/DeleteAccountForm.test.tsx`
Expected: FAIL。`./DeleteAccountForm` が存在しない。

- [ ] **Step 25: `DeleteAccountForm.tsx` を書く**

```tsx
"use client";

import { useActionState } from "react";
import {
  INITIAL_PROFILE_FORM_STATE,
  type ProfileFormAction,
} from "@/features/user/state";

/**
 * 押しても削除は起きず、確認メールが送られるだけ。そのため
 * window.confirm による二重確認は置かない。誤って押しても、
 * メールのリンクを開かなければ何も起きない。
 */
export function DeleteAccountForm({ action }: { action: ProfileFormAction }) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_PROFILE_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-2">
      <p className="text-xs text-slate-500">
        確認メールのリンクを開くまで削除されません。削除すると所属している組織からも外れ、元に戻せません
      </p>

      {state.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state.notice !== null && (
        <p role="status" className="text-sm text-emerald-700">
          {state.notice}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 disabled:opacity-50"
      >
        {pending ? "送信中..." : "アカウントを削除"}
      </button>
    </form>
  );
}
```

- [ ] **Step 26: テストが通ることを確認する**

Run: `pnpm vitest run src/components/profile/DeleteAccountForm.test.tsx`
Expected: PASS

- [ ] **Step 27: `/profile` に「アカウントの削除」節を足す**

`src/app/profile/page.tsx` の import に足す。

```tsx
import { DeleteAccountForm } from "@/components/profile/DeleteAccountForm";
import { deleteAccountAction } from "@/features/user/delete-account/handler";
```

「セキュリティ」節の後ろ（ページの末尾）に足す。

```tsx
        <section className="space-y-4 rounded border border-red-200 bg-white px-5 py-4">
          <h2 className="text-sm font-bold text-red-700">アカウントの削除</h2>
          <DeleteAccountForm action={deleteAccountAction} />
        </section>
```

- [ ] **Step 28: 全体を確認してコミットする**

Run: `pnpm typecheck && pnpm vitest run && pnpm lint`
Expected: エラー無し、全 PASS

```bash
git add src/shared/authz/sole-granter.ts src/shared/authz/sole-granter.test.ts \
        src/shared/lib/auth-delete-account-email.ts \
        src/shared/lib/auth-delete-account-email.test.ts \
        src/shared/lib/auth.ts src/features/user/delete-account \
        src/components/profile/DeleteAccountForm.tsx \
        src/components/profile/DeleteAccountForm.test.tsx \
        src/app/profile/page.tsx
git commit -m "feat(user): let a user delete their account"
```

コミット本文には次を含める。

```
OrganizationUser cascades on user delete, so removing the only person
holding user.grant would leave an organization nobody can ever grant in
again -- unfixable from inside the app. The guard refuses and names the
organizations, so the user knows what to hand over first.

That guard runs twice on purpose. beforeDelete is the boundary, because
the emailed link hits delete-user/callback without passing through the
Server Action. The Server Action checks first only so the refusal arrives
before the user opens their mail, not after.

The email flow is what lets a Google-only account delete itself: password
confirmation would force it to set a password first.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 10: ヘッダーのユーザーメニュー

ユーザー名を押すとメニューが開き、プロフィール・所属組織・ログアウトを選べるようにする。
ログアウトはヘッダーの並びから、このメニューの中へ移す。

**設計からの変更点（1 点）。** spec は `role="menu"` / `role="menuitem"` を書いているが、
**開閉の disclosure パターン（`aria-expanded` + `aria-controls`）で作る。**
`role="menu"` は矢印キーでの項目移動を前提とした規約で、それを実装せずに
役割名だけ付けると、支援技術には「メニューだ」と伝わるのに操作方法が伴わない。
中途半端に名乗るより、リンクの並びとして正直に見せるほうが読み上げも操作も素直になる。
`aria-expanded` による開閉の伝達は変わらず行う。

**Files:**
- Create: `src/components/layout/UserMenu.tsx`
- Create: `src/components/layout/UserMenu.test.tsx`
- Modify: `src/components/auth/LogoutButton.tsx`
- Modify: `src/components/layout/AppHeader.tsx`
- Modify: `src/components/layout/AppHeader.test.tsx`
- Modify: `AppHeader` を描画する全ページ（`userEmail` を渡す）

**Interfaces:**
- Consumes: `LogoutButton`
- Produces:
  - `UserMenu({ userName, userEmail }: { userName: string; userEmail: string })`
  - `AppHeader` の props に `userEmail: string` が加わる（必須）

- [ ] **Step 1: `UserMenu.test.tsx` を書く（失敗する）**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UserMenu } from "./UserMenu";

// LogoutButton は authClient / useRouter に依存するクライアントコンポーネントで、
// テスト環境ではルーターが無いためモジュールごと差し替える。
// ログアウトの分岐そのものは LogoutButton.test.tsx が持つ。
vi.mock("@/components/auth/LogoutButton", () => ({
  LogoutButton: () => <button type="button">ログアウト</button>,
}));

const renderMenu = () =>
  render(<UserMenu userName="竹添太郎" userEmail="taro@example.test" />);

describe("UserMenu", () => {
  it("閉じている間は項目を描画しない", () => {
    renderMenu();

    expect(screen.queryByRole("link", { name: "プロフィール" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ログアウト" })).toBeNull();
  });

  it("閉じている間は aria-expanded が false", () => {
    renderMenu();

    expect(
      screen.getByRole("button", { name: "竹添太郎" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("ユーザー名を押すと開き、aria-expanded が true になる", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "竹添太郎" }));

    expect(
      screen.getByRole("button", { name: "竹添太郎" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("開くとプロフィール・所属組織・ログアウトが出る", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "竹添太郎" }));

    expect(screen.getByRole("link", { name: "プロフィール" })).toHaveAttribute(
      "href",
      "/profile",
    );
    expect(screen.getByRole("link", { name: "所属組織" })).toHaveAttribute(
      "href",
      "/profile/orgs",
    );
    expect(
      screen.getByRole("button", { name: "ログアウト" }),
    ).toBeInTheDocument();
  });

  it("開くとメールアドレスが見出しに出る", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "竹添太郎" }));

    expect(screen.getByText("taro@example.test")).toBeInTheDocument();
  });

  it("もう一度押すと閉じる", async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole("button", { name: "竹添太郎" });
    await user.click(trigger);
    await user.click(trigger);

    expect(screen.queryByRole("link", { name: "プロフィール" })).toBeNull();
  });

  it("Escape で閉じ、フォーカスがトリガーへ戻る", async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole("button", { name: "竹添太郎" });
    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("link", { name: "プロフィール" })).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("外側をクリックすると閉じる", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <UserMenu userName="竹添太郎" userEmail="taro@example.test" />
        <button type="button">外側</button>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "竹添太郎" }));
    await user.click(screen.getByRole("button", { name: "外側" }));

    expect(screen.queryByRole("link", { name: "プロフィール" })).toBeNull();
  });

  it("メニューの中をクリックしても閉じない", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "竹添太郎" }));
    await user.click(screen.getByText("taro@example.test"));

    expect(
      screen.getByRole("link", { name: "プロフィール" }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm vitest run src/components/layout/UserMenu.test.tsx`
Expected: FAIL。`./UserMenu` が存在しない。

- [ ] **Step 3: `UserMenu.tsx` を書く**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogoutButton } from "@/components/auth/LogoutButton";

const PANEL_ID = "user-menu-panel";

/**
 * ヘッダーのユーザー名から開くメニュー。
 *
 * このコンポーネントは開閉の状態しか持たない。useRouter も authClient も
 * 触らないのは、ログアウトの処理を LogoutButton に残しておくため。
 * 16 個のページテストが @/components/auth/LogoutButton を vi.mock して
 * おり、処理をこちらへ移すとその全部を書き換えることになる。
 *
 * role="menu" は使わない。あれは矢印キーでの項目移動を伴う規約で、
 * それを実装せずに役割名だけ名乗ると、支援技術には「メニュー」と伝わるのに
 * 操作方法が伴わない。開閉を aria-expanded で伝えるだけの
 * disclosure として作り、中身はリンクの並びとして素直に見せる。
 */
export function UserMenu({
  userName,
  userEmail,
}: {
  userName: string;
  userEmail: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        // 閉じた先でフォーカスが宙に浮かないよう、トリガーへ戻す。
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={PANEL_ID}
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-1 rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-100"
      >
        {userName}
        <span aria-hidden="true" className="text-xs text-slate-400">
          ▾
        </span>
      </button>

      {/* 閉じているときは描画しない。hidden で隠すだけだと、
          リンクがフォーカス順に残ってタブ移動で踏めてしまう。 */}
      {open && (
        <div
          id={PANEL_ID}
          className="absolute right-0 z-10 mt-1 w-56 rounded border border-slate-200 bg-white py-1 shadow"
        >
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="truncate text-sm font-medium text-slate-800">
              {userName}
            </p>
            <p className="truncate text-xs text-slate-500">{userEmail}</p>
          </div>

          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            プロフィール
          </Link>
          <Link
            href="/profile/orgs"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            所属組織
          </Link>

          {/* 区切りの下に単独で置く。移動のつもりで押し間違えたときの
              損失が他の項目より大きいため。 */}
          <div className="border-t border-slate-100 px-3 py-2">
            <LogoutButton />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm vitest run src/components/layout/UserMenu.test.tsx`
Expected: PASS（9 件）

- [ ] **Step 5: `LogoutButton` をメニュー項目の見た目にする**

`src/components/auth/LogoutButton.tsx` の返り値だけを直す。処理には触らない。

```tsx
  return (
    <div className="space-y-1">
      {error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="w-full text-left text-sm text-slate-700 disabled:opacity-50"
      >
        {pending ? "ログアウト中..." : "ログアウト"}
      </button>
    </div>
  );
```

- [ ] **Step 6: 既存の LogoutButton のテストが通ることを確認する**

Run: `pnpm vitest run src/components/auth/LogoutButton.test.tsx`
Expected: PASS（見た目のクラスだけを変えたので、挙動のテストは影響を受けない）

- [ ] **Step 7: `AppHeader` を差し替える**

`src/components/layout/AppHeader.tsx`。`LogoutButton` の import を落とし、
`UserMenu` を使う。

```tsx
import Link from "next/link";
import { UserMenu } from "@/components/layout/UserMenu";

export type Crumb = {
  label: string;
  /** 省略した場合は現在地としてリンクにしない。 */
  href?: string;
};

export function AppHeader({
  crumbs,
  userName,
  userEmail,
}: {
  crumbs: Crumb[];
  userName: string;
  userEmail: string;
}) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
      <nav aria-label="パンくず" className="flex items-center gap-2 text-sm">
        {crumbs.map((crumb, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: crumbs はレンダーごとに固定で並び替えもしないためインデックスで安全
          <span key={index} className="flex items-center gap-2">
            {index > 0 && <span className="text-slate-400">/</span>}
            {crumb.href ? (
              <Link href={crumb.href} className="text-slate-600 underline">
                {crumb.label}
              </Link>
            ) : (
              <span className="font-bold text-slate-800">{crumb.label}</span>
            )}
          </span>
        ))}
      </nav>
      <UserMenu userName={userName} userEmail={userEmail} />
    </header>
  );
}
```

- [ ] **Step 8: `AppHeader.test.tsx` を直す**

モックの対象を `LogoutButton` から `UserMenu` へ変える。`UserMenu` が
`useState` / `useEffect` しか使わないなら本物でも動くが、このファイルは
パンくずの描画だけを見たいので差し替える。

先頭の `vi.mock` を次に置き換える。

```tsx
// UserMenu 自体の挙動（開閉・Escape・外側クリック）は UserMenu.test.tsx で
// 検証済みのため、ここでは AppHeader のパンくず描画ロジックだけに集中できる
// ようモジュールごと差し替える。
vi.mock("@/components/layout/UserMenu", () => ({
  UserMenu: ({ userName }: { userName: string }) => (
    <button type="button">{userName}</button>
  ),
}));
```

既存の 6 か所の `render(<AppHeader ... />)` すべてに
`userEmail="taro@example.test"` を足す。

「ユーザー名が表示される」のテストを、ボタンになったことが分かる形に直す。

```tsx
  it("ユーザー名はメニューを開くボタンとして描画される", () => {
    render(
      <AppHeader
        crumbs={[{ label: "組織一覧" }]}
        userName="竹添太郎"
        userEmail="taro@example.test"
      />,
    );

    expect(
      screen.getByRole("button", { name: "竹添太郎" }),
    ).toBeInTheDocument();
  });
```

- [ ] **Step 9: 型エラーで残りの呼び出し側を洗い出す**

Run: `pnpm typecheck`
Expected: FAIL。`AppHeader` を描画している各ページで `userEmail` が
足りないという型エラーが出る。**この一覧が、直すべきファイルの全部。**

- [ ] **Step 10: 各ページに `userEmail` を渡す**

型エラーが出た各ページで、`userName={session.user.name}` の直後に
`userEmail={session.user.email}` を足す。`requireOrganization` を使うページも
`session` は同じ形なので、書き方は変わらない。

対象は次のファイル（`pnpm typecheck` の出力と突き合わせること）。

```
src/app/page.tsx
src/app/orgs/new/page.tsx
src/app/orgs/[slug]/page.tsx
src/app/orgs/[slug]/edit/page.tsx
src/app/orgs/[slug]/members/page.tsx
src/app/orgs/[slug]/users/page.tsx
src/app/orgs/[slug]/users/[userId]/permissions/page.tsx
src/app/orgs/[slug]/tournaments/new/page.tsx
src/app/orgs/[slug]/tournaments/[tournamentId]/page.tsx
src/app/orgs/[slug]/tournaments/[tournamentId]/edit/page.tsx
src/app/orgs/[slug]/tournaments/[tournamentId]/matches/page.tsx
src/app/orgs/[slug]/tournaments/[tournamentId]/results/page.tsx
src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/new/page.tsx
src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/page.tsx
src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/edit/page.tsx
src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/league/page.tsx
src/app/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup/page.tsx
src/app/profile/page.tsx
src/app/profile/orgs/page.tsx
```

例（`src/app/page.tsx`）:

```tsx
      <AppHeader
        crumbs={[{ label: "組織" }]}
        userName={session.user.name}
        userEmail={session.user.email}
      />
```

- [ ] **Step 11: 型が通ることを確認する**

Run: `pnpm typecheck`
Expected: エラー無し

- [ ] **Step 12: 既存のページテストが壊れていないことを確認する**

Run: `pnpm vitest run`
Expected: 全 PASS

各ページのテストは `@/components/auth/LogoutButton` を `vi.mock` したままだが、
`LogoutButton` は残っており `UserMenu` がそれを import するので、モックは
そのまま効く。閉じている間はメニューの中身を描画しないため、
モックしたボタンは画面に出ないが、どのページテストもそれを見ていない。

- [ ] **Step 13: `pnpm dev` で実際に動かして確認する**

`.env` に `BYPASS_AUTH=1` を設定していない状態（通常のログイン）で確認する。
バイパスでは `auth.api.*` が `UNAUTHORIZED` になり、書き込みが全て失敗する。

```bash
pnpm dev
```

ブラウザで次を確認する。

1. 任意のページのヘッダーでユーザー名を押す → メニューが開く
2. メニューにユーザー名・メールアドレス・プロフィール・所属組織・ログアウトが並ぶ
3. Escape で閉じる。メニューの外をクリックしても閉じる
4. 「プロフィール」→ `/profile` が開き、5 つの節が出る
5. 表示名を変えて保存 → 「表示名を変更しました」が出て、ヘッダーの名前も変わる
6. 「所属組織」→ `/profile/orgs` が開き、権限が説明つきで出る
7. メールアドレスの変更を送信 → コンソールメーラーに 2 通（新アドレス宛の確認、
   旧アドレス宛の通知）が出る
8. アカウント削除を押す → 唯一の `user.grant` 保持者なら組織名つきで断られる

- [ ] **Step 14: コミットする**

Run: `pnpm typecheck && pnpm vitest run && pnpm lint`
Expected: エラー無し、全 PASS

```bash
git add src/components/layout/UserMenu.tsx src/components/layout/UserMenu.test.tsx \
        src/components/layout/AppHeader.tsx src/components/layout/AppHeader.test.tsx \
        src/components/auth/LogoutButton.tsx src/app
git commit -m "feat(layout): put profile links and logout behind a user menu"
```

コミット本文には次を含める。

```
UserMenu holds nothing but open/closed state. LogoutButton keeps owning
the sign-out call, because 16 page tests vi.mock that module path and
moving the useRouter/authClient dependency would rewrite all of them.

Built as a disclosure rather than role="menu": that role implies arrow-key
navigation, and claiming it without implementing it tells assistive tech
this behaves like a menu when it does not.

Closed means not rendered, not hidden -- hidden links stay in the tab
order and can be reached without the menu being open.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## 完了時の確認

すべてのタスクが終わったら、次を確認する。

- [ ] `pnpm typecheck` がエラー無し
- [ ] `pnpm vitest run` が全 PASS
- [ ] `pnpm lint` の指摘が CRLF 由来の既存ノイズだけ
- [ ] `pnpm build` が通る
- [ ] 設計 (`docs/superpowers/specs/2026-09-07-user-profile-design.md`) の
      「対象外」に挙げたもの（username の変更、Google 以外のプロバイダ、
      プロフィール画像、組織からの脱退、セッション一覧）に手を出していない

その後、`superpowers:finishing-a-development-branch` に従って
worktree の成果を `main` へ統合する。
