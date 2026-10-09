import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), user: vi.fn(), from: vi.fn(), owner: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: mocks.client }));
import { getSignOutMicrosoftClientIds } from "@/lib/auth/logout-context";
beforeEach(() => {
  vi.clearAllMocks(); mocks.user.mockResolvedValue({ data: { user: { id: "verified-user" } } });
  mocks.client.mockResolvedValue({ auth: { getUser: mocks.user }, from: mocks.from });
  mocks.from.mockImplementation((table) => ({ select: () => ({ eq: (column: string, id: string) => {
    mocks.owner(column, id);
    return table === "microsoft_user_configurations" ? Promise.resolve({ data: [{ client_id: "same-app" }, { client_id: "other-app" }] }) : { maybeSingle: () => Promise.resolve({ data: { client_id: "same-app" } }) };
  } }) }));
});
describe("sign out cache context", () => {
  it("uses only the verified workspace owner's configurations and deduplicates IDs", async () => {
    expect(await getSignOutMicrosoftClientIds()).toEqual(["same-app", "other-app"]);
    expect(mocks.owner).toHaveBeenCalledTimes(2);
    for (const call of mocks.owner.mock.calls) expect(call).toEqual(["user_id", "verified-user"]);
  });
  it("does not read another account's configuration when no workspace session exists", async () => {
    mocks.user.mockResolvedValue({ data: { user: null } }); expect(await getSignOutMicrosoftClientIds()).toEqual([]); expect(mocks.from).not.toHaveBeenCalled();
  });
  it("does not access the database in persistence-disabled previews", async () => {
    mocks.client.mockResolvedValue(null); expect(await getSignOutMicrosoftClientIds()).toEqual([]); expect(mocks.user).not.toHaveBeenCalled();
  });
});
