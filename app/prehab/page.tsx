"use client";

import { useEffect, useState } from "react";
import MedicalDisclaimer from "@/components/MedicalDisclaimer";
import PageLoading from "@/components/PageLoading";
import { InjuryCaseCard } from "@/components/injury/InjuryCaseCard";
import {
  InjuryCaseForm,
  InjuryNoteForm,
  InjuryPainForm,
} from "@/components/injury/InjuryForms";
import type { PainArea } from "@/lib/clinical/painAreas";
import type { InjuryKind, PainExerciseRelationId } from "@/lib/clinical/injuryKinds";
import { getTodayDateStr } from "@/lib/dateOnly";
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
} from "@/lib/status/injuryActions";
import type { InjuryCaseDto } from "@/lib/status/shared";

type Tab = "today" | "history";

export default function InjuryPage() {
  const { currentUser, isMounted } = useRequireAuth();
  const [tab, setTab] = useState<Tab>("today");
  const [cases, setCases] = useState<InjuryCaseDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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

  const reload = async () => {
    const res = await getInjuryCases();
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
    const timer = window.setTimeout(() => {
      void reload();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 按 accountId 重载，避免对象引用抖动
  }, [isMounted, currentUser?.accountId]);

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
        caseId: editingCaseId,
        painArea,
        locationHint,
        injuryKind,
      });
      if (!res.success) {
        setNotice(res.error);
        return;
      }
      resetForm();
      await reload();
      return;
    }
    const res = await createInjuryCase({
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
      setNotice(res.error);
      return;
    }
    resetForm();
    await reload();
  };

  const handlePainSave = async () => {
    if (!currentUser || !painTarget) return;
    if (editingPainLogId) {
      const res = await updateInjuryPainLog({
        logId: editingPainLogId,
        painScore,
        painExerciseRelations: relations,
        note: note || null,
      });
      if (!res.success) {
        setNotice(res.error);
        return;
      }
      setPainTarget(null);
      setEditingPainLogId(null);
      setNote("");
      await reload();
      return;
    }
    const res = await addInjuryPainLog({
      caseId: painTarget.id,
      date: getTodayDateStr(),
      painScore,
      painExerciseRelations: relations,
      note: note || null,
    });
    if (!res.success) {
      setNotice(res.error);
      return;
    }
    setPainTarget(null);
    setNote("");
    await reload();
  };

  const handleNoteSave = async () => {
    if (!currentUser || !noteTarget) return;
    if (editingNoteId) {
      const res = await updateInjuryNote({
        noteId: editingNoteId,
        content: noteContent,
      });
      if (!res.success) {
        setNotice(res.error);
        return;
      }
      setNoteTarget(null);
      setEditingNoteId(null);
      setNoteContent("");
      await reload();
      return;
    }
    const res = await addInjuryNote({
      caseId: noteTarget.item.id,
      kind: noteTarget.kind,
      date: getTodayDateStr(),
      content: noteContent,
    });
    if (!res.success) {
      setNotice(res.error);
      return;
    }
    setNoteTarget(null);
    setNoteContent("");
    await reload();
  };

  if (!isMounted || !currentUser) return <PageLoading />;

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
        {notice && (
          <p className="border border-zinc-300 bg-white p-3 text-sm text-zinc-700">
            {notice}
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
          <InjuryCaseForm
            painArea={painArea}
            locationHint={locationHint}
            injuryKind={injuryKind}
            painScore={painScore}
            relations={relations}
            note={note}
            editingCaseId={editingCaseId}
            onPainArea={setPainArea}
            onLocationHint={setLocationHint}
            onInjuryKind={setInjuryKind}
            onPainScore={setPainScore}
            onToggleRelation={toggleRelation}
            onNote={setNote}
            onSave={() => void handleCreate()}
            onCancel={resetForm}
          />
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
                  caseId: c.id,
                });
                if (!res.success) setNotice(res.error);
                else await reload();
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
                  caseId: c.id,
                });
                if (!res.success) setNotice(res.error);
                else await reload();
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
                  logId: log.id,
                });
                if (!res.success) setNotice(res.error);
                else await reload();
              }}
              onEditNote={(c, noteRow) => {
                setNoteTarget({ item: c, kind: noteRow.kind });
                setNoteContent(noteRow.content);
                setEditingNoteId(noteRow.id);
              }}
              onDeleteNote={async (noteRow) => {
                if (!currentUser) return;
                const res = await deleteInjuryNote({
                  noteId: noteRow.id,
                });
                if (!res.success) setNotice(res.error);
                else await reload();
              }}
            />
          ))
        )}
        {painTarget && (
          <InjuryPainForm
            title={`${editingPainLogId ? "修改今日疼痛" : "今日疼痛"} · ${painTarget.painAreaLabel}`}
            painScore={painScore}
            relations={relations}
            editing={Boolean(editingPainLogId)}
            onPainScore={setPainScore}
            onToggleRelation={toggleRelation}
            onSave={() => void handlePainSave()}
            onCancel={() => {
              setPainTarget(null);
              setEditingPainLogId(null);
            }}
          />
        )}
        {noteTarget && (
          <InjuryNoteForm
            title={`${editingNoteId ? "修改备注" : ""}${
              noteTarget.kind === "treatment" ? "诊疗备注" : "康复备注"
            } · ${noteTarget.item.painAreaLabel}`}
            content={noteContent}
            editing={Boolean(editingNoteId)}
            onContent={setNoteContent}
            onSave={() => void handleNoteSave()}
            onCancel={() => {
              setNoteTarget(null);
              setEditingNoteId(null);
            }}
          />
        )}
      </main>
    </div>
  );
}
