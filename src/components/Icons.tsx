/**
 * Ícones de linha — paths idênticos aos do Lucide (MIT), extraídos do próprio
 * HTML renderizado do site de referência (mesma marca, outra implementação),
 * para bater exatamente com o traço usado lá. 24×24, stroke atual.
 */
type IconProps = { className?: string };
const base = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function IconHome({ className }: IconProps) {
  return <svg className={className} {...base}><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1v-9" /></svg>;
}
export function IconCalculator({ className }: IconProps) {
  // lucide "box" — o mesmo usado para "Calculadora" no site de referência.
  return <svg className={className} {...base}><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>;
}
export function IconBook({ className }: IconProps) {
  return <svg className={className} {...base}><path d="M12 7v14" /><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" /></svg>;
}
export function IconGrid({ className }: IconProps) {
  return <svg className={className} {...base}><rect x="3.5" y="3.5" width="7" height="7" rx="1" /><rect x="13.5" y="3.5" width="7" height="7" rx="1" /><rect x="3.5" y="13.5" width="7" height="7" rx="1" /><rect x="13.5" y="13.5" width="7" height="7" rx="1" /></svg>;
}
export function IconUser({ className }: IconProps) {
  return <svg className={className} {...base}><circle cx="12" cy="8" r="3.4" /><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" /></svg>;
}
export function IconUsers({ className }: IconProps) {
  return <svg className={className} {...base}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><path d="M16 3.128a4 4 0 0 1 0 7.744" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" /></svg>;
}
export function IconFolder({ className }: IconProps) {
  return <svg className={className} {...base}><path d="M3.5 6.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2.2h8a1.5 1.5 0 0 1 1.5 1.5v9.3a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5Z" /></svg>;
}
export function IconTag({ className }: IconProps) {
  return <svg className={className} {...base}><path d="M11.4 3.5H6A2.5 2.5 0 0 0 3.5 6v5.4a2 2 0 0 0 .6 1.4l8 8a2 2 0 0 0 2.8 0l5.4-5.4a2 2 0 0 0 0-2.8l-8-8a2 2 0 0 0-1.4-.6Z" /><circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none" /></svg>;
}
export function IconFileText({ className }: IconProps) {
  return <svg className={className} {...base}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" /></svg>;
}
export function IconPrinter({ className }: IconProps) {
  return <svg className={className} {...base}><path d="M7 8V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v4" /><rect x="4" y="8" width="16" height="8" rx="1.5" /><path d="M7 15v5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-5" /><path d="M7.5 11.2h1" /></svg>;
}
export function IconCoins({ className }: IconProps) {
  return <svg className={className} {...base}><ellipse cx="9" cy="7" rx="5.5" ry="3" /><path d="M3.5 7v5c0 1.66 2.46 3 5.5 3s5.5-1.34 5.5-3V7" /><path d="M3.5 12v3c0 1.66 2.46 3 5.5 3 .87 0 1.7-.11 2.42-.31" /><path d="M14.5 10.3c2.9.2 6-.9 6-2.8 0-1.66-2.24-3-5-3" /><path d="M20.5 7.5v9c0 1.66-2.46 3-5.5 3-1.6 0-3.03-.38-4.03-1" /></svg>;
}
export function IconWallet({ className }: IconProps) {
  return <svg className={className} {...base}><path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h11a2 2 0 0 1 2 2V8h-13a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-2" /><circle cx="16.2" cy="13.8" r="1.1" fill="currentColor" stroke="none" /></svg>;
}
export function IconSettings({ className }: IconProps) {
  return <svg className={className} {...base}><circle cx="12" cy="12" r="3" /><path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.9l.06.06a2 2 0 1 1-2.85 2.85l-.06-.06a1.7 1.7 0 0 0-1.9-.34 1.7 1.7 0 0 0-1 1.55V20a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.9.34l-.06.06a2 2 0 1 1-2.85-2.85l.06-.06a1.7 1.7 0 0 0 .34-1.9 1.7 1.7 0 0 0-1.55-1H4a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.9l-.06-.06a2 2 0 1 1 2.85-2.85l.06.06a1.7 1.7 0 0 0 1.9.34H10a1.7 1.7 0 0 0 1-1.55V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.9-.34l.06-.06a2 2 0 1 1 2.85 2.85l-.06.06a1.7 1.7 0 0 0-.34 1.9V10a1.7 1.7 0 0 0 1.55 1H20a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>;
}
export function IconLogout({ className }: IconProps) {
  return <svg className={className} {...base}><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /></svg>;
}
export function IconPlus({ className }: IconProps) {
  return <svg className={className} {...base}><path d="M5 12h14" /><path d="M12 5v14" /></svg>;
}
export function IconCirclePlus({ className }: IconProps) {
  return <svg className={className} {...base}><circle cx="12" cy="12" r="10" /><path d="M8 12h8" /><path d="M12 8v8" /></svg>;
}
export function IconBookmark({ className }: IconProps) {
  return <svg className={className} {...base}><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" /></svg>;
}
export function IconTrash({ className }: IconProps) {
  return <svg className={className} {...base}><path d="M10 11v6" /><path d="M14 11v6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>;
}
export function IconClock({ className }: IconProps) {
  return <svg className={className} {...base}><path d="M12 6v6l4 2" /><circle cx="12" cy="12" r="10" /></svg>;
}
export function IconSave({ className }: IconProps) {
  return <svg className={className} {...base}><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" /><path d="M7 3v4a1 1 0 0 0 1 1h7" /></svg>;
}
export function IconDownload({ className }: IconProps) {
  return <svg className={className} {...base}><path d="M12 15V3" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /></svg>;
}
export function IconCopy({ className }: IconProps) {
  return <svg className={className} {...base}><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>;
}
export function IconSparkles({ className }: IconProps) {
  return <svg className={className} {...base}><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" /><path d="M20 2v4" /><path d="M22 4h-4" /><circle cx="4" cy="20" r="2" /></svg>;
}
export function IconShieldAlert({ className }: IconProps) {
  return <svg className={className} {...base}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>;
}
export function IconShoppingBag({ className }: IconProps) {
  return <svg className={className} {...base}><path d="M16 10a4 4 0 0 1-8 0" /><path d="M3.103 6.034h17.794" /><path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z" /></svg>;
}
export function IconChevronUp({ className }: IconProps) {
  return <svg className={className} {...base}><path d="m18 15-6-6-6 6" /></svg>;
}
export function IconChevronDown({ className }: IconProps) {
  return <svg className={className} {...base}><path d="m6 9 6 6 6-6" /></svg>;
}
export function IconMenu({ className }: IconProps) {
  return <svg className={className} {...base}><path d="M4 12h16" /><path d="M4 6h16" /><path d="M4 18h16" /></svg>;
}
export function IconX({ className }: IconProps) {
  return <svg className={className} {...base}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>;
}
