import type {
  LeagueOutcome,
  LeagueTableCell,
  LeagueTableView,
} from "@/features/division/round-robin/standings";

/** ○●△ の印と、読み上げ用の名前。記号だけでは意味が伝わらないため。 */
const OUTCOME_MARKS: Record<LeagueOutcome, { mark: string; label: string }> = {
  win: { mark: "○", label: "勝ち" },
  loss: { mark: "●", label: "負け" },
  draw: { mark: "△", label: "引き分け" },
};

const headerClassName =
  "whitespace-nowrap border-b border-slate-200 px-3 py-2 text-xs font-medium text-slate-500";

const numberClassName =
  "whitespace-nowrap border-b border-slate-100 px-3 py-2 text-center text-sm text-slate-800";

/**
 * 1 マスの中身。対戦済みは印を大きく、試合番号を小さく添える。
 * 未実施は試合番号だけを淡色で出し、「まだ」であることを見た目で分ける。
 */
const CellContent = ({ cell }: { cell: LeagueTableCell }) => {
  switch (cell.kind) {
    case "self":
      return <>—</>;
    case "none":
      return null;
    case "match": {
      const number = (
        <span className="block text-[10px] text-slate-400">
          第{cell.matchNumber}試合
        </span>
      );
      if (cell.outcome === null) {
        return number;
      }
      const { mark, label } = OUTCOME_MARKS[cell.outcome];
      return (
        <>
          <span
            role="img"
            aria-label={label}
            className="block text-base leading-tight text-slate-800"
          >
            {mark}
          </span>
          {number}
        </>
      );
    }
  }
};

/**
 * 勝敗込みの星取表と順位表を 1 つにまとめた表。
 * 行・列はどちらも順位順で渡ってくる（並べ替えはドメイン側の責務）。
 * 人数が増えると横に広がるので、横スクロールできる箱に入れる。
 */
export function LeagueResultTable({ table }: { table: LeagueTableView }) {
  if (table.headers.length === 0) {
    return <p className="text-sm text-slate-600">まだエントリーがありません</p>;
  }

  return (
    <div className="overflow-x-auto rounded border border-slate-200 bg-white">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className={headerClassName}>
              順位
            </th>
            <th scope="col" className={`${headerClassName} text-left`}>
              名前
            </th>
            {table.headers.map((header) => (
              <th key={header.entryId} scope="col" className={headerClassName}>
                {header.label}
              </th>
            ))}
            <th scope="col" className={headerClassName}>
              勝
            </th>
            <th scope="col" className={headerClassName}>
              分
            </th>
            <th scope="col" className={headerClassName}>
              敗
            </th>
            <th scope="col" className={headerClassName}>
              勝点
            </th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.entryId}>
              <td className={`${numberClassName} font-medium`}>{row.rank}</td>
              <th
                scope="row"
                className="whitespace-nowrap border-b border-slate-100 px-3 py-2 text-left font-medium text-slate-800"
              >
                {row.label}
              </th>
              {row.cells.map((cell, index) => (
                <td
                  // 列の並びは headers と 1 対 1 なので、列の entryId を鍵にする
                  key={table.headers[index].entryId}
                  className="whitespace-nowrap border-b border-slate-100 px-3 py-2 text-center text-xs text-slate-600"
                >
                  <CellContent cell={cell} />
                </td>
              ))}
              <td className={numberClassName}>{row.wins}</td>
              <td className={numberClassName}>{row.draws}</td>
              <td className={numberClassName}>{row.losses}</td>
              <td className={`${numberClassName} font-medium`}>{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
