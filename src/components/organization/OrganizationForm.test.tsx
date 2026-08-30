import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OrganizationFormState } from "@/features/organization/state";
import { OrganizationForm } from "./OrganizationForm";

const noop = async (): Promise<OrganizationFormState> => ({ error: null });

/** render の container からフォーム要素を取り出す。 */
const formIn = (container: HTMLElement): HTMLFormElement => {
  const form = container.querySelector("form");
  if (!form) throw new Error("form が見つからない");
  return form;
};

describe("OrganizationForm", () => {
  it("fixedSlug が無いときは組織 ID を入力させる", () => {
    render(<OrganizationForm action={noop} submitLabel="作成する" />);

    expect(screen.getByLabelText("組織 ID")).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "作成する" }),
    ).toBeInTheDocument();
  });

  it("fixedSlug があるときは組織 ID を入力させず、値だけ表示する", () => {
    // slug を変えると共有済みリンクが壊れるため、編集画面では変更させない。
    const { container } = render(
      <OrganizationForm
        action={noop}
        submitLabel="保存する"
        defaultName="テニス部"
        fixedSlug="tennis"
      />,
    );

    expect(screen.queryByLabelText("組織 ID")).not.toBeInTheDocument();
    expect(screen.getByText("tennis")).toBeInTheDocument();
    expect(
      container.querySelector('input[type="hidden"][name="slug"]'),
    ).toHaveValue("tennis");
  });

  it("既定値を組織名の入力に入れる", () => {
    render(
      <OrganizationForm
        action={noop}
        submitLabel="保存する"
        defaultName="テニス部"
        fixedSlug="tennis"
      />,
    );

    expect(screen.getByLabelText("組織名")).toHaveValue("テニス部");
  });

  it("送信すると入力値を FormData として action に渡す", async () => {
    const action = vi.fn(
      async (_state: OrganizationFormState, formData: FormData) => {
        expect(formData.get("name")).toBe("卓球部");
        expect(formData.get("slug")).toBe("table-tennis");
        return { error: null };
      },
    );

    const { container } = render(
      <OrganizationForm action={action} submitLabel="作成する" />,
    );

    fireEvent.change(screen.getByLabelText("組織名"), {
      target: { value: "卓球部" },
    });
    fireEvent.change(screen.getByLabelText("組織 ID"), {
      target: { value: "table-tennis" },
    });
    fireEvent.submit(formIn(container));

    await waitFor(() => expect(action).toHaveBeenCalled());
  });

  it("action がエラーを返したらアラートとして表示する", async () => {
    const action = async (): Promise<OrganizationFormState> => ({
      error: "この組織 ID は既に使われています",
    });

    const { container } = render(
      <OrganizationForm action={action} submitLabel="作成する" />,
    );

    fireEvent.submit(formIn(container));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "この組織 ID は既に使われています",
    );
  });
});
