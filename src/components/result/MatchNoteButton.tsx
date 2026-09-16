"use client";

import { useId } from "react";

/**
 * メモを吹き出しで見せるボタン。運営の結果画面と公開ページの両方で使う。
 *
 * 開閉は HTML の popover 属性でブラウザに任せる。Esc と外側クリックで閉じる
 * 挙動が標準で付いてくるので、自前の外側クリック検出を書かずに済む。
 */
export function MatchNoteButton({
  note,
  label,
}: {
  note: string | null;
  /** 読み上げ用。「第3試合のメモ」のように試合が分かる文言を渡す */
  label: string;
}) {
  const id = useId();

  if (note === null || note === "") {
    return null;
  }

  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        aria-label={label}
        className="rounded px-1 text-xs text-slate-500 hover:bg-slate-100"
      >
        📝
      </button>
      <div
        id={id}
        popover="auto"
        className="max-w-xs rounded border border-slate-300 bg-white px-3 py-2 text-xs whitespace-pre-wrap text-slate-700 shadow-lg"
      >
        {note}
      </div>
    </>
  );
}
