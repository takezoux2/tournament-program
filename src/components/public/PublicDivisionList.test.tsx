import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DivisionSummary } from "@/features/division/repository";
import { PublicDivisionList } from "./PublicDivisionList";

const divisions: DivisionSummary[] = [
  { id: "d1", name: "男子シングルス", order: 0, format: "SINGLE_ELIMINATION" },
  { id: "d2", name: "女子シングルス", order: 1, format: "ROUND_ROBIN" },
];

describe("PublicDivisionList", () => {
  it("部門名を公開ブラケットページへのリンクにする", () => {
    render(<PublicDivisionList tournamentId="t1" divisions={divisions} />);

    // 管理画面の /orgs/... ではなく公開側の /t/... を指すことが要点。
    expect(screen.getByRole("link", { name: /男子シングルス/ })).toHaveAttribute(
      "href",
      "/t/t1/divisions/d1",
    );
  });

  it("試合形式を日本語ラベルで出す", () => {
    render(<PublicDivisionList tournamentId="t1" divisions={divisions} />);

    expect(screen.getByText("シングルエリミネーション")).toBeInTheDocument();
    expect(screen.getByText("リーグ（総当たり）")).toBeInTheDocument();
  });

  it("渡された順序のまま並べる", () => {
    render(<PublicDivisionList tournamentId="t1" divisions={divisions} />);

    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveTextContent("男子シングルス");
    expect(links[1]).toHaveTextContent("女子シングルス");
  });

  it("部門が無ければその旨を出す", () => {
    render(<PublicDivisionList tournamentId="t1" divisions={[]} />);

    expect(screen.getByText("まだ部門がありません")).toBeInTheDocument();
  });
});
