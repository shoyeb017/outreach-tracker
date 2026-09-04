import Link from "next/link";
import { Send } from "lucide-react";
import { productName } from "@/lib/utils";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="grid min-h-screen grid-rows-[auto_1fr] bg-[#f6f8f7]"><nav className="px-6 py-5"><Link className="inline-flex items-center gap-3 font-semibold" href="/"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#176b55] text-white"><Send size={17} /></span>{productName}</Link></nav><div className="flex items-center justify-center px-5 pb-16">{children}</div></main>;
}
