import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CardSkeleton, Skeleton, TableRowSkeleton } from "../skeleton";

describe("Skeleton", () => {
  it("renders with aria-hidden", () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });

  it("applies animate-pulse class", () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toHaveClass("animate-pulse");
  });

  it("merges custom className", () => {
    const { container } = render(<Skeleton className="h-8 w-full" />);
    expect(container.firstChild).toHaveClass("h-8");
    expect(container.firstChild).toHaveClass("w-full");
  });
});

describe("CardSkeleton", () => {
  it("renders with aria-hidden", () => {
    const { container } = render(<CardSkeleton />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });

  it("contains multiple inner skeleton elements", () => {
    const { container } = render(<CardSkeleton />);
    const skeletons = container.querySelectorAll("[aria-hidden='true']");
    // The outer container + inner Skeleton divs
    expect(skeletons.length).toBeGreaterThan(3);
  });

  it("merges custom className", () => {
    const { container } = render(<CardSkeleton className="max-w-md" />);
    expect(container.firstChild).toHaveClass("max-w-md");
  });
});

describe("TableRowSkeleton", () => {
  it("renders with aria-hidden", () => {
    const { container } = render(<TableRowSkeleton />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });

  it("has flex layout", () => {
    const { container } = render(<TableRowSkeleton />);
    expect(container.firstChild).toHaveClass("flex");
  });
});
