"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { MessageSquarePlus, Search } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuLabel,
  SidebarMotionItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"

export function SidebarHeaderArea({ onSearch }: { onSearch: () => void }) {
  const { state, isMobile, setOpenMobile, motionEnabled } = useSidebar()
  const reducedMotion = useReducedMotion()
  const isExpanded = isMobile || state === "expanded"
  const shouldAnimate = !reducedMotion && motionEnabled

  const closeMobileSidebar = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <>
      <div className="relative flex h-10 items-center">
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              className="absolute left-0"
              initial={{ opacity: 0, filter: shouldAnimate ? "blur(4px)" : "none" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: shouldAnimate ? "blur(4px)" : "none" }}
              transition={{ duration: shouldAnimate ? 0.18 : 0, ease: "easeOut" }}
            >
              <Link href="/" className="flex items-center gap-3 whitespace-nowrap" onClick={closeMobileSidebar}>
                <Image src="/images/veeno.png" alt="" width={36} height={36} className="shrink-0 object-contain" />
                <span className="text-xl font-semibold">Veenoe</span>
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
        <SidebarMotionItem className={isExpanded ? "ml-auto" : undefined}>
          <SidebarTrigger className="size-10" aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"} />
        </SidebarMotionItem>
      </div>
      <SidebarMenu className="mt-3">
        <SidebarMenuItem>
          <SidebarMenuButton asChild tooltip="New Session">
            <Link href="/viva" onClick={closeMobileSidebar}>
              <SidebarMotionItem className="size-5 [&>svg]:size-full" aria-hidden="true">
                <MessageSquarePlus />
              </SidebarMotionItem>
              <SidebarMenuLabel>New Session</SidebarMenuLabel>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton tooltip="Search Sessions" onClick={onSearch}>
            <SidebarMotionItem className="size-5 [&>svg]:size-full" aria-hidden="true">
              <Search />
            </SidebarMotionItem>
            <SidebarMenuLabel>Search Sessions</SidebarMenuLabel>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </>
  )
}
