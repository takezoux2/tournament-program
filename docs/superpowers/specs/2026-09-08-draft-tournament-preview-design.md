# 準備中の大会を組織メンバーだけがプレビューできるようにする

## 背景と目的

公開ページ `/t/**`（大会トップ・試合一覧・参加者一覧・部門ブラケットの 4 枚）は
ログイン不要で誰でも見られる。公開してよい状態の判定は
`findPublicTournament` が Prisma の `where` で `PUBLIC_TOURNAMENT_STATUSES`
（`IN_PROGRESS` と `COMPLETED`）に絞ることで行っており、`DRAFT`（準備中）の
大会は 404 になる。

このため運営者は、大会を公開状態に遷移させるまで参加者に見える画面を
確認できない。組織のメンバーに限って `DRAFT` でも `/t/**` を開けるようにする。

## 決定事項

- **「管理者」は当該大会の組織メンバー全員**とする。`tournament.edit` などの
  個別権限は問わない。管理画面（`/orgs/[slug]/...`）でその大会を見られる人は
  プレビューも見られる、と範囲を揃えるため。
- **プレビュー時は画面にバナーを出す**。公開済みと見分けが付かないと、
  まだ公開されていない URL をそのまま参加者へ渡す事故が起きうる。
- **閲覧者は引数でゲートに渡す**（repository はセッションに依存しない）。

## 設計

### 1. ゲート関数 — `src/features/tournament/repository.ts`

```ts
export const findPublicTournament = async (
  tournamentId: string,
  viewerUserId: string | null,
): Promise<PublicTournament | null> => {
  const row = await prisma.tournament.findFirst({
    where: {
      id: tournamentId,
      OR: [
        { status: { in: PUBLIC_TOURNAMENT_STATUSES } },
        ...(viewerUserId === null
          ? []
          : [{ organization: { users: { some: { userId: viewerUserId } } } }]),
      ],
    },
    select: { /* 現行のまま */ },
  });
  // ...
};
```

- `viewerUserId` は **デフォルト値を持たない必須引数**にする。閲覧者を
  引数で渡す方式の弱点は呼び出し側での渡し忘れだが、必須にすれば
  既存の呼び出し 8 箇所すべてがコンパイルエラーになり、渡し忘れが
  型で潰れる。
- 判定は引き続き `where` の中だけで行う。取得してから status で弾く形には
  しない。メンバー判定も Prisma のリレーション（`organization.users.some`）で
  表現するので、クエリは 1 本のまま。
- 未ログイン（`viewerUserId === null`）のときは `OR` の第 2 項をそもそも
  組み立てない。空配列を展開するだけなので、`where` は現行と同じ形になる。
- 返り値に `isPreview: boolean` を足す。これは公開可否の判断ではなく
  「ゲートを通ったのが公開状態によるものか、メンバー資格によるものか」の
  表示用フラグで、`!PUBLIC_TOURNAMENT_STATUSES.includes(row.status)` で決まる。

### 2. セッション取得 — `src/shared/middleware/require-session.ts`

`/t/**` はログイン不要なので、redirect しない `getOptionalSession()` を
同じファイルに追加し、`requireSession` をその上に組み直す。
開発用バイパス（`BYPASS_AUTH=1`）を通常認証より優先する順序は現行のまま維持する。

```ts
export const getOptionalSession = async () => {
  const bypassSession = await getBypassSession();
  if (bypassSession) {
    return bypassSession;
  }
  return await auth.api.getSession({ headers: await headers() });
};

export const requireSession = async () => {
  const session = await getOptionalSession();
  if (!session) {
    redirect("/login");
  }
  return session;
};
```

### 3. ページ 4 枚 — `src/app/t/**`

各ページの本体と `generateMetadata`（計 8 箇所）で閲覧者を取ってゲートに渡す。

```ts
const session = await getOptionalSession();
const tournament = await findPublicTournament(
  tournamentId,
  session?.user.id ?? null,
);
```

`generateMetadata` は現行どおりタイトルだけを返し、ゲートが `null` を返したら
`{}` を返す。プレビュー時にタイトルが出ても、そもそもメンバーにしか
到達できないので漏れにはならない。

`src/app/t/layout.tsx` の `robots: { index: false, follow: false }` は
現行のまま。プレビューも公開ページも同じく noindex でよい。

### 4. バナー — `src/components/public/PublicPreviewNotice.tsx`

`PublicHeader` の直下、コンテンツの先頭に置く。

```tsx
{tournament.isPreview && <PublicPreviewNotice />}
```

文面は「この大会は準備中です。この画面は組織のメンバーにしか表示されません。」

`PublicHeader` の prop にせず独立したコンポーネントにするのは、
ヘッダーの責務（パンくず）と混ぜないため。ここだけは書き忘れても
表示が出ないだけで、公開範囲には影響しない。

### 5. `src/proxy.ts`

コード変更は不要。`/t/` を認証チェックから除外したままでよい（未ログインの
閲覧者は `viewerUserId` が `null` になり、現行と同じ公開範囲になる）。

ただしコメントの「境界は `findPublicTournament` の絞り込み
（Prisma の where 句で DRAFT を除外する）」が実態と食い違うので、
「公開状態、またはログイン中の閲覧者がその組織のメンバーであること」に
書き換える。

## テスト

- `src/features/tournament/repository.test.ts`
  - 既存の許可リスト回帰テストは `where` が `OR` に変わるので書き換える。
    許可リストが `["IN_PROGRESS", "COMPLETED"]` であること、`DRAFT` を
    含まないことを固定する 2 件はそのまま残す。
  - 未ログイン（`null`）のとき `where` にメンバー条件が入らないこと。
  - ログイン中は `OR` の第 2 項に `viewerUserId` が入ること。
  - `isPreview` が status から決まること（`DRAFT` なら true、
    `IN_PROGRESS` なら false）。
- `src/shared/middleware/require-session.test.ts`
  - `getOptionalSession` が redirect せず `null` を返すこと。
  - バイパスセッション優先の順序が `getOptionalSession` でも保たれること。
  - `requireSession` の既存テストはそのまま通ること。
- `src/app/t/**/page.test.tsx`（4 枚）
  - 現在のモックは `(tournamentId) => findPublicTournament(tournamentId)` と
    第 2 引数を捨てているので、両方を転送する形に直す。
  - セッションの `user.id` をゲートに渡すこと。
  - 未ログインなら `null` を渡すこと。
  - `isPreview: true` ならバナーが出て、`false` なら出ないこと。

## やらないこと

- 管理画面から `/t/**` へのプレビューリンクの設置。今回の要望に含まれない。
- 専用の権限コード（`tournament.preview` など）の追加。組織メンバー全員で
  足りるため、Permission マスタの migration は不要。
