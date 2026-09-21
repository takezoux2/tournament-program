import type { DivisionDetail } from "@/features/division/repository";
import {
  parseDivisionEntries,
  parseDivisionResults,
  parseMatchingConfig,
} from "@/lib/division/parse";

export type SetupData = {
  entries: ReturnType<typeof parseDivisionEntries>;
  matchingConfig: ReturnType<typeof parseMatchingConfig>;
  results: ReturnType<typeof parseDivisionResults>;
};

/**
 * setup 画面（DivisionSetup / BracketEditorSetup）が読む entries /
 * matchingConfig / results の Json 3 列をまとめてパースする。
 *
 * Json は DB の列で、アプリの外から壊れた値が入りうる。パースの失敗は
 * ここで受け止め、null を返す。呼び出し側のページ全体は落とさず、
 * Notice を出すだけでよい。
 */
export const parseSetupData = (division: DivisionDetail): SetupData | null => {
  try {
    return {
      entries: parseDivisionEntries(division.entries),
      matchingConfig: parseMatchingConfig(division.matchingConfig),
      results: parseDivisionResults(division.results),
    };
  } catch {
    return null;
  }
};
