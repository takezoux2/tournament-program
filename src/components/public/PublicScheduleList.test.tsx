import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ScheduleRowView } from "@/features/schedule/types";
import { PublicScheduleList } from "./PublicScheduleList";

const rows: ScheduleRowView[] = [
  {
    kind: "divider",
    key: "divider:s1",
    id: "s1",
    label: "午前の部",
    startsAt: new Date("2026-09-12T09:00:00+09:00"),
    startsAtInput: "2026-09-12T09:00",
  },
  {
    kind: "match",
    key: "match:d1:m1-0",
    divisionId: "d1",
    divisionName: "男子シングルス",
    matchId: "m1-0",
    matchName: "1",
    label: "1回戦 第1試合",
    card: "佐藤 蓮 vs 鈴木 陽菜",
  },
  {
    kind: "divider",
    key: "divider:s2",
    id: "s2",
    label: "午後の部",
    startsAt: null,
    startsAtInput: "",
  },
  {
    kind: "match",
    key: "match:d1:m2-0",
    divisionId: "d1",
    divisionName: "男子シングルス",
    matchId: "m2-0",
    matchName: "2",
    label: "2回戦 第1試合",
    card: "高橋 葵 vs 第1試合の勝者",
  },
];

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

    expect(screen.getByText("第1試合")).toBeInTheDocument();
    expect(screen.getByText("佐藤 蓮 vs 鈴木 陽菜")).toBeInTheDocument();
  });

  it("部門名とラウンドを出す", () => {
    render(<PublicScheduleList rows={rows} />);

    expect(screen.getByText("男子シングルス / 1回戦 第1試合")).toBeInTheDocument();
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
});
