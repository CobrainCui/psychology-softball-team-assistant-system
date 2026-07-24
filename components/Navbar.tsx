"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearStoredCurrentUser, useCurrentUser } from "@/lib/currentUser";

const NAV_LINKS = [
  { href: "/", label: "测试清单" },
  { href: "/assessment", label: "综合状态评估" },
  { href: "/prehab", label: "伤病预防" },
  { href: "/profile", label: "个人档案" },
];

const PUBLIC_HREFS = new Set(["/"]);

export default function Navbar() {
  const { currentUser, isMounted } = useCurrentUser();
  const router = useRouter();

  // 身份锁：公开页放行；其余未登录时拦截到 /login
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
        {NAV_LINKS.map((link) => (
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
          {isMounted && currentUser ? `身份: ${currentUser.playerName}` : "未登录"}
        </span>
        {isMounted && currentUser && (
          <button
            onClick={handleLogout}
            className="border border-zinc-700 px-3 py-1 text-xs text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
          >
            退出登录
          </button>
        )}
      </div>
    </nav>
  );
}
