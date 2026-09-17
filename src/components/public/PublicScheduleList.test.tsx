import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ResultRowView } from "@/features/schedule/result-rows";
import { PublicScheduleList } from "./PublicScheduleList";

type MatchRow = Extract<ResultRowView, { kind: "match" }>;

const config = {
  version: 1 as const,
  winReason: { enabled: true, options: ["一本勝ち"] },
  score: { enabled: true, count: 3, aggregation: "sum" as const },
  note: { enabled: true },
};

const rows: ResultRowView[] = [
  {
    kind: "divider",
    key: "divider:s1",
    label: "午前の部",
    startsAt: new Date("2026-09-12T09:00:00+09:00"),
  },
  {
    kind: "match",
    key: "match:d1:m1-0",
    divisionId: "d1",
    divisionName: "男子シングルス",
    matchId: "m1-0",
    matchName: "1",
    label: "1回戦 第1試合",
    slots: [
      { label: "佐藤 蓮", entryId: "e1" },
      { label: "鈴木 陽菜", entryId: "e2" },
    ],
    winnerEntryId: null,
    state: "ready",
    downstreamRecordedCount: 0,
    resultConfig: config,
    winReason: null,
    scores: [],
    note: null,
  },
  {
    kind: "divider",
    key: "divider:s2",
    label: "午後の部",
    startsAt: null,
  },
  {
    kind: "match",
    key: "match:d1:m2-0",
    divisionId: "d1",
    divisionName: "男子シングルス",
    matchId: "m2-0",
    matchName: "2",
    label: "2回戦 第1試合",
    slots: [
      { label: "高橋 葵", entryId: "e3" },
      { label: "第1試合の勝者", entryId: null },
    ],
    winnerEntryId: null,
    state: "waiting",
    downstreamRecordedCount: 0,
    resultConfig: config,
    winReason: null,
    scores: [],
    note: null,
  },
];

const matchRow: MatchRow = {
  kind: "match" as const,
  key: "k1",
  divisionId: "d1",
  divisionName: "男子シングルス",
  matchId: "m1-0",
  matchName: "第1試合",
  label: "1回戦 第1試合",
  slots: [
    { label: "田中", entryId: "e1" },
    { label: "佐藤", entryId: "e2" },
  ],
  winnerEntryId: "e1",
  state: "recorded" as const,
  downstreamRecordedCount: 0,
  resultConfig: config,
  winReason: "一本勝ち",
  scores: [
    { entryId: "e1", values: [7, 7, 7] },
    { entryId: "e2", values: [6, 7, 7] },
  ],
  note: "抗議あり",
};

describe("PublicScheduleList", () => {
  it("区切りの見出しを出す", () => {
    render(<PublicScheduleList rows={rows} />);

    expect(screen.getByText("午前の部")).toBeInTheDocument();
    expect(screen.getByText("午後の部")).toBeInTheDocument();
  });

  it("区切りの開始予定時刻を出す", () => {
    render(<PublicScheduleList rows={rows} />);

    // vitest.config.mts で TZ=Asia/Tokyo に固定してあるため JST で出る。
    expect(screen.getByText(/9:00/)).toBeInTheDocument();
  });

  it("開始予定時刻が未設定の区切りには「未設定」を出さない", () => {
    render(<PublicScheduleList rows={rows} />);

    expect(screen.queryByText("未設定")).not.toBeInTheDocument();
  });

  it("試合名と対戦カードを出す", () => {
    render(<PublicScheduleList rows={rows} />);

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("佐藤 蓮 vs 鈴木 陽菜")).toBeInTheDocument();
  });

  it("部門名とラウンドを出す", () => {
    render(<PublicScheduleList rows={rows} />);

    expect(
      screen.getByText("男子シングルス / 1回戦 第1試合"),
    ).toBeInTheDocument();
  });

  it("渡された順序のまま並べる", () => {
    render(<PublicScheduleList rows={rows} />);

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("午前の部");
    expect(items[1]).toHaveTextContent("佐藤 蓮 vs 鈴木 陽菜");
    expect(items[2]).toHaveTextContent("午後の部");
    expect(items[3]).toHaveTextContent("高橋 葵 vs 第1試合の勝者");
  });

  it("並べ替えや編集の操作を出さない（公開ページのため）", () => {
    render(<PublicScheduleList rows={rows} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("試合が無ければその旨を出す", () => {
    render(<PublicScheduleList rows={[]} />);

    expect(screen.getByText("まだ試合がありません")).toBeInTheDocument();
  });

  it("対戦カードと結果を出す", () => {
    render(<PublicScheduleList rows={[matchRow]} />);

    expect(screen.getByText("田中 vs 佐藤")).toBeInTheDocument();
    expect(screen.getByText(/田中の勝ち/)).toBeInTheDocument();
    expect(screen.getByText(/一本勝ち/)).toBeInTheDocument();
    expect(screen.getByText(/21 - 20/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "男子シングルス 第1試合のメモ" }),
    ).toBeInTheDocument();
  });

  it("未記録の試合には結果を出さない", () => {
    render(
      <PublicScheduleList
        rows={[
          {
            ...matchRow,
            state: "ready",
            winnerEntryId: null,
            winReason: null,
            scores: [],
            note: null,
          },
        ]}
      />,
    );
    expect(screen.queryByText(/の勝ち/)).not.toBeInTheDocument();
  });

  it("引き分けは引き分けと出す", () => {
    render(
      <PublicScheduleList
        rows={[{ ...matchRow, winnerEntryId: null, scores: [], note: null }]}
      />,
    );
    expect(screen.getByText(/引き分け/)).toBeInTheDocument();
  });

  it("区切りの開始予定時刻を出す", () => {
    render(
      <PublicScheduleList
        rows={[
          {
            kind: "divider",
            key: "d1",
            label: "午前の部",
            startsAt: new Date("2026-09-12T09:00:00+09:00"),
          },
        ]}
      />,
    );
    expect(screen.getByText("午前の部")).toBeInTheDocument();
  });

  it("位置の文言が空の試合行（リーグ）は部門名だけを出す", () => {
    render(
      <PublicScheduleList
        rows={[
          {
            ...matchRow,
            key: "match:dL:r1-0",
            divisionId: "dL",
            divisionName: "女子リーグ",
            matchId: "r1-0",
            matchName: "第3試合",
            label: "",
            slots: [
              { label: "高橋", entryId: "e3" },
              { label: "伊藤", entryId: "e4" },
            ],
            winnerEntryId: null,
            state: "ready",
            winReason: null,
            scores: [],
            note: null,
          },
        ]}
      />,
    );

    expect(screen.getByText("女子リーグ")).toBeInTheDocument();
    expect(screen.queryByText(/女子リーグ \//)).toBeNull();
  });
});
