import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TournamentFormState } from "@/features/tournament/state";
import { TournamentForm } from "./TournamentForm";

const noop = async (): Promise<TournamentFormState> => ({ error: null });

const formIn = (container: HTMLElement): HTMLFormElement => {
  const form = container.querySelector("form");
  if (!form) throw new Error("form が見つからない");
  return form;
};

describe("TournamentForm", () => {
  it("slug を hidden で送る", () => {
    const { container } = render(
      <TournamentForm action={noop} slug="tennis" submitLabel="作成する" />,
    );

    expect(
      container.querySelector('input[type="hidden"][name="slug"]'),
    ).toHaveValue("tennis");
  });

  it("tournamentId を渡したときだけ hidden で送る", () => {
    const { container, rerender } = render(
      <TournamentForm action={noop} slug="tennis" submitLabel="作成する" />,
    );
    expect(
      container.querySelector('input[type="hidden"][name="tournamentId"]'),
    ).toBeNull();

    rerender(
      <TournamentForm
        action={noop}
        slug="tennis"
        submitLabel="保存する"
        tournamentId="t1"
      />,
    );
    expect(
      container.querySelector('input[type="hidden"][name="tournamentId"]'),
    ).toHaveValue("t1");
  });

  it("既定値を各入力に入れる", () => {
    render(
      <TournamentForm
        action={noop}
        slug="tennis"
        submitLabel="保存する"
        defaultName="春季大会"
        defaultStartsAt="2026-08-29T10:05"
      />,
    );

    expect(screen.getByLabelText("大会名")).toHaveValue("春季大会");
    expect(screen.getByLabelText("開始日時")).toHaveValue("2026-08-29T10:05");
  });

  it("送信すると入力値を FormData として action に渡す", async () => {
    const action = vi.fn(
      async (_state: TournamentFormState, formData: FormData) => {
        expect(formData.get("slug")).toBe("tennis");
        expect(formData.get("name")).toBe("秋季大会");
        expect(formData.get("startsAt")).toBe("2026-10-01T09:00");
        return { error: null };
      },
    );

    const { container } = render(
      <TournamentForm action={action} slug="tennis" submitLabel="作成する" />,
    );

    fireEvent.change(screen.getByLabelText("大会名"), {
      target: { value: "秋季大会" },
    });
    fireEvent.change(screen.getByLabelText("開始日時"), {
      target: { value: "2026-10-01T09:00" },
    });
    fireEvent.submit(formIn(container));

    await waitFor(() => expect(action).toHaveBeenCalled());
  });

  it("action がエラーを返したらアラートとして表示する", async () => {
    const action = async (): Promise<TournamentFormState> => ({
      error: "大会名を入力してください",
    });

    const { container } = render(
      <TournamentForm action={action} slug="tennis" submitLabel="作成する" />,
    );

    fireEvent.submit(formIn(container));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "大会名を入力してください",
    );
  });

  it("既定の概要を textarea に入れる", () => {
    render(
      <TournamentForm
        action={noop}
        slug="tennis"
        submitLabel="保存する"
        defaultDescription="# 概要"
      />,
    );

    expect(screen.getByLabelText("大会概要")).toHaveValue("# 概要");
  });

  it("送信すると概要を FormData として action に渡す", async () => {
    const action = vi.fn(
      async (_state: TournamentFormState, formData: FormData) => {
        expect(formData.get("description")).toBe("## ルール");
        return { error: null };
      },
    );

    const { container } = render(
      <TournamentForm action={action} slug="tennis" submitLabel="作成する" />,
    );

    fireEvent.change(screen.getByLabelText("大会概要"), {
      target: { value: "## ルール" },
    });
    fireEvent.submit(formIn(container));

    await waitFor(() => expect(action).toHaveBeenCalled());
  });

  it("プレビュータブで入力中の Markdown をレンダリングする", () => {
    render(
      <TournamentForm
        action={noop}
        slug="tennis"
        submitLabel="作成する"
        defaultDescription="# 大会について"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "プレビュー" }));

    expect(
      screen.getByRole("heading", { name: "大会について" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "編集" }));

    expect(screen.getByLabelText("大会概要")).toHaveValue("# 大会について");
  });

  it("概要が空のままプレビューするとプレースホルダを出す", () => {
    render(
      <TournamentForm action={noop} slug="tennis" submitLabel="作成する" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "プレビュー" }));

    expect(screen.getByText("概要は未入力です")).toBeInTheDocument();
  });

  it("プレビュー中に送信しても概要が FormData に含まれる", async () => {
    const action = vi.fn(
      async (_state: TournamentFormState, formData: FormData) => {
        expect(formData.get("description")).toBe("# 概要");
        return { error: null };
      },
    );

    const { container } = render(
      <TournamentForm
        action={action}
        slug="tennis"
        submitLabel="作成する"
        defaultDescription="# 概要"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "プレビュー" }));
    fireEvent.submit(formIn(container));

    await waitFor(() => expect(action).toHaveBeenCalled());
  });
});
