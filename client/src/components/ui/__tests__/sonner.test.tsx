import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Toaster } from "../sonner";

describe("Toaster", () => {
  it("renders without crashing", () => {
    const { container } = render(<Toaster />);
    expect(container).toBeTruthy();
  });

  it("renders a toaster section element", () => {
    const { container } = render(<Toaster />);
    const section =
      container.querySelector("section") ?? container.querySelector("[data-sonner-toaster]");
    expect(section).toBeTruthy();
  });
});
