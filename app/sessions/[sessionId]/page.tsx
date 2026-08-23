import { redirect } from "next/navigation";
import { isAdminOpsOnly } from "@/lib/auth/policy";
import { getSessionFromCookie } from "@/lib/auth/session";
import ArchivedSessionDetail from "@/components/test-day/ArchivedSessionDetail";

export default async function ArchivedSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const ctx = await getSessionFromCookie();
  if (!ctx) redirect("/login");
  if (isAdminOpsOnly(ctx)) redirect("/admin");
  const { sessionId } = await params;
  if (!sessionId) redirect("/");
  return <ArchivedSessionDetail sessionId={sessionId} />;
}
