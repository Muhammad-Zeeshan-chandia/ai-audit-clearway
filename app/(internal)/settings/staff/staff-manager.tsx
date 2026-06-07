"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Plus, Copy } from "lucide-react";

interface StaffMember {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
}

interface Props {
  staff: StaffMember[];
  currentUserId: string;
}

export function StaffManager({ staff: initialStaff, currentUserId }: Props) {
  const [staff, setStaff] = useState(initialStaff);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setInviting(true); setInviteError(null);

    const res = await fetch("/api/settings/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, full_name: inviteName }),
    });

    const json = await res.json();
    setInviting(false);

    if (!res.ok) { setInviteError(json.error ?? "Invite failed."); return; }

    setInviteLink(json.invite_link);
    // Add placeholder to list
    setStaff((prev) => [...prev, {
      id: "pending-" + inviteEmail,
      email: inviteEmail,
      full_name: inviteName || null,
      role: "staff",
      created_at: new Date().toISOString(),
    }]);
  }

  async function handleRoleChange(memberId: string, role: string) {
    if (memberId === currentUserId) return;
    setStaff((prev) => prev.map((m) => m.id === memberId ? { ...m, role } : m));
    await fetch(`/api/settings/staff/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
  }

  function copyLink() {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function closeInviteModal() {
    setInviteOpen(false);
    setInviteEmail(""); setInviteName("");
    setInviteLink(null); setInviteError(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" size="sm" onClick={() => setInviteOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Invite staff
        </Button>
      </div>

      <div className="overflow-hidden rounded-md border border-[--border]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[--border] bg-[--bg-secondary]">
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Name</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Email</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Role</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Joined</th>
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-[--text-tertiary]">No staff members yet.</td></tr>
            )}
            {staff.map((m) => (
              <tr key={m.id} className="border-b border-[--border] last:border-0">
                <td className="px-4 py-3 font-medium text-[--text-primary]">
                  {m.full_name ?? "—"}
                  {m.id === currentUserId && <Badge variant="accent" className="ml-2">You</Badge>}
                </td>
                <td className="px-4 py-3 text-[--text-secondary]">{m.email}</td>
                <td className="px-4 py-3">
                  {m.id === currentUserId ? (
                    <Badge variant="accent">{m.role}</Badge>
                  ) : (
                    <Select
                      value={m.role}
                      onChange={(e) => handleRoleChange(m.id, e.target.value)}
                      className="w-28 text-xs"
                    >
                      <option value="admin">admin</option>
                      <option value="staff">staff</option>
                    </Select>
                  )}
                </td>
                <td className="px-4 py-3 text-[--text-tertiary] text-xs">
                  {new Date(m.created_at).toLocaleDateString("en-GB")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        open={inviteOpen}
        onClose={closeInviteModal}
        title="Invite staff member"
        size="sm"
      >
        {!inviteLink ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="invite-email" required>Email address</Label>
              <Input id="invite-email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="name@company.com" />
            </div>
            <div>
              <Label htmlFor="invite-name">Full name <span className="text-[--text-tertiary] font-normal">(optional)</span></Label>
              <Input id="invite-name" value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Luke Smith" />
            </div>
            {inviteError && <p className="text-sm text-[--danger]">{inviteError}</p>}
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={closeInviteModal} disabled={inviting}>Cancel</Button>
              <Button variant="primary" size="sm" loading={inviting} onClick={handleInvite} disabled={!inviteEmail.trim()}>Send invite</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[--text-secondary]">
              Invite link generated. Share it with <strong>{inviteEmail}</strong>:
            </p>
            <div className="flex items-center gap-2 rounded-md border border-[--border] bg-[--bg-tertiary] px-3 py-2">
              <p className="flex-1 truncate font-mono text-xs text-[--text-secondary]">{inviteLink}</p>
              <button onClick={copyLink} className="shrink-0 text-[--accent] hover:underline text-xs flex items-center gap-1">
                <Copy className="h-3.5 w-3.5" />
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="text-xs text-[--text-tertiary]">The link expires after 24 hours. The user will have the &apos;staff&apos; role on first sign-in.</p>
            <DialogFooter>
              <Button variant="primary" size="sm" onClick={closeInviteModal}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </Dialog>
    </div>
  );
}
