import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Pencil, Check, X } from "lucide-react";

interface NameConfigFieldProps {
    /** The current display name of the student */
    studentName: string;
    /** Whether the component is currently in edit mode */
    isEditing: boolean;
    /** The temporary name value being typed in input mode */
    tempName: string;
    /** Whether the name is currently being saved to the backend */
    isSaving: boolean;
    /** Whether the data is fully loaded (used to disable edit start) */
    isLoaded: boolean;
    /** Callback to update the temporary name value */
    onTempNameChange: (value: string) => void;
    /** Callback to save the name change */
    onSave: () => void;
    /** Callback to cancel editing */
    onCancel: () => void;
    /** Callback to enter edit mode */
    onEditStart: () => void;
}

/**
 * A presentational component responsible for displaying the student's name
 * or an input field to edit it.
 */
export function NameConfigField({
    studentName,
    isEditing,
    tempName,
    isSaving,
    isLoaded,
    onTempNameChange,
    onSave,
    onCancel,
    onEditStart,
}: NameConfigFieldProps) {
    return (
        <div className="space-y-2">
            <Label htmlFor="name">Your Name *</Label>

            {isEditing ? (
                <div className="flex items-center gap-2">
                    <Input
                        value={tempName}
                        onChange={(e) => onTempNameChange(e.target.value)}
                        placeholder="Enter your name"
                        disabled={isSaving}
                        className="flex-1"
                        autoFocus
                    />
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={onSave}
                        disabled={isSaving}
                    >
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-green-500" />}
                    </Button>
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={onCancel}
                        disabled={isSaving}
                    >
                        <X className="h-4 w-4 text-red-500" />
                    </Button>
                </div>
            ) : (
                <div
                    className={`flex items-center justify-between p-2 rounded-md border border-input bg-transparent transition-colors group ${isLoaded ? "cursor-pointer hover:bg-accent hover:text-accent-foreground" : "opacity-50"
                        }`}
                    onClick={() => isLoaded && onEditStart()}
                >
                    <span className="text-sm font-medium select-none">{studentName || "Loading..."}</span>
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={!isLoaded}
                        className="h-8 w-8 opacity-50 group-hover:opacity-100 transition-opacity"
                    >
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                </div>
            )}
        </div>
    );
}
