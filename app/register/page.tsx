"use client";

import { useState } from "react";
import Link from "next/link";
import { registerWithEnrollmentCode } from "@/lib/auth/enrollActions";

export default function RegisterPage() {
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const res = await registerWithEnrollmentCode({
      code,
      username,
      password,
      displayName,
    });
    if (!res.success) {
      console.error("注册失败:", res.error);
      setError(res.error);
      setSubmitting(false);
      return;
    }
    window.location.href = "/";
  };

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-6 py-12">
      <h1 className="mb-2 text-2xl font-bold">队员注册</h1>
      <p className="mb-8 text-sm text-zinc-500">
        输入群内发放的<strong>单次入队码</strong>，设置最终用户名与密码。注册后须等待管理员认领名册。
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm">
          <span className="text-zinc-600">入队码</span>
          <input
            className="mt-1 w-full border border-zinc-300 px-3 py-2 font-mono"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-600">用户名（登录用，非姓名）</span>
          <input
            className="mt-1 w-full border border-zinc-300 px-3 py-2"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-600">密码（至少 8 位）</span>
          <input
            type="password"
            className="mt-1 w-full border border-zinc-300 px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-600">显示姓名（供管理员认领）</span>
          <input
            className="mt-1 w-full border border-zinc-300 px-3 py-2"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-black py-2 text-white disabled:opacity-50"
        >
          {submitting ? "提交中…" : "注册"}
        </button>
      </form>
      <p className="mt-6 text-sm text-zinc-500">
        已有账号？
        <Link href="/login" className="ml-1 underline">
          去登录
        </Link>
      </p>
    </main>
  );
}
