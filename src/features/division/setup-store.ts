import "server-only";
import { Effect } from "effect";
import type { Prisma } from "@/generated/prisma/client";
import {
  parseDivisionEntries,
  parseDivisionResults,
  parseMatchingConfig,
} from "@/lib/division/parse";
import type { DivisionEntries, MatchingConfig } from "@/lib/division/types";
import {
  validateEntries,
  validateMatchingConfig,
} from "@/lib/division/validate";
import { prisma } from "@/shared/db/prisma";
import {
  DivisionDataError,
  type DivisionError,
  DivisionResultsRecordedError,
  toDivisionError,
} from "./errors";
import { type EditableFormat, isEditableFormat } from "./matching-strategy";

/** 3 段の所有権を表す組。全スライスがこの形で受け渡す。 */
export type DivisionIds = {
  organizationId: string;
  tournamentId: string;
  divisionId: string;
};

/**
 * 編集対象の Json 2 列と、その組み直し規則を選ぶための形式。
 * results は変更しないので運ばない。
 */
export type DivisionSetup = {
  format: EditableFormat;
  entries: DivisionEntries;
  matchingConfig: MatchingConfig;
};

export type DivisionSetupTx = Prisma.TransactionClient;

/**
 * found: false は「この組織のこの大会に、この画面が編集できる部門が無い」。
 * 存在しない場合と対象外の形式の場合を区別しない。呼び出し側は notFound() へ倒す。
 */
export type DivisionSetupOutcome<T> =
  | { found: false }
  | { found: true; value: T };

/**
 * 所有権を where に入れて読み、Json を検証済みの形にして返す。
 * 勝敗が 1 件でも記録されていれば、この画面からは編集させない。
 *
 * 形式の判定をここに置くのは、Server Action がページを経由せず叩ける
 * 別の入口だから。画面の分岐だけでは、例えば編集画面を持たない
 * ダブルエリミネーションの部門へ generateMatching を投げられると、
 * どの画面にも出ない組み合わせが matchingConfig に書き込まれてしまう。
 * 全スライスが必ず通るこの読み出しで弾いておけば、スライスごとに
 * 同じ判定を書き写す必要がなくなる。
 * 対象外の形式は「その部門は無い」と同じ扱いにして 404 に倒す。
 */
const load = async (
  tx: DivisionSetupTx,
  ids: DivisionIds,
): Promise<DivisionSetup | null> => {
  const row = await tx.division.findFirst({
    where: {
      id: ids.divisionId,
      tournament: { id: ids.tournamentId, organizationId: ids.organizationId },
    },
    select: {
      format: true,
      entries: true,
      matchingConfig: true,
      results: true,
    },
  });
  if (!row) {
    return null;
  }

  if (!isEditableFormat(row.format)) {
    return null;
  }

  if (parseDivisionResults(row.results).matches.length > 0) {
    throw new DivisionResultsRecordedError({ divisionId: ids.divisionId });
  }

  return {
    format: row.format,
    entries: parseDivisionEntries(row.entries),
    matchingConfig: parseMatchingConfig(row.matchingConfig),
  };
};

/**
 * 書き戻し。where に所有条件を残すため update ではなく updateMany を使う。
 * 保存の直前に検証を通し、通らなければ書かない。純粋関数が正しければ
 * ここは素通りするだけで、落ちたときは握り潰さずバグとして表に出す。
 */
const save = async (
  tx: DivisionSetupTx,
  ids: DivisionIds,
  next: DivisionSetup,
): Promise<void> => {
  const participants = await tx.participant.findMany({
    where: { tournamentId: ids.tournamentId },
    select: { id: true },
  });

  const errors = [
    ...validateEntries(
      next.entries,
      participants.map((participant) => participant.id),
    ),
    ...validateMatchingConfig(next.matchingConfig, next.entries),
  ];
  if (errors.length > 0) {
    throw new DivisionDataError({ reason: errors });
  }

  await tx.division.updateMany({
    where: {
      id: ids.divisionId,
      tournament: { id: ids.tournamentId, organizationId: ids.organizationId },
    },
    // format は書かない。形式の変更は /edit が持つ責務で、この経路では変えない。
    data: { entries: next.entries, matchingConfig: next.matchingConfig },
  });
};

/**
 * 読み → 加工 → 書き戻しを 1 つのトランザクションで回す。5 つのスライスが共有する。
 *
 * mutate には tx をそのまま渡す。add-entry のように Member / Participant を
 * 同じトランザクションで作る必要があるスライスがあるため。
 * next: null のときは書き込まない（端まで来た並べ替えなどの no-op）。
 *
 * 楽観ロックは入れていない。トランザクション内の read-modify-write なので単一操作の
 * 原子性は保たれるが、2 人が同時に開いていれば後の操作が前を上書きする。
 */
export const runDivisionSetup = <T>(
  ids: DivisionIds,
  mutate: (
    tx: DivisionSetupTx,
    current: DivisionSetup,
  ) => Promise<{ next: DivisionSetup | null; value: T }>,
): Effect.Effect<DivisionSetupOutcome<T>, DivisionError> =>
  Effect.tryPromise({
    try: () =>
      prisma.$transaction(async (tx): Promise<DivisionSetupOutcome<T>> => {
        const current = await load(tx, ids);
        if (current === null) {
          return { found: false };
        }

        const { next, value } = await mutate(tx, current);
        if (next !== null) {
          await save(tx, ids, next);
        }
        return { found: true, value };
      }),
    catch: (reason) => toDivisionError(reason, ids.tournamentId),
  });
