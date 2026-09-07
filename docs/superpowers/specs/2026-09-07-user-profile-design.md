# ユーザープロフィール画面 設計

作成日: 2026-09-07

## 目的

ログイン中のユーザーが、自分自身の情報を確認・編集できる画面を用意する。
これまで登録（`/signup`）以降、自分の情報を変える手段が一切なかった。

対象は次の 7 つ。

1. 表示名（`User.name`）の変更
2. メールアドレスの変更
3. パスワードの変更（未設定の場合は設定）
4. Google 連携の解除
5. Google 連携の追加
6. 他端末のログアウト（現在のセッション以外の破棄）
7. アカウント削除

加えて、所属する組織の一覧を「自分がその組織で持つ権限」つきで見られるようにする。

これらへの入口として、ヘッダーのユーザー名を押すとメニューが開くようにし、
ログアウトもそのメニューへ移す。

## 画面とルート

### `/profile` — 自分の情報の編集

1 ページを縦にセクション分けする。タブは作らない。

| セクション | 内容 |
| --- | --- |
| プロフィール | 表示名の変更 |
| メールアドレス | 現在のアドレス表示 + 新アドレス入力 → 確認メール送信 |
| パスワード | 未設定なら「設定」（新パスワードのみ）、設定済みなら「変更」（現パスワード + 新パスワード） |
| 連携アカウント | Google が未連携なら「連携する」、連携済みなら「解除」 |
| 危険な操作 | 他端末のログアウト / アカウント削除 |

パスワードのセクションと連携アカウントのセクションは、サーバで読んだ
`Account` の状態によって出し分ける。どちらを出すかは体感のためであって
境界ではない。Server Action は素通しにせず、Better Auth 側の検証
（`PASSWORD_ALREADY_SET` など）を必ず通す。

### `/profile/orgs` — 所属組織の一覧

組織名・slug・参加日に加えて、**その組織で自分が持つ権限コード**を出す。

トップページ `/` は既に所属組織の一覧になっているが、あちらは移動用の
素早い一覧として残す。`/profile/orgs` は自分の所属状況の確認用で、役割を分ける。

### ヘッダーのユーザーメニュー

`src/components/layout/AppHeader.tsx` の右側は、現在ユーザー名（素のテキスト）と
ログアウトボタンが横に並んでいる。ここをユーザー名のボタン 1 つにして、
押すとメニューが開く形にする。

```
[ユーザー名 ▾]
  ┌────────────────────┐
  │ 竹添太郎            │  見出し（名前とメールアドレス）
  │ taro@example.com    │
  ├────────────────────┤
  │ プロフィール         │ → /profile
  │ 所属組織            │ → /profile/orgs
  ├────────────────────┤
  │ ログアウト           │
  └────────────────────┘
```

ログアウトは区切り線の下に単独で置く。他の項目と続けて並べると、
移動のつもりで押し間違えたときの損失が大きいため。

`src/proxy.ts` の matcher は `/profile` を除外していないため、未ログインなら
`/login` へ送られる。実際の境界はこれまで通り `requireSession()`。

#### 部品の分け方

新しく `src/components/layout/UserMenu.tsx`（クライアントコンポーネント）を作り、
**開閉の状態だけ**を持たせる。`useRouter` も `authClient` も触らない。
ログアウトの処理はこれまで通り `src/components/auth/LogoutButton.tsx` が所有し、
`UserMenu` はそれをメニュー項目として描画する。`LogoutButton` は見た目
（メニュー幅いっぱいの項目）だけを直し、処理には手を入れない。

こう分けるのは、**16 個のページテストが `@/components/auth/LogoutButton` を
`vi.mock` している**ため。`LogoutButton` を消して処理を `UserMenu` へ移すと、
それら全部の書き換えになる。`useRouter` と `authClient` への依存を
`LogoutButton` に残しておけば、既存のモックがそのまま効き、`UserMenu` は
`useState` しか使わないのでモックすら要らない。

`AppHeader` 自身はサーバーコンポーネントのまま。クライアント境界は
`UserMenu` が引き受ける。メールアドレスを見出しに出すため、`AppHeader` の
props に `userEmail` を足す（`userName` と同じく呼び出し側の
`session.user` から渡す）。

#### 挙動

* トリガーは `aria-haspopup="menu"` と `aria-expanded` を持つ `<button>`
* パネルは `role="menu"`、項目は `role="menuitem"`。移動の 2 項目は
  `next/link` のリンク、ログアウトは `<button>`
