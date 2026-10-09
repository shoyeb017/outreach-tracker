import Image from "next/image";
import darkLettering from "@/styles/autmail_white_logo.png";
import whiteLettering from "@/styles/autmail_black_logo.png";
import icon from "@/styles/autmail_icon.png";
import { cn, productName } from "@/lib/utils";

// These source filenames describe the intended surface, not the lettering color.
export function BrandLogo({ className }: { className?: string }) {
  return <span role="img" aria-label={productName} className={cn("brand-lockup", className)}>
    <span aria-hidden="true" className="brand-logo">
    <Image src={darkLettering} alt="" width={240} height={80} sizes="240px" loading="eager" className="brand-logo-light" />
    <Image src={whiteLettering} alt="" width={240} height={80} sizes="240px" loading="eager" className="brand-logo-dark" />
    </span>
  </span>;
}
export function BrandIcon({ className }: { className?: string }) {
  return <Image src={icon} alt="" width={40} height={40} className={cn("brand-icon", className)} />;
}
