import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { healthCheck } from "@/lib/inngest/functions/health-check";
import { extractChart } from "@/lib/inngest/functions/extract-chart";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [healthCheck, extractChart],
});
