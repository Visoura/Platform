import { useId } from 'react';

interface EyeLogoProps {
  className?: string;
  style?: React.CSSProperties;
}

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
      aria-label="Visoura logo"
    >
      <defs>
        <clipPath id={clip}>
          <path d={EYE_PATH} />
        </clipPath>
      </defs>

      {/* Sclera */}
      <path d={EYE_PATH} fill="#060C18" />

      {/* Iris */}
      <circle cx="28" cy="15" r="10" fill="#0A1628" clipPath={`url(#${clip})`} />
      <circle cx="28" cy="15" r="10" stroke="#3B82F6" strokeWidth="1.2" fill="none" clipPath={`url(#${clip})`} />

      {/* Pupil */}
      <circle cx="28" cy="15" r="4" fill="#3B82F6" clipPath={`url(#${clip})`} />

      {/* Specular */}
      <circle cx="30" cy="12.5" r="1.1" fill="white" opacity="0.7" clipPath={`url(#${clip})`} />

      {/* Eye outline */}
      <path d={EYE_PATH} stroke="#3B82F6" strokeWidth="1.1" />
    </svg>
  );
}
