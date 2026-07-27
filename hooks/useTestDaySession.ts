"use client";

import { useEffect, useState } from "react";
import { type Player } from "@/lib/players";
import { loginOrRegister } from "@/lib/actions";
import {
  type HitQuality,
  type HitRecord,
  type HitResult,
  type PitchType,
  type SpeedRecord,
} from "@/lib/gameArchive";
import {
  type Assignments,
  clearSessionDraft,
  DEFAULT_TEST_ITEMS,
  loadSessionDraft,
  saveSessionDraft,
  SESSION_DRAFT_SCHEMA_VERSION,
} from "@/lib/sessionDraft";
import { ADD_CUSTOM_TEST_PANEL_ID } from "@/components/test-day/hitLabels";

export interface PendingHit {
  x: number;
  y: number;
}

export type SidebarMode = "byPlayer" | "byTest";

export type SpeedInputs = Record<
  string,
  { firstBase: string; secondBase: string; custom: string }
>;

export function useTestDaySession() {
  const [hits, setHits] = useState<HitRecord[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentResult, setCurrentResult] = useState<HitResult>("LD");
  const [currentBatterId, setCurrentBatterId] = useState("");
  const [isMounted, setIsMounted] = useState(false);
  const [pendingHit, setPendingHit] = useState<PendingHit | null>(null);
  const [currentPitchType, setCurrentPitchType] = useState<PitchType>("FB");
  const [currentHitQuality, setCurrentHitQuality] =
    useState<HitQuality>("Medium");
  const [activeTab, setActiveTab] = useState<string | null>("T座打击");
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("byPlayer");
  const [assignments, setAssignments] = useState<Assignments>({});
  const [testItems, setTestItems] = useState<string[]>([...DEFAULT_TEST_ITEMS]);
  const [customTestName, setCustomTestName] = useState("");
  const [speedRecords, setSpeedRecords] = useState<SpeedRecord[]>([]);
  const [speedInputs, setSpeedInputs] = useState<SpeedInputs>({});

  // 名册由 app/page.tsx 通过 getPlayers() 注入；此处只恢复当场草稿
  useEffect(() => {
    const draft = loadSessionDraft();
    setHits(draft.hits);
    setSpeedRecords(draft.speedRecords);
    setAssignments(draft.assignments);
    setTestItems(draft.testItems);
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    saveSessionDraft({
      schemaVersion: SESSION_DRAFT_SCHEMA_VERSION,
      hits,
      speedRecords,
      assignments,
      testItems,
    });
  }, [hits, speedRecords, assignments, testItems, isMounted]);

  const currentBatter = players.find((player) => player.id === currentBatterId);
  const batterHits = hits.filter((hit) => hit.playerId === currentBatterId);
  const isEntryPanelActive = currentResult === "MISS" || pendingHit !== null;
  const showPitchQualityPanel = currentResult !== "MISS" && pendingHit !== null;
  const plottableHits = batterHits.filter((hit) => hit.result !== "MISS");
  const speedTestAssignedPlayers = players.filter((player) =>
    assignments[player.id]?.includes("上垒速度")
  );

  // 点击坐标 → 相对百分比 → 写入 pendingHit，不直接落库
  const handleFieldClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (currentResult === "MISS") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPendingHit({ x, y });
  };

  const handleConfirmHit = () => {
    if (!currentBatter || !isEntryPanelActive) return;

    const newHit: HitRecord = {
      id: crypto.randomUUID(),
      ...(pendingHit ? { x: pendingHit.x, y: pendingHit.y } : {}),
      result: currentResult,
      playerId: currentBatter.id,
      playerName: currentBatter.name,
      ...(currentResult !== "MISS"
        ? { pitchType: currentPitchType, hitQuality: currentHitQuality }
        : {}),
      timestamp: Date.now(),
    };

    setHits((prev) => [...prev, newHit]);
    setPendingHit(null);
    setCurrentHitQuality("Medium");
  };

  const handleSelectResult = (result: HitResult) => {
    setCurrentResult(result);
    if (result === "MISS") setPendingHit(null);
  };

  const handleCancelHit = () => setPendingHit(null);

  const handleToggleTab = (tab: string) => {
    setActiveTab((prev) => (prev === tab ? null : tab));
  };

  const handleToggleAssignment = (playerId: string, testItem: string) => {
    setAssignments((prev) => {
      const current = prev[playerId] ?? [];
      const nextForPlayer = current.includes(testItem)
        ? current.filter((item) => item !== testItem)
        : [...current, testItem];
      return { ...prev, [playerId]: nextForPlayer };
    });
  };

  // 推导步骤：该队员是否已勾满全部测试 → 是则清空，否则全选
  const handleSelectAllTestsForPlayer = (playerId: string) => {
    setAssignments((prev) => {
      const current = prev[playerId] ?? [];
      const allSelected =
        testItems.length > 0 && testItems.every((item) => current.includes(item));
      return {
        ...prev,
        [playerId]: allSelected ? [] : [...testItems],
      };
    });
  };

  // 推导步骤：该测试是否已对全部队员勾选 → 是则全员取消，否则全员勾选
  const handleSelectAllPlayersForTest = (testItem: string) => {
    setAssignments((prev) => {
      const allSelected =
        players.length > 0 &&
        players.every((player) => (prev[player.id] ?? []).includes(testItem));
      const next = { ...prev };
      players.forEach((player) => {
        const current = next[player.id] ?? [];
        if (allSelected) {
          next[player.id] = current.filter((item) => item !== testItem);
        } else if (!current.includes(testItem)) {
          next[player.id] = [...current, testItem];
        }
      });
      return next;
    });
  };

  const handleSpeedInputChange = (
    playerId: string,
    field: "firstBase" | "secondBase" | "custom",
    value: string
  ) => {
    setSpeedInputs((prev) => ({
      ...prev,
      [playerId]: {
        ...(prev[playerId] ?? { firstBase: "", secondBase: "", custom: "" }),
        [field]: value,
      },
    }));
  };

  const handleRecordSpeed = (playerId: string, playerName: string) => {
    const rowInput = speedInputs[playerId] ?? {
      firstBase: "",
      secondBase: "",
      custom: "",
    };

    const parseSeconds = (raw: string): number | null => {
      if (raw.trim() === "") return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    };

    const firstBaseSeconds = parseSeconds(rowInput.firstBase);
    const secondBaseSeconds = parseSeconds(rowInput.secondBase);
    const customSeconds = parseSeconds(rowInput.custom);

    if (
      firstBaseSeconds === null &&
      secondBaseSeconds === null &&
      customSeconds === null
    ) {
      window.alert("请至少填写一项有效的秒数成绩（不可为负数）。");
      return;
    }

    setSpeedRecords((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        playerId,
        playerName,
        firstBaseSeconds,
        secondBaseSeconds,
        customSeconds,
        timestamp: Date.now(),
      },
    ]);
  };

  const handleAddCustomTest = () => {
    const trimmedName = customTestName.trim();
    if (!trimmedName) return;
    if (testItems.includes(trimmedName)) {
      window.alert("该测试项目已存在，请勿重复添加。");
      return;
    }
    setTestItems((prev) => [...prev, trimmedName]);
    setCustomTestName("");
  };

  const handleUndo = () => {
    const lastIndex = hits.findLastIndex(
      (hit) => hit.playerId === currentBatterId
    );
    if (lastIndex === -1) return;
    setHits((prev) => prev.filter((_, index) => index !== lastIndex));
  };

  const handleClearAll = () => {
    if (!currentBatter) return;
    if (
      !confirm(`确认清空「${currentBatter.name}」的全部打击记录？此操作不可撤销。`)
    ) {
      return;
    }
    setHits((prev) => prev.filter((hit) => hit.playerId !== currentBatterId));
  };

  const handleAddPlayer = async () => {
    const name = window.prompt("请输入新队员名字:");
    if (!name || !name.trim()) return;

    // 性别必填：与 CurrentUser / 状态评估女性通道契约对齐，避免无名册性别
    const genderRaw = window.prompt("请输入性别（男 / 女）:", "女");
    if (!genderRaw) return;
    const normalized = genderRaw.trim();
    const gender =
      normalized === "男" || normalized.toLowerCase() === "male"
        ? ("male" as const)
        : normalized === "女" || normalized.toLowerCase() === "female"
          ? ("female" as const)
          : null;
    if (!gender) {
      window.alert("性别仅支持填写「男」或「女」。");
      return;
    }

    const res = await loginOrRegister(name.trim(), gender, "player");
    if (!res.success) {
      console.error("云端被拒:", res.error);
      window.alert(`创建队员失败：${res.error}`);
      return;
    }
    setPlayers((prev) => [...prev, res.player]);
    setCurrentBatterId(res.player.id);
  };

  // 交卷成功后由 page 调用：清空盘面与草稿（不碰排阵/录入逻辑）
  const clearBoardAfterArchive = () => {
    setHits([]);
    setSpeedRecords([]);
    setSpeedInputs({});
    setAssignments({});
    setPendingHit(null);
    clearSessionDraft();
  };

  return {
    ADD_CUSTOM_TEST_PANEL_ID,
    players,
    setPlayers,
    hits,
    speedRecords,
    speedInputs,
    assignments,
    testItems,
    customTestName,
    setCustomTestName,
    currentBatterId,
    setCurrentBatterId,
    clearBoardAfterArchive,
    currentResult,
    currentPitchType,
    setCurrentPitchType,
    currentHitQuality,
    setCurrentHitQuality,
    pendingHit,
    activeTab,
    sidebarMode,
    setSidebarMode,
    batterHits,
    plottableHits,
    isEntryPanelActive,
    showPitchQualityPanel,
    speedTestAssignedPlayers,
    handleFieldClick,
    handleConfirmHit,
    handleSelectResult,
    handleCancelHit,
    handleToggleTab,
    handleToggleAssignment,
    handleSelectAllTestsForPlayer,
    handleSelectAllPlayersForTest,
    handleSpeedInputChange,
    handleRecordSpeed,
    handleAddCustomTest,
    handleUndo,
    handleClearAll,
    handleAddPlayer,
  };
}
