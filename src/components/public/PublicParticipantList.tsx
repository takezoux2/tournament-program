import type { DivisionParticipant } from "@/features/division/repository";

/**
 * 選手番号は文字列だが、閲覧者は数値として読む。numeric: true にしないと
 * "10" が "2" より前に来る。Collator はモジュール直下で 1 度だけ作る
 * （生成が重く、レンダーのたびに作る理由がない）。
 */
const PLAYER_NUMBER_COLLATOR = new Intl.Collator("ja", { numeric: true });

/**
 * 公開ページの参加者一覧。listParticipantsInTournament は並び順を持たないため、
 * 並べ替えはここで行う。props の配列は破壊しない（呼び出し側が同じ配列を
 * 他所でも使いうる）。
 */
export function PublicParticipantList({
  participants,
}: {
  participants: DivisionParticipant[];
}) {
  if (participants.length === 0) {
    return <p className="text-sm text-slate-600">まだ参加者がいません</p>;
  }

  const sorted = [...participants].sort((a, b) =>
    PLAYER_NUMBER_COLLATOR.compare(a.playerNumber, b.playerNumber),
  );

  return (
    <ul className="space-y-2">
      {sorted.map((participant) => (
        <li
          key={participant.id}
          className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded border border-slate-200 bg-white px-4 py-3"
        >
          <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
            No.{participant.playerNumber}
          </span>
          <span className="font-medium text-slate-800">{participant.name}</span>
          {participant.team !== undefined && (
            <span className="text-xs text-slate-500">{participant.team}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
