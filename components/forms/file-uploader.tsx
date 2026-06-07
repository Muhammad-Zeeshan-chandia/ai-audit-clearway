"use client";

import React, { useRef, useState } from "react";
import { Upload, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

const ALLOWED_TYPES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/pdf",
  "text/plain",
];
const ALLOWED_EXTENSIONS = [".docx", ".pdf", ".txt"];
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

interface FileUploaderProps {
  label?: string;
  required?: boolean;
  onChange: (file: File | null) => void;
  uploading?: boolean;
  error?: string;
}

export function FileUploader({
  label = "Transcript file",
  required = false,
  onChange,
  uploading = false,
  error,
}: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function validate(f: File): string | null {
    if (!ALLOWED_TYPES.includes(f.type) && !ALLOWED_EXTENSIONS.some((ext) => f.name.endsWith(ext))) {
      return "Only .docx, .pdf, and .txt files are allowed.";
    }
    if (f.size > MAX_BYTES) return "File must be under 20 MB.";
    return null;
  }

  function handleSelect(f: File) {
    const err = validate(f);
    if (err) {
      setLocalError(err);
      setFile(null);
      onChange(null);
    } else {
      setLocalError(null);
      setFile(f);
      onChange(f);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleSelect(f);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleSelect(f);
  }

  function handleRemove() {
    setFile(null);
    setLocalError(null);
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const displayError = error ?? localError;

  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium text-[--text-primary]">
        {label}
        {required && <span className="ml-0.5 text-[--danger]">*</span>}
      </p>
      <p className="text-xs text-[--text-tertiary]">.docx, .pdf, or .txt — max 20 MB</p>

      {!file ? (
        <div
          className={cn(
            "flex flex-col items-center justify-center rounded-md border-2 border-dashed px-6 py-8 cursor-pointer transition-colors",
            dragging
              ? "border-[--accent] bg-[--accent-light]"
              : "border-[--border] bg-[--bg-secondary] hover:border-[--border-strong]",
            displayError && "border-[--danger]"
          )}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <Upload className="mb-2 h-6 w-6 text-[--text-tertiary]" />
          <p className="text-sm text-[--text-secondary]">
            Drop file here or <span className="text-[--accent] font-medium">browse</span>
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED_EXTENSIONS.join(",")}
            className="hidden"
            onChange={handleInputChange}
          />
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-md border border-[--border] bg-[--bg-secondary] px-3 py-2.5">
          <FileText className="h-5 w-5 shrink-0 text-[--accent]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[--text-primary]">{file.name}</p>
            <p className="text-xs text-[--text-tertiary]">
              {(file.size / 1024).toFixed(0)} KB
            </p>
            {uploading && <Progress className="mt-1.5" />}
          </div>
          {!uploading && (
            <button
              type="button"
              onClick={handleRemove}
              className="rounded p-1 text-[--text-tertiary] hover:bg-[--bg-tertiary] hover:text-[--danger] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {displayError && (
        <p className="text-xs text-[--danger]">{displayError}</p>
      )}
    </div>
  );
}
