import type { TournamentParticipant } from "@/features/participant/repository";

/**
 * 公開ページの参加者一覧。並びは listParticipantsWithDivisions が
 * 選手番号の自然順で決めているので、ここでは並べ替えない。
 */
export function PublicParticipantList({
  participants,
}: {
  participants: TournamentParticipant[];
}) {
  if (participants.length === 0) {
    return <p className="text-sm text-slate-600">まだ参加者がいません</p>;
  }

  return (
    <ul className="space-y-2">
      {participants.map((participant) => (
        <li
          key={participant.id}
          className="space-y-1 rounded border border-slate-200 bg-white px-4 py-3"
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
              No.{participant.playerNumber}
            </span>
            <span className="min-w-0 wrap-break-word font-medium text-slate-800">
              {participant.name}
            </span>
            {participant.team !== undefined && (
              <span className="text-xs text-slate-500">{participant.team}</span>
            )}
          </div>

          {/* 出場部門が無いことは書き立てない。準備中の大会で未エントリーの
              参加者を晒す意味がないため、管理画面とは扱いを変える。 */}
          {participant.divisions.length > 0 && (
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
        </li>
      ))}
    </ul>
  );
}
