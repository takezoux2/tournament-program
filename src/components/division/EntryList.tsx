import type { DivisionParticipant } from "@/features/division/repository";
import type { DivisionFormAction } from "@/features/division/state";
import type { DivisionEntry } from "@/lib/division/types";
import { EntryRowActions } from "./EntryRowActions";

export function EntryList({
  entries,
  participants,
  slug,
  tournamentId,
  divisionId,
  reorderAction,
  removeAction,
  disabled,
}: {
  /** seed 昇順で渡す。端の判定にこの並びを使う。 */
  entries: DivisionEntry[];
  participants: DivisionParticipant[];
  slug: string;
  tournamentId: string;
  divisionId: string;
  reorderAction: DivisionFormAction;
  removeAction: DivisionFormAction;
  disabled: boolean;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-600">まだエントリーがありません</p>;
  }

  const participantById = new Map(
    participants.map((participant) => [participant.id, participant]),
  );

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        削除すると組み合わせは再生成されます
      </p>

      <ul className="space-y-2">
        {entries.map((entry, index) => {
          const participant = participantById.get(entry.participantId);
          return (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-4 rounded border border-slate-200 bg-white px-4 py-3"
            >
              <div>
                {/* 参加者を引けなくても行は出す。編集を続けられる方がよい。 */}
                <p className="font-medium text-slate-800">
                  {participant?.name ?? "（不明な参加者）"}
                </p>
                {participant !== undefined && (
                  <p className="text-xs text-slate-500">
                    {participant.nameKana}
                  </p>
                )}
              </div>

              <EntryRowActions
                reorderAction={reorderAction}
                removeAction={removeAction}
                slug={slug}
                tournamentId={tournamentId}
                divisionId={divisionId}
                entryId={entry.id}
                canMoveUp={index > 0}
                canMoveDown={index < entries.length - 1}
                disabled={disabled}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
