import {
  ArrowRight,
  Download,
  Ellipsis,
  ArrowLeftRight,
  ArrowUpRight,
  Zap,
  Layers,
  Check,
  ChevronDown,
  X,
  Coins,
  Copy,
  Swords,
  ExternalLink,
  SlidersHorizontal,
  Flame,
  Gift,
  Globe2,
  Info,
  LockKeyhole,
  LogOut,
  Menu,
  PackageOpen,
  Plus,
  RotateCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sword,
  Trash2,
  Trophy,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";

const icons = {
  "arrow-right": ArrowRight,
  download: Download,
  "arrow-up-right": ArrowUpRight,
  bolt: Zap,
  cards: Layers,
  check: Check,
  "chevron-down": ChevronDown,
  close: X,
  coin: Coins,
  copy: Copy,
  duel: Swords,
  external: ExternalLink,
  filter: SlidersHorizontal,
  flame: Flame,
  gift: Gift,
  globe: Globe2,
  info: Info,
  lock: LockKeyhole,
  logout: LogOut,
  menu: Menu,
  more: Ellipsis,
  pack: PackageOpen,
  plus: Plus,
  refresh: RotateCw,
  search: Search,
  settings: Settings,
  shield: ShieldCheck,
  spark: Sparkles,
  swap: ArrowLeftRight,
  sword: Sword,
  trash: Trash2,
  trophy: Trophy,
  user: UserRound,
  wallet: Wallet,
} satisfies Record<string, LucideIcon>;
export type IconName = keyof typeof icons;
export function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const Symbol = icons[name];
  return (
    <Symbol
      size={size}
      strokeWidth={1.7}
      aria-hidden="true"
      className={className ? `shrink-0 ${className}` : "shrink-0"}
    />
  );
}
