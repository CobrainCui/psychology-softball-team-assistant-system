"use client";

import { useEffect, useState } from "react";
import { loadPlayers, type Player, savePlayers } from "@/lib/players";
import {
  type HitQuality,
  type HitRecord,
  type HitResult,
  type PitchType,
  type SpeedRecord,
} from "@/lib/gameArchive";
import { appendGameArchive } from "@/lib/gamesHistory";
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

  useEffect(() => {
    const draft = loadSessionDraft();
    setHits(draft.hits);
    setSpeedRecords(draft.speedRecords);
    setAssignments(draft.assignments);
    setTestItems(draft.testItems);

    const loadedPlayers = loadPlayers();
    setPlayers(loadedPlayers);
    setCurrentBatterId(loadedPlayers[0]?.id ?? "");
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

  useEffect(() => {
    if (!isMounted) return;
    savePlayers(players);
  }, [players, isMounted]);

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

    console.log("数据已准备好同步至云端:", newHit);
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

  const handleSelectAllTestsForPlayer = (playerId: string) => {
    setAssignments((prev) => {
      const current = prev[playerId] ?? [];
      const merged = Array.from(new Set([...current, ...testItems]));
      return { ...prev, [playerId]: merged };
    });
  };

  const handleSelectAllPlayersForTest = (testItem: string) => {
    setAssignments((prev) => {
      const next = { ...prev };
      players.forEach((player) => {
        const current = next[player.id] ?? [];
        if (!current.includes(testItem)) {
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

  const handleAddPlayer = () => {
    const name = window.prompt("请输入新队员名字:");
    if (!name || !name.trim()) return;
    const newPlayer: Player = { id: crypto.randomUUID(), name: name.trim() };
    setPlayers((prev) => [...prev, newPlayer]);
    setCurrentBatterId(newPlayer.id);
  };

  const handleArchiveGame = () => {
    if (hits.length === 0 && speedRecords.length === 0) return;
    if (!confirm("确认结束本次综合测试？当前记录将归档存查并清空盘面。")) return;

    const archivedGame = appendGameArchive(hits, speedRecords);
    const blob = new Blob([JSON.stringify(archivedGame, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `softball_test_day_${archivedGame.gameId}.json`;
    link.click();
    URL.revokeObjectURL(url);

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
    hits,
    speedRecords,
    speedInputs,
    assignments,
    testItems,
    customTestName,
    setCustomTestName,
    currentBatterId,
    setCurrentBatterId,
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
    handleArchiveGame,
  };
}
