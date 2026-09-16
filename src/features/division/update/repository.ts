import "server-only";
import { Effect } from "effect";
import type { Prisma } from "@/generated/prisma/client";
import type { DivisionFormat } from "@/generated/prisma/enums";
import type { DivisionResultConfig } from "@/lib/division/types";
import { prisma } from "@/shared/db/prisma";
import { type DivisionError, toDivisionError } from "../errors";

export type UpdateDivisionPort = (input: {
  organizationId: string;
  tournamentId: string;
  divisionId: string;
  name: string;
  format: DivisionFormat;
  resultConfig: DivisionResultConfig;
}) => Effect.Effect<{ updated: number }, DivisionError>;

/** Prisma の Json 入力は構造的な型をそのままでは受け付けないため、書く直前に変換する。 */
const toJsonInput = (config: DivisionResultConfig): Prisma.InputJsonValue =>
  config as unknown as Prisma.InputJsonValue;

export const updateDivisionInDb: UpdateDivisionPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      // updateMany を使うのは where に所有条件を残したまま更新するため。
      // update は unique な where しか受け付けず、id 単独になってしまう。
      const result = await prisma.division.updateMany({
        where: {
          id: input.divisionId,
          tournament: {
            id: input.tournamentId,
            organizationId: input.organizationId,
          },
        },
        // order はここでは触らない。並べ替えは reorder スライスが担当する。
        // results にも触らない。設定は表示と入力のフィルタでしかなく、
        // 設定を変えても記録済みの内容は消さない。
        data: {
          name: input.name,
          format: input.format,
          resultConfig: toJsonInput(input.resultConfig),
        },
      });
      return { updated: result.count };
    },
    catch: (reason) => toDivisionError(reason, input.tournamentId),
  });
