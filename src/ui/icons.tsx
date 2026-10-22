// Simple line icons drawn inline. Decorative by default; give a `title` to make one speak.
import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { title?: string };

function Icon({ title, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      {...rest}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

export const FolderIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.2l2 2h8.8A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
    <path d="M12 11v5m-2.5-2.5L12 11l2.5 2.5" />
  </Icon>
);

export const LockIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </Icon>
);

export const ListIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
  </Icon>
);

export const SkipNextIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 5.5v13l9-6.5z" fill="currentColor" />
    <path d="M18 5.5v13" strokeWidth={2.4} />
  </Icon>
);

export const PlayIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 4.8v14.4L19 12z" fill="currentColor" />
  </Icon>
);

export const PauseIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none" />
    <rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none" />
  </Icon>
);

/** Circular arrow with "15" inside; `dir` -1 rewinds. */
export const Skip15Icon = ({ dir, ...p }: IconProps & { dir: 1 | -1 }) => (
  <Icon {...p}>
    {dir < 0 ? (
      <>
        <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
        <path d="M6.7 2.8v3.9h3.9" />
      </>
    ) : (
      <>
        <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
        <path d="M17.3 2.8v3.9h-3.9" />
      </>
    )}
    <text x="12" y="15.2" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="currentColor" stroke="none">
      15
    </text>
  </Icon>
);

export const MapIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 4.5 3.5 6.5v13L9 17.5l6 2 5.5-2v-13L15 6.5z" />
    <path d="M9 4.5v13M15 6.5v13" />
  </Icon>
);

export const GridIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const MoreIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="5.5" cy="12" r="1.3" fill="currentColor" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    <circle cx="18.5" cy="12" r="1.3" fill="currentColor" />
  </Icon>
);

export const SteeringWheelIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="2.2" />
    <path d="M3.8 10.5c2.6-.9 5.3-1.3 8.2-1.3s5.6.4 8.2 1.3M12 14.2v6.3" />
  </Icon>
);

export const PedalIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="7.5" y="3.5" width="9" height="17" rx="2.5" />
  </Icon>
);

export const BrakePedalIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4.5" y="7" width="15" height="10" rx="3" />
  </Icon>
);

export const ArrowLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10.5 5 4 12l6.5 7v-4.2H20V9.2h-9.5z" fill="currentColor" stroke="none" />
  </Icon>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13.5 5 20 12l-6.5 7v-4.2H4V9.2h9.5z" fill="currentColor" stroke="none" />
  </Icon>
);
