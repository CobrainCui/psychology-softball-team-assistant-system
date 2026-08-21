export default function PageLoading({
  label = "Loading...",
}: {
  label?: string;
}) {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 p-6">
      <p className="text-sm text-zinc-500">{label}</p>
    </div>
  );
}
