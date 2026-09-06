// エントリー編集・組み合わせ生成・ブラケット表示の 3 画面が、それぞれ
// 「まだ対応していません」「読み込めませんでした」のような、同じ枠線付きの
// 案内パネルを出す。見た目が同じものを画面ごとに複製しないよう、ここで共有する。
export const Notice = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-600">
    {children}
  </p>
);
