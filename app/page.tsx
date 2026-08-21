import { redirect } from "next/navigation";
import { getSessionFromCookie } from "@/lib/auth/session";
import TestDayClient from "./TestDayClient";

export default async function Home() {
  const ctx = await getSessionFromCookie();
  if (!ctx) redirect("/login");
  return <TestDayClient />;
}
