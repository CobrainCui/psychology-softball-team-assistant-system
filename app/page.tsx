"use client";

import { useEffect, useState } from "react";
import AssignmentSidebar from "@/components/test-day/AssignmentSidebar";
import FlyCatchPanel from "@/components/test-day/FlyCatchPanel";
import SpeedTestPanel from "@/components/test-day/SpeedTestPanel";
import StrikeJudgePanel from "@/components/test-day/StrikeJudgePanel";
import TeeBallPanel from "@/components/test-day/TeeBallPanel";
import ThrowMatrixPanel from "@/components/test-day/ThrowMatrixPanel";
import { useTestDaySession } from "@/hooks/useTestDaySession";
import { getPlayers, saveTestSession } from "@/lib/actions";
import type { HitRecord, HitResult } from "@/lib/gameArchive";
import {
  accordionTestItems,
  isDefaultTestItem,
  saveSessionDraft,
  SESSION_DRAFT_SCHEMA_VERSION,
} from "@/lib/sessionDraft";
import { sessionArchiveHasContent } from "@/lib/testDay/archiveValidation";
import { speedRecordsFromGrid } from "@/lib/testDay/speedGrid";
import { RecordActions } from "@/components/records/RecordActions";

/** 与 Prisma HitResult / 大联盟弹道字典对齐；拒绝旧 1B/2B/3B/HR/OUT */
const ALLOWED_HIT_RESULTS: ReadonlySet<HitResult> = new Set([
  "LD",
  "FB",
  "GB",
  "PU",
  "MISS",
]);

function sanitizeHits(hits: HitRecord[]) {
  return hits.filter(
    (hit) =>
      typeof hit.playerId === "string" &&
      hit.playerId.length > 0 &&
      typeof hit.result === "string" &&
      ALLOWED_HIT_RESULTS.has(hit.result as HitResult)
  );
}

