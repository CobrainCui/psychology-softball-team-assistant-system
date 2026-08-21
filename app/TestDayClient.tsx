"use client";

import { useEffect, useState } from "react";
import AssignmentSidebar from "@/components/test-day/AssignmentSidebar";
import CustomTestPanel from "@/components/test-day/CustomTestPanel";
import FlyCatchPanel from "@/components/test-day/FlyCatchPanel";
import SpeedTestPanel from "@/components/test-day/SpeedTestPanel";
import StrikeJudgePanel from "@/components/test-day/StrikeJudgePanel";
import TeeBallPanel from "@/components/test-day/TeeBallPanel";
import ThrowMatrixPanel from "@/components/test-day/ThrowMatrixPanel";
import MatchWindowBanner from "@/components/season/MatchWindowBanner";
import { useTestDaySession } from "@/hooks/useTestDaySession";
import { getPlayers, saveTestSession } from "@/lib/actions";
import {
  isDefaultTestItem,
  saveSessionDraft,
  SESSION_DRAFT_SCHEMA_VERSION,
} from "@/lib/sessionDraft";
import {
  buildClientArchivePayload,
  sessionArchiveHasContent,
} from "@/lib/testDay/archiveValidation";
import { RecordActions } from "@/components/records/RecordActions";
import { playersAssignedTo } from "@/lib/testDay/rosterHelpers";
import {
  CUSTOM_RECORD_MODE_HINTS,
  CUSTOM_RECORD_MODE_LABELS,
  CUSTOM_RECORD_MODES,
  customTestModeOf,
} from "@/lib/testDay/customTests";

export default function TestDayClient() {
  const session = useTestDaySession();
  const [rosterReady, setRosterReady] = useState(false);

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
    const payload = buildClientArchivePayload({
      hits: session.hits,
      speedColumns: session.speedColumns,
      speedMarks: session.speedMarks,
      flyCatchAttempts: session.flyCatchAttempts,
      strikeJudgeColumns: session.strikeJudgeColumns,
      strikeJudgeCells: session.strikeJudgeCells,
      throwPlays: session.throwPlays,
      assignments: session.assignments,
      testItems: session.testItems,
      assignmentLog: session.assignmentLog,
      customTestDefs: session.customSlice.customTestDefs,
      customPlayerNotes: session.customSlice.customPlayerNotes,
      customGroupNotes: session.customSlice.customGroupNotes,
      customSingleNotes: session.customSlice.customSingleNotes,
    });

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
      session.clearBoardAfterArchive();
    } else {
      console.error("云端被拒:", res.error);
      window.alert("云端写入失败！原因请看F12。已自动保存为本地草稿。");
      saveSessionDraft({
        schemaVersion: SESSION_DRAFT_SCHEMA_VERSION,
        hits: session.hits,
        speedRecords: payload.speedRecords,
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
        customTestDefs: session.customSlice.customTestDefs,
        customPlayerNotes: session.customSlice.customPlayerNotes,
        customGroupNotes: session.customSlice.customGroupNotes,
        customSingleNotes: session.customSlice.customSingleNotes,
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
          <MatchWindowBanner />
          <h1 className="text-center text-sm font-medium tracking-wide text-zinc-500">
            测试清单
          </h1>

          <div className="flex flex-col border border-zinc-300 bg-white">
            {session.visibleTestItems.map((tab) => (
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
                      <CustomTestPanel
                        testItem={tab}
                        mode={customTestModeOf(session.customTestDefs, tab)}
                        assignedPlayers={playersAssignedTo(
                          tab,
                          session.players,
                          session.assignments
                        )}
                        playerNotes={session.customPlayerNotes}
                        groupNotes={session.customGroupNotes}
                        singleNote={session.customSingleNotes.find(
                          (row) => row.testItem === tab
                        )}
                        onPlayerNoteChange={(playerId, playerName, note) =>
                          session.upsertCustomPlayerNote(
                            tab,
                            playerId,
                            playerName,
                            note
                          )
                        }
                        onCreateGroup={(members) =>
                          session.createCustomGroup(tab, members)
                        }
                        onGroupNoteChange={session.changeCustomGroupNote}
                        onDeleteGroup={session.deleteCustomGroupNote}
                        onSingleNoteChange={(note) =>
                          session.upsertCustomSingleNote(tab, note)
                        }
                      />
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
                <span>添加自定义测试</span>
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
                    <fieldset className="flex flex-col gap-2">
                      {CUSTOM_RECORD_MODES.map((mode) => (
                        <label
                          key={mode}
                          className="flex items-start gap-2 text-sm text-zinc-800"
                        >
                          <input
                            type="radio"
                            name="custom-record-mode"
                            className="mt-0.5 accent-zinc-900"
                            checked={session.customTestMode === mode}
                            onChange={() => session.setCustomTestMode(mode)}
                          />
                          <span>
                            <span className="font-medium">
                              {CUSTOM_RECORD_MODE_LABELS[mode]}
                            </span>
                            <span className="block text-xs text-zinc-500">
                              {CUSTOM_RECORD_MODE_HINTS[mode]}
                            </span>
                          </span>
                        </label>
                      ))}
                    </fieldset>
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
                            <span>
                              {item}
                              <span className="ml-2 text-xs text-zinc-400">
                                {
                                  CUSTOM_RECORD_MODE_LABELS[
                                    customTestModeOf(
                                      session.customTestDefs,
                                      item
                                    )
                                  ]
                                }
                              </span>
                            </span>
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
            结束本次综合测试并存档
          </button>
        </main>
      </div>
    </div>
  );
}
