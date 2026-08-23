"use client";

export function ScaleSlider({
  label,
  description,
  hint1,
  hint3,
  hint5,
  value,
  onChange,
}: {
  label: string;
  description: string;
  hint1: string;
  hint3: string;
  hint5: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2 border border-zinc-200 p-4">
      <label className="text-xs uppercase text-gray-500">{label}</label>
      <p className="text-xs leading-relaxed text-zinc-500">{description}</p>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-zinc-900"
      />
      <div className="flex justify-between text-xs text-zinc-400">
        <span>1 {hint1}</span>
        <span>3 {hint3}</span>
        <span>5 {hint5}</span>
      </div>
      <span className="text-right font-mono text-sm text-zinc-900">{value}</span>
    </div>
  );
}
