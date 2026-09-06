import type {
  CrossTableCell,
  CrossTableView,
} from "@/features/division/round-robin/view";

/** 1 マスの表示。対戦の向きは表示上の意味を持たないので表は左右対称になる。 */
const cellText = (cell: CrossTableCell): string => {
  switch (cell.kind) {
    case "self":
      return "—";
    case "match":
      return `第${cell.matchNumber}試合`;
    case "none":
      return "";
  }
};

/**
 * 誰と誰が当たるかを一目で見せる星取表。マスには試合番号を入れる。
 * 人数が増えると横に広がるので、横スクロールできる箱に入れる。
 */
export function LeagueCrossTable({ table }: { table: CrossTableView }) {
  if (table.headers.length === 0) {
    return <p className="text-sm text-slate-600">まだエントリーがありません</p>;
  }

  return (
    <div className="overflow-x-auto rounded border border-slate-200 bg-white">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border-b border-slate-200 px-3 py-2 text-left text-xs font-medium text-slate-500">
              {/* 行見出しの列。ここに文字を置くと 1 行目が読みにくくなる */}
            </th>
            {table.headers.map((header) => (
              <th
                key={header.entryId}
                scope="col"
                className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-xs font-medium text-slate-500"
              >
                {header.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.entryId}>
              <th
                scope="row"
                className="whitespace-nowrap border-b border-slate-100 px-3 py-2 text-left font-medium text-slate-800"
              >
                {row.label}
              </th>
              {row.cells.map((cell, index) => (
                <td
                  // 列の並びは headers と 1 対 1 なので、列の entryId を鍵にする。
                  key={table.headers[index].entryId}
                  className="whitespace-nowrap border-b border-slate-100 px-3 py-2 text-center text-xs text-slate-600"
                >
                  {cellText(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
