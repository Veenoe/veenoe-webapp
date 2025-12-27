"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { VoiceSelector } from "@/components/viva/VoiceSelector";
import { Loader2, AlertCircle } from "lucide-react";

import { useVivaSessionConfig, VivaConfigData } from "@/lib/hooks/viva/useVivaSessionConfig";
import { NameConfigField } from "./NameConfigField";
import { ClassLevelSelector } from "./ClassLevelSelector";

interface VivaConfigFormProps {
    onSubmit: (data: VivaConfigData) => Promise<void>;
    isSubmitting: boolean;
    error: string | null;
}

/**
 * The Main Controller Component for the Viva Configuration Form.
 * 
 * Architecture:
 * - Logic: Delegated to `useVivaSessionConfig` hook (Headless).
 * - UI: Delegates complex sections to `NameConfigField` and `ClassLevelSelector`.
 * - Layout: Orchestrates the overall grid and submit button.
 */
export function VivaConfigForm({ onSubmit, isSubmitting, error }: VivaConfigFormProps) {
    // 1. Initialize Headless Logic
    const { state, actions } = useVivaSessionConfig(onSubmit);

    // 2. Handle Hydration / Loading State
    if (!state.isMounted) {
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
                    <form onSubmit={actions.handleSubmit} className="space-y-4">

                        {/* Modular Component: Name Input */}
                        <NameConfigField
                            studentName={state.studentName}
                            isEditing={state.isEditingName}
                            tempName={state.tempName}
                            isSaving={state.isSavingName}
                            isLoaded={state.isLoaded}
                            onTempNameChange={actions.setTempName}
                            onSave={actions.handleSaveName}
                            onCancel={actions.cancelEditingName}
                            onEditStart={actions.startEditingName}
                        />

                        {/* Standard Field: Topic */}
                        <div className="space-y-2">
                            <Label htmlFor="topic">Topic *</Label>
                            <Input
                                id="topic"
                                value={state.topic}
                                onChange={(e) => actions.setTopic(e.target.value)}
                                placeholder="e.g., Python, History, Biology"
                                required
                            />
                        </div>

                        {/* Modular Component: Class Selector */}
                        <ClassLevelSelector
                            classLevel={state.classLevel}
                            isOtherClass={state.isOtherClass}
                            otherClassValue={state.otherClassValue}
                            onClassChange={actions.handleClassChange}
                            onOtherValueChange={actions.handleOtherClassChange}
                        />

                        {/* Standard Component: Voice Selector */}
                        <VoiceSelector
                            value={state.voiceName}
                            onValueChange={actions.setVoiceName}
                        />

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
                            disabled={isSubmitting || !state.studentName}
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Starting...
                                </>
                            ) : (
                                "Next"
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
