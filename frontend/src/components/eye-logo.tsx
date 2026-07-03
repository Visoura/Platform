import { useId } from 'react';

interface EyeLogoProps {
  className?: string;
  style?: React.CSSProperties;
}

// Eye outline path — sharp almond, center (28,15), opens ±13 px vertically
const EYE_PATH = 'M2 15 C10 3, 22 2, 28 2 C34 2, 46 3, 54 15 C46 27, 34 28, 28 28 C22 28, 10 27, 2 15 Z';

export function EyeLogo({ className, style }: EyeLogoProps) {
  const uid = useId().replace(/:/g, '');
  const clip = `ec${uid}`;

  return (
    <svg
      viewBox="0 0 56 30"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-label="Eye logo"
    >
      <defs>
        <clipPath id={clip}>
          <path d={EYE_PATH} />
        </clipPath>
      </defs>

      {/* ── Dark sclera background ──────────────────────────────── */}
      <path d={EYE_PATH} fill="#060C18" />

      {/* ── Circuit traces — left corner ────────────────────────── */}
      <g clipPath={`url(#${clip})`} stroke="#3B82F6" strokeWidth="0.55" fill="none" opacity="0.55">
        <polyline points="5,13 5,11 9,11" />
        <polyline points="6,17 6,19 10,19" />
        <rect x="4.3" y="12.3" width="1.4" height="1.4" fill="#3B82F6" stroke="none" />
        <rect x="9.3" y="10.3" width="1.4" height="1.4" fill="#3B82F6" stroke="none" />
        <rect x="5.3" y="18.3" width="1.4" height="1.4" fill="#3B82F6" stroke="none" />
        <rect x="10.3" y="18.3" width="1.4" height="1.4" fill="#3B82F6" stroke="none" />
      </g>

      {/* ── Circuit traces — right corner ───────────────────────── */}
      <g clipPath={`url(#${clip})`} stroke="#3B82F6" strokeWidth="0.55" fill="none" opacity="0.55">
        <polyline points="51,13 51,11 47,11" />
        <polyline points="50,17 50,19 46,19" />
        <rect x="50.3" y="12.3" width="1.4" height="1.4" fill="#3B82F6" stroke="none" />
        <rect x="46.3" y="10.3" width="1.4" height="1.4" fill="#3B82F6" stroke="none" />
        <rect x="49.3" y="18.3" width="1.4" height="1.4" fill="#3B82F6" stroke="none" />
        <rect x="45.3" y="18.3" width="1.4" height="1.4" fill="#3B82F6" stroke="none" />
      </g>

      {/* ── Iris fill (r=10) ────────────────────────────────────── */}
      <circle cx="28" cy="15" r="10" fill="#0A1628" clipPath={`url(#${clip})`} />

      {/* ── Outer iris ring + segmented dashes ──────────────────── */}
      <circle cx="28" cy="15" r="10" stroke="#3B82F6" strokeWidth="1.4" clipPath={`url(#${clip})`} />
      <circle cx="28" cy="15" r="10" stroke="#60A5FA" strokeWidth="0.7"
        strokeDasharray="2.2 2.2" strokeDashoffset="1.1" opacity="0.45" clipPath={`url(#${clip})`} />

      {/* ── Camera lens focus ring ───────────────────────────────── */}
      <circle cx="28" cy="15" r="7.5" stroke="#3B82F6" strokeWidth="0.65" opacity="0.55" clipPath={`url(#${clip})`} />

      {/* ── Aperture hex (r=5.5, rotated 30°) ───────────────────── */}
      <polygon
        points="32.76,12.25 28,9.5 23.24,12.25 23.24,17.75 28,20.5 32.76,17.75"
        stroke="#3B82F6" strokeWidth="0.7" fill="none" opacity="0.65"
        clipPath={`url(#${clip})`}
      />

      {/* ── Aperture blade dividers (hex vertices → focus ring) ──── */}
      <g stroke="#3B82F6" strokeWidth="0.45" opacity="0.4" clipPath={`url(#${clip})`}>
        <line x1="28"    y1="9.5"  x2="28"    y2="7.5"  />
        <line x1="32.76" y1="12.25" x2="34.5"  y2="11.25" />
        <line x1="32.76" y1="17.75" x2="34.5"  y2="18.75" />
        <line x1="28"    y1="20.5" x2="28"    y2="22.5"  />
        <line x1="23.24" y1="17.75" x2="21.5"  y2="18.75" />
        <line x1="23.24" y1="12.25" x2="21.5"  y2="11.25" />
      </g>

      {/* ── Reticle crosshair ────────────────────────────────────── */}
      <g stroke="#3B82F6" strokeWidth="0.5" opacity="0.45" clipPath={`url(#${clip})`}>
        <line x1="28" y1="5.5"  x2="28" y2="7"   />
        <line x1="28" y1="23"   x2="28" y2="24.5" />
        <line x1="18" y1="15"   x2="19.5" y2="15" />
        <line x1="36.5" y1="15" x2="38"   y2="15" />
      </g>

      {/* ── Inner lens housing ring ──────────────────────────────── */}
      <circle cx="28" cy="15" r="4.0" stroke="#3B82F6" strokeWidth="0.7" fill="#07101E" clipPath={`url(#${clip})`} />

      {/* ── Pupil / aperture opening ─────────────────────────────── */}
      <circle cx="28" cy="15" r="2.8" fill="#1D4ED8" clipPath={`url(#${clip})`} />
      <circle cx="28" cy="15" r="1.8" fill="#3B82F6" clipPath={`url(#${clip})`} />

      {/* ── Lens specular highlights ─────────────────────────────── */}
      <circle cx="29.5" cy="13.5" r="0.8" fill="#BFDBFE" opacity="0.85" clipPath={`url(#${clip})`} />
      <circle cx="26.8" cy="16.5" r="0.35" fill="#BFDBFE" opacity="0.4"  clipPath={`url(#${clip})`} />

      {/* ── Eye outline on top (crisp edge) ─────────────────────── */}
      <path d={EYE_PATH} stroke="#3B82F6" strokeWidth="1.1" />
    </svg>
  );
}
