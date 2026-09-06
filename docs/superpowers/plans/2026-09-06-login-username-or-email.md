# ログイン識別子のユーザー名対応 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ログイン画面の識別子欄に、ユーザー名とメールアドレスのどちらを入力してもログインできるようにする。

**Architecture:** better-auth の `username` プラグインを、このプロジェクトのユーザー名規則へ合わせて包んだうえで `betterAuth()` に足し、`/sign-in/username` を使えるようにする。クライアントは入力に `"@"` が含まれるかで識別子を判別し、`authClient.signIn.email` と `authClient.signIn.username` を呼び分ける。DB 変更・マイグレーションは不要。

**Tech Stack:** Next.js 16 / React 19 / better-auth 1.7 / Prisma 7 / Zod 4 / Effect 3 / Vitest / Biome

設計: `docs/superpowers/specs/2026-09-06-login-username-or-email-design.md`

## Global Constraints

- パッケージマネージャは **pnpm**。`pnpm test` / `pnpm typecheck` / `pnpm lint` を使う。
- ワークツリーを新しく作った場合は、最初に `pnpm exec next typegen` を実行し、本体のチェックアウトから `.env` をコピーする。これをしないと `PageProps` 等の型が無く `pnpm typecheck` が通らない。
- Biome は Windows チェックアウトで CRLF 由来の lint エラーを全ファイルに出す。lint の合否は自分が触ったファイルの内容で判断する。
- ユーザー名の規則（文字種・長さ）の出どころは `src/shared/lib/username.ts` の定数ただ 1 か所。フォーム側・better-auth 側のどちらにも規則をベタ書きしない。
- ユーザーに見える文言はすべて日本語。既存ファイルのコメントは日本語で、「なぜそうしたか」を書く濃度に合わせる。
- `src/features/` 配下に `.tsx` を置かない（画面は `src/components/` に置く）。
- `src/shared/lib/auth.ts` は import すると `betterAuth()` が Prisma アダプタを組み立てるため、テストから import しない。

---

### Task 1: ログイン識別子の判別

`"@"` を含むかどうかで識別子をメールアドレスとユーザー名に振り分ける純粋なスキーマを作る。この時点では誰も使わないので、単体で完結する。

**Files:**
- Create: `src/features/auth/login/identifier.ts`
- Create: `src/features/auth/login/identifier.test.ts`

**Interfaces:**
- Consumes: `normalizeEmail`（`@/shared/lib/email`）、`usernameSchema` / `normalizeUsername`（`@/shared/lib/username`）
- Produces:
  - `type LoginIdentifier = { readonly kind: "email"; readonly email: string } | { readonly kind: "username"; readonly username: string }`
  - `classifyLoginIdentifier: (value: string) => LoginIdentifier`
  - `loginIdentifierSchema`: 入力 `string`、出力 `LoginIdentifier` の Zod スキーマ

- [ ] **Step 1: 失敗するテストを書く**

`src/features/auth/login/identifier.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loginIdentifierSchema } from "./identifier";

describe("loginIdentifierSchema", () => {
  it("アットマークを含む入力をメールアドレスとして扱い、正規化する", () => {
    const result = loginIdentifierSchema.safeParse(" User@Example.COM ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ kind: "email", email: "user@example.com" });
    }
  });

  it("アットマークを含まない入力をユーザー名として扱い、小文字に揃える", () => {
    const result = loginIdentifierSchema.safeParse(" TakeZoux2 ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ kind: "username", username: "takezoux2" });
    }
  });

  it("ハイフンとアンダースコアを含むユーザー名を通す", () => {
    // プラグイン既定の validator（"." を許し "-" を許さない）ではなく、
    // このプロジェクトの usernameSchema が効いていることの確認。
    expect(loginIdentifierSchema.safeParse("take-zoux_2").success).toBe(true);
  });

  it("空欄は識別子の文言で弾く", () => {
    const result = loginIdentifierSchema.safeParse("   ");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "ユーザー名またはメールアドレスを入力してください",
      );
    }
  });

  it("アットマークを含むが形式が不正なものはメールアドレスの文言で弾く", () => {
    const result = loginIdentifierSchema.safeParse("nope@");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "メールアドレスの形式が正しくありません",
      );
    }
  });

  it("使えない文字を含むユーザー名はユーザー名の文言で弾く", () => {
    const result = loginIdentifierSchema.safeParse("take zoux");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "ユーザー名は半角英数字・アンダースコア・ハイフンのみ使えます",
      );
    }
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/features/auth/login/identifier.test.ts`
Expected: FAIL（`Failed to resolve import "./identifier"`）

