// SPDX-License-Identifier: AGPL-3.0-or-later

import { render, screen } from "@testing-library/react";
import { FileText } from "lucide-react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "../empty-state";
import { Button } from "../button";

describe("EmptyState", () => {
  it("renders heading", () => {
    render(<EmptyState heading="No documents yet" />);
    expect(screen.getByText("No documents yet")).toBeInTheDocument();
  });

  it("has role=status", () => {
    render(<EmptyState heading="Empty" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(<EmptyState heading="Empty" description="Upload your first document to get started" />);
    expect(screen.getByText("Upload your first document to get started")).toBeInTheDocument();
  });

  it("does not render description when omitted", () => {
    const { container } = render(<EmptyState heading="Empty" />);
    expect(container.querySelector("p")).toBeNull();
  });

  it("renders icon when provided", () => {
    render(<EmptyState heading="Empty" icon={<FileText data-testid="icon" />} />);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("does not render icon wrapper when omitted", () => {
    const { container } = render(<EmptyState heading="Empty" />);
    // Only the heading h3 should be a direct child element
    const h3 = container.querySelector("h3");
    expect(h3?.previousElementSibling).toBeNull();
  });

  it("renders action slot when provided", () => {
    render(<EmptyState heading="Empty" action={<Button>Upload</Button>} />);
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
  });

  it("merges custom className", () => {
    render(<EmptyState heading="Empty" className="min-h-[400px]" />);
    expect(screen.getByRole("status")).toHaveClass("min-h-[400px]");
  });
});
