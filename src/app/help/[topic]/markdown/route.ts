import { readHelpDocument } from "@/lib/help/read-document";

export async function GET(_request: Request, { params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params;
  const document = await readHelpDocument(topic);
  if (!document) return new Response("Guide not found", { status: 404 });
  return new Response(`# ${document.title}\n\n${document.markdown}`, { headers: {
    "Content-Type": "text/markdown; charset=utf-8",
    "Content-Disposition": `attachment; filename="${document.slug}.md"`,
    "X-Content-Type-Options": "nosniff",
  } });
}
