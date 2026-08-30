import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// LogoutButton は authClient / useRouter に依存するクライアントコンポーネントで、
// ページ本体の検証に集中したいので他のページテストと同じ方針で差し替える。
vi.mock("@/components/auth/LogoutButton", () => ({
  LogoutButton: () => <button type="button">ログアウト</button>,
}));

const requireOrganization = vi.fn();

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => requireOrganization(slug),
}));

// handler.ts は repository 経由で prisma モジュールを読み込み、
// DATABASE_URL 未設定のテスト環境では import するだけで例外になる。
// ページのテストでは Server Action の中身ではなく、渡し方だけを見たいので
// 実体には触れずダミーへ差し替える。
vi.mock("@/features/tournament/create/handler", () => ({
  createTournamentAction: vi.fn(),
}));

const { default: Page } = await import("./page");

const pageProps = (slug: string) => ({
  params: Promise.resolve({ slug }),
  searchParams: Promise.resolve({}),
});

const session = { user: { id: "u1", name: "竹添" } };
const organization = {
  id: "o1",
  name: "テニス部",
  slug: "tennis",
  createdAt: new Date("2026-08-01T00:00:00Z"),
  updatedAt: new Date("2026-08-01T00:00:00Z"),
};

describe("NewTournamentPage", () => {
  beforeEach(() => {
    requireOrganization.mockReset();
    requireOrganization.mockResolvedValue({
      session,
      organization,
      role: "OWNER",
    });
  });

  it("requireOrganization には params の slug をそのまま渡す", async () => {
    await Page(pageProps("tennis"));

    expect(requireOrganization).toHaveBeenCalledWith("tennis");
  });

  it("requireOrganization が例外を投げたら(非所属時の notFound)ページも失敗し、何も描画されない", async () => {
    requireOrganization.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(Page(pageProps("tennis"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("slug がフォームの hidden フィールドまで届く", async () => {
    const element = await Page(pageProps("tennis"));
    const { container } = render(element);

    expect(
      container.querySelector('input[type="hidden"][name="slug"]'),
    ).toHaveValue("tennis");
    expect(screen.getByLabelText("大会名")).toBeInTheDocument();
  });
});
