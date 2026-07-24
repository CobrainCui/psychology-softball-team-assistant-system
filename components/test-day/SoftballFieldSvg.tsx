// 垒球场几何参照图：仅视觉锚点，不参与点击坐标计算

export default function SoftballFieldSvg() {
  return (
    <svg
      viewBox="0 0 140 100"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <path
        d="M 70,95 L 6.4,31.4 A 90 90 0 0 1 133.6,31.4 Z"
        fill="#f9fafb"
        stroke="#9ca3af"
        strokeWidth="1.5"
      />
      <path
        d="M 70,95 L 38.2,63.2 A 45 45 0 0 1 101.8,63.2 Z"
        fill="#e5e7eb"
        stroke="#d1d5db"
        strokeWidth="1"
      />
      <polygon
        points="70,95 89.1,75.9 70,56.8 50.9,75.9"
        fill="none"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      <polygon points="70,95 72,93 72,91 68,91 68,93" fill="#4b5563" />
      <circle cx="70" cy="75.9" r="2" fill="#4b5563" />
    </svg>
  );
}
