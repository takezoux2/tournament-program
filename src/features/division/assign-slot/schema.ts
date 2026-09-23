import { z } from "zod";
import { existingMemberSchema, newMemberSchema } from "../add-entry/schema";
import type { SlotTarget } from "../first-round-schema";

/** 他部門の試合の勝者・敗者を置く枝。 */
const matchResultSchema = z.object({
  mode: z.literal("matchResult"),
  sourceDivisionId: z.string().min(1, "参照する部門を選択してください"),
  sourceMatchId: z.string().min(1, "参照する試合を選択してください"),
  outcome: z.enum(["winner", "loser"], {
    error: "勝者か敗者を選択してください",
  }),
});

/** 他部門（リーグ）の N 位を置く枝。 */
const leagueRankSchema = z.object({
  mode: z.literal("leagueRank"),
  sourceDivisionId: z.string().min(1, "参照する部門を選択してください"),
  rank: z.coerce
    .number({ error: "順位は数字で入力してください" })
    .int("順位は整数で入力してください")
    .min(1, "順位は 1 以上で入力してください"),
});

/**
 * どのスロットに何を置くか。誰の部分は add-entry と同じ 2 枝を使い回し、
 * 他部門の結果を参照する 2 枝をここで足す。handler が slotTargetSchema と
 * 別々に検証して組み合わせる。
 */
export const slotOccupantSchema = z.discriminatedUnion("mode", [
  existingMemberSchema,
  newMemberSchema,
  matchResultSchema,
  leagueRankSchema,
]);

export type SlotOccupantInput = z.infer<typeof slotOccupantSchema>;

export type AssignSlotInput = SlotTarget & { occupant: SlotOccupantInput };
