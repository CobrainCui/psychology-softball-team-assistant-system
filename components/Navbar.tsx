"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearStoredCurrentUser, useCurrentUser } from "@/lib/currentUser";

const PLAYER_NAV_LINKS = [
  { href: "/", label: "测试清单" },
  { href: "/assessment", label: "综合状态评估" },
  { href: "/feedback", label: "训后反馈" },
  { href: "/prehab", label: "伤病预防" },
  { href: "/profile", label: "个人档案" },
];

/** 教练不录入训后反馈，只在摘要里看队员记录 */
const COACH_NAV_LINKS = [
  { href: "/", label: "测试清单" },
  { href: "/assessment", label: "综合状态评估" },
  { href: "/prehab", label: "伤病预防" },
  { href: "/coach", label: "教练摘要" },
  { href: "/profile", label: "个人档案" },
];

/** 未登录可直接进入的路由；其余需 softball_currentUser Session */
const PUBLIC_HREFS = new Set(["/"]);

function roleLabel(role: string | undefined): string {
  return role === "coach" ? "教练" : "队员";
}

export default function Navbar() {
  // Session 来自登录页写入的 softball_currentUser（云端 Player 精简凭证）
  const { currentUser, isMounted } = useCurrentUser();
  const router = useRouter();

  const navLinks =
    isMounted && currentUser?.role === "coach"
      ? COACH_NAV_LINKS
      : PLAYER_NAV_LINKS;

  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) => {
    if (PUBLIC_HREFS.has(href) || currentUser) return;
    e.preventDefault();
    router.push("/login");
  };

  const handleLogout = () => {
    clearStoredCurrentUser();
    window.location.href = "/";
  };

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
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span className="text-sm text-zinc-300">
          {isMounted && currentUser
            ? `${roleLabel(currentUser.role)} · ${currentUser.playerName}`
            : "未登录"}
        </span>
        {isMounted && currentUser ? (
          <button
            onClick={handleLogout}
            className="border border-zinc-700 px-3 py-1 text-xs text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
          >
            退出登录
          </button>
        ) : isMounted ? (
          <Link
            href="/login"
            className="border border-zinc-500 px-3 py-1 text-xs text-zinc-200 transition-colors hover:border-zinc-300 hover:text-white"
          >
            登录
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
