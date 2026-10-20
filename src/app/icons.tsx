interface IconProps {
  size?: number
  className?: string
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
})

export const IconSearch = ({ size = 14, className }: IconProps) => (
  <svg {...base(size)} className={className}><circle cx="7" cy="7" r="4.25" /><path d="m10.2 10.2 2.8 2.8" /></svg>
)

export const IconPlus = ({ size = 14, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="M8 3.5v9M3.5 8h9" /></svg>
)

export const IconChevron = ({ size = 14, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="m4.5 6.5 3.5 3.5 3.5-3.5" /></svg>
)

export const IconCheck = ({ size = 14, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="m3.5 8.5 3 3 6-7" /></svg>
)

export const IconCheckCircle = ({ size = 14, className }: IconProps) => (
  <svg {...base(size)} className={className}><circle cx="8" cy="8" r="5.75" /><path d="m5.5 8.2 1.8 1.8 3.4-3.9" /></svg>
)

export const IconBug = ({ size = 14, className }: IconProps) => (
  <svg {...base(size)} className={className}><rect x="5" y="5.5" width="6" height="8" rx="3" /><path d="M5 8H2.5M11 8h2.5M5 11H3M11 11h2M6 3.2 7 4.6M10 3.2 9 4.6" /></svg>
)

export const IconSpark = ({ size = 14, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="M8 2.5 9.3 6l3.2 1.3-3.2 1.3L8 12l-1.3-3.4L3.5 7.3 6.7 6z" /></svg>
)

export const IconClock = ({ size = 14, className }: IconProps) => (
  <svg {...base(size)} className={className}><circle cx="8" cy="8" r="5.75" /><path d="M8 4.75V8l2.25 1.5" /></svg>
)

export const IconBoard = ({ size = 14, className }: IconProps) => (
  <svg {...base(size)} className={className}><rect x="2.5" y="3" width="11" height="10" rx="2" /><path d="M6.2 3v10M9.8 3v10" /></svg>
)

export const IconList = ({ size = 14, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="M6 4.5h7.5M6 8h7.5M6 11.5h7.5M3.2 4.5h.01M3.2 8h.01M3.2 11.5h.01" /></svg>
)

export const IconTrash = ({ size = 14, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="M3 4.5h10M6.5 4.5V3.2h3v1.3M4.5 4.5l.6 8.3h5.8l.6-8.3" /></svg>
)

export const IconClose = ({ size = 14, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="m4.5 4.5 7 7M11.5 4.5l-7 7" /></svg>
)

export const IconFilter = ({ size = 14, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="M2.5 4h11M4.5 8h7M6.5 12h3" /></svg>
)

export const IconInbox = ({ size = 14, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="M2.5 9.5 4 3.8h8l1.5 5.7v3a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z" /><path d="M2.5 9.5h3l.7 1.6h3.6l.7-1.6h3" /></svg>
)
