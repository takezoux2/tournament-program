/**
 * 準備中（DRAFT）の大会を組織メンバーがプレビューしていることを示す帯。
 * 公開済みの画面と見分けが付かないと、まだ公開されていない URL を
 * そのまま参加者へ渡す事故が起きるため、公開ページ側に出す。
 *
 * 出すかどうかは PublicTournament.isPreview で決まる。ここを書き忘れても
 * 表示が出ないだけで、公開範囲そのものは findPublicTournament が持つ。
 */
export function PublicPreviewNotice() {
  return (
    <div
      role="status"
      className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      この大会は準備中です。この画面は組織のメンバーにしか表示されません。
    </div>
  );
}
