# Better Auth 導入設計

- 日付: 2026-08-27
- 対象: tournament-program に認証基盤を導入する
- 認証方式: メール+パスワード、Google OAuth

## 背景と目的

本アプリには現在認証が存在しない。`User` / `Organization` / `OrganizationMember` モデルは
定義済みだが、ユーザーがログインする手段がないため、大会の作成・編集といった運営操作を
誰が行ったのか特定できない。

本設計では Better Auth を導入し、以下を満たす。

- アプリ全体をログイン必須にする
- メール+パスワードによる自由なサインアップを許可する
- Google OAuth ログインを許可する
- 同一メールアドレスの Google アカウントは既存ユーザーへ自動連携する

## スコープ

### 含むもの

- Better Auth のサーバー設定・クライアント設定
- Prisma スキーマへの認証テーブル追加とマイグレーション
- サインアップ / ログイン / ログアウトの画面と処理
- 未ログインユーザーの `/login` へのリダイレクト
- `docs/code-design/architecture.md` に沿ったディレクトリ構成の導入
- Effect による usecase 層のエラー管理（本プロジェクト初導入）

### 含まないもの

- メールアドレス確認（verification メール送信）
- パスワードリセット
- Google 登録ユーザーが後からパスワードを設定する導線（`auth.api.setPassword` で後日追加可能）
- 組織への招待・所属管理
- 認可（ロールに基づくアクセス制御）
- E2E テスト

## 技術選定

| パッケージ | バージョン | 用途 | 選定理由 |
| --- | --- | --- | --- |
| `better-auth` | ^1.7.2 | 認証本体 | stable 版。peer に `next ^16.0.0` と `@prisma/client ^7.0.0` を含む。scrypt によるパスワードハッシュ、DB セッション、OAuth を内包する |
| `@better-auth/prisma-adapter` | ^1.7.2 | Prisma アダプタ | 1.7 系で独立パッケージ化された。旧サブパス `better-auth/adapters/prisma` ではなくこちらを使う |
| `zod` | ^4 | 入力検証 | architecture.md の指定。better-auth 自身が `zod ^4.3.6` に依存しており版が揃う |
| `effect` | ^3.22.1 | 副作用・エラー管理 | architecture.md の指定 |
| `auth` (CLI) | 1.7.2 | スキーマ生成 | `npx auth generate`。旧 `@better-auth/cli` は 1.4.21 で更新停止しており使わない |

### next-auth を採用しなかった理由

Next.js 16 に対応する next-auth は 5.0.0-beta 系のみで、stable 版が存在しない。
Better Auth は 1.7.2 が stable かつ Next 16 / Prisma 7 を peer で明示している。

### Better Auth 採用による設計上の帰結

- **パスワードハッシュが内蔵**（scrypt）のため `bcryptjs` 等を追加しない
- **セッションは DB 保存が既定**。メール+パスワードを有効にしても JWT に強制されないため、
  セッションの個別失効が可能
- **パスワードは `Account.password` に格納される**。`User` に `passwordHash` を追加しない

## データモデル

`npx auth generate` にスキーマを生成させ、その差分をレビューしてから採用する。手書きしない。

### 既存 `User` への追加

```prisma
emailVerified Boolean   @default(false)
image         String?
sessions      Session[]
accounts      Account[]
```

`emailVerified` は Better Auth では **Boolean** である（next-auth の `DateTime?` とは異なる）。
既存の `name String`（非 null）は Better Auth の要件と一致するため変更しない。

### 新規モデル

| モデル | 役割 | 主なフィールド |
| --- | --- | --- |
| `Session` | DB セッション | `id`, `userId`, `token` (unique), `expiresAt`, `ipAddress?`, `userAgent?` |
| `Account` | 資格情報とプロバイダ連携 | `id`, `userId`, `accountId`, `providerId`, `password?`, `accessToken?`, `refreshToken?`, `idToken?`, `scope?`, 各種期限 |
| `Verification` | 検証トークン | `id`, `identifier`, `value`, `expiresAt` |

マイグレーションは 1 本にまとめる。

## ディレクトリ構成

`docs/code-design/architecture.md` の垂直スライス構成に従う。

