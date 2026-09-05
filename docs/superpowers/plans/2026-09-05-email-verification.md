# メールアドレス登録の仮登録・本登録化(認証メール)実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** メール/パスワードの新規登録を仮登録(`emailVerified = false`)で止め、Mailtrap で送る確認メールのリンクを開いた時点で本登録にする。

**Architecture:** Better Auth の `emailAndPassword.requireEmailVerification` と `emailVerification` に乗せる。DB スキーマの変更は無く、既存の `User.emailVerified` をそのまま状態に使う。メール送信は `src/shared/lib/mail/` に薄い `Mailer` インターフェースを置き、環境変数で Mailtrap 実装とコンソール出力のフォールバックを切り替える。環境変数の解釈とメール本文の組み立ては純粋関数に切り出してテストし、SDK に触る配線部分(`mail/index.ts`、`auth.ts`)は薄く保って単体テストの対象外にする。

**Tech Stack:** Next.js 16 / React 19 / TypeScript / Better Auth 1.7.2 / Prisma 7 / Zod 4 / Effect / Vitest + Testing Library / Biome / pnpm / mailtrap 4.10.0

**設計書:** `docs/superpowers/specs/2026-09-05-email-verification-design.md`

## Global Constraints

- パッケージ管理は **pnpm** を使う(`pnpm add` / `pnpm exec` / `pnpm test`)。
- 新規ファイルのコメントと UI 文言は日本語。既存ファイルのコメント密度に合わせ、「なぜそうしたか」を書く。
- テストは Vitest。`pnpm exec vitest run <path>` で単体実行する。
- `src/features/` 配下に `.tsx` を置かない。画面は `src/components/auth/` に置く(`docs/code-design/architecture.md` の「例外: features/auth」)。
- `src/shared/lib/` から `src/features/` へ import しない(依存方向が逆転するため)。
- 確認リンクの有効期間は **24 時間**。値は `src/shared/lib/email-verification-policy.ts` の 1 か所だけに置き、Better Auth 設定・メール本文・画面文言はそこから読む。
- `MAILTRAP_TOKEN` 未設定時はコンソール出力にフォールバックする。ただし `NODE_ENV === "production"` かつ未設定なら例外を投げる。
- 各タスクの最後にコミットする。コミットメッセージ末尾に以下を付ける。

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

- ワークツリーを新規に作った場合は、着手前に `pnpm exec next typegen` を実行し、メインのチェックアウトから `.env` をコピーする(`PageProps` などの型が生成されないと `pnpm typecheck` が落ちる)。
- Windows のチェックアウトでは Biome が CRLF だけを理由に大量のエラーを出すことがある。lint 結果は内容で判断する。

## File Structure

| ファイル | 責務 |
| --- | --- |
| `src/shared/lib/mail/types.ts` | 新規。`MailAddress` / `MailMessage` / `Mailer` の型だけ |
| `src/shared/lib/mail/config.ts` | 新規。環境変数 → `MailerConfig` / 差出人の解決(純粋) |
| `src/shared/lib/mail/console-mailer.ts` | 新規。送信せずログに出す `Mailer` |
| `src/shared/lib/mail/mailtrap-mailer.ts` | 新規。`MailtrapClient` を `Mailer` に適合させる |
| `src/shared/lib/mail/index.ts` | 新規。`getMailer()`。`mailtrap` を import する唯一の場所 |
| `src/shared/lib/email-verification-policy.ts` | 新規。確認リンクの有効期間の定数 |
| `src/shared/lib/auth-verification-email.ts` | 新規。確認メールの `MailMessage` を組み立てる純粋関数 |
| `src/shared/errors/auth-error.ts` | 変更。`EmailNotVerified` を追加 |
| `src/features/auth/messages.ts` | 変更。`EmailNotVerified` の文言 |
| `src/features/auth/domain.ts` | 変更。確認リンクから戻ったときの案内文 `verificationNotice` |
| `src/features/auth/signup/usecase.ts` | 変更。`callbackURL` をポートへ渡す |
| `src/shared/lib/auth.ts` | 変更。`requireEmailVerification` と `emailVerification` の配線 |
| `prisma/migrations/20260905120000_verify_existing_users/migration.sql` | 新規。既存ユーザーを本登録済みにする |
| `.env.example` | 変更。Mailtrap の環境変数 |
| `src/components/auth/SignupForm.tsx` | 変更。`callbackURL` を渡し、成功時は完了表示に切り替える |
| `src/components/auth/LoginForm.tsx` | 変更。確認結果の案内を表示 |
| `src/app/(auth)/login/page.tsx` | 変更。`verified` / `error` を `LoginForm` へ渡す |

---

### Task 1: メール送信基盤

**Files:**
- Create: `src/shared/lib/mail/types.ts`
- Create: `src/shared/lib/mail/config.ts`
- Create: `src/shared/lib/mail/console-mailer.ts`
- Create: `src/shared/lib/mail/mailtrap-mailer.ts`
- Create: `src/shared/lib/mail/index.ts`
- Test: `src/shared/lib/mail/config.test.ts`
- Test: `src/shared/lib/mail/console-mailer.test.ts`
- Test: `src/shared/lib/mail/mailtrap-mailer.test.ts`
- Modify: `package.json`(`pnpm add mailtrap`)

**Interfaces:**
- Consumes: なし(このタスクが最初)
- Produces:
  - `type MailAddress = { email: string; name?: string }`
  - `type MailMessage = { from: MailAddress; to: MailAddress[]; subject: string; text: string; html: string }`
  - `type Mailer = { send: (message: MailMessage) => Promise<void> }`
  - `resolveMailerConfig(env: MailEnv): MailerConfig`
  - `resolveMailFrom(env: MailEnv): MailAddress`
  - `createConsoleMailer(log?: (message: string) => void): Mailer`
  - `createMailtrapMailer(client: MailtrapSendClient): Mailer`
  - `getMailer(): Mailer`(`@/shared/lib/mail` から)

- [ ] **Step 1: 依存を追加する**

```bash
pnpm add mailtrap
```

- [ ] **Step 2: 型を定義する**

`src/shared/lib/mail/types.ts` を作る。

```ts
/** メールの宛先・差出人。Mailtrap の Address と同じ形にしてある。 */
export type MailAddress = {
  email: string;
  name?: string;
};

/**
 * 送信する 1 通のメール。テキストと HTML の両方を必ず持たせる。
 * HTML を読めない環境でも本文が読めるようにするため。
 */
export type MailMessage = {
  from: MailAddress;
  to: MailAddress[];
  subject: string;
  text: string;
  html: string;
};

/**
 * メール送信の口。実装は Mailtrap 版とコンソール版の 2 つで、
 * 呼び出し側はどちらかを知らずに使う。
 */
export type Mailer = {
  send: (message: MailMessage) => Promise<void>;
};
```

