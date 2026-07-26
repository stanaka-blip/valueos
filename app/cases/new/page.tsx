"use client";

import CaseRegistrationWizard from "@/app/components/case-registration/CaseRegistrationWizard";

/**
 * 管理画面の案件登録。
 * 旧フォームは廃止し、dealer 配下の案件登録ウィザードを共通利用する。
 */
export default function NewCasePage() {
  return <CaseRegistrationWizard />;
}
