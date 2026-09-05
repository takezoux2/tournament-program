import "server-only";
import { randomUUID } from "node:crypto";
import { Effect } from "effect";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/shared/db/prisma";
import { toSaveItems } from "./domain";
import { type ScheduleError, toScheduleError } from "./errors";
import { readScheduleRows } from "./repository";
import type { ScheduleRowView } from "./types";

/** 2 段の所有権を表す組。4 スライスがこの形で受け渡す。 */
export type ScheduleIds = {
  organizationId: string;
  tournamentId: string;
};

/** found: false は「この組織にこの大会が無い」。呼び出し側は notFound() へ倒す。 */
export type ScheduleOutcome<T> = { found: false } | { found: true; value: T };

/**
 * 並びを書き戻す。order の unique 制約があるため 1 行ずつ動かすと退避が要るが、
 * 全行を消してから 0..n-1 で作り直せば、同じトランザクションの中で
 * 古い行はすでに消えているので衝突しない。1 大会の行数はたかだか数百で、
 * 1 操作あたり全行書き換えのコストは受け入れる。
 *
 * 区切りの id は引き継ぐ。行が作り直されても、画面が持っている
 * divider:{id} のキーが指し続けられるようにするため。
 */
const save = async (
  tx: Prisma.TransactionClient,
  tournamentId: string,
  rows: ScheduleRowView[],
): Promise<void> => {
  await tx.scheduleItem.deleteMany({ where: { tournamentId } });

  const data = toSaveItems(rows).map((item, index) =>
    item.kind === "divider"
      ? {
          id: item.id,
          tournamentId,
          order: index,
          kind: "DIVIDER" as const,
          divisionId: null,
          matchId: null,
          label: item.label,
          startsAt: item.startsAt,
        }
      : {
          id: randomUUID(),
          tournamentId,
          order: index,
          kind: "MATCH" as const,
          divisionId: item.divisionId,
          matchId: item.matchId,
          label: null,
          startsAt: null,
        },
  );

  if (data.length > 0) {
    await tx.scheduleItem.createMany({ data });
  }
};

/**
 * 読み → マージ → 変形 → 書き戻しを 1 つのトランザクションで回す。
 * 4 つのスライスが共有し、スライス側は「行配列をどう変えるか」だけを書く。
 *
 * mutate は同期関数でよい（どのスライスも tx を必要としない）。
 * 対象が見つからない・並びが一致しないといった判断は mutate の中で
 * ScheduleError を throw して表す。toScheduleError がそのまま通す。
 *
 * next: null のときは書き込まない。
 */
export const runSchedule = <T>(
  ids: ScheduleIds,
  mutate: (rows: ScheduleRowView[]) => {
    next: ScheduleRowView[] | null;
    value: T;
  },
): Effect.Effect<ScheduleOutcome<T>, ScheduleError> =>
  Effect.tryPromise({
    try: () =>
      prisma.$transaction(async (tx): Promise<ScheduleOutcome<T>> => {
        // 所有権つきの存在確認。ここで倒しておけば、以降の読み出しが
        // 空配列を返しただけの場合と「大会が無い」場合を取り違えない。
        const tournament = await tx.tournament.findFirst({
          where: { id: ids.tournamentId, organizationId: ids.organizationId },
          select: { id: true },
        });
        if (!tournament) {
          return { found: false };
        }

        const rows = await readScheduleRows(
          tx,
          ids.organizationId,
          ids.tournamentId,
        );
        const { next, value } = mutate(rows);
        if (next !== null) {
          await save(tx, ids.tournamentId, next);
        }
        return { found: true, value };
      }),
    catch: (reason) => toScheduleError(reason, ids.tournamentId),
  });
