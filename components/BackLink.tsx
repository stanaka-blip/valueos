import Link from "next/link";

type BackLinkProps = {
  href: string;
  /** 既定: 「← 戻る」 */
  label?: string;
  className?: string;
};

/**
 * ページ上部向けの軽い戻り導線。
 * href は呼び出し側で sanitize / fallback 済みを渡す。
 */
export default function BackLink({
  href,
  label = "← 戻る",
  className = "inline-flex text-sm text-gray-500 transition hover:text-gray-900",
}: BackLinkProps) {
  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  );
}
