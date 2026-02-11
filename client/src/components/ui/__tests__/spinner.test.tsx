import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Spinner } from "../spinner";

describe("Spinner", () => {
  it("renders with role=status", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("has default aria-label of Loading", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading");
  });

  it("accepts custom label for screen readers", () => {
    render(<Spinner label="Saving data" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Saving data");
  });

  it("renders as an SVG element", () => {
    render(<Spinner />);
    expect(screen.getByRole("status").tagName).toBe("svg");
  });

  it("applies animate-spin class", () => {
    render(<Spinner />);
    expect(screen.getByRole("status").getAttribute("class")).toContain("animate-spin");
  });

  it("merges custom className", () => {
    render(<Spinner className="h-10 w-10" />);
    const svg = screen.getByRole("status");
    expect(svg.getAttribute("class")).toContain("h-10");
    expect(svg.getAttribute("class")).toContain("w-10");
  });
});
