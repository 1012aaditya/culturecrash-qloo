export default function Loading() {
  return (
    <div className="mx-auto max-w-[1520px] px-4 pt-8 sm:px-8" aria-busy="true" aria-label="Loading workspace">
      <div className="h-4 w-40 cc-skeleton rounded" />
      <div className="mt-4 h-16 w-96 max-w-full cc-skeleton rounded-cc" />
      <div className="mt-10 grid gap-5 lg:grid-cols-12">
        <div className="h-80 cc-skeleton rounded-[36px] lg:col-span-7" />
        <div className="h-80 cc-skeleton rounded-cc-lg lg:col-span-5" />
        <div className="h-56 cc-skeleton rounded-cc-lg lg:col-span-4" />
        <div className="h-56 cc-skeleton rounded-cc-lg lg:col-span-8" />
      </div>
    </div>
  );
}
