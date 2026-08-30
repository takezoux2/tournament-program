import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
vi.mock("@/features/organization/update/handler", () => ({
  updateOrganizationAction: vi.fn(),
}));
vi.mock("@/features/organization/delete/handler", () => ({
  deleteOrganizationAction: vi.fn(),
}));

const { default: EditOrganizationPage } = await import("./page");

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

describe("EditOrganizationPage", () => {
  beforeEach(() => {
    requireOrganization.mockReset();
    requireOrganization.mockResolvedValue({
      session,
      organization,
      role: "OWNER",
    });
  });

  it("requireOrganization には params の slug をそのまま渡す", async () => {
    await EditOrganizationPage(pageProps("tennis"));

    expect(requireOrganization).toHaveBeenCalledWith("tennis");
  });

  it("requireOrganization が例外を投げたら(非所属時の notFound)ページも失敗する", async () => {
    requireOrganization.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(EditOrganizationPage(pageProps("tennis"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("組織の現在の名前と slug をフォームへ渡して描画する", async () => {
    const element = await EditOrganizationPage(pageProps("tennis"));
    render(element);

    // OrganizationForm 側: defaultName の初期値として入る
    expect(screen.getByLabelText("組織名")).toHaveValue("テニス部");
    // fixedSlug モード: 入力欄ではなくテキストとして表示される
    expect(screen.getByText("tennis")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("組織 ID", { selector: "input" }),
    ).not.toBeInTheDocument();

    // DeleteOrganizationForm 側にも組織名が渡っている
    expect(
      screen.getByRole("button", { name: "この組織を削除する" }),
    ).toBeInTheDocument();
  });

  it("更新フォームと削除フォームで action が入れ替わっていない", async () => {
    // OrganizationFormAction は両方の action で同じ型なので、
    // action props を取り違えても型チェックでは検知できない。
    // 実際に送信して、どちらのモックが呼ばれたかで見分ける。
    const { updateOrganizationAction } = await import(
      "@/features/organization/update/handler"
    );
    const { deleteOrganizationAction } = await import(
      "@/features/organization/delete/handler"
    );
    vi.mocked(updateOrganizationAction).mockClear();
    vi.mocked(deleteOrganizationAction).mockClear();
    vi.mocked(updateOrganizationAction).mockResolvedValue({ error: null });
    vi.mocked(deleteOrganizationAction).mockResolvedValue({ error: null });

    const element = await EditOrganizationPage(pageProps("tennis"));
    const { container } = render(element);
    const forms = container.querySelectorAll("form");

    // OrganizationForm(更新)側のフォームを送信 → update だけが呼ばれる
    fireEvent.submit(forms[0]);
    await waitFor(() => expect(updateOrganizationAction).toHaveBeenCalled());
    expect(deleteOrganizationAction).not.toHaveBeenCalled();

    vi.mocked(updateOrganizationAction).mockClear();

    // DeleteOrganizationForm 側のフォームを送信 → delete だけが呼ばれる
    fireEvent.submit(forms[1]);
    await waitFor(() => expect(deleteOrganizationAction).toHaveBeenCalled());
    expect(updateOrganizationAction).not.toHaveBeenCalled();
  });
});
