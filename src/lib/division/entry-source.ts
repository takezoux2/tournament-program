import type { DivisionFormat } from "@/generated/prisma/enums";
import { matchPositionLabel } from "./label";
import { type ResolvedMatch, resolveMatchSlots } from "./resolve";
import { type LeagueRankRow, leagueRankOrder } from "./standings";
import type {
  BracketMatch,
  DivisionEntries,
  DivisionResults,
  EntrySource,
  MatchingConfig,
} from "./types";

/**
 * 解決に使う 1 部門ぶんのスナップショット。DB は触らず、渡された値だけで決まる。
 * 同じ大会の全部門を配列で渡すこと（参照は大会の中だけで閉じる）。
 */
export type EntrySourceDivision = {
  id: string;
  name: string;
  format: DivisionFormat;
  entries: DivisionEntries;
  matchingConfig: MatchingConfig;
  results: DivisionResults;
  /** 展開済みの試合名（試合 id → 表示名）。無ければ部門内の位置で代用する */
  matchNames?: ReadonlyMap<string, string>;
};

/**
 * 参照エントリー 1 件の解決結果。resolved 以外は「まだ誰でもない」。
 * label はそのまま画面に出す文字列で、状態によらず「この枠が何か」を表す。
 */
export type ResolvedEntry =
  | { state: "resolved"; participantId: string; label: string }
  | { state: "pending"; label: string }
  | { state: "ambiguous"; label: string; reason: "tie" | "cycle" }
  | { state: "broken"; label: string };

/** 参照先の部門・試合が消えている枠の表示。 */
export const BROKEN_SOURCE_LABEL = "（参照先が見つかりません）";

// 文言は label.ts と揃える
const UNKNOWN_PARTICIPANT_LABEL = "（不明な参加者）";

/**
 * 参照先の試合を指す文字列。展開済みの試合名 → 位置（「1回戦 (1)」）→
 * 位置を持たないリーグだけテンプレートそのまま、の順で決める。
 *
 * 仮名（この下の sourceLabel）と、スロット編集の選択肢
 * （features/division/slot-source-options.ts）が同じ文字列を出す必要がある。
 * 規則が 2 箇所に分かれると片方だけ直して食い違うため、ここに 1 つだけ置く。
 */
export const matchSourceName = (
  match: BracketMatch,
  format: DivisionFormat,
  matchNames?: ReadonlyMap<string, string>,
): string => {
  const position = matchPositionLabel(match, format);
  // 展開済みの試合名が空文字で入っていることがある（未設定と区別しない
  // 保存経路がある）。?? は空文字を「値あり」とみなすので、ここで弾く。
  const rawMatchName = matchNames?.get(match.id);
  return (
    (rawMatchName === "" ? undefined : rawMatchName) ??
    (position === "" ? match.matchName : position)
  );
};

/**
 * 仮名。画面・公開・印刷・結果入力が同じ文字列を出すよう、ここだけが作る。
 *
 * 試合名は展開済みのもの（{{OverallSeq}} 入り）を最優先する。展開済みが
 * 無ければ、部門内の位置（「1回戦 (1)」）を使う。match.matchName は生成直後
 * だと `第{{OverallSeq}}試合` のような未展開のテンプレートそのものなので、
 * これをそのまま仮名に使うと `{{OverallSeq}}` が画面・印刷・公開ページに
 * 出てしまう。位置が無いリーグ（matchPositionLabel が空文字を返す）だけは、
 * 最後の手段として match.matchName をそのまま出す。
 */
const sourceLabel = (
  source: EntrySource,
  target: EntrySourceDivision,
): string => {
  if (source.kind === "leagueRank") {
    return `${target.name} ${source.rank}位`;
  }
  const match = target.matchingConfig.matches.find(
    (item) => item.id === source.matchId,
  );
  if (match === undefined) {
    return BROKEN_SOURCE_LABEL;
  }
  const name = matchSourceName(match, target.format, target.matchNames);
  return `${target.name} ${name}の${
    source.kind === "matchWinner" ? "勝者" : "敗者"
  }`;
};

/**
 * 参照エントリーを実在の参加者まで辿る。
 *
 * 部門をまたぐ参照はこの関数の中で再帰する（予選 → 中間 → 決勝）。訪問中の
 * エントリーへ戻ってきたら循環として打ち切る。読み出しで止まらないことが
 * 第一で、循環しているデータそのものは保存を拒否しない（警告だけ出す）。
 */
