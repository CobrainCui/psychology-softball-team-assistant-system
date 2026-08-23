"use client";

import { useState, type ReactNode } from "react";
import AssignmentSidebar from "@/components/test-day/AssignmentSidebar";
import CustomTestPanel from "@/components/test-day/CustomTestPanel";
import FlyCatchPanel from "@/components/test-day/FlyCatchPanel";
import SpeedTestPanel from "@/components/test-day/SpeedTestPanel";
import StrikeJudgePanel from "@/components/test-day/StrikeJudgePanel";
import TeeBallPanel from "@/components/test-day/TeeBallPanel";
import ThrowMatrixPanel from "@/components/test-day/ThrowMatrixPanel";
import { RecordActions } from "@/components/records/RecordActions";
import { isDefaultTestItem } from "@/lib/sessionDraft";
import { playersAssignedTo } from "@/lib/testDay/rosterHelpers";
import {
  CUSTOM_RECORD_MODE_HINTS,
  CUSTOM_RECORD_MODE_LABELS,
  CUSTOM_RECORD_MODES,
  customTestModeOf,
} from "@/lib/testDay/customTests";
import type { useTestDaySession } from "@/hooks/useTestDaySession";

export type TestDayBoardSession = ReturnType<typeof useTestDaySession>;

export default function TestDayBoard({
  session,
  canManageRoster,
  scoresDisabled,
  header,
  footer,
}: {
  session: TestDayBoardSession;
  canManageRoster: boolean;
  scoresDisabled?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
}) {
  const disabled = Boolean(scoresDisabled);
  const [assignmentOpen, setAssignmentOpen] = useState(false);

  return (
    <>
      <div className="w-full shrink-0 md:w-auto">
        <button
          type="button"
          className="mb-2 w-full border border-zinc-300 bg-white py-2 text-sm text-zinc-800 md:hidden"
          onClick={() => setAssignmentOpen((open) => !open)}
        >
          {assignmentOpen ? "收起排阵" : "展开排阵"}
        </button>
        <div className={assignmentOpen ? "block" : "hidden md:block"}>
          <AssignmentSidebar
            players={session.players}
            testItems={session.testItems}
            assignments={session.assignments}
            assignmentLocked={session.assignmentLocked}
            assignmentLog={session.assignmentLog}
            sidebarMode={session.sidebarMode}
            onSidebarModeChange={session.setSidebarMode}
            onAddPlayer={canManageRoster ? session.handleAddPlayer : undefined}
            onToggleAssignment={session.handleToggleAssignment}
            onSelectAllTestsForPlayer={session.handleSelectAllTestsForPlayer}
            onSelectAllPlayersForTest={session.handleSelectAllPlayersForTest}
            onSaveAssignments={session.handleSaveAssignments}
            onBeginEditAssignments={session.handleBeginEditAssignments}
          />
        </div>
      </div>

      <main className="flex w-full flex-1 flex-col gap-4">
        {header}
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
                  {disabled ? (
                    <p className="mb-3 text-xs text-zinc-500">
                      成绩录入暂不可用。
                    </p>
                  ) : null}
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
                      onFieldClick={
                        disabled ? () => undefined : session.handleFieldClick
                      }
                      showPitchQualityPanel={session.showPitchQualityPanel}
                      currentPitchType={session.currentPitchType}
                      onPitchTypeChange={session.setCurrentPitchType}
                      currentHitQuality={session.currentHitQuality}
                      onHitQualityChange={session.setCurrentHitQuality}
                      isEntryPanelActive={session.isEntryPanelActive}
                      onConfirmHit={
                        disabled ? () => undefined : session.handleConfirmHit
                      }
                      onCancelHit={session.handleCancelHit}
                      onUndo={disabled ? () => undefined : session.handleUndo}
                      onClearAll={
                        disabled ? () => undefined : session.handleClearAll
                      }
                      editingHitId={session.editingHitId}
                      onBeginEditHit={session.handleBeginEditHit}
                      onDeleteHit={
                        disabled ? () => undefined : session.handleDeleteHit
                      }
                    />
                  ) : tab === "上垒速度" ? (
                    <SpeedTestPanel
                      assignedPlayers={session.speedTestAssignedPlayers}
                      columns={session.speedColumns}
                      marks={session.speedMarks}
                      onMarkChange={
                        disabled ? () => undefined : session.handleSpeedMarkChange
                      }
                      onAddColumn={session.handleAddSpeedColumn}
                      onRemoveColumn={session.handleRemoveSpeedColumn}
                    />
                  ) : tab === "接高飞" ? (
                    <FlyCatchPanel
                      assignedPlayers={session.flyCatchAssignedPlayers}
                      attempts={session.flyCatchAttempts}
                      noteDrafts={session.flyCatchNoteDrafts}
                      onNoteDraftChange={session.handleFlyCatchNoteDraftChange}
                      onRecordAttempt={
                        disabled
                          ? () => undefined
                          : session.handleRecordFlyCatch
                      }
                      editingAttemptId={session.editingFlyCatchId}
                      onBeginEdit={session.handleBeginEditFlyCatch}
                      onDeleteAttempt={
                        disabled
                          ? () => undefined
                          : session.handleDeleteFlyCatch
                      }
                      onUndoLast={
                        disabled ? () => undefined : session.handleUndoFlyCatch
                      }
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
                      onUpsertCell={
                        disabled
                          ? () => undefined
                          : session.handleUpsertStrikeJudgeCell
                      }
                      onClearCell={
                        disabled
                          ? () => undefined
                          : session.handleClearStrikeJudgeCell
                      }
                      onRemoveColumn={session.handleRemoveStrikeJudgeColumn}
                    />
                  ) : tab === "6-3传球" ? (
                    <ThrowMatrixPanel
                      testItem="6-3传球"
                      throwerPlayers={session.throw63Players}
                      firstBasePlayers={session.firstBasePlayers}
                      plays={session.throwPlays}
                      onUpsertPlay={
                        disabled ? () => undefined : session.handleUpsertThrowPlay
                      }
                      onClearPlay={
                        disabled ? () => undefined : session.handleClearThrowPlay
                      }
                    />
                  ) : tab === "4-3传球" ? (
                    <ThrowMatrixPanel
                      testItem="4-3传球"
                      throwerPlayers={session.throw43Players}
                      firstBasePlayers={session.firstBasePlayers}
                      plays={session.throwPlays}
                      onUpsertPlay={
                        disabled ? () => undefined : session.handleUpsertThrowPlay
                      }
                      onClearPlay={
                        disabled ? () => undefined : session.handleClearThrowPlay
                      }
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
                      onPlayerNoteChange={
                        disabled
                          ? () => undefined
                          : (playerId, playerName, note) =>
                              session.upsertCustomPlayerNote(
                                tab,
                                playerId,
                                playerName,
                                note
                              )
                      }
                      onCreateGroup={
                        disabled
                          ? () => false
                          : (members) => session.createCustomGroup(tab, members)
                      }
                      onGroupNoteChange={
                        disabled ? () => undefined : session.changeCustomGroupNote
                      }
                      onDeleteGroup={
                        disabled ? () => undefined : session.deleteCustomGroupNote
                      }
                      onSingleNoteChange={
                        disabled
                          ? () => undefined
                          : (note) => session.upsertCustomSingleNote(tab, note)
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
                    disabled={session.assignmentLocked}
                    className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:bg-zinc-100"
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
                          disabled={session.assignmentLocked}
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
                    disabled={session.assignmentLocked}
                    className="w-full bg-black py-2 text-sm text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
                  >
                    {session.assignmentLocked
                      ? "排阵已锁定，无法新增测试项"
                      : "确认并生成测试项"}
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
        {footer}
      </main>
    </>
  );
}
