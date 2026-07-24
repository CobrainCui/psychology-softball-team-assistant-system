"use client";

import AssignmentSidebar from "@/components/test-day/AssignmentSidebar";
import TeeBallPanel from "@/components/test-day/TeeBallPanel";
import SpeedTestPanel from "@/components/test-day/SpeedTestPanel";
import { useTestDaySession } from "@/hooks/useTestDaySession";

export default function Home() {
  const session = useTestDaySession();

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 p-4">
      <div className="flex w-full max-w-5xl flex-col items-start gap-6 md:flex-row">
        <AssignmentSidebar
          players={session.players}
          testItems={session.testItems}
          assignments={session.assignments}
          sidebarMode={session.sidebarMode}
          onSidebarModeChange={session.setSidebarMode}
          onAddPlayer={session.handleAddPlayer}
          onToggleAssignment={session.handleToggleAssignment}
          onSelectAllTestsForPlayer={session.handleSelectAllTestsForPlayer}
          onSelectAllPlayersForTest={session.handleSelectAllPlayersForTest}
        />

        <main className="flex w-full flex-1 flex-col gap-4">
          <h1 className="text-center text-sm font-medium tracking-wide text-zinc-500">
            测试清单
          </h1>

          <div className="flex flex-col border border-zinc-300 bg-white">
            {session.testItems.map((tab) => (
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
                      />
                    ) : tab === "上垒速度" ? (
                      <SpeedTestPanel
                        assignedPlayers={session.speedTestAssignedPlayers}
                        speedRecords={session.speedRecords}
                        speedInputs={session.speedInputs}
                        onSpeedInputChange={session.handleSpeedInputChange}
                        onRecordSpeed={session.handleRecordSpeed}
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
                  </div>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={session.handleArchiveGame}
            className="w-full bg-black py-4 text-base font-bold text-white transition-colors hover:bg-zinc-800"
          >
            🏁 结束本次综合测试并存档
          </button>
        </main>
      </div>
    </div>
  );
}