- [ ] **Step 3: 環境変数の解釈のテストを書く**

`src/shared/lib/mail/config.test.ts` を作る。

```ts
import { describe, expect, it } from "vitest";
import { resolveMailerConfig, resolveMailFrom } from "./config";

describe("resolveMailerConfig", () => {
  it("トークンが無ければコンソール実装を選ぶ", () => {
    expect(resolveMailerConfig({})).toEqual({ kind: "console" });
  });

  it("空白だけのトークンは未設定として扱う", () => {
    expect(resolveMailerConfig({ MAILTRAP_TOKEN: "   " })).toEqual({
      kind: "console",
    });
  });

  it("本番でトークンが無ければ例外を投げる", () => {
    expect(() => resolveMailerConfig({ NODE_ENV: "production" })).toThrow(
      /MAILTRAP_TOKEN/,
    );
  });

  it("トークンがあれば Mailtrap 実装を選ぶ", () => {
    expect(resolveMailerConfig({ MAILTRAP_TOKEN: "tok" })).toEqual({
      kind: "mailtrap",
      token: "tok",
      sandbox: false,
    });
  });

  it("sandbox 指定時は受信箱 ID を数値で返す", () => {
    expect(
      resolveMailerConfig({
        MAILTRAP_TOKEN: "tok",
        MAILTRAP_SANDBOX: "1",
        MAILTRAP_TEST_INBOX_ID: "1234",
      }),
    ).toEqual({ kind: "mailtrap", token: "tok", sandbox: true, testInboxId: 1234 });
  });

  it("sandbox 指定なのに受信箱 ID が無ければ例外を投げる", () => {
    expect(() =>
      resolveMailerConfig({ MAILTRAP_TOKEN: "tok", MAILTRAP_SANDBOX: "1" }),
    ).toThrow(/MAILTRAP_TEST_INBOX_ID/);
  });

  it("sandbox 指定なのに受信箱 ID が数値でなければ例外を投げる", () => {
    expect(() =>
      resolveMailerConfig({
        MAILTRAP_TOKEN: "tok",
        MAILTRAP_SANDBOX: "1",
        MAILTRAP_TEST_INBOX_ID: "inbox",
      }),
    ).toThrow(/MAILTRAP_TEST_INBOX_ID/);
  });
});

describe("resolveMailFrom", () => {
  it("環境変数の差出人を使う", () => {
    expect(
      resolveMailFrom({
        MAIL_FROM_ADDRESS: "no-reply@tournament.example",
        MAIL_FROM_NAME: "大会運営",
      }),
    ).toEqual({ email: "no-reply@tournament.example", name: "大会運営" });
  });

  it("未設定なら既定値を使う", () => {
    expect(resolveMailFrom({})).toEqual({
      email: "no-reply@example.com",
      name: "大会運営",
    });
  });
});
```

- [ ] **Step 4: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/shared/lib/mail/config.test.ts`
Expected: FAIL(`Failed to resolve import "./config"`)

- [ ] **Step 5: 環境変数の解釈を実装する**

`src/shared/lib/mail/config.ts` を作る。

```ts
import type { MailAddress } from "./types";

/**
 * このモジュールが読む環境変数。process.env をそのまま渡せる形にしつつ、
 * テストからは必要なキーだけのオブジェクトを渡せるようにしてある。
 */
export type MailEnv = {
  MAILTRAP_TOKEN?: string;
  MAILTRAP_SANDBOX?: string;
  MAILTRAP_TEST_INBOX_ID?: string;
  MAIL_FROM_ADDRESS?: string;
  MAIL_FROM_NAME?: string;
  NODE_ENV?: string;
};

export type MailerConfig =
  | { kind: "console" }
  | { kind: "mailtrap"; token: string; sandbox: false }
  | { kind: "mailtrap"; token: string; sandbox: true; testInboxId: number };

/**
 * 環境変数からどの Mailer を使うかを決める。
 *
 * トークンが無い環境ではコンソール出力に落として、Mailtrap の設定なしでも
 * 登録フロー全体をローカルで踏めるようにする。ただし本番で同じことをすると
 * メールが黙って消えるため、そこだけは例外にして起動時に気づけるようにする。
 */
export const resolveMailerConfig = (env: MailEnv): MailerConfig => {
  const token = env.MAILTRAP_TOKEN?.trim() ?? "";
  if (token === "") {
    if (env.NODE_ENV === "production") {
      throw new Error(
        "MAILTRAP_TOKEN が未設定です。本番ではメール送信を無効にできません",
      );
    }
    return { kind: "console" };
  }

  if (env.MAILTRAP_SANDBOX !== "1") {
    return { kind: "mailtrap", token, sandbox: false };
  }

  // sandbox(Email Testing)は受信箱を指定しないと送り先が決まらない。
  const testInboxId = Number(env.MAILTRAP_TEST_INBOX_ID);
  if (!Number.isInteger(testInboxId) || testInboxId <= 0) {
    throw new Error(
      "MAILTRAP_SANDBOX=1 のときは MAILTRAP_TEST_INBOX_ID に受信箱 ID が必要です",
    );
  }
  return { kind: "mailtrap", token, sandbox: true, testInboxId };
};

/**
 * 差出人。未設定でも例外にはしない。届かない原因としては
 * トークン未設定より軽く、ローカルで動かす妨げにする必要が無いため。
 */
export const resolveMailFrom = (env: MailEnv): MailAddress => ({
  email: env.MAIL_FROM_ADDRESS?.trim() || "no-reply@example.com",
  name: env.MAIL_FROM_NAME?.trim() || "大会運営",
});
```

- [ ] **Step 6: テストが通ることを確認する**

Run: `pnpm exec vitest run src/shared/lib/mail/config.test.ts`
Expected: PASS(9 tests)

- [ ] **Step 7: コンソール実装のテストを書く**

`src/shared/lib/mail/console-mailer.test.ts` を作る。

```ts
import { describe, expect, it, vi } from "vitest";
import { createConsoleMailer } from "./console-mailer";

