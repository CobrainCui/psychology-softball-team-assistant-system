"use client";

import { useRequireAuth } from "@/lib/useRequireAuth";
import PageLoading from "@/components/PageLoading";
import { useEffect, useState } from "react";
import {
  approveMembershipClaim,
  listPendingClaims,
} from "@/lib/auth/claimActions";
import {
  grantRole,
  revokeRole,
  approveRoleChangeRequest,
  listRoleChangeRequests,
} from "@/lib/auth/roleActions";
import { generateEnrollmentCodes, revokeEnrollmentCode } from "@/lib/auth/enrollActions";
import { createPasswordResetLink } from "@/lib/auth/resetActions";
import {
  listAccountsForAdmin,
  disableAccount,
  listEnrollmentCodes,
} from "@/lib/auth/adminActions";

import type { PendingClaimRow } from "@/lib/auth/claimActions";
import type { AdminAccountRow } from "@/lib/auth/adminActions";

export default function AdminPage() {
  const { currentUser, isMounted, loading } = useRequireAuth();
  const [tab, setTab] = useState<"claims" | "codes" | "accounts">("claims");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<PendingClaimRow[]>([]);
  const [codes, setCodes] = useState<
    {
      id: string;
      status: string;
      expiresAt: string | null;
      usedAt: string | null;
      revokedAt: string | null;
      revokedNote: string | null;
    }[]
  >([]);
  const [accounts, setAccounts] = useState<AdminAccountRow[]>([]);
  const [newCodes, setNewCodes] = useState<string[]>([]);
  const [roleRequests, setRoleRequests] = useState<
    {
      id: string;
      accountId: string;
      username: string;
      requestedRole: string;
      createdAt: string;
    }[]
  >([]);

  const reload = async () => {
    const [c, cd, a, r] = await Promise.all([
      listPendingClaims(),
      listEnrollmentCodes(),
      listAccountsForAdmin(),
      listRoleChangeRequests(),
    ]);
    if (c.success) setPending(c.claims);
    if (cd.success) setCodes(cd.codes);
    if (a.success) setAccounts(a.accounts);
    if (r.success) setRoleRequests(r.requests);
  };

  useEffect(() => {
    if (!isMounted || loading || !currentUser?.roles.includes("admin")) return;
    const timer = window.setTimeout(() => {
      void reload();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isMounted, loading, currentUser]);

  if (!isMounted || loading) return <PageLoading />;
  if (!currentUser?.roles.includes("admin")) {
    return (
      <main className="px-6 py-12 text-center text-zinc-500">仅管理员可访问</main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold">账号管理</h1>
      {message ? <p className="mb-4 text-sm text-zinc-600">{message}</p> : null}

      <div className="mb-6 flex gap-2 text-sm">
        {(["claims", "codes", "accounts"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`border px-3 py-1 ${tab === t ? "border-black bg-black text-white" : "border-zinc-300"}`}
          >
            {t === "claims" ? "认领" : t === "codes" ? "入队码" : "账户"}
          </button>
        ))}
      </div>

      {tab === "claims" ? (
        <section className="space-y-4">
          {pending.length === 0 ? (
            <p className="text-sm text-zinc-500">无待认领</p>
          ) : (
            pending.map((c) => (
              <div
                key={c.claimId}
                className="flex items-center justify-between border border-zinc-200 bg-white p-4"
              >
                <div>
                  <p className="font-medium">{c.displayName}</p>
                  <p className="text-xs text-zinc-500">@{c.username}</p>
                </div>
                <button
                  type="button"
                  className="bg-black px-3 py-1 text-sm text-white"
                  onClick={async () => {
                    const res = await approveMembershipClaim({
                      claimId: c.claimId,
                      newPlayerName: c.displayName,
                    });
                    setMessage(res.success ? "已批准（新建名册）" : res.error);
                    await reload();
                  }}
                >
                  批准并新建
                </button>
              </div>
            ))
          )}
          {roleRequests.length > 0 ? (
            <div className="mt-8">
              <h2 className="mb-2 font-semibold">角色申请</h2>
              {roleRequests.map((r) => (
                <div
                  key={r.id}
                  className="mb-2 flex justify-between border border-zinc-200 p-3 text-sm"
                >
                  <span>
                    {r.username} → {r.requestedRole}
                  </span>
                  <button
                    type="button"
                    className="underline"
                    onClick={async () => {
                      await approveRoleChangeRequest(r.id);
                      await reload();
                    }}
                  >
                    批准
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === "codes" ? (
        <section className="space-y-4">
          <button
            type="button"
            className="bg-black px-4 py-2 text-sm text-white"
            onClick={async () => {
              const res = await generateEnrollmentCodes(5);
              if (res.success) {
                setNewCodes(res.codes);
                setMessage("以下入队码仅显示一次，请复制后发群");
              } else setMessage(res.error);
              await reload();
            }}
          >
            生成 5 个单次入队码
          </button>
          {newCodes.length > 0 ? (
            <ul className="font-mono text-sm">
              {newCodes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : null}
          <ul className="text-xs text-zinc-500">
            {codes.map((c) => (
              <li key={c.id} className="flex justify-between py-1">
                <span>
                  {c.status} · 过期 {c.expiresAt?.slice(0, 10) ?? "—"}
                </span>
                {c.status === "active" ? (
                  <button
                    type="button"
                    className="underline"
                    onClick={async () => {
                      await revokeEnrollmentCode(c.id, "已从群文档移除");
                      await reload();
                    }}
                  >
                    登记作废
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === "accounts" ? (
        <ul className="divide-y border border-zinc-200 bg-white text-sm">
          {accounts.map((a) => (
            <li key={a.accountId} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <span className="font-medium">{a.username}</span>
              <span className="text-zinc-500">{a.roles.join(", ")}</span>
              <span className="text-zinc-400">{a.claimStatus}</span>
              <button
                type="button"
                className="ml-auto text-xs underline"
                onClick={async () => {
                  await grantRole(a.accountId, "coach");
                  await reload();
                }}
              >
                +coach
              </button>
              {a.roles.includes("coach") ? (
                <button
                  type="button"
                  className="text-xs underline"
                  onClick={async () => {
                    await revokeRole(a.accountId, "coach");
                    await reload();
                  }}
                >
                  −coach
                </button>
              ) : null}
              <button
                type="button"
                className="text-xs underline"
                onClick={async () => {
                  await grantRole(a.accountId, "captain");
                  await reload();
                }}
              >
                +captain
              </button>
              {a.roles.includes("captain") ? (
                <button
                  type="button"
                  className="text-xs underline"
                  onClick={async () => {
                    await revokeRole(a.accountId, "captain");
                    await reload();
                  }}
                >
                  −captain
                </button>
              ) : null}
              <button
                type="button"
                className="text-xs underline"
                onClick={async () => {
                  const res = await createPasswordResetLink(a.accountId);
                  if (res.success) setMessage(`重置链接：${res.url}`);
                }}
              >
                重置链接
              </button>
              <button
                type="button"
                className="text-xs text-red-600 underline"
                onClick={async () => {
                  await disableAccount(a.accountId);
                  await reload();
                }}
              >
                停用
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
