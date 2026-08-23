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
          本机草稿（仅单设备恢复，不能代替云端场次）
        </summary>
        <p className="mt-2 text-xs text-zinc-500">
          正式成绩只从上方云端场次归档。此处不会同步到其他设备，也不要当成已上云。
        </p>
        <TestDayClient />
      </details>
    </div>
  );
}