describe("createConsoleMailer", () => {
  it("宛先・件名・本文をログに出す", async () => {
    const log = vi.fn();
    await createConsoleMailer(log).send({
      from: { email: "no-reply@example.com", name: "大会運営" },
      to: [{ email: "user@example.com", name: "竹添" }],
      subject: "確認",
      text: "https://example.com/verify?token=abc",
      html: "<p>ignored</p>",
    });

    const output = log.mock.calls[0][0] as string;
    expect(output).toContain("user@example.com");
    expect(output).toContain("確認");
    // 認証 URL をログからコピーして登録を完了できることが、この実装の目的。
    expect(output).toContain("https://example.com/verify?token=abc");
  });
});
```

- [ ] **Step 8: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/shared/lib/mail/console-mailer.test.ts`
Expected: FAIL(`Failed to resolve import "./console-mailer"`)

- [ ] **Step 9: コンソール実装を書く**

`src/shared/lib/mail/console-mailer.ts` を作る。

```ts
import type { MailMessage, Mailer } from "./types";

/**
 * Mailtrap を設定していない環境向けの代替。送信はせず、宛先・件名・
 * テキスト本文をサーバログに出す。本文には認証 URL が入っているので、
 * ログからコピーすれば登録フローを最後まで踏める。
 *
 * log を引数にしているのは、テストから console を汚さずに検証するため。
 */
export const createConsoleMailer = (
  log: (message: string) => void = console.info,
): Mailer => ({
  send: async (message: MailMessage) => {
    log(
      [
        "[mail] Mailtrap が未設定のため送信しません",
        `to: ${message.to.map((address) => address.email).join(", ")}`,
        `subject: ${message.subject}`,
        message.text,
      ].join("\n"),
    );
  },
});
```

- [ ] **Step 10: テストが通ることを確認する**

Run: `pnpm exec vitest run src/shared/lib/mail/console-mailer.test.ts`
Expected: PASS(1 test)

- [ ] **Step 11: Mailtrap アダプタのテストを書く**

`src/shared/lib/mail/mailtrap-mailer.test.ts` を作る。

```ts
import { describe, expect, it, vi } from "vitest";
import { createMailtrapMailer } from "./mailtrap-mailer";

const message = {
  from: { email: "no-reply@example.com", name: "大会運営" },
  to: [{ email: "user@example.com", name: "竹添" }],
  subject: "確認",
  text: "text body",
  html: "<p>html body</p>",
};

describe("createMailtrapMailer", () => {
  it("MailMessage をそのまま client.send へ渡す", async () => {
    const send = vi.fn().mockResolvedValue({ success: true, message_ids: [] });
    await createMailtrapMailer({ send }).send(message);
    expect(send).toHaveBeenCalledWith(message);
  });

  it("client.send が reject したらそのまま伝播する", async () => {
    const send = vi.fn().mockRejectedValue(new Error("mailtrap down"));
    await expect(createMailtrapMailer({ send }).send(message)).rejects.toThrow(
      "mailtrap down",
    );
  });
});
```

- [ ] **Step 12: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/shared/lib/mail/mailtrap-mailer.test.ts`
Expected: FAIL(`Failed to resolve import "./mailtrap-mailer"`)

- [ ] **Step 13: Mailtrap アダプタを書く**

`src/shared/lib/mail/mailtrap-mailer.ts` を作る。

```ts
import type { MailMessage, Mailer } from "./types";

/**
 * MailtrapClient のうち、このアプリが使う部分だけを構造で受ける。
 * SDK の型に依存させないことで、このモジュールのテストが
 * mailtrap パッケージ(axios を抱える)を読み込まずに済む。
 */
export type MailtrapSendClient = {
  send: (mail: MailMessage) => Promise<unknown>;
};

/**
 * MailMessage の形は Mailtrap の Mail に合わせてあるため、詰め替えは要らない。
 * それでもこの層を挟むのは、戻り値を捨てて Mailer の形(Promise<void>)に
 * 揃えるためと、将来 SDK を差し替える場合の受け口を 1 か所にするため。
 */
export const createMailtrapMailer = (client: MailtrapSendClient): Mailer => ({
  send: async (message: MailMessage) => {
    await client.send(message);
  },
});
```

- [ ] **Step 14: テストが通ることを確認する**

Run: `pnpm exec vitest run src/shared/lib/mail/mailtrap-mailer.test.ts`
Expected: PASS(2 tests)

- [ ] **Step 15: 配線を書く**

`src/shared/lib/mail/index.ts` を作る。ここだけが `mailtrap` を import する。
単体テストは持たない(`auth.ts` と同じく、実物を読み込むと外部依存が付いてくるため)。

```ts
import "server-only";

import { MailtrapClient } from "mailtrap";
import { resolveMailerConfig } from "./config";
import { createConsoleMailer } from "./console-mailer";
import { createMailtrapMailer } from "./mailtrap-mailer";
import type { Mailer } from "./types";

export { resolveMailFrom } from "./config";
export type { MailAddress, MailMessage, Mailer } from "./types";

let cached: Mailer | null = null;

/**
 * 環境変数から Mailer を 1 度だけ組み立てて使い回す。
 * モジュール読み込み時ではなく初回呼び出し時に組み立てるのは、
 * 本番でトークンが無いときの例外を、ビルド時ではなく実行時に出すため。
 */
export const getMailer = (): Mailer => {
  if (cached !== null) return cached;

  const config = resolveMailerConfig(process.env);
  cached =
    config.kind === "console"
      ? createConsoleMailer()
      : createMailtrapMailer(
          new MailtrapClient({
            token: config.token,
            sandbox: config.sandbox,
            testInboxId: config.sandbox ? config.testInboxId : undefined,
          }),
        );
  return cached;
};
```

`MailMessage` は Mailtrap の `Mail` 型に構造的に適合するよう作ってあるため、
`new MailtrapClient(...)` をそのまま `MailtrapSendClient` として渡せる。
もし型エラーになったら、`MailtrapSendClient.send` の引数を
`(mail: MailMessage & { html: string; text: string })` のように狭めるのではなく、
`createMailtrapMailer({ send: (mail) => client.send({ ...mail }) })` の形で
オブジェクトリテラルにして渡すこと(union のどのメンバーに当てるかが決まる)。

- [ ] **Step 16: 型検査と lint を通す**

Run: `pnpm typecheck`
Expected: エラー無し

Run: `pnpm lint:fix`
Expected: 変更内容に起因するエラーが残らない(CRLF だけの指摘は無視してよい)

- [ ] **Step 17: コミット**

```bash
git add package.json pnpm-lock.yaml src/shared/lib/mail
git commit -m "$(cat <<'EOF'
feat(mail): add Mailtrap mailer with console fallback

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 確認メールの本文

**Files:**
- Create: `src/shared/lib/email-verification-policy.ts`
- Create: `src/shared/lib/auth-verification-email.ts`
- Test: `src/shared/lib/auth-verification-email.test.ts`

