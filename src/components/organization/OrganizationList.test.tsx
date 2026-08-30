import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OrganizationList } from "./OrganizationList";

describe("OrganizationList", () => {
  it("組織名を /orgs/[slug] へのリンクとして表示する", () => {
    render(
      <OrganizationList
        organizations={[
          { id: "o1", name: "テニス部", slug: "tennis" },
          { id: "o2", name: "卓球部", slug: "table-tennis" },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "テニス部" })).toHaveAttribute(
      "href",
      "/orgs/tennis",
    );
    expect(screen.getByRole("link", { name: "卓球部" })).toHaveAttribute(
      "href",
      "/orgs/table-tennis",
    );
  });

  it("組織が無いときは空であることを伝える", () => {
    render(<OrganizationList organizations={[]} />);

    expect(screen.getByText("まだ組織がありません")).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
