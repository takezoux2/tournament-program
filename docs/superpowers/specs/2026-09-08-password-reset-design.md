# パスワードリセット(パスワードを忘れた場合)設計

日付: 2026-09-08

## 目的

パスワードを忘れたユーザーが、メールで受け取ったリンクから新しい
パスワードを設定してログインできるようにする。ログイン画面から
「パスワードをお忘れですか？」で辿れる導線を作る。

## スコープ

- ログイン画面からのリセット申請導線
- 申請画面 `/forgot-password` と再設定画面 `/reset-password`
- Better Auth の `emailAndPassword.sendResetPassword` 配線
- リセットメールの件名・本文の組み立て
- リセット完了時のメール確認済み化とセッション失効
- 新しいエラーコード `INVALID_TOKEN` の文言への写像

スコープ外: ログイン済みユーザーによるパスワード変更(`changePassword`)、
リセット申請のレート制限、パスワード強度ルールの見直し、
メールの HTML デザイン作り込み。

## 全体フロー

```
[ログイン画面]
  「パスワードをお忘れですか？」 → /forgot-password

[/forgot-password]
  requestPasswordReset({ email, redirectTo: "/reset-password" })
    → 該当ユーザーが居れば reset-password:<token> を Verification に作成し
      emailAndPassword.sendResetPassword 経由で Mailtrap へ送信
    → 居なければダミーのトークン生成と DB 参照を挟んで同じ応答を返す
  [画面] 成否によらず「リセット用のリンクを送信しました」に切り替える

[メールのリンク]
  GET /api/auth/reset-password/<token>?callbackURL=%2Freset-password
    → 有効: /reset-password?token=<token> へリダイレクト
    → 無効/期限切れ: /reset-password?error=INVALID_TOKEN へリダイレクト

[/reset-password]
  resetPassword({ newPassword, token })
    → パスワードを更新(credential アカウントが無ければ作成)
    → onPasswordReset で emailVerified = true
    → revokeSessionsOnPasswordReset で既存セッションを全消去
  [画面] 成功したら /login?reset=1 へ遷移
```

トークンは確認メールの JWT と違い `Verification` テーブルの行として
持たれる(`identifier = "reset-password:<token>"`, `value = userId`)。
`resetPassword` は `consumeVerificationValue` を使うため、1 度使うと
消える。有効期限は **1 時間**(Better Auth の既定値)。確認メールを
24 時間にしたのは「翌日気づいても間に合う」ためだが、リセットは
切れても申請し直すだけで、確認メールのような再送の仕掛けを持たない。
短く保つ側の理由(リンクが漏れたときの窓を狭める)が勝る。

## Better Auth の設定変更

`src/shared/lib/auth.ts` の `emailAndPassword` に 4 つ足す:

```ts
emailAndPassword: {
  ...,
  resetPasswordTokenExpiresIn: PASSWORD_RESET_LINK_EXPIRES_IN_SECONDS,
  revokeSessionsOnPasswordReset: true,
  sendResetPassword: async ({ user, url }) => {
    await getMailer().send(
      buildPasswordResetEmail({
        from: resolveMailFrom(process.env),
        to: { email: user.email, name: user.name },
        url,
      }),
    );
  },
  onPasswordReset: async ({ user }) => {
    // リセットリンクを開けたこと自体がメール所有の証明なので、
    // 未確認のまま残っていたアカウントをここで本登録に引き上げる。
    // requireEmailVerification により、これをしないと
    // リセット直後のログインが EMAIL_NOT_VERIFIED で弾かれ、
    // 確認メールをもう 1 通踏ませることになる。
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });
  },
},
```

`sendResetPassword` を渡さないと `/request-password-reset` は
`RESET_PASSWORD_DISABLED` で 400 を返す(`api/routes/password.mjs`)。

`revokeSessionsOnPasswordReset: true` は既定の false から変える。
パスワードリセットは乗っ取りからの復帰手段でもあるため、他端末の
セッションを残さない。Better Auth の実行順は `onPasswordReset` →
`deleteUserSessions` なので、上の `emailVerified` 更新は失効の前に走る。

### 意図した副作用: Google のみのアカウント

