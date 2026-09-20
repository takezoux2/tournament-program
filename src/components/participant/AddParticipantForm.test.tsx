import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AddParticipantForm } from "./AddParticipantForm";

const members = [
  { id: "m1", name: "竹添", nameKana: "たけぞえ" },
  { id: "m2", name: "山田", nameKana: "やまだ" },
];

describe("AddParticipantForm", () => {
  it("メンバーが居れば既存から選ぶ側で始まる", () => {
    render(
      <AddParticipantForm
        slug="tennis"
        tournamentId="t1"
        members={members}
        action={async () => ({ error: null })}
      />,
    );

    expect(screen.getByLabelText("メンバー")).toBeVisible();
    expect(screen.queryByLabelText("氏名")).toBeNull();
  });

  it("メンバーが 1 人も居なければ新規登録だけを見せる", () => {
    // 選びようがないので、ラジオ自体を出さない。
    render(
      <AddParticipantForm
        slug="tennis"
        tournamentId="t1"
        members={[]}
        action={async () => ({ error: null })}
      />,
    );

    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByLabelText("氏名")).toBeVisible();
    expect(screen.getByLabelText("氏名（かな）")).toBeVisible();
  });

  it("新しく登録に切り替えると氏名の入力に変わる", async () => {
    const user = userEvent.setup();
    render(
      <AddParticipantForm
        slug="tennis"
        tournamentId="t1"
        members={members}
        action={async () => ({ error: null })}
      />,
    );

    await user.click(screen.getByRole("radio", { name: "新しく登録する" }));

    expect(screen.getByLabelText("氏名")).toBeVisible();
    expect(screen.queryByLabelText("メンバー")).toBeNull();
  });

  it("大会と組織を hidden で送る", () => {
    const { container } = render(
      <AddParticipantForm
        slug="tennis"
        tournamentId="t1"
        members={members}
        action={async () => ({ error: null })}
      />,
    );

    expect(container.querySelector('input[name="slug"]')).toHaveValue("tennis");
    expect(container.querySelector('input[name="tournamentId"]')).toHaveValue(
      "t1",
    );
    expect(container.querySelector('input[name="mode"]')).toHaveValue(
      "existing",
    );
  });
});
