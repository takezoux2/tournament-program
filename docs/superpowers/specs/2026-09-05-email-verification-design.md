# メールアドレス登録の仮登録・本登録化(認証メール)設計

日付: 2026-09-05

## 目的

メールアドレスとパスワードでの新規登録を「仮登録」で止め、確認メールの
リンクを開いた時点で「本登録」にする。メール配信には Mailtrap を使う。

## スコープ

- 仮登録 / 本登録の状態表現(既存の `User.emailVerified` を使う)
- Better Auth の `emailVerification` 配線と、未認証ユーザーのサインイン拒否
- Mailtrap によるメール送信基盤(`src/shared/lib/mail/`)
- 確認メールの件名・本文の組み立て
- 新規登録画面・ログイン画面の表示変更
- 既存ユーザーを本登録済みへ引き上げるマイグレーション

スコープ外: 古い仮登録ユーザーの定期削除、メールアドレス変更フロー、
HTML メールのデザイン作り込み、パスワードリセットのメール化。

## 全体フロー

```
[新規登録フォーム]
  signUp.email({ ..., callbackURL: "/login?verified=1&redirect=<元の遷移先>" })
    → User 行を作成し emailVerified = false(= 仮登録)
    → セッションは発行しない
    → Better Auth が verify-email の URL を組み立て、
      emailVerification.sendVerificationEmail 経由で Mailtrap へ送信
  [画面] 「確認メールを送信しました」に切り替える(遷移しない)

[メールのリンク]
  GET /api/auth/verify-email?token=...&callbackURL=/login?verified=1&redirect=...
    → 成功: emailVerified = true(= 本登録)にして callbackURL へリダイレクト
    → 失敗: callbackURL に ?error=TOKEN_EXPIRED / INVALID_TOKEN を足して
            リダイレクト(Better Auth の verify-email が行う)

[仮登録のままログイン]
  signIn.email → EMAIL_NOT_VERIFIED で失敗
    → Better Auth が確認メールを自動で再送する(sendOnSignIn)
    → [画面] 「メールアドレスが未確認です。確認メールを再送しました」
```

トークンは `BETTER_AUTH_SECRET` で署名された JWT で、DB 行は増えない
(`Verification` テーブルは使わない)。有効期限は既定の 1 時間ではなく
**24 時間**にする。メールに気づくのが翌日でも間に合い、切れた場合も
ログインし直せば自動で再送されるため、専用の再送画面を持たずに済む。

Google 経由のサインインは従来どおり即ログインできる。
`requireEmailVerification` はメール / パスワードのサインイン経路にしか
効かず(`better-auth/dist/api/routes/sign-in.mjs`)、Google は検証済みの
アドレスを返すためである。

## Better Auth の設定変更

`src/shared/lib/auth.ts`:

```ts
emailAndPassword: {
  enabled: true,
  requireEmailVerification: true,
  // autoSignIn は削除する。requireEmailVerification が真だと
  // sign-up 側で shouldSkipAutoSignIn になり、常に無効化されるため
  // (better-auth/dist/api/routes/sign-up.mjs)。残すと有効に見えて紛らわしい。
  minPasswordLength: MIN_PASSWORD_LENGTH,
  maxPasswordLength: MAX_PASSWORD_LENGTH,
},
emailVerification: {
  expiresIn: 60 * 60 * 24,
  // 未認証のままログインを試みたら確認メールを送り直す。
  // 期限切れからの復帰がログイン操作だけで完結する。
  sendOnSignIn: true,
  // リンクを踏んだ端末(スマホ等)でログイン状態にしない。
  autoSignInAfterVerification: false,
  sendVerificationEmail: async ({ user, url }) => {
    await getMailer().send(buildVerificationEmail({ name: user.name, url }));
  },
},
```

### 副作用 1: 既存メールでの再登録が「成功したふり」になる

`requireEmailVerification: true` にすると、Better Auth の sign-up は
既存メールでの登録要求をエラーにせず、実在しないユーザーを組み立てた
汎用レスポンスを返す(`shouldReturnGenericDuplicateResponse`)。
アカウント列挙を防ぐための挙動である。

