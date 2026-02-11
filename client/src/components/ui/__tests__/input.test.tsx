import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Input } from "../input";

describe("Input", () => {
  it("renders an input element", () => {
    render(<Input aria-label="Email" />);
    expect(screen.getByRole("textbox", { name: "Email" })).toBeInTheDocument();
  });

  it("forwards ref", () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} aria-label="test" />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it("accepts and displays a value", async () => {
    const user = userEvent.setup();
    render(<Input aria-label="Name" />);
    const input = screen.getByRole("textbox", { name: "Name" });
    await user.type(input, "hello");
    expect(input).toHaveValue("hello");
  });

  it("renders with placeholder", () => {
    render(<Input placeholder="Enter email..." />);
    expect(screen.getByPlaceholderText("Enter email...")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(<Input className="max-w-sm" aria-label="test" />);
    expect(screen.getByRole("textbox")).toHaveClass("max-w-sm");
  });

  it("supports type attribute", () => {
    render(<Input type="password" data-testid="pw" />);
    expect(screen.getByTestId("pw")).toHaveAttribute("type", "password");
  });

  it("can be disabled", () => {
    render(<Input disabled aria-label="disabled" />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("calls onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Input aria-label="test" onChange={onChange} />);
    await user.type(screen.getByRole("textbox"), "a");
    expect(onChange).toHaveBeenCalled();
  });
});
