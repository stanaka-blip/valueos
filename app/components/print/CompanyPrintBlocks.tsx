import type { ReactNode } from "react";

import type { PrintCompanyInfo } from "@/lib/companyInfo/printCompanyInfo";
import {
  companyDisplayName,
  formatPostalAddress,
  hasBankTransferInfo,
  trimOrNull,
} from "@/lib/companyInfo/printCompanyInfo";

/** 発注書・納品書フッタ: 社名 + 任意の住所・電話 / 請求書フッタ: 社名のみ */
export function PrintCompanyFooter({
  company,
  attribution,
  showContact = true,
}: {
  company: PrintCompanyInfo;
  attribution: string;
  showContact?: boolean;
}) {
  const name = companyDisplayName(company);
  const postalAddress = showContact
    ? formatPostalAddress(company.postal_code, company.address)
    : null;
  const phone = showContact ? trimOrNull(company.phone) : null;

  return (
    <footer className="order-print-footer">
      <p className="order-print-footer-company">{name}</p>
      {postalAddress ? (
        <p className="order-print-footer-meta">{postalAddress}</p>
      ) : null}
      {phone ? (
        <p className="order-print-footer-meta">電話番号：{phone}</p>
      ) : null}
      <p className="order-print-footer-note">{attribution}</p>
    </footer>
  );
}

/** 請求書 発行元ブロック（値がある項目のみ） */
export function InvoiceIssuerBlock({
  company,
}: {
  company: PrintCompanyInfo;
}) {
  const name = companyDisplayName(company);
  const postal = trimOrNull(company.postal_code);
  const address = trimOrNull(company.address);
  const phone = trimOrNull(company.phone);
  const fax = trimOrNull(company.fax);
  const email = trimOrNull(company.email);
  const invoiceReg = trimOrNull(company.invoice_registration_number);

  return (
    <div className="order-print-top-right">
      <h2 className="order-print-section-title">発行元</h2>
      <p className="order-print-issuer-name">{name}</p>
      <div className="order-print-fields">
        {postal ? <IssuerField label="郵便番号" value={`〒${postal}`} /> : null}
        {address ? <IssuerField label="住所" value={address} /> : null}
        {phone ? <IssuerField label="電話番号" value={phone} /> : null}
        {fax ? <IssuerField label="FAX" value={fax} /> : null}
        {email ? <IssuerField label="メール" value={email} /> : null}
        {invoiceReg ? (
          <IssuerField label="登録番号" value={invoiceReg} />
        ) : null}
      </div>
    </div>
  );
}

/** 請求書 振込先（いずれかの口座項目があるときだけ表示） */
export function InvoiceBankTransferBlock({
  company,
}: {
  company: PrintCompanyInfo;
}) {
  if (!hasBankTransferInfo(company)) {
    return null;
  }

  const bankName = trimOrNull(company.bank_name);
  const branch = trimOrNull(company.bank_branch);
  const accountType = trimOrNull(company.bank_account_type);
  const accountNumber = trimOrNull(company.bank_account_number);
  const holder = trimOrNull(company.bank_account_holder);

  return (
    <section className="order-print-bank">
      <h2 className="order-print-section-title">お振込先</h2>
      <div className="order-print-fields">
        {bankName ? <IssuerField label="銀行名" value={bankName} /> : null}
        {branch ? <IssuerField label="支店名" value={branch} /> : null}
        {accountType ? (
          <IssuerField label="口座種別" value={accountType} />
        ) : null}
        {accountNumber ? (
          <IssuerField label="口座番号" value={accountNumber} />
        ) : null}
        {holder ? <IssuerField label="口座名義" value={holder} /> : null}
      </div>
    </section>
  );
}

function IssuerField({
  label,
  value,
}: {
  label: string;
  value: string;
}): ReactNode {
  return (
    <div className="order-print-field">
      <span className="order-print-field-label">{label}</span>
      <span className="order-print-field-value">{value}</span>
    </div>
  );
}
