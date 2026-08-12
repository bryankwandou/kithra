/**
 * Kithra mark — "The Knot".
 *
 * Two arcs that genuinely interlace: arc A passes under B at the top crossing
 * and over it at the bottom. The over-under is done by redrawing A clipped to
 * the lower band, which is what separates a real knot from two stacked curves.
 * The filled centre is the memory core — the thing that persists.
 */

const A = "M 11 4.5 C 23.5 10.5, 23.5 21.5, 11 27.5";
const B = "M 21 4.5 C 8.5 10.5, 8.5 21.5, 21 27.5";

export function Mark({
  size = 32,
  className = "",
  breathe = false,
}: {
  size?: number;
  className?: string;
  breathe?: boolean;
}) {
  const id = `k${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      role="img"
      aria-label="Kithra"
    >
      <defs>
        <linearGradient id={`${id}-g`} x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--ember)" />
          <stop offset="1" stopColor="var(--ember-soft)" />
        </linearGradient>
        {/* Lower band — where arc A must ride over arc B. */}
        <clipPath id={`${id}-c`}>
          <rect x="0" y="18" width="32" height="14" />
        </clipPath>
      </defs>

      <g
        stroke={`url(#${id}-g)`}
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      >
        {/* A under */}
        <path d={A} opacity="0.95" />
        {/* B over, with caps clear of the join */}
        <path d={B} />
        {/* A redrawn over B in the lower band → true interlace */}
        <g clipPath={`url(#${id}-c)`}>
          {/* a hairline of background separates the strands so the weave reads */}
          <path d={A} stroke="var(--paper)" strokeWidth="5.4" />
          <path d={A} stroke={`url(#${id}-g)`} strokeWidth="2.6" />
        </g>
      </g>

      <circle
        cx="16"
        cy="16"
        r="2.5"
        fill="var(--ember)"
        className={breathe ? "breathe" : undefined}
        style={{ transformOrigin: "16px 16px" }}
      />
    </svg>
  );
}

export function Wordmark({
  size = 22,
  showMark = true,
}: {
  size?: number;
  showMark?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      {showMark && <Mark size={size * 1.28} />}
      <span
        className="font-serif tracking-tight text-ink"
        style={{ fontSize: size, letterSpacing: "-0.015em" }}
      >
        Kithra
      </span>
    </span>
  );
}
