export default function Loading() {
  return (
    <div className="mx-auto max-w-[1520px] px-4 pt-8 sm:px-8" aria-busy="true" aria-label="Loading projects">
      <div className="h-16 w-72 cc-skeleton rounded-cc" />
      <div className="mt-10 grid gap-4 md:grid-cols-12">
        {[7, 5, 5, 4, 4, 4].map((s, i) => (
          <div key={i} className="h-64 cc-skeleton rounded-[28px]" style={{ gridColumn: `span ${s} / span ${s}` }} />
        ))}
      </div>
    </div>
  );
}
