import { Suspense } from "react";

import CaseRegistrationWizard from "@/app/components/case-registration/CaseRegistrationWizard";

/**
 * 社内案件登録（4ステップ）。
 * 保存は POST /api/case-registrations のみ。anon cases.insert は使わない。
 * 下書きは case_registration_drafts（正式 cases とは分離）。
 */
export default function NewCasePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-gray-500">
          読み込み中…
        </div>
      }
    >
      <CaseRegistrationWizard />
    </Suspense>
  );
}