**Interfaces:**
- Consumes: `MailAddress` / `MailMessage`(`@/shared/lib/mail/types`、Task 1)
- Produces:
  - `VERIFICATION_LINK_EXPIRES_IN_HOURS: number`(= 24)
  - `VERIFICATION_LINK_EXPIRES_IN_SECONDS: number`
  - `VERIFICATION_EMAIL_SUBJECT: string`
  - `buildVerificationEmail(args: { from: MailAddress; to: MailAddress; url: string }): MailMessage`

- [ ] **Step 1: 有効期間の定数を置く**

`src/shared/lib/email-verification-policy.ts` を作る。
`password-policy.ts` と同じく、サーバ設定・メール本文・画面文言の
3 か所で同じ値を使うための唯一の置き場所にする。

```ts
/**
 * 確認リンクの有効期間。
 *
 * Better Auth の emailVerification.expiresIn、確認メールの本文、
 * 登録完了画面の案内の 3 か所で同じ値を使うため、ここに 1 つだけ持つ。
 * Better Auth の既定は 1 時間だが、翌日メールに気づく場合を考えて長くしてある。
 * 切れてもログインし直せば自動で再送されるので、長さの代償は小さい。
 */
export const VERIFICATION_LINK_EXPIRES_IN_HOURS = 24;

export const VERIFICATION_LINK_EXPIRES_IN_SECONDS =
  VERIFICATION_LINK_EXPIRES_IN_HOURS * 60 * 60;
```

- [ ] **Step 2: 本文組み立てのテストを書く**

`src/shared/lib/auth-verification-email.test.ts` を作る。

```ts
import { describe, expect, it } from "vitest";
import {
  VERIFICATION_EMAIL_SUBJECT,
  buildVerificationEmail,
} from "./auth-verification-email";

const from = { email: "no-reply@example.com", name: "大会運営" };
const url = "https://app.example.com/api/auth/verify-email?token=abc&callbackURL=%2Flogin";

describe("buildVerificationEmail", () => {
  it("差出人・宛先・件名を設定する", () => {
    const mail = buildVerificationEmail({
      from,
      to: { email: "user@example.com", name: "竹添" },
      url,
    });

    expect(mail.from).toEqual(from);
    expect(mail.to).toEqual([{ email: "user@example.com", name: "竹添" }]);
    expect(mail.subject).toBe(VERIFICATION_EMAIL_SUBJECT);
  });

  it("テキスト本文に認証 URL と有効期間を入れる", () => {
    const mail = buildVerificationEmail({
      from,
      to: { email: "user@example.com", name: "竹添" },
      url,
    });

    expect(mail.text).toContain(url);
    expect(mail.text).toContain("24 時間");
    expect(mail.text).toContain("竹添");
  });

  it("HTML 本文にリンクを入れる", () => {
    const mail = buildVerificationEmail({
      from,
      to: { email: "user@example.com", name: "竹添" },
      url,
    });

    // URL 中の & は HTML では実体参照にしないと属性値が壊れる。
    expect(mail.html).toContain(
      'href="https://app.example.com/api/auth/verify-email?token=abc&amp;callbackURL=%2Flogin"',
    );
  });

  it("名前を HTML エスケープする", () => {
    const mail = buildVerificationEmail({
      from,
      to: { email: "user@example.com", name: "<script>alert(1)</script>" },
      url,
    });

    // name はユーザーの入力なので、素通しすると HTML インジェクションになる。
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });

  it("名前が無くても組み立てられる", () => {
    const mail = buildVerificationEmail({
      from,
      to: { email: "user@example.com" },
      url,
    });

    expect(mail.text).toContain(url);
    expect(mail.html).toContain("user@example.com");
  });
});
```

- [ ] **Step 3: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/shared/lib/auth-verification-email.test.ts`
Expected: FAIL(`Failed to resolve import "./auth-verification-email"`)

- [ ] **Step 4: 本文組み立てを実装する**

`src/shared/lib/auth-verification-email.ts` を作る。

```ts
import type { MailAddress, MailMessage } from "@/shared/lib/mail/types";
import { VERIFICATION_LINK_EXPIRES_IN_HOURS } from "./email-verification-policy";

export const VERIFICATION_EMAIL_SUBJECT = "【大会運営】メールアドレスの確認";

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

/**
 * 仮登録したユーザーへ送る確認メールを組み立てる。
 *
 * 純粋関数にしてあるのは、送信経路(Mailtrap / コンソール)と切り離して
 * 文面とエスケープだけを検証できるようにするため。差出人を引数で受けるのも
 * 同じ理由で、環境変数の解決は呼び出し側(auth.ts)の責務にしてある。
 */
export const buildVerificationEmail = ({
  from,
  to,
  url,
}: {
  from: MailAddress;
  to: MailAddress;
  url: string;
}): MailMessage => {
  const greetingName = to.name ?? to.email;
  const expiresIn = `${VERIFICATION_LINK_EXPIRES_IN_HOURS} 時間`;

  const text = [
    `${greetingName} 様`,
    "",
    "ご登録ありがとうございます。現在は仮登録の状態です。",
    "次のリンクを開くと登録が完了します。",
    "",
    url,
    "",
    `このリンクは ${expiresIn} で無効になります。`,
    "期限が切れた場合は、ログインを試すと確認メールを送り直します。",
    "",
    "心当たりが無い場合は、このメールを破棄してください。",
  ].join("\n");

  const safeUrl = escapeHtml(url);
  const html = [
    `<p>${escapeHtml(greetingName)} 様</p>`,
    "<p>ご登録ありがとうございます。現在は仮登録の状態です。<br>次のリンクを開くと登録が完了します。</p>",
    `<p><a href="${safeUrl}">${safeUrl}</a></p>`,
    `<p>このリンクは ${expiresIn} で無効になります。<br>期限が切れた場合は、ログインを試すと確認メールを送り直します。</p>`,
    "<p>心当たりが無い場合は、このメールを破棄してください。</p>",
  ].join("\n");

  return {
    from,
    to: [to],
    subject: VERIFICATION_EMAIL_SUBJECT,
    text,
    html,
  };
};
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm exec vitest run src/shared/lib/auth-verification-email.test.ts`
Expected: PASS(5 tests)

- [ ] **Step 6: 型検査と lint を通す**

Run: `pnpm typecheck`
Expected: エラー無し

Run: `pnpm lint:fix`
Expected: 変更内容に起因するエラーが残らない

- [ ] **Step 7: コミット**

```bash
git add src/shared/lib/email-verification-policy.ts src/shared/lib/auth-verification-email.ts src/shared/lib/auth-verification-email.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): build verification email body

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: EmailNotVerified エラーと文言

