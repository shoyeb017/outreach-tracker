import { backgroundStatus, prepareSchedule, scheduleUser, schedulerHealth, schedulingFailure, selectionInput, smallJson } from "@/lib/scheduling/server";
export async function POST(request: Request) {
  try {
    const context = await scheduleUser(request);
    const input = selectionInput.parse(await smallJson(request));
    const [preview, health, connection] = await Promise.all([prepareSchedule(context, input), schedulerHealth(context.database), backgroundStatus(context)]);
    return Response.json({ preview, health, connection }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return schedulingFailure(error); }
}
