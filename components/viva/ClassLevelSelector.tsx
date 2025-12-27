import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface ClassLevelSelectorProps {
    /** The currently selected class level (e.g., "1", "12", "Other") */
    classLevel: string;
    /** Whether "Other" is selected */
    isOtherClass: boolean;
    /** The custom value typed when "Other" is selected */
    otherClassValue: string;
    /** Callback when the dropdown selection changes */
    onClassChange: (value: string) => void;
    /** Callback when the custom "Other" input changes */
    onOtherValueChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * A presentational component for selecting a class level.
 * Supports a dropdown for standard levels (1-12) and a free-text input for "Other".
 */
export function ClassLevelSelector({
    classLevel,
    isOtherClass,
    otherClassValue,
    onClassChange,
    onOtherValueChange
}: ClassLevelSelectorProps) {
    return (
        <div className="space-y-2">
            <Label htmlFor="class">Class Level *</Label>
            <Select value={classLevel} onValueChange={onClassChange}>
                <SelectTrigger>
                    <SelectValue placeholder="Select Class" />
                </SelectTrigger>
                <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((num) => (
                        <SelectItem key={num} value={num.toString()}>
                            Class {num}
                        </SelectItem>
                    ))}
                    <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
            </Select>

            {isOtherClass && (
                <Input
                    placeholder="Enter Class / Year"
                    value={otherClassValue}
                    onChange={onOtherValueChange}
                    className="mt-2"
                    required
                />
            )}
        </div>
    );
}
