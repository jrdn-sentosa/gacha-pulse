import { cn } from "@/lib/utils";
import { generateStars } from "@/lib/starfield";

interface StarfieldProps {
  /** "normal" for atmosphere-first screens (e.g. /pull); "sparse" keeps data-dense
   *  screens (e.g. /dashboard) legible while still hinting at the same night-sky backdrop. */
  density?: "normal" | "sparse";
  className?: string;
}

const STAR_COUNT = 160;
const CONTAINER_OPACITY = { normal: 0.85, sparse: 0.45 } as const;

const WARM_GLOW = "rgba(255,236,205,0.55)";
const BLUE_GLOW = "rgba(173,214,255,0.55)";

/** Pure-CSS ambient night-sky backdrop — no JS/hydration cost, safe to mount on every page. */
export function Starfield({ density = "normal", className }: StarfieldProps) {
  const stars = generateStars(STAR_COUNT);

  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      style={{ opacity: CONTAINER_OPACITY[density] }}
    >
      <div className="starfield-container">
        {stars.map((star, i) => (
          <span
            key={i}
            className="star"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              ["--star-color" as string]: star.hue === "warm" ? "#fff7ea" : "#eaf4ff",
              ["--star-glow-color" as string]: star.hue === "warm" ? WARM_GLOW : BLUE_GLOW,
              ["--star-glow" as string]: `${star.size * 2.5}px`,
              ["--star-glow-spread" as string]: `${star.size * 0.4}px`,
              ["--star-opacity" as string]: star.opacity,
              ["--star-duration" as string]: `${star.duration}s`,
              ["--star-delay" as string]: `${star.delay}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
