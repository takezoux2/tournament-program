import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { parseDivisionResults, parseMatchingConfig } from "./parse";
import type { DivisionResults, MatchResultRecord } from "./types";
import { type ValidationErrors, validateResults } from "./validate";

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
 * 整合性検証に失敗したことを表す。
 * errors は反映後の results 全体に対する検証結果なので、今回の入力ではなく
 * 既に保存されていたレコードを指している場合がある。UI の文言はそれを踏まえること。
 */
export class DivisionValidationError extends Error {
  readonly errors: ValidationErrors;

  constructor(errors: ValidationErrors) {
    super(`勝敗記録が整合しません: ${errors.join(" / ")}`);
    this.name = "DivisionValidationError";
    this.errors = errors;
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

/**
 * 楽観ロック付きで 1 試合分の結果を書き込む。
 * 書き込み前に validate.ts の validateResults（spec のルール 7〜9）を反映後の値に対して検証し、
 * 不正なら DivisionValidationError を投げる。
 * 読み取りから書き込みの間に revision が変わっていたら DivisionConflictError を投げる。
 */
export const recordMatchResult = async (
  prisma: PrismaClient,
  divisionId: string,
  record: MatchResultRecord,
): Promise<DivisionResults> => {
  const division = await prisma.division.findUniqueOrThrow({
    where: { id: divisionId },
    select: {
      results: true,
      revision: true,
      matchingConfig: true,
      format: true,
    },
  });

  const next = applyMatchResult(parseDivisionResults(division.results), record);

  const errors = validateResults(
    next,
    parseMatchingConfig(division.matchingConfig),
    division.format,
  );
  if (errors.length > 0) {
    throw new DivisionValidationError(errors);
  }

  const updated = await prisma.division.updateMany({
    where: { id: divisionId, revision: division.revision },
    data: { results: toJsonInput(next), revision: division.revision + 1 },
  });
  if (updated.count === 0) {
    throw new DivisionConflictError(divisionId);
  }

  return next;
};
