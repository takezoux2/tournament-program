"use client";

import { useId, useRef } from "react";

/**
 * 確認付きで Server Action を送るためのモーダル。状態（useActionState）は
 * 呼び出し側が持ち、ここは開閉と表示だけを担う。
 */
export function ConfirmDialog({
  triggerLabel,
  title,
  message,
  confirmLabel,
  pendingLabel,
  formAction,
  pending,
  error,
  hiddenFields,
  triggerClassName = "rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 cursor-pointer",
}: {
  triggerLabel: string;
  title: string;
  message: string;
  confirmLabel: string;
  pendingLabel: string;
  formAction: (formData: FormData) => void;
  pending: boolean;
  error: string | null;
  hiddenFields: Record<string, string>;
  triggerClassName?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={triggerClassName}
      >
        {triggerLabel}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto w-full max-w-sm rounded border border-slate-200 bg-white p-0 backdrop:bg-slate-900/40"
      >
        <form action={formAction} className="space-y-4 p-5">
          <h2 id={titleId} className="text-base font-bold text-slate-800">
            {title}
          </h2>
          <p className="text-sm text-slate-700">{message}</p>

          {Object.entries(hiddenFields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}

          {error !== null && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {pending ? pendingLabel : confirmLabel}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
