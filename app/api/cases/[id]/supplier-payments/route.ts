import type { NextRequest } from "next/server";

import { runMoneyGateway } from "@/lib/threeParty/runMoneyGateway";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: caseId } = await params;
  return runMoneyGateway({
    request,
    route: "cases/supplier-payments",
    action: "supplier_payment.create",
    caseId: caseId,
    resourceId: null,
  });
}
