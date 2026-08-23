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

  const applyResult = async (res: { success: true } | { success: false; error: string }) => {
    if (res.success) {
      setMessage("已更新");
      await reload();
      return;
    }
    console.error("云端被拒:", res.error);
    setMessage(res.error);
  };

  const handleGrant = async (accountId: string, role: "captain" | "coach") => {
    await applyResult(await grantRole(accountId, role));
  };

  const handleRevoke = async (accountId: string, role: "captain" | "coach") => {
    const label = role === "coach" ? "教练" : "队长";
    if (!window.confirm(`确认撤销该账号的${label}权限？`)) return;
    await applyResult(await revokeRole(accountId, role));
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
        <section className="space-y-4">
          <p className="text-xs leading-relaxed text-zinc-500">
            已认领成员的队长/教练权限由管理员在此直接设置，不必等队员申请。待认领账号须先在「认领」批准。档案页申请仅为可选入口。
          </p>
          {roleRequests.length > 0 ? (
            <div>
              <h2 className="mb-2 text-sm font-semibold">待批申请（可选）</h2>
              {roleRequests.map((r) => (
                <div
                  key={r.id}
                  className="mb-2 flex justify-between border border-zinc-200 p-3 text-sm"
                >
                  <span>
                    {r.username} → {r.requestedRole === "coach" ? "教练" : "队长"}
                  </span>
                  <button
                    type="button"
                    className="underline"
                    onClick={async () => {
                      const res = await approveRoleChangeRequest(r.id);
                      await applyResult(res.success ? { success: true } : res);
                    }}
                  >
                    批准
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <ul className="divide-y border border-zinc-200 bg-white text-sm">
            {accounts.map((a) => (
              <li
                key={a.accountId}
                className="flex flex-wrap items-center gap-2 px-4 py-3"
              >
                <span className="font-medium">{a.username}</span>
                <span className="text-zinc-500">
                  {a.roles.length > 0 ? a.roles.join(", ") : "无角色"}
                </span>
                <span className="text-zinc-400">
                  {a.claimStatus ?? "无认领"}
                  {a.playerName ? ` · ${a.playerName}` : ""}
                </span>
                {a.roles.includes("coach") ? (
                  <button
                    type="button"
                    className="ml-auto text-xs underline"
                    onClick={() => void handleRevoke(a.accountId, "coach")}
                  >
                    撤销教练
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ml-auto text-xs underline"
                    onClick={() => void handleGrant(a.accountId, "coach")}
                  >
                    设为教练
                  </button>
                )}
                {a.roles.includes("captain") ? (
                  <button
                    type="button"
                    className="text-xs underline"
                    onClick={() => void handleRevoke(a.accountId, "captain")}
                  >
                    撤销队长
                  </button>
                ) : (
                  <button
                    type="button"
                    className="text-xs underline"
                    onClick={() => void handleGrant(a.accountId, "captain")}
                  >
                    设为队长
                  </button>
                )}
                <button
                  type="button"
                  className="text-xs underline"
                  onClick={async () => {
                    const res = await createPasswordResetLink(a.accountId);
                    if (res.success) setMessage(`重置链接：${res.url}`);
                    else {
                      console.error("云端被拒:", res.error);
                      setMessage(res.error);
                    }
                  }}
                >
                  重置链接
                </button>
                <button
                  type="button"
                  className="text-xs text-red-600 underline"
                  onClick={async () => {
                    if (!window.confirm(`确认停用账号 ${a.username}？`)) return;
                    await applyResult(await disableAccount(a.accountId));
                  }}
                >
                  停用
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
