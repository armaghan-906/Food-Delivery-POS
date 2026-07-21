/** Small inline icons, stroked to match the Figma line-icon set. */
type IconProps = { className?: string };

const base = (className?: string) => ({
  className,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export function PlusIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function MinusIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3-3" />
    </svg>
  );
}

export function MenuIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function UtensilsIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 3v7a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3M6 12v9M14 3c-1.5 0-2.5 2-2.5 5s1 4 2.5 4v9" />
    </svg>
  );
}

export function CardIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  );
}

export function BackspaceIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M21 5H8l-5 7 5 7h13a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z" />
      <path d="m15 9-4 6M11 9l4 6" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function RefreshIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
    </svg>
  );
}

export function MessageCircleIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5Z" />
    </svg>
  );
}

export function DrawerIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M9 15h6" />
    </svg>
  );
}

export function BanknoteIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M6 12h.01M18 12h.01" />
    </svg>
  );
}

export function DivideIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="6" r="1" />
      <circle cx="12" cy="18" r="1" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function TicketPercentIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="m9 15 6-6M9 9h.01M15 15h.01" />
    </svg>
  );
}

export function PrinterIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" rx="1" />
    </svg>
  );
}

export function MailIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m2 7 10 6 10-6" />
    </svg>
  );
}

export function SmartphoneIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <path d="M12 18h.01" />
    </svg>
  );
}

export function CheckCircleIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function LockIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function ArrowLeftIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

export function XCircleIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6M9 9l6 6" />
    </svg>
  );
}

export function PlusCircleIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

export function AlertBadgeIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}

export function TableGridIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M12 3v18M3 9h18M3 15h18" />
    </svg>
  );
}

export function ReceiptIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1Z" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </svg>
  );
}

export function MoveIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" />
    </svg>
  );
}

export function SparklesIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 3l1.6 4.9L18.5 9.5 13.6 11 12 16l-1.6-5L5.5 9.5l4.9-1.6L12 3Z" />
      <path d="M19 14l.8 2.4L22 17l-2.2.6L19 20l-.8-2.4L16 17l2.2-.6L19 14Z" />
    </svg>
  );
}

export function ChefHatIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <path d="M6.99948 19.8323H20.9995M19.833 24.4991C20.1424 24.4991 20.4391 24.3762 20.6579 24.1574C20.8767 23.9386 20.9996 23.6419 20.9996 23.3325V17.0908C20.9996 16.5576 21.3683 16.1061 21.8478 15.8763C22.8406 15.4027 23.6342 14.5936 24.0885 13.5918C24.5429 12.5901 24.6287 11.46 24.331 10.4011C24.0332 9.34217 23.371 8.42247 22.4611 7.8043C21.5513 7.18613 20.4523 6.90923 19.3581 7.02247C18.9075 5.97504 18.1598 5.08264 17.2075 4.45561C16.2551 3.82858 15.1399 3.4944 13.9996 3.4944C12.8594 3.4944 11.7442 3.82858 10.7918 4.45561C9.83946 5.08264 9.09176 5.97504 8.64115 7.02247C7.54749 6.91003 6.44926 7.18732 5.54007 7.80546C4.63088 8.4236 3.96913 9.34289 3.67148 10.4013C3.37383 11.4596 3.45941 12.5891 3.91312 13.5905C4.36683 14.5919 5.15954 15.401 6.15148 15.8751C6.63098 16.1061 6.99965 16.5576 6.99965 17.0896V23.3325C6.99965 23.6419 7.12256 23.9386 7.34135 24.1574C7.56015 24.3762 7.85689 24.4991 8.16631 24.4991H19.833Z" />
    </svg>
  );
}

export function KeyRoundIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <path d="M1.666 15.6904C1.66609 15.2484 1.84177 14.8245 2.15438 14.512L7.83321 8.83317C7.42972 7.67487 7.43126 6.41393 7.83758 5.25662C8.2439 4.09932 9.03095 3.11416 10.07 2.46231C11.109 1.81047 12.3385 1.53053 13.5573 1.66828C14.7761 1.80604 15.912 2.35334 16.7793 3.22065C17.6467 4.08796 18.194 5.22394 18.3317 6.44274C18.4695 7.66154 18.1895 8.89102 17.5377 9.93004C16.8858 10.9691 15.9007 11.7561 14.7434 12.1624C13.5861 12.5687 12.3251 12.5703 11.1668 12.1668L10.4884 12.8452C10.1759 13.1578 9.75203 13.3335 9.31 13.3336H9.16666C8.94562 13.3336 8.73364 13.4214 8.57735 13.5777C8.42106 13.734 8.33325 13.9459 8.33325 14.167V15.0004C8.33325 15.2214 8.24545 15.4334 8.08915 15.5897C7.93286 15.746 7.72088 15.8338 7.49984 15.8338H6.66644C6.4454 15.8338 6.23342 15.9216 6.07713 16.0779C5.92084 16.2342 5.83303 16.4462 5.83303 16.6672V17.5006C5.83303 17.7216 5.74523 17.9336 5.58893 18.0899C5.43264 18.2462 5.22066 18.334 4.99963 18.334H2.49941C2.27837 18.334 2.06639 18.2462 1.9101 18.0899C1.75381 17.9336 1.666 17.7216 1.666 17.5006V15.6904Z" />
    </svg>
  );
}

export function ChartColumnIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <path d="M2.5 2.5V15.8333C2.5 16.2754 2.67559 16.6993 2.98816 17.0118C3.30072 17.3244 3.72464 17.5 4.16667 17.5H17.5M15 14.1667V7.5M10.8333 14.1667V4.16667M6.66667 14.1667V11.6667" />
    </svg>
  );
}
