import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// LogoutButton は authClient / useRouter に依存するクライアントコンポーネントで、
// テスト環境ではルーターが無く描画できないためモジュールごと差し替える。
vi.mock("@/components/auth/LogoutButton", () => ({
  LogoutButton: () => <button type="button">ログアウト</button>,
}));

const requireSession = vi.fn();
const findLinkedAccounts = vi.fn();

vi.mock("@/shared/middleware/require-session", () => ({
  requireSession: () => requireSession(),
}));

vi.mock("@/features/user/repository", () => ({
  findLinkedAccounts: (userId: string) => findLinkedAccounts(userId),
}));

// handler.ts は auth モジュール経由で prisma を読み込み、DATABASE_URL 未設定の
// テスト環境では import するだけで例外になる（orgs の edit ページと同じ事情）。
// ページのテストでは渡し方だけを見たいので実体には触れずダミーへ差し替える。
vi.mock("@/features/user/update-name/handler", () => ({
  updateNameAction: vi.fn(),
}));

vi.mock("@/features/user/change-password/handler", () => ({
  changePasswordAction: vi.fn(),
}));

vi.mock("@/features/user/change-email/handler", () => ({
  changeEmailAction: vi.fn(),
}));

vi.mock("@/features/user/set-password/handler", () => ({
  setPasswordAction: vi.fn(),
}));

vi.mock("@/features/user/link-google/handler", () => ({
  linkGoogleAction: vi.fn(),
}));

vi.mock("@/features/user/unlink-account/handler", () => ({
  unlinkGoogleAction: vi.fn(),
}));

const { default: ProfilePage } = await import("./page");

describe("ProfilePage", () => {
  beforeEach(() => {
    requireSession.mockReset();
    findLinkedAccounts.mockReset();
    requireSession.mockResolvedValue({
      user: { id: "u1", name: "竹添太郎", email: "taro@example.test" },
    });
    findLinkedAccounts.mockResolvedValue({ hasPassword: true, google: null });
  });

  it("セッションのユーザーの連携状態だけを読む", async () => {
    render(await ProfilePage());

    expect(findLinkedAccounts).toHaveBeenCalledWith("u1");
  });

  it("現在の表示名がフォームの初期値に入る", async () => {
    render(await ProfilePage());

    expect(screen.getByLabelText("表示名")).toHaveValue("竹添太郎");
  });

  it("見出しが出る", async () => {
    render(await ProfilePage());

    expect(
      screen.getByRole("heading", { name: "プロフィール", level: 1 }),
    ).toBeInTheDocument();
  });

  it("パスワード設定済みなら変更フォームを出す", async () => {
    findLinkedAccounts.mockResolvedValue({ hasPassword: true, google: null });

    render(await ProfilePage());

    expect(screen.getByLabelText("現在のパスワード")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "パスワードの変更", level: 2 }),
    ).toBeInTheDocument();
  });

  it("パスワード未設定なら設定フォームを出す", async () => {
    findLinkedAccounts.mockResolvedValue({
      hasPassword: false,
      google: { accountId: "a2", linkedAt: new Date("2026-09-02T00:00:00Z") },
    });

    render(await ProfilePage());

    expect(screen.queryByLabelText("現在のパスワード")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "パスワードの設定", level: 2 }),
    ).toBeInTheDocument();
  });

  it("現在のメールアドレスが出る", async () => {
    render(await ProfilePage());

    expect(screen.getByText("taro@example.test")).toBeInTheDocument();
  });

  it("Google 未連携なら連携ボタンを出す", async () => {
    render(await ProfilePage());

    expect(
      screen.getByRole("button", { name: "Google と連携する" }),
    ).toBeInTheDocument();
  });

  it("Google 連携済みなら解除ボタンを出す", async () => {
    findLinkedAccounts.mockResolvedValue({
      hasPassword: true,
      google: { accountId: "a2", linkedAt: new Date("2026-09-02T00:00:00Z") },
    });

    render(await ProfilePage());

    expect(
      screen.getByRole("button", { name: "連携を解除" }),
    ).toBeInTheDocument();
  });
});
