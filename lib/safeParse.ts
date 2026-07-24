// 防御性 JSON 解析：坏数据一律回退 fallback，禁止拖垮整页。

export function safeParseJSON<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
