"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { bootstrapAdmin, isSetupRequired, login } from "@/lib/auth/authActions";

export default function SetupPage() {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    isSetupRequired().then((res) => {
      if (res.success && !res.required) {
        router.replace("/login");
      }
      setChecking(false);
    });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const res = await bootstrapAdmin({ secret, username, password });
    if (!res.success) {
      setError(res.error);
      return;
    }
    const loginRes = await login(username, password);
    if (!loginRes.success) {
      window.location.href = "/login";
      return;
    }
    window.location.href = "/admin";
  };

  if (checking) {
    return (
      <main className="px-6 py-12 text-center text-zinc-500">检查初始化状态…</main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <h1 className="mb-2 text-2xl font-bold">系统初始化</h1>
      <p className="mb-8 text-sm text-zinc-500">
        仅首次部署可用。须持有环境变量中的引导密钥。
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm">
          <span className="text-zinc-600">引导密钥</span>
          <input
            type="password"
            className="mt-1 w-full border border-zinc-300 px-3 py-2"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-600">管理员用户名</span>
          <input
            className="mt-1 w-full border border-zinc-300 px-3 py-2"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
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
            required
          />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button type="submit" className="w-full bg-black py-2 text-white">
          创建管理员
        </button>
      </form>
    </main>
  );
}