- [ ] **Step 3: 実装を書く**

`src/features/auth/login/identifier.ts`:

```ts
import { z } from "zod";
import { normalizeEmail } from "@/shared/lib/email";
import { normalizeUsername, usernameSchema } from "@/shared/lib/username";

/** ログイン識別子。メールアドレスかユーザー名のどちらか。 */
export type LoginIdentifier =
  | { readonly kind: "email"; readonly email: string }
  | { readonly kind: "username"; readonly username: string };

/** メールアドレスと見なす目印。usernameSchema はこの文字を許さない。 */
const EMAIL_MARKER = "@";

/**
 * 識別子をメールアドレスとユーザー名に振り分ける。純粋関数。
 *
 * 判別を "@" の有無だけに絞れるのは、usernameSchema が "@" を許さないため。
 * 「メール形式として妥当か」で振り分けると、打ち間違えたメールアドレスが
 * ユーザー名として扱われ、形式エラーではなく資格情報の誤りとして返ってしまう。
 *
 * 正規化はどちらも小文字化だが、規則の持ち主が違う（email.ts と username.ts）ので
 * それぞれの関数を通す。
 */
export const classifyLoginIdentifier = (value: string): LoginIdentifier =>
  value.includes(EMAIL_MARKER)
    ? { kind: "email", email: normalizeEmail(value) }
    : { kind: "username", username: normalizeUsername(value) };

const emailIdentifierSchema = z.object({
  kind: z.literal("email"),
  email: z.email("メールアドレスの形式が正しくありません"),
});

const usernameIdentifierSchema = z.object({
  kind: z.literal("username"),
  // signup と同じ規則を通すので、文言も signup と揃う。
  username: usernameSchema,
});

/**
 * 識別子 1 つを LoginIdentifier に写す。
 *
 * 先に振り分けてから種別ごとに検証するので、エラー文言も種別ごとのものが出る
 * （union で受けると「どちらにも当てはまらない」形の分かりにくい文言になる）。
 */
export const loginIdentifierSchema = z
  .string()
  .transform((raw) => raw.trim())
  .pipe(z.string().min(1, "ユーザー名またはメールアドレスを入力してください"))
  .transform(classifyLoginIdentifier)
  .pipe(
    z.discriminatedUnion("kind", [
      emailIdentifierSchema,
      usernameIdentifierSchema,
    ]),
  );
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run src/features/auth/login/identifier.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5: コミット**

```bash
git add src/features/auth/login/identifier.ts src/features/auth/login/identifier.test.ts
git commit -m "feat(auth): classify login identifier as email or username"
```

---

### Task 2: username プラグインのラッパー

better-auth の `username` プラグインを、このプロジェクトの規則へ合わせて包む。`auth.ts` にはまだ足さないので、この時点で既存の挙動は変わらない。

**Files:**
- Modify: `src/shared/lib/username.ts`（`MIN_USERNAME_LENGTH` を切り出す）
- Create: `src/shared/lib/auth-username-plugin.ts`
- Create: `src/shared/lib/auth-username-plugin.test.ts`

**Interfaces:**
- Consumes: `usernameAdditionalField`（`@/shared/lib/auth-user-fields`）、`MAX_USERNAME_LENGTH` / `USERNAME_PATTERN`（`@/shared/lib/username`）
- Produces:
  - `MIN_USERNAME_LENGTH: number`（`@/shared/lib/username` から）
  - `usernamePlugin`: `betterAuth({ plugins })` に渡すプラグインオブジェクト

- [ ] **Step 1: `MIN_USERNAME_LENGTH` を切り出す**

`src/shared/lib/username.ts` の `MAX_USERNAME_LENGTH` の宣言の直前に足す:

```ts
/** username の長さの下限。プラグイン側の既定（3）ではなくこちらを使う。 */
export const MIN_USERNAME_LENGTH = 1;
```

同ファイルの `usernameSchema` の `.min(1, "ユーザー名を入力してください")` を
`.min(MIN_USERNAME_LENGTH, "ユーザー名を入力してください")` に置き換える。

- [ ] **Step 2: 失敗するテストを書く**

`src/shared/lib/auth-username-plugin.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { usernameAdditionalField } from "./auth-user-fields";
import { usernamePlugin } from "./auth-username-plugin";
import { MAX_USERNAME_LENGTH, MIN_USERNAME_LENGTH } from "./username";

