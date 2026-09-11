import Mustache from "mustache";
import { overallSeqKey } from "./overall-order";
import type { MatchingConfig } from "./types";

/**
 * 生成直後の試合名。テンプレートなので、並べ替えて実施順が変わると
 * 表示も自動で追従する。リテラルの連番を振っていたときのように
 * 並べ替えのたびに振り直す必要が無い。
 */
export const DEFAULT_MATCH_NAME = "第{{DivisionSeq}}試合";

/** 試合名のテンプレートに渡せる変数。名前は mustache のキーそのもの。 */
export type MatchNameVars = {
  /** 大会の進行順で何番目の試合か。1 始まり */
  OverallSeq: number;
  /** 部門の中で何番目の試合か。1 始まり */
  DivisionSeq: number;
};

/**
 * 試合名を展開する。構文解析は mustache に委ねるので、空白の許容・
 * 未知の変数（空文字になる）・大文字小文字の区別はすべて mustache の
 * 既定どおりになる。
 *
 * 例外を握ってテンプレートをそのまま返すのは、保存時の構文検査を
 * 通っていない文字列（別経路で書かれた Json など）で一覧全体が
 * 落ちるのを防ぐため。読み出しは常に何かを返す。
 */
export const renderMatchName = (
  template: string,
  vars: MatchNameVars,
): string => {
  try {
    return Mustache.render(template, vars);
  } catch {
    return template;
  }
};

/**
 * 部門の全試合を展開して「試合 id → 表示名」の対照表にする。
 *
 * 通し番号の表が大会全体のキー（部門 id と組）で引くのに対し、
 * 画面は部門 1 つの中で試合 id だけを持って引きたい。その差をここで吸収する。
 * 通し番号を引けない試合（通常は起きない）は OverallSeq を 0 にして、
 * 名前を作れないことより「0 と出る」ほうに倒す。一覧を落とさない。
 */
export const resolveMatchNames = (
  config: MatchingConfig,
  divisionId: string,
  overallSeq: ReadonlyMap<string, number>,
): Map<string, string> =>
  new Map(
    config.matches.map((match) => [
      match.id,
      renderMatchName(match.matchName, {
        OverallSeq: overallSeq.get(overallSeqKey(divisionId, match.id)) ?? 0,
        DivisionSeq: match.sequence + 1,
      }),
    ]),
  );
