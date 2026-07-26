import {
  getCaseStatusBadgeClassName,
  getCaseStatusLabel,
} from "./caseStatus";

export default function StatusBadge({ status }: { status: string | null }) {
  const label = getCaseStatusLabel(status);
  const style = getCaseStatusBadgeClassName(status);

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${style}`}>
      {label}
    </span>
  );
}
