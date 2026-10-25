"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { FileCode2, Plus, X } from "lucide-react";

type EditMode = { kind: "create" } | { kind: "rename"; from: string } | null;

export function FileTabs({
  names,
  active,
  canEdit,
  createRequest,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  createPlaceholder = "helper.cpp",
}: {
  names: string[];
  active: string;
  canEdit: boolean;
  createRequest: number;
  onSelect: (name: string) => void;
  onCreate: (name: string) => string | null;
  onRename: (from: string, to: string) => string | null;
  onDelete?: (name: string) => void;
  createPlaceholder?: string;
}) {
  const [mode, setMode] = useState<EditMode>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const [seenCreate, setSeenCreate] = useState(createRequest);

  if (createRequest !== seenCreate) {
    setSeenCreate(createRequest);
    if (canEdit) {
      setMode({ kind: "create" });
      setValue("");
      setError(null);
    }
  }

  useEffect(() => {
    if (!mode) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [mode]);

  const cancel = () => {
    lock.current = true;
    setMode(null);
    setError(null);
    queueMicrotask(() => {
      lock.current = false;
    });
  };

  const commit = () => {
    if (!mode || lock.current) return;
    lock.current = true;
    const name = value.trim();
    const fail = (message: string) => {
      setError(message);
      lock.current = false;
      inputRef.current?.focus();
    };
    if (mode.kind === "create") {
      if (!name) {
        cancel();
        return;
      }
      const message = onCreate(name);
      if (message) {
        fail(message);
        return;
      }
      onSelect(name);
      setMode(null);
      setError(null);
      queueMicrotask(() => {
        lock.current = false;
      });
      return;
    }
    if (!name || name === mode.from) {
      setMode(null);
      setError(null);
      queueMicrotask(() => {
        lock.current = false;
      });
      return;
    }
    const message = onRename(mode.from, name);
    if (message) {
      fail(message);
      return;
    }
    onSelect(name);
    setMode(null);
    setError(null);
    queueMicrotask(() => {
      lock.current = false;
    });
  };

  const startRename = (name: string) => {
    onSelect(name);
    if (!canEdit) return;
    setMode({ kind: "rename", from: name });
    setValue(name);
    setError(null);
  };

  return (
    <div className="relative flex h-8 shrink-0 items-end gap-0.5 bg-[#2D2D30] px-1 pt-1">
      {names.map((name) =>
        mode?.kind === "rename" && mode.from === name ? (
          <NameField
            key={name}
            inputRef={inputRef}
            value={value}
            placeholder={name}
            onChange={(next) => {
              setValue(next);
              setError(null);
            }}
            onCommit={commit}
            onCancel={cancel}
          />
        ) : (
          <div
            key={name}
            className={`group relative flex cursor-pointer items-center gap-2 px-3 py-1 text-[12px] ${
              active === name
                ? "bg-[#1E1E1E] text-[#F1F1F1]"
                : "bg-[#2D2D30] text-[#969696] hover:text-[#F1F1F1]"
            }`}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(name)}
            onDoubleClick={() => startRename(name)}
            onKeyDown={event => {
              if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(name); }
              if (event.key === "F2" && canEdit) { event.preventDefault(); startRename(name); }
            }}
            aria-label={`Open ${name}`}
            title={canEdit ? `${name} · Double-click or F2 to rename` : name}
          >
            {active === name && <span className="absolute left-0 right-0 top-0 h-[2px] bg-[#007ACC]" />}
            <FileCode2 size={12} className={active === name ? "text-[#007ACC]" : ""} />
            {name}
            {onDelete && names.length > 1 && (
              <button
                type="button"
                className={`ml-1 rounded-[2px] p-0.5 hover:bg-[#333333] ${
                  active === name ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(name);
                }}
                title="Delete file"
                aria-label={`Delete ${name}`}
              >
                <X size={12} />
              </button>
            )}
          </div>
        )
      )}
      {mode?.kind === "create" && (
        <NameField
          inputRef={inputRef}
          value={value}
          placeholder={createPlaceholder}
          onChange={(next) => {
            setValue(next);
            setError(null);
          }}
          onCommit={commit}
          onCancel={cancel}
        />
      )}
      {canEdit && (
        <button
          type="button"
          onClick={() => {
            setMode({ kind: "create" });
            setValue("");
            setError(null);
          }}
          title="New file"
          aria-label="New file"
          className="mb-0.5 ml-1 inline-flex h-6 w-6 items-center justify-center rounded-[2px] text-[#D4D4D4] hover:bg-[#3E3E42]"
        >
          <Plus size={14} />
        </button>
      )}
      {error && (
        <span className="absolute left-2 top-8 z-20 rounded-[2px] bg-[#3A1A1A] px-2 py-1 text-[11px] text-[#F48771]">
          {error}
        </span>
      )}
    </div>
  );
}

function NameField({
  inputRef,
  value,
  placeholder,
  onChange,
  onCommit,
  onCancel,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <input
      ref={inputRef}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onCommit();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
      className="mb-0.5 h-6 w-36 rounded-[2px] border border-[#007ACC] bg-[#1E1E1E] px-2 text-[12px] text-[#F1F1F1] outline-none"
      aria-label="File name"
    />
  );
}
