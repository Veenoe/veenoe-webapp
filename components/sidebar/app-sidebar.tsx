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
import { SearchDialog } from "@/components/sidebar/search-dialog"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useUser()
  const { isMobile, openMobile, setOpenMobile } = useSidebar()
  const [searchOpen, setSearchOpen] = React.useState(false)
  const searchRequestedRef = React.useRef(false)

  const openSearch = () => {
    if (isMobile && openMobile) {
      searchRequestedRef.current = true
      setOpenMobile(false)
    } else {
      setSearchOpen(true)
    }
  }

  const handleMobileCloseAutoFocus = (event: Event) => {
    props.onMobileCloseAutoFocus?.(event)
    if (!searchRequestedRef.current) return
    // Wait for the drawer's focus scope to unmount before opening another modal.
    searchRequestedRef.current = false
    event.preventDefault()
    setSearchOpen(true)
  }

  const userData = React.useMemo(() => ({
    name: user?.fullName || "User",
    email: user?.primaryEmailAddress?.emailAddress || "",
    avatar: user?.imageUrl || "",
  }), [user])

  return (
    <>
      <Sidebar collapsible="icon" {...props} onMobileCloseAutoFocus={handleMobileCloseAutoFocus}>
        <SidebarHeader>
          <SidebarHeaderArea onSearch={openSearch} />
        </SidebarHeader>
        <SidebarContent>
          <HistoryList />
        </SidebarContent>
        <SidebarFooter>
          {user && <NavUser user={userData} />}
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  )
}