describe("usernamePlugin", () => {
  it("ユーザー名でのサインインの口を持つ", () => {
    expect(usernamePlugin.endpoints.signInUsername).toBeDefined();
  });

  it("displayUsername の列は生やさない", () => {
    // User テーブルに displayUsername は無い。生えるとアダプタが
    // 存在しない列へ書きに行く。
    expect(usernamePlugin.schema.user.fields).not.toHaveProperty(
      "displayUsername",
    );
  });

  it("username の宣言は auth-user-fields.ts のものを保つ", () => {
    // db/schema.mjs の getFields は user.additionalFields の後に
    // プラグインのフィールドを spread するため、包み直さないと
    // required と validator が静かに外れる。
    const field = usernamePlugin.schema.user.fields.username;
    expect(field.required).toBe(true);
    expect(field.validator).toBe(usernameAdditionalField.validator);
    expect(field.transform).toBe(usernameAdditionalField.transform);
  });

  it("プラグイン自身の一意制約は残す", () => {
    // サインイン時の username 検索と重複チェックがこれに乗る。
    expect(usernamePlugin.schema.user.fields.username.unique).toBe(true);
  });

  it("長さの規則を username.ts の定数から取る", () => {
    expect(usernamePlugin.options?.minUsernameLength).toBe(MIN_USERNAME_LENGTH);
    expect(usernamePlugin.options?.maxUsernameLength).toBe(MAX_USERNAME_LENGTH);
  });

  it("文字種の規則を usernameSchema に揃える", async () => {
    const validate = usernamePlugin.options?.usernameValidator;
    expect(validate).toBeDefined();
    if (!validate) return;
    // 既定の validator は "." を許し "-" を許さない。逆になっていることを見る。
    expect(await validate("take-zoux_2")).toBe(true);
    expect(await validate("take.zoux")).toBe(false);
    expect(await validate("たけぞう")).toBe(false);
  });
});
```

- [ ] **Step 3: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/shared/lib/auth-username-plugin.test.ts`
Expected: FAIL（`Failed to resolve import "./auth-username-plugin"`）

- [ ] **Step 4: 実装を書く**

`src/shared/lib/auth-username-plugin.ts`:

```ts
import type { BetterAuthPlugin } from "better-auth";
import { username } from "better-auth/plugins/username";
import { usernameAdditionalField } from "@/shared/lib/auth-user-fields";
import {
  MAX_USERNAME_LENGTH,
  MIN_USERNAME_LENGTH,
  USERNAME_PATTERN,
} from "@/shared/lib/username";

/**
 * 素のプラグイン。既定値のままだとこのプロジェクトの規則と食い違う。
 * - 文字種の既定は /^[a-zA-Z0-9_.]+$/ で、"." を許し "-" を許さない
 * - 長さの既定は 3〜30 文字
 * どちらも signup が受け付けた名前を後からログインで弾く向きにずれるため、
 * username.ts の定数で上書きする。
 *
 * displayUsername を切っているのは、User テーブルにその列が無いため。
 */
const base = username({
  displayUsername: false,
  minUsernameLength: MIN_USERNAME_LENGTH,
  maxUsernameLength: MAX_USERNAME_LENGTH,
  usernameValidator: (value) => USERNAME_PATTERN.test(value),
});

/**
 * betterAuth({ plugins }) に渡すプラグイン。
 *
 * schema.user.fields.username を usernameAdditionalField で包み直している。
 * better-auth/dist/db/schema.mjs の getFields が
 *   { ...coreSchema, ...user.additionalFields, ...plugin.schema.user.fields }
 * の順で spread するため、素のまま渡すとプラグインの required: false が
 * 既存の required: true と zod validator を上書きしてしまう。そうなると
 * username を省いた直接 POST が API の検証を素通りし、NOT NULL 制約まで
 * 落ちてから FAILED_TO_CREATE_USER になる。
 *
 * unique / sortable / returned はプラグイン側の値を残す（サインイン時の
 * username 検索と重複チェックがそれに乗っている）。
 */
export const usernamePlugin = {
  ...base,
  schema: {
    ...base.schema,
    user: {
      ...base.schema.user,
      fields: {
        ...base.schema.user.fields,
        username: {
          ...base.schema.user.fields.username,
          ...usernameAdditionalField,
        },
      },
    },
  },
} satisfies BetterAuthPlugin;
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm exec vitest run src/shared/lib/auth-username-plugin.test.ts src/shared/lib/username.test.ts`
Expected: 全 PASS

