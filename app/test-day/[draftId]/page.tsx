import { redirect } from "next/navigation";
import { isAdminOpsOnly } from "@/lib/auth/policy";
import { getSessionFromCookie } from "@/lib/auth/session";
import TestDayClient from "@/app/TestDayClient";

export default async function TestDayDraftPage({
  params,
}: {
  params: Promise<{ draftId: string }>;
}) {
  const ctx = await getSessionFromCookie();
  if (!ctx) redirect("/login");
  if (isAdminOpsOnly(ctx)) redirect("/admin");
  const { draftId } = await params;
  if (!draftId) redirect("/");
  return <TestDayClient draftId={draftId} />;
}
