"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface Props {
  settings: Record<string, string | null>;
}

export function BrandingForm({ settings }: Props) {
  const [brandName,  setBrandName]  = useState(settings.brand_name  ?? "Clearway AI");
  const [brandColor, setBrandColor] = useState(settings.brand_color ?? "#0F766E");
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null); setSaved(false);
    const res = await fetch("/api/settings/branding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand_name: brandName, brand_color: brandColor }),
    });
    setSaving(false);
    if (!res.ok) { setError("Save failed."); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <form onSubmit={handleSave} className="space-y-5">
      <div>
        <Label htmlFor="brand-name" required>Brand name</Label>
        <Input
          id="brand-name"
          value={brandName}
          onChange={(e) => setBrandName(e.target.value)}
          placeholder="Clearway AI"
        />
        <p className="mt-1 text-xs text-[--text-tertiary]">
          Shown in the sidebar header and email footers.
        </p>
      </div>

      <div>
        <Label htmlFor="brand-color" required>Accent colour</Label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            id="brand-color"
            value={brandColor}
            onChange={(e) => setBrandColor(e.target.value)}
            className="h-9 w-12 cursor-pointer rounded border border-[--border] bg-transparent p-0.5"
          />
          <Input
            value={brandColor}
            onChange={(e) => setBrandColor(e.target.value)}
            placeholder="#0F766E"
            className="w-36 font-mono"
          />
        </div>
        <p className="mt-1 text-xs text-[--text-tertiary]">
          Used for buttons, badges, and highlights. Reload the page to see the change.
        </p>
      </div>

      {error && <p className="text-sm text-[--danger]">{error}</p>}
      {saved && <p className="text-sm text-[--success]">Settings saved.</p>}

      <Button type="submit" variant="primary" loading={saving}>Save branding</Button>
    </form>
  );
}
