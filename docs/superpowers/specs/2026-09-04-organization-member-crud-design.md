# Organization メンバー管理 設計

作成日: 2026-09-04

## 目的

組織（Organization）に所属するメンバー（Member）を画面から管理できるようにする。

* メンバーの一覧・追加・削除を行う「メンバー管理画面」を新設する
* Member はログインアカウントを持つとは限らない「組織に所属する人」であり、
  User（管理側アカウント）とは別物。現状は部門エントリー画面からしか作成できず、
  一覧・削除の手段が無い

## 権限

`user.*` と同じパターンで `member.*` 権限コードを新設する。

### PERMISSION_CODES への追加（shared/authz/ability.ts）

| code | description |
| --- | --- |
| `member.view` | 組織メンバーの閲覧 |
| `member.add` | 組織メンバーの追加 |
| `member.remove` | 組織メンバーの削除 |

### migration

新規 migration で Permission マスタに上記 3 行を INSERT する。あわせて、
**既存の所属ユーザー（OrganizationUser）全員に新権限 3 つを付与**する。
新機能の追加で誰もアクセスできない状態を防ぐため（role 撤廃時の移行と同じ方針）。

組織の新規作成者は `features/organization/create` が全 Permission を付与する
実装のため、変更不要（Permission マスタ全件を引いて付与していることを実装時に確認する）。

## 画面構成

| パス | 内容 |
| --- | --- |
| `/orgs/[slug]/members` | メンバー一覧 + 追加フォーム。`member.view` 必須 |

`/orgs/[slug]`（組織詳細）にメンバー管理画面へのリンクを追加する
（`member.view` を持つ場合のみ表示。「ユーザー管理」リンクの並び）。

### 一覧画面（/orgs/[slug]/members）

* 各メンバーの氏名（`name`）・かな（`nameKana`）を表示。並び順は `nameKana` 昇順
* 0 件なら「この組織に登録されているメンバーはいません」を表示
* `member.add` 保持者には追加フォームを表示
* `member.remove` 保持者には各行に削除ボタンを表示

UI の出し分けは体感のためで、拒否の境界は各 Server Action 冒頭の
`requirePermission` にある（既存方針どおり）。

### 追加フォーム

* 氏名（必須）とかな（必須）の 2 入力。部門エントリーの新規メンバー入力と同じ項目
* 追加成功でフォームをクリアし、一覧に反映（revalidatePath）
* 同姓同名の重複チェックはしない（Member に一意制約が無く、実在の同姓同名を排除できないため）

### 削除ボタン

* `window.confirm` による確認ダイアログを挟む（OrganizationUserList の
  RemoveUserButton と同じ実装パターン。キャンセル時は submit 自体を起こさない）
* `Participant → Member` が `onDelete: Restrict` のため、大会への参加記録がある
  メンバーは削除できない。Server Action 側でトランザクション内で参加記録の有無を
  確認し、あれば「大会への参加記録があるため削除できません」を行内にエラー表示する
* 所有権チェックは `where` に `organizationId` を入れた `deleteMany` で行い、
  0 件（他組織の ID や存在しない ID）はメンバー不在エラーとする

## ディレクトリ構成

既存パターン（垂直スライス + schema/handler/usecase/repository）を踏襲する。

```
src/features/member/
├── errors.ts                  共通エラー型（Data.TaggedError）
├── messages.ts                エラー → 日本語文言
├── state.ts                   フォーム state 型と初期値
├── effect-to-form-state.ts    Effect → FormState 変換
├── repository.ts              一覧取得 listMembersInOrganization
├── add/{schema,handler,usecase,repository}.ts
└── remove/{schema,handler,usecase,repository}.ts

src/components/member/
├── MemberList.tsx             一覧 + 行ごとの削除フォーム
└── AddMemberForm.tsx          氏名 + かな入力
```

`features/member` は他の同列スライス（`features/division` など）に依存しない。
部門エントリー側の Member 作成処理（`features/division/add-entry`）は変更しない。

## テナント分離

`architecture.md` の 2 原則をそのまま適用する。

* ページ冒頭と Server Action 冒頭の両方で独立に `requirePermission` を呼ぶ
* 所有権チェックは `where` に入れる（`deleteMany` で 0 件は不在エラー）

## テスト

既存の Vitest パターン（schema / usecase / repository / handler / component / page）に従う。

* 追加: 正常系 / 氏名・かな未入力のバリデーション
* 削除: 正常系 / 参加記録ありの削除拒否 / 他組織・不存在 ID の拒否
* 一覧: nameKana 昇順 / 0 件表示
* ページ: `member.view` なしで notFound / 権限による追加フォーム・削除ボタンの出し分け

## スコープ外

* メンバーの編集（氏名・かなの変更）画面
* メンバーと User の紐付け
* 部門エントリー画面からのメンバー作成フローの変更