```
src/
├── shared/
│   ├── db/prisma.ts                    # src/lib/prisma.ts から移動
│   ├── lib/auth.ts                     # betterAuth({...}) サーバー設定
│   ├── lib/auth-client.ts              # createAuthClient (better-auth/react)
│   ├── lib/auth-effect.ts              # runAuthCall。Better Auth 呼び出しを Effect に包む
│   ├── errors/auth-error.ts            # Data.TaggedError による認証エラー型
│   └── middleware/require-session.ts   # RSC / Server Action 用ガード
├── components/auth/                    # UI は features ではなく components に置く
│   ├── LoginForm.tsx
│   ├── SignupForm.tsx
│   └── LogoutButton.tsx
├── features/auth/
│   ├── domain.ts                       # safeRedirectPath（login / signup 双方が使う）
│   ├── domain.test.ts
│   ├── messages.ts                     # AuthError → 日本語文言（Match.exhaustive）
│   ├── signup/
│   │   ├── schema.ts
│   │   ├── usecase.ts
│   │   └── usecase.test.ts
│   └── login/
│       ├── schema.ts
│       ├── usecase.ts
│       └── usecase.test.ts
├── app/
│   ├── api/auth/[...all]/route.ts
│   ├── (auth)/login/page.tsx
│   ├── (auth)/signup/page.tsx
│   └── page.tsx                        # requireSession() を追加
└── proxy.ts
```

`src/lib/prisma.ts` を `src/shared/db/prisma.ts` へ移動する。現時点で
このモジュールを import しているファイルは存在しないため、他への影響はない。

### architecture.md の `handler.ts` / `repository.ts` を auth スライスに作らない理由

- ルーティングは Next.js の `app/` ディレクトリが所有する。`app/api/auth/[...all]/route.ts`
  が唯一のエントリポイントであり、スライス側に `handler.ts` を置いても委譲するだけになる
- 認証テーブルへの DB 操作は Better Auth のアダプタが所有する。スライス側に
  `repository.ts` を置く余地がない

既存の `features/tournament` は `components/` `lib/` `mock/` 構成であり architecture.md と
一致していないが、本設計では既存スライスの移行は行わない。

### 各ファイルの責務

