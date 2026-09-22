import type { TournamentParticipant } from "@/features/participant/repository";

const cellClassName = "border border-slate-400 px-2 py-1 text-left";

/**
 * 印刷の選手一覧。並びは listParticipantsWithDivisions が選手番号の自然順で
 * 決めているので、ここでは並べ替えない。<thead> は印刷でページをまたぐと
 * ブラウザが各ページの先頭に繰り返すので、長い名簿でも列の意味が分かる。
 */
export function PrintParticipantTable({
  participants,
}: {
  participants: TournamentParticipant[];
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">選手一覧</h2>
      {participants.length === 0 ? (
        <p className="text-sm">まだ参加者がいません</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100">
              <th scope="col" className={`${cellClassName} w-20`}>
                選手番号
              </th>
              <th scope="col" className={cellClassName}>
                氏名
              </th>
              <th scope="col" className={cellClassName}>
                所属
              </th>
              <th scope="col" className={cellClassName}>
                出場部門
              </th>
            </tr>
          </thead>
          <tbody>
            {participants.map((participant) => (
              // 行の途中で改ページすると 1 人の情報が 2 枚に割れる
              <tr key={participant.id} className="break-inside-avoid">
                <td className={cellClassName}>{participant.playerNumber}</td>
                <td className={cellClassName}>{participant.name}</td>
                <td className={cellClassName}>{participant.team ?? ""}</td>
                <td className={cellClassName}>
                  {participant.divisions
                    .map((division) => division.name)
                    .join("、")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
