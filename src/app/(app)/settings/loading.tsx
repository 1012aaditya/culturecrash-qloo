export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading settings" className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="h-80 animate-pulse rounded-cc-lg bg-ink/5" />
      <div className="h-48 animate-pulse rounded-cc-lg bg-ink/5" />
    </div>
  );
}