**Files:**
- Modify: `src/shared/errors/auth-error.ts`
- Modify: `src/features/auth/messages.ts`
- Test: `src/shared/errors/auth-error.test.ts`(追記)
- Test: `src/features/auth/messages.test.ts`(追記)

**Interfaces:**
- Consumes: なし
- Produces:
  - `class EmailNotVerified`(`_tag: "EmailNotVerified"`、`AuthError` の一員)
  - `toAuthError("EMAIL_NOT_VERIFIED", cause)` が `EmailNotVerified` を返す
  - `authErrorMessage` が `EmailNotVerified` に「メールアドレスが未確認です。確認メールを再送しました」を返す

- [ ] **Step 1: 失敗するテストを書く**

`src/shared/errors/auth-error.test.ts` の `describe("toAuthError", ...)` の中、
`it("未知のコードは UnexpectedAuthError になる", ...)` の前に追記する。

```ts
  it("EMAIL_NOT_VERIFIED を EmailNotVerified に写像する", () => {
    // requireEmailVerification により、仮登録のままのサインインはこのコードで返る。
    expect(toAuthError("EMAIL_NOT_VERIFIED", null)._tag).toBe(
      "EmailNotVerified",
    );
  });
```

`src/features/auth/messages.test.ts` の `describe` の中、
`it("未知の失敗は汎用文言にする", ...)` の前に追記する。

```ts
  it("未確認のメールアドレスであることと、再送したことを伝える", () => {
    // sendOnSignIn を有効にしてあるため、この失敗と同時に確認メールが送り直される。
    expect(authErrorMessage(toAuthError("EMAIL_NOT_VERIFIED", null))).toBe(
      "メールアドレスが未確認です。確認メールを再送しました",
    );
  });
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/shared/errors/auth-error.test.ts src/features/auth/messages.test.ts`
Expected: FAIL(2 件。`EmailNotVerified` ではなく `UnexpectedAuthError` が返る)

- [ ] **Step 3: エラー型を追加する**

`src/shared/errors/auth-error.ts` を編集する。

`WeakPassword` の宣言の直後に追加する。

```ts
export class EmailNotVerified extends Data.TaggedError("EmailNotVerified")<{
  readonly code: string;
}> {}
```

`AuthError` の union に追加する。

```ts
export type AuthError =
  | InvalidCredentials
  | EmailAlreadyExists
  | UsernameAlreadyExists
  | WeakPassword
  | EmailNotVerified
  | UnexpectedAuthError;
```

`toAuthError` の `switch` に、`PASSWORD_TOO_LONG` の case の後・`default` の前へ追加する。

```ts
    // requireEmailVerification が有効なとき、仮登録のままのサインインで返る。
    // Better Auth はこの応答と同時に確認メールを送り直す（sendOnSignIn）。
    case "EMAIL_NOT_VERIFIED":
      return new EmailNotVerified({ code });
```

- [ ] **Step 4: 文言を追加する**

`src/features/auth/messages.ts` の `Match.tag("WeakPassword", ...)` の直後に追加する。

```ts
    Match.tag(
      "EmailNotVerified",
      // sendOnSignIn により、この失敗と同時に確認メールが送り直される。
      // 「再送しました」と言い切れるのはそのため。
      () => "メールアドレスが未確認です。確認メールを再送しました",
    ),
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm exec vitest run src/shared/errors/auth-error.test.ts src/features/auth/messages.test.ts`
Expected: PASS

- [ ] **Step 6: 型検査を通す**

Run: `pnpm typecheck`
Expected: エラー無し(`Match.exhaustive` が新タグを要求するため、Step 4 を忘れるとここで落ちる)

- [ ] **Step 7: コミット**

```bash
git add src/shared/errors/auth-error.ts src/shared/errors/auth-error.test.ts src/features/auth/messages.ts src/features/auth/messages.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): map EMAIL_NOT_VERIFIED to EmailNotVerified

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Better Auth の配線・マイグレーション・環境変数

**Files:**
- Modify: `src/shared/lib/auth.ts`
- Create: `prisma/migrations/20260905120000_verify_existing_users/migration.sql`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `getMailer` / `resolveMailFrom`(`@/shared/lib/mail`、Task 1)、`buildVerificationEmail`(Task 2)、`VERIFICATION_LINK_EXPIRES_IN_SECONDS`(Task 2)
- Produces: サーバ側の挙動のみ。他タスクが import するものは無い

このタスクに単体テストは無い。`auth.ts` を import すると Prisma アダプタが
DB へ触りに行きテストが固まるため(`auth-user-config.ts` の冒頭コメント参照)、
配線の確認は Task 6 の後の手動確認で行う。

- [ ] **Step 1: Better Auth の設定を書き換える**

`src/shared/lib/auth.ts` の import に追加する。

```ts
import { buildVerificationEmail } from "@/shared/lib/auth-verification-email";
import { VERIFICATION_LINK_EXPIRES_IN_SECONDS } from "@/shared/lib/email-verification-policy";
import { getMailer, resolveMailFrom } from "@/shared/lib/mail";
```

`emailAndPassword` ブロックを次に置き換える。

```ts
  emailAndPassword: {
    enabled: true,
    // 仮登録（emailVerified = false）のままではサインインさせない。
    // これを立てると sign-up 側で autoSignIn が常に無効化されるため
    // （better-auth/dist/api/routes/sign-up.mjs の shouldSkipAutoSignIn）、
    // autoSignIn は書かない。書くと有効に見えて紛らわしい。
    //
    // 副作用として、既存メールでの登録要求はエラーではなく「成功したふり」の
    // 汎用レスポンスになる（アカウント列挙対策）。そのため登録画面は
    // 成否によらず「確認メールを送信しました」を出す。
    requireEmailVerification: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    maxPasswordLength: MAX_PASSWORD_LENGTH,
  },
```

`socialProviders` ブロックの直前に `emailVerification` を追加する。

```ts
  emailVerification: {
    expiresIn: VERIFICATION_LINK_EXPIRES_IN_SECONDS,
    // 仮登録のままログインを試したら確認メールを送り直す。
    // 期限切れからの復帰がログイン操作だけで完結し、再送専用の画面が要らなくなる。
    sendOnSignIn: true,
    // リンクを開いた端末（メールを見たスマホなど）をログイン状態にしない。
    // 認証だけ済ませ、ログインは本人が使う端末で改めて行ってもらう。
    autoSignInAfterVerification: false,
    sendVerificationEmail: async ({ user, url }) => {
      await getMailer().send(
        buildVerificationEmail({
          from: resolveMailFrom(process.env),
          to: { email: user.email, name: user.name },
          url,
        }),
      );
    },
  },
