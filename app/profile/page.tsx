"use client";

import { useEffect, useState } from "react";
import MedicalDisclaimer from "@/components/MedicalDisclaimer";
import PageLoading from "@/components/PageLoading";
import { useRequireAuth } from "@/lib/useRequireAuth";
import {
  type HitRecord,
  type HitResult,
  type SpeedRecord,
} from "@/lib/gameArchive";
import { getPlayerProfileData } from "@/lib/status/profileActions";
import { requestRoleChange } from "@/lib/auth/roleActions";
import { updatePlayer } from "@/lib/playersApi";
import { loadPlayerReadinessHistory } from "@/lib/readinessHistory";
import { loadPlayerInjuryCaseDrafts } from "@/lib/injuryCases";
import { draftScopeFromUser } from "@/lib/scopedStorage";
import { PAIN_AREA_LABEL } from "@/lib/clinical/painAreas";
import { quadrantLabel } from "@/lib/clinical/preQuadrant";
import SoftballFieldSvg from "@/components/test-day/SoftballFieldSvg";
import type { ProfileInjuryBrief, ProfileLatestStatus } from "@/lib/status/profileActions";
import type { BodyInsight30dReport } from "@/lib/clinical/bodyInsight30d";
import SeasonReportCard from "@/components/season/SeasonReportCard";

const formatPercent = (value: number): string => {
  if (!Number.isFinite(value) || value < 0) return "0.0%";
  return `${(value * 100).toFixed(1)}%`;
};

const formatSeconds = (value: number): string => `${value.toFixed(2)}s`;

// 推导步骤：生涯挥击 / 击中(非 MISS) / 平飞；分母为 0 时比率按 0
function getCareerSwingStats(hits: HitRecord[]) {
  const swings = hits.length;
  if (swings === 0) {
    return { swings: 0, contactRate: 0, ldRate: 0 };
  }
  const contact = hits.filter((hit) => hit.result !== "MISS").length;
  const ld = hits.filter((hit) => hit.result === "LD").length;
  return {
    swings,
    contactRate: contact / swings,
    ldRate: ld / swings,
  };
}

// 上垒速度 PR：取历史最短一垒 / 二垒耗时（忽略 null）
const getBestSpeedMarks = (
  speedRecords: SpeedRecord[]
): { firstBase: number | null; secondBase: number | null } => {
  let firstBase: number | null = null;
  let secondBase: number | null = null;

  speedRecords.forEach((row) => {
    if (row.firstBaseSeconds !== null) {
      if (firstBase === null || row.firstBaseSeconds < firstBase) {
        firstBase = row.firstBaseSeconds;
      }
    }
    if (row.secondBaseSeconds !== null) {
      if (secondBase === null || row.secondBaseSeconds < secondBase) {
        secondBase = row.secondBaseSeconds;
      }
    }
  });

  return { firstBase, secondBase };
};

const getSprayDotClasses = (result: HitResult): string | null => {
  if (result === "MISS") return null;
  if (result === "LD") {
    return "h-2 w-2 rounded-full bg-black";
  }
  if (result === "PU") {
    return "h-2 w-2 rounded-full border border-red-500 bg-white";
  }
  return "h-1.5 w-1.5 rounded-full bg-zinc-500";
};

