import { TournamentFlow } from "@/components/tournament/TournamentFlow";
import { fromDivision } from "@/features/bracket/from-division";
import {
  layoutBracket,
  sectionLabels,
} from "@/features/bracket/layout-bracket";
import { resolveBracket } from "@/features/bracket/resolve-bracket";
import { toFlowElements } from "@/features/bracket/to-flow-elements";
import { DIVISION_FORMAT_LABELS } from "@/features/division/format";
import type {
  DivisionDetail,
  DivisionParticipant,
} from "@/features/division/repository";
import { resolveMatchNames } from "@/lib/division/match-name";
import {
  parseDivisionEntries,
  parseDivisionResultConfigOrDefault,
  parseDivisionResults,
  parseMatchingConfig,
} from "@/lib/division/parse";
import { type BracketEditor, EditableBracket } from "./EditableBracket";
import { Notice } from "./Notice";

export function DivisionBracket({
  division,
  participants,
  overallSeq,
  heightClassName = "h-[28rem]",
  editor,
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
}) {
  // Json は DB の列で、アプリの外から壊れた値が入りうる。パースの失敗は
  // この区画で受け止め、ページ全体は落とさない。
  let parsed: {
    entries: ReturnType<typeof parseDivisionEntries>;
    matchingConfig: ReturnType<typeof parseMatchingConfig>;
    results: ReturnType<typeof parseDivisionResults>;
  };
  try {
    parsed = {
      entries: parseDivisionEntries(division.entries),
      matchingConfig: parseMatchingConfig(division.matchingConfig),
      results: parseDivisionResults(division.results),
    };
  } catch {
    return <Notice>ブラケットのデータを読み込めませんでした</Notice>;
  }

  // resultConfig は表示のフィルタでしかない。壊れていてもブラケットそのものは
  // 描けるはずなので、他の 3 列とは別に受け止めて既定値へ落とす
  // （/edit ページの読み出しと同じ方針）。
  const resultConfig = parseDivisionResultConfigOrDefault(
    division.resultConfig,
  );

  if (parsed.matchingConfig.matches.length === 0) {
    return <Notice>組み合わせが未作成です</Notice>;
  }

  // リーグは星取表で描く（DivisionMatchingView）。ここへ来るのは誤用。
  if (division.format === "ROUND_ROBIN") {
    return (
      <Notice>
        「{DIVISION_FORMAT_LABELS[division.format]}
        」のブラケット表示はまだ対応していません
      </Notice>
    );
  }

  const converted = fromDivision({
    id: division.id,
    name: division.name,
    format: division.format,
    entries: parsed.entries,
    matchingConfig: parsed.matchingConfig,
    results: parsed.results,
    resultConfig,
    // memberId は setup 画面の候補絞り込み用で、ブラケットには要らない。
    // 公開ページではノードのデータがクライアントへ送られるため、
    // 描画に使う項目だけを渡して内部 id が紛れ込まないようにする。
    participants: participants.map(({ id, name, team }) => ({
      id,
      name,
      team,
    })),
    matchNames: resolveMatchNames(
      parsed.matchingConfig,
      division.id,
      overallSeq,
    ),
  });
  if (converted === null) {
    return <Notice>この組み合わせはまだ表示に対応していません</Notice>;
  }

  // resolveBracket / layoutBracket は矛盾したデータで例外を投げる設計。
  // ここも同じくページを落とさず区画で受け止める。
  let elements: ReturnType<typeof toFlowElements>;
  try {
    const resolved = resolveBracket(
      converted.participants,
      converted.bracket,
      converted.results,
    );
    const positions = layoutBracket(resolved);
    elements = toFlowElements(
      resolved,
      positions,
      sectionLabels(resolved, positions),
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
