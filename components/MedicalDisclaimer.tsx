// 产品边界：辅助训练决策，不替代医疗诊断。状态/伤病相关页必须可见。

interface MedicalDisclaimerProps {
  /** compact：页脚一行；panel：模块内提示条 */
  variant?: "compact" | "panel";
}

export default function MedicalDisclaimer({
  variant = "panel",
}: MedicalDisclaimerProps) {
  if (variant === "compact") {
    return (
      <p className="text-center text-[11px] leading-relaxed text-zinc-400">
        本系统仅供训练辅助参考，不构成医疗诊断或处方。出现明显伤痛请停止训练并寻求专业医疗介入。
      </p>
    );
  }

  return (
    <div className="border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-relaxed text-zinc-500">
      <span className="font-medium text-zinc-600">产品边界：</span>
      综合状态与伤病建议用于协助教练/队员安排负荷，
      <span className="text-zinc-700">不替代</span>
      执业医师或物理治疗师的诊断与处方。红牌/熔断仅表示「建议立即停训并就医」，不是确诊结论。
    </div>
  );
}
