import {
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Coins,
  Copy,
  Download,
  Ellipsis,
  ExternalLink,
  Flame,
  Gem,
  Gift,
  Globe2,
  Info,
  Layers,
  LockKeyhole,
  LogOut,
  Menu,
  PackageOpen,
  Plus,
  RotateCw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sword,
  Swords,
  Trash2,
  Trophy,
  TriangleAlert,
  UserRound,
  Wallet,
  X,
  Zap,
  type IconNode,
} from "lucide";

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
  gem: Gem,
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
  warning: TriangleAlert,
} satisfies Record<string, IconNode>;
export type IconName = keyof typeof icons;

// Lucide ships plain icon data. The markup comes from the library, never from
// user input, so it is safe to set as the SVG's contents.
const markup = new Map<IconName, string>();
function iconMarkup(name: IconName) {
  let html = markup.get(name);
  if (html === undefined) {
    html = icons[name]
      .map(([tag, attributes]) => {
        const pairs = Object.entries(attributes)
          .map(([key, value]) => `${key}="${String(value)}"`)
          .join(" ");
        return `<${tag} ${pairs}/>`;
      })
      .join("");
    markup.set(name, html);
  }
  return html;
}

export function Icon(props: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  class?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.size ?? 18}
      height={props.size ?? 18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={props.strokeWidth ?? 1.7}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      class={["shrink-0", props.class]}
      innerHTML={iconMarkup(props.name)}
    />
  );
}
