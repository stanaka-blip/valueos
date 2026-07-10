"use client";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-bold text-white hover:bg-gray-700 print:hidden"
    >
      PDFとして保存・印刷
    </button>
  );
}