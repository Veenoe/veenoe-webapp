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
  /** Restrict choices to the active curriculum when supplied by the setup form. */
  classLevels?: readonly number[];
  disabled?: boolean;
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
 * Uses supplied curriculum classes; without them, offers classes 1-12 and college.
 * The optional custom input is controlled by the caller through isOtherClass.
 */
export function ClassLevelSelector({
  classLevel,
  isOtherClass,
  otherClassValue,
  onClassChange,
  onOtherValueChange,
  classLevels,
  disabled = false,
}: ClassLevelSelectorProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="class">Class Level *</Label>
      <Select
        value={classLevel}
        onValueChange={onClassChange}
        disabled={disabled}
      >
        <SelectTrigger id="class" className="w-full">
          <SelectValue placeholder="Select Class" />
        </SelectTrigger>
        <SelectContent>
          {(classLevels ?? Array.from({ length: 12 }, (_, i) => i + 1)).map(
            (num) => (
              <SelectItem key={num} value={num.toString()}>
                Class {num}
              </SelectItem>
            ),
          )}
          {!classLevels && (
            <SelectItem value="College/Professional">
              College/Professional
            </SelectItem>
          )}
        </SelectContent>
      </Select>

      {isOtherClass && (
        <Input
          placeholder="e.g: BSC Physics 2nd year / CS / CA"
          value={otherClassValue}
          onChange={onOtherValueChange}
          className="mt-2"
          required
        />
      )}
    </div>
  );
}
