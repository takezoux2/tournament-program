# ログイン識別子をユーザー名とメールアドレスの両方で受け付ける

## 背景

ログインはメールアドレスのみを受け付けている。`LoginForm` が `authClient.signIn.email`
を直接呼び、`loginSchema` がメール形式を強制しているためである。

一方 `User.username` は既に unique 列として存在し、組織へのユーザー追加時の検索キーとして
使われている。ユーザーは自分のユーザー名を知っているのに、それではログインできない。

## ゴール

ログイン画面の識別子欄に、ユーザー名とメールアドレスのどちらを入力してもログインできる。

## 非ゴール

- サインアップ画面の変更（`username` は既に必須入力）
- Google ログイン経路の変更
- パスワードリセットなど、他の認証フローの識別子対応

## 全体の流れ

```
LoginForm (client)
  └─ loginSchema.safeParse({ identifier, password })
       └─ loginIdentifierSchema → LoginIdentifier
            { kind: "email", email } | { kind: "username", username }
  └─ login(ports, input, callbackURL)   ← features/auth/login/usecase.ts
       ├─ email    → authClient.signIn.email    → /api/auth/sign-in/email
       └─ username → authClient.signIn.username → /api/auth/sign-in/username
```

DB 変更・マイグレーションは不要。`User.username` は既に unique 列である。

## 採用した方針と、採らなかった方針

**採用**: better-auth の `username` プラグインを足し、`/sign-in/username` を使う。

`/sign-in/username` の実装（`better-auth/dist/plugins/username/index.mjs`）は、
資格情報アカウントの探索・パスワード検証・`requireEmailVerification` 時の
確認メール再送（`sendOnSignIn`）まで `/sign-in/email` と同じ順序で行う。
自前で組むと、この振る舞いを追随し続ける責任を負うことになる。

**採らなかった案 1**: Server Action で識別子からユーザーを引き、`auth.api.signInEmail` を
サーバ側で呼ぶ。プラグインを入れずに済むが、ログイン経路だけがクライアントの
`authClient` からサーバへ移り、Google ログインと経路が分かれる。実装量も多い。

**採らなかった案 2**: username から email を引く API を作り、クライアントで
`signIn.email` に渡す。ユーザー名からメールアドレスを引ける口ができるため却下。

## サーバ側の配線

新規 `src/shared/lib/auth-username-plugin.ts` に、`username()` をこのプロジェクトの
規則へ合わせて包んだ `usernamePlugin` を置く。

渡すオプション:

| オプション | 値 | 理由 |
|---|---|---|
| `displayUsername` | `false` | `displayUsername` 列が無い。`true` だと存在しない列へ書きに行く |
| `minUsernameLength` | `1` | 既定 3。`usernameSchema` の下限は 1 |
| `maxUsernameLength` | `MAX_USERNAME_LENGTH`（50） | 既定 30 |
| `usernameValidator` | `USERNAME_PATTERN` による判定 | 既定は `^[a-zA-Z0-9_.]+$` で、`.` を許し `-` を許さない。このプロジェクトの規則は `^[A-Za-z0-9_-]+$` |

規則の値は `src/shared/lib/username.ts` の既存の定数から取り、規則の出どころを 1 つに保つ。

さらに、プラグインが返すオブジェクトの `schema.user.fields.username` を
`usernameAdditionalField`（`auth-user-fields.ts`）の内容で上書きし直す。

これは `better-auth/dist/db/schema.mjs` の `getFields` が

```
{ ...coreSchema, ...user.additionalFields, ...plugin.schema.user.fields }
```

の順で spread するためである。プラグインのフィールド定義が後から勝つので、包まずに
そのまま渡すと、既存の `required: true` と zod validator が
プラグインの `required: false` に静かに置き換わる。`username` が省略された直接 POST が
API の検証を素通りし、NOT NULL 制約まで落ちてから `FAILED_TO_CREATE_USER` になる。

`auth.ts` の変更は `plugins: [usernamePlugin, nextCookies()]` の 1 行のみ
（`nextCookies` は末尾でなければならない、という既存の制約は保つ）。
`user: authUserConfig` はそのまま残す。プラグイン側が同じ定義を持つため実質は
二重宣言だが、どちらの spread が勝っても定義が変わらない状態にしておく。

`auth-client.ts` は `createAuthClient({ plugins: [usernameClient()] })` にする。
`signIn.username` の型を得るために必要。

**レビューで見つかった追記**: `username()` は `...base` の spread 経由で
`base.endpoints` も渡ってくる。better-auth はプラグインが返す `endpoints` の
キーをそのまま `/api/auth/*` にマウントするため（`better-auth/dist/api/index.mjs`）、
使うつもりの `signInUsername` だけでなく `isUsernameAvailable`
（`POST /api/auth/is-username-available`）も生えてしまう。このエンドポイントは
未認証で「そのユーザー名は存在するか」を答える、まさにこのアプリが避けている
アカウント列挙の口そのもの（サインアップの「成功したふり」や、採らなかった案 2 を
却下した理由と同じ問題）。しかもこのアプリでは呼んでもいないし、`/sign-in` 接頭辞
向けの better-auth のレート制限にも乗らない。そのため `auth-username-plugin.ts` で
`base.endpoints` から `isUsernameAvailable` を除いてから `usernamePlugin` に渡す。
次に別のプラグインを足すときも、`endpoints` だけでなく `schema` や
`databaseHooks` など、そのプラグインが何を一緒に持ち込むかを確認すること。