* Escape で閉じ、フォーカスをトリガーへ戻す
* パネルの外をクリックしたら閉じる
* 閉じているときは項目を描画しない（`hidden` で隠すのではなく出さない）

## ディレクトリ構成

```
src/features/user/
├── messages.ts              AuthError → プロフィール文脈の日本語 (Match.exhaustive)
├── state.ts                 ProfileFormState
├── repository.ts            連携状態の読み出し（カテゴリ共通）
├── update-name/             schema.ts / usecase.ts / handler.ts
├── change-email/            schema.ts / domain.ts / usecase.ts / handler.ts
├── change-password/         schema.ts / usecase.ts / handler.ts
├── set-password/            schema.ts / usecase.ts / handler.ts
├── link-google/             handler.ts
├── unlink-account/          schema.ts / usecase.ts / handler.ts
├── revoke-sessions/         handler.ts
└── delete-account/          domain.ts / usecase.ts / repository.ts / handler.ts

src/components/profile/      各セクションのフォーム
src/components/layout/UserMenu.tsx
src/app/profile/page.tsx
src/app/profile/orgs/page.tsx
```

### 書き込みスライスに `repository.ts` を置かない

`docs/code-design/architecture.md` の `features/auth` の例外と同じ理由による。
認証テーブル（`User` / `Account` / `Session` / `Verification`）への書き込みは
Better Auth のアダプタが所有しており、スライス側に置くと委譲するだけの
空ファイルになる。

handler が `auth.api.*` を port として usecase に渡す形にする。こうすると
usecase は Better Auth 本体を呼ばずにテストできる。既存の
`features/organization/update/usecase.ts` と同じ、port を引数で受ける形である。

例外は `delete-account/repository.ts` で、これは認証テーブルではなく
`OrganizationUser` / `Permission` を読むため、通常どおり repository を持つ。

### 連携状態は Prisma で直接読む

`features/user/repository.ts` は `Account` の `providerId` と `createdAt` を
Prisma で直接読む。`auth.api.listUserAccounts` を使わない理由は 2 つある。

* `BYPASS_AUTH=1` では Better Auth のセッションが存在しないため
  `auth.api.*` は `UNAUTHORIZED` を投げ、プロフィール画面自体が開けなくなる。
  ローカル確認の手順（`AGENTS.md`）が成り立たなくなる。
* 読み取りが HTTP のラウンドトリップを 1 往復増やす必要がない。

書き込みは一切ここを通さない。Prisma 直参照は読み取り専用の射影に限る。

### features 間の依存

`src/features/user/**` に biome の `noRestrictedImports` の override を足し、
他の feature・`@/components`・`@/app` への依存を禁じる。粒度は
`features/schedule` と同じくカテゴリ単位とし、スライスごとの override は作らない。

## 認可境界

* 全 handler の冒頭で `requireSession()` を独立に呼ぶ。Server Action は
  ページを経由せず直接叩ける別の入口だから。
* Better Auth 側に追加の境界がある。
  * `changeEmail` / `changePassword` / `setPassword` は `sensitiveSessionMiddleware`
    （Cookie キャッシュではなく実体のセッションを要求する）
  * `unlinkAccount` は `freshSessionMiddleware`。**セッション作成から 24 時間以内**
    でなければ `SESSION_NOT_FRESH` になる（`session.freshAge` の既定値は 86400）。
    この制約は回避できないため、画面は「セキュリティのため再ログインが必要です」と
    出して `/login?redirect=/profile` へ誘導する。
* 最後の 1 つのアカウントは Better Auth 自身が解除を拒む
  （`FAILED_TO_UNLINK_LAST_ACCOUNT`）。パスワード未設定で Google のみの人は、
  先にパスワードを設定しないと解除できない。締め出しが構造的に起きない。

### `setPassword` はサーバ専用

`setPassword` は `createAuthEndpoint.serverOnly` で定義されており、
`authClient` からは呼べない。この 1 点だけでも Server Action が要る。

これを含め、プロフィールの書き込みは全て Server Action に寄せる。
1 つの画面の中に「クライアントから `authClient`」と「Server Action」の
2 経路が混ざるのを避けるためである。既存の `features/auth`（ログイン・登録）は
クライアントから `authClient` を叩く形のままにし、変更しない。

## アカウント削除

### 確認方法

確認メールのリンク方式（`user.deleteUser.sendDeleteAccountVerification`）を使う。

