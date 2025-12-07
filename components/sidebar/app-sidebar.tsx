"use client"

import * as React from "react"
import { NavUser } from "@/components/sidebar/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { useUser } from "@clerk/nextjs"
import { SidebarHeaderArea } from "@/components/sidebar/sidebar-header-area"
import { HistoryList } from "@/components/sidebar/history-list"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useUser()
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"

  const userData = React.useMemo(() => ({
    name: user?.fullName || "User",
    email: user?.primaryEmailAddress?.emailAddress || "",
    avatar: user?.imageUrl || "",
  }), [user])

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarHeaderArea />
      </SidebarHeader>
      <SidebarContent>
        <HistoryList />
      </SidebarContent>
      <SidebarFooter>
        {user && <NavUser user={userData} />}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