```

- [ ] **Step 2: 既存ユーザーを本登録済みにするマイグレーションを作る**

`prisma/migrations/20260905120000_verify_existing_users/migration.sql` を作る。
スキーマは変わらないため、`prisma/schema.prisma` は編集しない。

```sql
-- requireEmailVerification を有効にすると、emailVerified が false のユーザーは
-- ログインできなくなる。User.emailVerified は @default(false) で、この変更まで
-- true になる経路が無かったため、既存ユーザーは全員が該当する。
-- 認証メールの仕組みより前に登録した人は本登録済みとして扱う。
UPDATE "User" SET "emailVerified" = true WHERE "emailVerified" = false;
```

- [ ] **Step 3: マイグレーションを適用する**

Run: `pnpm exec prisma migrate dev`
Expected: `20260905120000_verify_existing_users` が適用され、スキーマ差分は検出されない

DB に接続できない環境ではここは飛ばしてよい。その場合は Step 8 の手動確認の前に
必ず適用すること。

- [ ] **Step 4: 環境変数の雛形を追記する**

`.env.example` の末尾に追記する。

```
# Mailtrap（メール配信）
# MAILTRAP_TOKEN が空の場合は送信せず、確認 URL をサーバログに出力する。
# ローカルではこのままでも登録フローを最後まで踏める。
# ただし NODE_ENV=production かつ空だと、メール送信時に例外になる。
MAILTRAP_TOKEN=""
# "1" のとき Mailtrap の Email Testing（sandbox）受信箱へ送る。
# 実際のメールアドレスには届かないので、開発中はこちらを使う。
# その場合 MAILTRAP_TEST_INBOX_ID も必須。
MAILTRAP_SANDBOX="1"
MAILTRAP_TEST_INBOX_ID=""

# 確認メールの差出人。未設定でも既定値で動く（届かない原因としては軽いため）。
MAIL_FROM_ADDRESS="no-reply@example.com"
MAIL_FROM_NAME="大会運営"
```

- [ ] **Step 5: 型検査と既存テストを通す**

Run: `pnpm typecheck`
Expected: エラー無し

Run: `pnpm test`
Expected: 既存テストが全て PASS(この時点では SignupForm のテストもまだ通る)

- [ ] **Step 6: lint を通す**

Run: `pnpm lint:fix`
Expected: 変更内容に起因するエラーが残らない

- [ ] **Step 7: コミット**

```bash
git add src/shared/lib/auth.ts prisma/migrations .env.example
git commit -m "$(cat <<'EOF'
feat(auth): require email verification for email signup

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 新規登録画面を仮登録の完了表示にする

**Files:**
- Modify: `src/features/auth/signup/usecase.ts`
- Modify: `src/features/auth/signup/usecase.test.ts`
- Modify: `src/components/auth/SignupForm.tsx`
- Test: `src/components/auth/SignupForm.test.tsx`(追記)

**Interfaces:**
- Consumes: `VERIFICATION_LINK_EXPIRES_IN_HOURS`(Task 2)
- Produces:
  - `type SignupCall = SignupInput & { callbackURL: string }`
  - `type SignUpPort = AuthCallPort<SignupCall>`
  - `signup(port: SignUpPort, input: SignupInput, callbackURL: string): Effect.Effect<void, AuthError>`

- [ ] **Step 1: usecase の失敗するテストを書く**

`src/features/auth/signup/usecase.test.ts` の 1 つ目の `it` を次に置き換える。

```ts
  it("入力と callbackURL をポートへ渡し、エラーが無ければ成功する", async () => {
    const port: SignUpPort = vi.fn().mockResolvedValue({ error: null });
    const exit = await Effect.runPromiseExit(
      signup(port, input, "/login?verified=1"),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    // callbackURL は確認メールのリンクに埋め込まれる遷移先。
    // これが欠けるとリンクを開いた後の行き先が "/" に固定される。
    expect(port).toHaveBeenCalledWith({
      ...input,
      callbackURL: "/login?verified=1",
    });
  });
```

2 つ目の `it` の `signup(port, input)` を `signup(port, input, "/login?verified=1")` に変える。

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/features/auth/signup/usecase.test.ts`
Expected: FAIL(`toHaveBeenCalledWith` が `callbackURL` を含まない引数で呼ばれたと報告する)

- [ ] **Step 3: usecase を実装する**

`src/features/auth/signup/usecase.ts` を次の内容に置き換える。

```ts
import type { Effect } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";
import { type AuthCallPort, runAuthCall } from "@/shared/lib/auth-effect";
import type { SignupInput } from "./schema";

/**
 * authClient.signUp.email へ実際に渡す値。
 * callbackURL は確認メールのリンクに埋め込まれる遷移先で、入力欄の値ではない。
 * そのため schema.ts には入れず、画面から usecase の引数として受け取る。
 */
export type SignupCall = SignupInput & { callbackURL: string };

/** authClient.signUp.email が満たす最小の形。 */
export type SignUpPort = AuthCallPort<SignupCall>;

export const signup = (
  port: SignUpPort,
  input: SignupInput,
  callbackURL: string,
): Effect.Effect<void, AuthError> =>
  runAuthCall(port, { ...input, callbackURL });
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run src/features/auth/signup/usecase.test.ts`
Expected: PASS(2 tests)

- [ ] **Step 5: 画面の失敗するテストを書く**

`src/components/auth/SignupForm.test.tsx` の末尾に追記する。

```tsx
const fillAndSubmit = () => {
  fireEvent.change(screen.getByLabelText("名前"), {
    target: { value: "竹添" },
  });
  fireEvent.change(screen.getByLabelText("ユーザー名"), {
    target: { value: "takezo" },
  });
  fireEvent.change(screen.getByLabelText("メールアドレス"), {
    target: { value: "user@example.com" },
  });
  fireEvent.change(screen.getByLabelText("パスワード"), {
    target: { value: "password123" },
  });
  fireEvent.click(screen.getByRole("button", { name: "登録する" }));
};

