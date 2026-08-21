export const AUTH_PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/setup",
  "/reset",
] as const;

export function isAuthPublicPath(pathname: string): boolean {
  return AUTH_PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
