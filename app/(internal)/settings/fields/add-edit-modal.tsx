"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import type { FieldDefinition, FieldType } from "@/lib/types";

const FIELD_TYPES: Array<{ value: FieldType; label: string }> = [
  { value: "text",        label: "Text" },
  { value: "number",      label: "Number" },
  { value: "email",       label: "Email" },
  { value: "boolean",     label: "Yes / No" },
  { value: "select",      label: "Select (single)" },
  { value: "multiselect", label: "Multi-select" },
  { value: "long_text",   label: "Long text" },
  { value: "date",        label: "Date" },
];

function toFieldKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .replace(/^([0-9])/, "f_$1") // can't start with digit
    .slice(0, 60);
}

interface OptionRow { value: string; label: string }

interface Props {
  open: boolean;
  entity: "client" | "questionnaire";
  field: FieldDefinition | null;
  onClose: () => void;
  onSaved: (field: FieldDefinition) => void;
}

export function AddEditModal({ open, entity, field, onClose, onSaved }: Props) {
  const isEditing = Boolean(field);

  const [label, setLabel]         = useState("");
  const [fieldKey, setFieldKey]   = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [fieldType, setFieldType] = useState<FieldType>("text");
  const [required, setRequired]   = useState(false);
  const [helpText, setHelpText]   = useState("");
  const [options, setOptions]     = useState<OptionRow[]>([{ value: "", label: "" }]);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Populate form when editing
  useEffect(() => {
    if (field) {
      setLabel(field.label);
      setFieldKey(field.field_key);
      setKeyEdited(true); // treat as already set
      setFieldType(field.field_type);
      setRequired(field.required);
      setHelpText(field.help_text ?? "");
      setOptions(field.options?.length ? field.options : [{ value: "", label: "" }]);
    } else {
      setLabel(""); setFieldKey(""); setKeyEdited(false);
      setFieldType("text"); setRequired(false); setHelpText("");
      setOptions([{ value: "", label: "" }]);
    }
    setError(null);
  }, [field, open]);

  // Auto-generate field_key from label (for new fields)
  useEffect(() => {
    if (!isEditing && !keyEdited && label) {
      setFieldKey(toFieldKey(label));
    }
  }, [label, isEditing, keyEdited]);

  const showOptions = fieldType === "select" || fieldType === "multiselect";

  function addOptionRow() {
    setOptions([...options, { value: "", label: "" }]);
  }

  function updateOption(index: number, key: "value" | "label", val: string) {
    const updated = [...options];
    updated[index] = { ...updated[index], [key]: val };
    // Auto-fill value from label
    if (key === "label" && !updated[index].value) {
      updated[index].value = toFieldKey(val);
    }
    setOptions(updated);
  }

  function removeOption(index: number) {
    setOptions(options.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setError(null);

    if (!label.trim()) { setError("Label is required."); return; }
    if (!fieldKey.trim()) { setError("Field key is required."); return; }
    if (!/^[a-z][a-z0-9_]*$/.test(fieldKey)) {
      setError("Field key must start with a letter and contain only lowercase letters, numbers, and underscores.");
      return;
    }
    if (showOptions) {
      const validOptions = options.filter((o) => o.value && o.label);
      if (validOptions.length === 0) { setError("Add at least one option."); return; }
    }

    setSaving(true);
    try {
      const payload = {
        entity,
        field_key: fieldKey,
        label: label.trim(),
        field_type: fieldType,
        required,
        help_text: helpText.trim() || null,
        options: showOptions ? options.filter((o) => o.value && o.label) : null,
      };

      const url = isEditing ? `/api/settings/fields/${field!.id}` : "/api/settings/fields";
      const method = isEditing ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Save failed."); return; }

      onSaved(json.field as FieldDefinition);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEditing ? `Edit field — ${field?.field_key}` : "Add field"}
      size="md"
    >
      <div className="space-y-4">
        {/* Label */}
        <div>
          <Label htmlFor="f-label" required>Label</Label>
          <Input
            id="f-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Fleet size"
          />
        </div>

        {/* Field key */}
        <div>
          <Label htmlFor="f-key" required>Field key</Label>
          <Input
            id="f-key"
            value={fieldKey}
            onChange={(e) => { setFieldKey(e.target.value); setKeyEdited(true); }}
            placeholder="e.g. fleet_size"
            disabled={isEditing}
            className="font-mono"
          />
          {isEditing && (
            <p className="mt-1 text-xs text-[--text-tertiary]">
              Field key is read-only once created to preserve historical data.
            </p>
          )}
          {!isEditing && (
            <p className="mt-1 text-xs text-[--text-tertiary]">
              Lowercase letters, numbers, underscores only. Cannot be changed after creation.
            </p>
          )}
        </div>

        {/* Type */}
        <div>
          <Label htmlFor="f-type" required>Type</Label>
          <Select
            id="f-type"
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value as FieldType)}
            disabled={isEditing}
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
        </div>

        {/* Options (select/multiselect only) */}
        {showOptions && (
          <div>
            <Label required>Options</Label>
            <div className="space-y-2 mt-1">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder="Label"
                    value={opt.label}
                    onChange={(e) => updateOption(i, "label", e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="value"
                    value={opt.value}
                    onChange={(e) => updateOption(i, "value", e.target.value)}
                    className="flex-1 font-mono text-xs"
                  />
                  <button
                    onClick={() => removeOption(i)}
                    className="text-[--text-tertiary] hover:text-[--danger] p-1"
                    disabled={options.length === 1}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                onClick={addOptionRow}
                className="text-xs text-[--accent] hover:underline"
              >
                + Add option
              </button>
            </div>
          </div>
        )}

        {/* Required */}
        <Checkbox
          id="f-required"
          label="Required field"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
        />

        {/* Help text */}
        <div>
          <Label htmlFor="f-help">Help text <span className="text-[--text-tertiary] font-normal">(optional)</span></Label>
          <Textarea
            id="f-help"
            value={helpText}
            onChange={(e) => setHelpText(e.target.value)}
            placeholder="Shown below the input as a hint"
            rows={2}
          />
        </div>

        {error && (
          <p className="text-sm text-[--danger]">{error}</p>
        )}
      </div>

      <DialogFooter>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>
          {isEditing ? "Save changes" : "Add field"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
