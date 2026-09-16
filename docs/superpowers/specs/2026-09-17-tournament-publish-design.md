# 大会の公開/非公開 設計

## 背景

大会の公開可否は `Tournament.status` で決まる（`src/features/tournament/status.ts` の `TOURNAMENT_STATUS_IS_PUBLIC`）。
DRAFT は非公開、IN_PROGRESS / COMPLETED は公開。公開ゲートは `findPublicTournament` の `where` 句。
しかし status を変更する手段がアプリに存在せず、大会は常に DRAFT のままで参加者に公開できない。

## ゴール

- 大会詳細ページに「公開する」ボタンを置き、確認モーダルを経て公開できる。公開後はボタンを表示しない。
- 大会編集ページに「非公開にする」ボタンを置き、公開中の大会を非公開に戻せる。

## データ・ドメイン

新しいカラムは追加しない（マイグレーション不要）。

| 操作 | 許可される遷移前 status | 遷移後 status |
| --- | --- | --- |
| 公開 | DRAFT | IN_PROGRESS |
| 非公開 | IN_PROGRESS, COMPLETED | DRAFT |

- 遷移は `prisma.tournament.updateMany` の `where` に `id`・`organizationId`・遷移前 status 条件を含めて実行する。
  二重クリックや古い画面からの操作では更新件数 0 となり、エラーを返す。
- 更新件数 0 のとき、大会が組織内に存在しなければ `notFound()`、存在するが status が条件外なら
  エラーメッセージ（公開:「この大会はすでに公開されています」／非公開:「この大会はすでに非公開です」）を返す。

## サーバー側

既存のスライス構成に従い、以下を追加する。兄弟スライス間の import は禁止、共有物は `src/features/tournament/` 直下へ。

- `src/features/tournament/publish/` — `handler.ts`, `usecase.ts`, `repository.ts`, `schema.ts`（＋テスト）
- `src/features/tournament/unpublish/` — 同上

handler の流れ:

1. `formData` から `slug`, `tournamentId` を取得。
2. `requirePermission(slug, "tournament.edit")`（権限なしは `notFound()`。`architecture.md` の認可モデルに従う）。
3. zod で `tournamentId` を検証。
4. usecase を `Effect.runPromiseExit` で実行。失敗時は `tournamentErrorFormState` でエラー状態を返す。
5. 成功時は `revalidatePath` で `/orgs/${slug}`、`/orgs/${slug}/tournaments/${tournamentId}`、`/t/${tournamentId}` を再検証。
   - 公開: `{ error: null }` を返し詳細ページに留まる。
   - 非公開: 詳細ページへ `redirect`。

戻り値の型は既存の `TournamentFormState` を使う。

## UI

### ConfirmDialog（新規・共有）

`src/components/ui/ConfirmDialog.tsx`（クライアントコンポーネント）。ネイティブ `<dialog>` を `showModal()` で開く。

- props: トリガーボタンのラベル、タイトル、本文、確定ボタンのラベル、フォームの `action`、hidden 値（`slug`, `tournamentId`）、pending/エラー表示用の state。
- ダイアログ内に「キャンセル」（`close()`）と確定ボタン（form submit）を置く。
- 送信中は確定ボタンを disabled。エラーは `role="alert"` で表示。

### 大会詳細ページ

`TournamentDetailView` に `PublishTournamentButton`（`useActionState` ＋ `ConfirmDialog`）を追加。

- status が DRAFT のときのみ表示。
- 文言: タイトル「大会を公開」、本文「「{大会名}」を公開しますか？公開すると参加者を含む誰でも公開ページを閲覧できるようになります。」、確定「公開する」。
- 公開後は revalidate により status が IN_PROGRESS となりボタンは非表示になる。

### 大会編集ページ

削除フォームの上に `UnpublishTournamentForm` を追加。

- status が DRAFT 以外のときのみ表示。
- 同じく `ConfirmDialog` で確認。文言: タイトル「大会を非公開にする」、本文「「{大会名}」を非公開にしますか？参加者は公開ページを閲覧できなくなります。」、確定「非公開にする」。

## テスト

- usecase: 成功 / 更新 0 件（存在しない → NotFound 相当、status 条件外 → エラー）。
- handler: 権限なしで `notFound`、成功時の revalidate / redirect、エラー状態の返却。
- repository: `where` に organizationId と status 条件が含まれること。
- コンポーネント: DRAFT のときだけ公開ボタン表示、非 DRAFT のときだけ非公開フォーム表示、モーダルを開く・キャンセルで閉じる。

## スコープ外

- 進行中 → 完了 などの status 遷移 UI。
- 公開日時の記録。