パスワード入力方式にしないのは、Google のみで登録したユーザーがパスワードを
持たず、先にパスワード設定を強いることになるため。メールのリンクなら
どの登録経路のユーザーも同じ手順で進める。登録時の確認メールや
メールアドレス変更の確認メールとも形が揃う。

リンクを踏む `/api/auth/delete-user/callback` は有効なセッションを要求する
（`getSessionFromCtx` が null なら `FAILED_TO_GET_USER_INFO`）。
ログイン中のブラウザで開く必要があることを、確認メールの文面に書く。

### 組織の孤児化ガード

`OrganizationUser` は `onDelete: Cascade` なので、ユーザーを消すと所属も権限も
黙って消える。ある組織で `user.grant` を持つのが自分だけだった場合、その組織は
以後だれも権限を配れない状態になる。

そのため、**自分が唯一の `user.grant` 保持者である組織が 1 つでもあれば削除を拒否する。**
該当する組織名を列挙して「この組織で他の人に権限を渡してから再度お試しください」と
案内する。復旧不能な状態を作らず、直し方も示す。

ガードは 2 箇所に置く。

1. Server Action の中（確認メールを送る前）。ここで拒否できれば、ユーザーは
   メールを開いてリンクを踏んだ後になって初めて失敗を知る、という体験にならない。
2. `user.deleteUser.beforeDelete` フックの中。確認メールのリンクは Server Action を
   経由しない別の入口であり、Better Auth の `deleteUserCallback` も `beforeDelete` を
   呼ぶ。**境界はこちら**であって、1 は体感のための先出しにすぎない。
   「Server Action の冒頭でも独立に呼ぶ」という既存の原則と同じ形である。

判定クエリは `src/shared/authz/sole-granter.ts` に置き、両方から使う。
`src/shared/lib/auth.ts` は `src/shared/` 配下にあり、biome の `noRestrictedImports`
により `@/features/**` を import できないため、`features/user` 側には置けない。
権限コード（`PERMISSION_CODES`）を所有するのも `src/shared/authz/` なので、
置き場所としても素直である。

## メールアドレス変更

### 流れ

1. Server Action が `auth.api.changeEmail({ body: { newEmail, callbackURL: "/profile?emailChanged=1" }, headers })` を呼ぶ。
2. `emailVerified === true` かつ `sendChangeEmailConfirmation` を設定していないため、
   Better Auth は `requestType: "change-email-verification"` のトークンを作り、
   **新アドレス宛**に `sendVerificationEmail` を呼ぶ。
3. 同じ Server Action が続けて、**現アドレス宛に通知メール（リンク無し）**を送る。
   「メールアドレスの変更が申請されました。心当たりが無い場合は…」という文面。
4. 新アドレスに届いたリンクを踏んだ時点で初めて `User.email` が書き換わる。

タイポしたアドレスに変更しても、リンクが届かないだけでメールアドレスは
変わらない。届かないアドレスへ確定してしまう事故が構造的に起きない。

ログインは username プラグイン導入後、ユーザー名でも通る
（`features/auth/login/identifier.ts`）ため、メールアドレスを失っても
即座に締め出されるわけではない。それでもメールアドレスは確認メール・
パスワードリセットの唯一の宛先であり、届かないアドレスに固定されると
自力で直せる手段が残らない。踏めなければ変わらない、という性質は
username 対応の後も等しく要る。

### アカウント列挙への対応

`changeEmail` は、新アドレスが既に他のユーザーのものだった場合も
`{ status: true }` を返す（実際にはメールを送らない）。画面は成否によらず
「確認メールを送信しました」と出す。登録画面（`SignupForm`）が
`requireEmailVerification` のもとで取っているのと同じ扱いである。

現アドレス宛の通知はこの場合も送る。宛先は本人であり、対象アドレスの
存在有無を漏らさない。

### 確認メールの文面を出し分ける

`sendVerificationEmail` フックは `{ user, url, token }` しか受け取らず、
登録時の確認なのかメールアドレス変更の確認なのかを区別する引数がない。
文面が「ご登録ありがとうございます。現在は仮登録の状態です」のままだと
変更時に誤解を招く。

`url` に埋め込まれた `callbackURL` クエリパラメータを見て判別する。
登録時は `/login?verified=1&redirect=...`、変更時は `/profile?emailChanged=1` を
渡しており、この 2 つは呼び出し側（こちら）が両方とも決めている。
判別は純粋関数として切り出し、`auth.ts` が文面ビルダーを選ぶ。

