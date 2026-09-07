# パスワードリセット実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** パスワードを忘れたユーザーが、メールで届いたリンクから新しいパスワードを設定してログインできるようにする。

**Architecture:** Better Auth 1.7.2 標準の `/request-password-reset` → `/reset-password/:token` → `/reset-password` 経路にそのまま乗る。申請画面 `/forgot-password` と再設定画面 `/reset-password` の 2 画面を `(auth)` グループに足し、検証・写像・メール本文はすべて純粋関数として `src/features/auth/password-reset/` と `src/shared/lib/` に置いて単体テストする。Better Auth 呼び出しは既存の `runAuthCall` で `Effect<void, AuthError>` に畳む。

**Tech Stack:** Next.js 16.3.3 (App Router) / React 19 / Better Auth 1.7.2 / Prisma 7 / Zod 4 / Effect 3 / Vitest + Testing Library / Biome / pnpm

**設計書:** `docs/superpowers/specs/2026-09-08-password-reset-design.md`

## Global Constraints

- パッケージマネージャは **pnpm**。`npm` / `yarn` は使わない。
- 検証コマンド: `pnpm test`（vitest run）、`pnpm typecheck`（tsc --noEmit）、`pnpm lint`（biome check）。
- 単一ファイルのテスト実行は `pnpm exec vitest run <path>`。
- **worktree で作業する場合、最初に `pnpm exec next typegen` を実行すること。** `PageProps<"/reset-password">` などの型が `.next/types` に生成されておらず、`pnpm typecheck` が落ちる。あわせて元のチェックアウトから `.env` をコピーする。
- **Biome の既知ノイズ:** Windows チェックアウトでは CRLF 由来の lint エラーがリポジトリ全体に出る。`pnpm lint` の結果は内容で判断し、CRLF だけの指摘は無視してよい。新規ファイルの中身に対する指摘は直す。
- 有効期限は `PASSWORD_RESET_LINK_EXPIRES_IN_HOURS = 1`（Better Auth 既定値）。
- リセット申請の `redirectTo` は固定文字列 `"/reset-password"` のみ。外から来た遷移先は絶対に渡さない。
- 申請結果はメールアドレスの存在によらず同じ文面にする（アカウント列挙対策）。
- 画面文言・コメントはすべて日本語。既存ファイルと同じく「なぜそうしたか」をコメントに残す。
- コミットは各タスクの末尾で 1 回。メッセージ末尾に必ず以下を付ける:

  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```

## ファイル構成

**新規作成**

| ファイル | 責務 |
| --- | --- |
| `src/shared/lib/html-escape.ts` | HTML 文脈へ差し込む値のエスケープ。2 つのメールビルダで共有 |
| `src/shared/lib/mail/greeting.ts` | メール本文の呼びかけ名の導出。2 つのメールビルダで共有 |
| `src/shared/lib/password-reset-policy.ts` | リセットリンクの有効期限の定数と表示ラベル |
| `src/shared/lib/auth-password-reset-email.ts` | リセットメールの件名・本文を組み立てる純粋関数 |
| `src/features/auth/password-reset/schema.ts` | 申請フォームと再設定フォームの入力検証 |
| `src/features/auth/password-reset/domain.ts` | `redirectTo` 定数、トークン状態の写像、完了時の案内文 |
| `src/features/auth/password-reset/usecase.ts` | Better Auth 呼び出しを Effect に畳む |
| `src/components/auth/ForgotPasswordForm.tsx` | 申請フォーム |
| `src/components/auth/ResetPasswordForm.tsx` | 再設定フォーム |
| `src/app/(auth)/forgot-password/page.tsx` | 申請画面 |
| `src/app/(auth)/reset-password/page.tsx` | 再設定画面 |

**変更**

| ファイル | 変更内容 |
| --- | --- |
| `src/shared/lib/auth-verification-email.ts` | `escapeHtml` と宛名導出を共有版の import に置き換え |
| `src/shared/lib/auth.ts` | `sendResetPassword` / `resetPasswordTokenExpiresIn` / `revokeSessionsOnPasswordReset` / `onPasswordReset` |
| `src/shared/errors/auth-error.ts` | `InvalidResetToken` の追加と `INVALID_TOKEN` の写像 |
| `src/features/auth/messages.ts` | `InvalidResetToken` の文言 |
| `src/components/auth/LoginForm.tsx` | 「パスワードをお忘れですか？」リンクと `reset=1` の案内 |
| `src/app/(auth)/login/page.tsx` | `reset` クエリの受け渡し |

---

## Task 1: メール本文の共通部品の切り出し

`escapeHtml` と宛名の導出は今 `auth-verification-email.ts` の中にある。リセットメールのビルダでも同じものが要るので、共有の場所へ移す。振る舞いは変えない純粋な移動。

**Files:**
- Create: `src/shared/lib/html-escape.ts`
- Create: `src/shared/lib/html-escape.test.ts`
- Create: `src/shared/lib/mail/greeting.ts`
- Create: `src/shared/lib/mail/greeting.test.ts`
- Modify: `src/shared/lib/auth-verification-email.ts`

**Interfaces:**
- Consumes: `MailAddress`（`@/shared/lib/mail/types`）
- Produces: `escapeHtml(raw: string): string`、`greetingNameOf(to: MailAddress): string`

- [ ] **Step 1: Write the failing test**

`src/shared/lib/html-escape.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { escapeHtml } from "./html-escape";