export default function ProfilePage() {
  const { currentUser, isMounted } = useRequireAuth();

  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [hits, setHits] = useState<HitRecord[]>([]);
  const [speedRecords, setSpeedRecords] = useState<SpeedRecord[]>([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [injuryCases, setInjuryCases] = useState<ProfileInjuryBrief[]>([]);
  const [latestStatus, setLatestStatus] = useState<ProfileLatestStatus | null>(
    null
  );
  const [insight, setInsight] = useState<BodyInsight30dReport | null>(null);
  const [showInsight, setShowInsight] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isMounted || !currentUser) return;
    if (!currentUser.playerId) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setDisplayName(currentUser.playerName ?? currentUser.username);
      const scope = draftScopeFromUser(currentUser);
      const readiness = loadPlayerReadinessHistory(
        scope,
        currentUser.playerId!
      );
      if (readiness[0]) {
        setLatestStatus({
          date: readiness[0].date,
          quadrant: readiness[0].quadrant,
          quadrantLabel: quadrantLabel(readiness[0].quadrant),
          physicalBattery: readiness[0].physicalBattery,
          mentalDrive: readiness[0].mentalDrive,
        });
      }
      const drafts = loadPlayerInjuryCaseDrafts(
        scope,
        currentUser.playerId!
      );
      if (drafts.length > 0) {
        setInjuryCases(
          drafts.slice(0, 8).map((c) => ({
            id: c.id,
            painAreaLabel: PAIN_AREA_LABEL[c.painArea],
            status: c.status,
            latestPain: c.painLogs.at(-1)?.painScore ?? null,
            trendLabel: "",
            startDate: c.startDate,
          }))
        );
      }
      setIsLoading(true);
      void (async () => {
        const res = await getPlayerProfileData();
        if (cancelled) return;
        if (!res.success) {
          console.error("云端被拒:", res.error);
          setHits([]);
          setSpeedRecords([]);
          setSessionCount(0);
        } else {
          setHits(res.hits);
          setSpeedRecords(res.speedRecords);
          setSessionCount(res.sessionCount);
          setInjuryCases(res.injuryCases);
          setLatestStatus(res.latestStatus);
          setInsight(res.insight);
        }
        setIsLoading(false);
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isMounted, currentUser?.accountId, currentUser?.playerId, currentUser]);

  if (!isMounted || !currentUser) return <PageLoading />;

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 p-6">
        <p className="text-sm text-zinc-500">
          正在从云端雷达拉取生涯数据...
        </p>
      </div>
    );
  }

  const handleStartEditName = () => {
    setEditNameValue(displayName || currentUser.playerName || currentUser.username);
    setIsEditingName(true);
  };

  const handleSaveName = async () => {
    const trimmedName = editNameValue.trim();
    if (!trimmedName) return;

    if (!currentUser.playerId) return;
    const updated = await updatePlayer(currentUser.playerId, {
      name: trimmedName,
    });
    if (!updated.success) {
      setNotice(updated.error);
      return;
    }

    setDisplayName(trimmedName);
    setIsEditingName(false);
  };

  const { swings, contactRate, ldRate } = getCareerSwingStats(hits);
  const bestSpeed = getBestSpeedMarks(speedRecords);

  const speedPrLabel =
    bestSpeed.firstBase === null && bestSpeed.secondBase === null
      ? "待录入"
      : [
          bestSpeed.firstBase !== null
            ? `一垒 ${formatSeconds(bestSpeed.firstBase)}`
            : null,
          bestSpeed.secondBase !== null
            ? `二垒 ${formatSeconds(bestSpeed.secondBase)}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 p-6">
      <main className="flex w-full max-w-2xl flex-col gap-4">
        <div className="text-center">
          <h1 className="text-sm font-medium tracking-wide text-zinc-500">
            个人档案
          </h1>
        </div>

        <MedicalDisclaimer />
        {notice ? (
          <p className="border border-zinc-300 bg-white p-3 text-sm text-zinc-700">
            {notice}
          </p>
        ) : null}
        <div className="border border-zinc-200 p-4 text-center">
          {isEditingName ? (
            <div className="flex items-center justify-center gap-2">
              <input
                type="text"
                autoFocus
                value={editNameValue}
                onChange={(e) => setEditNameValue(e.target.value)}
                className="border border-zinc-300 px-2 py-1 text-sm text-zinc-900"
              />
              <button
                type="button"
                onClick={() => void handleSaveName()}
                className="shrink-0 px-2 py-1 text-xs text-zinc-500 transition-colors hover:text-zinc-900"
              >
                保存
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <p className="text-lg font-semibold text-zinc-900">
                {displayName || currentUser.playerName}
              </p>
              <button
                type="button"
                onClick={handleStartEditName}
                className="shrink-0 px-2 py-1 text-xs text-zinc-400 transition-colors hover:text-zinc-700"
              >
                修改名称
              </button>
            </div>
          )}
          <p className="mt-1 text-xs uppercase tracking-wide text-zinc-400">
            {currentUser.gender === "male" ? "男" : "女"}
            {" · "}
            {currentUser.roles.includes("coach")
              ? "教练"
              : currentUser.roles.includes("captain")
                ? "队长"
                : "队员"}
          </p>
        </div>

        {currentUser.claimStatus === "approved" &&
        (!currentUser.roles.includes("captain") ||
          !currentUser.roles.includes("coach")) ? (
          <div className="flex flex-col items-center gap-2 text-xs text-zinc-600">
            <p className="text-zinc-400">
              队长/教练由管理员直接设置。以下申请可选，不是必经步骤。
            </p>
            <div className="flex justify-center gap-4">
              {!currentUser.roles.includes("captain") ? (
                <button
                  type="button"
                  className="underline"
                  onClick={async () => {
                    const res = await requestRoleChange("captain");
                    setNotice(
                      res.success ? "已提交队长申请，待管理员审批" : res.error
                    );
                  }}
                >
                  申请队长
                </button>
              ) : null}
              {!currentUser.roles.includes("coach") ? (
                <button
                  type="button"
                  className="underline"
                  onClick={async () => {
                    const res = await requestRoleChange("coach");
                    setNotice(
                      res.success ? "已提交教练申请，待管理员审批" : res.error
                    );
                  }}
                >
                  申请教练
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="border border-zinc-200 bg-gray-50 py-4 text-center">
          <span className="font-mono text-2xl text-zinc-900">
            总参与测试数：{sessionCount} 次
          </span>
          <div className="mt-2 flex flex-col gap-0.5 text-xs text-zinc-500">
            <p>
              最近象限：
              {latestStatus
                ? `${latestStatus.quadrantLabel} · 电量 ${latestStatus.physicalBattery.toFixed(1)} · 动力 ${latestStatus.mentalDrive}`
                : "暂无打卡"}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 border border-zinc-200 p-4">
          <span className="text-xs uppercase text-gray-500">
            各项测试最高纪录 (PR)
          </span>
          <ul className="flex flex-col gap-1.5 text-sm">
            <li className="font-medium text-zinc-900">
              生涯总挥击 (Swings)：{swings}
            </li>
            <li className="font-medium text-zinc-900">
              击中率 (Contact%)：{formatPercent(contactRate)}
            </li>
            <li className="font-medium text-zinc-900">
              平飞率 (LD%)：{formatPercent(ldRate)}
            </li>
            <li
              className={
                speedPrLabel === "待录入"
                  ? "text-gray-400"
                  : "font-medium text-zinc-900"
              }
            >
              上垒速度：{speedPrLabel}
            </li>
            <li className="text-gray-400">接高飞：待录入</li>
            <li className="text-gray-400">好球判断：待录入</li>
            <li className="text-gray-400">6-3传球：待录入</li>
          </ul>
        </div>

        <div className="flex flex-col gap-2 border border-zinc-200 p-4">
          <label className="text-xs uppercase text-gray-500">
            T座打击生涯落点分布 (Career Spray Chart)
          </label>

          <div className="relative w-full max-w-2xl aspect-[1.4/1] overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
            <SoftballFieldSvg />

            {hits.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-sm text-slate-400">
                  暂无生涯打点数据，请前往测试清单录入
                </p>
              </div>
            ) : (
              hits.map((hit) => {
                const dotClasses = getSprayDotClasses(hit.result);
                if (!dotClasses || hit.x === undefined || hit.y === undefined) {
                  return null;
                }

                return (
                  <span
                    key={hit.id}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 ${dotClasses}`}
                    style={{ left: `${hit.x}%`, top: `${hit.y}%` }}
                  />
                );
              })
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 border border-zinc-200 p-4">
          <span className="text-xs uppercase text-gray-500">近期伤病史</span>
          {injuryCases.length === 0 ? (
            <p className="text-sm text-zinc-400">
              暂无损伤 episode，请前往「运动损伤」记录
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm text-zinc-700">
              {injuryCases.map((entry) => (
                <li key={entry.id}>
                  {entry.startDate} · {entry.painAreaLabel} ·{" "}
                  {entry.status === "active" ? "关注中" : "已康复"}
                  {entry.latestPain != null ? ` · 痛分 ${entry.latestPain}` : ""}
                  {entry.trendLabel ? ` · ${entry.trendLabel}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>

        <SeasonReportCard mode="personal" />

        {insight && (
          <div className="flex flex-col gap-2 border border-zinc-200 p-4">
            <button
              type="button"
              onClick={() => setShowInsight((v) => !v)}
              className="text-left text-xs uppercase text-gray-500"
            >
              30 天身体洞察 {showInsight ? "· 收起" : "· 展开"}
            </button>
            {showInsight && (
              <div className="flex flex-col gap-2 text-sm text-zinc-700">
                <p className="leading-relaxed">{insight.narrative}</p>
                <p className="text-xs text-zinc-500">
                  评估 {insight.coverage.preDays} 天 · 训后{" "}
                  {insight.coverage.postSessions} 次 · 疼痛日志{" "}
                  {insight.coverage.painLogDays} 天 · 负荷合计{" "}
                  {insight.training.totalLoad}
                </p>
                {insight.signalFlags.length > 0 && (
                  <p className="text-xs text-zinc-500">
                    旗标：{insight.signalFlags.join(" · ")}
                  </p>
                )}
                <p className="text-xs text-zinc-400">{insight.disclaimer}</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
