"use client";

import CaseRegistrationWizard from "@/app/components/case-registration/CaseRegistrationWizard";

/**
 * 販売店向け新規発注。
 * UI / ロジックの正本は CaseRegistrationWizard（旧 dealer/orders/new）。
 */
export default function DealerNewOrderPage() {
  return <CaseRegistrationWizard />;
}