`src/shared/lib/auth-verification-email.ts` に、既存の `buildVerificationEmail` と
並べて `buildEmailChangeVerificationEmail` と `buildEmailChangeNoticeEmail`
（現アドレス宛の通知）を足す。いずれも既存と同じく純粋関数にして、
送信経路と切り離して文面とエスケープだけを検証できるようにする。

### 別端末でリンクを開いた場合

`verify-email` の `change-email-verification` 分岐は、セッションが無ければ
新しいセッションを作る。`autoSignInAfterVerification: false` はこの経路には
効かない。つまりメールを見た端末がログイン状態になる。既存の登録確認とは
挙動が違うが、リンクを持っているのは新アドレスの所有者本人であり、
許容する。

## エラー写像

`src/shared/errors/auth-error.ts` にタグを追加する。

| タグ | Better Auth のコード | 文言の要点 |
| --- | --- | --- |
| `InvalidPassword` | `INVALID_PASSWORD` | 現在のパスワードが正しくありません |
| `PasswordAlreadySet` | `PASSWORD_ALREADY_SET` | 既にパスワードが設定されています |
| `SessionNotFresh` | `SESSION_NOT_FRESH` | セキュリティのため再ログインが必要です |
| `LastAccountUnlinkForbidden` | `FAILED_TO_UNLINK_LAST_ACCOUNT` | 最後の認証方法は解除できません |
| `AccountNotFound` | `ACCOUNT_NOT_FOUND` | 連携が見つかりません |

タグを足すと `features/auth/messages.ts` の `Match.exhaustive` が
文言の書き忘れをコンパイルエラーにする。既存の意図した安全網なので、
ログイン・登録画面向けの文言もあわせて足す。

`features/user/messages.ts` は同じ `AuthError` に対してプロフィール文脈の
文言を別に持つ。`features/auth` と `features/user` は同列のカテゴリで
互いに import できないため、写像そのものを共有はしない。文言も文脈で変わる。
たとえば `CREDENTIAL_ACCOUNT_NOT_FOUND` は、ログイン画面ではアカウントの
存在を推測させないため意図的に曖昧にしているが、プロフィール画面では
本人のセッションで見ているので「パスワードが未設定です」と言い切れる。

### `runAuthApiCall`

`src/shared/lib/auth-effect.ts` に `runAuthApiCall` を足す。

サーバ側の `auth.api.*` は、クライアントの `authClient` と違って
`{ error }` を返さず `APIError` を throw する（`better-call` の
`InternalAPIError` で、`.body.code` と `.status` を持つ）。既存の
`runAuthCall` は `{ error }` を読む形なので、そのままでは受けられない。

`better-auth/api` が公開する `isAPIError` で判別し、
`toAuthError(e.body?.code, e)` に畳んで既存の `AuthError` と同じ型に揃える。
`runAuthCall` は変更せず、クライアント経路（ログイン・登録）はそのまま残す。

## `auth.ts` の設定追加

```ts
user: {
  ...authUserConfig,
  changeEmail: { enabled: true },
  deleteUser: {
    enabled: true,
    // 削除確認メールを送る。文面ビルダーは shared/lib に置く。
    sendDeleteAccountVerification: async ({ user, url }) => { ... },
    // 孤児化ガード。sole-granter.ts の判定に引っかかれば APIError を投げる。
    beforeDelete: async (user) => { ... },
  },
},
```

`authUserConfig`（`additionalFields.username`）はスプレッドで維持する。
`src/shared/lib/auth-user-config.test.ts` が `usernameAdditionalField` との
同一性で配線を固定しているので、この形なら壊れない。

`changeEmail` と `deleteUser` を `authUserConfig` 側に移さないのは、
どちらもメーラーと孤児化ガードを必要とし、`auth-user-config.ts` を
DB・メール抜きでテストできる状態に保てなくなるため。

## 各操作の対応表

| 操作 | 呼び出す API | 備考 |
| --- | --- | --- |
| 表示名の変更 | `auth.api.updateUser` | `name` のみ。`username` は今回対象外 |
| メール変更 | `auth.api.changeEmail` | 上記フロー |
| パスワード変更 | `auth.api.changePassword` | `currentPassword` 必須 |
| パスワード設定 | `auth.api.setPassword` | サーバ専用 |
| Google 連携追加 | `auth.api.linkSocialAccount` | 返る URL へ `redirect()` |
| Google 連携解除 | `auth.api.unlinkAccount` | `accountId` はサーバで引き当てる |
| 他端末のログアウト | `auth.api.revokeOtherSessions` | |
| アカウント削除 | `auth.api.deleteUser` | 孤児化ガードを先に通す |

