import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { healthCheck } from "@/lib/inngest/functions/health-check";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [healthCheck],
});