`resetPassword` は credential アカウントが無いユーザーに対しては
アカウントを**新規作成**する(`password.mjs` の `findCredentialAccount`
分岐)。つまり Google ログインしか使っていないユーザーがリセットを
申請すると、パスワードログインが生える。メール所有は証明済みであり、
Better Auth 標準の挙動でもあるため、これを許容する。

## リダイレクト先を固定する

`requestPasswordReset` の `redirectTo` はメール本文の URL に
`callbackURL` として埋め込まれる値で、Better Auth の `originCheck`
ミドルウェアを通る。ここに `/login?redirect=...` のような外から来た
遷移先を流すとオープンリダイレクトの面が増えるため、リセット経路では
**固定文字列 `/reset-password` のみ**を渡す。リセット完了後は常に
`/login` へ戻す。`safeRedirectPath` による遷移先の引き回しは
ログイン/新規登録の経路に限る。

## ファイル構成

### 新規: ドメイン層 `src/features/auth/password-reset/`

- `schema.ts`
  - `passwordResetRequestSchema`: `email` を `normalizeEmail` で
    正規化してから `z.email()`。signup/schema.ts と同じ組み立て。
  - `passwordResetSchema`: `newPassword` と `confirmPassword`。
    長さの検証と文言は `password-policy.ts` の定数から作り、
    一致検証は `.refine` でスキーマ側に持たせる(フォームに置かない)。
- `usecase.ts`
  - `requestPasswordReset(port, input)` と
    `resetPassword(port, input, token)` を `runAuthCall` で
    `Effect<void, AuthError>` に畳む。ポートを引数で受ける形は
    signup/usecase.ts と同じで、テストから Better Auth を呼ばずに済む。
- `domain.ts`
  - `resetTokenState(token, errorCode)`: `/reset-password` に届いた
    クエリを「フォームを出してよいか」「出さないなら何と表示するか」
    に写す。`token` が無い場合と `error=INVALID_TOKEN` は同じ案内に
    畳む。どちらも復帰手段は「もう一度申請する」で同一のため。
    domain.ts の `verificationNotice` と同じ役回り。

### 新規: 共有層 `src/shared/lib/`

- `password-reset-policy.ts`
  - `PASSWORD_RESET_LINK_EXPIRES_IN_HOURS = 1`、`..._IN_SECONDS`、
    表示用の `..._EXPIRES_LABEL`。`auth.ts`・メール本文・申請完了画面
    の 3 か所で同じ値を使うため 1 か所に持つ。
    `email-verification-policy.ts` と同型。
- `auth-password-reset-email.ts`
  - `buildPasswordResetEmail({ from, to, url })` を純粋関数で。
    `buildVerificationEmail` と同じく、送信経路と切り離して文面と
    エスケープだけを検証できるようにする。
- `html-escape.ts`
  - `auth-verification-email.ts` の `escapeHtml` をここへ切り出し、
    2 つのメールビルダで共有する。コピーを増やさないための移動で、
    振る舞いは変えない。

### 新規: UI

- `src/components/auth/ForgotPasswordForm.tsx`
  - SignupForm と同じく `sentTo` state を持ち、送信後は案内表示に
    切り替える(遷移しない)。有効期限は
    `PASSWORD_RESET_LINK_EXPIRES_LABEL` から出す。
- `src/components/auth/ResetPasswordForm.tsx`
  - `resetTokenState` がフォームを出さないと判断した場合は、案内と
    `/forgot-password` へのリンクだけを表示する。
  - 成功時は `router.push("/login?reset=1")`。セッションは発行されない
    ので `router.refresh()` は不要。
- `src/app/(auth)/forgot-password/page.tsx`
- `src/app/(auth)/reset-password/page.tsx`
  - `searchParams` の `token` と `error` を文字列に絞って
    ResetPasswordForm へ渡す。login/page.tsx と同じ書き方。

### 変更

- `src/shared/lib/auth.ts` — 上記 4 つの設定
- `src/shared/lib/auth-verification-email.ts` — `escapeHtml` の移動
- `src/shared/errors/auth-error.ts` — `InvalidResetToken` の追加と
  `toAuthError` の `INVALID_TOKEN` 分岐
- `src/features/auth/messages.ts` — `InvalidResetToken` の文言
- `src/features/auth/domain.ts` — `passwordResetNotice(reset)` を追加。
  `verificationNotice` とは責務が別なので混ぜず、隣に置く。
