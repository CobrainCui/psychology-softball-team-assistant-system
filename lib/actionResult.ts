/** Server Action 统一结果：禁止 throw 驱动前端分支；禁止 ActionResult<Record<string, never>> */
export type ActionOk<T extends object = object> = { success: true } & T;
export type ActionErr = { success: false; error: string };
export type ActionResult<T extends object = object> = ActionOk<T> | ActionErr;

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}
