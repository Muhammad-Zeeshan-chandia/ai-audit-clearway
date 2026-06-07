"use client";

import React, { useMemo, useEffect, useRef } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { FieldDefinition } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

function buildSchema(fields: FieldDefinition[]) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    let schema: z.ZodTypeAny;

    switch (field.field_type) {
      case "email":
        schema = z.string().email("Invalid email address");
        break;
      case "number":
        schema = z.preprocess(
          (v) => (v === "" || v === undefined || v === null ? undefined : Number(v)),
          field.required
            ? z.number({ message: `${field.label} must be a number` })
            : z.number({ message: `${field.label} must be a number` }).optional()
        );
        break;
      case "boolean":
        schema = z.boolean();
        break;
      case "date":
        schema = field.required
          ? z.string().min(1, `${field.label} is required`)
          : z.string().optional();
        break;
      case "multiselect":
        schema = field.required
          ? z.array(z.string()).min(1, `${field.label} is required`)
          : z.array(z.string()).optional();
        break;
      case "long_text":
      case "text":
      default:
        schema = field.required
          ? z.string().min(1, `${field.label} is required`)
          : z.string().optional();
        break;
    }

    shape[field.field_key] = schema;
  }

  return z.object(shape);
}

function getDefaultValues(fields: FieldDefinition[]) {
  const defaults: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.field_type === "boolean") defaults[field.field_key] = false;
    else if (field.field_type === "multiselect") defaults[field.field_key] = [];
    else defaults[field.field_key] = "";
  }
  return defaults;
}

interface DynamicFormProps {
  fields: FieldDefinition[];
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  submitLabel?: string;
  initialValues?: Record<string, unknown>;
  extraContent?: React.ReactNode;
  disabled?: boolean;
  onAutoSave?: (data: Record<string, unknown>) => void;
  autoSaveDelay?: number;
}

export function DynamicForm({
  fields,
  onSubmit,
  submitLabel = "Submit",
  initialValues,
  extraContent,
  disabled = false,
  onAutoSave,
  autoSaveDelay = 1500,
}: DynamicFormProps) {
  const schema = useMemo(() => buildSchema(fields), [fields]);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Record<string, unknown>>({
    resolver: zodResolver(schema),
    defaultValues: { ...getDefaultValues(fields), ...initialValues },
  });

  // Auto-save on change
  useEffect(() => {
    if (!onAutoSave) return;
    const { unsubscribe } = watch((data) => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(
        () => onAutoSave(data as Record<string, unknown>),
        autoSaveDelay
      );
    });
    return () => {
      unsubscribe();
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [watch, onAutoSave, autoSaveDelay]);

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4"
      noValidate
    >
      {fields.map((field) => {
        const error = (errors[field.field_key]?.message as string) ?? undefined;

        return (
          <div key={field.field_key} className="flex flex-col gap-1">
            {field.field_type !== "boolean" && (
              <Label htmlFor={field.field_key} required={field.required}>
                {field.label}
              </Label>
            )}
            {field.help_text && (
              <p className="text-xs text-[--text-tertiary]">{field.help_text}</p>
            )}

            {/* Text / email / url */}
            {(field.field_type === "text" || field.field_type === "email") && (
              <Input
                id={field.field_key}
                type={field.field_type === "email" ? "email" : "text"}
                placeholder={field.label}
                error={error}
                disabled={disabled}
                {...register(field.field_key)}
              />
            )}

            {/* Number */}
            {field.field_type === "number" && (
              <Input
                id={field.field_key}
                type="number"
                min={0}
                placeholder="0"
                error={error}
                disabled={disabled}
                {...register(field.field_key)}
              />
            )}

            {/* Long text */}
            {field.field_type === "long_text" && (
              <Textarea
                id={field.field_key}
                placeholder={field.label}
                rows={3}
                error={error}
                disabled={disabled}
                {...register(field.field_key)}
              />
            )}

            {/* Date */}
            {field.field_type === "date" && (
              <Input
                id={field.field_key}
                type="date"
                error={error}
                disabled={disabled}
                {...register(field.field_key)}
              />
            )}

            {/* Select */}
            {field.field_type === "select" && (
              <Select
                id={field.field_key}
                placeholder="Select…"
                error={error}
                disabled={disabled}
                {...register(field.field_key)}
              >
                {(field.options ?? []).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            )}

            {/* Multiselect (checkboxes) */}
            {field.field_type === "multiselect" && (
              <Controller
                name={field.field_key}
                control={control}
                render={({ field: f }) => {
                  const selected: string[] = Array.isArray(f.value) ? (f.value as string[]) : [];
                  return (
                    <div className="flex flex-wrap gap-3">
                      {(field.options ?? []).map((opt) => (
                        <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded accent-[--accent]"
                            checked={selected.includes(opt.value)}
                            disabled={disabled}
                            onChange={(e) => {
                              if (e.target.checked) {
                                f.onChange([...selected, opt.value]);
                              } else {
                                f.onChange(selected.filter((v) => v !== opt.value));
                              }
                            }}
                          />
                          <span className="text-sm text-[--text-primary]">{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  );
                }}
              />
            )}

            {/* Boolean (single checkbox) */}
            {field.field_type === "boolean" && (
              <Controller
                name={field.field_key}
                control={control}
                render={({ field: f }) => (
                  <Checkbox
                    id={field.field_key}
                    label={field.label}
                    checked={Boolean(f.value)}
                    onChange={(e) => f.onChange(e.target.checked)}
                    error={error}
                    disabled={disabled}
                  />
                )}
              />
            )}

            {error && field.field_type !== "boolean" && (
              <p className="text-xs text-[--danger]">{error}</p>
            )}
          </div>
        );
      })}

      {/* Slot for extra fields (file uploader, consent, etc.) */}
      {extraContent}

      <div className="pt-2">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={isSubmitting}
          disabled={disabled}
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
