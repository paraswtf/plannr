"use client";

import type { CSSProperties } from "react";

import type { Icon as PhosphorIcon, IconWeight } from "@phosphor-icons/react";
import { AlarmIcon } from "@phosphor-icons/react/dist/csr/Alarm";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import { ArrowsLeftRightIcon } from "@phosphor-icons/react/dist/csr/ArrowsLeftRight";
import { BellIcon } from "@phosphor-icons/react/dist/csr/Bell";
import { BookOpenIcon } from "@phosphor-icons/react/dist/csr/BookOpen";
import { BriefcaseIcon } from "@phosphor-icons/react/dist/csr/Briefcase";
import { BuildingsIcon } from "@phosphor-icons/react/dist/csr/Buildings";
import { CalendarBlankIcon } from "@phosphor-icons/react/dist/csr/CalendarBlank";
import { CalendarCheckIcon } from "@phosphor-icons/react/dist/csr/CalendarCheck";
import { CalendarXIcon } from "@phosphor-icons/react/dist/csr/CalendarX";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { CameraIcon } from "@phosphor-icons/react/dist/csr/Camera";
import { CaretRightIcon } from "@phosphor-icons/react/dist/csr/CaretRight";
import { ChartBarIcon } from "@phosphor-icons/react/dist/csr/ChartBar";
import { ChatCircleIcon } from "@phosphor-icons/react/dist/csr/ChatCircle";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { ClipboardTextIcon } from "@phosphor-icons/react/dist/csr/ClipboardText";
import { ClockIcon } from "@phosphor-icons/react/dist/csr/Clock";
import { CodeIcon } from "@phosphor-icons/react/dist/csr/Code";
import { CoffeeIcon } from "@phosphor-icons/react/dist/csr/Coffee";
import { CopyIcon } from "@phosphor-icons/react/dist/csr/Copy";
import { CpuIcon } from "@phosphor-icons/react/dist/csr/Cpu";
import { CursorIcon } from "@phosphor-icons/react/dist/csr/Cursor";
import { DatabaseIcon } from "@phosphor-icons/react/dist/csr/Database";
import { DeviceMobileIcon } from "@phosphor-icons/react/dist/csr/DeviceMobile";
import { DoorIcon } from "@phosphor-icons/react/dist/csr/Door";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { EnvelopeSimpleIcon } from "@phosphor-icons/react/dist/csr/EnvelopeSimple";
import { EyeIcon } from "@phosphor-icons/react/dist/csr/Eye";
import { FileIcon } from "@phosphor-icons/react/dist/csr/File";
import { GearSixIcon } from "@phosphor-icons/react/dist/csr/GearSix";
import { GitBranchIcon } from "@phosphor-icons/react/dist/csr/GitBranch";
import { GlobeIcon } from "@phosphor-icons/react/dist/csr/Globe";
import { GraduationCapIcon } from "@phosphor-icons/react/dist/csr/GraduationCap";
import { HandPointingIcon } from "@phosphor-icons/react/dist/csr/HandPointing";
import { HeartIcon } from "@phosphor-icons/react/dist/csr/Heart";
import { HourglassIcon } from "@phosphor-icons/react/dist/csr/Hourglass";
import { HouseIcon } from "@phosphor-icons/react/dist/csr/House";
import { ImageIcon } from "@phosphor-icons/react/dist/csr/Image";
import { KeyIcon } from "@phosphor-icons/react/dist/csr/Key";
import { LaptopIcon } from "@phosphor-icons/react/dist/csr/Laptop";
import { LightbulbIcon } from "@phosphor-icons/react/dist/csr/Lightbulb";
import { LightningIcon } from "@phosphor-icons/react/dist/csr/Lightning";
import { LinkIcon } from "@phosphor-icons/react/dist/csr/Link";
import { LinkBreakIcon } from "@phosphor-icons/react/dist/csr/LinkBreak";
import { ListIcon } from "@phosphor-icons/react/dist/csr/List";
import { ListBulletsIcon } from "@phosphor-icons/react/dist/csr/ListBullets";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { MapPinIcon } from "@phosphor-icons/react/dist/csr/MapPin";
import { MegaphoneIcon } from "@phosphor-icons/react/dist/csr/Megaphone";
import { MicrophoneIcon } from "@phosphor-icons/react/dist/csr/Microphone";
import { MonitorIcon } from "@phosphor-icons/react/dist/csr/Monitor";
import { MoonIcon } from "@phosphor-icons/react/dist/csr/Moon";
import { PaperPlaneTiltIcon } from "@phosphor-icons/react/dist/csr/PaperPlaneTilt";
import { PencilSimpleIcon } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { QuestionIcon } from "@phosphor-icons/react/dist/csr/Question";
import { ReceiptIcon } from "@phosphor-icons/react/dist/csr/Receipt";
import { RocketLaunchIcon } from "@phosphor-icons/react/dist/csr/RocketLaunch";
import { ShieldCheckIcon } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import { SidebarSimpleIcon } from "@phosphor-icons/react/dist/csr/SidebarSimple";
import { SignOutIcon } from "@phosphor-icons/react/dist/csr/SignOut";
import { SnowflakeIcon } from "@phosphor-icons/react/dist/csr/Snowflake";
import { SparkleIcon } from "@phosphor-icons/react/dist/csr/Sparkle";
import { SquareIcon } from "@phosphor-icons/react/dist/csr/Square";
import { SquaresFourIcon } from "@phosphor-icons/react/dist/csr/SquaresFour";
import { StackIcon } from "@phosphor-icons/react/dist/csr/Stack";
import { StarIcon } from "@phosphor-icons/react/dist/csr/Star";
import { SunIcon } from "@phosphor-icons/react/dist/csr/Sun";
import { TableIcon } from "@phosphor-icons/react/dist/csr/Table";
import { TargetIcon } from "@phosphor-icons/react/dist/csr/Target";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";
import { TrayIcon } from "@phosphor-icons/react/dist/csr/Tray";
import { UploadSimpleIcon } from "@phosphor-icons/react/dist/csr/UploadSimple";
import { UserIcon } from "@phosphor-icons/react/dist/csr/User";
import { UsersIcon } from "@phosphor-icons/react/dist/csr/Users";
import { WarningIcon } from "@phosphor-icons/react/dist/csr/Warning";
import { WifiSlashIcon } from "@phosphor-icons/react/dist/csr/WifiSlash";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";

