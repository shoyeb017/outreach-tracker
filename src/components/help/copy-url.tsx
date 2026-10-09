"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export function CopyUrl({ value }: { value: string }) {
  const [message,setMessage]=useState("");
  return <div className="space-y-3 rounded-xl border p-4"><code className="block break-all text-sm">{value}</code><Button variant="outline" size="sm" onClick={async()=>{try{await navigator.clipboard.writeText(value);setMessage("URL copied.");}catch{setMessage("Could not copy automatically. Select and copy the URL above.");}}}>Copy redirect URL</Button><p role="status" className="text-sm">{message}</p></div>;
}
