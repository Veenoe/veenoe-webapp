"use client"

import * as React from "react"
import { MessageSquare, MoreHorizontal, Pencil, Trash2, History, Mic, BookOpen } from "lucide-react"
import { useHistory, useRenameSession, useDeleteSession } from "@/lib/hooks/use-history"
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuAction,
    useSidebar,
} from "@/components/ui/sidebar"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export function HistoryList() {
    const { data: historyData } = useHistory()
    const { mutate: renameSession } = useRenameSession()
    const { mutate: deleteSession } = useDeleteSession()
    const { state } = useSidebar()

    const [editingId, setEditingId] = React.useState<string | null>(null)
    const [editValue, setEditValue] = React.useState("")

    const isCollapsed = state === "collapsed"

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
                        <SidebarMenuButton tooltip="Your Sessions">
                            <History className="text-muted-foreground" />
                            <span>Your Sessions</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
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
                        <SidebarMenuButton asChild isActive={false} className="group-data-[collapsible=icon]:!p-2">
                            <a href={`/viva/${session.viva_session_id}`} onClick={(e) => {
                                if (editingId === session.viva_session_id) e.preventDefault()
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
                                    <span>{session.title || session.topic || "Untitled Session"}</span>
                                )}
                            </a>
                        </SidebarMenuButton>
                        {!editingId && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <SidebarMenuAction showOnHover>
                                        <MoreHorizontal />
                                        <span className="sr-only">More</span>
                                    </SidebarMenuAction>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="w-48" side="right" align="start">
                                    <DropdownMenuItem onClick={() => handleRenameStart(session.viva_session_id, session.title)}>
                                        <Pencil className="text-muted-foreground mr-2 h-4 w-4" />
                                        <span>Rename</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => deleteSession(session.viva_session_id)}>
                                        <Trash2 className="text-muted-foreground mr-2 h-4 w-4" />
                                        <span>Delete</span>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </SidebarMenuItem>
                ))}
            </SidebarMenu>
        </SidebarGroup>
    )
}
