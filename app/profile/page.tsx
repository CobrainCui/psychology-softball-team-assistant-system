"use client";

import { useEffect, useState } from "react";
import { setStoredCurrentUser } from "@/lib/currentUser";
import {
  type HitRecord,
  type HitResult,
  type SpeedRecord,
} from "@/lib/gameArchive";
import { getPlayerProfileData } from "@/lib/actions";
import { updatePlayer } from "@/lib/playersApi";
import {
  loadPlayerInjuryLog,
  type InjuryLogEntry,
} from "@/lib/injuryLog";
import { loadPlayerReadinessHistory } from "@/lib/readinessHistory";
import { useRequireAuth } from "@/lib/useRequireAuth";
import SoftballFieldSvg from "@/components/test-day/SoftballFieldSvg";

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
    return "h-2 w-2 rounded-full bg-black opacity-80";
  }
  if (result === "PU") {
    return "h-2 w-2 rounded-full border border-red-500 bg-transparent opacity-70";
  }
  return "h-1.5 w-1.5 rounded-full bg-gray-500 opacity-60";
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
  const [injuryLog, setInjuryLog] = useState<InjuryLogEntry[]>([]);
  const [latestReadiness, setLatestReadiness] = useState<number | null>(null);

  useEffect(() => {
    if (!isMounted || !currentUser) return;
    let cancelled = false;
    setDisplayName(currentUser.playerName);
    // 先用本地草稿占位，云端返回后覆盖
    setInjuryLog(loadPlayerInjuryLog(currentUser.playerId).slice(0, 5));
    const readiness = loadPlayerReadinessHistory(currentUser.playerId);
    setLatestReadiness(readiness[0]?.readinessScore ?? null);
    setIsLoading(true);

    (async () => {
      // Session 凭证字段为 playerId（非 id）
      const res = await getPlayerProfileData(currentUser.playerId);
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
        if (res.injuryLogs.length > 0) {
          setInjuryLog(res.injuryLogs);
        }
        if (res.latestReadiness !== null) {
          setLatestReadiness(res.latestReadiness);
        }
      }
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isMounted, currentUser?.playerId, currentUser?.playerName]);

  if (!isMounted || !currentUser) return null;

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
    setEditNameValue(displayName || currentUser.playerName);
    setIsEditingName(true);
  };

  const handleSaveName = async () => {
    const trimmedName = editNameValue.trim();
    if (!trimmedName) return;

    const updated = await updatePlayer(currentUser.playerId, {
      name: trimmedName,
    });
    if (!updated) {
      window.alert("同步姓名失败，请检查网络后重试。");
      return;
    }

    const updatedUser = { ...currentUser, playerName: trimmedName };
    setStoredCurrentUser(updatedUser);
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
                💾 保存
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
                ✏️ 修改名称
              </button>
            </div>
          )}
          <p className="mt-1 text-xs uppercase tracking-wide text-zinc-400">
            {currentUser.gender === "male" ? "男" : "女"}
            {" · "}
            {currentUser.role === "coach" ? "教练" : "队员"}
          </p>
        </div>

        <div className="border border-zinc-200 bg-gray-50 py-4 text-center">
          <span className="font-mono text-2xl text-zinc-900">
            总参与测试数：{sessionCount} 次
          </span>
          {latestReadiness !== null && (
            <p className="mt-1 text-xs text-zinc-500">
              最近 Readiness：{latestReadiness} / 100
            </p>
          )}
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
          <span className="text-xs uppercase text-gray-500">
            近期伤病史
          </span>
          {injuryLog.length === 0 ? (
            <p className="text-sm text-zinc-400">
              暂无归档记录，请前往「伤病预防」生成并归档处方
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm text-zinc-700">
              {injuryLog.map((entry) => (
                <li key={entry.id}>
                  {new Date(entry.timestamp).toLocaleDateString("zh-CN")} ·{" "}
                  {entry.painAreaLabel} · VAS {entry.painScore} ·{" "}
                  {entry.symptom}
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
