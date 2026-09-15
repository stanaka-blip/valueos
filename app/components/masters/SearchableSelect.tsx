"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import {
  filterSearchableOptions,
  type SearchableSelectOption,
} from "./searchableSelect";

type Props = {
  options: SearchableSelectOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  emptyText?: string;
  className?: string;
  /** 未選択時のボタン文言 */
  unsetLabel?: string;
};

/**
 * 依存ライブラリなしの検索可能セレクト。
 * options は呼び出し側が候補条件を適用済みの配列を渡すこと。
 */
export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "検索して選択",
  disabled = false,
  allowClear = true,
  emptyText = "該当する候補がありません",
  className = "",
  unsetLabel = "選択してください",
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const selected = useMemo(
    () => options.find((option) => option.id === value) || null,
    [options, value]
  );

  const filtered = useMemo(
    () => filterSearchableOptions(options, query),
    [options, query]
  );

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const root = rootRef.current;
      if (!root) return;
      if (event.target instanceof Node && !root.contains(event.target)) {
        setOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  function openList() {
    if (disabled) return;
    setOpen(true);
    setQuery("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function selectOption(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  function clearSelection() {
    onChange("");
    setOpen(false);
    setQuery("");
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((current) =>
        filtered.length === 0 ? 0 : Math.min(current + 1, filtered.length - 1)
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const option = filtered[highlight];
      if (option) selectOption(option.id);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {!open ? (
        <button
          type="button"
          disabled={disabled}
          onClick={openList}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm outline-none hover:bg-gray-50 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100"
          aria-haspopup="listbox"
          aria-expanded={false}
        >
          <span
            className={
              selected ? "truncate text-gray-900" : "truncate text-gray-400"
            }
          >
            {selected ? selected.label : unsetLabel}
          </span>
          <span className="shrink-0 text-xs text-gray-400">▼</span>
        </button>
      ) : (
        <div className="rounded-lg border border-gray-900 bg-white shadow-sm">
          <input
            ref={inputRef}
            type="text"
            value={query}
            disabled={disabled}
            placeholder={placeholder}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            className="w-full rounded-t-lg border-0 px-3 py-2 text-sm outline-none"
            aria-controls={listId}
            aria-autocomplete="list"
            role="combobox"
            aria-expanded={true}
          />
          <ul
            id={listId}
            role="listbox"
            className="max-h-56 overflow-y-auto border-t border-gray-100"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-500">{emptyText}</li>
            ) : (
              filtered.map((option, index) => {
                const active = index === highlight;
                const isSelected = option.id === value;
                return (
                  <li key={option.id} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      className={`block w-full px-3 py-2 text-left hover:bg-gray-50 ${
                        active ? "bg-gray-50" : ""
                      } ${isSelected ? "font-semibold" : ""}`}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => selectOption(option.id)}
                    >
                      <span className="block text-sm text-gray-900">
                        {option.primaryText}
                      </span>
                      {option.secondaryText ? (
                        <span className="mt-0.5 block text-xs text-gray-500">
                          {option.secondaryText}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          {allowClear && value ? (
            <div className="border-t border-gray-100 px-2 py-1">
              <button
                type="button"
                className="w-full rounded px-2 py-1 text-left text-xs text-gray-600 hover:bg-gray-50"
                onClick={clearSelection}
              >
                選択をクリア
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
