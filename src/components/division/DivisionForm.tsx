"use client";

import { useActionState } from "react";
import {
  DIVISION_FORMAT_LABELS,
  DIVISION_FORMATS,
} from "@/features/division/format";
import {
  type DivisionFormAction,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";
import type { DivisionFormat } from "@/generated/prisma/enums";
import type { DivisionResultConfig } from "@/lib/division/types";
import { MAX_SCORE_COUNT } from "@/lib/division/types";

export function DivisionForm({
  action,
  slug,
  tournamentId,
  submitLabel,
  defaultName = "",
  defaultFormat = "SINGLE_ELIMINATION",
  divisionId,
  defaultResultConfig,
}: {
  action: DivisionFormAction;
  slug: string;
  tournamentId: string;
  submitLabel: string;
  defaultName?: string;
  defaultFormat?: DivisionFormat;
  /** 編集時に渡す。どの部門を更新するかを handler へ伝える。 */
  divisionId?: string;
  /**
   * 編集時に渡す。渡されたときだけ「結果入力の設定」欄を描く。
   * 部門を作る時点で採点方式まで決める運用は考えにくいので、作成画面には出さない。
   */
  defaultResultConfig?: DivisionResultConfig;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_DIVISION_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="tournamentId" value={tournamentId} />
      {divisionId !== undefined && (
        <input type="hidden" name="divisionId" value={divisionId} />
      )}

      <div className="space-y-1">
        <label
          htmlFor="name"
          className="block text-sm font-medium text-slate-700"
        >
          部門名
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={defaultName}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label
          htmlFor="format"
          className="block text-sm font-medium text-slate-700"
        >
          試合形式
        </label>
        <select
          id="format"
          name="format"
          required
          defaultValue={defaultFormat}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        >
          {DIVISION_FORMATS.map((format) => (
            <option key={format} value={format}>
              {DIVISION_FORMAT_LABELS[format]}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500">
          ブラケット表示に対応しているのはシングルエリミネーションのみ
        </p>
      </div>

      {defaultResultConfig !== undefined && (
        <fieldset className="space-y-3 rounded border border-slate-200 px-3 py-3">
          <legend className="px-1 text-sm font-medium text-slate-700">
            結果入力の設定
          </legend>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="winReasonEnabled"
                defaultChecked={defaultResultConfig.winReason.enabled}
              />
              勝因を記録する
            </label>
            <label
              htmlFor="winReasonOptions"
              className="block text-xs text-slate-500"
            >
              勝因の選択肢（1行1項目）
            </label>
            <textarea
              id="winReasonOptions"
              name="winReasonOptions"
              rows={4}
              defaultValue={defaultResultConfig.winReason.options.join("\n")}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="scoreEnabled"
                defaultChecked={defaultResultConfig.score.enabled}
              />
              スコアを記録する
            </label>
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-2">
                <label htmlFor="scoreCount" className="text-xs text-slate-500">
                  スコア欄の数
                </label>
                <select
                  id="scoreCount"
                  name="scoreCount"
                  defaultValue={String(defaultResultConfig.score.count)}
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                >
                  {Array.from({ length: MAX_SCORE_COUNT }, (_, i) => i + 1).map(
                    (count) => (
                      <option key={count} value={count}>
                        {count}
                      </option>
                    ),
                  )}
                </select>
              </span>
              <span className="flex items-center gap-3 text-sm text-slate-700">
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="scoreAggregation"
                    value="sum"
                    defaultChecked={
                      defaultResultConfig.score.aggregation === "sum"
                    }
                  />
                  合計
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="scoreAggregation"
                    value="average"
                    defaultChecked={
                      defaultResultConfig.score.aggregation === "average"
                    }
                  />
                  平均
                </label>
              </span>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="noteEnabled"
              defaultChecked={defaultResultConfig.note.enabled}
            />
            メモを記録する
          </label>

          <p className="text-xs text-slate-500">
            チェックを外しても記録済みの内容は消えません。画面に出なくなるだけで、
            もう一度チェックを入れれば元どおり見えます。
          </p>
        </fieldset>
      )}

      {state.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "送信中..." : submitLabel}
      </button>
    </form>
  );
}