- `src/components/auth/LoginForm.tsx` — 「パスワードをお忘れですか？」
  リンクと `reset=1` の案内表示
- `src/app/(auth)/login/page.tsx` — `reset` クエリの受け渡し

## エラー写像

| Better Auth コード | AuthError | 文言 |
| --- | --- | --- |
| `INVALID_TOKEN` | `InvalidResetToken`(新規) | リンクが無効か期限切れです。お手数ですが再度お申し込みください |
| `PASSWORD_TOO_SHORT` / `PASSWORD_TOO_LONG` | `WeakPassword`(既存) | 既存の文言 |
| `RESET_PASSWORD_DISABLED` | `UnexpectedAuthError`(既定) | 汎用文言。設定漏れなのでコードを残して追える形にする |

`messages.ts` の `Match.exhaustive` により、タグを足して文言を足し忘れると
コンパイルエラーになる。

申請側 `/request-password-reset` は本体が常に成功を返すため、通常の失敗は
ネットワーク断だけになる。それでも `sentTo` に切り替える前にエラーを表示し、
送っていないのに「送りました」と言わないようにする。

## アカウント列挙への配慮

- 申請結果はメールアドレスの存在によらず同じ文面にする。
- Better Auth 側もユーザー不在時にダミーのトークン生成と DB 参照を
  挟んで応答時間を揃えている(`password.mjs`)。こちら側で
  「存在しません」を出さない限り、この対策は保たれる。
- 申請フォームはメールアドレスのみを受け付ける。ログイン画面は
  ユーザー名も受け付けるが、ユーザー名からメールを引く処理を自作すると
  応答差やタイミング差で存在が漏れる経路を新たに作ることになる。
  画面の文言で「登録したメールアドレス」と明示して補う。

## テスト

純粋関数は vitest で単体テスト:

- `password-reset/schema.test.ts` — メールの正規化、長さの境界、
  確認用パスワードの不一致
- `password-reset/usecase.test.ts` — ポートに渡る値、`{ error }` と
  reject の両経路が `AuthError` に畳まれること
- `password-reset/domain.test.ts` — `token` 有無 × `error` の組み合わせ
- `auth-password-reset-email.test.ts` — 宛名の欠損時の代替、`&` を含む
  URL のエスケープ、有効期限ラベルの反映
- `html-escape.test.ts` — 移動した関数の据え置き検証
- `auth-error.test.ts` / `messages.test.ts` — 新しいタグの分岐と文言

UI は既存の `*.test.tsx` と同じく Testing Library で:

- ForgotPasswordForm — 不正な形式では送信されない / 成功で案内に
  切り替わる / reject ではエラーを出して案内に切り替えない
- ResetPasswordForm — `token` 不在と `error=INVALID_TOKEN` では
  フォームを出さない / 不一致では送信されない / 成功で
  `/login?reset=1` へ遷移する
- LoginForm — リンクの存在と `reset=1` の案内表示

`auth.ts` 本体の配線はテストしない。Better Auth の初期化を伴うためで、
既存の `auth-verification-email.test.ts` と同じ割り切り。代わりに
注入される `buildPasswordResetEmail` 側を厚く固める。

## GA への配慮

`/reset-password?token=<token>` は better-auth のリダイレクト先そのものであり、
有効なリセットトークンをクエリに載せたページである。GA4 の計測はこの URL を
そのまま送らない。`docs/superpowers/specs/2026-09-08-ga4-design.md`
「GA へ送る URL のサニタイズ」のとおり `sanitizePagePath` がクエリを落として
送るため、トークンは Google 側に保存されない。

## 手動確認

`MAILTRAP_TOKEN` 未設定ならコンソール Mailer がリンクをサーバログへ
出すので、そこからコピーして経路を最後まで踏める。確認する点:

1. 存在しないメールアドレスでも同じ案内が出る
2. リンクから `/reset-password?token=...` に着く
3. 新しいパスワードで `/login` からログインできる
4. 古いパスワードではログインできない
5. 別ブラウザで開いていたセッションが失効している
6. 未確認のまま放置したアカウントが、リセット後に確認メールを
   踏まずにログインできる
