import { z } from "zod";
import type { DivisionResultConfig } from "@/lib/division/types";
import {
  MAX_SCORE_COUNT,
  MAX_WIN_REASON_LENGTH,
  MAX_WIN_REASON_OPTIONS,
} from "@/lib/division/types";
import { divisionFormatSchema, divisionNameSchema } from "../schema-parts";

/**
 * textarea の中身を選択肢の配列にする。1 行 1 項目。
 * 行追加ボタンの類を作らず textarea 1 つで済ませているのは、並べ替えも削除も
 * テキスト編集で完結し、クライアント側の状態を持たずに済むため。
 *
 * CRLF を先に潰すのは Windows のブラウザが \r\n で送ってくるため。
 * \r が残ると trim で消えるが、文字数の検証だけが先に走ると 1 文字ぶん
 * 多く数えてしまう。
 */
const winReasonOptionsSchema = z
  .string()
  .transform((raw) => {
    const seen = new Set<string>();
    const options: string[] = [];
    for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
      const label = line.trim();
      if (label === "" || seen.has(label)) {
        continue;
      }
      seen.add(label);
      options.push(label);
    }
    return options;
  })
  .pipe(
    z
      .array(
        z
          .string()
          .max(
            MAX_WIN_REASON_LENGTH,
            `勝因は${MAX_WIN_REASON_LENGTH}文字以内で入力してください`,
          ),
      )
      .max(
        MAX_WIN_REASON_OPTIONS,
        `勝因の選択肢は${MAX_WIN_REASON_OPTIONS}件までです`,
      ),
  );

const scoreCountMessage = `スコア欄の数は1以上${MAX_SCORE_COUNT}以下で指定してください`;

/**
 * 結果入力の設定。checkbox は「あるかどうか」しか送られないので、
 * handler 側で真偽値に直してから渡す。
 */
export const divisionResultConfigSchema = z
  .object({
    winReasonEnabled: z.boolean(),
    winReasonOptions: winReasonOptionsSchema,
    scoreEnabled: z.boolean(),
    scoreCount: z.coerce
      .number()
      .int(scoreCountMessage)
      .min(1, scoreCountMessage)
      .max(MAX_SCORE_COUNT, scoreCountMessage),
    scoreAggregation: z.enum(["sum", "average"], {
      error: "集計方法を選択してください",
    }),
    noteEnabled: z.boolean(),
  })
  .transform(
    (input): DivisionResultConfig => ({
      version: 1,
      winReason: {
        enabled: input.winReasonEnabled,
        options: input.winReasonOptions,
      },
      score: {
        enabled: input.scoreEnabled,
        count: input.scoreCount,
        aggregation: input.scoreAggregation,
      },
      note: { enabled: input.noteEnabled },
    }),
  );

/**
 * 入力の形は作成時と同じだが、create から import はしない（同列スライスへの
 * 依存は禁止）。共通の部品は features/division 直下の schema-parts.ts に置き、
 * 両スライスがそこを祖先方向に参照する。
 *
 * resultConfig は update だけが扱うので schema-parts.ts には上げない。
 * 部門の作成画面には結果入力の設定を出さない（作成時に採点方式まで決める
 * 運用は考えにくく、画面を短く保ちたい）。
 */
export const updateDivisionSchema = z.object({
  name: divisionNameSchema,
  format: divisionFormatSchema,
  resultConfig: divisionResultConfigSchema,
});

export type UpdateDivisionInput = z.infer<typeof updateDivisionSchema>;
