"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { History, Mic, BookOpen } from "lucide-react"
import { useHistory, useRenameSession, useDeleteSession } from "@/lib/hooks/use-history"
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuLabel,
    SidebarMenuSkeleton,
    useSidebar,
} from "@/components/ui/sidebar"
import { SessionActionsMenu } from "@/components/sidebar/session-actions-menu"
import { Input } from "@/components/ui/input"

export function HistoryList() {
    const { data: historyData, isLoading } = useHistory()
    const { mutate: renameSession } = useRenameSession()
    const { mutate: deleteSession } = useDeleteSession()
    const { state, isMobile, setOpen, setOpenMobile } = useSidebar()
    const pathname = usePathname()

    const [editingId, setEditingId] = React.useState<string | null>(null)
    const [editValue, setEditValue] = React.useState("")

    const isCollapsed = !isMobile && state === "collapsed"

    const handleRenameStart = (id: string, currentTitle: string) => {
        setEditingId(id)
        setEditValue(currentTitle)
    }

    const handleRenameSubmit = (id: string) => {
        if (editValue.trim() && editValue !== historyData?.sessions.find(s => s.viva_session_id === id)?.title) {
            renameSession({ sessionId: id, newTitle: editValue })
        }
        setEditingId(null)
    }

    const getSessionIcon = (type: string = "viva") => {
        if (type?.toLowerCase() === "learn") return <BookOpen className="text-blue-500" />
        return <Mic className="text-orange-500" />
    }

    if (isCollapsed) {
        return (
            <SidebarGroup>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton tooltip="Your Sessions" aria-label="Show your sessions" onClick={() => setOpen(true)}>
                            <History className="text-muted-foreground" />
                            <SidebarMenuLabel>Your Sessions</SidebarMenuLabel>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarGroup>
        )
    }

    if (isLoading) {
        return (
            <SidebarGroup>
                <SidebarGroupLabel>Your Sessions</SidebarGroupLabel>
                <SidebarMenu>
                    {Array.from({ length: 5 }).map((_, index) => (
                        <SidebarMenuItem key={index} hoverable={false}>
                            <SidebarMenuSkeleton showIcon />
                        </SidebarMenuItem>
                    ))}
                </SidebarMenu>
            </SidebarGroup>
        )
    }

    return (
        <SidebarGroup>
            <SidebarGroupLabel>Your Sessions</SidebarGroupLabel>
            <SidebarMenu>
                {(historyData?.sessions || []).map((session) => (
                    <SidebarMenuItem key={session.viva_session_id}>
                        <SidebarMenuButton asChild isActive={pathname === `/v/${session.viva_session_id}`} className="group-data-[collapsible=icon]:!p-2">
                            <Link href={`/v/${session.viva_session_id}`} aria-current={pathname === `/v/${session.viva_session_id}` ? "page" : undefined} onClick={(e) => {
                                if (editingId === session.viva_session_id) e.preventDefault()
                                else if (isMobile) setOpenMobile(false)
                            }}>
                                {getSessionIcon(session.session_type)}
                                {editingId === session.viva_session_id ? (
                                    <Input
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        onBlur={() => handleRenameSubmit(session.viva_session_id)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleRenameSubmit(session.viva_session_id)
                                        }}
                                        autoFocus
                                        className="h-6 py-0 px-1 text-sm bg-background border-input"
                                        onClick={(e) => e.preventDefault()}
                                    />
                                ) : (
                                    <SidebarMenuLabel>{session.title || session.topic || "Untitled Session"}</SidebarMenuLabel>
                                )}
                            </Link>
                        </SidebarMenuButton>
                        {!editingId && (
                            <SessionActionsMenu
                                title={session.title || session.topic || "Untitled Session"}
                                onRename={() => handleRenameStart(session.viva_session_id, session.title)}
                                onDelete={() => deleteSession(session.viva_session_id)}
                            />
                        )}
                    </SidebarMenuItem>
                ))}
            </SidebarMenu>
        </SidebarGroup>
    )
}
