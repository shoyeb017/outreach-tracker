import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle, themeStorageKey } from "@/components/theme/theme-toggle";
beforeEach(() => { localStorage.clear(); document.documentElement.dataset.theme = "light"; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); delete document.documentElement.dataset.theme; });
describe("appearance toggle", () => {
  it("switches both ways and remembers the choice", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem(themeStorageKey)).toBe("dark");
    fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });
  it("keeps separate navbar controls in sync", () => {
    render(<><ThemeToggle /><ThemeToggle /></>);
    fireEvent.click(screen.getAllByRole("button", { name: "Switch to dark mode" })[0]);
    expect(screen.getAllByRole("button", { name: "Switch to light mode" })).toHaveLength(2);
  });
  it("still switches when browser storage is disabled", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage disabled"); });
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