このため:

- `AuthError` の `EmailAlreadyExists` は signup 経路から到達不能になる。
  型と文言は残す(Google 連携など他経路の余地があり、消すと
  `Match.exhaustive` の網羅性チェックだけが緩むため)。
- 新規登録画面は成否によらず常に「確認メールを送信しました」を出す。
  既存ユーザーには実際には何も送られない。
- ユーザー名の重複は従来どおりエラーになる。sign-up 側で汎用レスポンスに
  倒れるのは 403 のときだけで、`FAILED_TO_CREATE_USER` は 422 のまま
  投げられるためである。

### 副作用 2: 既存ユーザーがログインできなくなる

`User.emailVerified` は `@default(false)` で、現状 true の行が存在しない。
`requireEmailVerification: true` にすると既存ユーザーが全員締め出される。

スキーマ変更を伴わないマイグレーションを 1 本追加し、既存行を本登録済みに
引き上げる。

```sql
UPDATE "User" SET "emailVerified" = true;
```

## メール送信基盤

新規ディレクトリ `src/shared/lib/mail/`。

| ファイル | 責務 |
| --- | --- |
| `mailer.ts` | `MailMessage` 型、`Mailer` 型(`send(msg): Promise<void>`)、`getMailer()` |
| `mailtrap-mailer.ts` | `MailtrapClient` のラッパ |
| `console-mailer.ts` | 送信せず件名と本文を `console.info` に出す |

`getMailer()` は環境変数を読んで実装を選ぶ。

- `MAILTRAP_TOKEN` が設定済み → Mailtrap 実装
- 未設定 → console 実装。Mailtrap の設定なしでも登録フロー全体を
  ローカルで踏める(認証 URL がサーバログに出る)
- 未設定かつ `NODE_ENV === "production"` → 例外を投げる。
  本番でメールが黙って闇に消えるのを防ぐ

Mailtrap の sandbox(テスト用受信箱)と本番送信の切り替えは
`MAILTRAP_SANDBOX` / `MAILTRAP_TEST_INBOX_ID` で行う。SDK 側は
`new MailtrapClient({ token, sandbox, testInboxId })` の 1 か所で吸収でき、
送信呼び出し(`client.send({ from, to, subject, text, html })`)は共通である。

依存追加: `pnpm add mailtrap`(4.10.0)。

`getMailer()` は `MailtrapClient` を組み立てるファクトリを引数で受け取れる
形にし、テストから差し替えられるようにする。既定引数に本物のコンストラクタを
置けば、呼び出し側は引数なしのままでよい。

## 確認メールの本文

`src/shared/lib/auth-verification-email.ts` に純粋関数
`buildVerificationEmail({ name, url }): MailMessage` を置く。

`src/shared/lib/` に置くのは、`auth.ts` から呼ぶためである。`auth.ts` は
`shared/lib` にあり、`features/` へ依存させると垂直スライスの依存方向が
逆転する。既存の `auth-user-config.ts` / `auth-user-fields.ts` と同じ、
「auth.ts から切り出した設定断片」の並びに置く。

- 差出人は `MAIL_FROM_ADDRESS` / `MAIL_FROM_NAME`
- 件名は「【大会運営】メールアドレスの確認」
- テキスト版と HTML 版の両方を持たせる。HTML 版に差し込む `name` と `url` は
  エスケープする(`name` はユーザー入力なので、素通しは HTML インジェクションになる)
- 本文には有効期限(24 時間)と、心当たりがない場合は破棄してよい旨を書く

## 画面

### SignupForm(`src/components/auth/SignupForm.tsx`)

- `signUp.email` に `callbackURL` を渡す。値は
  `/login?verified=1&redirect=<redirectTo>` を `URLSearchParams` で組み立てる
- 成功時に `router.push(redirectTo)` しない。送信済みフラグを state に持ち、
  フォームを「`{email}` 宛に確認メールを送信しました。メール内のリンクを開くと
  登録が完了します」の完了表示へ差し替える
