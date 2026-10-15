import { randomBytes } from "node:crypto";
// Run locally yourself. Do not commit the output or paste it into an issue/chat.
console.log("SCHEDULE_ENCRYPTION_KEY=" + randomBytes(32).toString("base64"));
console.log("SCHEDULE_WORKER_SECRET=" + randomBytes(32).toString("base64url"));
console.log("Keep these private. The encryption key must match in Vercel and Supabase Edge Function secrets.");
