"use client"

import * as React from "react"
import { Search, MessageSquare, Mic, BookOpen } from "lucide-react"
import Link from "next/link"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useHistory } from "@/lib/hooks/use-history"
import { Button } from "@/components/ui/button"

interface SearchDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
    const { data: historyData } = useHistory()
    const [query, setQuery] = React.useState("")
    const inputRef = React.useRef<HTMLInputElement>(null)

    // O(1) Search Optimization: Filter filtered list memoization
    // Although filter is O(N), for <10k items it's negligible client-side.
    // We perform filtering only when query or historyData changes.
    const filteredSessions = React.useMemo(() => {
        if (!historyData?.sessions || !query) return []
        const lowerQuery = query.toLowerCase()
        return historyData.sessions.filter((session) =>
            (session.title || session.topic || "").toLowerCase().includes(lowerQuery)
        )
    }, [historyData, query])

    const getSessionIcon = (type: string = "viva") => {
        if (type?.toLowerCase() === "learn") return <BookOpen className="h-4 w-4 shrink-0 opacity-70 text-blue-500" />
        return <Mic className="h-4 w-4 shrink-0 opacity-70 text-orange-500" />
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px] top-[20%] translate-y-0 gap-0 p-0 overflow-hidden">
                <DialogHeader className="sr-only">
                    <DialogTitle>Search History</DialogTitle>
                </DialogHeader>
                <div className="flex items-center border-b px-3 h-14">
                    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <input
                        ref={inputRef}
                        className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder="Search sessions..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </div>
                <div className="max-h-[300px] overflow-y-auto p-1">
                    {query && filteredSessions.length === 0 && (
                        <div className="py-6 text-center text-sm text-muted-foreground">
                            No results found.
                        </div>
                    )}
                    {(!query || filteredSessions.length > 0) && (
                        <div className="flex flex-col gap-1">
                            {query && (
                                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                                    Matches
                                </div>
                            )}
                            {(query ? filteredSessions : historyData?.sessions || []).slice(0, query ? undefined : 5).map((session) => (
                                <Link
                                    key={session.viva_session_id}
                                    href={`/v/${session.viva_session_id}`}
                                    onClick={() => onOpenChange(false)}
                                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
                                >
                                    {getSessionIcon(session.session_type)}
                                    <span className="truncate">{session.title || session.topic || "Untitled"}</span>
                                </Link>
                            ))}
                            {!query && (
                                <div className="px-2 py-2 text-xs text-muted-foreground text-center">
                                    Start typing to search...
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