`satisfies BetterAuthPlugin` で型エラーが出た場合は `satisfies` を外さず、
`base.schema.user.fields.username` の型（`node_modules/better-auth/dist/plugins/username/schema.d.mts`）
と `usernameAdditionalField` の型を突き合わせて原因を潰すこと。`as` での握り潰しは不可。

- [ ] **Step 6: コミット**

```bash
git add src/shared/lib/username.ts src/shared/lib/auth-username-plugin.ts src/shared/lib/auth-username-plugin.test.ts
git commit -m "feat(auth): wrap better-auth username plugin with project rules"
```

---

### Task 3: エラーコードの写像と文言

プラグインが返すエラーコードを `AuthError` へ写し、文言をユーザー名対応に直す。

**Files:**
- Modify: `src/shared/errors/auth-error.ts`
- Modify: `src/shared/errors/auth-error.test.ts`
- Modify: `src/features/auth/messages.ts`
- Modify: `src/features/auth/messages.test.ts`

**Interfaces:**
- Produces: `InvalidUsername`（`Data.TaggedError`）と、`AuthError` union への追加

- [ ] **Step 1: 失敗するテストを書く**

`src/shared/errors/auth-error.test.ts` の
「`FAILED_TO_CREATE_USER` を `UsernameAlreadyExists` に写像する」の `it` ブロックを、
次の 4 つの `it` に置き換える:

```ts
  it("INVALID_USERNAME_OR_PASSWORD を InvalidCredentials に写像する", () => {
    // /sign-in/username が返すコード。/sign-in/email の
    // INVALID_EMAIL_OR_PASSWORD と同じ扱いにする。
    expect(toAuthError("INVALID_USERNAME_OR_PASSWORD", null)._tag).toBe(
      "InvalidCredentials",
    );
  });

  it("USERNAME_IS_ALREADY_TAKEN を UsernameAlreadyExists に写像する", () => {
    // username プラグインが /sign-up/email の前段で重複を弾いたときのコード。
    expect(toAuthError("USERNAME_IS_ALREADY_TAKEN", null)._tag).toBe(
      "UsernameAlreadyExists",
    );
  });

  it("ユーザー名の形式エラーを InvalidUsername に写像する", () => {
    for (const code of [
      "USERNAME_TOO_SHORT",
      "USERNAME_TOO_LONG",
      "INVALID_USERNAME",
    ]) {
      expect(toAuthError(code, null)._tag).toBe("InvalidUsername");
    }
  });

  it("FAILED_TO_CREATE_USER は UnexpectedAuthError になる", () => {
    // プラグイン導入前は username 重複の唯一の経路だったが、今は
    // USERNAME_IS_ALREADY_TAKEN が先に返る。原因を断定できないので
    // 一般形に戻す。
    expect(toAuthError("FAILED_TO_CREATE_USER", null)._tag).toBe(
      "UnexpectedAuthError",
    );
  });
```

`src/features/auth/messages.test.ts` の
「ログイン失敗ではどちらが誤りか示さない」と「ユーザー名重複の可能性を伝える」の
2 つの `it` を、次の 3 つに置き換える:

```ts
  it("ログイン失敗ではどれが誤りか示さない", () => {
    const message = authErrorMessage(
      toAuthError("INVALID_EMAIL_OR_PASSWORD", null),
    );
    // ユーザー名でログインした人にも当てはまる文言にする。
    expect(message).toBe(
      "ユーザー名・メールアドレスまたはパスワードが正しくありません",
    );
  });

  it("ユーザー名重複を伝える", () => {
    expect(
      authErrorMessage(toAuthError("USERNAME_IS_ALREADY_TAKEN", null)),
    ).toBe("そのユーザー名は既に使われています。別の名前でお試しください");
  });

  it("ユーザー名の形式の不備を伝える", () => {
    expect(authErrorMessage(toAuthError("INVALID_USERNAME", null))).toBe(
      "ユーザー名の形式が正しくありません",
    );
  });
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/shared/errors/auth-error.test.ts src/features/auth/messages.test.ts`
Expected: FAIL（写像が `UnexpectedAuthError` になる／文言が古いまま）

- [ ] **Step 3: `auth-error.ts` を直す**

