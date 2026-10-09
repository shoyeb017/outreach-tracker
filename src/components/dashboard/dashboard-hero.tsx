import type { ComponentProps } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { BlueTubesBackground } from "@/components/motion/blue-tubes-background";
import styles from "./dashboard-hero.module.css";

type DashboardHeroProps = ComponentProps<typeof PageHeader> & { variant?: "outreach" | "admin" };

export function DashboardHero({ variant = "outreach", ...header }: DashboardHeroProps) {
  return <section className={styles.hero} data-dashboard-hero={variant}>
    <div className={styles.art} data-tubes-background aria-hidden="true">
      <BlueTubesBackground />
      <div className={styles.scrim} />
    </div>
    <div className={styles.content}><PageHeader {...header} /></div>
  </section>;
}
