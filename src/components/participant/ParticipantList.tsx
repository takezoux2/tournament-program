import type { TournamentParticipant } from "@/features/participant/repository";
import type { ParticipantFormAction } from "@/features/participant/state";
import { PlayerNumberForm } from "./PlayerNumberForm";
import { RemoveParticipantButton } from "./RemoveParticipantButton";

/**
 * 管理画面の参加者一覧。並びは repository が選手番号の自然順で決めているので
 * ここでは並べ替えない。
 */
export function ParticipantList({
  slug,
  tournamentId,
  participants,
  canEdit,
  setPlayerNumberAction,
  removeAction,
}: {
  slug: string;
  tournamentId: string;
  participants: TournamentParticipant[];
  canEdit: boolean;
  setPlayerNumberAction: ParticipantFormAction;
  removeAction: ParticipantFormAction;
}) {
  if (participants.length === 0) {
    return (
      <p className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-500">
        まだ参加者がいません
      </p>
    );
  }

  return (
    <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
      {participants.map((participant) => (
        <li
          key={participant.id}
          className="flex flex-wrap items-start justify-between gap-3 p-4"
        >
          <div className="min-w-0 flex-1 space-y-1">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                No.{participant.playerNumber}
              </span>
              <span className="wrap-break-word text-sm font-medium text-slate-800">
                {participant.name}
              </span>
              {participant.team !== undefined && (
                <span className="text-xs text-slate-500">
                  {participant.team}
                </span>
              )}
            </p>
            <p className="text-xs text-slate-500">{participant.nameKana}</p>

            {participant.divisions.length === 0 ? (
              <p className="text-xs text-slate-400">出場部門なし</p>
            ) : (
              <ul className="flex flex-wrap gap-1">
                {participant.divisions.map((division) => (
                  <li
                    key={division.id}
                    className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                  >
                    {division.name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 編集の出し分けは体感のためで、境界は各 Server Action にある。 */}
          {canEdit && (
            <div className="flex flex-wrap items-start justify-end gap-3">
              <PlayerNumberForm
                participantId={participant.id}
                playerNumber={participant.playerNumber}
                participantName={participant.name}
                slug={slug}
                tournamentId={tournamentId}
                action={setPlayerNumberAction}
              />
              <RemoveParticipantButton
                slug={slug}
                tournamentId={tournamentId}
                participant={participant}
                action={removeAction}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
