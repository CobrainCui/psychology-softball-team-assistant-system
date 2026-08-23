"use client";

export default function FieldNotice({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2 border border-zinc-400 bg-white p-3">
      <p className="text-sm text-zinc-800">{message}</p>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-xs text-zinc-500 underline hover:text-zinc-800"
        >
          关闭
        </button>
      ) : null}
    </div>
  );
}
