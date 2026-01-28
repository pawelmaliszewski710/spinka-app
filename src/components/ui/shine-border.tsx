import * as React from "react"

import { cn } from "@/lib/utils"

interface ShineBorderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'color'> {
  /**
   * Width of the border in pixels
   * @default 1
   */
  borderWidth?: number
  /**
   * Duration of the animation in seconds
   * @default 14
   */
  duration?: number
  /**
   * Color of the border, can be a single color or an array of colors
   * @default "#000000"
   */
  shineColor?: string | string[]
  /**
   * Alias for shineColor - color of the border
   */
  color?: string | string[]
  /**
   * Border radius in pixels
   */
  borderRadius?: number
  /**
   * Children elements
   */
  children?: React.ReactNode
}

/**
 * Shine Border
 *
 * An animated background border effect component with configurable properties.
 */
export function ShineBorder({
  borderWidth = 1,
  duration = 14,
  shineColor = "#000000",
  color,
  borderRadius,
  className,
  style,
  children,
  ...props
}: ShineBorderProps) {
  const effectiveColor = color || shineColor

  return (
    <div
      style={
        {
          position: "relative",
          borderRadius: borderRadius ? `${borderRadius}px` : undefined,
          ...style,
        } as React.CSSProperties
      }
      className={cn("relative", className)}
      {...props}
    >
      <div
        style={
          {
            "--border-width": `${borderWidth}px`,
            "--duration": `${duration}s`,
            backgroundImage: `radial-gradient(transparent,transparent, ${
              Array.isArray(effectiveColor) ? effectiveColor.join(",") : effectiveColor
            },transparent,transparent)`,
            backgroundSize: "300% 300%",
            mask: `linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)`,
            WebkitMask: `linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)`,
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
            padding: "var(--border-width)",
            borderRadius: borderRadius ? `${borderRadius}px` : "inherit",
          } as React.CSSProperties
        }
        className="motion-safe:animate-shine pointer-events-none absolute inset-0 size-full will-change-[background-position]"
      />
      {children}
    </div>
  )
}
