"use client";

import { useEffect, useState } from "react";
import { login, isSetupRequired } from "@/lib/auth/authActions";
import Link from "next/link";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void isSetupRequired().then((res) => {
        if (res.success && res.required) setSetupRequired(true);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const res = await login(username, password);
    if (!res.success) {
      console.error("云端被拒:", res.error);
      setError(res.error);
      setSubmitting(false);
      return;
    }
    window.location.href = "/";
  };

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-6 py-12">
      <h1 className="mb-2 text-2xl font-bold text-zinc-900">登录</h1>
      <p className="mb-8 text-sm text-zinc-500">
        使用用户名与密码登录。新队员请
        <Link href="/register" className="mx-1 underline">
          持入队码注册
        </Link>
        。
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm">
          <span className="text-zinc-600">用户名</span>
          <input
            className="mt-1 w-full border border-zinc-300 px-3 py-2"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-600">密码</span>
          <input
            type="password"
            className="mt-1 w-full border border-zinc-300 px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-black py-2 text-white disabled:opacity-50"
        >
          {submitting ? "登录中…" : "登录"}
        </button>
      </form>
      <p className="mt-6 text-xs text-zinc-500">
        忘记密码请联系管理员重置。无 SMTP 时不支持自助找回。
      </p>
      {setupRequired ? (
        <p className="mt-4 text-sm text-zinc-600">
          首次部署尚未创建管理员，请前往
          <Link href="/setup" className="mx-1 underline">
            系统初始化
          </Link>
          。
        </p>
      ) : null}
    </main>
  );
}
