import type { SVGProps } from 'react';

export type IconName =
  | 'open'
  | 'save'
  | 'undo'
  | 'redo'
  | 'sun'
  | 'moon'
  | 'monitor'
  | 'settings'
  | 'chevron-down'
  | 'chevron-up'
  | 'chevron-left'
  | 'chevron-right'
  | 'cube'
  | 'layers'
  | 'play'
  | 'pause'
  | 'skip-back'
  | 'skip-forward'
  | 'warning'
  | 'check'
  | 'check-circle'
  | 'close'
  | 'download'
  | 'info'
  | 'rotate'
  | 'move'
  | 'scale'
  | 'flat'
  | 'magic'
  | 'refresh'
  | 'eye'
  | 'eye-off'
  | 'grid'
  | 'section'
  | 'frame'
  | 'needle'
  | 'pump'
  | 'clock'
  | 'file'
  | 'plus'
  | 'minus'
  | 'external'
  | 'keyboard'
  | 'list'
  | 'activity'
  | 'code'
  | 'shield'
  | 'search'
  | 'trash'
  | 'ruler'
  | 'bed'
  | 'arrow-up-right'
  | 'crosshair'
  | 'flask'
  | 'flow'
  | 'layers-stack'
  | 'panel';

const paths: Record<IconName, React.ReactNode> = {
  open: (
    <>
      <path d="M3.5 6.8a1.6 1.6 0 0 1 1.6-1.6h4.1l1.8 2.1h7.9a1.6 1.6 0 0 1 1.6 1.6v8.5a1.6 1.6 0 0 1-1.6 1.6H5.1a1.6 1.6 0 0 1-1.6-1.6Z" />
      <path d="M3.5 9.5h17" />
    </>
  ),
  save: (
    <>
      <path d="M5 4.5h11l3 3v12H5z" />
      <path d="M8 4.5v5h7v-5M8 19.5v-6h8v6" />
    </>
  ),
  undo: (
    <>
      <path d="M9 7 4.5 11.5 9 16" />
      <path d="M4.5 11.5H14a5 5 0 0 1 0 10h-2" />
    </>
  ),
  redo: (
    <>
      <path d="m15 7 4.5 4.5L15 16" />
      <path d="M19.5 11.5H10a5 5 0 0 0 0 10h2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4.1" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
    </>
  ),
  moon: <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.2 8.2 0 1 0 20 14.2Z" />,
  monitor: (
    <>
      <rect x="3" y="4.8" width="18" height="12.4" rx="1.6" />
      <path d="M9 20.5h6M12 17.2v3.3" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.4 13.5a7.8 7.8 0 0 0 0-3l2-1.5-2-3.4-2.4 1a8 8 0 0 0-2.6-1.5l-.4-2.6h-4l-.4 2.6A8 8 0 0 0 7 6.6l-2.4-1-2 3.4 2 1.5a7.8 7.8 0 0 0 0 3l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 2.6 1.5l.4 2.6h4l.4-2.6a8 8 0 0 0 2.6-1.5l2.4 1 2-3.4Z" />
    </>
  ),
  'chevron-down': <path d="m6 9.5 6 6 6-6" />,
  'chevron-up': <path d="m6 14.5 6-6 6 6" />,
  'chevron-left': <path d="m14.5 6-6 6 6 6" />,
  'chevron-right': <path d="m9.5 6 6 6-6 6" />,
  cube: (
    <>
      <path d="m12 3 8 4.4v9.2L12 21l-8-4.4V7.4Z" />
      <path d="m4 7.4 8 4.5 8-4.5M12 12v9" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3.5 8.5 4.6L12 12.7 3.5 8.1Z" />
      <path d="m4 12.2 8 4.3 8-4.3M4 16.1l8 4.3 8-4.3" />
    </>
  ),
  play: <path d="M8 5.4v13.2L19 12Z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="6.5" y="5" width="3.8" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="13.7" y="5" width="3.8" height="14" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  'skip-back': (
    <>
      <path d="M18.5 5.5v13L8.5 12Z" fill="currentColor" stroke="none" />
      <path d="M5.5 5.5v13" />
    </>
  ),
  'skip-forward': (
    <>
      <path d="M5.5 5.5v13L15.5 12Z" fill="currentColor" stroke="none" />
      <path d="M18.5 5.5v13" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3.6 21.2 20H2.8Z" />
      <path d="M12 9v4.8M12 17.1v.1" />
    </>
  ),
  check: <path d="m4.5 12.4 5 5L19.8 7" />,
  'check-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.3 2.7 2.8 5.5-5.8" />
    </>
  ),
  close: <path d="m5.5 5.5 13 13M18.5 5.5l-13 13" />,
  download: (
    <>
      <path d="M12 3.8v11.4M7.3 10.6 12 15.3l4.7-4.7" />
      <path d="M4.5 19.8h15" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10.7V17M12 7.2v.1" />
    </>
  ),
  rotate: (
    <>
      <path d="M20 12a8 8 0 1 1-2.4-5.7" />
      <path d="M20.5 4.2v5.4h-5.4" />
    </>
  ),
  move: (
    <>
      <path d="M12 3v18M3 12h18" />
      <path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
    </>
  ),
  scale: (
    <>
      <path d="M4 9V4h5M20 15v5h-5" />
      <path d="M4.8 4.8 10 10M19.2 19.2 14 14" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
    </>
  ),
  flat: (
    <>
      <path d="M3.5 17.5h17M5.5 17.5V9l6.5-4 6.5 4v8.5" />
      <path d="M9.5 17.5v-4.2h5v4.2" />
    </>
  ),
  magic: (
    <>
      <path d="m4 20 11.5-11.5M13.5 6.5l4 4" />
      <path d="M18 3.2v3M16.5 4.7h3M19.5 9.2v2.2M18.4 10.3h2.2M7 3.5v2M6 4.5h2" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11.5A8 8 0 0 0 6.2 6.7L4 9" />
      <path d="M4.4 4.5V9h4.5M4 12.5a8 8 0 0 0 13.8 4.8L20 15" />
      <path d="M19.6 19.5V15h-4.5" />
    </>
  ),
  eye: (
    <>
      <path d="M2.8 12S6.2 5.8 12 5.8 21.2 12 21.2 12 17.8 18.2 12 18.2 2.8 12 2.8 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M3 3l18 18M10.6 6.1A8.8 8.8 0 0 1 12 6c5.8 0 9.2 6 9.2 6a16 16 0 0 1-2.3 3M6.1 7.7A16 16 0 0 0 2.8 12S6.2 18 12 18a9 9 0 0 0 3.2-.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
      <path d="M3.5 9.2h17M3.5 14.8h17M9.2 3.5v17M14.8 3.5v17" />
    </>
  ),
  section: (
    <>
      <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5Z" />
      <path d="M4 8.5 12 13l8-4.5M12 13v7" />
      <path d="M12 3v18" strokeDasharray="2 2" />
    </>
  ),
  frame: (
    <>
      <path d="M8 3.5H4.5V7M16 3.5h3.5V7M8 20.5H4.5V17M16 20.5h3.5V17" />
      <rect x="8" y="8" width="8" height="8" rx="1" />
    </>
  ),
  needle: (
    <>
      <path d="M14 3.5 20.5 3.5 20.5 10 10.5 20 7 20V16.5Z" />
      <path d="m12.5 11 4 4M8.5 17.5 6 20" />
    </>
  ),
  pump: (
    <>
      <path d="M12 3.2s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11Z" />
      <path d="M9.5 14.2a2.6 2.6 0 0 0 2.5 2.4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.4l3.5 2" />
    </>
  ),
  file: (
    <>
      <path d="M6 3.5h7l5 5v12H6z" />
      <path d="M13 3.5v5h5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  external: (
    <>
      <path d="M14 4h6v6M20 4l-8.5 8.5" />
      <path d="M18 13.5v6H4.5v-14H10" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="1.8" />
      <path d="M6 9.5h.1M9.2 9.5h.1M12.4 9.5h.1M15.6 9.5h.1M18.8 9.5h.1M6 12.6h.1M9.2 12.6h.1M12.4 12.6h.1M15.6 12.6h.1M18.8 12.6h.1M7.5 15.4h9" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h12M9 12h12M9 18h12" />
      <path d="M4 6h.1M4 12h.1M4 18h.1" />
    </>
  ),
  activity: <path d="M3 12h4l2.4-6 4.2 12 2.2-6H21" />,
  code: <path d="m8 7-5 5 5 5M16 7l5 5-5 5M13.5 4l-3 16" />,
  shield: (
    <>
      <path d="M12 3.2 20 6v6c0 5-8 9-8 9s-8-4-8-9V6Z" />
      <path d="m8.5 12 2.4 2.4 4.8-5" />
    </>
  ),
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="m15.5 15.5 5 5" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 7h15M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  ruler: (
    <>
      <rect x="2.5" y="8" width="19" height="8" rx="1.2" transform="rotate(-8 12 12)" />
      <path d="m7 9.2-1 3.5M11 8.6l-1 3.5M15 8l-1 3.5M19 7.4l-1 3.5" />
    </>
  ),
  bed: (
    <>
      <path d="M3.5 9.5 12 5l8.5 4.5v5L12 19l-8.5-4.5Z" />
      <path d="M3.5 9.5 12 14l8.5-4.5M12 14v5" />
    </>
  ),
  'arrow-up-right': <path d="M6.5 17.5 17.5 6.5M8 6.5h9.5V16" />,
  crosshair: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5" />
    </>
  ),
  flask: (
    <>
      <path d="M9 3.5h6M10 3.5v6L4.8 18a1.8 1.8 0 0 0 1.5 2.7h11.4a1.8 1.8 0 0 0 1.5-2.7L14 9.5v-6" />
      <path d="M7.3 15h9.4" />
    </>
  ),
  flow: (
    <>
      <path d="M4 6h6a4 4 0 0 1 4 4v4a4 4 0 0 0 4 4h2" />
      <path d="m17.5 15.5 2.5 2.5-2.5 2.5M6.5 3.5 4 6l2.5 2.5" />
    </>
  ),
  'layers-stack': (
    <>
      <rect x="4" y="4" width="16" height="5" rx="1" />
      <rect x="4" y="10.5" width="16" height="4" rx="1" />
      <rect x="4" y="16" width="16" height="4" rx="1" />
    </>
  ),
  panel: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="1.5" />
      <path d="M14 4v16" />
    </>
  ),
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 20, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
