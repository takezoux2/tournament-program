# 組織・大会の CRUD 画面 設計

作成日: 2026-08-29

## 目的

`Organization`（組織）と `Tournament`（大会）の作成・一覧・閲覧・編集・削除の画面を作る。

現在、`Organization` はアプリケーションコードから一度も参照されていない（`src/generated`
を除くと参照数 0）。ログインしても所属組織がなく、大会を作る親が存在しない。
トーナメント表は Mock データの表示専用で、DB とはつながっていない。

本設計はその最初の一歩として、組織と大会を DB に登録・編集できるようにする。

## スコープ

### 含むもの

- 組織の作成・一覧・閲覧・編集・削除
- 大会の作成・一覧・閲覧・編集・削除
- 組織への所属を検証する認可境界 `requireOrganization()`
- 既存 `features/tournament`（ブラケット描画）の `features/bracket` へのリネーム
- Mock トーナメント表の `/` から `/mock` への移設

### 含まないもの

- 組織へのメンバー招待、ロール（OWNER / ADMIN / MEMBER）の変更
- `Division`（部門）の CRUD
- `Member` / `Participant` の管理
- 大会ステータスの遷移（作成時は常に `DRAFT`）
- エントリー登録、組み合わせ抽選、勝敗入力

## 画面構成とルーティング

アクティブな組織は **URL のみ**が保持する。Cookie にもサーバー状態にも持たない。
リンク共有とタブごとの別組織が自然に動き、認可の根拠が URL の `slug` 一点に集約される。

```
/                                              組織一覧（所属組織 + 「組織を作成」）
/orgs/new                                      組織の作成
/orgs/[slug]                                   組織の閲覧 = 組織情報 + 大会一覧
/orgs/[slug]/edit                              組織の編集（+ 削除）
/orgs/[slug]/tournaments/new                   大会の作成
/orgs/[slug]/tournaments/[tournamentId]        大会の閲覧
/orgs/[slug]/tournaments/[tournamentId]/edit   大会の編集（+ 削除）
/mock                                          既存 Mock トーナメント表（移設のみ）
```

削除には専用ページを作らず、各編集ページの下部に確認付きで置く。

### 編集できる項目

| モデル | 編集可 | 編集不可 | 理由 |
| --- | --- | --- | --- |
| `Organization` | `name` | `slug` | `slug` を変えると URL が変わり、共有済みリンクとブックマークが黙って壊れる。表示には `name` を使うため実用上の不足はない |
| `Tournament` | `name`, `startsAt` | `status`, `organizationId` | `status` の遷移は結果入力機能と一緒に設計する。大会の組織間移動は手段を持たない |

### 一覧の並び順と空状態

| 一覧 | 並び順 | 空のとき |
| --- | --- | --- |
| 組織一覧（`/`） | `OrganizationUser.joinedAt` の昇順 | 「まだ組織がありません」と作成への導線だけを出す |
| 大会一覧（`/orgs/[slug]`） | `createdAt` の降順 | 「まだ大会がありません」と作成への導線だけを出す |

大会の並びに `startsAt` を使わないのは、`startsAt` が nullable であり、
未設定の大会の位置が定まらないため。

### slug の仕様

組織名は日本語が想定され自動生成できないため、作成時にユーザーが入力する。

- 半角英小文字・数字・ハイフンのみ
- 3〜50 文字
- 先頭・末尾がハイフンでないこと、ハイフンの連続を含まないこと
- 予約語（`new`, `orgs`, `api`, `login`, `signup`, `mock`）を禁止
- 重複は DB の unique 制約違反を捕まえて「この ID は既に使われています」と返す

### ロールによる権限差

今回はつけない。招待機能がないため `MEMBER` が増える経路がなく、区別しても検証できない。
`requireOrganization()` は `role` を返す形にしておき、後から絞り込めるようにする。

## 認可

### `requireOrganization()`

`src/shared/middleware/require-organization.ts` を新設する。
`requireSession()` と同格の**セキュリティ境界**として扱う。

```ts
export const requireOrganization = async (slug: string) => {
  const session = await requireSession();
  const membership = await prisma.organizationUser.findFirst({
    where: { organization: { slug }, userId: session.user.id },
    include: { organization: true },
  });
  if (!membership) notFound();
  return { session, organization: membership.organization, role: membership.role };
};
```

- 非所属は 403 ではなく **404**。組織の存在自体を漏らさない
- **保護対象の Server Component と Server Action の両方の冒頭で呼ぶ。**
  ページで確認済みでも Server Action は独立した入口であり、素通しはできない

