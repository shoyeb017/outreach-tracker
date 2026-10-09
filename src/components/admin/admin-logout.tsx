"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
export function AdminLogout() {
  const [error, setError] = useState(""), [pending, setPending] = useState(false); const router = useRouter();
  return <div><Button variant="outline" disabled={pending} onClick={async () => { setPending(true); try { const response = await fetch("/api/admin/logout", { method: "POST" }); if (!response.ok) throw new Error("Could not sign out. Try again."); router.replace("/admin/login"); router.refresh(); } catch (issue) { setError(issue instanceof Error ? issue.message : "Could not sign out."); } finally { setPending(false); } }}>Sign out of admin</Button>{error && <p role="alert">{error}</p>}</div>;
}
