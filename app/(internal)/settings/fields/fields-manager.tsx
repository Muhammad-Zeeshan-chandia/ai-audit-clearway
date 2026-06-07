"use client";

import React, { useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { KeyboardSensor } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AddEditModal } from "./add-edit-modal";
import type { FieldDefinition, FieldType } from "@/lib/types";

const ENTITY_TABS = [
  { key: "client",        label: "Client fields" },
  { key: "questionnaire", label: "Questionnaire fields" },
];

interface Props {
  initialClientFields: FieldDefinition[];
  initialQuestionnaireFields: FieldDefinition[];
}

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text:        "Text",
  number:      "Number",
  email:       "Email",
  boolean:     "Yes/No",
  select:      "Select",
  multiselect: "Multi-select",
  long_text:   "Long text",
  date:        "Date",
};

export function FieldsManager({ initialClientFields, initialQuestionnaireFields }: Props) {
  const [tab, setTab] = useState<"client" | "questionnaire">("client");
  const [clientFields, setClientFields] = useState(initialClientFields);
  const [questionnaireFields, setQuestionnaireFields] = useState(initialQuestionnaireFields);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<FieldDefinition | null>(null);

  const fields = tab === "client" ? clientFields : questionnaireFields;
  const setFields = tab === "client" ? setClientFields : setQuestionnaireFields;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);
    const reordered = arrayMove(fields, oldIndex, newIndex).map((f, i) => ({
      ...f,
      display_order: (i + 1) * 10,
    }));

    setFields(reordered);

    // Persist reorder
    await fetch("/api/settings/fields/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: reordered.map((f) => ({ id: f.id, display_order: f.display_order })),
      }),
    });
  }

  async function toggleActive(field: FieldDefinition) {
    const updated = { ...field, active: !field.active };
    setFields(fields.map((f) => (f.id === field.id ? updated : f)));
    await fetch(`/api/settings/fields/${field.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: updated.active }),
    });
  }

  async function toggleRequired(field: FieldDefinition) {
    const updated = { ...field, required: !field.required };
    setFields(fields.map((f) => (f.id === field.id ? updated : f)));
    await fetch(`/api/settings/fields/${field.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ required: updated.required }),
    });
  }

  async function handleDelete(field: FieldDefinition) {
    if (!confirm(`Deactivate "${field.label}"? It will be hidden from new forms but historical data is preserved.`)) return;
    setFields(fields.map((f) => (f.id === field.id ? { ...f, active: false } : f)));
    await fetch(`/api/settings/fields/${field.id}`, { method: "DELETE" });
  }

  function handleSaved(saved: FieldDefinition) {
    if (editingField) {
      setFields(fields.map((f) => (f.id === saved.id ? saved : f)));
    } else {
      setFields([...fields, saved]);
    }
    setModalOpen(false);
    setEditingField(null);
  }

  return (
    <div>
      <Tabs
        items={ENTITY_TABS}
        active={tab}
        onChange={(k) => setTab(k as "client" | "questionnaire")}
        className="mb-5"
      />

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[--text-tertiary]">
          {fields.length} field{fields.length !== 1 ? "s" : ""} — drag to reorder
        </p>
        <Button
          variant="primary"
          size="sm"
          onClick={() => { setEditingField(null); setModalOpen(true); }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add field
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          <div className="rounded-md border border-[--border] divide-y divide-[--border]">
            {fields.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-[--text-tertiary]">
                No fields yet. Click &quot;Add field&quot; to create the first one.
              </div>
            )}
            {fields.map((field) => (
              <SortableRow
                key={field.id}
                field={field}
                onEdit={() => { setEditingField(field); setModalOpen(true); }}
                onDelete={() => handleDelete(field)}
                onToggleActive={() => toggleActive(field)}
                onToggleRequired={() => toggleRequired(field)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <AddEditModal
        open={modalOpen}
        entity={tab}
        field={editingField}
        onClose={() => { setModalOpen(false); setEditingField(null); }}
        onSaved={handleSaved}
      />
    </div>
  );
}

function SortableRow({
  field,
  onEdit,
  onDelete,
  onToggleActive,
  onToggleRequired,
}: {
  field: FieldDefinition;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
  onToggleRequired: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 bg-[--bg-primary] px-4 py-3"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-[--text-tertiary] hover:text-[--text-secondary] touch-none"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Field info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${field.active ? "text-[--text-primary]" : "text-[--text-tertiary] line-through"}`}>
            {field.label}
          </span>
          <Badge variant="neutral">{FIELD_TYPE_LABELS[field.field_type] ?? field.field_type}</Badge>
          {field.required && <Badge variant="accent">Required</Badge>}
          {!field.active && <Badge variant="neutral">Inactive</Badge>}
        </div>
        <p className="text-xs text-[--text-tertiary] font-mono mt-0.5">{field.field_key}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button
          title={field.required ? "Mark optional" : "Mark required"}
          onClick={onToggleRequired}
          className="rounded p-1.5 text-xs text-[--text-tertiary] hover:bg-[--bg-secondary] hover:text-[--text-primary] transition-colors"
        >
          {field.required ? "Req" : "Opt"}
        </button>
        <button
          title={field.active ? "Deactivate" : "Activate"}
          onClick={onToggleActive}
          className="rounded p-1.5 text-[--text-tertiary] hover:bg-[--bg-secondary] hover:text-[--text-primary] transition-colors"
        >
          {field.active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
        <button
          title="Edit"
          onClick={onEdit}
          className="rounded p-1.5 text-[--text-tertiary] hover:bg-[--bg-secondary] hover:text-[--text-primary] transition-colors"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          title="Deactivate (soft delete)"
          onClick={onDelete}
          className="rounded p-1.5 text-[--text-tertiary] hover:bg-[--bg-secondary] hover:text-[--danger] transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
