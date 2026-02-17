// SPDX-License-Identifier: AGPL-3.0-or-later

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { Textarea } from "../textarea";

describe("Textarea", () => {
  it("renders a textarea element", () => {
    render(<Textarea aria-label="Notes" />);
    expect(screen.getByRole("textbox", { name: "Notes" })).toBeInTheDocument();
  });

  it("forwards ref", () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<Textarea ref={ref} aria-label="test" />);
    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
  });

  it("accepts user input", async () => {
    const user = userEvent.setup();
    render(<Textarea aria-label="Content" />);
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "multi\nline");
    expect(textarea).toHaveValue("multi\nline");
  });

  it("renders with placeholder", () => {
    render(<Textarea placeholder="Write here..." />);
    expect(screen.getByPlaceholderText("Write here...")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(<Textarea className="min-h-[200px]" aria-label="test" />);
    expect(screen.getByRole("textbox")).toHaveClass("min-h-[200px]");
  });

  it("can be disabled", () => {
    render(<Textarea disabled aria-label="disabled" />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});