`UsernameAlreadyExists` クラスの直後に足す:

```ts
export class InvalidUsername extends Data.TaggedError("InvalidUsername")<{
  readonly code: string;
}> {}
```

`AuthError` union に `| InvalidUsername` を足す。

`toAuthError` の `switch` の `InvalidCredentials` の分岐に 1 行足す:

```ts
    case "INVALID_EMAIL_OR_PASSWORD":
    case "INVALID_USERNAME_OR_PASSWORD":
    case "USER_NOT_FOUND":
    case "CREDENTIAL_ACCOUNT_NOT_FOUND":
      return new InvalidCredentials({ code });
```

`FAILED_TO_CREATE_USER` の `case`（とその上の長いコメント）を削り、代わりに足す:

```ts
    // username プラグインが /sign-up/email の前段で重複を弾いたときのコード。
    // 以前は Prisma の P2002 が FAILED_TO_CREATE_USER として返るのを重複と
    // 見なしていたが、今は原因を推測せずに済む。
    case "USERNAME_IS_ALREADY_TAKEN":
      return new UsernameAlreadyExists({ code });
    // クライアント側の検証を通さない直接 POST か、プラグインのオプションが
    // usernameSchema からずれたときに返る。
    case "USERNAME_TOO_SHORT":
    case "USERNAME_TOO_LONG":
    case "INVALID_USERNAME":
      return new InvalidUsername({ code });
```

- [ ] **Step 4: `messages.ts` を直す**

`InvalidCredentials` の文言を差し替える:

```ts
    Match.tag(
      "InvalidCredentials",
      // どれが誤りかを示すとアカウントの存在を推測されるため、まとめた文言にする。
      // 識別子はユーザー名でもメールアドレスでもよいので両方を並べる。
      () => "ユーザー名・メールアドレスまたはパスワードが正しくありません",
    ),
```

`UsernameAlreadyExists` の文言とコメントを差し替える:

```ts
    Match.tag(
      "UsernameAlreadyExists",
      // プラグインが登録前に重複を弾いた結果なので、断定してよい。
      () => "そのユーザー名は既に使われています。別の名前でお試しください",
    ),
```

`WeakPassword` の直後に足す:

```ts
    Match.tag("InvalidUsername", () => "ユーザー名の形式が正しくありません"),
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm exec vitest run src/shared/errors/auth-error.test.ts src/features/auth/messages.test.ts`
Expected: 全 PASS

- [ ] **Step 6: コミット**

```bash
git add src/shared/errors/auth-error.ts src/shared/errors/auth-error.test.ts src/features/auth/messages.ts src/features/auth/messages.test.ts
git commit -m "feat(auth): map username plugin error codes"
```

---

### Task 4: better-auth への配線

サーバとクライアントにプラグインを足す。`/sign-in/username` が生えるだけで、既存の画面の動きは変わらない。

**Files:**
- Modify: `src/shared/lib/auth.ts`
- Modify: `src/shared/lib/auth-client.ts`

**Interfaces:**
- Consumes: `usernamePlugin`（Task 2）
- Produces: `authClient.signIn.username({ username, password, callbackURL })`

- [ ] **Step 1: `auth.ts` にプラグインを足す**

import を足す:

```ts
import { usernamePlugin } from "@/shared/lib/auth-username-plugin";
```

`plugins` の行とその上のコメントを差し替える:

```ts
  // usernamePlugin は /sign-in/username を生やす。中身（規則の上書きと
  // username フィールドの包み直し）は auth-username-plugin.ts にある。
  // nextCookies は Server Action から Cookie を書けるようにする。plugins 配列の
  // 最後に置く必要がある。
  plugins: [usernamePlugin, nextCookies()],
```

`user: authUserConfig` はそのまま残す（プラグイン側が同じ宣言を持つので、
どちらの spread が勝っても定義は変わらない）。

- [ ] **Step 2: `auth-client.ts` にクライアントプラグインを足す**

ファイル全体を次に差し替える:

```ts
"use client";

import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// baseURL を渡さない場合、リクエスト元と同じオリジンの /api/auth が使われる。
// usernameClient は signIn.username の型を生やすためのもの。displayUsername は
// サーバ側（auth-username-plugin.ts）と揃えないと user の型がずれる。
export const authClient = createAuthClient({
  plugins: [usernameClient({ displayUsername: false })],
});
```

- [ ] **Step 3: 型と既存テストが通ることを確認する**

