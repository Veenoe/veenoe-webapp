"use client";

import { useState, useRef, type Dispatch } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ENTIRE_CHAPTER,
  validCustomTopic,
  selectionReducer,
  type CurriculumSelectionState,
  type CurriculumSelectionView,
  type SelectionAction,
} from "@/lib/curriculum/selection";
import { isSubjectAvailable } from "@/lib/curriculum/selectors";

interface Props {
  selection: CurriculumSelectionState;
  choices: CurriculumSelectionView;
  onSelect: Dispatch<SelectionAction>;
  disabled: boolean;
}

/**
 * Render subject, single-chapter and multi-topic choices inside the setup form.
 * Parent selections commit immediately; TopicsField stages its choices until Confirm.
 * Subjects missing chapter data remain visible with a disabled option.
 */
export function CurriculumFields({
  selection,
  choices,
  onSelect,
  disabled,
}: Props) {
  const selected = selection.chapters[0];
  const chapter = choices.selectedChapters[0];
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="subject">Subject *</Label>
        <Select
          value={selection.subjectId}
          onValueChange={(value) => onSelect({ type: "subject", value })}
          disabled={disabled}
        >
          <SelectTrigger id="subject" className="w-full">
            <SelectValue placeholder="Select subject" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {choices.subjects.map((subject) => (
                <SelectItem
                  key={subject.id}
                  value={subject.id}
                  disabled={!isSubjectAvailable(subject)}
                >
                  {subject.name}
                  {!isSubjectAvailable(subject)
                    ? " (chapters unavailable)"
                    : ""}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="chapter">Chapter *</Label>
        <Select
          value={selected?.chapterId ?? ""}
          onValueChange={(value) => onSelect({ type: "chapter", value })}
          disabled={disabled || !choices.chapters.length}
        >
          <SelectTrigger id="chapter" className="w-full">
            <SelectValue placeholder="Select chapter" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {choices.chapters.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      {/* Changing the class, subject or chapter discards its unconfirmed topic draft. */}
      <TopicsField
        key={`${selection.classLevel}/${selection.subjectId}/${chapter?.id ?? ""}`}
        selection={selection}
        chapter={chapter}
        onSelect={onSelect}
        disabled={disabled}
      />
    </>
  );
}

/**
 * Edit topic choices without changing the session's confirmed selection.
 * Opening snapshots the committed state; dismissal discards edits on the next open.
 * Add queues a custom topic and keeps editing active. Only Confirm commits the draft.
 * Empty preset and custom lists represent entire-chapter coverage.
 */
function TopicsField({
  selection,
  chapter,
  onSelect,
  disabled,
}: Pick<Props, "selection" | "onSelect" | "disabled"> & {
  chapter: CurriculumSelectionView["selectedChapters"][number] | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(selection);
  const [customDraft, setCustomDraft] = useState("");
  const customInputRef = useRef<HTMLInputElement>(null);
  const selected = selection.chapters[0];
  const pending = draft.chapters[0];
  const names = [
    ...(chapter?.topics
      .filter((topic) => selected?.topicIds.includes(topic.id))
      .map((topic) => topic.name) ?? []),
    ...(selected?.customTopics ?? []),
  ];
  const entire = !pending?.topicIds.length && !pending?.customTopics.length;
  const invalidCustom =
    !!customDraft.trim() &&
    (!validCustomTopic(customDraft) ||
      (pending?.customTopics.length ?? 0) >= 20);
  /** Queue valid custom text through the shared reducer, then return focus for another topic. */
  const addCustomTopic = () => {
    if (!chapter || disabled || invalidCustom || !customDraft.trim()) return;
    setDraft(
      selectionReducer(draft, {
        type: "custom-topic",
        chapterId: chapter.id,
        value: customDraft,
      }),
    );
    setCustomDraft("");
    customInputRef.current?.focus();
  };
  /** Commit all choices together, including valid text still in the custom-topic input. */
  const confirm = () => {
    if (!chapter || invalidCustom || disabled) return;
    const confirmed = customDraft.trim()
      ? selectionReducer(draft, {
          type: "custom-topic",
          chapterId: chapter.id,
          value: customDraft,
        })
      : draft;
    onSelect({ type: "topics", value: confirmed.chapters[0] });
    setOpen(false);
    setCustomDraft("");
  };
  return (
    <div className="space-y-2">
      <Label htmlFor="topics">Topics</Label>
      <DropdownMenu
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (value) {
            setDraft(selection);
            setCustomDraft("");
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            id="topics"
            type="button"
            variant="outline"
            className="w-full justify-between font-normal"
            disabled={disabled || !chapter}
          >
            <span className="truncate">
              {!chapter
                ? "Select topics"
                : !names.length
                  ? "Entire chapter"
                  : names.length === 1
                    ? names[0]
                    : `${names.length} topics selected`}
            </span>
            <ChevronDown
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-[var(--radix-dropdown-menu-trigger-width)] p-0"
        >
          <div className="flex gap-2 border-b p-2">
            <Input
              ref={customInputRef}
              className="min-w-0"
              aria-label="Add your own topic"
              placeholder="Add your own topic"
              value={customDraft}
              maxLength={100}
              disabled={disabled}
              onChange={(event) => setCustomDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addCustomTopic();
                }
                // Tab must never target disabled Add; Shift+Tab returns to the trigger.
                if (event.key === "Tab" && event.shiftKey) {
                  event.preventDefault();
                  setOpen(false);
                } else if (event.key === "Tab" || event.key === "ArrowDown") {
                  event.preventDefault();
                  const menu = event.currentTarget.closest('[role="menu"]');
                  const addButton = menu?.querySelector<HTMLButtonElement>(
                    '[aria-label="Add custom topic"]',
                  );
                  const firstOption = menu?.querySelector<HTMLElement>(
                    '[role="menuitemcheckbox"]',
                  );
                  const target =
                    event.key === "Tab" && addButton && !addButton.disabled
                      ? addButton
                      : firstOption;
                  target?.focus();
                }
                // Keep typing out of menu typeahead while preserving Escape to dismiss.
                if (event.key !== "Escape" && event.key !== "Tab")
                  event.stopPropagation();
              }}
            />
            <DropdownMenuItem
              asChild
              disabled={disabled || invalidCustom || !customDraft.trim()}
              onSelect={(event) => event.preventDefault()}
            >
              <Button
                type="button"
                variant="outline"
                aria-label="Add custom topic"
                onClick={addCustomTopic}
                disabled={disabled || invalidCustom || !customDraft.trim()}
              >
                Add
              </Button>
            </DropdownMenuItem>
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            <DropdownMenuCheckboxItem
              checked={entire}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={() => {
                if (!chapter) return;
                setDraft(
                  selectionReducer(draft, {
                    type: "topic",
                    chapterId: chapter.id,
                    value: ENTIRE_CHAPTER,
                  }),
                );
                setCustomDraft("");
              }}
            >
              Entire chapter
            </DropdownMenuCheckboxItem>
            {chapter?.topics.map((topic) => (
              <DropdownMenuCheckboxItem
                key={topic.id}
                checked={pending?.topicIds.includes(topic.id)}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={() =>
                  setDraft(
                    selectionReducer(draft, {
                      type: "topic",
                      chapterId: chapter.id,
                      value: topic.id,
                    }),
                  )
                }
              >
                {topic.name}
              </DropdownMenuCheckboxItem>
            ))}
            {pending?.customTopics.map((name) => (
              <DropdownMenuCheckboxItem
                key={name}
                checked
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={() =>
                  chapter &&
                  setDraft(
                    selectionReducer(draft, {
                      type: "remove-custom-topic",
                      chapterId: chapter.id,
                      value: name,
                    }),
                  )
                }
              >
                {name}
              </DropdownMenuCheckboxItem>
            ))}
          </div>
          <div className="border-t p-2">
            <DropdownMenuItem asChild disabled={disabled || invalidCustom}>
              <Button
                type="button"
                className="w-full justify-center"
                onClick={confirm}
                disabled={disabled || invalidCustom}
              >
                Confirm
              </Button>
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      {names.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Selected topics">
          {names.map((name) => (
            <span key={name} className="rounded-md border px-2 py-1 text-sm">
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
