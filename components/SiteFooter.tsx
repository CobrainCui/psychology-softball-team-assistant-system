import MedicalDisclaimer from "@/components/MedicalDisclaimer";

const GONGAN_BEIAN_HREF =
  "https://beian.mps.gov.cn/#/query/webSearch?code=11010502062112";
const ICP_BEIAN_HREF = "https://beian.miit.gov.cn/";

export default function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-zinc-200 bg-white px-4 py-3 print:hidden">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-2">
        <MedicalDisclaimer variant="compact" />
        {/* 备案一行：公安图标+编号在左，ICP 在右；字号一致 */}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs leading-none text-zinc-500">
          <a
            href={GONGAN_BEIAN_HREF}
            rel="noreferrer"
            target="_blank"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-zinc-800"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- 备案图标随字号略放大 */}
            <img
              src="/beian-gongan.png"
              alt=""
              width={18}
              height={19}
              className="h-[19px] w-[18px] shrink-0"
            />
            <span>京公网安备 11010502062112号</span>
          </a>
          <a
            href={ICP_BEIAN_HREF}
            rel="noreferrer"
            target="_blank"
            className="transition-colors hover:text-zinc-800"
          >
            京ICP备2026001773号-3
          </a>
        </div>
      </div>
    </footer>
  );
}
