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

/**
 * セル共通の余白と改行規則。画面は横スクロールできるので詰めず、印刷は
 * table-fixed でページ幅に収めるため詰めて、はみ出す名前は折り返す。
 */
const cellSpacing = (print: boolean): string =>
  print
    ? "whitespace-normal break-words px-1 py-1"
    : "whitespace-nowrap px-3 py-2";

const headerClassName = (print: boolean): string =>
  `${cellSpacing(print)} border-b border-slate-200 text-xs font-medium text-slate-500`;

const numberClassName = (print: boolean): string =>
  `${cellSpacing(print)} border-b border-slate-100 text-center text-sm text-slate-800`;

/**
 * 1 マスの中身。対戦済みは印を大きく、試合名を小さく添える。
 * 未実施は試合名だけを淡色で出し、「まだ」であることを見た目で分ける。
 * 試合名の淡色（text-slate-400）はモノクロ印刷では薄すぎるので、印刷では
 * text-slate-600 に濃くする。
 */
const CellContent = ({
  cell,
  print,
}: {
  cell: LeagueTableCell;
  print: boolean;
}) => {
  switch (cell.kind) {
    case "self":
      return <>—</>;
    case "none":
      return null;
    case "match": {
      // 展開は toLeagueTableView の上（DivisionMatchingView）で済んでいる。
      // 「第◯試合」の形は試合名そのものが決めるので、ここでは飾りを足さない。
      const number = (
        <span
          className={`block text-[10px] ${print ? "text-slate-600" : "text-slate-400"}`}
        >
          {cell.matchName}
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
 * 画面では人数が増えると横に広がるので、横スクロールできる箱に入れる。
 * 紙はスクロールできないので、print ではページ幅いっぱいの表にする。
 */
export function LeagueResultTable({
  table,
  print = false,
  showStandings = true,
}: {
  table: LeagueTableView;
  /** 印刷ページ向け。横スクロールの箱をやめる */
  print?: boolean;
  /**
   * false で順位・勝・分・敗・勝点のマスを空欄にする。印刷の空欄モードでは
   * 結果を数えないので、全員 0 の集計は並べず手書きの欄として残す。
   */
  showStandings?: boolean;
}) {
  if (table.headers.length === 0) {
    return <p className="text-sm text-slate-600">まだエントリーがありません</p>;
  }

  const standing = (value: number): number | null =>
    showStandings ? value : null;

  return (
    <div
      className={
        print
          ? "rounded border border-slate-400 bg-white"
          : "overflow-x-auto rounded border border-slate-200 bg-white"
      }
    >
      <table
        className={`${print ? "w-full table-fixed" : "min-w-full"} border-collapse text-sm`}
      >
        <thead>
          <tr>
            <th scope="col" className={headerClassName(print)}>
              順位
            </th>
            <th scope="col" className={`${headerClassName(print)} text-left`}>
              名前
            </th>
            {table.headers.map((header) => (
              <th
                key={header.entryId}
                scope="col"
                className={headerClassName(print)}
              >
                {header.label}
              </th>
            ))}
            <th scope="col" className={headerClassName(print)}>
              勝
            </th>
            <th scope="col" className={headerClassName(print)}>
              分
            </th>
            <th scope="col" className={headerClassName(print)}>
              敗
            </th>
            <th scope="col" className={headerClassName(print)}>
              勝点
            </th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.entryId}>
              <td className={`${numberClassName(print)} font-medium`}>
                {standing(row.rank)}
              </td>
              <th
                scope="row"
                className={`${cellSpacing(print)} border-b border-slate-100 text-left font-medium text-slate-800`}
              >
                {row.label}
              </th>
              {row.cells.map((cell, index) => (
                <td
                  // 列の並びは headers と 1 対 1 なので、列の entryId を鍵にする
                  key={table.headers[index].entryId}
                  className={`${cellSpacing(print)} border-b border-slate-100 text-center text-xs text-slate-600`}
                >
                  <CellContent cell={cell} print={print} />
                </td>
              ))}
              <td className={numberClassName(print)}>{standing(row.wins)}</td>
              <td className={numberClassName(print)}>{standing(row.draws)}</td>
              <td className={numberClassName(print)}>{standing(row.losses)}</td>
              <td className={`${numberClassName(print)} font-medium`}>
                {standing(row.points)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