- Google での登録ボタンの挙動は変えない

`signUp.email` に渡す入力の型が `SignupInput` から
`SignupInput & { callbackURL: string }` に広がるため、
`src/features/auth/signup/usecase.ts` の `SignUpPort` もその型にする。
`callbackURL` は画面の関心なのでスキーマ(`schema.ts`)には入れず、
usecase の引数として受け取り、そのままポートへ渡す。

### LoginForm(`src/components/auth/LoginForm.tsx`)

`verified` と `verifyError` を props で受け取り、フォーム上部に案内を出す。

| 条件 | 表示 |
| --- | --- |
| `verified` かつエラーなし | 登録が完了しました。ログインしてください |
| `verifyError` が `TOKEN_EXPIRED` | リンクの有効期限が切れています。ログインすると確認メールを送り直します |
| `verifyError` がその他 | リンクが無効です。ログインすると確認メールを送り直します |
| ログインが `EmailNotVerified` で失敗 | メールアドレスが未確認です。確認メールを再送しました |

### login ページ(`src/app/(auth)/login/page.tsx`)

`searchParams` から `verified` と `error` を読み、`verified` / `verifyError`
として `LoginForm` に渡す。`error` は Better Auth が付けるエラーコード
文字列で、ページ側は素通しし、文言への写像は `LoginForm` が上表のとおり行う
(コードをそのまま画面に出すことはしない)。

## エラー型

`src/shared/errors/auth-error.ts` に `EmailNotVerified` タグを追加し、
`toAuthError` で `EMAIL_NOT_VERIFIED` を写像する。
`src/features/auth/messages.ts` は `Match.exhaustive` なので、
文言の追加漏れはコンパイルエラーになる。

## 環境変数(`.env.example`)

```
# Mailtrap(未設定ならコンソールに出力するフォールバックが働く。
# 本番では未設定にしないこと)
MAILTRAP_TOKEN=""
# "1" のとき Mailtrap の Email Testing(sandbox)受信箱へ送る。
# その場合 MAILTRAP_TEST_INBOX_ID も必須。
MAILTRAP_SANDBOX="1"
MAILTRAP_TEST_INBOX_ID=""

# 確認メールの差出人
MAIL_FROM_ADDRESS="no-reply@example.com"
MAIL_FROM_NAME="大会運営"
```

## テスト

| 対象 | 確認すること |
| --- | --- |
| `auth-verification-email.test.ts` | 件名・宛先・差出人、テキストと HTML の両方に URL が入る、`name` の HTML エスケープ |
| `mail/mailer.test.ts` | トークン未設定で console 実装、設定済みで Mailtrap 実装、本番かつ未設定で例外、sandbox 指定時に `testInboxId` が渡る |
| `mail/console-mailer.test.ts` | 送信せずログに URL が出る |
| `auth-error.test.ts` | `EMAIL_NOT_VERIFIED` → `EmailNotVerified` |
| `messages.test.ts` | 新タグの文言 |
| `signup/usecase.test.ts` | `callbackURL` を含めてポートへ渡る |
| `SignupForm.test.tsx` | 成功時に遷移せず完了表示になる、`callbackURL` を渡している |
| `LoginForm.test.tsx` | 未認証 / verified / 期限切れの各表示、`EmailNotVerified` の文言 |

`auth.ts` は import すると Prisma アダプタが DB に触れに行くため直接は
テストしない(既存の `auth-user-config.ts` と同じ理由)。配線は
`getMailer` と `buildVerificationEmail` の側で担保する。

## 手動確認

1. `.env` に Mailtrap の sandbox トークンと受信箱 ID を設定する
2. `/signup` から登録し、画面が完了表示に変わることを確認
3. Mailtrap の受信箱にメールが届き、リンクが `/api/auth/verify-email` を指すこと
4. リンクを開くと `/login?verified=1...` に飛び、案内が出ること
5. リンクを踏む前にログインを試み、未確認の案内と再送を確認
6. 本登録後にログインできること
