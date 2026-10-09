// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("guided-workflow SQL artifact guards", () => {
  for (const file of ["supabase/schema.sql", "supabase/migrations/20261008_guided_workflow.sql"]) {
    it(`${file} preserves function delimiters and both custom-field sort directions`, () => {
      const sql = readFileSync(file, "utf8");
      expect(sql).not.toMatch(/as \$\s*\n/);
      expect(sql).not.toMatch(/^\$;/m);
      expect((sql.match(/\$\$/g) ?? []).length % 2).toBe(0);
      expect(sql).not.toContain("{2,} end,");
      expect(sql).toContain("{2,}$' end,");
      expect(sql).not.toContain("else r.data->>p_sort end");
      expect(sql).toContain("public.claim_send_run_item");
    });
  }
});
