import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SetupMatchView } from "@/features/division/single-elimination/view";
import type { DivisionFormAction } from "@/features/division/state";
import { MatchingSection } from "./MatchingSection";

// D&D の中身には踏み込まない。onSwap という 1 点だけを見たいので差し替える。
let capturedOnSwap: ((indexA: number, indexB: number) => void) | undefined;
vi.mock("./MatchingEditor", () => ({
  MatchingEditor: (props: { onSwap: (a: number, b: number) => void }) => {
    capturedOnSwap = props.onSwap;
    return <div>matching-editor-stub</div>;
  },
}));

const matches: SetupMatchView[] = [];

const props = {
  matches,
  slug: "acme",
  tournamentId: "t1",
  divisionId: "d1",
  generateAction: vi.fn(async () => ({ error: null })),
  swapAction: vi.fn(async () => ({ error: null })),
  disabled: false,
};

describe("MatchingSection", () => {
  it("生成は hidden の id を持つフォームで送る", () => {
    const { container } = render(<MatchingSection {...props} />);

    expect(container.querySelector('input[name="slug"]')).toHaveValue("acme");
    expect(container.querySelector('input[name="tournamentId"]')).toHaveValue(
      "t1",
    );
    expect(container.querySelector('input[name="divisionId"]')).toHaveValue(
      "d1",
    );
    expect(
      screen.getByRole("button", { name: "組み合わせを生成" }),
    ).toBeInTheDocument();
  });

  it("onSwap を swap-slots が読む名前の FormData に組み立てる", async () => {
    // D&D にはフォームの submit が無く、FormData を手で組み立てている。
    // ここの名前は swap-slots/handler.ts が formData.get で読む名前と
    // 一致していなければならないが、型では守られない。片側だけ改名しても
    // ビルドは通ってしまうので、名前と値をこのテストで固定する。
    const swapAction = vi.fn<DivisionFormAction>(async () => ({ error: null }));
    render(<MatchingSection {...props} swapAction={swapAction} />);

    expect(capturedOnSwap).toBeDefined();
    await act(async () => {
      capturedOnSwap?.(2, 5);
    });

    expect(swapAction).toHaveBeenCalledTimes(1);
    const sent = swapAction.mock.calls[0][1];
    expect(sent).toBeInstanceOf(FormData);
    expect(sent.get("slug")).toBe("acme");
    expect(sent.get("tournamentId")).toBe("t1");
    expect(sent.get("divisionId")).toBe("d1");
    // 数値ではなく文字列で入る。schema 側の coerce はこの形を前提にしている。
    expect(sent.get("indexA")).toBe("2");
    expect(sent.get("indexB")).toBe("5");
  });
});