### 横断アクセスの防止

大会は「id で引いてから所属を検証する」のではなく、所属条件をクエリの `where` に埋める。

```ts
prisma.tournament.findFirst({ where: { id, organizationId } })
```

検証を書き忘れた箇所が「見つからない」に倒れるため、フェイルクローズになる。

## ディレクトリ構成

`docs/code-design/architecture.md` の垂直スライス構成に従う。

```
src/
├── app/
│   ├── page.tsx                                       組織一覧
│   ├── mock/page.tsx                                  Mock（移設）
│   └── orgs/
│       ├── new/page.tsx
│       └── [slug]/
│           ├── page.tsx                               組織の閲覧 + 大会一覧
│           ├── edit/page.tsx
│           └── tournaments/
│               ├── new/page.tsx
│               └── [tournamentId]/
│                   ├── page.tsx
│                   └── edit/page.tsx
├── components/
│   ├── organization/                                  組織のフォーム・一覧・削除確認
│   └── tournament/                                    大会のフォーム・一覧・削除確認（既存 MatchCard 等と同居）
├── features/
│   ├── organization/
│   │   ├── domain.ts                                  slug の検証（純粋関数）
│   │   ├── errors.ts                                  SlugTaken / UnexpectedOrganizationError
│   │   ├── messages.ts                                エラー → 日本語（Match.exhaustive）
│   │   ├── repository.ts                              所属組織の一覧・slug 引き
│   │   └── create/ update/ delete/                    schema.ts / handler.ts / usecase.ts / repository.ts
│   ├── tournament/                                    新規（大会 CRUD）
│   │   ├── errors.ts / messages.ts / repository.ts
│   │   └── create/ update/ delete/
│   └── bracket/                                       旧 features/tournament（描画ロジック、中身は無変更）
└── shared/middleware/require-organization.ts
```

### `features/tournament` → `features/bracket` のリネーム

既存の `src/features/tournament/` の中身はブラケット描画の純粋ロジック
（`layout-bracket` / `resolve-bracket` / `to-flow-elements` / `types` / `mock`）であり、
大会エンティティの CRUD ではない。ここに大会 CRUD を足すと描画と永続化が同居して肥大する。

`features/bracket` へリネームし、空いた `features/tournament` を大会 CRUD に使う。
`Bracket` は既存コードと既存 spec に出てくる語であり、対応がむしろ正確になる。
変更は import パスと `biome.json` の該当 override のみで、ロジックには触れない。

### `src/lib/division/` は動かさない

`architecture.md` に存在しないディレクトリだが、今回のスコープからは参照しないため触らない。
エントリー登録を実装するとき、使う側の設計と一緒に片付ける。

### 境界 lint

`biome.json` のスライスごとの `noRestrictedImports` override は手書き方式のため、
新設した `features/organization` とその配下スライス、`features/tournament` とその配下スライス、
リネーム後の `features/bracket` の分を追加する。規則は既存と同じ。

- `features` は `components` / `app` に依存できない
- `shared` は `features` / `components` に依存できない
- 同列スライスへの依存を禁止し、祖先方向のみ許可する

## データフロー

フォームは **Server Actions + `useActionState`** で実装する。既存の認証画面が
`authClient` の直呼びなのは Better Auth の都合であり、DB 書き込みには当てはまらない。

組織作成の流れ:

1. `components/organization/OrganizationForm.tsx`（Client Component）が `formAction` を呼ぶ
2. `features/organization/create/handler.ts`（`"use server"`）
   - `requireSession()`
   - Zod スキーマで `safeParse`。失敗ならメッセージを `{ error }` で返す
   - `Effect.runPromiseExit` で usecase を実行
   - 成功: `revalidatePath("/")` してから作成した組織のページへ `redirect` する
   - 失敗: `messages.ts` で日本語化して `{ error }` を返す
3. `features/organization/create/usecase.ts`
   - Effect。repository をポート型で受け取り、テストで差し替え可能にする
     （既存 `features/auth/login/usecase.ts` の `SignInPort` と同じ形）
4. `features/organization/create/repository.ts` — Prisma

大会の作成・編集・削除も同じ形。handler の冒頭が `requireSession()` ではなく
`requireOrganization(slug)` になる点だけが異なる。

`features/tournament` に `domain.ts` は置かない。大会には `slug` のような
純粋なビジネスルールがなく、入力の妥当性は `schema.ts` の Zod で尽きるため、
委譲するだけの空ファイルになる（`features/auth` と同じ理由）。

