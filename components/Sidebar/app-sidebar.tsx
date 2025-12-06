"use client"

import * as React from "react"
import {
  MessageSquarePlus,
  Search,
  History,
  MessageSquare,
} from "lucide-react"

import { NavMain } from "@/components/sidebar/nav-main"
import { NavUser } from "@/components/sidebar/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
  SidebarInput,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { useHistory } from "@/lib/hooks/use-history"
import { useUser } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import Image from "next/image"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { data: historyData } = useHistory()
  const { user } = useUser()
  const { toggleSidebar } = useSidebar()

  const historyItems = React.useMemo(() => {
    if (!historyData?.sessions) return []

    // Return flattened list of sessions
    return historyData.sessions.map((session) => ({
      title: session.title || session.topic || "Untitled Session",
      url: `/viva/${session.viva_session_id}`,
      icon: MessageSquare,
      isActive: false, // Logic to determine if active
    }))
  }, [historyData])

  const userData = React.useMemo(() => ({
    name: user?.fullName || "User",
    email: user?.primaryEmailAddress?.emailAddress || "",
    avatar: user?.imageUrl || "",
  }), [user])

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex w-full items-center justify-between group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0">
              {/* Logo & Text - Visible when expanded */}
              <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
                <a href="/" className="flex items-center gap-2">
                  <div className="flex bg-transparent">
                    <Image src="/images/veeno.png" alt="Veenoe" width={32} height={32} className="object-contain" />
                  </div>
                  <div className="flex flex-col gap-0.5 leading-none">
                    <span className="font-semibold text-lg">Veenoe</span>
                  </div>
                </a>
              </div>

              {/* Collapsed View: Logo that shows Trigger on Hover */}
              <div className="hidden group-data-[collapsible=icon]:flex items-center justify-center relative group/logo-trigger h-8 w-8">
                <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-200 group-hover/logo-trigger:opacity-0">
                  <Image src="/images/veeno.png" alt="Veenoe" width={24} height={24} className="object-contain" />
                </div>
                <SidebarTrigger className="absolute opacity-0 group-hover/logo-trigger:opacity-100 bg-transparent hover:bg-transparent" />
              </div>

              {/* Expanded View: Trigger on the right */}
              <SidebarTrigger className="group-data-[collapsible=icon]:hidden" />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="New Chat">
              <a href="/">
                <MessageSquarePlus />
                <span>New Chat</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <div className="px-2 py-2">
          <SidebarInput placeholder="Search history..." />
        </div>
        <NavMain items={historyItems} />
      </SidebarContent>
      <SidebarFooter>
        {user && <NavUser user={userData} />}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
