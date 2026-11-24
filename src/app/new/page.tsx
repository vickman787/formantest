import BriefForm from "@/components/BriefForm";
import { SERVICES, SERVICE_IDS, type ServiceId } from "@/lib/services";

export default async function NewProject({ searchParams }: { searchParams: Promise<{ service?: string }> }) {
  const sp = await searchParams;
  const service: ServiceId = (SERVICE_IDS as readonly string[]).includes(sp.service ?? "")
    ? (sp.service as ServiceId)
    : "business_website";
  return (
    <div className="wrap" style={{ paddingTop: 32 }}>
      <h1 style={{ fontSize: 33, marginBottom: 8 }}>Let&apos;s make something good.</h1>
      <p style={{ color: "var(--muted)", marginTop: 0, marginBottom: 24 }}>Start with a little about your business. We&apos;ll take it from there. The form is prefilled with an example — replace it with your own details.</p>
      <BriefForm service={service} />
    </div>
  );
}
