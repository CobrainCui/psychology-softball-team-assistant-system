"use client";

export function RecordActions({
  onEdit,
  onDelete,
  deleteConfirm = "确认删除这条记录？",
  disabled = false,
}: {
  onEdit?: () => void;
  onDelete?: () => void;
  deleteConfirm?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex shrink-0 gap-1">
      {onEdit ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onEdit}
          className="border border-zinc-300 px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:text-zinc-400"
        >
          修改
        </button>
      ) : null}
      {onDelete ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (!confirm(deleteConfirm)) return;
            onDelete();
          }}
          className="border border-red-300 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 disabled:border-zinc-200 disabled:text-zinc-400"
        >
          删除
        </button>
      ) : null}
    </div>
  );
}
