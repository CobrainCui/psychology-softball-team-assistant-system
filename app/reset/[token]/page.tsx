"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { consumePasswordResetToken } from "@/lib/auth/resetActions";

export default function ResetPasswordPage() {
  const params = useParams();
  const router = useRouter();
  const token = typeof params.token === "string" ? params.token : "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await consumePasswordResetToken(token, password);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/login"), 2000);
  };

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <h1 className="mb-6 text-2xl font-bold">设置新密码</h1>
      {done ? (
        <p className="text-green-700">密码已更新，即将跳转登录…</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            className="w-full border border-zinc-300 px-3 py-2"
            placeholder="新密码（至少 8 位）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button type="submit" className="w-full bg-black py-2 text-white">
            确认
          </button>
        </form>
      )}
    </main>
  );
}
