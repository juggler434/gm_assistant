import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../dialog";

describe("Dialog", () => {
  it("does not show content by default", () => {
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Modal Title</DialogTitle>
        </DialogContent>
      </Dialog>
    );
    expect(screen.queryByText("Modal Title")).not.toBeInTheDocument();
  });

  it("opens when trigger is clicked", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Modal Title</DialogTitle>
        </DialogContent>
      </Dialog>
    );
    await user.click(screen.getByText("Open"));
    expect(screen.getByText("Modal Title")).toBeInTheDocument();
  });

  it("renders close button with aria-label", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
        </DialogContent>
      </Dialog>
    );
    await user.click(screen.getByText("Open"));
    expect(screen.getByLabelText("Close")).toBeInTheDocument();
  });

  it("closes when close button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
        </DialogContent>
      </Dialog>
    );
    await user.click(screen.getByText("Open"));
    expect(screen.getByText("Title")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Close"));
    expect(screen.queryByText("Title")).not.toBeInTheDocument();
  });

  it("renders header, description, and footer", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>Add files to your campaign</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button>Cancel</button>
            <button>Upload</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
    await user.click(screen.getByText("Open"));
    expect(screen.getByText("Upload Document")).toBeInTheDocument();
    expect(screen.getByText("Add files to your campaign")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Upload")).toBeInTheDocument();
  });

  it("supports controlled open state", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Controlled</DialogTitle>
        </DialogContent>
      </Dialog>
    );
    expect(screen.getByText("Controlled")).toBeInTheDocument();
  });
});
