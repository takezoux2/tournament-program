import Mustache from "mustache";

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
