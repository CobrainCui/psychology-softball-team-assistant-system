"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/auth/authActions";
import { switchActiveView } from "@/lib/auth/meActions";
import { useSession } from "@/lib/useSession";
import type { ActiveView, RoleKind } from "@/lib/auth/types";

const PUBLIC_HREFS = new Set(["/login", "/register", "/setup"]);

function hasRole(roles: RoleKind[], role: RoleKind) {
  return roles.includes(role);
}

function navForView(view: ActiveView, roles: RoleKind[]) {
  const links: { href: string; label: string }[] = [];
  const effective: ActiveView =
    view === "coach" && hasRole(roles, "coach")
      ? "coach"
      : view === "captain" && hasRole(roles, "captain")
        ? "captain"
        : "player";

  if (effective === "coach") {
    links.push(
      { href: "/", label: "测试清单" },
      { href: "/schedule", label: "赛程" },
      { href: "/assessment", label: "综合状态评估" },
      { href: "/prehab", label: "运动损伤" },
      { href: "/coach", label: "教练摘要" },
      { href: "/profile", label: "个人档案" }
    );
  } else if (effective === "captain") {
    links.push(
      { href: "/", label: "测试清单" },
      { href: "/schedule", label: "赛程" },
      { href: "/assessment", label: "综合状态评估" },
      { href: "/feedback", label: "训后反馈" },
      { href: "/prehab", label: "运动损伤" },
      { href: "/team", label: "队务提交" },
      { href: "/profile", label: "个人档案" }
    );
  } else {
    links.push(
      { href: "/", label: "测试清单" },
      { href: "/schedule", label: "赛程" },
      { href: "/assessment", label: "综合状态评估" },
      { href: "/feedback", label: "训后反馈" },
      { href: "/prehab", label: "运动损伤" },
      { href: "/profile", label: "个人档案" }
    );
  }
  return links;
}

function roleLabel(roles: RoleKind[]): string {
  if (hasRole(roles, "admin")) return "管理员";
  if (hasRole(roles, "coach")) return "教练";
  if (hasRole(roles, "captain")) return "队长";
  return "队员";
}

function viewLabel(view: ActiveView): string {
  if (view === "coach") return "教练";
  if (view === "captain") return "队长";
  return "队员";
}

export default function Navbar() {
  const { user, isMounted, refresh } = useSession();
  const router = useRouter();

  const navLinks =
    user && user.claimStatus === "approved"
      ? navForView(user.activeView, user.roles)
      : user
        ? [{ href: "/", label: "首页" }]
        : [];

  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) => {
    if (PUBLIC_HREFS.has(href) || user) return;
    e.preventDefault();
    router.push("/login");
  };

  const handleSwitchView = async (view: ActiveView) => {
    if (!user || user.activeView === view) return;
    const res = await switchActiveView(view);
    if (!res.success) {
      console.error("云端被拒:", res.error);
      return;
    }
    await refresh();
  };

  const switchableViews = (["player", "captain", "coach"] as const).filter(
    (view) => user?.roles.includes(view)
  );

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  const displayName = user?.playerName ?? user?.username ?? "未登录";

  return (
    <nav className="flex flex-wrap items-center gap-4 bg-black px-6 py-4 text-white print:hidden">
      <span className="shrink-0 text-xl font-bold">Softball AI Engine</span>

      <div className="flex flex-1 flex-wrap items-center justify-evenly gap-4 md:gap-8">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={(e) => handleNavClick(e, link.href)}
            className="rounded px-2 py-2 text-sm text-zinc-300 transition-colors hover:text-white md:px-3 md:text-base"
          >
            {link.label}
          </Link>
        ))}
        {user && hasRole(user.roles, "admin") ? (
          <Link href="/admin" className="text-sm text-zinc-300 hover:text-white">
            账号
          </Link>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {isMounted && user && switchableViews.length > 1 ? (
          <label className="flex items-center gap-1 text-xs text-zinc-400">
            工作台
            <select
              value={
                switchableViews.includes(user.activeView)
                  ? user.activeView
                  : "player"
              }
              onChange={(e) => {
                void handleSwitchView(e.target.value as ActiveView);
              }}
              className="border border-zinc-600 bg-black px-1 py-0.5 text-xs text-zinc-200"
            >
              {switchableViews.map((view) => (
                <option key={view} value={view}>
                  {viewLabel(view)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <span className="text-sm text-zinc-300">
          {isMounted && user
            ? `${roleLabel(user.roles)} · ${displayName}`
            : "未登录"}
        </span>
        {isMounted && user ? (
          <button
            onClick={handleLogout}
            className="rounded border border-zinc-600 px-3 py-1 text-sm text-zinc-300 hover:border-white hover:text-white"
          >
            退出
          </button>
        ) : (
          <Link href="/login" className="text-sm text-zinc-300 hover:text-white">
            登录
          </Link>
        )}
      </div>
    </nav>
  );
}
