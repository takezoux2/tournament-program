import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  OrganizationUserSummary,
  PermissionSummary,
} from "@/features/organization-user/repository";
import { PermissionEditForm } from "./PermissionEditForm";

const action = vi.fn(async () => ({ error: null }));

const permissions: PermissionSummary[] = [
  { id: 1, code: "user.view", description: "組織ユーザーの閲覧" },
  { id: 2, code: "user.grant", description: "組織ユーザーへの権限付与・剥奪" },
  { id: 3, code: "org.delete", description: "組織の削除" },
];

const user: OrganizationUserSummary = {
  userId: "u2",
  name: "山田",
  username: "yamada",
  email: "yamada@example.com",
  image: null,
  permissionCodes: ["user.view"],
  joinedAt: new Date("2026-08-01T00:00:00Z"),
};

const renderForm = (
  overrides: Partial<Parameters<typeof PermissionEditForm>[0]> = {},
) =>
  render(
    <PermissionEditForm
      slug="tennis"
      user={user}
      permissions={permissions}
      isSelf={false}
      action={action}
      {...overrides}
    />,
  );

describe("PermissionEditForm", () => {
  it("権限マスタの全件をチェックボックスで出す", () => {
    renderForm();

    expect(screen.getByLabelText(/組織ユーザーの閲覧/)).toBeInTheDocument();
    expect(screen.getByLabelText(/組織の削除/)).toBeInTheDocument();
  });

  it("保有している権限だけ初期チェックが入る", () => {
    renderForm();

    expect(screen.getByLabelText(/組織ユーザーの閲覧/)).toBeChecked();
    expect(screen.getByLabelText(/組織の削除/)).not.toBeChecked();
  });

  it("権限コードも併記する", () => {
    renderForm();

    expect(screen.getByLabelText(/user\.view/)).toBeInTheDocument();
  });

  it("自分自身の user.grant は外せないよう無効化する", () => {
    // 最後の user.grant 保持者が自分を降格すると、誰も権限を戻せなくなる。
    renderForm({
      isSelf: true,
      user: { ...user, permissionCodes: ["user.view", "user.grant"] },
    });

    const grant = screen.getByLabelText(/組織ユーザーへの権限付与・剥奪/);
    expect(grant).toBeChecked();
    expect(grant).toBeDisabled();
  });

  it("他人の user.grant は無効化しない", () => {
    renderForm({
      user: { ...user, permissionCodes: ["user.grant"] },
    });

    expect(
      screen.getByLabelText(/組織ユーザーへの権限付与・剥奪/),
    ).not.toBeDisabled();
  });

  it("自分自身の user.view も外せないよう無効化する", () => {
    // 外すと戻り先の /orgs/[slug]/users が 404 になり、URL を打ち直すしかなくなる。
    renderForm({
      isSelf: true,
      user: { ...user, permissionCodes: ["user.view", "user.grant"] },
    });

    const view = screen.getByLabelText(/組織ユーザーの閲覧/);
    expect(view).toBeChecked();
    expect(view).toBeDisabled();
  });

  it("ロック対象でない権限は自分自身でも外せる", () => {
    renderForm({
      isSelf: true,
      user: {
        ...user,
        permissionCodes: ["user.view", "user.grant", "org.delete"],
      },
    });

    expect(screen.getByLabelText(/組織の削除/)).not.toBeDisabled();
  });

  it("元々持っていない権限は自分自身でも無効化しない", () => {
    renderForm({
      isSelf: true,
      user: { ...user, permissionCodes: ["user.grant"] },
    });

    expect(screen.getByLabelText(/組織ユーザーの閲覧/)).not.toBeDisabled();
  });

  it("他人の user.view は無効化しない", () => {
    renderForm({ user: { ...user, permissionCodes: ["user.view"] } });

    expect(screen.getByLabelText(/組織ユーザーの閲覧/)).not.toBeDisabled();
  });

  it("自分自身のときはロック対象を hidden でも送る（disabled は送信されないため）", () => {
    const { container } = renderForm({
      isSelf: true,
      user: { ...user, permissionCodes: ["user.view", "user.grant"] },
    });

    for (const code of ["user.grant", "user.view"]) {
      expect(
        container.querySelector(
          `input[type="hidden"][name="permissionCode"][value="${code}"]`,
        ),
      ).not.toBeNull();
    }
  });

  it("元々持っていない権限は hidden でも送らない", () => {
    const { container } = renderForm({
      isSelf: true,
      user: { ...user, permissionCodes: ["user.grant"] },
    });

    expect(
      container.querySelector(
        'input[type="hidden"][name="permissionCode"][value="user.view"]',
      ),
    ).toBeNull();
  });

  it("対象ユーザーの名前を出す", () => {
    renderForm();

    expect(screen.getByText("山田")).toBeInTheDocument();
  });
});
