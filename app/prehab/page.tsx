"use client";

import { useEffect, useState } from "react";
import MedicalDisclaimer from "@/components/MedicalDisclaimer";
import { InjuryCaseCard } from "@/components/injury/InjuryCaseCard";
import { PAIN_AREA_OPTIONS, type PainArea } from "@/lib/clinical/painAreas";
import {
  INJURY_KIND_OPTIONS,
  PAIN_EXERCISE_RELATION_OPTIONS,
  type InjuryKind,
  type PainExerciseRelationId,
} from "@/lib/clinical/injuryKinds";
import { getTodayDateStr } from "@/lib/readinessHistory";
import { useRequireAuth } from "@/lib/useRequireAuth";
import {
  addInjuryNote,
  addInjuryPainLog,
  createInjuryCase,
  deleteInjuryCase,
  deleteInjuryNote,
  deleteInjuryPainLog,
  getInjuryCases,
  markInjuryRecovered,
  updateInjuryCase,
  updateInjuryNote,
  updateInjuryPainLog,
  type InjuryCaseDto,
} from "@/lib/actions";

type Tab = "today" | "history";

export default function InjuryPage() {
  const { currentUser, isMounted } = useRequireAuth();
  const [tab, setTab] = useState<Tab>("today");
  const [cases, setCases] = useState<InjuryCaseDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [painArea, setPainArea] = useState<PainArea>("shoulder");
  const [locationHint, setLocationHint] = useState("");
  const [injuryKind, setInjuryKind] = useState<InjuryKind>("overuse");
  const [painScore, setPainScore] = useState(3);
  const [relations, setRelations] = useState<PainExerciseRelationId[]>([]);
  const [note, setNote] = useState("");
  const [parentCaseId, setParentCaseId] = useState<string | null>(null);
  const [painTarget, setPainTarget] = useState<InjuryCaseDto | null>(null);
  const [noteTarget, setNoteTarget] = useState<{
    item: InjuryCaseDto;
    kind: "treatment" | "rehab";
  } | null>(null);
  const [noteContent, setNoteContent] = useState("");
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [editingPainLogId, setEditingPainLogId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  const reload = async (playerId: string) => {
    const res = await getInjuryCases(playerId);
    if (!res.success) {
      console.error("云端被拒:", res.error);
      setLoadError(res.error);
      return;
    }
    setLoadError(null);
    setCases(res.cases);
  };

  useEffect(() => {
    if (!isMounted || !currentUser) return;
    void reload(currentUser.playerId);
  }, [isMounted, currentUser?.playerId]);

  const toggleRelation = (id: PainExerciseRelationId) => {
    setRelations((prev) => {
      if (id === "unrelated_to_exercise") {
        return prev.includes(id) ? [] : [id];
      }
      const without = prev.filter((x) => x !== "unrelated_to_exercise");
      return without.includes(id)
        ? without.filter((x) => x !== id)
        : [...without, id];
    });
  };

  const resetForm = () => {
    setShowNew(false);
    setLocationHint("");
    setPainScore(3);
    setRelations([]);
    setNote("");
    setParentCaseId(null);
    setEditingCaseId(null);
  };

  const handleCreate = async () => {
    if (!currentUser) return;
    if (editingCaseId) {
      const res = await updateInjuryCase({
        playerId: currentUser.playerId,
        caseId: editingCaseId,
        painArea,
        locationHint,
        injuryKind,
      });
      if (!res.success) {
        window.alert(res.error);
        return;
      }
      resetForm();
      await reload(currentUser.playerId);
      return;
    }
    const res = await createInjuryCase({
      playerId: currentUser.playerId,
      painArea,
      locationHint,
      injuryKind,
      startDate: getTodayDateStr(),
      painScore,
      painExerciseRelations: relations,
      note: note || null,
      parentCaseId,
    });
    if (!res.success) {
      window.alert(res.error);
      return;
    }
    resetForm();
    await reload(currentUser.playerId);
  };

  const handlePainSave = async () => {
    if (!currentUser || !painTarget) return;
    if (editingPainLogId) {
      const res = await updateInjuryPainLog({
        playerId: currentUser.playerId,
        logId: editingPainLogId,
        painScore,
        painExerciseRelations: relations,
        note: note || null,
      });
      if (!res.success) {
        window.alert(res.error);
        return;
      }
      setPainTarget(null);
      setEditingPainLogId(null);
      setNote("");
      await reload(currentUser.playerId);
      return;
    }
    const res = await addInjuryPainLog({
      playerId: currentUser.playerId,
      caseId: painTarget.id,
      date: getTodayDateStr(),
      painScore,
      painExerciseRelations: relations,
      note: note || null,
    });
    if (!res.success) {
      window.alert(res.error);
      return;
    }
    setPainTarget(null);
    setNote("");
    await reload(currentUser.playerId);
  };

  const handleNoteSave = async () => {
    if (!currentUser || !noteTarget) return;
    if (editingNoteId) {
      const res = await updateInjuryNote({
        playerId: currentUser.playerId,
        noteId: editingNoteId,
        content: noteContent,
      });
      if (!res.success) {
        window.alert(res.error);
        return;
      }
      setNoteTarget(null);
      setEditingNoteId(null);
      setNoteContent("");
      await reload(currentUser.playerId);
      return;
    }
    const res = await addInjuryNote({
      playerId: currentUser.playerId,
      caseId: noteTarget.item.id,
      kind: noteTarget.kind,
      date: getTodayDateStr(),
      content: noteContent,
    });
    if (!res.success) {
      window.alert(res.error);
      return;
    }
    setNoteTarget(null);
    setNoteContent("");
    await reload(currentUser.playerId);
  };

  if (!isMounted || !currentUser) return null;

  const active = cases.filter((c) => c.status === "active");
  const recovered = cases.filter((c) => c.status === "recovered");
  const visible = tab === "today" ? active : recovered;

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 p-6">
      <main className="flex w-full max-w-2xl flex-col gap-4">
        <div className="text-center">
          <h1 className="text-sm font-medium tracking-wide text-zinc-500">
            运动损伤
          </h1>
          <p className="mt-1 text-xs text-zinc-400">
            当前球员：{currentUser.playerName}
          </p>
        </div>
        <MedicalDisclaimer />
        {loadError && (
          <p className="border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {loadError}
          </p>
        )}
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setTab("today")}
            className={`flex-1 border py-2 text-xs ${
              tab === "today"
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-300"
            }`}
          >
            今日关注 ({active.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("history")}
            className={`flex-1 border py-2 text-xs ${
              tab === "history"
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-300"
            }`}
          >
            历史 ({recovered.length})
          </button>
        </div>
        {tab === "today" && (
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="border border-zinc-900 py-2 text-sm"
          >
            新建损伤记录
          </button>
        )}
        {showNew && (
          <div className="flex flex-col gap-3 border border-zinc-900 bg-white p-4">
            <label className="text-xs uppercase text-gray-500">部位</label>
            <div className="flex flex-wrap gap-1">
              {PAIN_AREA_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPainArea(opt.value)}
                  className={`border px-2 py-1 text-xs ${
                    painArea === opt.value
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <input
              placeholder="更具体的位置（可选）"
              value={locationHint}
              onChange={(e) => setLocationHint(e.target.value)}
              className="border border-zinc-300 px-3 py-2 text-sm"
            />
            <label className="text-xs uppercase text-gray-500">种类</label>
            <div className="flex flex-wrap gap-1">
              {INJURY_KIND_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setInjuryKind(opt.id)}
                  className={`border px-2 py-1 text-xs ${
                    injuryKind === opt.id
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-300"
                  }`}
                  title={opt.hint}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {!editingCaseId ? (
              <>
            <label className="text-xs uppercase text-gray-500">
              疼痛 0–10
            </label>
            <input
              type="range"
              min={0}
              max={10}
              value={painScore}
              onChange={(e) => setPainScore(Number(e.target.value))}
              className="accent-zinc-900"
            />
            <span className="text-right font-mono text-sm">{painScore}</span>
            <div className="flex flex-wrap gap-1">
              {PAIN_EXERCISE_RELATION_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggleRelation(opt.id)}
                  className={`border px-2 py-1 text-xs ${
                    relations.includes(opt.id)
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <textarea
              placeholder="备注（可选）"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-16 border border-zinc-300 px-3 py-2 text-sm"
            />
              </>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleCreate()}
                className="flex-1 bg-black py-2 text-sm text-white"
              >
                {editingCaseId ? "保存修改" : "保存"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="flex-1 border border-zinc-300 py-2 text-sm"
              >
                取消
              </button>
            </div>
          </div>
        )}
        {visible.length === 0 ? (
          <p className="text-sm text-zinc-400">
            {tab === "today" ? "今日没有正在关注的损伤。" : "暂无已康复记录。"}
          </p>
        ) : (
          visible.map((item) => (
            <InjuryCaseCard
              key={item.id}
              item={item}
              onPain={(c) => {
                setPainTarget(c);
                setPainScore(c.latestPain ?? 3);
                setRelations([]);
                setNote("");
                setEditingPainLogId(null);
              }}
              onNote={(c, kind) => {
                setNoteTarget({ item: c, kind });
                setNoteContent("");
                setEditingNoteId(null);
              }}
              onRecover={async (c) => {
                if (!currentUser) return;
                const res = await markInjuryRecovered({
                  playerId: currentUser.playerId,
                  caseId: c.id,
                });
                if (!res.success) window.alert(res.error);
                else await reload(currentUser.playerId);
              }}
              onRelapse={(c) => {
                setPainArea(c.painArea);
                setInjuryKind(c.injuryKind);
                setLocationHint(c.locationHint);
                setParentCaseId(c.id);
                setShowNew(true);
                setTab("today");
              }}
              onEditCase={(c) => {
                setPainArea(c.painArea);
                setInjuryKind(c.injuryKind);
                setLocationHint(c.locationHint);
                setEditingCaseId(c.id);
                setShowNew(true);
                setTab("today");
              }}
              onDeleteCase={async (c) => {
                if (!currentUser) return;
                const res = await deleteInjuryCase({
                  playerId: currentUser.playerId,
                  caseId: c.id,
                });
                if (!res.success) window.alert(res.error);
                else await reload(currentUser.playerId);
              }}
              onEditPain={(c, log) => {
                setPainTarget(c);
                setPainScore(log.painScore);
                setRelations(log.painExerciseRelations);
                setNote(log.note ?? "");
                setEditingPainLogId(log.id);
              }}
              onDeletePain={async (log) => {
                if (!currentUser) return;
                const res = await deleteInjuryPainLog({
                  playerId: currentUser.playerId,
                  logId: log.id,
                });
                if (!res.success) window.alert(res.error);
                else await reload(currentUser.playerId);
              }}
              onEditNote={(c, noteRow) => {
                setNoteTarget({ item: c, kind: noteRow.kind });
                setNoteContent(noteRow.content);
                setEditingNoteId(noteRow.id);
              }}
              onDeleteNote={async (noteRow) => {
                if (!currentUser) return;
                const res = await deleteInjuryNote({
                  playerId: currentUser.playerId,
                  noteId: noteRow.id,
                });
                if (!res.success) window.alert(res.error);
                else await reload(currentUser.playerId);
              }}
            />
          ))
        )}
        {painTarget && (
          <div className="flex flex-col gap-2 border border-zinc-900 bg-white p-4">
            <p className="text-sm">
              {editingPainLogId ? "修改今日疼痛" : "今日疼痛"} ·{" "}
              {painTarget.painAreaLabel}
            </p>
            <input
              type="range"
              min={0}
              max={10}
              value={painScore}
              onChange={(e) => setPainScore(Number(e.target.value))}
              className="accent-zinc-900"
            />
            <span className="text-right font-mono text-sm">{painScore}</span>
            <div className="flex flex-wrap gap-1">
              {PAIN_EXERCISE_RELATION_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggleRelation(opt.id)}
                  className={`border px-2 py-1 text-xs ${
                    relations.includes(opt.id)
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handlePainSave()}
                className="flex-1 bg-black py-2 text-sm text-white"
              >
                {editingPainLogId ? "保存修改" : "记录"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPainTarget(null);
                  setEditingPainLogId(null);
                }}
                className="flex-1 border py-2 text-sm"
              >
                取消
              </button>
            </div>
          </div>
        )}
        {noteTarget && (
          <div className="flex flex-col gap-2 border border-zinc-900 bg-white p-4">
            <p className="text-sm">
              {editingNoteId ? "修改备注" : ""}
              {noteTarget.kind === "treatment" ? "诊疗备注" : "康复备注"} ·{" "}
              {noteTarget.item.painAreaLabel}
            </p>
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              className="min-h-20 border border-zinc-300 px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleNoteSave()}
                className="flex-1 bg-black py-2 text-sm text-white"
              >
                {editingNoteId ? "保存修改" : "保存"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setNoteTarget(null);
                  setEditingNoteId(null);
                }}
                className="flex-1 border py-2 text-sm"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