## 入力の判別

新規 `src/features/auth/login/identifier.ts`。

```ts
export type LoginIdentifier =
  | { readonly kind: "email"; readonly email: string }
  | { readonly kind: "username"; readonly username: string };

export const loginIdentifierSchema =
  z.string()
    .transform((raw) => raw.trim())
    .pipe(z.string().min(1, "ユーザー名またはメールアドレスを入力してください"))
    .transform(classifyLoginIdentifier)
    .pipe(z.discriminatedUnion("kind", [emailBranch, usernameBranch]));
```

`classifyLoginIdentifier` は純粋関数。`"@"` を含めば
`{ kind: "email", email: normalizeEmail(value) }`、含まなければ
`{ kind: "username", username: normalizeUsername(value) }` を返す。
`usernameSchema` は `"@"` を許さないため、この分け方に曖昧さはない。

`emailBranch` は `z.email("メールアドレスの形式が正しくありません")`、
`usernameBranch` は既存の `usernameSchema` を使う。形式エラーの文言は現状と同じものが出る。

`loginSchema`（`login/schema.ts`）は `email` フィールドを
`identifier: loginIdentifierSchema` に置き換える。`password` は変更しない。

## ユースケース

`login/usecase.ts` は 2 つのポートを受け取り、識別子の種別で呼び分ける。

```ts
export type LoginPorts = {
  readonly signInEmail: AuthCallPort<{ email: string; password: string; callbackURL: string }>;
  readonly signInUsername: AuthCallPort<{ username: string; password: string; callbackURL: string }>;
};
```

`runAuthCall` はそのまま使う。失敗の畳み込みは既存のまま変わらない。

## エラー写像

`shared/errors/auth-error.ts` の `toAuthError` に、プラグインのエラーコードを足す。

| コード | 写像 | 備考 |
|---|---|---|
| `INVALID_USERNAME_OR_PASSWORD` | `InvalidCredentials` | 追加 |
| `USERNAME_IS_ALREADY_TAKEN` | `UsernameAlreadyExists` | 追加。プラグインが `/sign-up/email` の前段で重複を弾く |
| `USERNAME_TOO_SHORT` / `USERNAME_TOO_LONG` / `INVALID_USERNAME` | `InvalidUsername`（新タグ） | クライアント検証を迂回した直接 POST か、プラグインのオプションが `usernameSchema` からずれたときに出る |
| `FAILED_TO_CREATE_USER` | `UnexpectedAuthError` | `UsernameAlreadyExists` から移す |
| `EMAIL_NOT_VERIFIED` | `EmailNotVerified`（変更なし） | `/sign-in/username` も同じ実装で確認メールを再送する |

`FAILED_TO_CREATE_USER` を移すのは、プラグイン導入後はユーザー名重複が登録前に
`USERNAME_IS_ALREADY_TAKEN` で弾かれ、「重複が最も可能性の高い原因」という
現在の前提が成り立たなくなるため。

`features/auth/messages.ts` の文言:

- `InvalidCredentials`: 「ユーザー名・メールアドレスまたはパスワードが正しくありません」
  （ユーザー名でログインした人に「メールアドレスが…」と出さない。どれが誤りかは示さない）
- `UsernameAlreadyExists`: 「そのユーザー名は既に使われています。別の名前でお試しください」
  （推測の「可能性があります」を外し、断定形にする）
- `InvalidUsername`: 「ユーザー名の形式が正しくありません」

`Match.exhaustive` により、タグを足して文言を足し忘れればコンパイルエラーになる。

## 画面

`components/auth/LoginForm.tsx`:

- ラベル「メールアドレス」→「ユーザー名またはメールアドレス」
- `name` / `id`: `email` → `identifier`
- `type="email"` → `type="text"`（`type="email"` のままだとブラウザの検証が
  ユーザー名入力を送信前に弾く）
- `autoComplete="email"` → `autoComplete="username"`

Google ログインのボタンと `verificationNotice` は変更しない。

## テスト

新規:

- `features/auth/login/identifier.test.ts` — `"@"` の有無による分岐、前後空白の除去、
  大文字の小文字化、空欄、メール形式エラー、ユーザー名の使用不可文字
- `shared/lib/auth-username-plugin.test.ts` — オプションが `usernameSchema` の規則
  （`MAX_USERNAME_LENGTH`、`USERNAME_PATTERN`）と一致すること、
  `schema.user.fields.username` が `required: true` と validator を保っていること、
  `displayUsername` フィールドを持たないこと

更新:

- `features/auth/login/schema.test.ts` — `email` から `identifier` へ
- `features/auth/login/usecase.test.ts` — 種別ごとに一方のポートだけが呼ばれること、
  `callbackURL` が渡ること
- `shared/errors/auth-error.test.ts` — 新コードの写像、`FAILED_TO_CREATE_USER` の移動
- `features/auth/messages.test.ts` — 新しい文言
- `components/auth/LoginForm.test.tsx` — 新しいラベル、ユーザー名入力で
  `signIn.username` が呼ばれること、メール入力で `signIn.email` が呼ばれること

`auth.ts` 自体は import すると `betterAuth()` が Prisma アダプタを組み立てるためテストしない
（`auth-user-config.ts` の既存コメントと同じ理由）。検証は `auth-username-plugin.ts` 側に置く。
