export default function Loading() {
  return (
    <div className="mx-auto max-w-[1520px] px-4 pt-8 sm:px-8" aria-busy="true" aria-label="Loading workspace">
      <div className="h-4 w-40 animate-pulse rounded bg-ink/5" />
      <div className="mt-4 h-16 w-96 max-w-full animate-pulse rounded-cc bg-ink/5" />
      <div className="mt-10 grid gap-5 lg:grid-cols-12">
        <div className="h-80 animate-pulse rounded-[36px] bg-ink/5 lg:col-span-7" />
        <div className="h-80 animate-pulse rounded-cc-lg bg-ink/5 lg:col-span-5" />
        <div className="h-56 animate-pulse rounded-cc-lg bg-ink/5 lg:col-span-4" />
        <div className="h-56 animate-pulse rounded-cc-lg bg-ink/5 lg:col-span-8" />
      </div>
    </div>
  );
}
