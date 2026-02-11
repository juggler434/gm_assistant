import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShieldAlert } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { ErrorState } from "../error-state";

describe("ErrorState", () => {
  it("renders with default heading", () => {
    render(<ErrorState />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("has role=alert", () => {
    render(<ErrorState />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders custom heading", () => {
    render(<ErrorState heading="Connection failed" />);
    expect(screen.getByText("Connection failed")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(<ErrorState description="Please check your network connection" />);
    expect(screen.getByText("Please check your network connection")).toBeInTheDocument();
  });

  it("does not render description when omitted", () => {
    const { container } = render(<ErrorState />);
    expect(container.querySelector("p")).toBeNull();
  });

  it("renders retry button when onRetry is provided", () => {
    render(<ErrorState onRetry={() => {}} />);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("does not render retry button when onRetry is omitted", () => {
    render(<ErrorState />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("calls onRetry when retry button is clicked", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders custom retry label", () => {
    render(<ErrorState onRetry={() => {}} retryLabel="Reload page" />);
    expect(screen.getByRole("button", { name: "Reload page" })).toBeInTheDocument();
  });

  it("accepts custom icon", () => {
    render(<ErrorState icon={<ShieldAlert data-testid="custom-icon" />} />);
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });

  it("merges custom className", () => {
    render(<ErrorState className="max-w-lg" />);
    expect(screen.getByRole("alert")).toHaveClass("max-w-lg");
  });
});
