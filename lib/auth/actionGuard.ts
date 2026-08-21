import type { ActionResult } from "@/lib/actionResult";
import type { AuthContext } from "@/lib/auth/types";
import { requireSessionAction } from "@/lib/auth/requireSession";
import {
  assertApproved,
  canArchiveTestSession,
  canCleanupSeasonUploads,
  canHideSeasonEvidence,
  canManageAccounts,
  canManageSchedule,
  canReadOwnProfile,
  canUploadScheduleFile,
  canViewSchedule,
  canViewTeamHealth,
  canViewTeamOps,
  canViewTeamSeasonReports,
  canWriteOwnHealthData,
  denyUnless,
} from "@/lib/auth/policy";

export async function requireApprovedSession(): Promise<
  ActionResult<{ ctx: AuthContext; playerId: string }>
> {
  const session = await requireSessionAction();
  if (!session.success) return session;
  const approved = assertApproved(session.ctx);
  if (!approved.ok) return { success: false, error: approved.error };
  return { success: true, ctx: session.ctx, playerId: approved.playerId };
}

export async function requireHealthReader(): Promise<
  ActionResult<{ ctx: AuthContext }>
> {
  const session = await requireSessionAction();
  if (!session.success) return session;
  const gate = denyUnless(
    canViewTeamHealth(session.ctx),
    "仅教练可查看全队健康摘要"
  );
  if (!gate.ok) return { success: false, error: gate.error };
  return { success: true, ctx: session.ctx };
}

export async function requireTeamOpsReader(): Promise<
  ActionResult<{ ctx: AuthContext }>
> {
  const session = await requireSessionAction();
  if (!session.success) return session;
  const gate = denyUnless(
    canViewTeamOps(session.ctx),
    "仅队长或教练可查看队务提交情况"
  );
  if (!gate.ok) return { success: false, error: gate.error };
  return { success: true, ctx: session.ctx };
}

export async function requireArchiver(): Promise<
  ActionResult<{ ctx: AuthContext }>
> {
  const session = await requireSessionAction();
  if (!session.success) return session;
  const gate = denyUnless(
    canArchiveTestSession(session.ctx),
    "仅队长或教练可归档测试日"
  );
  if (!gate.ok) return { success: false, error: gate.error };
  return { success: true, ctx: session.ctx };
}

export async function requireAdmin(): Promise<
  ActionResult<{ ctx: AuthContext }>
> {
  const session = await requireSessionAction();
  if (!session.success) return session;
  const gate = denyUnless(
    canManageAccounts(session.ctx),
    "仅管理员可操作"
  );
  if (!gate.ok) return { success: false, error: gate.error };
  return { success: true, ctx: session.ctx };
}

export async function requireOwnDataWriter(): Promise<
  ActionResult<{ ctx: AuthContext; playerId: string }>
> {
  const session = await requireSessionAction();
  if (!session.success) return session;
  const gate = denyUnless(
    canWriteOwnHealthData(session.ctx),
    "尚未完成认领，无法写入"
  );
  if (!gate.ok) return { success: false, error: gate.error };
  const approved = assertApproved(session.ctx);
  if (!approved.ok) return { success: false, error: approved.error };
  return { success: true, ctx: session.ctx, playerId: approved.playerId };
}

export async function requireScheduleViewer(): Promise<
  ActionResult<{ ctx: AuthContext; playerId: string }>
> {
  const session = await requireSessionAction();
  if (!session.success) return session;
  const gate = denyUnless(canViewSchedule(session.ctx), "请先完成名册认领");
  if (!gate.ok) return { success: false, error: gate.error };
  const approved = assertApproved(session.ctx);
  if (!approved.ok) return { success: false, error: approved.error };
  return { success: true, ctx: session.ctx, playerId: approved.playerId };
}

export async function requireScheduleManager(): Promise<
  ActionResult<{ ctx: AuthContext; playerId: string }>
> {
  const session = await requireSessionAction();
  if (!session.success) return session;
  const gate = denyUnless(
    canManageSchedule(session.ctx),
    "仅队长或教练可维护赛季与赛程"
  );
  if (!gate.ok) return { success: false, error: gate.error };
  const approved = assertApproved(session.ctx);
  if (!approved.ok) return { success: false, error: approved.error };
  return { success: true, ctx: session.ctx, playerId: approved.playerId };
}

export async function requireScheduleUploader(): Promise<
  ActionResult<{ ctx: AuthContext; playerId: string }>
> {
  const session = await requireSessionAction();
  if (!session.success) return session;
  const gate = denyUnless(
    canUploadScheduleFile(session.ctx),
    "请先完成名册认领后再上传记录"
  );
  if (!gate.ok) return { success: false, error: gate.error };
  const approved = assertApproved(session.ctx);
  if (!approved.ok) return { success: false, error: approved.error };
  return { success: true, ctx: session.ctx, playerId: approved.playerId };
}

export async function requireSeasonCleanup(): Promise<
  ActionResult<{ ctx: AuthContext }>
> {
  const session = await requireSessionAction();
  if (!session.success) return session;
  const gate = denyUnless(
    canCleanupSeasonUploads(session.ctx),
    "仅队长、教练或管理员可清理未完成上传"
  );
  if (!gate.ok) return { success: false, error: gate.error };
  return { success: true, ctx: session.ctx };
}

export async function requireSeasonEvidenceAdmin(): Promise<
  ActionResult<{ ctx: AuthContext }>
> {
  const session = await requireSessionAction();
  if (!session.success) return session;
  const gate = denyUnless(
    canHideSeasonEvidence(session.ctx),
    "仅管理员可隐藏比赛记录证据"
  );
  if (!gate.ok) return { success: false, error: gate.error };
  return { success: true, ctx: session.ctx };
}

export async function requireTeamSeasonReporter(): Promise<
  ActionResult<{ ctx: AuthContext }>
> {
  const session = await requireSessionAction();
  if (!session.success) return session;
  const gate = denyUnless(
    canViewTeamSeasonReports(session.ctx),
    "仅教练可查看队级赛季报告"
  );
  if (!gate.ok) return { success: false, error: gate.error };
  return { success: true, ctx: session.ctx };
}

export async function requireOwnProfileReader(
  targetPlayerId: string
): Promise<ActionResult<{ ctx: AuthContext; playerId: string }>> {
  const session = await requireSessionAction();
  if (!session.success) return session;
  const approved = assertApproved(session.ctx);
  if (!approved.ok) return { success: false, error: approved.error };
  if (
    approved.playerId !== targetPlayerId &&
    !canViewTeamHealth(session.ctx)
  ) {
    return { success: false, error: "无权查看他人档案" };
  }
  if (!canReadOwnProfile(session.ctx) && approved.playerId === targetPlayerId) {
    return { success: false, error: "无权查看档案" };
  }
  return {
    success: true,
    ctx: session.ctx,
    playerId:
      approved.playerId === targetPlayerId
        ? approved.playerId
        : targetPlayerId,
  };
}