describe("escapeHtml", () => {
  it("HTML の意味を持つ 5 文字を実体参照に変換する", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("& を先に変換するため、二重エスケープにならない", () => {
    // 順序を誤ると "&lt;" が "&amp;lt;" になる。
    expect(escapeHtml("<a>")).toBe("&lt;a&gt;");
  });

  it("クエリを含む URL の & をすべて変換する", () => {
    expect(escapeHtml("https://example.com/a?b=1&c=2&d=3")).toBe(
      "https://example.com/a?b=1&amp;c=2&amp;d=3",
    );
  });

  it("変換対象が無い文字列はそのまま返す", () => {
    expect(escapeHtml("竹添 太郎")).toBe("竹添 太郎");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/shared/lib/html-escape.test.ts`
Expected: FAIL — `Failed to resolve import "./html-escape"`

- [ ] **Step 3: Write minimal implementation**

`src/shared/lib/html-escape.ts`:

```ts
/**
 * HTML の文脈へ差し込む値をエスケープする。
 *
 * メール本文の組み立てで、ユーザー入力（名前）と認証 URL（クエリに &
 * を含む）のどちらも素通しにはできないため使う。& を最初に置き換えるのは、
 * 後続の置換が生む "&lt;" の & をもう一度エスケープしないため。
 */
export const escapeHtml = (raw: string): string =>
  raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/shared/lib/html-escape.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 4b: 宛名導出のテストを書き、失敗を確認する**

`src/shared/lib/mail/greeting.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { greetingNameOf } from "./greeting";

describe("greetingNameOf", () => {
  it("名前があればそれを使う", () => {
    expect(greetingNameOf({ email: "user@example.com", name: "竹添" })).toBe("竹添");
  });

  it("名前の前後の空白を落とす", () => {
    expect(greetingNameOf({ email: "user@example.com", name: " 竹添 " })).toBe("竹添");
  });

  it("名前が空白のみならメールアドレスを使う", () => {
    // User.name は NOT NULL なので、実運用で到達しうる欠損の形は空文字。
    // ?? ではなく || で判定していないと「 様」になる。
    expect(greetingNameOf({ email: "user@example.com", name: "   " })).toBe(
      "user@example.com",
    );
  });

  it("名前が無ければメールアドレスを使う", () => {
    expect(greetingNameOf({ email: "user@example.com" })).toBe("user@example.com");
  });
});
```

Run: `pnpm exec vitest run src/shared/lib/mail/greeting.test.ts`
Expected: FAIL — `Failed to resolve import "./greeting"`

- [ ] **Step 4c: 宛名導出を実装し、テストが通ることを確認する**

`src/shared/lib/mail/greeting.ts`:

```ts
import type { MailAddress } from "./types";

/**
 * メール本文の呼びかけに使う名前を決める。
 *
 * User.name はスキーマ上 NOT NULL なので、実運用で到達しうる欠損の形は
 * undefined ではなく空文字。トリムした上で ?? ではなく || で判定しないと
 * 「 様」になってしまう。この判断はメールの種類によらず同じなので、
 * 各ビルダに書き写さず 1 か所に持つ。
 */
export const greetingNameOf = (to: MailAddress): string =>
  to.name?.trim() || to.email;
```

Run: `pnpm exec vitest run src/shared/lib/mail/greeting.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: 確認メール側を共有版に差し替える**

`src/shared/lib/auth-verification-email.ts` から次のブロックを**削除**する:

```ts
/**
 * HTML の文脈へ差し込む値をエスケープする。name はユーザーの入力、
 * url はクエリに & を含むため、どちらも素通しにはできない。
 */
const escapeHtml = (raw: string): string =>
  raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
```

そして import 群の末尾に足す（既存の import 行はそのまま残す）:

```ts
import { escapeHtml } from "./html-escape";
import { greetingNameOf } from "./mail/greeting";
```

同じファイルの `buildVerificationEmail` の中で、次の 3 行（コメント込み）を**削除**する:

```ts
  // User.name はスキーマ上 NOT NULL なので、実運用で到達しうる欠損の形は
  // undefined ではなく空文字。トリムした上で ?? ではなく || で判定しないと
  // 「 様」になってしまう。
  const greetingName = to.name?.trim() || to.email;
```

代わりに置く:

```ts
  const greetingName = greetingNameOf(to);
```

- [ ] **Step 6: 既存テストが割れていないことを確認する**

Run: `pnpm exec vitest run src/shared/lib/auth-verification-email.test.ts src/shared/lib/html-escape.test.ts src/shared/lib/mail/greeting.test.ts`
Expected: 3 ファイルとも PASS

- [ ] **Step 7: Commit**

```bash
git add src/shared/lib/html-escape.ts src/shared/lib/html-escape.test.ts src/shared/lib/mail/greeting.ts src/shared/lib/mail/greeting.test.ts src/shared/lib/auth-verification-email.ts
git commit -m "$(cat <<'EOF'
refactor(mail): extract escapeHtml and greeting name for reuse

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: リセットリンクの有効期限ポリシー

`auth.ts`・メール本文・申請完了画面の 3 か所が同じ値を使うため、定数を 1 か所に持つ。`email-verification-policy.ts` と同型。

**Files:**
- Create: `src/shared/lib/password-reset-policy.ts`
- Create: `src/shared/lib/password-reset-policy.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `PASSWORD_RESET_LINK_EXPIRES_IN_HOURS: number`、`PASSWORD_RESET_LINK_EXPIRES_IN_SECONDS: number`、`PASSWORD_RESET_LINK_EXPIRES_LABEL: string`

- [ ] **Step 1: Write the failing test**

`src/shared/lib/password-reset-policy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  PASSWORD_RESET_LINK_EXPIRES_IN_HOURS,
  PASSWORD_RESET_LINK_EXPIRES_IN_SECONDS,
  PASSWORD_RESET_LINK_EXPIRES_LABEL,
} from "./password-reset-policy";

describe("パスワードリセットリンクの有効期限", () => {
  it("秒数は時間から導出される", () => {
    expect(PASSWORD_RESET_LINK_EXPIRES_IN_SECONDS).toBe(
      PASSWORD_RESET_LINK_EXPIRES_IN_HOURS * 60 * 60,
    );
  });

  it("表示ラベルは時間の値と一致する", () => {
    expect(PASSWORD_RESET_LINK_EXPIRES_LABEL).toBe(
      `${PASSWORD_RESET_LINK_EXPIRES_IN_HOURS}時間`,
    );
  });

  it("確認メール（24 時間）より短い", () => {
    // 切れても申請し直すだけで復帰でき、リンクが漏れたときの窓は
    // 狭いほどよいため、確認メールより短く保つ。
    expect(PASSWORD_RESET_LINK_EXPIRES_IN_HOURS).toBeLessThan(24);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/shared/lib/password-reset-policy.test.ts`
Expected: FAIL — `Failed to resolve import "./password-reset-policy"`

- [ ] **Step 3: Write minimal implementation**

`src/shared/lib/password-reset-policy.ts`:

```ts
/**
 * パスワードリセットリンクの有効期間。
 *
 * Better Auth の emailAndPassword.resetPasswordTokenExpiresIn、リセット
 * メールの本文、申請完了画面の案内の 3 か所で同じ値を使うため、ここに
 * 1 つだけ持つ。確認メールは 24 時間まで延ばしたが、こちらは Better Auth
 * の既定値どおり 1 時間にする。切れても申請し直すだけで復帰でき、確認
 * メールのような自動再送の仕掛けを持たないため、リンクが漏れたときの窓を
 * 狭く保つ側の理由が勝る。
 */
export const PASSWORD_RESET_LINK_EXPIRES_IN_HOURS = 1;

export const PASSWORD_RESET_LINK_EXPIRES_IN_SECONDS =
  PASSWORD_RESET_LINK_EXPIRES_IN_HOURS * 60 * 60;

/**
 * 画面とメール本文で共有する表示用ラベル。
 * 数値だけを共有すると JSX と文字列結合で前後の空白の扱いが変わるため、
 * 整形した形で 1 つ持つ。
 */
export const PASSWORD_RESET_LINK_EXPIRES_LABEL = `${PASSWORD_RESET_LINK_EXPIRES_IN_HOURS}時間`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/shared/lib/password-reset-policy.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/password-reset-policy.ts src/shared/lib/password-reset-policy.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): add password reset link expiry policy

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: リセットメールの本文組み立て

送信経路と切り離して文面とエスケープだけを検証できるよう、純粋関数にする。差出人を引数で受けるのも同じ理由（環境変数の解決は `auth.ts` の責務）。

**Files:**
- Create: `src/shared/lib/auth-password-reset-email.ts`
- Create: `src/shared/lib/auth-password-reset-email.test.ts`

**Interfaces:**
- Consumes: `escapeHtml`（Task 1）、`PASSWORD_RESET_LINK_EXPIRES_LABEL`（Task 2）、既存の `MailAddress` / `MailMessage`（`@/shared/lib/mail/types`）
- Produces: `PASSWORD_RESET_EMAIL_SUBJECT: string`、`buildPasswordResetEmail(args: { from: MailAddress; to: MailAddress; url: string }): MailMessage`

- [ ] **Step 1: Write the failing test**

`src/shared/lib/auth-password-reset-email.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildPasswordResetEmail,
  PASSWORD_RESET_EMAIL_SUBJECT,
} from "./auth-password-reset-email";
import { PASSWORD_RESET_LINK_EXPIRES_LABEL } from "./password-reset-policy";

const from = { email: "noreply@example.com", name: "大会運営" };
const url = "https://example.com/api/auth/reset-password/t0ken?callbackURL=%2Freset-password";

describe("buildPasswordResetEmail", () => {
  it("件名・差出人・宛先をそのまま載せる", () => {
    const message = buildPasswordResetEmail({
      from,
      to: { email: "user@example.com", name: "竹添" },
      url,
    });

    expect(message.subject).toBe(PASSWORD_RESET_EMAIL_SUBJECT);
    expect(message.from).toEqual(from);
    expect(message.to).toEqual([{ email: "user@example.com", name: "竹添" }]);
  });

  it("テキスト本文に URL と有効期限を含める", () => {
    const message = buildPasswordResetEmail({
      from,
      to: { email: "user@example.com", name: "竹添" },
      url,
    });

    expect(message.text).toContain(url);
    expect(message.text).toContain(PASSWORD_RESET_LINK_EXPIRES_LABEL);
    // 申請していない人に「破棄してください」と伝える一文は、
    // 誤送信や第三者による申請に気づいてもらうために必須。
    expect(message.text).toContain("心当たりが無い場合");
  });

  it("名前が空文字のときはメールアドレスで呼びかける", () => {
    // User.name は NOT NULL なので、実運用で到達しうる欠損は空文字。
    // ?? ではなく || で判定していないと「 様」になる。
    const message = buildPasswordResetEmail({
      from,
      to: { email: "user@example.com", name: "   " },
      url,
    });

    expect(message.text.startsWith("user@example.com 様")).toBe(true);
  });

  it("HTML 本文では URL の & をエスケープする", () => {
    const message = buildPasswordResetEmail({
      from,
      to: { email: "user@example.com", name: "竹添" },
      url: "https://example.com/r?a=1&b=2",
    });

    expect(message.html).toContain("https://example.com/r?a=1&amp;b=2");
    expect(message.html).not.toContain("a=1&b=2");
  });

  it("HTML 本文では名前をエスケープする", () => {
    const message = buildPasswordResetEmail({
      from,
      to: { email: "user@example.com", name: "<script>x</script>" },
      url,
    });

    expect(message.html).toContain("&lt;script&gt;");
    expect(message.html).not.toContain("<script>");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/shared/lib/auth-password-reset-email.test.ts`
Expected: FAIL — `Failed to resolve import "./auth-password-reset-email"`

- [ ] **Step 3: Write minimal implementation**

`src/shared/lib/auth-password-reset-email.ts`:

```ts
import { greetingNameOf } from "@/shared/lib/mail/greeting";
import type { MailAddress, MailMessage } from "@/shared/lib/mail/types";
import { escapeHtml } from "./html-escape";
import { PASSWORD_RESET_LINK_EXPIRES_LABEL } from "./password-reset-policy";

export const PASSWORD_RESET_EMAIL_SUBJECT = "【大会運営】パスワードの再設定";

/**
 * パスワードリセットを申請したユーザーへ送るメールを組み立てる。
 *
 * buildVerificationEmail と同じく純粋関数にしてあるのは、送信経路
 * (Mailtrap / コンソール)と切り離して文面とエスケープだけを検証できる
 * ようにするため。差出人を引数で受けるのも同じ理由で、環境変数の解決は
 * 呼び出し側(auth.ts)の責務にしてある。
 */
export const buildPasswordResetEmail = ({
  from,
  to,
  url,
}: {
  from: MailAddress;
  to: MailAddress;
  url: string;
}): MailMessage => {
  const greetingName = greetingNameOf(to);

  const text = [
    `${greetingName} 様`,
    "",
    "パスワード再設定のお申し込みを受け付けました。",
    "次のリンクを開くと新しいパスワードを設定できます。",
    "",
    url,
    "",
    `このリンクは${PASSWORD_RESET_LINK_EXPIRES_LABEL}で無効になります。`,
    "期限が切れた場合は、もう一度お申し込みください。",
    "",
    "心当たりが無い場合は、このメールを破棄してください。",
    "パスワードは変更されません。",
  ].join("\n");

  const safeUrl = escapeHtml(url);
  const html = [
    '<html><head><meta charset="utf-8"></head><body>',
    `<p>${escapeHtml(greetingName)} 様</p>`,
    "<p>パスワード再設定のお申し込みを受け付けました。<br>次のリンクを開くと新しいパスワードを設定できます。</p>",
    `<p><a href="${safeUrl}">${safeUrl}</a></p>`,
    `<p>このリンクは${PASSWORD_RESET_LINK_EXPIRES_LABEL}で無効になります。<br>期限が切れた場合は、もう一度お申し込みください。</p>`,
    "<p>心当たりが無い場合は、このメールを破棄してください。パスワードは変更されません。</p>",
    "</body></html>",
  ].join("\n");

  return {
    from,
    to: [to],
    subject: PASSWORD_RESET_EMAIL_SUBJECT,
    text,
    html,
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/shared/lib/auth-password-reset-email.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/auth-password-reset-email.ts src/shared/lib/auth-password-reset-email.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): build the password reset email body

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `INVALID_TOKEN` のエラー写像と文言

`messages.ts` の `Match.exhaustive` により、タグを足すと文言の追加漏れがコンパイルエラーになる。そのため写像と文言は同じタスクで足す。

**Files:**
- Modify: `src/shared/errors/auth-error.ts`
- Modify: `src/shared/errors/auth-error.test.ts`
- Modify: `src/features/auth/messages.ts`
- Modify: `src/features/auth/messages.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `InvalidResetToken`（`_tag: "InvalidResetToken"`、`{ code: string }`）。`toAuthError("INVALID_TOKEN", ...)` がこれを返す。`authErrorMessage` がこのタグを受け付ける。

- [ ] **Step 1: Write the failing tests**

`src/shared/errors/auth-error.test.ts` の既存 `describe` の中に足す（ファイル冒頭の import はそのまま使う）:

```ts
  it("INVALID_TOKEN を InvalidResetToken に写す", () => {
    const error = toAuthError("INVALID_TOKEN", undefined);
    expect(error._tag).toBe("InvalidResetToken");
    expect(error).toMatchObject({ code: "INVALID_TOKEN" });
  });
```

`src/features/auth/messages.test.ts` の既存 `describe` の中に足す:

```ts
  it("InvalidResetToken には再申請を促す文言を返す", () => {
    const message = authErrorMessage(
      new InvalidResetToken({ code: "INVALID_TOKEN" }),
    );
    expect(message).toContain("お申し込み");
  });
```

`messages.test.ts` の import 文に `InvalidResetToken` を足す。既存の import が

```ts
import { InvalidCredentials /* ... */ } from "@/shared/errors/auth-error";
```

の形なら、その中括弧の中へ `InvalidResetToken` を追加する（アルファベット順は Biome が整える）。

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/shared/errors/auth-error.test.ts src/features/auth/messages.test.ts`
Expected: FAIL — `auth-error.test.ts` は `expected 'UnexpectedAuthError' to be 'InvalidResetToken'`、`messages.test.ts` は `InvalidResetToken` が export されていない旨のエラー

- [ ] **Step 3: エラー型を足す**

`src/shared/errors/auth-error.ts` の `EmailNotVerified` クラス定義の直後に足す:

```ts
/**
 * パスワードリセットのトークンが無効・期限切れ・使用済みのときに返る。
 *
 * Better Auth の INVALID_TOKEN は汎用のコードだが、この repo で
 * クライアントからこのコードを受け取りうる経路は今のところリセットだけ。
 * 確認メールの失敗は callbackURL の ?error= で返るため、この写像は通らない。
 */
export class InvalidResetToken extends Data.TaggedError("InvalidResetToken")<{
  readonly code: string;
}> {}
```

`AuthError` の union に `| InvalidResetToken` を足す:

```ts
export type AuthError =
  | InvalidCredentials
  | EmailAlreadyExists
  | UsernameAlreadyExists
  | InvalidUsername
  | WeakPassword
  | EmailNotVerified
  | InvalidResetToken
  | UnexpectedAuthError;
```

`toAuthError` の `switch` に、`case "EMAIL_NOT_VERIFIED":` のブロックの後・`default:` の前へ足す:

```ts
    // reset-password のトークンが無効・期限切れ・使用済みのとき。
    // Better Auth はこの 3 つを区別せずに返す（api/routes/password.mjs）。
    case "INVALID_TOKEN":
      return new InvalidResetToken({ code });
```

- [ ] **Step 4: 文言を足す**

`src/features/auth/messages.ts` の `Match.tag("EmailNotVerified", ...)` の直後に足す:

```ts
    Match.tag(
      "InvalidResetToken",
      // 無効・期限切れ・使用済みのどれかは区別できず、また区別しても
      // 復帰手段は同じ（もう一度申請する）ためまとめた文言にする。
      () =>
        "リンクが無効か期限切れです。お手数ですが再度お申し込みください",
    ),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run src/shared/errors/auth-error.test.ts src/features/auth/messages.test.ts`
Expected: PASS

- [ ] **Step 6: 型チェック**

Run: `pnpm typecheck`
Expected: エラーなし（`Match.exhaustive` が満たされている）

- [ ] **Step 7: Commit**

```bash
git add src/shared/errors/auth-error.ts src/shared/errors/auth-error.test.ts src/features/auth/messages.ts src/features/auth/messages.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): map INVALID_TOKEN to InvalidResetToken

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 入力スキーマ

申請フォーム（メールアドレス）と再設定フォーム（新パスワード + 確認用）の検証。長さの規則は `password-policy.ts` の定数から作り、サーバー側とずれないようにする。

**Files:**
- Create: `src/features/auth/password-reset/schema.ts`
- Create: `src/features/auth/password-reset/schema.test.ts`

**Interfaces:**
- Consumes: `normalizeEmail`（`@/shared/lib/email`）、`MIN_PASSWORD_LENGTH` / `MAX_PASSWORD_LENGTH`（`@/shared/lib/password-policy`）
- Produces: `passwordResetRequestSchema`（`{ email: string }` を出力）、`PasswordResetRequestInput`、`passwordResetSchema`（`{ newPassword: string; confirmPassword: string }` を出力）、`PasswordResetInput`

- [ ] **Step 1: Write the failing test**

`src/features/auth/password-reset/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH } from "@/shared/lib/password-policy";
import { passwordResetRequestSchema, passwordResetSchema } from "./schema";

describe("passwordResetRequestSchema", () => {
  it("前後の空白を落とし小文字にそろえる", () => {
    const parsed = passwordResetRequestSchema.safeParse({
      email: "  User@Example.COM ",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.email).toBe("user@example.com");
  });

  it("形式が正しくないメールアドレスを弾く", () => {
    const parsed = passwordResetRequestSchema.safeParse({ email: "not-an-email" });
    expect(parsed.success).toBe(false);
    expect(parsed.success === false && parsed.error.issues[0].message).toBe(
      "メールアドレスの形式が正しくありません",
    );
  });

  it("空文字を弾く", () => {
    expect(passwordResetRequestSchema.safeParse({ email: "" }).success).toBe(false);
  });
});

const valid = (password: string) => ({
  newPassword: password,
  confirmPassword: password,
});

describe("passwordResetSchema", () => {
  it("一致する十分な長さのパスワードを通す", () => {
    const parsed = passwordResetSchema.safeParse(valid("password123"));
    expect(parsed.success).toBe(true);
  });

  it("最小長ちょうどを通す", () => {
    const parsed = passwordResetSchema.safeParse(valid("a".repeat(MIN_PASSWORD_LENGTH)));
    expect(parsed.success).toBe(true);
  });

  it("最小長より 1 文字短いものを弾く", () => {
    const parsed = passwordResetSchema.safeParse(
      valid("a".repeat(MIN_PASSWORD_LENGTH - 1)),
    );
    expect(parsed.success).toBe(false);
  });

  it("確認用が一致しない場合を弾く", () => {
    const parsed = passwordResetSchema.safeParse({
      newPassword: "password123",
      confirmPassword: "password124",
    });
    expect(parsed.success).toBe(false);
    expect(parsed.success === false && parsed.error.issues[0].message).toBe(
      "確認用のパスワードが一致しません",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/auth/password-reset/schema.test.ts`
Expected: FAIL — `Failed to resolve import "./schema"`

- [ ] **Step 3: Write minimal implementation**

`src/features/auth/password-reset/schema.ts`:

```ts
import { z } from "zod";
import { normalizeEmail } from "@/shared/lib/email";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@/shared/lib/password-policy";

/**
 * リセット申請フォームの入力。
 * Better Auth の /request-password-reset はメールアドレスしか受け付けない。
 * ログイン画面はユーザー名も通すが、ユーザー名からメールを引く処理を自作
 * すると応答差やタイミング差でアカウントの存在が漏れる経路を新たに作る
 * ことになるため、ここはメールアドレスに限る。
 */
export const passwordResetRequestSchema = z.object({
  email: z
    .string()
    .transform(normalizeEmail)
    .pipe(z.email("メールアドレスの形式が正しくありません")),
});

export type PasswordResetRequestInput = z.infer<
  typeof passwordResetRequestSchema
>;

/**
 * 再設定フォームの入力。
 * 確認用との一致はフォームではなくここで見る。検証の置き場所を 1 つに
 * まとめておけば、画面を増やしても規則がずれない。confirmPassword は
 * サーバーへは送らない（usecase 側で newPassword だけを取り出す）。
 */
export const passwordResetSchema = z
  .object({
    newPassword: z
      .string()
      .min(
        MIN_PASSWORD_LENGTH,
        `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください`,
      )
      .max(
        MAX_PASSWORD_LENGTH,
        `パスワードは${MAX_PASSWORD_LENGTH}文字以内で入力してください`,
      ),
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "確認用のパスワードが一致しません",
    path: ["confirmPassword"],
  });

export type PasswordResetInput = z.infer<typeof passwordResetSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/auth/password-reset/schema.test.ts`
Expected: PASS（7 tests）

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/password-reset/schema.ts src/features/auth/password-reset/schema.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): add password reset input schemas

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: ドメインロジック（リダイレクト先・トークン状態・完了案内）

`/reset-password` に届いたクエリを「フォームを出してよいか」に写す純粋関数と、`redirectTo` の固定値、ログイン画面に出す完了案内。

**Files:**
- Create: `src/features/auth/password-reset/domain.ts`
- Create: `src/features/auth/password-reset/domain.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `PASSWORD_RESET_REDIRECT_TO: "/reset-password"`
  - `PASSWORD_RESET_DONE_PATH: "/login?reset=1"`
  - `ResetTokenState = { kind: "form"; token: string } | { kind: "invalid"; message: string }`
  - `resetTokenState(token: string | null, errorCode: string | null): ResetTokenState`
  - `passwordResetNotice(reset: boolean): string | null`

- [ ] **Step 1: Write the failing test**

`src/features/auth/password-reset/domain.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  PASSWORD_RESET_DONE_PATH,
  PASSWORD_RESET_REDIRECT_TO,
  passwordResetNotice,
  resetTokenState,
} from "./domain";

describe("PASSWORD_RESET_REDIRECT_TO", () => {
  it("同一オリジンの絶対パスに固定されている", () => {
    // メール本文の URL に callbackURL として埋め込まれる値。外から来た
    // 遷移先を流さないため固定にしてある。ここが緩むとオープン
    // リダイレクトの面が増える。
    expect(PASSWORD_RESET_REDIRECT_TO).toBe("/reset-password");
  });
});

describe("resetTokenState", () => {
  it("トークンがあり error が無ければフォームを出す", () => {
    expect(resetTokenState("t0ken", null)).toEqual({
      kind: "form",
      token: "t0ken",
    });
  });

  it("error が付いていればトークンがあってもフォームを出さない", () => {
    const state = resetTokenState("t0ken", "INVALID_TOKEN");
    expect(state.kind).toBe("invalid");
  });

  it("トークンが無ければフォームを出さない", () => {
    expect(resetTokenState(null, null).kind).toBe("invalid");
  });

  it("トークンが空文字でもフォームを出さない", () => {
    expect(resetTokenState("", null).kind).toBe("invalid");
  });

  it("未知の error コードも同じ案内に畳む", () => {
    // 無効・期限切れ・使用済みのどれでも復帰手段は「もう一度申請する」で
    // 同じなので、コードごとに文言を分けない。
    const known = resetTokenState(null, "INVALID_TOKEN");
    const unknown = resetTokenState(null, "SOMETHING_ELSE");
    expect(unknown).toEqual(known);
  });

  it("案内文は再申請を促す", () => {
    const state = resetTokenState(null, "INVALID_TOKEN");
    expect(state.kind === "invalid" && state.message).toContain("お申し込み");
  });
});

describe("passwordResetNotice", () => {
  it("reset=1 のときは再設定完了を伝える", () => {
    expect(passwordResetNotice(true)).toContain("再設定");
  });

  it("通常のログイン画面では案内を出さない", () => {
    expect(passwordResetNotice(false)).toBeNull();
  });
});

describe("PASSWORD_RESET_DONE_PATH", () => {
  it("passwordResetNotice が案内を出すクエリを持つ", () => {
    expect(PASSWORD_RESET_DONE_PATH).toBe("/login?reset=1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/auth/password-reset/domain.test.ts`
Expected: FAIL — `Failed to resolve import "./domain"`

- [ ] **Step 3: Write minimal implementation**

`src/features/auth/password-reset/domain.ts`:

```ts
/**
 * リセットメールのリンクを踏んだ後に戻ってくるパス。
 *
 * Better Auth はこの値を /request-password-reset の redirectTo として受け取り、
 * originCheck を通した上でメール本文の URL に callbackURL として埋める。
 * ログインや新規登録と違い、ここには外から来た遷移先を流さない。流すと
 * メールに任意のパスを埋められる経路ができ、オープンリダイレクトの面が
 * 増えるためである。リセット完了後は常に /login へ戻す。
 */
export const PASSWORD_RESET_REDIRECT_TO = "/reset-password";

/** 再設定に成功した後の遷移先。reset=1 が passwordResetNotice の案内を出す。 */
export const PASSWORD_RESET_DONE_PATH = "/login?reset=1";

/**
 * /reset-password の表示状態。フォームを出す場合はトークンを、出さない
 * 場合は理由の案内文を持つ。
 */
export type ResetTokenState =
  | { kind: "form"; token: string }
  | { kind: "invalid"; message: string };

/**
 * /reset-password に届いたクエリを表示状態へ写す。
 *
 * Better Auth の reset-password/:token は、トークンが有効なら
 * ?token=... を、無効・期限切れなら ?error=INVALID_TOKEN を付けて
 * ここへリダイレクトする（api/routes/password.mjs）。error の有無と
 * token の有無を別々に扱わないのは、どちらも復帰手段が
 * 「もう一度申請する」で同じだからである。
 */
export const resetTokenState = (
  token: string | null,
  errorCode: string | null,
): ResetTokenState => {
  if (errorCode !== null || token === null || token === "") {
    return {
      kind: "invalid",
      message:
        "リンクが無効か期限切れです。お手数ですが再度お申し込みください",
    };
  }
  return { kind: "form", token };
};

/**
 * 再設定を終えて /login?reset=1 へ戻ってきたときに出す案内文。
 * 案内が要らない通常のログイン画面では null を返す。
 *
 * 確認メールの verificationNotice とは出る条件も文面も別物なので、
 * 1 つの関数にまとめず隣に置く。
 */
export const passwordResetNotice = (reset: boolean): string | null =>
  reset
    ? "パスワードを再設定しました。新しいパスワードでログインしてください"
    : null;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/auth/password-reset/domain.test.ts`
Expected: PASS（9 tests）

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/password-reset/domain.ts src/features/auth/password-reset/domain.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): add password reset domain helpers

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: ユースケース（Better Auth 呼び出しの Effect 化）

`runAuthCall` で reject と `{ error }` の両経路を `AuthError` に畳む。ポートを引数で受けるので、テストから Better Auth 本体を呼ばずに検証できる。

**Files:**
- Create: `src/features/auth/password-reset/usecase.ts`
- Create: `src/features/auth/password-reset/usecase.test.ts`

**Interfaces:**
- Consumes: `AuthCallPort` / `runAuthCall`（`@/shared/lib/auth-effect`）、`PasswordResetInput` / `PasswordResetRequestInput`（Task 5）、`PASSWORD_RESET_REDIRECT_TO`（Task 6）
- Produces:
  - `RequestPasswordResetPort = AuthCallPort<{ email: string; redirectTo: string }>`
  - `requestPasswordReset(port, input: PasswordResetRequestInput): Effect.Effect<void, AuthError>`
  - `ResetPasswordPort = AuthCallPort<{ newPassword: string; token: string }>`
  - `resetPassword(port, input: PasswordResetInput, token: string): Effect.Effect<void, AuthError>`

- [ ] **Step 1: Write the failing test**

`src/features/auth/password-reset/usecase.test.ts`:

```ts
import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import { PASSWORD_RESET_REDIRECT_TO } from "./domain";
import type { RequestPasswordResetPort, ResetPasswordPort } from "./usecase";
import { requestPasswordReset, resetPassword } from "./usecase";

// Effect への包み方と AuthError への写像そのものは
// src/shared/lib/auth-effect.test.ts が網羅している。ここでは
// リセット固有の入力がポートへ正しく渡ることだけを見る。
describe("requestPasswordReset", () => {
  it("メールアドレスと固定の redirectTo をポートへ渡す", async () => {
    const port: RequestPasswordResetPort = vi.fn().mockResolvedValue({ error: null });
    const exit = await Effect.runPromiseExit(
      requestPasswordReset(port, { email: "user@example.com" }),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({
      email: "user@example.com",
      redirectTo: PASSWORD_RESET_REDIRECT_TO,
    });
  });

  it("Promise が reject した場合も AuthError に畳む", async () => {
    const port: RequestPasswordResetPort = vi.fn().mockRejectedValue(new Error("network"));
    const exit = await Effect.runPromiseExit(
      requestPasswordReset(port, { email: "user@example.com" }),
    );

    expect(failureTag(exit)).toBe("UnexpectedAuthError");
  });
});

describe("resetPassword", () => {
  it("新しいパスワードとトークンだけをポートへ渡す", async () => {
    const port: ResetPasswordPort = vi.fn().mockResolvedValue({ error: null });
    const exit = await Effect.runPromiseExit(
      resetPassword(
        port,
        { newPassword: "password123", confirmPassword: "password123" },
        "t0ken",
      ),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    // confirmPassword はクライアント側だけの検証用なので、サーバーへは送らない。
    expect(port).toHaveBeenCalledWith({
      newPassword: "password123",
      token: "t0ken",
    });
  });

  it("INVALID_TOKEN を InvalidResetToken として返す", async () => {
    const port: ResetPasswordPort = vi
      .fn()
      .mockResolvedValue({ error: { code: "INVALID_TOKEN" } });
    const exit = await Effect.runPromiseExit(
      resetPassword(
        port,
        { newPassword: "password123", confirmPassword: "password123" },
        "t0ken",
      ),
    );

    expect(failureTag(exit)).toBe("InvalidResetToken");
  });

  it("PASSWORD_TOO_SHORT を WeakPassword として返す", async () => {
    const port: ResetPasswordPort = vi
      .fn()
      .mockResolvedValue({ error: { code: "PASSWORD_TOO_SHORT" } });
    const exit = await Effect.runPromiseExit(
      resetPassword(
        port,
        { newPassword: "password123", confirmPassword: "password123" },
        "t0ken",
      ),
    );

    expect(failureTag(exit)).toBe("WeakPassword");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/auth/password-reset/usecase.test.ts`
Expected: FAIL — `Failed to resolve import "./usecase"`

- [ ] **Step 3: Write minimal implementation**

`src/features/auth/password-reset/usecase.ts`:

```ts
import type { Effect } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";
import { type AuthCallPort, runAuthCall } from "@/shared/lib/auth-effect";
import { PASSWORD_RESET_REDIRECT_TO } from "./domain";
import type { PasswordResetInput, PasswordResetRequestInput } from "./schema";

/** authClient.requestPasswordReset へ実際に渡す値。 */
export type PasswordResetRequestCall = {
  email: string;
  redirectTo: string;
};

/** authClient.requestPasswordReset が満たす最小の形。 */
export type RequestPasswordResetPort = AuthCallPort<PasswordResetRequestCall>;

/**
 * リセットメールの送信を申し込む。
 *
 * redirectTo を引数で受けずに固定値を使うのは、この値がメール本文の URL に
 * 埋め込まれるためである（domain.ts の PASSWORD_RESET_REDIRECT_TO 参照）。
 *
 * 成功しても、そのメールアドレスのユーザーが居たとは限らない。Better Auth は
 * 列挙対策として不在時もダミーのトークン生成と DB 参照を挟んだ上で同じ応答を
 * 返す。呼び出し側は結果を「送ったかどうか」ではなく「申し込みを受け付けたか
 * どうか」として扱うこと。
 */
export const requestPasswordReset = (
  port: RequestPasswordResetPort,
  input: PasswordResetRequestInput,
): Effect.Effect<void, AuthError> =>
  runAuthCall(port, {
    email: input.email,
    redirectTo: PASSWORD_RESET_REDIRECT_TO,
  });

/** authClient.resetPassword へ実際に渡す値。 */
export type PasswordResetCall = {
  newPassword: string;
  token: string;
};

/** authClient.resetPassword が満たす最小の形。 */
export type ResetPasswordPort = AuthCallPort<PasswordResetCall>;

/**
 * 新しいパスワードを設定する。
 * token はメールのリンク経由でクエリに乗ってくる値で、入力欄ではないため
 * schema.ts には入れず引数として受け取る。confirmPassword は画面側の
 * 確認用なので、ここで落としてサーバーへは送らない。
 */
export const resetPassword = (
  port: ResetPasswordPort,
  input: PasswordResetInput,
  token: string,
): Effect.Effect<void, AuthError> =>
  runAuthCall(port, { newPassword: input.newPassword, token });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/auth/password-reset/usecase.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/password-reset/usecase.ts src/features/auth/password-reset/usecase.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): add password reset usecases

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Better Auth の配線

`emailAndPassword` に 4 つの設定を足す。Better Auth の初期化を伴うためこのファイル自体はテストせず、注入する純粋関数側（Task 3）を厚く固めてある。既存の `auth-verification-email.test.ts` と同じ割り切り。

**Files:**
- Modify: `src/shared/lib/auth.ts`

**Interfaces:**
- Consumes: `buildPasswordResetEmail`（Task 3）、`PASSWORD_RESET_LINK_EXPIRES_IN_SECONDS`（Task 2）、既存の `getMailer` / `resolveMailFrom` / `prisma`
- Produces: `/api/auth/request-password-reset`、`/api/auth/reset-password/:token`、`/api/auth/reset-password` が動く状態

- [ ] **Step 1: import を足す**

`src/shared/lib/auth.ts` の import 群に足す（Biome が順序を整える）:

```ts
import { buildPasswordResetEmail } from "@/shared/lib/auth-password-reset-email";
import { PASSWORD_RESET_LINK_EXPIRES_IN_SECONDS } from "@/shared/lib/password-reset-policy";
```

`prisma` はすでに `import { prisma } from "@/shared/db/prisma";` で入っているので追加不要。

- [ ] **Step 2: `emailAndPassword` に 4 つの設定を足す**

`emailAndPassword` ブロックの `maxPasswordLength: MAX_PASSWORD_LENGTH,` の直後、閉じ括弧の前に足す:

```ts
    // Better Auth は sendResetPassword が無いと /request-password-reset を
    // RESET_PASSWORD_DISABLED で拒否する（api/routes/password.mjs）。
    sendResetPassword: async ({ user, url }) => {
      await getMailer().send(
        buildPasswordResetEmail({
          from: resolveMailFrom(process.env),
          to: { email: user.email, name: user.name },
          url,
        }),
      );
    },
    resetPasswordTokenExpiresIn: PASSWORD_RESET_LINK_EXPIRES_IN_SECONDS,
    // パスワードリセットは乗っ取りからの復帰手段でもあるため、他端末の
    // セッションを残さない。既定は false。
    revokeSessionsOnPasswordReset: true,
    // リセットリンクを開けたこと自体がメール所有の証明なので、未確認のまま
    // 残っていたアカウントをここで本登録に引き上げる。これをしないと
    // requireEmailVerification によりリセット直後のログインが
    // EMAIL_NOT_VERIFIED で弾かれ、確認メールをもう 1 通踏ませることになる。
    // Better Auth はこのフックを deleteUserSessions より先に呼ぶため、
    // 更新はセッション失効の前に走る。
    onPasswordReset: async ({ user }) => {
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      });
    },
```

- [ ] **Step 3: 型チェック**

Run: `pnpm typecheck`
Expected: エラーなし

- [ ] **Step 4: 既存テストが割れていないことを確認する**

Run: `pnpm test`
Expected: 全件 PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/auth.ts
git commit -m "$(cat <<'EOF'
feat(auth): wire password reset into better-auth server

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: 申請フォームと `/forgot-password`

SignupForm と同じく、送信後は遷移せずに案内表示へ切り替える。成否によらず同じ文面を出す。

**Files:**
- Create: `src/components/auth/ForgotPasswordForm.tsx`
- Create: `src/components/auth/ForgotPasswordForm.test.tsx`
- Create: `src/app/(auth)/forgot-password/page.tsx`

**Interfaces:**
- Consumes: `passwordResetRequestSchema`（Task 5）、`requestPasswordReset`（Task 7）、`authErrorMessage`（Task 4 で拡張済み）、`PASSWORD_RESET_LINK_EXPIRES_LABEL`（Task 2）
- Produces: `ForgotPasswordForm`（props なし）

- [ ] **Step 1: Write the failing test**

`src/components/auth/ForgotPasswordForm.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

const requestPasswordReset = vi.fn();

vi.mock("@/shared/lib/auth-client", () => ({
  authClient: {
    requestPasswordReset: (...args: unknown[]) => requestPasswordReset(...args),
  },
}));

const submitWith = (email: string) => {
  fireEvent.change(screen.getByLabelText("メールアドレス"), {
    target: { value: email },
  });
  fireEvent.click(screen.getByRole("button", { name: "リセット用リンクを送る" }));
};

describe("ForgotPasswordForm", () => {
  beforeEach(() => {
    requestPasswordReset.mockReset();
  });

  it("形式が正しくないメールアドレスでは送信しない", async () => {
    render(<ForgotPasswordForm />);
    submitWith("not-an-email");

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it("固定の redirectTo を付けて申請する", async () => {
    requestPasswordReset.mockResolvedValue({ error: null });
    render(<ForgotPasswordForm />);
    submitWith("user@example.com");

    await screen.findByText(/送信しました/);
    expect(requestPasswordReset).toHaveBeenCalledWith({
      email: "user@example.com",
      redirectTo: "/reset-password",
    });
  });

  it("成功したら案内表示に切り替え、宛先を示す", async () => {
    requestPasswordReset.mockResolvedValue({ error: null });
    render(<ForgotPasswordForm />);
    submitWith("  User@Example.COM  ");

    // 正規化後のアドレスを見せる。入力どおりに見せると、実際に送った先と
    // 表示がずれる。
    expect(await screen.findByText(/user@example\.com/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "リセット用リンクを送る" }),
    ).not.toBeInTheDocument();
  });

  it("Promise が reject した場合は案内へ切り替えずエラーを出す", async () => {
    requestPasswordReset.mockRejectedValue(new Error("network"));
    render(<ForgotPasswordForm />);
    submitWith("user@example.com");

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    // 送っていないのに「送りました」と言わない。
    expect(screen.queryByText(/送信しました/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "リセット用リンクを送る" }),
    ).not.toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/auth/ForgotPasswordForm.test.tsx`
Expected: FAIL — `Failed to resolve import "./ForgotPasswordForm"`

- [ ] **Step 3: Write the component**

`src/components/auth/ForgotPasswordForm.tsx`:

```tsx
"use client";

import { Cause, Effect, Exit, Option } from "effect";
import Link from "next/link";
import { useState } from "react";
import { authErrorMessage } from "@/features/auth/messages";
import { passwordResetRequestSchema } from "@/features/auth/password-reset/schema";
import { requestPasswordReset } from "@/features/auth/password-reset/usecase";
import { authClient } from "@/shared/lib/auth-client";
import { PASSWORD_RESET_LINK_EXPIRES_LABEL } from "@/shared/lib/password-reset-policy";

export function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // 申し込んだメールアドレス。null なら未送信でフォームを出す。
  const [sentTo, setSentTo] = useState<string | null>(null);

  const onSubmit = async (formData: FormData) => {
    setError(null);

    const parsed = passwordResetRequestSchema.safeParse({
      email: formData.get("email"),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setPending(true);
    const exit = await Effect.runPromiseExit(
      requestPasswordReset(
        (input) => authClient.requestPasswordReset(input),
        parsed.data,
      ),
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

    // Better Auth はアカウントが無くても成功を返す（列挙対策）。
    // そのため、ここは「送った」ではなく「受け付けた」の意味になる。
    setSentTo(parsed.data.email);
  };

  if (sentTo !== null) {
    return (
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold text-slate-800">
          リセット用のリンクを送信しました
        </h1>
        <p className="text-sm text-slate-700">
          {sentTo} 宛のメールにあるリンクを開くと、新しいパスワードを設定できます。
        </p>
        <p className="text-xs text-slate-500">
          リンクの有効期限は{PASSWORD_RESET_LINK_EXPIRES_LABEL}です。メールが届かない場合は迷惑メールフォルダをご確認ください。
          そのメールアドレスで登録されていない場合、メールは届きません。
        </p>
        <Link href="/login" className="text-sm text-slate-600 underline">
          ログイン画面へ
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <h1 className="text-xl font-bold text-slate-800">パスワードの再設定</h1>

      <p className="text-sm text-slate-700">
        登録したメールアドレスを入力してください。再設定用のリンクをお送りします。
      </p>

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
          {pending ? "送信中..." : "リセット用リンクを送る"}
        </button>
      </form>

      <p className="text-sm text-slate-600">
        <Link href="/login" className="underline">
          ログイン画面へ戻る
        </Link>
      </p>
    </div>
  );
}
```

> **注意:** フォームの `type="email"` はブラウザ側の検証も働くが、テストは
> `fireEvent.click` で `action` を直接起動するため `passwordResetRequestSchema`
> の検証が効く。ブラウザ検証だけに頼らずスキーマで弾く形を保つこと。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/auth/ForgotPasswordForm.test.tsx`
Expected: PASS（4 tests）

- [ ] **Step 5: ページを足す**

`src/app/(auth)/forgot-password/page.tsx`:

```tsx
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <ForgotPasswordForm />
    </main>
  );
}
```

- [ ] **Step 6: 型チェックと lint**

Run: `pnpm typecheck && pnpm lint`
Expected: typecheck はエラーなし。lint は CRLF 由来の既知ノイズ以外の指摘が無いこと（あれば `pnpm lint:fix` で直す）

- [ ] **Step 7: Commit**

```bash
git add src/components/auth/ForgotPasswordForm.tsx src/components/auth/ForgotPasswordForm.test.tsx "src/app/(auth)/forgot-password/page.tsx"
git commit -m "$(cat <<'EOF'
feat(auth): add the password reset request page

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: 再設定フォームと `/reset-password`

トークンが無効ならフォームを出さず、案内と再申請への導線だけを見せる。成功したら `/login?reset=1` へ。

**Files:**
- Create: `src/components/auth/ResetPasswordForm.tsx`
- Create: `src/components/auth/ResetPasswordForm.test.tsx`
- Create: `src/app/(auth)/reset-password/page.tsx`

**Interfaces:**
- Consumes: `passwordResetSchema`（Task 5）、`resetPassword`（Task 7）、`resetTokenState` / `PASSWORD_RESET_DONE_PATH`（Task 6）、`authErrorMessage`（Task 4）、`MIN_PASSWORD_LENGTH`
- Produces: `ResetPasswordForm({ token, errorCode }: { token: string | null; errorCode: string | null })`

- [ ] **Step 1: Write the failing test**

`src/components/auth/ResetPasswordForm.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResetPasswordForm } from "./ResetPasswordForm";

const resetPassword = vi.fn();
const push = vi.fn();

vi.mock("@/shared/lib/auth-client", () => ({
  authClient: {
    resetPassword: (...args: unknown[]) => resetPassword(...args),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

const fillAndSubmit = (newPassword: string, confirmPassword: string) => {
  fireEvent.change(screen.getByLabelText("新しいパスワード"), {
    target: { value: newPassword },
  });
  fireEvent.change(screen.getByLabelText("新しいパスワード（確認）"), {
    target: { value: confirmPassword },
  });
  fireEvent.click(screen.getByRole("button", { name: "パスワードを設定する" }));
};

describe("ResetPasswordForm のトークン検査", () => {
  beforeEach(() => {
    resetPassword.mockReset();
    push.mockClear();
  });

  it("トークンが無ければフォームを出さず案内を出す", () => {
    render(<ResetPasswordForm token={null} errorCode={null} />);

    expect(screen.queryByLabelText("新しいパスワード")).not.toBeInTheDocument();
    expect(screen.getByText(/リンクが無効か期限切れです/)).toBeInTheDocument();
  });

  it("error が付いていればフォームを出さない", () => {
    render(<ResetPasswordForm token="t0ken" errorCode="INVALID_TOKEN" />);

    expect(screen.queryByLabelText("新しいパスワード")).not.toBeInTheDocument();
  });

  it("フォームを出さない場合は再申請への導線を出す", () => {
    render(<ResetPasswordForm token={null} errorCode="INVALID_TOKEN" />);

    expect(
      screen.getByRole("link", { name: "パスワードの再設定を申し込む" }),
    ).toHaveAttribute("href", "/forgot-password");
  });
});

describe("ResetPasswordForm の送信", () => {
  beforeEach(() => {
    resetPassword.mockReset();
    push.mockClear();
  });

  it("確認用が一致しない場合は送信しない", async () => {
    render(<ResetPasswordForm token="t0ken" errorCode={null} />);
    fillAndSubmit("password123", "password124");

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("短すぎるパスワードは送信しない", async () => {
    render(<ResetPasswordForm token="t0ken" errorCode={null} />);
    fillAndSubmit("short", "short");

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("成功したら新しいパスワードとトークンを渡し、ログイン画面へ遷移する", async () => {
    resetPassword.mockResolvedValue({ error: null });
    render(<ResetPasswordForm token="t0ken" errorCode={null} />);
    fillAndSubmit("password123", "password123");

    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith("/login?reset=1");
    });
    // confirmPassword はサーバーへ送らない。
    expect(resetPassword).toHaveBeenCalledWith({
      newPassword: "password123",
      token: "t0ken",
    });
  });

  it("INVALID_TOKEN で失敗したら再申請を促す文言を出し、遷移しない", async () => {
    resetPassword.mockResolvedValue({ error: { code: "INVALID_TOKEN" } });
    render(<ResetPasswordForm token="t0ken" errorCode={null} />);
    fillAndSubmit("password123", "password123");

    expect(await screen.findByRole("alert")).toHaveTextContent("お申し込み");
    expect(push).not.toHaveBeenCalled();
  });

  it("Promise が reject した場合もエラーを出しボタンが再度有効になる", async () => {
    resetPassword.mockRejectedValue(new Error("network"));
    render(<ResetPasswordForm token="t0ken" errorCode={null} />);
    fillAndSubmit("password123", "password123");

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "パスワードを設定する" }),
    ).not.toBeDisabled();
    expect(push).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/auth/ResetPasswordForm.test.tsx`
Expected: FAIL — `Failed to resolve import "./ResetPasswordForm"`

- [ ] **Step 3: Write the component**

`src/components/auth/ResetPasswordForm.tsx`:

```tsx
"use client";

import { Cause, Effect, Exit, Option } from "effect";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authErrorMessage } from "@/features/auth/messages";
import {
  PASSWORD_RESET_DONE_PATH,
  resetTokenState,
} from "@/features/auth/password-reset/domain";
import { passwordResetSchema } from "@/features/auth/password-reset/schema";
import { resetPassword } from "@/features/auth/password-reset/usecase";
import { authClient } from "@/shared/lib/auth-client";
import { MIN_PASSWORD_LENGTH } from "@/shared/lib/password-policy";

export function ResetPasswordForm({
  token,
  errorCode,
}: {
  token: string | null;
  errorCode: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const state = resetTokenState(token, errorCode);

  // フォームを出す前にトークンを見るのは、入力させてから弾くより早く
  // 「もう一度申し込む」へ誘導できるため。送信時の INVALID_TOKEN
  // （申し込み直後に期限が切れた場合など）は下の分岐で拾う。
  if (state.kind === "invalid") {
    return (
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold text-slate-800">
          パスワードを再設定できません
        </h1>
        <p className="text-sm text-slate-700">{state.message}</p>
        <Link
          href="/forgot-password"
          className="text-sm text-slate-600 underline"
        >
          パスワードの再設定を申し込む
        </Link>
      </div>
    );
  }

  const onSubmit = async (formData: FormData) => {
    setError(null);

    const parsed = passwordResetSchema.safeParse({
      newPassword: formData.get("newPassword"),
      confirmPassword: formData.get("confirmPassword"),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setPending(true);
    const exit = await Effect.runPromiseExit(
      resetPassword(
        (input) => authClient.resetPassword(input),
        parsed.data,
        state.token,
      ),
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

    // revokeSessionsOnPasswordReset により既存セッションは失効しており、
    // ここでセッションが発行されることもない。読み直すものが無いので
    // router.refresh() は呼ばない。
    router.push(PASSWORD_RESET_DONE_PATH);
  };

  return (
    <div className="w-full max-w-sm space-y-6">
      <h1 className="text-xl font-bold text-slate-800">
        新しいパスワードの設定
      </h1>

      <form action={onSubmit} className="space-y-4">
        <div className="space-y-1">
          <label
            htmlFor="newPassword"
            className="block text-sm font-medium text-slate-700"
          >
            新しいパスワード
          </label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-slate-500">
            {MIN_PASSWORD_LENGTH} 文字以上
          </p>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="confirmPassword"
            className="block text-sm font-medium text-slate-700"
          >
            新しいパスワード（確認）
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
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
          {pending ? "設定中..." : "パスワードを設定する"}
        </button>
      </form>

      <p className="text-xs text-slate-500">
        設定すると、他の端末でのログインは解除されます。
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/auth/ResetPasswordForm.test.tsx`
Expected: PASS（8 tests）

- [ ] **Step 5: ページを足す**

`src/app/(auth)/reset-password/page.tsx`:

```tsx
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export default async function ResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">) {
  const params = await searchParams;

  // Better Auth の reset-password/:token がここへリダイレクトする際に付ける
  // 2 つのクエリ。有効なら token、無効・期限切れなら error=INVALID_TOKEN。
  // 文言への写像は resetTokenState が行うので、ここでは素通しする。
  const rawToken = params.token;
  const rawError = params.error;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <ResetPasswordForm
        token={typeof rawToken === "string" ? rawToken : null}
        errorCode={typeof rawError === "string" ? rawError : null}
      />
    </main>
  );
}
```

- [ ] **Step 6: 型チェック**

Run: `pnpm exec next typegen && pnpm typecheck`
Expected: エラーなし。`PageProps<"/reset-password">` は typegen が新しいルートを拾って初めて解決する

- [ ] **Step 7: Commit**

```bash
git add src/components/auth/ResetPasswordForm.tsx src/components/auth/ResetPasswordForm.test.tsx "src/app/(auth)/reset-password/page.tsx"
git commit -m "$(cat <<'EOF'
feat(auth): add the new password page

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: ログイン画面の導線と完了案内

「パスワードをお忘れですか？」リンクと、`/login?reset=1` で戻ってきたときの案内を足す。

**Files:**
- Modify: `src/components/auth/LoginForm.tsx`
- Modify: `src/components/auth/LoginForm.test.tsx`
- Modify: `src/app/(auth)/login/page.tsx`

**Interfaces:**
- Consumes: `passwordResetNotice`（Task 6）
- Produces: `LoginForm` が `reset?: boolean` prop を受け取る

- [ ] **Step 1: Write the failing test**

`src/components/auth/LoginForm.test.tsx` の末尾に足す（既存の `vi.mock` と import はそのまま使う）:

```tsx
describe("LoginForm のパスワードリセット導線", () => {
  it("申請画面へのリンクを出す", () => {
    render(<LoginForm redirectTo="/" />);

    expect(
      screen.getByRole("link", { name: "パスワードをお忘れですか？" }),
    ).toHaveAttribute("href", "/forgot-password");
  });

  it("reset が真なら再設定完了の案内を出す", () => {
    render(<LoginForm redirectTo="/" reset />);

    expect(screen.getByRole("status")).toHaveTextContent("パスワードを再設定しました");
  });

  it("reset が偽なら案内を出さない", () => {
    render(<LoginForm redirectTo="/" />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("確認メールの案内が優先される", () => {
    // 両方のクエリが同時に付く経路は無いが、付いた場合に 2 つの案内が
    // 重ならないことを固定しておく。
    render(<LoginForm redirectTo="/" verified reset />);

    expect(screen.getByRole("status")).toHaveTextContent("登録が完了しました");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/auth/LoginForm.test.tsx`
Expected: FAIL — リンクが見つからず、`reset` prop が型に無い

- [ ] **Step 3: LoginForm を変更する**

import に足す（既存の `@/features/auth/domain` からの import 行はそのまま残す）:

```ts
import { passwordResetNotice } from "@/features/auth/password-reset/domain";
```

props に `reset` を足す:

```tsx
export function LoginForm({
  redirectTo,
  verified = false,
  verifyError = null,
  reset = false,
}: {
  redirectTo: string;
  verified?: boolean;
  verifyError?: string | null;
  reset?: boolean;
}) {
```

`notice` の行を置き換える:

```ts
  // 案内の枠は 1 つしか出さない。確認メール由来とリセット由来が同時に
  // 付く経路は無いが、付いた場合は確認メール側を優先する（ログインできる
  // かどうかに直結するのはそちらのため）。
  const notice =
    verificationNotice(verified, verifyError) ?? passwordResetNotice(reset);
```

「新規登録」への案内の `<p>` の**直前**にリンクを足す:

```tsx
      <p className="text-sm text-slate-600">
        <Link href="/forgot-password" className="underline">
          パスワードをお忘れですか？
        </Link>
      </p>
```

- [ ] **Step 4: ログインページで `reset` を受け渡す**

`src/app/(auth)/login/page.tsx` の `verifyError` を組み立てている行の後に足す:

```ts
  // 再設定を終えて戻ってきた場合に付くクエリ。
  const reset = params.reset === "1";
```

`<LoginForm ... />` に `reset={reset}` を足す:

```tsx
      <LoginForm
        redirectTo={redirectTo}
        verified={verified}
        verifyError={verifyError}
        reset={reset}
      />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/auth/LoginForm.test.tsx`
Expected: PASS（既存分 + 新規 4 tests）

- [ ] **Step 6: 全体を検証する**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: テスト全件 PASS、typecheck エラーなし、lint は CRLF 由来の既知ノイズ以外の指摘なし

- [ ] **Step 7: Commit**

```bash
git add src/components/auth/LoginForm.tsx src/components/auth/LoginForm.test.tsx "src/app/(auth)/login/page.tsx"
git commit -m "$(cat <<'EOF'
feat(auth): link password reset from the login form

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: 手動確認

自動テストは Better Auth 本体を通らないため、経路が実際につながっていることを一度手で確かめる。

**Files:** なし（実行のみ）

- [ ] **Step 1: 開発サーバーを起動する**

```bash
pnpm dev
```

`MAILTRAP_TOKEN` が未設定ならコンソール Mailer が動き、メール本文とリンクがサーバーログに `====...` の区切り線付きで出る。

- [ ] **Step 2: 存在しないメールアドレスで申請する**

`http://localhost:3000/forgot-password` で `nobody@example.com` を送信する。
Expected: 「リセット用のリンクを送信しました」が出る。サーバーログにメールは出ない（Better Auth の列挙対策どおり）。

- [ ] **Step 3: 実在するユーザーで申請する**

登録済みのメールアドレスで送信する。
Expected: サーバーログに件名「【大会運営】パスワードの再設定」と `URL: http://localhost:3000/api/auth/reset-password/...?callbackURL=%2Freset-password` が出る。

- [ ] **Step 4: リンクを開く**

ログの URL をブラウザで開く。
Expected: `http://localhost:3000/reset-password?token=...` へリダイレクトされ、パスワード入力欄が 2 つ出る。

- [ ] **Step 5: 新しいパスワードを設定する**

Expected: `/login?reset=1` へ遷移し、「パスワードを再設定しました。新しいパスワードでログインしてください」が出る。

- [ ] **Step 6: 新旧のパスワードで確認する**

Expected: 新しいパスワードでログインできる。古いパスワードでは「ユーザー名・メールアドレスまたはパスワードが正しくありません」になる。

- [ ] **Step 7: 使用済みリンクを確認する**

Step 4 の URL をもう一度開く。
Expected: `/reset-password?error=INVALID_TOKEN` へ飛び、「リンクが無効か期限切れです。お手数ですが再度お申し込みください」と再申請リンクが出る。

- [ ] **Step 8: セッション失効を確認する**

別ブラウザ（またはシークレットウィンドウ）で同じユーザーにログインしておき、そのうえで Step 3〜5 を実行してから元のウィンドウをリロードする。
Expected: ログアウトされている。

- [ ] **Step 9: 未確認アカウントの確認済み化を確認する**

新規登録して確認メールのリンクを**踏まず**に放置したアカウントで、Step 3〜5 を実行する。
Expected: 確認メールを踏まずにそのままログインできる（`onPasswordReset` が `emailVerified` を立てているため）。

- [ ] **Step 10: 結果を報告する**

うまくいかない項目があれば、対応するタスクへ戻って直す。すべて通ったら手動確認は完了。コミットするものは無い。

---

## Self-Review 結果

**Spec coverage:** 設計書の各節に対応するタスク —
経路(Task 8-11) / `auth.ts` の 4 設定(Task 8) / `redirectTo` 固定(Task 6, 7) /
Google のみのアカウントの副作用(設計書に記載のみ、コード変更不要) /
ファイル構成(Task 1-11 で全ファイル網羅) / エラー写像(Task 4) /
列挙対策(Task 7 のコメント、Task 9 のテスト) / テスト(各タスク) /
手動確認(Task 12)。未カバーの節なし。

**Type consistency:** `resetTokenState` の戻り値 `{ kind: "form" | "invalid" }` は
Task 6 の定義と Task 10 の利用で一致。`requestPasswordReset(port, input)` は
2 引数（`redirectTo` は内部で固定）で Task 7 の定義と Task 9 の呼び出しが一致。
`resetPassword(port, input, token)` は 3 引数で Task 7 と Task 10 が一致。
`PASSWORD_RESET_DONE_PATH` は Task 6 の `"/login?reset=1"` と Task 10 のテスト期待値が一致。

**API 検証済み:** `emailAndPassword` の 4 キー、`onPasswordReset({ user })`、
`sendResetPassword({ user, url, token })`、`authClient.requestPasswordReset({ email, redirectTo })`、
`authClient.resetPassword({ newPassword, token })` は better-auth 1.7.2 に対する
`tsc --noEmit` プローブで存在と型を確認済み。