Run: `pnpm typecheck`
Expected: エラー無しで終了（出力なし）

Run: `pnpm test`
Expected: 全 PASS（この時点ではまだ画面もスキーマも変えていない）

- [ ] **Step 4: コミット**

```bash
git add src/shared/lib/auth.ts src/shared/lib/auth-client.ts
git commit -m "feat(auth): wire username plugin into better-auth server and client"
```

---

### Task 5: ログイン経路のカットオーバー

スキーマ・ユースケース・画面を同時に識別子ベースへ切り替える。`loginSchema` の
フィールド名が変わるため、3 ファイルを 1 コミットにしないとツリーが型エラーで割れる。

**Files:**
- Modify: `src/features/auth/login/schema.ts`
- Modify: `src/features/auth/login/schema.test.ts`
- Modify: `src/features/auth/login/usecase.ts`
- Modify: `src/features/auth/login/usecase.test.ts`
- Modify: `src/components/auth/LoginForm.tsx`
- Modify: `src/components/auth/LoginForm.test.tsx`

**Interfaces:**
- Consumes: `loginIdentifierSchema`（Task 1）、`authClient.signIn.username`（Task 4）
- Produces:
  - `LoginInput = { identifier: LoginIdentifier; password: string }`
  - `SignInEmailCall = { readonly email: string; readonly password: string; readonly callbackURL: string }`
  - `SignInUsernameCall = { readonly username: string; readonly password: string; readonly callbackURL: string }`
  - `LoginPorts = { readonly signInEmail: AuthCallPort<SignInEmailCall>; readonly signInUsername: AuthCallPort<SignInUsernameCall> }`
  - `login: (ports: LoginPorts, input: LoginInput, callbackURL: string) => Effect.Effect<void, AuthError>`
  - 旧 `SignInPort` / `LoginCall` は削除する

- [ ] **Step 1: 失敗するテストを書く（schema）**

`src/features/auth/login/schema.test.ts` の全体を差し替える:

```ts
import { describe, expect, it } from "vitest";
import { loginSchema } from "./schema";

describe("loginSchema", () => {
  it("メールアドレスの入力を通す", () => {
    const result = loginSchema.safeParse({
      identifier: "user@example.com",
      password: "x",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.identifier).toEqual({
        kind: "email",
        email: "user@example.com",
      });
    }
  });

  it("ユーザー名の入力を通す", () => {
    const result = loginSchema.safeParse({
      identifier: "takezoux2",
      password: "x",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.identifier).toEqual({
        kind: "username",
        username: "takezoux2",
      });
    }
  });

  it("識別子が空だと弾く", () => {
    expect(
      loginSchema.safeParse({ identifier: "", password: "x" }).success,
    ).toBe(false);
  });

  it("パスワードが空だと弾く", () => {
    expect(
      loginSchema.safeParse({ identifier: "user@example.com", password: "" })
        .success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: 失敗するテストを書く（usecase）**

`src/features/auth/login/usecase.test.ts` の全体を差し替える:

```ts
import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import type { LoginPorts } from "./usecase";
import { login } from "./usecase";

const ports = (): LoginPorts => ({
  signInEmail: vi.fn().mockResolvedValue({ error: null }),
  signInUsername: vi.fn().mockResolvedValue({ error: null }),
});

