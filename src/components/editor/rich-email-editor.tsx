"use client";

import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { AlignCenter, AlignLeft, AlignRight, Bold, Eraser, Heading2, Italic, Link as LinkIcon, List, ListOrdered, Pilcrow, Quote, Redo2, Strikethrough, Underline as UnderlineIcon, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RichEmailEditor({ value, onChange, placeholders = [] }: { value: string; onChange: (html: string) => void; placeholders?: { label: string; token: string; group: string }[] }) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({ link: { openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } } }), TextAlign.configure({ types: ["heading", "paragraph"] })],
    content: value,
    editorProps: { attributes: { class: "tiptap" } },
    onUpdate: ({ editor: instance }) => onChange(instance.getHTML()),
  });
  useEffect(() => { if (editor && value !== editor.getHTML()) editor.commands.setContent(value, { emitUpdate: false }); }, [editor, value]);
  if (!editor) return <div className="min-h-72 animate-pulse bg-[#f2f4f3]" />;
  const link = () => { const href = window.prompt("Link URL", editor.getAttributes("link").href || "https://"); if (href === null) return; if (!href) editor.chain().focus().unsetLink().run(); else editor.chain().focus().extendMarkRange("link").setLink({ href }).run(); };
  const tools = [
    ["Paragraph", Pilcrow, () => editor.chain().focus().setParagraph().run(), editor.isActive("paragraph")], ["Heading", Heading2, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive("heading", { level: 2 })],
    ["Bold", Bold, () => editor.chain().focus().toggleBold().run(), editor.isActive("bold")], ["Italic", Italic, () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic")],
    ["Underline", UnderlineIcon, () => editor.chain().focus().toggleUnderline().run(), editor.isActive("underline")], ["Strikethrough", Strikethrough, () => editor.chain().focus().toggleStrike().run(), editor.isActive("strike")],
    ["Bulleted list", List, () => editor.chain().focus().toggleBulletList().run(), editor.isActive("bulletList")], ["Numbered list", ListOrdered, () => editor.chain().focus().toggleOrderedList().run(), editor.isActive("orderedList")],
    ["Blockquote", Quote, () => editor.chain().focus().toggleBlockquote().run(), editor.isActive("blockquote")], ["Align left", AlignLeft, () => editor.chain().focus().setTextAlign("left").run(), editor.isActive({ textAlign: "left" })],
    ["Align center", AlignCenter, () => editor.chain().focus().setTextAlign("center").run(), editor.isActive({ textAlign: "center" })], ["Align right", AlignRight, () => editor.chain().focus().setTextAlign("right").run(), editor.isActive({ textAlign: "right" })],
  ] as const;
  return <div className="overflow-hidden rounded-lg border bg-white"><div className="flex flex-wrap items-center gap-1 border-b bg-[#f7f9f8] p-2">{tools.map(([label, Icon, action, active]) => <Button key={label} type="button" title={label} size="icon" variant={active ? "secondary" : "ghost"} onClick={action}><Icon size={15} /></Button>)}<Button type="button" title="Link" size="icon" variant={editor.isActive("link") ? "secondary" : "ghost"} onClick={link}><LinkIcon size={15} /></Button><span className="mx-1 h-5 w-px bg-[#d8dfdc]" /><Button type="button" title="Undo" size="icon" variant="ghost" onClick={() => editor.chain().focus().undo().run()}><Undo2 size={15} /></Button><Button type="button" title="Redo" size="icon" variant="ghost" onClick={() => editor.chain().focus().redo().run()}><Redo2 size={15} /></Button><Button type="button" title="Clear formatting" size="icon" variant="ghost" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}><Eraser size={15} /></Button><select aria-label="Insert placeholder" className="ml-auto h-8 rounded-lg border bg-white px-2 text-xs font-semibold" value="" onChange={(event) => { if (event.target.value) editor.chain().focus().insertContent(event.target.value).run(); event.target.value = ""; }}><option value="">Insert placeholder</option>{Array.from(new Set(placeholders.map((item) => item.group))).map((group) => <optgroup key={group} label={group}>{placeholders.filter((item) => item.group === group).map((item) => <option key={item.token} value={item.token}>{item.label} · {item.token}</option>)}</optgroup>)}</select></div><EditorContent editor={editor} /></div>;
}
