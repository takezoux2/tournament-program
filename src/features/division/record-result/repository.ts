import "server-only";
import { Effect } from "effect";
import type { Prisma } from "@/generated/prisma/client";
import {
  parseDivisionResults,
  parseMatchingConfig,
} from "@/lib/division/parse";
import { downstreamMatchIds, resolveMatchSlots } from "@/lib/division/resolve";
import { applyMatchResult, clearResults } from "@/lib/division/results";
import type { DivisionResults } from "@/lib/division/types";
import { validateResults } from "@/lib/division/validate";
import { prisma } from "@/shared/db/prisma";
import {
  DivisionDataError,
  type DivisionError,
  DivisionMatchNotFoundError,
  DivisionRevisionConflictError,
  DivisionSlotNotDecidedError,
  toDivisionError,
} from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { RecordResultInput } from "./schema";

export type RecordResultPort = (
  ids: DivisionIds,
  input: RecordResultInput,
) => Effect.Effect<DivisionSetupOutcome<{ recorded: boolean }>, DivisionError>;

/**
 * Prisma の Json 入力は任意プロパティを持つ構造的な型を受け付けない
 * （MatchResultRecord の score / finishedAt が undefined を取りうるため）。
 * 書き込みのときだけ変換する。
 */
const toJsonInput = (results: DivisionResults): Prisma.InputJsonValue =>
  results as unknown as Prisma.InputJsonValue;

/**
 * 1 試合の勝敗を書く。winnerEntryId が空文字なら記録を取り消す。
 *
 * setup-store の runDivisionSetup は使わない。あれは results が 1 件でもあると
 * 拒否する読み出しで、このスライスが書き換えたいのはまさにその列だから。
 *
 * 勝者が変わると、その勝者が進む先（下流）の記録は矛盾する。承認済みの仕様に
 * 従い、下流をまとめて消してから書く。同じ勝者の押し直しは変更なしとして
 * 何も書かない（下流も残る）。
 *
 * 記録済みの試合で勝者だけを変えたときは、スコアとメモを引き継ぎ、勝因は消す。
 * スコアとメモは勝者が誰かに依らず意味を保つので、勝者の付け直しで黙って
 * 失わせない。勝因は前の勝者に付けたものなので、残すと新しい勝者の勝因として
 * 表示されてしまう。取り消し（空文字）は従来どおり記録ごと消す。
 */
export const recordResultInDb: RecordResultPort = (ids, input) =>
  Effect.tryPromise({
    try: () =>
      prisma.$transaction(
        async (tx): Promise<DivisionSetupOutcome<{ recorded: boolean }>> => {
          const ownership = {
            id: ids.divisionId,
            tournament: {
              id: ids.tournamentId,
              organizationId: ids.organizationId,
            },
          };

          const row = await tx.division.findFirst({
            where: ownership,
            select: {
              format: true,
              matchingConfig: true,
              results: true,
              revision: true,
            },
          });
          if (!row) {
            return { found: false };
          }

          const config = parseMatchingConfig(row.matchingConfig);
          const current = parseDivisionResults(row.results);
          if (!config.matches.some((match) => match.id === input.matchId)) {
            throw new DivisionMatchNotFoundError({ matchId: input.matchId });
          }

          const existing = current.matches.find(
            (record) => record.matchId === input.matchId,
          );
          const nextWinner =
            input.winnerEntryId === "" ? null : input.winnerEntryId;

          if (nextWinner !== null) {
            // 画面ではボタンを無効にしているが、Server Action はページを経由せず
            // 直接叩ける別の入口なので、ここで独立に確かめる。両スロットが確定
            // していない試合（未確定・BYE）は入力させない。
            const resolved = resolveMatchSlots(config, current).get(
              input.matchId,
            );
            const standing =
              resolved === undefined
                ? []
                : resolved.slots.flatMap((slot) =>
                    slot.state === "entry" ? [slot.entryId] : [],
                  );
            if (standing.length !== 2 || !standing.includes(nextWinner)) {
              throw new DivisionSlotNotDecidedError({
                matchId: input.matchId,
              });
            }
          }

          // 「変更なし」は記録の有無と勝者の値の両方で見る。winnerEntryId: null
          // （引き分け）の記録は前者だけで比べると「記録が無い」と区別が付かず、
          // 取り消し（空文字）を送っても何も書かずに成功を返してしまう。
          // 結果が 1 件でもあれば部門を編集不能にする setup-store の仕様上、
          // 取り消しはその唯一の逃げ道なので、ここで塞いではいけない。
          const unchanged =
            nextWinner === null
              ? existing === undefined
              : existing?.winnerEntryId === nextWinner;
          if (unchanged) {
            return { found: true, value: { recorded: false } };
          }

          const cleared = clearResults(
            current,
            downstreamMatchIds(input.matchId, config),
          );
          const next =
            nextWinner === null
              ? clearResults(cleared, new Set([input.matchId]))
              : applyMatchResult(cleared, {
                  matchId: input.matchId,
                  winnerEntryId: nextWinner,
                  ...(existing?.scores !== undefined
                    ? { scores: existing.scores }
                    : {}),
                  ...(existing?.note !== undefined
                    ? { note: existing.note }
                    : {}),
                });

          // setup-store の save と同じく、書く直前に反映後の全体を検証する。
          const errors = validateResults(next, config, row.format);
          if (errors.length > 0) {
            throw new DivisionDataError({ reason: errors });
          }

          const updated = await tx.division.updateMany({
            where: { ...ownership, revision: row.revision },
            data: { results: toJsonInput(next), revision: row.revision + 1 },
          });
          if (updated.count === 0) {
            throw new DivisionRevisionConflictError({
              divisionId: ids.divisionId,
            });
          }

          return { found: true, value: { recorded: true } };
        },
      ),
    catch: (reason) => toDivisionError(reason, ids.tournamentId),
  });
