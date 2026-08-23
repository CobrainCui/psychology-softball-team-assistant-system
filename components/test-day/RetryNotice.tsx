"use client";

export default function RetryNotice({
  message,
  onRetry,
  busy,
}: {
  message: string;
  onRetry: () => void;
  busy?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2 p-3">
      <p className="text-center text-sm text-zinc-700">{message}</p>
      <button
        type="button"
        disabled={busy}
        onClick={onRetry}
        className="border border-zinc-400 px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-100 disabled:text-zinc-400"
      >
        重试
      </button>
    </div>
  );
}
