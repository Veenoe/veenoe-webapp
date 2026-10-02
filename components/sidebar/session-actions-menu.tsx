"use client"

import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { AnimatePresence, motion, useIsPresent, useReducedMotion, type Variants } from "motion/react"
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { SidebarMenuAction, useSidebar } from "@/components/ui/sidebar"

const MENU_SPRING = { type: "spring", bounce: 0, duration: 0.4 } as const

const deleteRowVariants: Variants = {
  initial: (confirming: boolean) => ({ y: confirming ? 56 : -56 }),
  animate: { y: 0 },
  exit: (confirming: boolean) => ({ y: confirming ? -56 : 56 }),
}

function DeleteRow({ confirming, reducedMotion, children }: {
  confirming: boolean
  reducedMotion: boolean
  children: React.ReactNode
}) {
  const isPresent = useIsPresent()

  // Exit animations keep the old row mounted; exclude it from keyboard focus immediately.

  return (
    <motion.div
      ref={(node) => { node?.toggleAttribute("inert", !isPresent) }}
      aria-hidden={!isPresent || undefined}
      custom={confirming}
      variants={reducedMotion ? undefined : deleteRowVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={reducedMotion ? { duration: 0 } : MENU_SPRING}
      className="absolute inset-0 flex items-center gap-2 px-2"
    >
      {children}
    </motion.div>
  )
}

export function SessionActionsMenu({ title, onRename, onDelete }: {
  title: string
  onRename: () => void
  onDelete: () => void
}) {
  const { isMobile } = useSidebar()
  const [open, setOpen] = React.useState(false)
  const [confirming, setConfirming] = React.useState(false)
  const [keyboardInteraction, setKeyboardInteraction] = React.useState(false)
  const prefersReducedMotion = useReducedMotion()
  const reducedMotion = Boolean(prefersReducedMotion) || keyboardInteraction
  const deleteRef = React.useRef<HTMLDivElement>(null)
  const cancelRef = React.useRef<HTMLButtonElement>(null)
  const renamingRef = React.useRef(false)
  const returnToDeleteRef = React.useRef(false)

  React.useEffect(() => {
    if (!open) return
    // Focus Cancel first so opening the confirmation cannot accidentally confirm deletion.
    if (confirming) cancelRef.current?.focus({ preventScroll: true })
    else if (returnToDeleteRef.current) {
      deleteRef.current?.focus({ preventScroll: true })
      returnToDeleteRef.current = false
    }
  }, [confirming, open])

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) {
      setConfirming(false)
      returnToDeleteRef.current = false
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <SidebarMenuAction asChild showOnHover className="size-7 rounded-lg transition-colors duration-150">
          <motion.button
            type="button"
            aria-label={`More options for ${title}`}
            onPointerDown={() => setKeyboardInteraction(false)}
            onKeyDown={() => setKeyboardInteraction(true)}
            whileTap={reducedMotion ? undefined : { scale: 0.95 }}
            transition={{ duration: 0.12 }}
          >
            <MoreHorizontal />
          </motion.button>
        </SidebarMenuAction>
      </DropdownMenuTrigger>
      {/* Motion owns unmounting so Radix does not cut off the closing animation. */}
      <DropdownMenuPortal forceMount>
        <div className="contents">
          <AnimatePresence>
            {open && (
              // On narrow screens, opening below the trigger avoids flipping across the session list.
              <DropdownMenuPrimitive.Content
                forceMount
                asChild
                side={isMobile ? "bottom" : "right"}
                align={isMobile ? "end" : "start"}
                sideOffset={8}
                collisionPadding={12}
                onKeyDownCapture={() => setKeyboardInteraction(true)}
                onCloseAutoFocus={(event) => {
                  if (renamingRef.current) {
                    // The title input takes focus when Rename starts; do not return it to the dots.
                    event.preventDefault()
                    renamingRef.current = false
                  }
                }}
              >
                <motion.div
                  initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.94, pointerEvents: "none" }}
                  transition={reducedMotion ? { duration: 0 } : MENU_SPRING}
                  className="z-50 w-64 max-w-[calc(100vw-1.5rem)] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-xl"
                >
                  <DropdownMenuGroup className="p-2">
                    <DropdownMenuItem
                      className="gap-3 rounded-xl px-3 py-2 text-base"
                      onSelect={() => {
                        renamingRef.current = true
                        onRename()
                      }}
                    >
                      <Pencil />
                      Rename
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator className="m-0" />
                  <DropdownMenuGroup className="relative h-14 overflow-hidden">
                    <AnimatePresence initial={false} custom={confirming}>
                      <DeleteRow key={confirming ? "confirm" : "delete"} confirming={confirming} reducedMotion={reducedMotion}>
                        {confirming ? (
                          <>
                            <DropdownMenuPrimitive.Item asChild onSelect={() => {
                              setOpen(false)
                              onDelete()
                            }}>
                              <button type="button" className={cn(buttonVariants({ variant: "destructive" }), "h-10 flex-1 rounded-xl")}>Yes, Delete</button>
                            </DropdownMenuPrimitive.Item>
                            <DropdownMenuPrimitive.Item asChild onSelect={(event) => {
                              event.preventDefault()
                              returnToDeleteRef.current = true
                              setConfirming(false)
                            }}>
                              <button type="button" ref={cancelRef} className={cn(buttonVariants({ variant: "outline" }), "h-10 flex-1 rounded-xl")}>Cancel</button>
                            </DropdownMenuPrimitive.Item>
                          </>
                        ) : (
                          <DropdownMenuPrimitive.Item
                            ref={deleteRef}
                            className="flex w-full select-none items-center gap-3 rounded-xl px-3 py-2 text-base text-destructive outline-none focus:bg-destructive/10 [&>svg]:size-4 [&>svg]:shrink-0"
                            onSelect={(event) => {
                              event.preventDefault()
                              setConfirming(true)
                            }}
                          >
                            <Trash2 />
                            Delete
                          </DropdownMenuPrimitive.Item>
                        )}
                      </DeleteRow>
                    </AnimatePresence>
                  </DropdownMenuGroup>
                </motion.div>
              </DropdownMenuPrimitive.Content>
            )}
          </AnimatePresence>
        </div>
      </DropdownMenuPortal>
    </DropdownMenu>
  )
}