/**
 * The deck's icons: Phosphor, behind the names the slides already use.
 *
 * One family for the whole deck, drawn light at slide sizes and regular at
 * app sizes, so a 64px icon on a slide is a fine line and a 16px one in a
 * phone mock-up still reads. Each icon is imported from its own file, so only
 * these are bundled.
 */
const ICONS = {
  calendar: CalendarBlankIcon,
  home: HouseIcon,
  door: DoorIcon,
  grid: SquaresFourIcon,
  users: UsersIcon,
  settings: GearSixIcon,
  plus: PlusIcon,
  building: BuildingsIcon,
  clock: ClockIcon,
  check: CheckIcon,
  checkCircle: CheckCircleIcon,
  x: XIcon,
  menu: ListIcon,
  panelFold: SidebarSimpleIcon,
  alert: WarningIcon,
  search: MagnifyingGlassIcon,
  mapPin: MapPinIcon,
  arrowRight: ArrowRightIcon,
  chevronDown: CaretDownIcon,
  chevronLeft: CaretLeftIcon,
  chevronRight: CaretRightIcon,
  layers: StackIcon,
  book: BookOpenIcon,
  monitor: MonitorIcon,
  cpu: CpuIcon,
  snow: SnowflakeIcon,
  square: SquareIcon,
  mic: MicrophoneIcon,
  star: StarIcon,
  sparkles: SparkleIcon,
  swap: ArrowsLeftRightIcon,
  logout: SignOutIcon,
  trash: TrashIcon,
  upload: UploadSimpleIcon,
  key: KeyIcon,
  copy: CopyIcon,
  rotate: ArrowClockwiseIcon,
  mail: EnvelopeSimpleIcon,
  bell: BellIcon,
  phone: DeviceMobileIcon,
  laptop: LaptopIcon,
  message: ChatCircleIcon,
  sun: SunIcon,
  moon: MoonIcon,
  coffee: CoffeeIcon,
  alarm: AlarmIcon,
  hourglass: HourglassIcon,
  briefcase: BriefcaseIcon,
  cap: GraduationCapIcon,
  clipboard: ClipboardTextIcon,
  shield: ShieldCheckIcon,
  database: DatabaseIcon,
  chart: ChartBarIcon,
  file: FileIcon,
  sheet: TableIcon,
  zap: LightningIcon,
  refresh: ArrowsClockwiseIcon,
  link: LinkIcon,
  linkBroken: LinkBreakIcon,
  eye: EyeIcon,
  user: UserIcon,
  inbox: TrayIcon,
  send: PaperPlaneTiltIcon,
  megaphone: MegaphoneIcon,
  gitBranch: GitBranchIcon,
  code: CodeIcon,
  heart: HeartIcon,
  rocket: RocketLaunchIcon,
  target: TargetIcon,
  image: ImageIcon,
  wifiOff: WifiSlashIcon,
  hand: HandPointingIcon,
  cursor: CursorIcon,
  list: ListBulletsIcon,
  edit: PencilSimpleIcon,
  receipt: ReceiptIcon,
  globe: GlobeIcon,
  lightbulb: LightbulbIcon,
  calendarCheck: CalendarCheckIcon,
  calendarX: CalendarXIcon,
  download: DownloadSimpleIcon,
  question: QuestionIcon,
  camera: CameraIcon,
} satisfies Record<string, PhosphorIcon>;

export type IconName = keyof typeof ICONS;

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

export interface IconProps {
  name: IconName;
  size?: number;
  /**
   * Line weight, in the old 24-unit stroke terms: up to 1.6 is light, up to
   * 2 regular, heavier is bold. Small icons never go below regular.
   */
  stroke?: number;
  color?: string;
  /** Anything but "none" draws the filled variant. */
  fill?: string;
  /** Overrides the weight worked out from size and stroke. */
  weight?: IconWeight;
  className?: string;
  style?: CSSProperties;
}

function weightFor(size: number, stroke: number, fill: string): IconWeight {
  if (fill !== "none") return "fill";
  if (stroke > 2) return "bold";
  if (size < 28 || stroke > 1.6) return "regular";
  return "light";
}

export function Icon({
  name,
  size = 24,
  stroke = 1.5,
  color = "currentColor",
  fill = "none",
  weight,
  className,
  style,
}: IconProps) {
  const Glyph = ICONS[name];
  return (
    <Glyph
      size={size}
      color={color}
      weight={weight ?? weightFor(size, stroke, fill)}
      className={className}
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
    />
  );
}
