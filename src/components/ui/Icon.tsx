import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Alert02Icon,
  Analytics01Icon,
  ArrowDown01Icon,
  ArrowLeft02Icon,
  Audit01Icon,
  Calendar03Icon,
  Cancel01Icon,
  DashboardSquare01Icon,
  File02Icon,
  Invoice01Icon,
  Menu01Icon,
  MoneyReceive01Icon,
  Notification01Icon,
  PackageIcon,
  Search01Icon,
  Settings01Icon,
  Tick02Icon,
  UserGroupIcon,
  UserShield01Icon,
  Wallet02Icon,
  WhatsappIcon,
} from "@hugeicons/core-free-icons";

// Names match the Figma Iconography frame (6:2); values are the exact
// Hugeicons Stroke Rounded glyphs the design uses.
export const icons = {
  dashboard: DashboardSquare01Icon,
  customers: UserGroupIcon,
  contracts: File02Icon,
  products: PackageIcon,
  calendar: Calendar03Icon,
  wallet: Wallet02Icon,
  collections: MoneyReceive01Icon,
  alert: Alert02Icon,
  chat: WhatsappIcon,
  reports: Analytics01Icon,
  statement: Invoice01Icon,
  shield: UserShield01Icon,
  history: Audit01Icon,
  settings: Settings01Icon,
  search: Search01Icon,
  bell: Notification01Icon,
  plus: Add01Icon,
  check: Tick02Icon,
  arrow: ArrowLeft02Icon,
  chevronDown: ArrowDown01Icon,
  menu: Menu01Icon,
  close: Cancel01Icon,
} as const;

export type IconName = keyof typeof icons;

type IconProps = {
  name: IconName;
  size?: number;
  className?: string;
  /** Accessible label; omit for decorative icons next to visible text. */
  label?: string;
};

export function Icon({ name, size = 24, className, label }: IconProps) {
  return (
    <HugeiconsIcon
      icon={icons[name]}
      size={size}
      strokeWidth={1.75}
      color="currentColor"
      className={className}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}
