interface VisouraWordmarkProps {
  size?: 'sm' | 'lg';
  /** Override the computed font size in px */
  fontSize?: number;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

const BLUE = '#3B82F6';

// The "O" rendered as a camera lens / AI sensor
function LensO({ diameter }: { diameter: number }) {
  return (
    <svg
      width={diameter}
      height={diameter}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flexShrink: 0 }}
      aria-hidden="true"
    >
      {/* Outer O ring — weight mirrors the bold font's stem */}
      <circle cx="50" cy="50" r="43.5" stroke={BLUE} strokeWidth="12" />
      {/* Mid focus ring */}
      <circle cx="50" cy="50" r="29" stroke={BLUE} strokeWidth="3.5" opacity="0.65" />
      {/* Inner aperture ring */}
      <circle cx="50" cy="50" r="16" stroke={BLUE} strokeWidth="2.5" opacity="0.55" />
      {/* Center sensor dot */}
      <circle cx="50" cy="50" r="6.5" fill={BLUE} />
    </svg>
  );
}

export function VisouraWordmark({ size = 'lg', fontSize: fontSizeOverride, onClick, className, style }: VisouraWordmarkProps) {
  const isLg = size === 'lg';
  const fontSize = fontSizeOverride ?? (isLg ? 38 : 13.5);
  // Cap height ≈ 74% of fontSize; O is roughly square in bold sans-serif
  const oDiam = Math.round(fontSize * 0.74);
  // Gap between text segments and the O (matches letter-spacing feel)
  const gap = isLg ? 4 : 1.5;

  const textStyle: React.CSSProperties = {
    fontWeight: 700,
    fontSize,
    letterSpacing: '0.12em',
    color: '#F0F4F8',
    lineHeight: 1,
  };

  const containerStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap,
    border: 'none',
    background: 'none',
    padding: 0,
    margin: 0,
    cursor: onClick ? 'pointer' : 'default',
    textDecoration: 'none',
    ...style,
  };

  if (onClick) {
    return (
      <button onClick={onClick} className={className} style={containerStyle}>
        <span style={textStyle}>VIS</span>
        <LensO diameter={oDiam} />
        <span style={textStyle}>URA</span>
      </button>
    );
  }

  return (
    <div className={className} style={containerStyle}>
      <span style={textStyle}>VIS</span>
      <LensO diameter={oDiam} />
      <span style={textStyle}>URA</span>
    </div>
  );
}
