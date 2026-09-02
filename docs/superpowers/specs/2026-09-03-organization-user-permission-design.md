# Organization ユーザー管理 + Permission 化 設計

作成日: 2026-09-03

## 目的

組織（Organization）に所属するユーザー（User）を画面から管理できるようにする。

* ユーザーの一覧・追加・削除を行う「ユーザー管理画面」を新設する
* 認可の仕組みを既存の `OrganizationUser.role`（OWNER/ADMIN/MEMBER の enum）から
  **Permission テーブル方式**へ置き換える。role は完全撤廃する

Permission は将来の拡張（大会操作の権限制御など）を見据えたテーブル設計とするが、
今回**権限チェックを適用するのはユーザー管理画面のみ**とする（YAGNI）。

## データモデル（Prisma）

### User への追加

```prisma
model User {
  username String @unique   // 追加。サインアップ時に必須入力
}
```

* ユーザー追加時の検索キーとして使う。`name` はユニークでないため検索キーにできない
* サインアップフォームに username 必須入力を追加する（重複時はエラー表示）
* Better Auth には additionalFields として登録する

### OrganizationUser の変更

`role` 列と `OrganizationRole` enum を**削除**し、権限割当リレーションを追加する。

```prisma
model OrganizationUser {
  organizationId String
  userId         String
  joinedAt       DateTime @default(now())

  organization Organization                 @relation(...)
  user         User                         @relation(...)
  permissions  OrganizationUserPermission[]

  @@id([organizationId, userId])
  @@index([userId])
}
```

### Permission（新設・マスタ）

```prisma
/// 権限マスタ。migration の SQL でデータを挿入する。
model Permission {
  id          Int      @id @default(autoincrement())
  code        String   @unique   // "user.add" 形式
  description String
  createdAt   DateTime @default(now())

  grants OrganizationUserPermission[]
}
```

### OrganizationUserPermission（新設・割当）

```prisma
/// 組織ユーザーへの権限割当。
model OrganizationUserPermission {
  organizationId String
  userId         String
  permissionId   Int
  grantedAt      DateTime @default(now())

  organizationUser OrganizationUser @relation(fields: [organizationId, userId], references: [organizationId, userId], onDelete: Cascade)
  permission       Permission       @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@id([organizationId, userId, permissionId])
  @@index([permissionId])
}
```

## シードする Permission

migration 内の INSERT で以下を投入する。

| code | description |
| --- | --- |
| `user.view` | 組織ユーザーの閲覧 |
| `user.add` | 組織ユーザーの追加 |
| `user.remove` | 組織ユーザーの削除 |
| `user.grant` | 組織ユーザーへの権限付与・剥奪 |
| `tournament.create` | 大会の作成 |
| `tournament.edit` | 大会の編集 |
| `tournament.delete` | 大会の削除 |
| `org.edit` | 組織の編集 |
| `org.delete` | 組織の削除 |

`tournament.*` / `org.*` は将来の拡張用にシードのみ行い、今回は既存画面への
チェック適用はしない（既存画面は従来どおり「所属していれば操作可」のまま）。

## migration（既存データの移行）

本番データはなく開発用 DB のみのため、簡易な移行でよい。

1. `User.username` を追加。既存行は email のローカル部（@ より前）で埋める。
   衝突時は連番を付ける（開発 DB 前提の割り切り）
2. `Permission` / `OrganizationUserPermission` テーブルを作成し、Permission をシード
3. 既存の `OrganizationUser` 全員に**全 Permission を付与**
4. `role` 列と `OrganizationRole` enum を削除

新規に組織を作成したユーザー（旧 OWNER 相当）にも全 Permission を付与する
（`features/organization/create` の repository を修正）。

## 認可の仕組み

`src/shared/middleware/require-organization.ts` を変更する。

