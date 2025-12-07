"use client"

import * as React from "react"
import { MessageSquarePlus, Search } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useSidebar } from "@/components/ui/sidebar"
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger } from "@/components/ui/sidebar"
import { SearchDialog } from "./search-dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export function SidebarHeaderArea() {
    const { state } = useSidebar()
    const [searchOpen, setSearchOpen] = React.useState(false)

    const isCollapsed = state === "collapsed"

    return (
        <>
            <SidebarMenu>
                <SidebarMenuItem>
                    <div className="flex w-full items-center justify-between group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0">
                        {/* Logo & Text - Visible when expanded */}
                        <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
                            <Link href="/" className="flex items-center gap-2">
                                <div className="flex bg-transparent">
                                    <Image src="/images/veeno.png" alt="Veenoe" width={32} height={32} className="object-contain" />
                                </div>
                                <div className="flex flex-col gap-0.5 leading-none">
                                    <span className="font-semibold text-lg">Veenoe</span>
                                </div>
                            </Link>
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
                <SidebarMenuItem>
                    <div className="flex flex-col gap-1 mt-2">
                        <SidebarMenuButton asChild tooltip="New Chat">
                            <Link href="/viva">
                                <MessageSquarePlus />
                                <span>New Session</span>
                            </Link>
                        </SidebarMenuButton>
                        <SidebarMenuButton
                            tooltip="Search"
                            onClick={() => setSearchOpen(true)}
                        >
                            <Search />
                            <span>Search Sessions</span>
                        </SidebarMenuButton>
                    </div>
                </SidebarMenuItem>
            </SidebarMenu>
            <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
        </>
    )
}
