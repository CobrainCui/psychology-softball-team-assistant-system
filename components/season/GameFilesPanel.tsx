"use client";

import { useState } from "react";
import {
  createPendingUpload,
  deleteGameFile,
  finalizeUpload,
  listGameFiles,
} from "@/lib/season/fileActions";
import type { GameFileDto } from "@/lib/season/types";
import { RecordActions } from "@/components/records/RecordActions";

export default function GameFilesPanel({
  eventId,
  files,
  currentUserId,
  canManage,
  canUpload,
  onChanged,
}: {
  eventId: string;
  files: GameFileDto[];
  currentUserId: string;
  canManage: boolean;
  canUpload: boolean;
  onChanged: () => void;
}) {
  const [error, setError] = useState("");

  const upload = async (file: File) => {
    const pending = await createPendingUpload({
      eventId,
      originalName: file.name,
      sizeBytes: file.size,
    });
    if (!pending.success) {
      console.error("云端被拒:", pending.error);
      setError(pending.error);
      return;
    }
    const put = await fetch(`/api/season/files/${pending.fileId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: file,
    });
    if (!put.ok) {
      setError("上传失败");
      return;
    }
    const done = await finalizeUpload(pending.fileId);
    if (!done.success) {
      console.error("云端被拒:", done.error);
      setError(done.error);
      return;
    }
    setError("");
    onChanged();
    void listGameFiles(eventId);
  };

  return (
    <div className="mt-3 border-t border-zinc-100 pt-3">
      <p className="text-xs uppercase text-zinc-500">记录 PDF</p>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <ul className="mt-1 space-y-1 text-sm">
        {files.map((file) => (
          <li key={file.id} className="flex items-center justify-between gap-2">
            <a
              href={`/api/season/files/${file.id}`}
              className="underline"
            >
              {file.originalName}
            </a>
            {(file.uploadedById === currentUserId || canManage) &&
            !file.retainEvidence ? (
              <RecordActions
                onDelete={() => {
                  void deleteGameFile(file.id).then((res) => {
                    if (!res.success) {
                      console.error("云端被拒:", res.error);
                      setError(res.error);
                      return;
                    }
                    onChanged();
                  });
                }}
                deleteConfirm="确认删除该 PDF？"
              />
            ) : null}
          </li>
        ))}
      </ul>
      {canUpload ? (
        <input
          type="file"
          accept="application/pdf"
          className="mt-2 text-xs"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      ) : null}
    </div>
  );
}
