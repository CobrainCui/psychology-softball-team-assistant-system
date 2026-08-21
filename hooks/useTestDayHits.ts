"use client";

import { useState } from "react";
import type { Player } from "@/lib/players";
import type {
  HitQuality,
  HitRecord,
  HitResult,
  PitchType,
} from "@/lib/gameArchive";
import type { PendingHit } from "@/hooks/testDaySessionTypes";

export function useTestDayHits(currentBatterId: string) {
  const [hits, setHits] = useState<HitRecord[]>([]);
  const [currentResult, setCurrentResult] = useState<HitResult>("LD");
  const [pendingHit, setPendingHit] = useState<PendingHit | null>(null);
  const [currentPitchType, setCurrentPitchType] = useState<PitchType>("FB");
  const [currentHitQuality, setCurrentHitQuality] =
    useState<HitQuality>("Medium");
  const [editingHitId, setEditingHitId] = useState<string | null>(null);

  const batterHits = hits.filter((hit) => hit.playerId === currentBatterId);
  const isEntryPanelActive = currentResult === "MISS" || pendingHit !== null;
  const showPitchQualityPanel = currentResult !== "MISS" && pendingHit !== null;
  const plottableHits = batterHits.filter(
    (hit) => hit.result !== "MISS" && hit.id !== editingHitId
  );

  const handleFieldClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (currentResult === "MISS") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPendingHit({ x, y });
  };

  const handleConfirmHit = (currentBatter: Player | undefined) => {
    if (!currentBatter || !isEntryPanelActive) return;

    // 推导步骤：有 editingHitId 则覆盖同 id；否则追加新打点
    const nextHit: HitRecord = {
      id: editingHitId ?? crypto.randomUUID(),
      ...(pendingHit ? { x: pendingHit.x, y: pendingHit.y } : {}),
      result: currentResult,
      playerId: currentBatter.id,
      playerName: currentBatter.name,
      ...(currentResult !== "MISS"
        ? { pitchType: currentPitchType, hitQuality: currentHitQuality }
        : {}),
      timestamp: Date.now(),
    };

    setHits((prev) => {
      if (!editingHitId) return [...prev, nextHit];
      return prev.map((hit) => (hit.id === editingHitId ? nextHit : hit));
    });
    setPendingHit(null);
    setEditingHitId(null);
    setCurrentHitQuality("Medium");
  };

  const handleSelectResult = (result: HitResult) => {
    setCurrentResult(result);
    if (result === "MISS") setPendingHit(null);
  };

  const handleCancelHit = () => {
    setPendingHit(null);
    setEditingHitId(null);
  };

  const handleBeginEditHit = (hitId: string) => {
    const hit = hits.find((row) => row.id === hitId);
    if (!hit) return;
    setCurrentResult(hit.result);
    setEditingHitId(hit.id);
    if (hit.result === "MISS") {
      setPendingHit(null);
    } else {
      setPendingHit({ x: hit.x ?? 0, y: hit.y ?? 0 });
    }
    if (hit.pitchType) setCurrentPitchType(hit.pitchType as PitchType);
    if (hit.hitQuality) setCurrentHitQuality(hit.hitQuality as HitQuality);
    return hit.playerId;
  };

  const handleDeleteHit = (hitId: string) => {
    setHits((prev) => prev.filter((hit) => hit.id !== hitId));
    if (editingHitId === hitId) {
      setPendingHit(null);
      setEditingHitId(null);
    }
  };

  const handleUndo = () => {
    const lastIndex = hits.findLastIndex(
      (hit) => hit.playerId === currentBatterId
    );
    if (lastIndex === -1) return;
    setHits((prev) => prev.filter((_, index) => index !== lastIndex));
  };

  const handleClearAll = (currentBatter: Player | undefined) => {
    if (!currentBatter) return;
    if (
      !confirm(
        `确认清空「${currentBatter.name}」的全部打击记录？此操作不可撤销。`
      )
    ) {
      return;
    }
    setHits((prev) => prev.filter((hit) => hit.playerId !== currentBatterId));
  };

  const resetHits = () => {
    setHits([]);
    setPendingHit(null);
    setEditingHitId(null);
  };

  return {
    hits,
    setHits,
    currentResult,
    currentPitchType,
    setCurrentPitchType,
    currentHitQuality,
    setCurrentHitQuality,
    pendingHit,
    editingHitId,
    batterHits,
    plottableHits,
    isEntryPanelActive,
    showPitchQualityPanel,
    handleFieldClick,
    handleConfirmHit,
    handleSelectResult,
    handleCancelHit,
    handleBeginEditHit,
    handleDeleteHit,
    handleUndo,
    handleClearAll,
    resetHits,
  };
}
