import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MembershipSummary } from "@/features/organization/repository";
import { ProfileOrganizationList } from "./ProfileOrganizationList";

const membership = (
  overrides: Partial<MembershipSummary> = {},
): MembershipSummary => ({
  id: "o1",
  name: "テニス部",
  slug: "tennis",
  joinedAt: new Date("2026-08-01T00:00:00Z"),
  permissions: [{ code: "org.edit", description: "組織の編集" }],
  ...overrides,
});

describe("ProfileOrganizationList", () => {
  it("所属が無ければその旨を出す", () => {
    render(<ProfileOrganizationList memberships={[]} />);

    expect(
      screen.getByText("所属している組織はありません"),
    ).toBeInTheDocument();
  });

  it("組織名が組織ページへのリンクになる", () => {
    render(<ProfileOrganizationList memberships={[membership()]} />);

    expect(screen.getByRole("link", { name: "テニス部" })).toHaveAttribute(
      "href",
      "/orgs/tennis",
    );
  });

  it("権限は説明で出す（コードそのものは画面に出さない）", () => {
    render(<ProfileOrganizationList memberships={[membership()]} />);

    expect(screen.getByText("組織の編集")).toBeInTheDocument();
    expect(screen.queryByText("org.edit")).toBeNull();
  });

  it("権限が無い所属は、そうと分かる文言を出す", () => {
    render(
      <ProfileOrganizationList
        memberships={[membership({ permissions: [] })]}
      />,
    );

    expect(screen.getByText("権限はありません")).toBeInTheDocument();
  });

  it("参加日を出す", () => {
    render(<ProfileOrganizationList memberships={[membership()]} />);

    expect(screen.getByText(/2026\/8\/1 参加/)).toBeInTheDocument();
  });
});
