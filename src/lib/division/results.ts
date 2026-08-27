import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { parseDivisionResults } from "./parse";
import type { DivisionResults, MatchResultRecord } from "./types";

/** 楽観ロックの競合。呼び出し元は再読み込みを促す。 */
export class DivisionConflictError extends Error {
  constructor(divisionId: string) {
    super(
      `Division ${divisionId} は他の人が更新しました。再読み込みしてください。`,
    );
    this.name = "DivisionConflictError";
  }
}

/**
 * 1 試合分の結果を反映した新しい results を返す。元の値は変更しない。
 * 同じ matchId が既にあれば位置を保ったまま上書きし、無ければ末尾に追加する。
 */
export const applyMatchResult = (
  results: DivisionResults,
  record: MatchResultRecord,
): DivisionResults => {
  const index = results.matches.findIndex(
    (existing) => existing.matchId === record.matchId,
  );
  const matches =
    index === -1
      ? [...results.matches, record]
      : results.matches.map((existing, i) => (i === index ? record : existing));
  return { version: 1, matches };
};

/** Prisma の Json 入力は構造的な型を受け付けないため、書き込み時にだけ変換する。 */
const toJsonInput = (results: DivisionResults): Prisma.InputJsonValue =>
  results as unknown as Prisma.InputJsonValue;

const isRecordNotFound = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code: unknown }).code === "P2025";

/**
 * 楽観ロック付きで 1 試合分の結果を書き込む。
 * 読み取りから書き込みの間に revision が変わっていたら DivisionConflictError を投げる。
 */
export const recordMatchResult = async (
  prisma: PrismaClient,
  divisionId: string,
  record: MatchResultRecord,
): Promise<DivisionResults> => {
  const division = await prisma.division.findUniqueOrThrow({
    where: { id: divisionId },
    select: { results: true, revision: true },
  });

  const next = applyMatchResult(parseDivisionResults(division.results), record);

  try {
    await prisma.division.update({
      where: { id: divisionId, revision: division.revision },
      data: { results: toJsonInput(next), revision: division.revision + 1 },
    });
  } catch (error) {
    if (isRecordNotFound(error)) {
      throw new DivisionConflictError(divisionId);
    }
    throw error;
  }

  return next;
};