### 成功後の再検証と遷移

| 操作 | `revalidatePath` | `redirect` |
| --- | --- | --- |
| 組織の作成 | `/` | `/orgs/[slug]` |
| 組織の編集 | `/`, `/orgs/[slug]` | `/orgs/[slug]` |
| 組織の削除 | `/` | `/` |
| 大会の作成 | `/orgs/[slug]` | `/orgs/[slug]/tournaments/[id]` |
| 大会の編集 | `/orgs/[slug]`, `/orgs/[slug]/tournaments/[id]` | `/orgs/[slug]/tournaments/[id]` |
| 大会の削除 | `/orgs/[slug]` | `/orgs/[slug]` |

### 組織作成の原子性

`Organization` と `OrganizationUser(OWNER)` は必ず同時に作る。

```ts
prisma.organization.create({
  data: { name, slug, users: { create: { userId, role: "OWNER" } } },
});
```

nested write により 1 クエリで原子的に作られ、片方だけ作られて
「誰にも見えない組織」が残る経路が存在しなくなる。

## エラー処理

### Prisma の型を漏らさない

slug の重複は repository 層で `PrismaClientKnownRequestError` の `code === "P2002"` を
捕まえ、`SlugTaken` に写像する。usecase より上に Prisma の型は出さない。

### 「見つからない」は Effect のエラーにしない

存在しない組織・大会は Next.js の `notFound()` で扱う。ドメインエラーとは制御フローの
性質が違うものを 1 つのエラー型に混ぜない。

### エラー型と文言

`features/auth/messages.ts` の方式を踏襲する。`Match.exhaustive` を使い、
**エラータグを足して文言を書き忘れるとコンパイルエラーになる**状態を保つ。

| 機能 | エラー型 |
| --- | --- |
| `features/organization` | `SlugTaken`, `UnexpectedOrganizationError` |
| `features/tournament` | `UnexpectedTournamentError` |

大会には unique 制約による衝突がないため、固有のドメインエラーを持たない。

### 削除の確認

組織名 / 大会名の入力を求める確認を挟む。組織の削除は `onDelete: Cascade` により
大会・メンバー・部門まで消えるため、押し間違いが効く操作ではない。

削除の handler は `requireOrganization(slug)` → `delete` → `revalidatePath` → `redirect`。
組織削除後は `/` へ、大会削除後は `/orgs/[slug]` へ送る。

## テスト

既存の粒度に合わせる。

| 対象 | 方法 |
| --- | --- |
| `features/*/domain.ts`（slug 検証） | vitest ユニットテスト |
| `features/*/messages.ts` | 全エラータグを網羅するユニットテスト |
| `features/*/*/usecase.ts` | repository ポートをモックして実行 |
| `features/*/*/schema.ts` | Zod の境界値テスト |
| `components/**` | Testing Library（`LoginForm.test.tsx` に倣う） |
| `shared/middleware/require-organization.ts` | `require-session.test.ts` に倣う |

実 DB を叩く repository のテストは、既存に前例がないため今回も書かない。

## 影響を受ける既存ファイル

| ファイル | 変更 |
| --- | --- |
| `src/app/page.tsx` | Mock 表示を `src/app/mock/page.tsx` へ移し、組織一覧に置き換える |
| `src/features/tournament/**` | `src/features/bracket/**` へリネーム（中身は無変更） |
| `src/components/tournament/TournamentFlow.tsx` 他 | import パスを `@/features/bracket/*` へ更新 |
| `biome.json` | 新設スライスとリネームに合わせて override を更新 |
| `docs/code-design/architecture.md` | `features/bracket` の位置づけを追記 |

`src/proxy.ts` の matcher は変更不要。`/mock` を含む全ページが引き続き未ログイン時に
`/login` へ送られる。

## 次にやること（本スペックの対象外）

1. `Division`（部門）のメタ情報 CRUD。あわせて `Division` の
   `@@unique([tournamentId, order])` を解除し、並び替えを単純な UPDATE 2 行にする
   （`docs/superpowers/specs/2026-08-27-division-model-design.md` の該当記述も更新する）
2. `Member` / `Participant` の登録と、部門へのエントリー登録
3. 組み合わせ抽選（`matchingConfig` の生成）
4. 勝敗入力（`results` の更新、`revision` による楽観ロック）
5. 部門の閲覧画面を Mock から実データのブラケット描画に差し替える
