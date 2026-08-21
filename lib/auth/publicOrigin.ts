/**
 * 重置链接等对外 URL 的站点 origin。
 * 生产必须显式配置 NEXT_PUBLIC_APP_URL，禁止静默落到 localhost。
 */
export function resolvePublicAppOrigin(
  env: {
    NODE_ENV?: string;
    NEXT_PUBLIC_APP_URL?: string;
    VERCEL_URL?: string;
  } = process.env
): { ok: true; origin: string } | { ok: false; error: string } {
  const raw = env.NEXT_PUBLIC_APP_URL?.trim();
  if (raw) {
    try {
      const url = new URL(raw);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return { ok: false, error: "NEXT_PUBLIC_APP_URL 须为 http(s) 地址" };
      }
      if (url.username || url.password) {
        return { ok: false, error: "NEXT_PUBLIC_APP_URL 不能含凭据" };
      }
      return { ok: true, origin: url.origin };
    } catch {
      return { ok: false, error: "NEXT_PUBLIC_APP_URL 无效" };
    }
  }

  if (env.NODE_ENV === "production") {
    return { ok: false, error: "生产环境须配置 NEXT_PUBLIC_APP_URL" };
  }

  const vercel = env.VERCEL_URL?.trim();
  if (vercel) {
    try {
      const url = vercel.startsWith("http")
        ? new URL(vercel)
        : new URL(`https://${vercel}`);
      return { ok: true, origin: url.origin };
    } catch {
      return { ok: false, error: "VERCEL_URL 无效" };
    }
  }

  return { ok: true, origin: "http://localhost:3000" };
}
