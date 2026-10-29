export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading settings" className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="h-80 cc-skeleton rounded-cc-lg" />
      <div className="h-48 cc-skeleton rounded-cc-lg" />
    </div>
  );
}