describe("SignupForm のメール登録", () => {
  beforeEach(() => {
    signUpEmail.mockReset();
    signInSocial.mockReset();
    push.mockClear();
    refresh.mockClear();
  });

  it("成功しても遷移せず、確認メールの案内を出す", async () => {
    signUpEmail.mockResolvedValue({ error: null });
    render(<SignupForm redirectTo="/orgs" />);

    fillAndSubmit();

    // requireEmailVerification によりセッションは発行されない。
    // 遷移するとログインしていない画面へ飛ばすことになる。
    expect(
      await screen.findByText(/確認メールを送信しました/),
    ).toBeInTheDocument();
    expect(screen.getByText(/user@example.com/)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("確認リンクの戻り先に redirect を引き継ぐ", async () => {
    signUpEmail.mockResolvedValue({ error: null });
    render(<SignupForm redirectTo="/orgs" />);

    fillAndSubmit();

    await screen.findByText(/確認メールを送信しました/);
    expect(signUpEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.com",
        callbackURL: "/login?verified=1&redirect=%2Forgs",
      }),
    );
  });

  it("失敗した場合はフォームのままアラートを出す", async () => {
    signUpEmail.mockResolvedValue({ error: { code: "FAILED_TO_CREATE_USER" } });
    render(<SignupForm redirectTo="/orgs" />);

    fillAndSubmit();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登録する" })).toBeInTheDocument();
  });
});
```

フォームは React 19 の `<form action={onSubmit}>` で、送信ボタンのクリックで
jsdom が submit イベントを発火する。もし発火せず `signUpEmail` が呼ばれない場合は、
クリックの代わりに次で送信する。

```tsx
  const form = screen.getByRole("button", { name: "登録する" }).closest("form");
  if (form === null) throw new Error("form が見つからない");
  fireEvent.submit(form);
```

- [ ] **Step 6: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/components/auth/SignupForm.test.tsx`
Expected: FAIL(「確認メールを送信しました」が見つからない)

- [ ] **Step 7: SignupForm を書き換える**

`src/components/auth/SignupForm.tsx` を編集する。

import に追加する。

```tsx
import { VERIFICATION_LINK_EXPIRES_IN_HOURS } from "@/shared/lib/email-verification-policy";
```

state の宣言に追加する。

```tsx
  // 送信先のメールアドレス。null なら未送信でフォームを出す。
  const [sentTo, setSentTo] = useState<string | null>(null);
```

`onSubmit` の中、`setPending(true)` の直前に追加する。

```tsx
    // 確認リンクを踏んだ後の戻り先。Better Auth がこの値を verify-email の
    // callbackURL に埋め、成功時はここへ、失敗時は ?error=... を足してここへ返す。
    const callbackURL = `/login?${new URLSearchParams({
      verified: "1",
      redirect: redirectTo,
    })}`;
```

`signup(...)` の呼び出しを次に置き換える。

```tsx
      signup(
        (input) => authClient.signUp.email(input),
        parsed.data,
        callbackURL,
      ),
```

成功時の 2 行を置き換える。

```tsx
    // 変更前
    // autoSignIn: true のため、登録が済めばそのままログイン済みになる。
    router.push(redirectTo);
    router.refresh();
```

```tsx
    // 変更後
    // requireEmailVerification によりセッションは発行されない（仮登録）。
    // 遷移させず、確認メールの案内に切り替える。
    setSentTo(parsed.data.email);
```

`return (` の直前に、完了表示の分岐を追加する。

```tsx
  if (sentTo !== null) {
    return (
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold text-slate-800">
          確認メールを送信しました
        </h1>
        <p className="text-sm text-slate-700">
          {sentTo} 宛に確認メールを送信しました。メール内のリンクを開くと登録が完了します。
        </p>
        <p className="text-xs text-slate-500">
          メールが届かない場合は迷惑メールフォルダをご確認ください。リンクの有効期限は
          {VERIFICATION_LINK_EXPIRES_IN_HOURS} 時間です。
        </p>
        <Link href="/login" className="text-sm text-slate-600 underline">
          ログイン画面へ
        </Link>
      </div>
    );
  }
```

`router` を使わなくなるため、`const router = useRouter();` の行と
`import { useRouter } from "next/navigation";` を削除する。

- [ ] **Step 8: テストが通ることを確認する**

Run: `pnpm exec vitest run src/components/auth/SignupForm.test.tsx src/features/auth/signup/usecase.test.ts`
Expected: PASS

`next/navigation` の `vi.mock` はテストに残してよい(Google 登録のテストが
`push` を参照しているため)。

- [ ] **Step 9: 型検査と lint を通す**

Run: `pnpm typecheck`
Expected: エラー無し

Run: `pnpm lint:fix`
Expected: 変更内容に起因するエラーが残らない

- [ ] **Step 10: コミット**

```bash
git add src/features/auth/signup src/components/auth/SignupForm.tsx src/components/auth/SignupForm.test.tsx
git commit -m "$(cat <<'EOF'
feat(auth): show verification notice after signup

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: ログイン画面に確認結果の案内を出す

**Files:**
- Modify: `src/features/auth/domain.ts`
- Test: `src/features/auth/domain.test.ts`(追記)
- Modify: `src/components/auth/LoginForm.tsx`
- Test: `src/components/auth/LoginForm.test.tsx`(追記)
- Modify: `src/app/(auth)/login/page.tsx`

**Interfaces:**
- Consumes: `EmailNotVerified` の文言(Task 3)
- Produces:
  - `verificationNotice(verified: boolean, errorCode: string | null): string | null`
  - `LoginForm` の props: `{ redirectTo: string; verified?: boolean; verifyError?: string | null }`

- [ ] **Step 1: 案内文の失敗するテストを書く**

`src/features/auth/domain.test.ts` の末尾に追記する。

```ts
describe("verificationNotice", () => {
  it("確認が済んだらログインを促す", () => {
    expect(verificationNotice(true, null)).toBe(
      "登録が完了しました。ログインしてください",
    );
  });

  it("期限切れは再送されることを伝える", () => {
    expect(verificationNotice(true, "TOKEN_EXPIRED")).toBe(
      "リンクの有効期限が切れています。ログインすると確認メールを送り直します",
    );
  });

  it("その他のエラーもログインで復帰できることを伝える", () => {
    expect(verificationNotice(true, "INVALID_TOKEN")).toBe(
      "リンクが無効です。ログインすると確認メールを送り直します",
    );
  });

  it("エラーがあれば verified が false でも案内する", () => {
    // Better Auth は callbackURL に ?error= を足して返すため、
    // verified=1 が欠けた URL で戻ってくる経路もあり得る。
    expect(verificationNotice(false, "TOKEN_EXPIRED")).toBe(
      "リンクの有効期限が切れています。ログインすると確認メールを送り直します",
    );
  });

  it("確認リンク経由でなければ何も出さない", () => {
    expect(verificationNotice(false, null)).toBeNull();
  });
});
```

`import` に `verificationNotice` を追加する(既存の
`import { safeRedirectPath } from "./domain";` を
`import { safeRedirectPath, verificationNotice } from "./domain";` にする)。

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/features/auth/domain.test.ts`
Expected: FAIL(`verificationNotice is not a function`)

- [ ] **Step 3: 案内文を実装する**

`src/features/auth/domain.ts` の末尾に追記する。

```ts
/**
 * 確認メールのリンクから /login へ戻ってきたときに出す案内文。
 * 案内が要らない通常のログイン画面では null を返す。
 *
 * errorCode は Better Auth が verify-email の失敗時に callbackURL へ足す
 * エラーコード。そのまま画面に出すと英大文字の内部コードが見えるため、
 * ここで日本語へ写像する。未知のコードも「無効」に畳む。
 * どのコードでも復帰手段は同じ（ログインを試すと再送される）ためである。
 */
export const verificationNotice = (
  verified: boolean,
  errorCode: string | null,
): string | null => {
  if (errorCode === "TOKEN_EXPIRED") {
    return "リンクの有効期限が切れています。ログインすると確認メールを送り直します";
  }
  if (errorCode !== null) {
    return "リンクが無効です。ログインすると確認メールを送り直します";
  }
  if (verified) {
    return "登録が完了しました。ログインしてください";
  }
  return null;
};
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run src/features/auth/domain.test.ts`
Expected: PASS

- [ ] **Step 5: 画面の失敗するテストを書く**

`src/components/auth/LoginForm.test.tsx` の末尾に追記する。

```tsx
describe("LoginForm の確認メール案内", () => {
  beforeEach(() => {
    signInEmail.mockReset();
    signInSocial.mockReset();
    push.mockClear();
    refresh.mockClear();
  });

  it("確認が済んだ場合に案内を出す", () => {
    render(<LoginForm redirectTo="/" verified />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "登録が完了しました。ログインしてください",
    );
  });

  it("期限切れの場合に案内を出す", () => {
    render(<LoginForm redirectTo="/" verified verifyError="TOKEN_EXPIRED" />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "リンクの有効期限が切れています",
    );
  });

  it("確認リンク経由でなければ案内を出さない", () => {
    render(<LoginForm redirectTo="/" />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("未確認のままログインした場合に再送を伝える", async () => {
    signInEmail.mockResolvedValue({ error: { code: "EMAIL_NOT_VERIFIED" } });
    render(<LoginForm redirectTo="/" />);

    fireEvent.change(screen.getByLabelText("メールアドレス"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("パスワード"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ログイン" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "メールアドレスが未確認です。確認メールを再送しました",
    );
    expect(push).not.toHaveBeenCalled();
  });
});
```

`signInEmail` / `signInSocial` / `push` / `refresh` は
`src/components/auth/LoginForm.test.tsx` の冒頭で宣言済みなので、
追記するブロックからそのまま参照してよい。

- [ ] **Step 6: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/components/auth/LoginForm.test.tsx`
Expected: FAIL(`role="status"` の要素が無い)

- [ ] **Step 7: LoginForm を書き換える**

`src/components/auth/LoginForm.tsx` を編集する。

import に追加する。

```tsx
import { verificationNotice } from "@/features/auth/domain";
```

props を広げる。

```tsx
export function LoginForm({
  redirectTo,
  verified = false,
  verifyError = null,
}: {
  redirectTo: string;
  verified?: boolean;
  verifyError?: string | null;
}) {
```

コンポーネント本体の先頭(既存の `useState` の後)に追加する。

```tsx
  const notice = verificationNotice(verified, verifyError);
```

`<h1>` の直後、`<form>` の前に追加する。

```tsx
      {notice !== null && (
        <p
          role="status"
          className="rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
        >
          {notice}
        </p>
      )}
```

- [ ] **Step 8: ログインページから渡す**

`src/app/(auth)/login/page.tsx` を次の内容に置き換える。

```tsx
import { LoginForm } from "@/components/auth/LoginForm";
import { safeRedirectPath } from "@/features/auth/domain";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const raw = params.redirect;
  const redirectTo = safeRedirectPath(typeof raw === "string" ? raw : null);

  // 確認メールのリンクから戻ってきた場合に付く 2 つのクエリ。
  // error は Better Auth が verify-email の失敗時に足す内部コードなので、
  // 文言への写像は LoginForm 側で行い、ここでは素通しする。
  const verified = params.verified === "1";
  const rawError = params.error;
  const verifyError = typeof rawError === "string" ? rawError : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <LoginForm
        redirectTo={redirectTo}
        verified={verified}
        verifyError={verifyError}
      />
    </main>
  );
}
```

- [ ] **Step 9: テストが通ることを確認する**

Run: `pnpm exec vitest run src/components/auth/LoginForm.test.tsx src/features/auth/domain.test.ts`
Expected: PASS

- [ ] **Step 10: 全体を通す**

Run: `pnpm test`
Expected: 全 PASS

Run: `pnpm typecheck`
Expected: エラー無し

Run: `pnpm lint:fix`
Expected: 変更内容に起因するエラーが残らない

- [ ] **Step 11: コミット**

```bash
git add src/features/auth/domain.ts src/features/auth/domain.test.ts src/components/auth/LoginForm.tsx src/components/auth/LoginForm.test.tsx "src/app/(auth)/login/page.tsx"
git commit -m "$(cat <<'EOF'
feat(auth): show verification result on login page

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 12: 手動で通しの確認をする**

前提: マイグレーション適用済み(Task 4 Step 3)。`.env` に Mailtrap の
sandbox トークンと受信箱 ID を設定する(未設定ならサーバログで代用できる)。

Run: `pnpm dev`

1. `/signup` から新しいメールアドレスで登録し、画面が「確認メールを送信しました」に変わる
2. Mailtrap の受信箱(またはサーバログ)にメールが届き、リンクが `/api/auth/verify-email?token=...` を指す
3. リンクを踏む前に `/login` からそのアカウントでログインを試すと
   「メールアドレスが未確認です。確認メールを再送しました」が出て、メールが 1 通増える
4. 届いたリンクを開くと `/login?verified=1&redirect=...` へ遷移し、
   「登録が完了しました。ログインしてください」が出る
5. そのままログインでき、`redirect` で指定した画面へ遷移する
6. 既存ユーザー(マイグレーションで `emailVerified = true` になった人)が
   従来どおりログインできる
7. Google での登録・ログインが従来どおり動く

- [ ] **Step 13: README に追記する必要があれば追記してコミット**

`README.md` に環境変数の説明がある場合は、Mailtrap の 4 つを同じ体裁で追記する。
無ければこの Step は飛ばす。

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: document Mailtrap environment variables

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```
