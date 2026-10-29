export default function Loading() {
  return (
    <div className="mx-auto max-w-[1280px] px-4 pt-8 sm:px-8" aria-busy="true" aria-label="Loading">
      <div className="h-4 w-40 cc-skeleton rounded" />
      <div className="mt-4 h-14 w-80 max-w-full cc-skeleton rounded-cc" />
      <div className="mt-10 space-y-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-28 cc-skeleton rounded-cc-lg" />)}
      </div>
    </div>
  );
}
