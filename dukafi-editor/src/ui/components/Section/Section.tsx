/**
 * Section — shared collapsible inspector section primitive.
 *
 * The pill-style header + toggle + content layout used by every right-sidebar
 * inspector in the admin (Properties panel, FrameworkScale panel, Data panel).
 *
 * The optional `indicator` prop renders a small green dot next to the title
 * to signal that the section has active state (stored class styles, active
 * breakpoint overrides, etc.).
 */

import { useState } from "react";
import type { IconComponent } from "pixel-art-icons/types";
import { cn } from "@ui/cn";
import styles from "./Section.module.css";

interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  /** Controlled open state. When set, the section ignores internal toggle state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Render a small green dot next to the title to signal active state. */
  indicator?: boolean;
  indicatorTestId?: string;
  icon?: IconComponent;
  meta?: React.ReactNode;
  headerAction?: React.ReactNode;
  forceOpen?: boolean;
  /**
   * Drop the section's own vertical padding so spacing comes entirely from the
   * parent container's grid gap (the borderless-tile / 1px-gap card pattern).
   * Used by the Properties panel; panels that rely on the section's own padding
   * for inter-section spacing (Data inspector) leave this off.
   */
  flush?: boolean;
}

export function Section({
  title,
  children,
  defaultOpen = false,
  open,
  onOpenChange,
  indicator = false,
  indicatorTestId,
  icon: SectionIcon,
  meta,
  headerAction,
  forceOpen = false,
  flush = false,
}: SectionProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const expanded = forceOpen || (isControlled ? open : uncontrolledOpen);

  return (
    <div className={cn(styles.section, flush && styles.sectionFlush, expanded && styles.sectionOpen)}>
      <div className={cn(
        styles.sectionHeader,
        Boolean(headerAction) && styles.sectionHeaderWithAction,
      )}>
        <button
          onClick={() => {
            if (forceOpen) return;
            const next = !expanded;
            if (!isControlled) setUncontrolledOpen(next);
            onOpenChange?.(next);
          }}
          className={styles.sectionToggle}
          aria-expanded={expanded}
        >
          {SectionIcon && (
            <span className={styles.sectionIcon}>
              <SectionIcon size={13} />
            </span>
          )}
          <span className={styles.sectionTitleGroup}>
            <span className={styles.sectionTitle}>{title}</span>
            {indicator && (
              <span
                className={styles.sectionIndicatorDot}
                data-testid={indicatorTestId}
                aria-hidden="true"
              />
            )}
          </span>
          {meta && <span className={styles.sectionMeta}>{meta}</span>}
        </button>
        {headerAction && (
          <span className={styles.sectionHeaderAction}>{headerAction}</span>
        )}
      </div>
      {expanded && <div className={styles.sectionContent}>{children}</div>}
    </div>
  );
}
