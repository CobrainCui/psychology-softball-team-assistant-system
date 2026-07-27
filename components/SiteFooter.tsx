import MedicalDisclaimer from "@/components/MedicalDisclaimer";

export default function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-zinc-200 bg-white px-4 py-3 print:hidden">
      <MedicalDisclaimer variant="compact" />
    </footer>
  );
}
