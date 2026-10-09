import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";

afterEach(cleanup);
const css = readFileSync("src/app/globals.css", "utf8");
function color(name: string, theme = "light") { const source = theme === "dark" ? css.split('html[data-theme="dark"]')[1].split("}")[0] : css.split(":root")[1].split("}")[0]; return source.match(new RegExp(`--${name}:\\s*(#[a-f0-9]{6})`, "i"))![1]; }
function luminance(hex: string) {
  const rgb = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255).map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function contrast(a: string, b: string) { const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return (values[0] + .05) / (values[1] + .05); }
describe("shared visual foundation", () => {
  it("uses readable semantic text and primary-action color pairs", () => {
    for (const theme of ["light", "dark"]) for (const [text, background] of [["primary", "primary-foreground"], ["primary", "card"], ["foreground", "background"], ["accent-foreground", "accent"], ["muted-foreground", "card"], ["success", "success-soft"], ["info", "info-soft"], ["warning", "warning-soft"], ["danger", "danger-soft"], ["sidebar-muted", "sidebar"]]) expect(contrast(color(text, theme), color(background, theme)), `${text} on ${background} (${theme})`).toBeGreaterThanOrEqual(4.5);
  });
  it("keeps input boundaries distinguishable from their surface in both modes", () => {
    for (const theme of ["light", "dark"]) expect(contrast(color("input-border", theme), color("card", theme))).toBeGreaterThanOrEqual(3);
  });
  it("uses restrained corners and compact type instead of pill buttons and oversized headings", () => {
    render(<Button>Compact action</Button>);
    expect(screen.getByRole("button", { name: "Compact action" })).toHaveClass("rounded-lg", "text-sm");
    expect(screen.getByRole("button", { name: "Compact action" })).not.toHaveClass("rounded-full");
    expect(css).toContain("--radius: .75rem");
    expect(css).toContain("font-size: clamp(1.5rem, 2.4vw, 1.875rem)");
    expect(color("background", "dark")).toBe("#09090b");
    expect(color("primary")).toBe("#173b70");
  });
  it("allows action labels to wrap and preserves their accessible names", () => {
    render(<Button>Review a very long selection of spreadsheet recipients</Button>);
    expect(screen.getByRole("button", { name: "Review a very long selection of spreadsheet recipients" })).toHaveClass("whitespace-normal");
  });
  it("keeps long page titles complete and actions in a separate responsive region", () => {
    const title = "VeryLongSpreadsheetNameWithoutSpaces".repeat(5);
    render(<PageHeader title={title} description="Your original title is preserved." actions={<Button>Next step</Button>} />);
    expect(screen.getByRole("heading", { name: title, level: 1 })).toHaveClass("page-title");
    expect(screen.getByRole("button", { name: "Next step" })).toBeInTheDocument();
  });
});