// Effect への包み方と AuthError への写像そのものは
// src/shared/lib/auth-effect.test.ts が網羅している。ここでは login が
// 識別子の種別でポートを選び、失敗を素通しすることだけを見る。
describe("login", () => {
  it("メールアドレスならメールのポートだけを呼ぶ", async () => {
    const p = ports();
    const exit = await Effect.runPromiseExit(
      login(
        p,
        {
          identifier: { kind: "email", email: "user@example.com" },
          password: "password123",
        },
        "/login?verified=1",
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    // callbackURL は sendOnSignIn による再送メールのリンクに埋め込まれる
    // 戻り先。これが欠けると Better Auth は "/" を使ってしまう。
    expect(p.signInEmail).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "password123",
      callbackURL: "/login?verified=1",
    });
    expect(p.signInUsername).not.toHaveBeenCalled();
  });

  it("ユーザー名ならユーザー名のポートだけを呼ぶ", async () => {
    const p = ports();
    const exit = await Effect.runPromiseExit(
      login(
        p,
        {
          identifier: { kind: "username", username: "takezoux2" },
          password: "password123",
        },
        "/login?verified=1",
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    expect(p.signInUsername).toHaveBeenCalledWith({
      username: "takezoux2",
      password: "password123",
      callbackURL: "/login?verified=1",
    });
    expect(p.signInEmail).not.toHaveBeenCalled();
  });

  it("ユーザー名での資格情報の誤りを InvalidCredentials として返す", async () => {
    const p: LoginPorts = {
      signInEmail: vi.fn().mockResolvedValue({ error: null }),
      signInUsername: vi
        .fn()
        .mockResolvedValue({ error: { code: "INVALID_USERNAME_OR_PASSWORD" } }),
    };
    const exit = await Effect.runPromiseExit(
      login(
        p,
        {
          identifier: { kind: "username", username: "takezoux2" },
          password: "password123",
        },
        "/login?verified=1",
      ),
    );
    expect(failureTag(exit)).toBe("InvalidCredentials");
  });
});
```

- [ ] **Step 3: 失敗するテストを書く（LoginForm）**

`src/components/auth/LoginForm.test.tsx` に次の 3 点を反映する。

(1) モックに `username` を足す。ファイル冒頭のモック宣言を差し替える:

```tsx
const signInEmail = vi.fn();
const signInUsername = vi.fn();
const signInSocial = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock("@/shared/lib/auth-client", () => ({
  authClient: {
    signIn: {
      email: (...args: unknown[]) => signInEmail(...args),
      username: (...args: unknown[]) => signInUsername(...args),
      social: (...args: unknown[]) => signInSocial(...args),
    },
  },
}));
```

(2) 既存の 2 つの `beforeEach` に `signInUsername.mockReset();` を足し、
ファイル中のすべての `screen.getByLabelText("メールアドレス")` を
`screen.getByLabelText("ユーザー名またはメールアドレス")` に置き換える。

(3) ファイル末尾に新しい describe を足す:

```tsx
describe("LoginForm の識別子", () => {
  beforeEach(() => {
    signInEmail.mockReset();
    signInUsername.mockReset();
    signInSocial.mockReset();
    push.mockClear();
    refresh.mockClear();
  });

  const submit = (identifier: string) => {
    render(<LoginForm redirectTo="/orgs" />);
    fireEvent.change(screen.getByLabelText("ユーザー名またはメールアドレス"), {
      target: { value: identifier },
    });
    fireEvent.change(screen.getByLabelText("パスワード"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ログイン" }));
  };

  it("ユーザー名を入力するとユーザー名でサインインする", async () => {
    signInUsername.mockResolvedValue({ error: null });
    submit("takezoux2");

    await waitFor(() =>
      expect(signInUsername).toHaveBeenCalledWith(
        expect.objectContaining({ username: "takezoux2" }),
      ),
    );
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it("メールアドレスを入力するとメールでサインインする", async () => {
    signInEmail.mockResolvedValue({ error: null });
    submit("user@example.com");

    await waitFor(() =>
      expect(signInEmail).toHaveBeenCalledWith(
        expect.objectContaining({ email: "user@example.com" }),
      ),
    );
    expect(signInUsername).not.toHaveBeenCalled();
  });

  it("識別子欄をメール専用にしない", () => {
    // type="email" のままだと、ブラウザの検証がユーザー名の入力を
    // 送信前に弾いてしまう（jsdom では再現しないので属性で固定する）。
    render(<LoginForm redirectTo="/" />);
    expect(
      screen.getByLabelText("ユーザー名またはメールアドレス"),
    ).toHaveAttribute("type", "text");
  });
});
```

- [ ] **Step 4: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/features/auth/login src/components/auth/LoginForm.test.tsx`
Expected: FAIL（`identifier` が無い／`getByLabelText` が見つからない）

- [ ] **Step 5: `schema.ts` を書き換える**

`src/features/auth/login/schema.ts` の全体:

```ts
import { z } from "zod";
import { loginIdentifierSchema } from "./identifier";

export const loginSchema = z.object({
  // ユーザー名とメールアドレスのどちらでも受け付ける。振り分けは identifier.ts。
  identifier: loginIdentifierSchema,
  // 既存ユーザーのパスワードがポリシー変更前の長さでも弾かないよう、
  // ここでは空でないことだけを確認する。
  password: z.string().min(1, "パスワードを入力してください"),
});

export type LoginInput = z.infer<typeof loginSchema>;
```

- [ ] **Step 6: `usecase.ts` を書き換える**

`src/features/auth/login/usecase.ts` の全体:

```ts
import type { Effect } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";
import { type AuthCallPort, runAuthCall } from "@/shared/lib/auth-effect";
import type { LoginInput } from "./schema";

/** authClient.signIn.email へ実際に渡す値。callbackURL は再送メールの戻り先。 */
export type SignInEmailCall = {
  readonly email: string;
  readonly password: string;
  readonly callbackURL: string;
};

/** authClient.signIn.username へ実際に渡す値。 */
export type SignInUsernameCall = {
  readonly username: string;
  readonly password: string;
  readonly callbackURL: string;
};

/**
 * サインインの 2 経路。実体を引数で受けることで、テストから
 * Better Auth 本体を呼ばずに振り分けを検証できる。
 */
export type LoginPorts = {
  readonly signInEmail: AuthCallPort<SignInEmailCall>;
  readonly signInUsername: AuthCallPort<SignInUsernameCall>;
};

/**
 * 識別子の種別でサインインの口を選ぶ。
 *
 * /sign-in/username は /sign-in/email と同じ実装で requireEmailVerification と
 * sendOnSignIn を扱うため、未確認メールの再送はどちらの経路でも同じように起きる。
 */
export const login = (
  ports: LoginPorts,
  input: LoginInput,
  callbackURL: string,
): Effect.Effect<void, AuthError> =>
  input.identifier.kind === "email"
    ? runAuthCall(ports.signInEmail, {
        email: input.identifier.email,
        password: input.password,
        callbackURL,
      })
    : runAuthCall(ports.signInUsername, {
        username: input.identifier.username,
        password: input.password,
        callbackURL,
      });
```

- [ ] **Step 7: `LoginForm.tsx` を直す**

`onSubmit` の `safeParse` と `login` 呼び出しを差し替える:

```tsx
    const parsed = loginSchema.safeParse({
      identifier: formData.get("identifier"),
      password: formData.get("password"),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setPending(true);
    const exit = await Effect.runPromiseExit(
      login(
        {
          signInEmail: (input) => authClient.signIn.email(input),
          signInUsername: (input) => authClient.signIn.username(input),
        },
        parsed.data,
        verificationCallbackURL(redirectTo),
      ),
    );
```

識別子欄の `div` を差し替える:

```tsx
        <div className="space-y-1">
          <label
            htmlFor="identifier"
            className="block text-sm font-medium text-slate-700"
          >
            ユーザー名またはメールアドレス
          </label>
          {/* type="email" にするとブラウザの検証がユーザー名を送信前に弾く。 */}
          <input
            id="identifier"
            name="identifier"
            type="text"
            autoComplete="username"
            required
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
```

- [ ] **Step 8: テストが通ることを確認する**

Run: `pnpm exec vitest run src/features/auth src/components/auth`
Expected: 全 PASS

- [ ] **Step 9: コミット**

```bash
git add src/features/auth/login src/components/auth/LoginForm.tsx src/components/auth/LoginForm.test.tsx
git commit -m "feat(auth): accept username or email on the login form"
```

---

### Task 6: 全体検証

**Files:** なし（確認のみ）

- [ ] **Step 1: 型検査**

Run: `pnpm typecheck`
Expected: エラー無しで終了（出力なし）

- [ ] **Step 2: テスト一式**

Run: `pnpm test`
Expected: 全 PASS。落ちたテストがあれば内容を読み、原因を直してから進む

- [ ] **Step 3: lint**

Run: `pnpm lint`
Expected: 触ったファイルについて、CRLF 由来（改行コード）以外の指摘が無いこと。
内容に関する指摘が出たら `pnpm lint:fix` に任せきりにせず、原因を読んでから直す

- [ ] **Step 4: 実アプリでの確認**

`pnpm dev` を起動し、`/login` で次の 3 つを確認する。
確認用のアカウントが無い場合は `/signup` から作り、確認メールのリンクを踏んでおく。

1. ユーザー名 + 正しいパスワードでログインできる
2. メールアドレス + 正しいパスワードでログインできる
3. 存在しないユーザー名で
   「ユーザー名・メールアドレスまたはパスワードが正しくありません」が出る

- [ ] **Step 5: 仕上げ**

作業ツリーに未コミットの変更が残っていないことを確認する:

```bash
git status --short
```

`node_modules/next/dist/server/lib/generate-agent-files.js` が書き戻した
`AGENTS.md` の差分が出ていた場合は、それも一緒にコミットする。
