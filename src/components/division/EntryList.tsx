import type { DivisionParticipant } from "@/features/division/repository";
import type { DivisionFormAction } from "@/features/division/state";
import type { DivisionEntry } from "@/lib/division/types";
import { EntryRowActions } from "./EntryRowActions";
import { PlayerNumberForm } from "./PlayerNumberForm";

export function EntryList({
  entries,
  participants,
  slug,
  tournamentId,
  divisionId,
  reorderAction,
  removeAction,
  setPlayerNumberAction,
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
  setPlayerNumberAction: DivisionFormAction;
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
        削除すると組み合わせが変わることがあります。選手番号は大会内で共通のため、
        変更は他の部門にも反映されます
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
                  {participant !== undefined && (
                    <span className="mr-2 text-xs text-slate-500">
                      No.{participant.playerNumber}
                    </span>
                  )}
                  {participant?.name ?? "（不明な参加者）"}
                </p>
                {participant !== undefined && (
                  <p className="text-xs text-slate-500">
                    {participant.nameKana}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                {participant !== undefined && (
                  <PlayerNumberForm
                    participantId={participant.id}
                    playerNumber={participant.playerNumber}
                    participantName={participant.name}
                    slug={slug}
                    tournamentId={tournamentId}
                    divisionId={divisionId}
                    action={setPlayerNumberAction}
                  />
                )}
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
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
