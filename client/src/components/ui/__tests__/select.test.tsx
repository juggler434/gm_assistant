import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../select";

function renderSelect(props?: { onValueChange?: (value: string) => void }) {
  return render(
    <Select onValueChange={props?.onValueChange}>
      <SelectTrigger aria-label="Fruit">
        <SelectValue placeholder="Pick a fruit" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="apple">Apple</SelectItem>
        <SelectItem value="banana">Banana</SelectItem>
        <SelectItem value="cherry">Cherry</SelectItem>
      </SelectContent>
    </Select>
  );
}

describe("Select", () => {
  it("renders trigger with placeholder", () => {
    renderSelect();
    expect(screen.getByText("Pick a fruit")).toBeInTheDocument();
  });

  it("renders trigger as a combobox", () => {
    renderSelect();
    expect(screen.getByRole("combobox", { name: "Fruit" })).toBeInTheDocument();
  });

  it("opens dropdown when trigger is clicked", async () => {
    const user = userEvent.setup();
    renderSelect();
    await user.click(screen.getByRole("combobox"));
    expect(screen.getByText("Apple")).toBeInTheDocument();
    expect(screen.getByText("Banana")).toBeInTheDocument();
    expect(screen.getByText("Cherry")).toBeInTheDocument();
  });

  it("calls onValueChange when an item is selected", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderSelect({ onValueChange });
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByText("Banana"));
    expect(onValueChange).toHaveBeenCalledWith("banana");
  });

  it("displays selected value after selection", async () => {
    const user = userEvent.setup();
    renderSelect();
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByText("Cherry"));
    expect(screen.getByRole("combobox")).toHaveTextContent("Cherry");
  });
});
