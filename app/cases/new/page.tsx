"use client";

import CaseRegistrationWizard from "@/app/components/case-registration/CaseRegistrationWizard";

/**
 * 社内案件登録（4ステップ）。
 * 保存は POST /api/case-registrations のみ。anon cases.insert は使わない。
 */
export default function NewCasePage() {
  return <CaseRegistrationWizard />;
}