* 戻り値の `role` を廃止し、`permissions: string[]`（code の配列）を返す
* `requirePermission(slug, code)` ヘルパーを追加する。
  `requireOrganization` を呼んだうえで、指定 code を持たなければ `notFound()`
  （権限の有無で存在を漏らさない方針は従来と同じ）
* 従来どおり、ページ冒頭と Server Action 冒頭の**両方**で独立に呼ぶ

## 画面構成

| パス | 内容 |
| --- | --- |
| `/orgs/[slug]/users` | ユーザー一覧 + 追加フォーム。`user.view` 必須 |
| `/orgs/[slug]/users/[userId]/permissions` | 権限編集。`user.grant` 必須 |

`/orgs/[slug]`（組織詳細）にユーザー管理画面へのリンクを追加する
（`user.view` を持つ場合のみ表示）。

### 一覧画面（/orgs/[slug]/users）

* 各ユーザーのアイコン（`User.image`、無ければイニシャル等の代替表示）・
  表示名（`User.name`）・username・email・保有権限のサマリを表示
* `user.remove` 保持者には削除ボタンを表示。確認ダイアログを挟んで削除する。
  **自分自身は削除できない**（ボタン非表示 + Server Action でも拒否）
* `user.add` 保持者には追加フォームを表示

### 追加フロー（一覧画面内）

1. username または email を入力して検索（**完全一致**。どちらも一意なので候補は最大 1 件）
2. ヒットしたユーザーのアイコン + 表示名 + username を確認表示する
3. 「追加」ボタンで**即時追加**する（招待・承諾フローは無い）
4. 追加されたユーザーには**全 Permission を付与**する

エラーケース: 該当ユーザーなし / すでに組織に所属済み。

### 権限編集画面（/orgs/[slug]/users/[userId]/permissions）

* Permission 全件をチェックボックスで表示し、対象ユーザーの保有状態を編集して保存
* **自分自身の `user.grant` は外せない**（チェックボックス無効化 + Server Action でも拒否）。
  組織から `user.grant` 保持者がいなくなるロックアウトを防ぐ
* 対象ユーザーが組織に所属していなければ `notFound()`

## ディレクトリ構成

既存パターン（垂直スライス + schema/handler/usecase/repository）を踏襲する。

```
src/features/organization-user/
├── errors.ts                  共通エラー型
├── messages.ts                エラー → 日本語文言
├── repository.ts              一覧取得・Permission 全件取得
├── search/{schema,handler,usecase,repository}.ts   追加前のユーザー検索
├── add/{schema,handler,usecase,repository}.ts
├── remove/{schema,handler,usecase,repository}.ts
└── grant/{schema,handler,usecase,repository}.ts    権限の付与・剥奪（一括保存）

src/components/organization-user/
├── OrganizationUserList.tsx   一覧
├── AddUserForm.tsx            検索 → 確認 → 追加
├── RemoveUserForm.tsx         削除確認
└── PermissionEditForm.tsx     権限チェックボックス
```

`features/organization-user` は `features/organization` に依存しない（同列スライス依存の禁止）。

## テナント分離

`architecture.md` の 2 原則をそのまま適用する。

* Server Action 冒頭でも `requirePermission` を独立に呼ぶ
* 所有権チェックは `where` に入れる（`deleteMany` / `updateMany` を使い、0 件は `notFound()`）

## テスト

既存の Vitest パターン（usecase / repository / page テスト）に従う。特に以下をカバーする。

* 検索: username 一致 / email 一致 / ヒットなし
* 追加: 正常系（全権限付与を含む）/ 所属済みの重複追加
* 削除: 正常系 / 自分自身の削除拒否
* 権限編集: 正常系 / 自分の `user.grant` 剥奪拒否
* `requirePermission`: 権限あり / なし（notFound）
* サインアップ: username 必須・重複エラー

## スコープ外

* 既存の大会・部門・組織 CRUD への `tournament.*` / `org.*` チェック適用（シードのみ）
* 招待フロー（メール招待・承諾）
* username のユーザー自身による変更画面
