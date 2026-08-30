import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OrganizationFormState } from "@/features/organization/state";
import { DeleteOrganizationForm } from "./DeleteOrganizationForm";

const noop = async (): Promise<OrganizationFormState> => ({ error: null });

const formIn = (container: HTMLElement): HTMLFormElement => {
  const form = container.querySelector("form");
  if (!form) throw new Error("form が見つからない");
  return form;
};

describe("DeleteOrganizationForm", () => {
  it("削除で何が消えるかを明示する", () => {
    render(
      <DeleteOrganizationForm
        action={noop}
        organizationName="テニス部"
        slug="tennis"
      />,
    );

    expect(
      screen.getByText(/大会とメンバーもすべて削除されます/),
    ).toBeInTheDocument();
  });

  it("組織名が一致するまで削除ボタンを押せない", () => {
    render(
      <DeleteOrganizationForm
        action={noop}
        organizationName="テニス部"
        slug="tennis"
      />,
    );

    const button = screen.getByRole("button", { name: "この組織を削除する" });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText("確認のため組織名を入力"), {
      target: { value: "テニス" },
    });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText("確認のため組織名を入力"), {
      target: { value: "テニス部" },
    });
    expect(button).toBeEnabled();
  });

  it("末尾に空白が付いた入力は一致とみなさずボタンを押せない", () => {
    // 判定はクライアント側の厳密な文字列比較で、trim はしない。
    // 見た目上は一致して見える入力でボタンが活性化しないことを確認する。
    render(
      <DeleteOrganizationForm
        action={noop}
        organizationName="テニス部"
        slug="tennis"
      />,
    );

    fireEvent.change(screen.getByLabelText("確認のため組織名を入力"), {
      target: { value: "テニス部 " },
    });

    expect(
      screen.getByRole("button", { name: "この組織を削除する" }),
    ).toBeDisabled();
  });

  it("送信すると slug と入力値を action に渡す", async () => {
    const action = vi.fn(
      async (_state: OrganizationFormState, formData: FormData) => {
        expect(formData.get("slug")).toBe("tennis");
        expect(formData.get("confirmName")).toBe("テニス部");
        return { error: null };
      },
    );

    const { container } = render(
      <DeleteOrganizationForm
        action={action}
        organizationName="テニス部"
        slug="tennis"
      />,
    );

    fireEvent.change(screen.getByLabelText("確認のため組織名を入力"), {
      target: { value: "テニス部" },
    });
    fireEvent.submit(formIn(container));

    await waitFor(() => expect(action).toHaveBeenCalled());
  });

  it("action がエラーを返したらアラートとして表示する", async () => {
    const action = async (): Promise<OrganizationFormState> => ({
      error: "組織名が一致しません",
    });

    const { container } = render(
      <DeleteOrganizationForm
        action={action}
        organizationName="テニス部"
        slug="tennis"
      />,
    );

    fireEvent.submit(formIn(container));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "組織名が一致しません",
    );
  });
});