export const resolveEntrySources = (
  divisions: EntrySourceDivision[],
): Map<string, Map<string, ResolvedEntry>> => {
  const divisionById = new Map(
    divisions.map((division) => [division.id, division]),
  );
  // 部門ごとに 1 度だけ作って使い回す。エントリーごとに作り直すと
  // 試合数に対して二乗に近い計算量になる。
  const matchResolutions = new Map<string, Map<string, ResolvedMatch>>();
  const leagueRanks = new Map<string, LeagueRankRow[]>();
  const memo = new Map<string, ResolvedEntry>();
  const visiting = new Set<string>();

  const cacheKey = (divisionId: string, entryId: string): string =>
    `${divisionId}:${entryId}`;

  const matchResolution = (
    target: EntrySourceDivision,
  ): Map<string, ResolvedMatch> => {
    const cached = matchResolutions.get(target.id);
    if (cached !== undefined) {
      return cached;
    }
    const resolved = resolveMatchSlots(target.matchingConfig, target.results);
    matchResolutions.set(target.id, resolved);
    return resolved;
  };

  const leagueRank = (target: EntrySourceDivision): LeagueRankRow[] => {
    const cached = leagueRanks.get(target.id);
    if (cached !== undefined) {
      return cached;
    }
    const rows = leagueRankOrder(
      target.matchingConfig,
      target.entries,
      target.results,
    );
    leagueRanks.set(target.id, rows);
    return rows;
  };

  /**
   * リーグの順位は全試合が終わるまで暫定。途中の順位で確定させると、
   * 残りの試合でひっくり返ったときに決勝の組み合わせが黙って変わる。
   */
  const leagueFinished = (target: EntrySourceDivision): boolean => {
    const recorded = new Set(
      target.results.matches.map((record) => record.matchId),
    );
    return target.matchingConfig.matches.every((match) =>
      recorded.has(match.id),
    );
  };

  /**
   * 辿り着いた先のエントリーを participantId まで開く。先が参照エントリー
   * ならさらに再帰する。label は呼び出し元の枠の仮名で、先が未確定でも
   * 「この枠が何か」の説明は変えない。
   */
  const followEntry = (
    target: EntrySourceDivision,
    entryId: string,
    label: string,
  ): ResolvedEntry => {
    const entry = target.entries.entries.find((item) => item.id === entryId);
    if (entry === undefined) {
      return { state: "broken", label };
    }
    if (entry.source === undefined) {
      return entry.participantId === undefined
        ? { state: "broken", label }
        : { state: "resolved", participantId: entry.participantId, label };
    }
    const inner = resolveSourceEntry(target, entry.id, entry.source);
    switch (inner.state) {
      case "resolved":
        return {
          state: "resolved",
          participantId: inner.participantId,
          label,
        };
      case "ambiguous":
        return { state: "ambiguous", label, reason: inner.reason };
      case "pending":
        return { state: "pending", label };
      case "broken":
        return { state: "broken", label };
    }
  };

  const computeSourceEntry = (source: EntrySource): ResolvedEntry => {
    const target = divisionById.get(source.divisionId);
    if (target === undefined) {
      // 参照先の部門が削除された、または大会をまたぐ壊れた参照
      return { state: "broken", label: BROKEN_SOURCE_LABEL };
    }
    const label = sourceLabel(source, target);

    if (source.kind === "leagueRank") {
      // /edit で形式を書き換えた部門。順位という概念が無い
      if (target.format !== "ROUND_ROBIN") {
        return { state: "broken", label };
      }
      if (
        target.matchingConfig.matches.length === 0 ||
        !leagueFinished(target)
      ) {
        return { state: "pending", label };
      }
      const rows = leagueRank(target);
      if (source.rank > rows.length) {
        // rank は parse で 1 以上を保証済み。ここでの範囲外は
        // 「エントリー数より大きい順位を指している」の一択なので broken。
        return { state: "broken", label };
      }
      const hits = rows.filter((row) => row.rank === source.rank);
      if (hits.length !== 1) {
        // rankStandings は同順位のとき番号を飛ばす（1, 1, 3）。飛ばされた
        // 順位（この例の 2 位）は範囲内だが 1 人に絞れない。部門も順位も
        // 実在するので broken ではなく、同順位で絞れない未確定として扱う。
        return { state: "ambiguous", label, reason: "tie" };
      }
      return followEntry(target, hits[0].entryId, label);
    }

    const resolved = matchResolution(target).get(source.matchId);
    if (resolved === undefined) {
      return { state: "broken", label };
    }
    if (source.kind === "matchWinner") {
      // 両スロットが BYE の試合には勝ち上がる人が居ない。resolveMatchSlots は
      // こうした上流の試合を「空き枠」として扱う（resolve.ts の winnerOf の
      // 分岐と同じ考え）。ここで pending のままにすると永久に埋まらないので
      // broken にする。
      if (resolved.slots.every((slot) => slot.state === "bye")) {
        return { state: "broken", label };
      }
      return resolved.winnerEntryId === null
        ? { state: "pending", label }
        : followEntry(target, resolved.winnerEntryId, label);
    }
    // 敗者。BYE を含む試合は不戦勝なので敗者が生まれない
    if (resolved.slots.some((slot) => slot.state === "bye")) {
      return { state: "broken", label };
    }
    if (resolved.winnerEntryId === null) {
      return { state: "pending", label };
    }
    const loser = resolved.slots.find(
      (slot) =>
        slot.state === "entry" && slot.entryId !== resolved.winnerEntryId,
    );
    return loser === undefined || loser.state !== "entry"
      ? { state: "pending", label }
      : followEntry(target, loser.entryId, label);
  };

  const resolveSourceEntry = (
    division: EntrySourceDivision,
    entryId: string,
    source: EntrySource,
  ): ResolvedEntry => {
    const key = cacheKey(division.id, entryId);
    const cached = memo.get(key);
    if (cached !== undefined) {
      return cached;
    }
    if (visiting.has(key)) {
      // 自分へ戻ってきた。label は呼び出し元が自分の仮名で上書きする
      return {
        state: "ambiguous",
        label: BROKEN_SOURCE_LABEL,
        reason: "cycle",
      };
    }
    visiting.add(key);
    const result = computeSourceEntry(source);
    visiting.delete(key);
    memo.set(key, result);
    return result;
  };

  const byDivision = new Map<string, Map<string, ResolvedEntry>>();
  for (const division of divisions) {
    const resolved = new Map<string, ResolvedEntry>();
    for (const entry of division.entries.entries) {
      // 参加者エントリーは解決するものが無いので表に載せない。
      // 呼び出し側は「表に無い entryId は従来どおり参加者から名前を引く」で済む。
      if (entry.source === undefined) {
        continue;
      }
      resolved.set(
        entry.id,
        resolveSourceEntry(division, entry.id, entry.source),
      );
    }
    byDivision.set(division.id, resolved);
  }
  return byDivision;
};

