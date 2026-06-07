import { redirect, notFound } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Download, Calendar } from "lucide-react";

export default async function PortalAuditPage({
  params,
}: {
  params: { audit_id: string };
}) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS already restricts clients to only see status='sent' audits
  const { data: audit, error } = await supabase
    .from("audits")
    .select("id, status, pdf_path, sent_at, total_opportunity_gbp, final_tier, clients(email, business_name)")
    .eq("id", params.audit_id)
    .single();

  if (error || !audit) notFound();

  // Verify ownership
  const rawClients = audit.clients as Array<{ email: string; business_name: string }> | null;
  const clientData = (Array.isArray(rawClients) ? rawClients[0] : rawClients as unknown as { email: string; business_name: string } | null);
  if (!clientData || clientData.email.toLowerCase() !== user.email!.toLowerCase()) {
    redirect("/portal");
  }

  if (audit.status !== "sent") redirect("/portal");

  // Signed URL for PDF (5 min)
  let pdfUrl: string | null = null;
  if (audit.pdf_path) {
    const { data } = await createServiceClient().storage
      .from("pdfs")
      .createSignedUrl(audit.pdf_path, 300);
    pdfUrl = data?.signedUrl ?? null;
  }

  const fmt = (v: number) =>
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      maximumFractionDigits: 0,
    }).format(v);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[--accent]">
          {clientData.business_name}
        </p>
        <h1 className="mt-1 text-xl font-semibold text-[--text-primary]">
          Your AI Business Audit Report
        </h1>
        {audit.sent_at && (
          <p className="mt-1 text-sm text-[--text-secondary]">
            Delivered {new Date(audit.sent_at).toLocaleDateString("en-GB")}
          </p>
        )}
      </div>

      {/* Summary card */}
      {audit.total_opportunity_gbp != null && (
        <div className="rounded-md border border-[--border] bg-[--accent-light] px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[--accent]">
            Total annual opportunity identified
          </p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-[--accent]">
            {fmt(Number(audit.total_opportunity_gbp))}
          </p>
          {audit.final_tier && (
            <p className="mt-0.5 text-sm text-[--accent]">Tier: {String(audit.final_tier)}</p>
          )}
        </div>
      )}

      {/* PDF */}
      {pdfUrl ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <a href={pdfUrl} download>
              <Button variant="secondary" size="sm">
                <Download className="h-3.5 w-3.5" />
                Download report
              </Button>
            </a>
            <a
              href="https://cal.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="ghost" size="sm">
                <Calendar className="h-3.5 w-3.5" />
                Book a follow-up call
              </Button>
            </a>
          </div>
          <div className="h-[650px] overflow-hidden rounded-md border border-[--border]">
            <iframe src={pdfUrl} className="h-full w-full" title="Audit report" />
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-[--border] bg-[--bg-secondary] px-6 py-8 text-center">
          <p className="text-sm text-[--text-tertiary]">
            Your PDF report will appear here shortly.
          </p>
        </div>
      )}
    </div>
  );
}
