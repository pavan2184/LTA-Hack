import { planResponse } from "@/lib/plans/http";
import { getPlannerOverview, parseOverviewQuery } from "@/lib/plans/overview";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return planResponse("solve", async (identity) => ({
    overview: await getPlannerOverview(
      identity,
      parseOverviewQuery(request.url),
    ),
  }));
}
