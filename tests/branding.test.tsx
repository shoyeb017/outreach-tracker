import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrandLogo } from "@/components/brand/brand-logo";
import { brandName, productName, productTagline } from "@/lib/utils";

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe("canonical AUTMAIL identity", () => {
  it("uses the requested full product name and consistent short labels", () => {
    expect(brandName).toBe("AUTMAIL");
    expect(productTagline).toBe("Email Automation System");
    expect(productName).toBe("AUTMAIL - Email Automation System");
  });
  it("does not restore obsolete branding from a legacy deployment variable", async () => {
    vi.stubEnv("NEXT_PUBLIC_PRODUCT_NAME", "Legacy product name");
    vi.resetModules();
    expect((await import("@/lib/utils")).productName).toBe("AUTMAIL - Email Automation System");
  });
  it("keeps the logo artwork alone while exposing the complete accessible name", () => {
    render(<BrandLogo />);
    expect(screen.getByRole("img", { name: "AUTMAIL - Email Automation System" })).toHaveClass("brand-lockup");
    expect(screen.queryByText("Email Automation System")).not.toBeInTheDocument();
  });
});
