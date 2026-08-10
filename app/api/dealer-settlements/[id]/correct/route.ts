import type { NextRequest } from "next/server";

import { runMoneyGateway } from "@/lib/threeParty/runMoneyGateway";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: resourceId } = await params;
  return runMoneyGateway({
    request,
    route: "dealer-settlements/correct",
    action: "dealer_settlement.correct",
    caseId: null,
    resourceId: resourceId,
  });
}
