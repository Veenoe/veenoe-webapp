"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { VoiceSelector } from "@/components/viva/VoiceSelector";
import { Loader2, AlertCircle } from "lucide-react";

import {
  useVivaSessionConfig,
  VivaConfigData,
} from "@/lib/hooks/viva/useVivaSessionConfig";
import { NameConfigField } from "./NameConfigField";
import { ClassLevelSelector } from "./ClassLevelSelector";
import { CurriculumFields } from "./CurriculumFields";
import { canStartViva } from "@/lib/curriculum/selection";

interface VivaConfigFormProps {
  onSubmit: (data: VivaConfigData) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
}

/**
 * Compose the original Quick Setup card with curriculum choices.
 * The hook owns profile and selection state; this form owns presentation and
 * disables submission until a named student and valid single chapter are ready.
 * The caller handles session creation and supplies its loading/error state.
 */
export function VivaConfigForm({
  onSubmit,
  isSubmitting,
  error,
}: VivaConfigFormProps) {
  // 1. Initialize Headless Logic
  const { state, choices, actions } = useVivaSessionConfig(onSubmit);
  const canStart =
    state.isLoaded &&
    canStartViva(state.selection, state.studentName, isSubmitting);

  // 2. Handle Hydration / Loading State
  if (!state.isLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl border-border shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl">Quick Setup</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // 3. Render Form
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl border-border shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Quick Setup</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => {
              if (!canStart) {
                event.preventDefault();
                return;
              }
              void actions.handleSubmit(event);
            }}
            className="space-y-4"
          >
            {/* Modular Component: Name Input */}
            <NameConfigField
              studentName={state.studentName}
              isEditing={state.isEditingName}
              tempName={state.tempName}
              isSaving={state.isSavingName || isSubmitting}
              isLoaded={state.isLoaded && !isSubmitting}
              onTempNameChange={actions.setTempName}
              onSave={actions.handleSaveName}
              onCancel={actions.cancelEditingName}
              onEditStart={actions.startEditingName}
            />

            {/* Modular Component: Class Selector */}
            <ClassLevelSelector
              classLevel={String(state.selection.classLevel)}
              isOtherClass={false}
              otherClassValue=""
              onClassChange={actions.handleClassChange}
              onOtherValueChange={() => {}}
              classLevels={choices.classLevels}
              disabled={isSubmitting}
            />

            <CurriculumFields
              selection={state.selection}
              choices={choices}
              onSelect={actions.selectCurriculum}
              disabled={isSubmitting}
            />

            {/* Standard Component: Voice Selector */}
            <VoiceSelector
              value={state.voiceName}
              onValueChange={actions.setVoiceName}
              disabled={isSubmitting}
            />

            {state.nameError && (
              <Alert variant="destructive">
                <AlertDescription>{state.nameError}</AlertDescription>
              </Alert>
            )}

            {/* Error Handling */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Submit Action */}
            <Button
              type="submit"
              className="w-full bg-pumpkin hover:bg-pumpkin-600"
              disabled={!canStart}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                "Start Viva"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
