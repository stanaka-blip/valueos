import type { NextRequest } from "next/server";

import { runMoneyGateway } from "@/lib/threeParty/runMoneyGateway";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: resourceId } = await params;
  return runMoneyGateway({
    request,
    route: "finance-receipts/cancel",
    action: "finance_receipt.cancel",
    caseId: null,
    resourceId: resourceId,
  });
}
