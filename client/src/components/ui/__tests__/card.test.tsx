import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../card";

describe("Card", () => {
  it("renders children", () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText("Card content")).toBeInTheDocument();
  });

  it("forwards ref", () => {
    const ref = createRef<HTMLDivElement>();
    render(<Card ref={ref}>Test</Card>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it("merges custom className", () => {
    render(<Card className="w-full">Styled</Card>);
    expect(screen.getByText("Styled")).toHaveClass("w-full");
  });

  it("renders composable sub-components", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>
    );
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByText("Footer")).toBeInTheDocument();
  });
});

describe("CardHeader", () => {
  it("forwards ref", () => {
    const ref = createRef<HTMLDivElement>();
    render(<CardHeader ref={ref}>Header</CardHeader>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});

describe("CardTitle", () => {
  it("forwards ref and merges className", () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <CardTitle ref={ref} className="text-xl">
        Big Title
      </CardTitle>
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(screen.getByText("Big Title")).toHaveClass("text-xl");
  });
});

describe("CardDescription", () => {
  it("applies muted-foreground styling", () => {
    render(<CardDescription>A description</CardDescription>);
    expect(screen.getByText("A description").className).toContain("text-muted-foreground");
  });
});

describe("CardFooter", () => {
  it("renders with flex layout", () => {
    render(<CardFooter>Actions</CardFooter>);
    expect(screen.getByText("Actions").className).toContain("flex");
  });
});
