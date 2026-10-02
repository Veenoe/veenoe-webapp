import { useState, useEffect, useReducer } from "react";
import { useUser } from "@clerk/nextjs";
import { curriculum } from "@/lib/curriculum/selectors";
import {
  initialSelection,
  selectionReducer,
  canStartViva,
  getSelectionView,
  getCurriculumSelection,
  type SelectionAction,
} from "@/lib/curriculum/selection";
import type { CurriculumSelection } from "@/lib/curriculum/types";

/** Confirmed setup values passed to the page that starts the authenticated session. */
export interface VivaConfigData {
  studentName: string;
  topic: string;
  classLevel: string;
  voiceName: string;
  curriculumSelection: CurriculumSelection;
}

/**
 * Own setup state, the remembered class preference and Clerk name editing.
 * Curriculum validity comes from the shared reducer; the hook submits only resolved,
 * confirmed choices. Network session creation stays with the caller via onSubmit.
 */
export function useVivaSessionConfig(
  onSubmit: (data: VivaConfigData) => Promise<void>,
) {
  const { user, isLoaded } = useUser();
  const [selection, dispatch] = useReducer(selectionReducer, initialSelection);
  const [voiceName, setVoiceName] = useState("Kore");
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const studentName = user?.fullName || user?.firstName || "Student";

  // Preserve the existing storage key; ignore saved classes absent from the active catalog.
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem("veenoe_last_class"));
      if (curriculum.getClassLevels().includes(saved))
        dispatch({ type: "class", value: saved });
    } catch {
      /* Storage may be unavailable; the default class still works. */
    }
  }, []);

  /** Apply the class immediately; persistence is optional and cannot block setup. */
  const handleClassChange = (value: string) => {
    dispatch({ type: "class", value: Number(value) });
    try {
      localStorage.setItem("veenoe_last_class", value);
    } catch {
      /* Optional preference. */
    }
  };
  const selectCurriculum = (action: SelectionAction) => {
    dispatch(action);
  };
  /** Save to the authenticated profile; keep the edit open and show an error on failure. */
  const handleSaveName = async () => {
    if (!tempName.trim() || !user) return;
    setIsSavingName(true);
    setNameError(null);
    try {
      const [firstName, ...last] = tempName.trim().split(/\s+/);
      await user.update({ firstName, lastName: last.join(" ") || undefined });
      setIsEditingName(false);
    } catch {
      setNameError("Your name could not be saved. Please try again.");
    } finally {
      setIsSavingName(false);
    }
  };
  /** Resolve IDs again at submission so incomplete or stale selections cannot start a session. */
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const resolvedSelection = getCurriculumSelection(selection);
    if (
      !resolvedSelection ||
      !isLoaded ||
      !user ||
      !canStartViva(selection, studentName)
    )
      return;
    await onSubmit({
      studentName,
      topic: resolvedSelection.chapters.map((ch) => ch.name).join(", "),
      classLevel: String(selection.classLevel),
      voiceName,
      curriculumSelection: resolvedSelection,
    });
  };
  return {
    choices: getSelectionView(selection),
    state: {
      selection,
      studentName,
      isLoaded,
      isEditingName,
      tempName,
      isSavingName,
      nameError,
      voiceName,
    },
    actions: {
      dispatch,
      selectCurriculum,
      setVoiceName,
      setTempName,
      handleSaveName,
      handleClassChange,
      handleSubmit,
      startEditingName: () => {
        setTempName(studentName);
        setIsEditingName(true);
      },
      cancelEditingName: () => {
        setIsEditingName(false);
        setNameError(null);
      },
    },
  };
}
