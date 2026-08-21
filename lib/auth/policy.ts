import type { AuthContext, RoleKind } from "@/lib/auth/types";

/** 推导步骤：已授予角色并集 → 固定能力表；禁止 activeView 参与鉴权 */
function hasRole(ctx: AuthContext, role: RoleKind): boolean {
  return ctx.roles.includes(role);
}

function isApprovedMember(ctx: AuthContext): boolean {
  return ctx.isApproved && Boolean(ctx.playerId);
}

export function canManageAccounts(ctx: AuthContext): boolean {
  return isApprovedMember(ctx) && hasRole(ctx, "admin");
}

export function canViewTeamHealth(ctx: AuthContext): boolean {
  return isApprovedMember(ctx) && hasRole(ctx, "coach");
}

export function canViewTeamOps(ctx: AuthContext): boolean {
  return (
    isApprovedMember(ctx) &&
    (hasRole(ctx, "captain") || hasRole(ctx, "coach"))
  );
}

export function canArchiveTestSession(ctx: AuthContext): boolean {
  return (
    isApprovedMember(ctx) &&
    (hasRole(ctx, "captain") || hasRole(ctx, "coach"))
  );
}

export function canEnterTestDayDraft(ctx: AuthContext): boolean {
  return isApprovedMember(ctx);
}

export function canWriteOwnHealthData(ctx: AuthContext): boolean {
  return isApprovedMember(ctx);
}

export function canReadOwnProfile(ctx: AuthContext): boolean {
  return isApprovedMember(ctx);
}

export function canManageSeason(ctx: AuthContext): boolean {
  return (
    isApprovedMember(ctx) &&
    (hasRole(ctx, "captain") || hasRole(ctx, "coach"))
  );
}

export function canManageSchedule(ctx: AuthContext): boolean {
  return canManageSeason(ctx);
}

export function canViewSchedule(ctx: AuthContext): boolean {
  return isApprovedMember(ctx);
}

export function canUploadScheduleFile(ctx: AuthContext): boolean {
  return isApprovedMember(ctx);
}

export function canCleanupSeasonUploads(ctx: AuthContext): boolean {
  return (
    isApprovedMember(ctx) &&
    (hasRole(ctx, "captain") || hasRole(ctx, "coach") || hasRole(ctx, "admin"))
  );
}

export function canHideSeasonEvidence(ctx: AuthContext): boolean {
  return isApprovedMember(ctx) && hasRole(ctx, "admin");
}

export function canViewTeamSeasonReports(ctx: AuthContext): boolean {
  return canViewTeamHealth(ctx);
}

/** coach 可见：具名象限、RPE 数值、活跃伤病摘要、脱敏周期标签；不含 note/rehab/周期原文 */
export function coachHealthFieldAllowed(
  field:
    | "quadrant"
    | "rpe"
    | "injury_summary"
    | "load_tag"
    | "feedback_note"
    | "injury_note"
    | "cycle_raw"
): boolean {
  switch (field) {
    case "quadrant":
    case "rpe":
    case "injury_summary":
    case "load_tag":
      return true;
    case "feedback_note":
    case "injury_note":
    case "cycle_raw":
      return false;
    default:
      return false;
  }
}

export function assertApproved(
  ctx: AuthContext
): { ok: true; playerId: string } | { ok: false; error: string } {
  if (!ctx.isApproved || !ctx.playerId) {
    return { ok: false, error: "账号尚未通过名册认领，暂不可操作" };
  }
  return { ok: true, playerId: ctx.playerId };
}

export function denyUnless(
  allowed: boolean,
  error: string
): { ok: true } | { ok: false; error: string } {
  if (!allowed) return { ok: false, error };
  return { ok: true };
}
