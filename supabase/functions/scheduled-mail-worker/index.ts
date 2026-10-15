import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { runScheduledWorker, workerAuthorized } from "../../../src/lib/scheduling/worker.ts";

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!await workerAuthorized(request, Deno.env.get("SCHEDULE_WORKER_SECRET") ?? "")) return new Response("Unauthorized", { status: 401 });
  const key = Deno.env.get("SCHEDULE_ENCRYPTION_KEY");
  if (!key) return Response.json({ error: "Scheduled sending is not configured." }, { status: 503 });
  try {
    const database = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
    return Response.json(await runScheduledWorker(database, key));
  } catch {
    // Do not log provider bodies, tokens, email contents, or recipients.
    return Response.json({ error: "The scheduler could not complete this tick. Check Scheduled emails and worker logs; never blindly resend." }, { status: 503 });
  }
});
