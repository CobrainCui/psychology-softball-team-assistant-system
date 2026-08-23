import { redirect } from "next/navigation";
import { isAdminOpsOnly } from "@/lib/auth/policy";
import { getSessionFromCookie } from "@/lib/auth/session";
import TestDayClient from "./TestDayClient";
import TestDayLobby from "@/components/test-day/TestDayLobby";

export default async function Home() {
  const ctx = await getSessionFromCookie();
  if (!ctx) redirect("/login");
  if (isAdminOpsOnly(ctx)) redirect("/admin");
  return (
    <div className="flex flex-1 flex-col">
      <TestDayLobby />
      <details className="mx-auto w-full max-w-5xl px-4 py-4">
        <summary className="cursor-pointer text-sm text-zinc-600">
          本机草稿（未加入云端场次时）
        </summary>
        <TestDayClient />
      </details>
    </div>
  );
}