連携解除の `accountId` は画面から送らせず、セッションのユーザー ID と
`providerId` から Server Action 側で引き当てる。他人の `accountId` を
送られる経路を作らないため。

連携追加は `auth.api.linkSocialAccount({ body: { provider: "google",
callbackURL: "/profile", errorCallbackURL: "/profile" }, headers })` を呼ぶ。
返る `{ url, redirect }` の `url` へ `next/navigation` の `redirect()` で送る。
これだけは処理がブラウザの遷移で終わるため、フォームの状態を返さない。

## `BYPASS_AUTH=1` での挙動

開発用バイパスでは Better Auth のセッション Cookie が無い。`requireSession()` は
`getBypassSession()` で通るが、`auth.api.*` は `UNAUTHORIZED` になる。つまり

* `/profile` と `/profile/orgs` の**表示は動く**（読み取りは全て Prisma 直参照のため）
* **書き込みは全て失敗する**。画面には「処理に失敗しました」が出る

バイパスは署名検証を通らない裏口であり、Better Auth に本物のセッションを
偽装させることはできない。書き込みの動作確認は通常のログインで行う。
この制約は実装で回避せず、そういうものとして扱う。

## テスト

既存の形に倣う。

* `schema.ts` / `domain.ts` — 純粋関数として直接テストする
* `usecase.ts` — port を `vi.fn()` で差し替え、`Effect.runPromiseExit` の
  `Exit` で成功・失敗の分岐を確認する
* `handler.ts` — `next/navigation`・`next/cache`・`requireSession`・port を
  `vi.mock` で差し替える。`redirect` と `notFound` は例外を投げる形で模す
* `src/shared/authz/sole-granter.ts` — Prisma をモックして、
  唯一の保持者・複数の保持者・非保持者の 3 ケースを確認する
* `src/shared/lib/auth-effect.ts` の `runAuthApiCall` — `APIError` 相当の
  throw と、コードの無い例外の 2 経路を確認する
* 確認メール・通知メールのビルダー — 文面と HTML エスケープを確認する
* `UserMenu` — Testing Library。閉じている間は項目が描画されないこと、
  トリガーで開くこと、Escape と外側クリックで閉じること、
  `aria-expanded` が開閉に追随することを確認する。ログアウトの分岐は
  引き続き `LogoutButton.test.tsx` が持つ
* `AppHeader.test.tsx` — 既存の `LogoutButton` のモックはそのまま効く。
  ユーザー名が「テキスト」から「メニューを開くボタン」に変わるため、
  `getByText` で見ていた既存の 1 件を `getByRole("button")` に直す
* コンポーネント — Testing Library。セクションの出し分け（パスワード未設定 /
  設定済み、Google 連携済み / 未連携）を中心に確認する

## パスワードリセット設計との関係

`docs/superpowers/specs/2026-09-08-password-reset-design.md`（未実装）と
触る場所が重なる。あちらは `changePassword`（ログイン済みユーザーの変更）を
明示的にスコープ外にしているため、機能としては競合しない。ただし

* どちらも `src/shared/lib/auth.ts` の設定に追記する
* どちらも `src/shared/lib/` にメール文面のビルダーを足す
* どちらも `AuthError` にタグを足す（あちらは `INVALID_TOKEN`）

先に入った方に合わせて、後から入る側が追記する。片方が
`Match.exhaustive` の網羅性エラーで落ちたら、それは想定どおりの検出であって
壊れたわけではない。

## 対象外

今回は扱わない。

* `username` の変更。username プラグイン導入後は `updateUser({ username })` で
  済み、重複も `USERNAME_IS_ALREADY_TAKEN` → `UsernameAlreadyExists` として
  写像済みなので、実装そのものは安い。それでも外すのは、username が
  組織への招待でユーザーを指す検索キーであり、変更すると招待側の手順が
  黙って壊れるため。招待側をどうするかと合わせて別途詰める。
* Google 以外の OAuth プロバイダ
* プロフィール画像（`User.image`）の設定
* 組織からの脱退（`/profile/orgs` は表示のみ）
* ログイン中のセッション一覧の表示（破棄は一括のみ）
