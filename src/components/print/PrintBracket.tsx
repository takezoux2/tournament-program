import {
  NODE_HEIGHT,
  NODE_WIDTH,
  type Position,
  type SectionLabel,
} from "@/features/bracket/layout-bracket";
import {
  bracketViewBox,
  connectorPath,
  expandViewBoxToMinimum,
  MATCH_NAME_HEIGHT,
} from "@/features/bracket/svg-geometry";
import type { ResolvedMatch, ResolvedSlot } from "@/features/bracket/types";

// モノクロ印刷でも読めるよう、色は濃淡だけで分ける
const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#334155";
const DIVIDER = "#cbd5e1";

const SLOT_HEIGHT = NODE_HEIGHT / 2;
const TEXT_INSET = 8;

/**
 * スロットに書く文字。未確定は当日に手書きできるよう空欄にし、
 * 「第3試合の敗者」のような説明があるときだけ淡色で出す。
 */
const slotText = (slot: ResolvedSlot): { text: string; muted: boolean } => {
  switch (slot.state) {
    case "bye":
      return { text: "不戦", muted: true };
    case "pending":
      return { text: slot.pendingLabel ?? "", muted: true };
    case "confirmed":
      return { text: slot.participant?.name ?? "", muted: false };
  }
};

const SlotRow = ({ slot, index }: { slot: ResolvedSlot; index: 0 | 1 }) => {
  const { text, muted } = slotText(slot);
  // 13px の文字をスロットの縦中央に置くためのベースライン
  const baseline = index * SLOT_HEIGHT + SLOT_HEIGHT / 2 + 5;
  return (
    <>
      <text
        x={TEXT_INSET}
        y={baseline}
        fontSize={13}
        fontWeight={slot.isWinner ? 700 : 400}
        fill={muted ? MUTED : INK}
      >
        {text}
      </text>
      {slot.score !== null && (
        <text
          x={NODE_WIDTH - TEXT_INSET}
          y={baseline}
          fontSize={11}
          textAnchor="end"
          fill={INK}
        >
          {slot.score}
        </text>
      )}
    </>
  );
};

const MatchCard = ({
  match,
  position,
}: {
  match: ResolvedMatch;
  position: Position;
}) => {
  // スロットごとのスコアがあれば試合全体のスコアは重複になるので出さない
  // （画面の MatchCard と同じ扱い）
  const hasSlotScore = match.slots.some((slot) => slot.score !== null);
  const summary = [hasSlotScore ? null : match.score, match.winReason]
    .filter((value): value is string => value !== null && value !== "")
    .join(" ");

  return (
    <g data-testid={`print-match-${match.id}`}>
      {/* 試合名・スコアの見出しも、カード本体と同じく入れ子 svg で自分の幅に切る。
          そうしないと試合名が長い参加者名でも欄いっぱいに書けてしまい、
          右のスコアと衝突したり、右端の列で viewBox からはみ出したりする */}
      <svg
        x={position.x}
        y={position.y - MATCH_NAME_HEIGHT}
        width={NODE_WIDTH}
        height={MATCH_NAME_HEIGHT}
        aria-hidden="true"
      >
        {match.matchName !== null && (
          <text x={0} y={MATCH_NAME_HEIGHT - 3} fontSize={10} fill={MUTED}>
            {match.matchName}
          </text>
        )}
        {summary !== "" && (
          <text
            x={NODE_WIDTH}
            y={MATCH_NAME_HEIGHT - 3}
            fontSize={10}
            textAnchor="end"
            fill={INK}
          >
            {summary}
          </text>
        )}
      </svg>
      {/* 入れ子の svg は既定で overflow: hidden なので、長い名前はカードの枠で切れる */}
      {/* 全体を role="img" で 1 枚絵として公開しているので、内側の入れ子 svg は隠す */}
      <svg
        x={position.x}
        y={position.y}
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        aria-hidden="true"
      >
        <rect
          x={0.5}
          y={0.5}
          width={NODE_WIDTH - 1}
          height={NODE_HEIGHT - 1}
          fill="#ffffff"
          stroke={LINE}
        />
        <line
          x1={0}
          y1={SLOT_HEIGHT}
          x2={NODE_WIDTH}
          y2={SLOT_HEIGHT}
          stroke={DIVIDER}
        />
        <SlotRow slot={match.slots[0]} index={0} />
        <SlotRow slot={match.slots[1]} index={1} />
      </svg>
    </g>
  );
};

/**
 * 印刷用のトーナメント表。React Flow は transform・表示範囲外の省略・
 * fitView の待ちが印刷と相性が悪いので、layoutBracket の座標をそのまま
 * 静的な SVG に描く。viewBox で親の箱いっぱいに縮めて 1 ページに収める。
 */
export function PrintBracket({
  matches,
  positions,
  labels,
}: {
  matches: ResolvedMatch[];
  positions: Map<string, Position>;
  labels: SectionLabel[];
}) {
  const box = expandViewBoxToMinimum(
    bracketViewBox(positions.values(), labels),
  );

  const connectors = matches.flatMap((match) =>
    match.sourceMatchIds.flatMap((sourceId, index) => {
      if (sourceId === null) return [];
      const source = positions.get(sourceId);
      const target = positions.get(match.id);
      if (!source || !target) return [];
      return [
        <path
          key={`${sourceId}->${match.id}`}
          data-testid="print-connector"
          d={connectorPath(source, target, index as 0 | 1)}
          fill="none"
          stroke={LINE}
          strokeWidth={1.5}
        />,
      ];
    }),
  );

  return (
    <svg
      role="img"
      aria-label="トーナメント表"
      viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
      preserveAspectRatio="xMidYMin meet"
      className="h-full w-full"
    >
      {connectors}
      {labels.map((label) => (
        <text
          key={label.id}
          x={label.position.x}
          y={label.position.y + 10}
          fontSize={14}
          fontWeight={700}
          fill={INK}
        >
          {label.label}
        </text>
      ))}
      {matches.map((match) => {
        const position = positions.get(match.id);
        return position ? (
          <MatchCard key={match.id} match={match} position={position} />
        ) : null;
      })}
    </svg>
  );
}
