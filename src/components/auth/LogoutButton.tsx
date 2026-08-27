"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/shared/lib/auth-client";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const onClick = async () => {
    setPending(true);
    await authClient.signOut();
    setPending(false);
    router.push("/login");
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-700 disabled:opacity-50"
    >
      {pending ? "ログアウト中..." : "ログアウト"}
    </button>
  );
}
