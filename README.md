This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## 認証のセットアップ

認証には [Better Auth](https://www.better-auth.com/) を使っている。
メール+パスワードと Google OAuth に対応している。

### 環境変数

`.env.example` をコピーして `.env` を作り、以下を設定する。

| 変数 | 内容 |
| --- | --- |
| `BETTER_AUTH_SECRET` | セッショントークンの署名鍵。`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` で生成する |
| `BETTER_AUTH_URL` | アプリの URL。開発時は `http://localhost:3000`。**実際に配信されているオリジン（ポート番号含む）と必ず一致させること**。`next dev` が 3000番ポートの使用中により別のポートへフォールバックした場合も追従して変更する。ずれていると、Cookie を送らない curl 等の疎通確認は通る一方、ログイン後のブラウザ操作（ログアウトなど）だけが `403 INVALID_ORIGIN` で失敗し、原因に気づきにくい |
| `GOOGLE_CLIENT_ID` | 下記の手順で発行する |
| `GOOGLE_CLIENT_SECRET` | 下記の手順で発行する |
| `BYPASS_AUTH` | 開発用の認証バイパス。`"1"` のときだけ有効になる。**本番環境では絶対に設定しないこと**（下記参照） |

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
| `src/shared/lib/auth-bypass.ts` | 開発用バイパスの純粋な部分（Cookie 名・有効判定・セッション組み立て） |
| `src/shared/lib/auth-bypass-session.ts` | 同バイパスの副作用側（Cookie 読み取り・`User` の引き当て） |
| `src/shared/middleware/require-session.ts` | **認証の実際の境界。** 保護するページ・Server Action の冒頭で呼ぶ |
| `src/shared/middleware/require-organization.ts` | **組織スコープの実際の境界。** `/orgs/[slug]` 配下のページ・Server Action の冒頭で呼ぶ。非所属は 403 ではなく 404 にし、組織の存在自体を漏らさない |
| `src/proxy.ts` | 未ログインを `/login` へ送る最適化。Cookie の有無しか見ておらず、境界ではない |
| `src/features/auth/domain.ts` | `safeRedirectPath`。ログイン後の遷移先を同一オリジンに限定するオープンリダイレクト対策 |
| `src/features/auth/messages.ts` | `AuthError` → 日本語文言。`Match.exhaustive` によりタグを足して文言を忘れるとコンパイルエラーになる |
| `src/features/auth/{login,signup}/` | 各スライス（`schema.ts` / `usecase.ts`）。UI は含まない |
| `src/components/auth/` | ログイン / サインアップ / ログアウトの画面コンポーネント（`LoginForm.tsx` / `SignupForm.tsx` / `LogoutButton.tsx`） |

新しく保護したいページを追加するときは、`requireSession()` を呼ぶこと。
`src/proxy.ts` の matcher を通ったことは認証済みを意味しない。

### 開発用の認証バイパス（`BYPASS_AUTH=1`）

動作確認で任意のユーザーになりたいときのための裏口。
`BYPASS_AUTH=1` を設定した状態で `USER_ID` Cookie に `User.id` を入れると、
そのユーザーがログイン中として扱われる。

```
# ブラウザの DevTools コンソールで（http://localhost:3000 を開いた状態）
document.cookie = "USER_ID=<User.id>; path=/";
```

- **本番環境では絶対に設定しないこと。** セッショントークンの署名検証も
  パスワード確認も一切行わず、Cookie に ID を書けるだけで誰にでもなりすませる。
  スイッチは環境変数ひとつだけで、`NODE_ENV` によるガードはあえて入れていない。
- Cookie の値は `User.id`（メールアドレスや名前ではない）。DB に存在しない ID なら
  バイパスは成立せず、通常の認証へフォールバックする。
- バイパス中はログアウトボタンを押してもセッションは終わらない。
  Better Auth のセッションを消すだけで `USER_ID` Cookie は残るため、
  抜けるには Cookie を自分で削除する（または `BYPASS_AUTH` を外す）。

### 既知のリスク: アカウント事前乗っ取り

メール確認なしの自己サインアップと、Google アカウント連携の自動許可
（`account.accountLinking = { enabled: true, trustedProviders: ["google"] }`）を
組み合わせているため、攻撃者が被害者のメールアドレスで先にパスワード登録し、
後で被害者が Google でログインするとそのアカウントへ連携されてしまう恐れがある
（詳細は `docs/superpowers/specs/2026-08-27-better-auth-design.md` の
「リスクと留意点」を参照）。モックデータのみの現段階では許容しているが、
**実ユーザーが登場する前に** `emailVerification` / `requireEmailVerification`
を設定すること。
