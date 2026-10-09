"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOutOfApplication } from "@/lib/auth/sign-out";

export function LandingSignOut({ microsoftClientIds }: { microsoftClientIds: string[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    if (pending) return;
    setPending(true); setError("");
    try { await signOutOfApplication(microsoftClientIds); router.replace("/"); router.refresh(); }
    catch (issue) { setError(issue instanceof Error ? issue.message : "Could not sign out. Try again."); }
    finally { setPending(false); }
  }
  return <div className="landing-sign-out"><Button variant="ghost" disabled={pending} onClick={() => void signOut()}><LogOut size={15} aria-hidden="true" />{pending ? "Signing out…" : "Sign out"}</Button>{error && <p role="alert">{error}</p>}</div>;
}
