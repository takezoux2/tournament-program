# 大会概要(Markdown対応)設計

日付: 2026-09-04

## 目的

大会に「概要」を設定できるようにする。概要は Markdown で記述でき、
大会詳細ページで整形表示される。編集フォームにはプレビュー機能を付ける。

## スコープ

- Tournament への `description` カラム追加(新規作成・編集の両方で入力可能)
- Markdown レンダリング(react-markdown + remark-gfm)
- 編集フォームの「編集 / プレビュー」タブ切替
- 大会詳細ページでの概要表示

スコープ外: 画像アップロード、Division など他モデルへの概要追加、
概要の変更履歴。

## データモデル

`Tournament` に以下を追加する。

```prisma
/// 大会の概要。Markdown 形式。空文字は未設定を意味する。
description String @default("")
```

- nullable にせず空文字デフォルトとする。既存レコードは「未設定」として
  そのまま動く。マイグレーションを 1 本追加する。

## バリデーション

`src/features/tournament/schema-parts.ts` に追加:

- `tournamentDescriptionSchema`: trim し、最大 10,000 文字。空文字を許容する。
- create / update 両スライスの schema に `description` を追加し、
  usecase → repository へそのまま通す。

## Markdown レンダリング

- 依存追加: `react-markdown`, `remark-gfm`(pnpm)。
- 共有コンポーネント `TournamentDescriptionMarkdown`
  (`src/components/tournament/TournamentDescriptionMarkdown.tsx`)を新設。
  - `react-markdown` + `remark-gfm` で GFM(表・打ち消し線・自動リンク等)対応。
  - 見出し・リスト・コードブロック等に Tailwind クラスで最低限の
    タイポグラフィを当てる。
  - 生 HTML は react-markdown のデフォルト通り無効(XSS 安全)。

## UI

### TournamentForm(新規作成・編集で共用)

- 「大会概要」の textarea を追加(`name="description"`、`defaultDescription` prop)。
- 「編集 / プレビュー」のタブ切替をクライアント state で実装。
  プレビュー側は `TournamentDescriptionMarkdown` で現在の入力値を表示。
  概要が空のときのプレビューは「(概要は未入力)」等のプレースホルダを出す。

### TournamentDetailView

- 概要が空文字でなければ、詳細の dl の下に概要セクションを追加し
  `TournamentDescriptionMarkdown` で表示する。空なら何も出さない。

## エラーハンドリング

- 10,000 文字超過は schema でエラーメッセージ
  「大会概要は10000文字以内で入力してください」を返し、
  既存のフォームエラー表示(`state.error`)に乗せる。

## テスト

既存パターン(vitest + testing-library)に従う。

- schema-parts: description の trim / 上限 / 空許容
- create・update スライス: schema / usecase / repository に description が通ること
- TournamentDescriptionMarkdown: 見出し・GFM 表のレンダリング、
  生 HTML がエスケープされること
- TournamentForm: タブ切替でプレビューが表示されること、
  description が submit されること
- TournamentDetail: 概要あり/なしの表示分岐