/**
 * 画面に出す名前の表（entryId → 名前）。参照エントリーだけを含む。
 * 解決済みなら実選手の名前、未確定なら仮名。描画側はこの 1 つを受け取れば
 * 状態を意識せず描ける。
 */
export const entrySourceLabels = (
  resolved: ReadonlyMap<string, ResolvedEntry>,
  participantNameById: ReadonlyMap<string, string>,
): Map<string, string> =>
  new Map(
    [...resolved].map(([entryId, entry]) => [
      entryId,
      entry.state === "resolved"
        ? (participantNameById.get(entry.participantId) ?? entry.label)
        : entry.label,
    ]),
  );

/** まだ誰でもない枠の entryId。結果入力を伏せるのに使う。 */
export const unresolvedEntryIds = (
  resolved: ReadonlyMap<string, ResolvedEntry>,
): Set<string> =>
  new Set(
    [...resolved]
      .filter(([, entry]) => entry.state !== "resolved")
      .map(([entryId]) => entryId),
  );

/**
 * 運営に見せる注意書き。保存は止めない方針なので、おかしな状態はここで
 * 文言にして画面へ出す（仕様書「警告」節）。
 */
export const entrySourceWarnings = (
  entries: DivisionEntries,
  resolved: ReadonlyMap<string, ResolvedEntry>,
  participantNameById: ReadonlyMap<string, string>,
): string[] => {
  const warnings: string[] = [];
  let hasCycle = false;
  let hasBroken = false;

  for (const entry of entries.entries) {
    const item = resolved.get(entry.id);
    if (item === undefined) {
      continue;
    }
    if (item.state === "ambiguous") {
      if (item.reason === "cycle") {
        hasCycle = true;
      } else {
        warnings.push(`${item.label} は同順位のため決まりません`);
      }
    }
    if (item.state === "broken") {
      hasBroken = true;
    }
  }
  // 循環と参照切れは何件あっても原因は 1 つなので 1 行にまとめる
  if (hasCycle) {
    warnings.push("参照が循環しているため、選手が決まりません");
  }
  if (hasBroken) {
    warnings.push("参照先が見つからない枠があります");
  }

  // 別々の参照が同じ人を指すことも、参照と直接エントリーが重なることもある。
  // データは書けてしまうので、気づけるように名前で知らせる。
  const counts = new Map<string, number>();
  for (const entry of entries.entries) {
    const item = resolved.get(entry.id);
    const participantId =
      item === undefined
        ? entry.participantId
        : item.state === "resolved"
          ? item.participantId
          : undefined;
    if (participantId === undefined) {
      continue;
    }
    counts.set(participantId, (counts.get(participantId) ?? 0) + 1);
  }
  for (const [participantId, count] of counts) {
    if (count > 1) {
      const name =
        participantNameById.get(participantId) ?? UNKNOWN_PARTICIPANT_LABEL;
      warnings.push(`${name} が ${count} つの枠に入っています`);
    }
  }

  return warnings;
};
