import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FoundUser } from "@/features/organization-user/state";
import { AddUserForm } from "./AddUserForm";

const searchAction = vi.fn();
const addAction = vi.fn(async () => ({ error: null }));

const found: FoundUser = {
  id: "u2",
  name: "山田",
  username: "yamada",
  email: "yamada@example.com",
  image: null,
  alreadyMember: false,
};

const renderForm = () =>
  render(
    <AddUserForm
      slug="tennis"
      searchAction={searchAction}
      addAction={addAction}
    />,
  );

describe("AddUserForm", () => {
  beforeEach(() => {
    searchAction.mockReset();
    addAction.mockClear();
    searchAction.mockImplementation(async () => ({
      error: null,
      user: found,
    }));
  });

  it("検索前は確認欄を出さない", () => {
    renderForm();

    expect(screen.queryByRole("button", { name: "追加" })).toBeNull();
  });

  it("検索するとアイコン・表示名・ユーザー名を出して確認させる", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(
      screen.getByLabelText("ユーザー名またはメールアドレス"),
      "yamada",
    );
    await user.click(screen.getByRole("button", { name: "検索" }));

    expect(await screen.findByText("山田")).toBeInTheDocument();
    expect(screen.getByText("yamada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "追加" })).toBeInTheDocument();
  });

  it("既に所属しているユーザーには追加ボタンを出さない", async () => {
    searchAction.mockImplementation(async () => ({
      error: null,
      user: { ...found, alreadyMember: true },
    }));
    const user = userEvent.setup();
    renderForm();

    await user.type(
      screen.getByLabelText("ユーザー名またはメールアドレス"),
      "yamada",
    );
    await user.click(screen.getByRole("button", { name: "検索" }));

    expect(await screen.findByText("既に所属しています")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "追加" })).toBeNull();
  });

  it("検索が失敗したら文言を出す", async () => {
    searchAction.mockImplementation(async () => ({
      error: "該当するユーザーが見つかりません",
      user: null,
    }));
    const user = userEvent.setup();
    renderForm();

    await user.type(
      screen.getByLabelText("ユーザー名またはメールアドレス"),
      "nobody",
    );
    await user.click(screen.getByRole("button", { name: "検索" }));

    expect(
      await screen.findByText("該当するユーザーが見つかりません"),
    ).toBeInTheDocument();
  });
});
