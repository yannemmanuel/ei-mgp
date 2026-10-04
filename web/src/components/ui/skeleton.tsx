import { cn } from "@/lib/utils"
import * as React from "react"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-xl bg-secondary-100/80", className)}
      {...props}
    />
  )
}

export { Skeleton }
