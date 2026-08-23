"use client";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function toPct(value: number): number {
  return ((clamp(value, 1, 5) - 1) / 4) * 100;
}

export function BatteryDriveChart({
  physicalBattery,
  mentalDrive,
  label,
}: {
  physicalBattery: number;
  mentalDrive: number;
  label?: string;
}) {
  const left = toPct(physicalBattery);
  const bottom = toPct(mentalDrive);

  return (
    <div className="relative aspect-square w-full max-w-sm border border-zinc-300 bg-white">
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
        <div className="border-r border-b border-zinc-200" />
        <div className="border-b border-zinc-200" />
        <div className="border-r border-zinc-200" />
        <div />
      </div>
      <span className="absolute left-2 top-2 text-xs text-zinc-400">
        动力高 · 电量低
      </span>
      <span className="absolute right-2 top-2 text-xs text-zinc-400">
        动力高 · 电量高
      </span>
      <span className="absolute bottom-6 left-2 text-xs text-zinc-400">
        动力低 · 电量低
      </span>
      <span className="absolute bottom-6 right-2 text-xs text-zinc-400">
        动力低 · 电量高
      </span>
      <div
        className="absolute h-3 w-3 -translate-x-1/2 translate-y-1/2 rounded-full bg-zinc-900"
        style={{ left: `${left}%`, bottom: `${bottom}%` }}
        title={label}
      />
      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs uppercase text-zinc-400">
        身体电量
      </span>
      <span className="absolute top-1/2 left-1 -translate-y-1/2 -rotate-90 text-xs uppercase text-zinc-400">
        心理动力
      </span>
    </div>
  );
}
