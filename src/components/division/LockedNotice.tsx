/**
 * 勝敗が記録された部門で、エントリー・組み合わせが変更できない理由を伝える帯。
 * BracketEditorSetup が「locked のとき」に出す案内をここに切り出してある。
 */
export const LockedNotice = () => (
  <output className="block rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
    勝敗が記録されているため、エントリーと組み合わせは変更できません
  </output>
);