export default function Home() {
  const session = useTestDaySession();
  const [rosterReady, setRosterReady] = useState(false);
  const visibleTestItems = accordionTestItems(session.testItems);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getPlayers();
      if (cancelled) return;
      if (!res.success) {
        console.error("云端被拒:", res.error);
        setRosterReady(true);
        return;
      }
      session.setPlayers(
        res.players.map((player) => ({
          id: player.id,
          name: player.name,
          gender: player.gender ?? undefined,
          role: player.role,
        }))
      );
      if (res.players[0]) session.setCurrentBatterId(res.players[0].id);
      setRosterReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleArchiveGame = async () => {
    const speedMarks = session.speedMarks.filter(
      (mark) =>
        typeof mark.playerId === "string" &&
        mark.playerId.length > 0 &&
        Number.isFinite(mark.seconds) &&
        mark.seconds >= 0
    );
    const payload = {
      hits: sanitizeHits(session.hits),
      speedRecords: speedRecordsFromGrid(speedMarks),
      speedColumns: session.speedColumns,
      speedMarks,
      flyCatchAttempts: session.flyCatchAttempts,
      strikeJudgeColumns: session.strikeJudgeColumns,
      strikeJudgeCells: session.strikeJudgeCells,
      throwPlays: session.throwPlays,
      assignments: session.assignments,
      testItems: session.testItems,
      assignmentLog: session.assignmentLog,
    };

    if (!sessionArchiveHasContent(payload)) {
      window.alert("当前没有可归档的测试记录。");
      return;
    }
    if (!confirm("确认结束本次综合测试？当前记录将归档存查并清空盘面。")) {
      return;
    }

    const res = await saveTestSession(payload);
    if (res.success) {
      window.alert("云端存档成功！");

      const blob = new Blob([JSON.stringify(res, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `softball_test_day_${res.gameId}.json`;
      link.click();
      URL.revokeObjectURL(url);

      session.clearBoardAfterArchive();
    } else {
      console.error("云端被拒:", res.error);
      window.alert("云端写入失败！原因请看F12。已自动保存为本地草稿。");
      saveSessionDraft({
        schemaVersion: SESSION_DRAFT_SCHEMA_VERSION,
        hits: session.hits,
        speedRecords: speedRecordsFromGrid(session.speedMarks),
        speedColumns: session.speedColumns,
        speedMarks: session.speedMarks,
        assignments: session.assignments,
        testItems: session.testItems,
        assignmentLocked: session.assignmentLocked,
        assignmentLog: session.assignmentLog,
        committedAssignments: session.committedAssignments,
        flyCatchAttempts: session.flyCatchAttempts,
        strikeJudgeColumns: session.strikeJudgeColumns,
        strikeJudgeCells: session.strikeJudgeCells,
        throwPlays: session.throwPlays,
      });
    }
  };

  if (!rosterReady) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 p-4 text-sm text-zinc-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 p-4">
      <div className="flex w-full max-w-5xl flex-col items-start gap-6 md:flex-row">
        <AssignmentSidebar
          players={session.players}
          testItems={session.testItems}
          assignments={session.assignments}
          assignmentLocked={session.assignmentLocked}
          assignmentLog={session.assignmentLog}
          sidebarMode={session.sidebarMode}
          onSidebarModeChange={session.setSidebarMode}
          onAddPlayer={session.handleAddPlayer}
          onToggleAssignment={session.handleToggleAssignment}
          onSelectAllTestsForPlayer={session.handleSelectAllTestsForPlayer}
          onSelectAllPlayersForTest={session.handleSelectAllPlayersForTest}
          onSaveAssignments={session.handleSaveAssignments}
          onBeginEditAssignments={session.handleBeginEditAssignments}
        />

        <main className="flex w-full flex-1 flex-col gap-4">
          <h1 className="text-center text-sm font-medium tracking-wide text-zinc-500">
            测试清单
          </h1>

          <div className="flex flex-col border border-zinc-300 bg-white">
            {visibleTestItems.map((tab) => (
              <div key={tab}>
                <button
                  type="button"
                  onClick={() => session.handleToggleTab(tab)}
                  className="flex w-full justify-between border-b bg-gray-100 px-4 py-3 font-bold text-slate-900 hover:bg-gray-200"
                >
                  <span>{tab}</span>
                  <span className="text-zinc-400">
                    {session.activeTab === tab ? "−" : "+"}
                  </span>
                </button>

                {session.activeTab === tab && (
                  <div className="border-b border-zinc-300 p-4">
                    {tab === "T座打击" ? (
                      <TeeBallPanel
                        players={session.players}
                        currentBatterId={session.currentBatterId}
                        onBatterChange={session.setCurrentBatterId}
                        currentResult={session.currentResult}
                        onSelectResult={session.handleSelectResult}
                        plottableHits={session.plottableHits}
                        batterHits={session.batterHits}
                        pendingHit={session.pendingHit}
                        onFieldClick={session.handleFieldClick}
                        showPitchQualityPanel={session.showPitchQualityPanel}
                        currentPitchType={session.currentPitchType}
                        onPitchTypeChange={session.setCurrentPitchType}
                        currentHitQuality={session.currentHitQuality}
                        onHitQualityChange={session.setCurrentHitQuality}
                        isEntryPanelActive={session.isEntryPanelActive}
                        onConfirmHit={session.handleConfirmHit}
                        onCancelHit={session.handleCancelHit}
                        onUndo={session.handleUndo}
                        onClearAll={session.handleClearAll}
                        editingHitId={session.editingHitId}
                        onBeginEditHit={session.handleBeginEditHit}
                        onDeleteHit={session.handleDeleteHit}
                      />
                    ) : tab === "上垒速度" ? (
                      <SpeedTestPanel
                        assignedPlayers={session.speedTestAssignedPlayers}
                        columns={session.speedColumns}
                        marks={session.speedMarks}
                        onMarkChange={session.handleSpeedMarkChange}
                        onAddColumn={session.handleAddSpeedColumn}
                        onRemoveColumn={session.handleRemoveSpeedColumn}
                      />
                    ) : tab === "接高飞" ? (
                      <FlyCatchPanel
                        assignedPlayers={session.flyCatchAssignedPlayers}
                        attempts={session.flyCatchAttempts}
                        noteDrafts={session.flyCatchNoteDrafts}
                        onNoteDraftChange={session.handleFlyCatchNoteDraftChange}
                        onRecordAttempt={session.handleRecordFlyCatch}
                        editingAttemptId={session.editingFlyCatchId}
                        onBeginEdit={session.handleBeginEditFlyCatch}
                        onDeleteAttempt={session.handleDeleteFlyCatch}
                        onUndoLast={session.handleUndoFlyCatch}
                      />
                    ) : tab === "好球判断" ? (
                      <StrikeJudgePanel
                        judgePlayers={session.strikeJudgePlayers}
                        pitcherPlayers={session.pitcherPlayers}
                        columns={session.strikeJudgeColumns}
                        cells={session.strikeJudgeCells}
                        onAddColumn={session.handleAddStrikeJudgeColumn}
                        onInitColumns={session.handleInitStrikeJudgeColumns}
                        onReorderColumns={session.handleReorderStrikeJudgeColumns}
                        onUpsertCell={session.handleUpsertStrikeJudgeCell}
                        onClearCell={session.handleClearStrikeJudgeCell}
                        onRemoveColumn={session.handleRemoveStrikeJudgeColumn}
                      />
                    ) : tab === "6-3传球" ? (
                      <ThrowMatrixPanel
                        testItem="6-3传球"
                        throwerPlayers={session.throw63Players}
                        firstBasePlayers={session.firstBasePlayers}
                        plays={session.throwPlays}
                        onUpsertPlay={session.handleUpsertThrowPlay}
                        onClearPlay={session.handleClearThrowPlay}
                      />
                    ) : tab === "4-3传球" ? (
                      <ThrowMatrixPanel
                        testItem="4-3传球"
                        throwerPlayers={session.throw43Players}
                        firstBasePlayers={session.firstBasePlayers}
                        plays={session.throwPlays}
                        onUpsertPlay={session.handleUpsertThrowPlay}
                        onClearPlay={session.handleClearThrowPlay}
                      />
                    ) : (
                      <p className="py-6 text-center text-sm text-zinc-400">
                        [ 建设中 / 待接入测试逻辑 ]
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}

            <div>
              <button
                type="button"
                onClick={() =>
                  session.handleToggleTab(session.ADD_CUSTOM_TEST_PANEL_ID)
                }
                className="flex w-full justify-between border-b bg-gray-100 px-4 py-3 font-bold text-slate-900 hover:bg-gray-200"
              >
                <span>➕ 添加自定义测试</span>
                <span className="text-zinc-400">
                  {session.activeTab === session.ADD_CUSTOM_TEST_PANEL_ID
                    ? "−"
                    : "+"}
                </span>
              </button>

              {session.activeTab === session.ADD_CUSTOM_TEST_PANEL_ID && (
                <div className="border-b border-zinc-300 p-4">
                  <div className="flex flex-col gap-3">
                    <input
                      type="text"
                      value={session.customTestName}
                      onChange={(e) =>
                        session.setCustomTestName(e.target.value)
                      }
                      placeholder="例如：50米折返跑"
                      className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                    />
                    <button
                      onClick={session.handleAddCustomTest}
                      className="w-full bg-black py-2 text-sm text-white transition-colors hover:bg-zinc-800"
                    >
                      确认并生成测试项
                    </button>
                    <ul className="flex flex-col gap-1">
                      {session.testItems
                        .filter((item) => !isDefaultTestItem(item))
                        .map((item) => (
                          <li
                            key={item}
                            className="flex items-center justify-between gap-2 text-sm text-zinc-700"
                          >
                            <span>{item}</span>
                            <RecordActions
                              onDelete={() =>
                                session.handleRemoveCustomTest(item)
                              }
                              deleteConfirm={`确认删除自定义测试「${item}」？对应排阵也会取消。`}
                            />
                          </li>
                        ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => void handleArchiveGame()}
            className="w-full bg-black py-4 text-base font-bold text-white transition-colors hover:bg-zinc-800"
          >
            🏁 结束本次综合测试并存档
          </button>
        </main>
      </div>
    </div>
  );
}
