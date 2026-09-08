"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogoutButton } from "@/components/auth/LogoutButton";

const PANEL_ID = "user-menu-panel";

/**
 * ヘッダーのユーザー名から開くメニュー。
 *
 * このコンポーネントは開閉の状態しか持たない。useRouter も authClient も
 * 触らないのは、ログアウトの処理を LogoutButton に残しておくため。
 * 16 個のページテストが @/components/auth/LogoutButton を vi.mock して
 * おり、処理をこちらへ移すとその全部を書き換えることになる。
 *
 * role="menu" は使わない。あれは矢印キーでの項目移動を伴う規約で、
 * それを実装せずに役割名だけ名乗ると、支援技術には「メニュー」と伝わるのに
 * 操作方法が伴わない。開閉を aria-expanded で伝えるだけの
 * disclosure として作り、中身はリンクの並びとして素直に見せる。
 */
export function UserMenu({
  userName,
  userEmail,
}: {
  userName: string;
  userEmail: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        // 閉じた先でフォーカスが宙に浮かないよう、トリガーへ戻す。
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={PANEL_ID}
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-1 rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-100"
      >
        {userName}
        <span aria-hidden="true" className="text-xs text-slate-400">
          ▾
        </span>
      </button>

      {/* 閉じているときは描画しない。hidden で隠すだけだと、
          リンクがフォーカス順に残ってタブ移動で踏めてしまう。 */}
      {open && (
        <div
          id={PANEL_ID}
          className="absolute right-0 z-10 mt-1 w-56 rounded border border-slate-200 bg-white py-1 shadow"
        >
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="truncate text-sm font-medium text-slate-800">
              {userName}
            </p>
            <p className="truncate text-xs text-slate-500">{userEmail}</p>
          </div>

          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            プロフィール
          </Link>
          <Link
            href="/profile/orgs"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            所属組織
          </Link>

          {/* 区切りの下に単独で置く。移動のつもりで押し間違えたときの
              損失が他の項目より大きいため。 */}
          <div className="border-t border-slate-100 px-3 py-2">
            <LogoutButton />
          </div>
        </div>
      )}
    </div>
  );
}