| ファイル | 責務 |
| --- | --- |
| `features/auth/domain.ts` | 純粋関数 `safeRedirectPath(raw: string \| null \| undefined): string`。`/` 始まりかつ `//` `/\` で始まらず、タブ・LF・CR を含まない値のみ通し、それ以外は `/` を返す。login / signup 双方が使うためカテゴリ直下に置く |
| `features/auth/messages.ts` | `AuthError` → 日本語文言。`Match.exhaustive` で網羅性を保証する |
| `features/auth/signup/schema.ts` | Zod スキーマ。`name` / `email` / `password`。パスワード長は `shared/lib/password-policy.ts` の定数を使う |
| `features/auth/signup/usecase.ts` | `runAuthCall` で `authClient.signUp.email` を包み、失敗を `AuthError` タグへ写像する |
| `features/auth/login/schema.ts` | Zod スキーマ。`email` / `password`。既存ユーザーを締め出さないようパスワード長の下限は課さない |
| `features/auth/login/usecase.ts` | `runAuthCall` で `authClient.signIn.email` を包み、失敗を `AuthError` タグへ写像する |
| `components/auth/LoginForm.tsx` | メール+パスワードのフォームと Google ボタン |
| `components/auth/SignupForm.tsx` | 名前・メール・パスワードのフォームと Google ボタン |
| `components/auth/LogoutButton.tsx` | `authClient.signOut()` を呼び `/login` へ遷移するクライアントコンポーネント |

`domain.ts` に「メールアドレス正規化」は置かない。`normalizeEmail` は login / signup 双方に加えて
将来の機能からも使いうるため `shared/lib/email.ts` にある。パスワード長の判定も専用の純粋関数を
持たず、`schema.ts` が `shared/lib/password-policy.ts` の定数で直接チェックする。

## Better Auth 設定

`src/shared/lib/auth.ts`:

```ts
betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true, autoSignIn: true },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  account: {
    accountLinking: { enabled: true, trustedProviders: ["google"] },
  },
  plugins: [nextCookies()],
})
```

- `baseURL` は必須。未設定だと Google の `redirect_uri_mismatch` になる
- `nextCookies()` は plugins 配列の**最後**に置く必要がある
- `trustedProviders: ["google"]` により、同一メールの Google ログインが
  メール確認を経ずに既存ユーザーへ連携される。Google は検証済みメールを返すため許容する
- **注意（アカウント事前乗っ取り）**: メール確認なしの自己サインアップと
  この自動連携を組み合わせると、被害者のメールアドレスで攻撃者が先に
  パスワード登録しておき、後で被害者が Google でログインした際に
  そのアカウントへ連携されてしまう恐れがある。詳細と対応方針は
  「リスクと留意点」の表を参照

`src/app/api/auth/[...all]/route.ts`:

```ts
export const { GET, POST } = toNextJsHandler(auth);
```

## アクセス保護の二層構造

### 第一層: `src/proxy.ts`（最適化）

Better Auth の `getSessionCookie(request)` でセッション Cookie の**有無のみ**を判定し、
無ければ `/login?redirect=<元のパス>` へリダイレクトする。

`config.matcher` から以下を除外する。

- `/api/auth/:path*`
- `/login`, `/signup`
- `/_next/:path*`, 静的アセット

Next.js 16 では proxy は Node.js ランタイムが既定であり DB 参照も可能だが、ここでは
Cookie の有無を見るだけに留める。**これはセキュリティ境界ではなく、体感速度のための
最適化である。** Cookie の存在は署名検証を意味しない。

### 第二層: `requireSession()`（セキュリティ境界）

`src/shared/middleware/require-session.ts`:

```ts
const session = await auth.api.getSession({ headers: await headers() });
if (!session) redirect("/login");
return session;
```

DB に対してセッションを検証する。保護対象の Server Component / Server Action の
冒頭で呼ぶ。「アプリ全体をログイン必須」の要件は、`src/app/page.tsx` の冒頭で
これを呼ぶことで満たす。今後ページを追加する際も同じ規約に従う。

## Effect の使用範囲

`src/shared/errors/auth-error.ts` で `Data.TaggedError` により以下を定義する。

| タグ | 発生条件 |
| --- | --- |
| `InvalidCredentials` | メールまたはパスワードが一致しない |
| `EmailAlreadyExists` | サインアップ時に既に登録済みのメール |
| `WeakPassword` | Better Auth のサーバー側パスワード長チェックに弾かれた |
| `UnexpectedAuthError` | 上記以外の Better Auth / ネットワーク由来の失敗 |

`WeakPassword` は通常クライアント側の Zod 検証で先に弾かれるため到達しない。
Better Auth が独自に持つ `minPasswordLength` / `maxPasswordLength` の判定と
Zod スキーマがずれた場合の保険として、タグを定義しておく。両者の下限・上限は
`shared/lib/auth.ts` と `signup/schema.ts` で同じ定数を参照して揃える。

`features/auth/*/usecase.ts` は `Effect.Effect<Result, AuthError>` を返す記述として書き、
Better Auth の API 呼び出しは `Effect.tryPromise` で包んでエラーを上記タグに写像する。
フォームコンポーネント（境界）で `Effect.runPromiseExit` し、`Match` でタグごとの
表示文言へ落とす。

React コンポーネント本体と Better Auth のハンドラは Effect を使わない素の実装とする。

**この層の実利はエラータグの網羅性をコンパイル時に保証する点にほぼ限られる。**
Better Auth が handler / repository / ハッシュ / セッションを所有しているため、
Effect が管理すべき自前の副作用が少ないためである。本プロジェクトにおける
Effect 導入の最初の事例として、この範囲に留めて導入する。

## 画面

| パス | 内容 |
| --- | --- |
| `/login` | メール+パスワードのフォーム、「Google でログイン」ボタン、`/signup` へのリンク |
| `/signup` | 名前・メール・パスワードのフォーム、「Google で登録」ボタン、`/login` へのリンク |
| ヘッダー | ログイン中はユーザー名とログアウトボタンを表示 |

`(auth)` ルートグループ配下の 2 ページは、対応するスライスのフォームコンポーネントを
配置するだけの薄い層とする。

ログイン成功後は `?redirect=` があればそのパスへ、無ければ `/` へ遷移する。
`redirect` パラメータはオープンリダイレクトを防ぐため、`/` 始まりの相対パスのみ許可する
（`//` および `/\` で始まる値はプロトコル相対 URL になりうるため拒否する）。

## エラーハンドリング

- Zod による入力検証はフォーム送信前にクライアント側で行い、サーバー側でも
  Better Auth が再検証する
- Better Auth のエラーは usecase 層で `AuthError` のタグへ写像し、UI では
  日本語のメッセージを表示する
- ログイン失敗時は「メールアドレスまたはパスワードが正しくありません」と表示し、
  どちらが誤りかは示さない（アカウント列挙の防止）

## 環境変数

`.env.example` に追記する。

| 変数 | 例 | 用途 |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | ランダム 32 バイト | セッショントークンの署名 |
| `BETTER_AUTH_URL` | `http://localhost:3000` | OAuth コールバック URL の組み立て |
| `GOOGLE_CLIENT_ID` | — | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | — | Google OAuth |

### 手作業が必要な手順

Google Cloud Console での OAuth クライアント作成は自動化できない。README に以下を記載する。

1. Google Cloud Console でプロジェクトを作成する
2. 「APIとサービス」→「認証情報」→「OAuth クライアント ID を作成」→ ウェブアプリケーション
3. 承認済みのリダイレクト URI に `http://localhost:3000/api/auth/callback/google` を追加する
4. 発行された ID とシークレットを `.env` の `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` に設定する

## テスト方針

vitest で以下を検証する。

| 対象 | 内容 |
| --- | --- |
| `shared/lib/email.ts` | `normalizeEmail` の trim + 小文字化、空文字・空白のみ |
| `shared/errors/auth-error.ts` | Better Auth の各エラーコードが正しいタグへ写像されること。未知コードは元の文字列を保持したまま `UnexpectedAuthError` になること |
| `shared/lib/auth-effect.ts` | `runAuthCall` が「Promise の reject」と「解決値の `{ error }`」の両方を `AuthError` に畳むこと |
| `features/auth/messages.ts` | 各タグの文言。ログイン失敗はメールとパスワードのどちらが誤りか示さないこと |
| `features/auth/domain.ts` | `safeRedirectPath`。`/dashboard` は通し、`//evil.com` `/\evil.com` `https://evil.com` `null` と、タブ・LF・CR を含む値は `/` になること。半角スペースは通すこと |
| `signup/schema.ts`, `login/schema.ts` | Zod の境界値。メール形式、パスワード長の下限・上限、名前の空文字 |
| `signup/usecase.ts`, `login/usecase.ts` | ポートをモックし、入力がそのまま渡ることと失敗が素通しされること |
| `components/auth/*.tsx` | Google ボタンとログアウトの失敗時に、ボタンが再度有効になり `role="alert"` が出ること |
| `require-session.ts` | セッション有無による戻り値と `redirect` 呼び出し |

Better Auth 本体および Prisma は実際には呼ばない。E2E テストは本設計の範囲外とする。

## 検証手順

実装完了時に以下がすべて通ることを確認する。

1. `pnpm exec next typegen`（新しい worktree では `LayoutProps` 解決のため先に必要）
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm test`
5. `pnpm build`
6. 手動確認: サインアップ → ログアウト → 同じ資格情報でログイン → 保護ページ表示
7. 手動確認: 未ログインで `/` を開くと `/login` へリダイレクトされる

Google OAuth の疎通は実際の Client ID が必要なため、環境変数が設定された環境での
手動確認とする。

## リスクと留意点

| リスク | 対応 |
| --- | --- |
| `@better-auth/prisma-adapter` の import パスが公式ドキュメントと異なる（ドキュメントには旧サブパス `better-auth/adapters/prisma` の記載も残る） | 実装時に実際の型定義を確認して確定する |
| `npx auth generate` が Prisma 7 の `prisma7.config.ts` とカスタム出力先 `src/generated/prisma` を正しく扱えない可能性 | 生成結果を必ずレビューし、必要なら手で補正する |
| proxy の Cookie チェックだけで保護済みと誤解されること | `requireSession()` を境界とする方針をコード上のコメントと本設計書に明記済み |
| Effect 導入により既存コードとのスタイル差が生まれる | 適用範囲を `features/auth/*/usecase.ts` に限定する |
| **アカウント事前乗っ取り**: メール確認なしの自己サインアップと `accountLinking.enabled: true` の組み合わせにより、攻撃者が被害者のメールアドレスで先にパスワード登録し、後で被害者が Google でログインすると Better Auth がその Google アイデンティティを攻撃者の既存アカウントへ連携してしまう。攻撃者は自分が設定したパスワードで被害者のアカウントに入り続けられる | 現段階（モックデータのみ・実ユーザー不在）ではリスクを許容し、挙動は変更しない。**実ユーザーが登場する前に**、Better Auth の `emailVerification` と `requireEmailVerification` を設定し、メール未確認のパスワードアカウントへは連携できないようにすることが解消条件 |
