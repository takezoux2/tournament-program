import { TournamentFlow } from "@/components/tournament/TournamentFlow";
import { toFlowElements } from "@/features/bracket/to-flow-elements";
import type {
  DivisionDetail,
  DivisionParticipant,
} from "@/features/division/repository";
import { type BracketEditor, EditableBracket } from "./EditableBracket";
import { Notice } from "./Notice";
import { prepareBracket } from "./prepare-bracket";

export function DivisionBracket({
  division,
  participants,
  overallSeq,
  heightClassName = "h-[28rem]",
  editor,
  entryLabels,
  entryParticipantIds,
}: {
  division: DivisionDetail;
  participants: DivisionParticipant[];
  /** 大会全体の通し番号。試合名の {{OverallSeq}} の展開に使う */
  overallSeq: ReadonlyMap<string, number>;
  /**
   * 描画枠の高さ。既定は管理画面の詳細ページ向け。公開のブラケットページは
   * ブラケット専用の画面なので、dvh 基準の高さを渡して画面を占有させる。
   * Tailwind v4 はソース中の文字列からクラスを生成するため、
   * 呼び出し側は必ず文字列リテラルで渡すこと。
   */
  heightClassName?: string;
  /** 渡すと 1 回戦のスロットに鉛筆を出す編集モード。setup 画面だけが渡す */
  editor?: BracketEditor;
  /** 参照エントリーの表示名（entryId → 名前）。ページが entry-source から作る */
  entryLabels?: ReadonlyMap<string, string>;
  /** 解決済みの参照エントリーの participantId。ページが entry-source から作る */
  entryParticipantIds?: ReadonlyMap<string, string>;
}) {
  // パースから座標計算までは印刷（PrintBracket）と共有する。
  const prepared = prepareBracket(division, participants, overallSeq, {
    entryLabels,
    entryParticipantIds,
  });
  if (prepared.kind === "notice") {
    return <Notice>{prepared.message}</Notice>;
  }

  // toFlowElements も座標の欠けで例外を投げる。ページは落とさない。
  let elements: ReturnType<typeof toFlowElements>;
  try {
    elements = toFlowElements(
      prepared.matches,
      prepared.positions,
      prepared.labels,
    );
  } catch {
    return <Notice>ブラケットを組み立てられませんでした</Notice>;
  }

  return (
    <div
      className={`${heightClassName} rounded border border-slate-200 bg-white`}
    >
      {editor === undefined ? (
        <TournamentFlow nodes={elements.nodes} edges={elements.edges} />
      ) : (
        <EditableBracket
          nodes={elements.nodes}
          edges={elements.edges}
          {...editor}
        />
      )}
    </div>
  );
}
