import { ArtPlate, type PlateTheme } from "@/components/art/plate";
import { cn } from "@/lib/utils";

const nodes: { theme: PlateTheme; label: string; kind: string; className: string }[] = [
  { theme: "music", label: "Music", kind: "Artists & genres", className: "left-[4%] top-[14%] h-[150px] w-[118px]" },
  { theme: "travel", label: "Travel", kind: "Places", className: "left-[30%] bottom-[2%] h-[138px] w-[120px]" },
  { theme: "food", label: "Food & beverage", kind: "Brands & venues", className: "left-[0%] bottom-[18%] h-[120px] w-[110px]" },
  { theme: "sustainability", label: "Sustainability", kind: "Interests", className: "right-[0%] top-[-3%] h-[132px] w-[112px]" },
];

/** Illustrative hero composition (no data). Network lines suggest how CultureCrash connects signals. */
export function HeroComposition() {
  return (
    <div className="relative h-[560px] w-full sm:h-[640px]" aria-label="Illustrative composition of a cultural network around an audience" role="img">
      <div className="absolute right-[6%] top-0 h-[78%] w-[52%] overflow-hidden rounded-[44px] shadow-[0_40px_80px_-30px_rgba(23,21,30,0.55)]">
        <ArtPlate theme="beauty" seed="hero" rounded={false} className="size-full" />
        <div className="absolute left-6 right-6 top-6">
          <p className="cc-eyebrow text-white/70">Audience lens</p>
          <p className="cc-display mt-1 text-3xl text-white">Skincare, Gen Z, India</p>
        </div>
      </div>

      <svg className="absolute inset-0 size-full" viewBox="0 0 600 640" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="hero-line" x1="0" x2="1">
            <stop offset="0" stopColor="#8064F5" stopOpacity="0.15" />
            <stop offset="0.5" stopColor="#8064F5" stopOpacity="0.7" />
            <stop offset="1" stopColor="#F29A8B" stopOpacity="0.35" />
          </linearGradient>
        </defs>
        {[
          "M120 170 C 200 220, 230 300, 300 330",
          "M95 470 C 170 440, 230 380, 300 340",
          "M245 560 C 260 470, 280 400, 300 345",
          "M540 60 C 470 160, 380 280, 305 345",
          "M430 120 C 400 220, 350 280, 305 335",
        ].map((d, i) => (
          <path key={i} d={d} fill="none" stroke="url(#hero-line)" strokeWidth="1.3" className="cc-animate-draw" style={{ ["--cc-dash" as string]: 420, animationDelay: `${i * 0.12}s` }} />
        ))}
      </svg>

      <div className="absolute left-[38%] top-[44%] -translate-x-1/2 -translate-y-1/2">
        <div className="relative size-[150px] sm:size-[180px]">
          <div className="absolute inset-0 rounded-[46%_54%_42%_58%/55%_45%_55%_45%] bg-[radial-gradient(circle_at_35%_35%,#E8DFFF,#B8A5FF_45%,#8064F5_80%)] opacity-90 blur-[2px]" />
          <div className="absolute -inset-6 -z-10 rounded-full bg-peach/60 blur-3xl" />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white">
            <span className="cc-eyebrow text-[9px] text-white/80">Target audience</span>
            <span className="mt-1 text-sm font-medium">Your brief</span>
          </div>
        </div>
      </div>

      {nodes.map((n, i) => (
        <figure key={n.label} className={cn("absolute overflow-hidden rounded-[20px] shadow-[0_24px_40px_-20px_rgba(23,21,30,0.6)] cc-animate-float", n.className)} style={{ animationDelay: `${i * 0.8}s` }}>
          <ArtPlate theme={n.theme} seed={n.label} rounded={false} className="size-full" />
          <figcaption className="absolute bottom-2.5 left-3 right-3 text-white">
            <span className="block text-[13px] font-semibold leading-tight">{n.label}</span>
            <span className="block text-[10px] text-white/70">{n.kind}</span>
          </figcaption>
        </figure>
      ))}

      <div className="cc-glass absolute bottom-[6%] right-[2%] hidden w-[250px] rounded-cc-lg p-4 sm:block">
        <p className="cc-eyebrow text-[10px] text-muted">How a finding is labelled</p>
        <ul className="mt-3 space-y-2.5 text-[12px]">
          <li className="flex items-start gap-2"><span className="mt-1 size-2 rounded-full bg-ink" /> <span><b className="font-medium">Observed</b> — returned by a data provider, with retrieval time</span></li>
          <li className="flex items-start gap-2"><span className="mt-1 size-2 rounded-full bg-violet" /> <span><b className="font-medium">Interpretation</b> — AI reading of that evidence</span></li>
          <li className="flex items-start gap-2"><span className="mt-1 size-2 rounded-full bg-coral" /> <span><b className="font-medium">Hypothesis</b> — an assumption to test</span></li>
        </ul>
      </div>
      <p className="absolute bottom-0 left-[52%] text-[10px] text-muted">Illustrative composition — not research data</p>
    </div>
  );
}
