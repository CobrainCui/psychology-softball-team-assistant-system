"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getMatchWindow } from "@/lib/season/scheduleActions";
import type { MatchWindowDto } from "@/lib/season/types";

export default function MatchWindowBanner() {
  const [windowInfo, setWindowInfo] = useState<MatchWindowDto | null>(null);
  const [offseason, setOffseason] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getMatchWindow().then((res) => {
      if (cancelled || !res.success) return;
      setOffseason(res.offseason);
      setWindowInfo(res.window);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (windowInfo) {
    return (
      <div className="border border-zinc-900 bg-white px-4 py-3 text-sm">
        <p className="font-medium">比赛日 · {windowInfo.title}</p>
        <p className="text-zinc-500">
          {windowInfo.opponent ? `对手 ${windowInfo.opponent} · ` : ""}
          {windowInfo.displayStart} – {windowInfo.displayEnd}
        </p>
        <Link href="/schedule" className="mt-1 inline-block underline">
          打开赛程
        </Link>
      </div>
    );
  }
  if (offseason) {
    return (
      <p className="text-center text-xs text-zinc-500">
        当前非赛季 · 评估与伤病仍可自愿填写
      </p>
    );
  }
  return null;
}
