import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BlueTubesBackground } from "@/components/motion/blue-tubes-background";
const mocks = vi.hoisted(() => ({ create: vi.fn(), dispose: vi.fn() }));
vi.mock("@/lib/landing/blue-tubes", () => ({ createBlueTubes: mocks.create }));
let reduced = false;
let mediaChange: (() => void) | undefined;
beforeEach(() => {
  vi.clearAllMocks(); reduced = false; mediaChange = undefined;
  mocks.create.mockReturnValue({ dispose: mocks.dispose });
  vi.stubGlobal("matchMedia", () => ({ get matches() { return reduced; }, addEventListener: (_: string, callback: () => void) => { mediaChange = callback; }, removeEventListener: vi.fn() }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const mount = () => render(<section className="landing-hero"><BlueTubesBackground /><a href="/register">Create workspace</a></section>);
describe("landing blue tubes lifecycle", () => {
  it("runs continuously without animation controls and disposes on unmount", async () => {
    const view = mount();
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    await waitFor(() => expect(view.container.querySelector(".blue-tubes-layer")).toHaveAttribute("data-animation-state", "running"));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    view.unmount(); expect(mocks.dispose).toHaveBeenCalledOnce();
  });
  it("never initializes WebGL when reduced motion is requested", async () => {
    reduced = true; mount();
    await waitFor(() => expect(document.querySelector(".blue-tubes-layer")).toHaveAttribute("data-animation-state", "reduced"));
    expect(mocks.create).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Create workspace" })).toBeVisible();
  });
  it("responds to live motion preference changes and releases the active scene", async () => {
    mount(); await waitFor(() => expect(document.querySelector(".blue-tubes-layer")).toHaveAttribute("data-animation-state", "running"));
    reduced = true; await act(async () => mediaChange?.());
    expect(document.querySelector(".blue-tubes-layer")).toHaveAttribute("data-animation-state", "reduced"); expect(mocks.dispose).toHaveBeenCalledOnce();
    reduced = false; await act(async () => mediaChange?.());
    await waitFor(() => expect(document.querySelector(".blue-tubes-layer")).toHaveAttribute("data-animation-state", "running")); expect(mocks.create).toHaveBeenCalledTimes(2);
  });
  it("keeps content usable if graphics initialization fails", async () => {
    mocks.create.mockImplementation(() => { throw new Error("WebGL unavailable"); });
    mount(); await waitFor(() => expect(document.querySelector(".blue-tubes-layer")).toHaveAttribute("data-animation-state", "fallback"));
    expect(screen.getByRole("link", { name: "Create workspace" })).toHaveAttribute("href", "/register");
    expect(screen.queryByRole("button", { name: "Pause animation" })).not.toBeInTheDocument();
  });
  it("releases a failed running scene and shows its static fallback", async () => {
    mount(); await waitFor(() => expect(document.querySelector(".blue-tubes-layer")).toHaveAttribute("data-animation-state", "running"));
    act(() => mocks.create.mock.calls[0][2]());
    expect(document.querySelector(".blue-tubes-layer")).toHaveAttribute("data-animation-state", "fallback"); expect(mocks.dispose).toHaveBeenCalledOnce();
  });
});
