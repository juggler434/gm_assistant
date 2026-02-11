import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { Label } from "../label";

describe("Label", () => {
  it("renders with text content", () => {
    render(<Label>Email</Label>);
    expect(screen.getByText("Email")).toBeInTheDocument();
  });

  it("renders as a label element", () => {
    const { container } = render(<Label>Name</Label>);
    expect(container.querySelector("label")).toBeInTheDocument();
  });

  it("forwards ref", () => {
    const ref = createRef<HTMLLabelElement>();
    render(<Label ref={ref}>Test</Label>);
    expect(ref.current).toBeInstanceOf(HTMLLabelElement);
  });

  it("supports htmlFor via the Radix primitive", () => {
    render(<Label htmlFor="email-input">Email</Label>);
    expect(screen.getByText("Email")).toHaveAttribute("for", "email-input");
  });

  it("merges custom className", () => {
    render(<Label className="text-lg">Big Label</Label>);
    expect(screen.getByText("Big Label")).toHaveClass("text-lg");
  });
});
