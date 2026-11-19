import type { Config } from "@netlify/functions";
import { getServiceClient } from "./_shared/supabase";
import { processPendingNotifications } from "./_shared/notifications";

export default async function retry(): Promise<void> {
  const { error } = await getServiceClient()
    .from("profiles")
    .select("id")
    .limit(1);
  if (error) throw new Error("DATABASE_UNAVAILABLE");
  await processPendingNotifications();
}

export const config: Config = { schedule: "*/15 * * * *" };
