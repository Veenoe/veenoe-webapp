import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";

/**
 * Interface defining the configuration data structure for a Viva session.
 */
export interface VivaConfigData {
    studentName: string;
    topic: string;
    classLevel: string;
    voiceName: string;
}

/**
 * Custom hook to manage the business logic for the Viva Configuration Form.
 * Handles state management, Clerk user integration, localStorage persistence,
 * and form submission orchestration.
 *
 * @param onSubmit - Callback function executed when the form is successfully submitted.
 * @returns Object containing all necessary state values and action handlers for the UI.
 */
export function useVivaSessionConfig(onSubmit: (data: VivaConfigData) => Promise<void>) {
    const { user, isLoaded } = useUser();

    // --- State Management ---
    const [isMounted, setIsMounted] = useState(false);
    const [studentName, setStudentName] = useState("");
    const [topic, setTopic] = useState("");

    // Class level state
    const [classLevel, setClassLevel] = useState("12");
    const [isOtherClass, setIsOtherClass] = useState(false);
    const [otherClassValue, setOtherClassValue] = useState("");

    const [voiceName, setVoiceName] = useState("Kore");

    // Name editing state
    const [isEditingName, setIsEditingName] = useState(false);
    const [tempName, setTempName] = useState("");
    const [isSavingName, setIsSavingName] = useState(false);

    // --- Side Effects ---

    // 1. Hydration & Clerk Integration
    useEffect(() => {
        setIsMounted(true);
        // Only auto-fill if the user is loaded and hasn't manually radically changed it (though here we just sync once on load primarily)
        // Ideally we check if studentName is empty to avoid overwriting edits if re-renders happen, 
        // but dependent on user.isLoaded usually fine.
        if (isLoaded && user) {
            setStudentName(user.fullName || user.firstName || "");
        }
    }, [isLoaded, user]);

    // 2. Local Storage Persistence for Class Level
    useEffect(() => {
        if (typeof window !== "undefined") {
            const savedClass = localStorage.getItem("veenoe_last_class");
            if (savedClass) {
                const intClass = parseInt(savedClass);
                if (!isNaN(intClass) && intClass >= 1 && intClass <= 12) {
                    setClassLevel(savedClass);
                    setIsOtherClass(false);
                } else {
                    setClassLevel("Other");
                    setIsOtherClass(true);
                    setOtherClassValue(savedClass);
                }
            }
        }
    }, []);

    // --- Action Handlers ---

    /**
     * Updates the user's name in Clerk (Global Profile Update).
     */
    const handleSaveName = async () => {
        if (!tempName.trim() || !user) return;
        setIsSavingName(true);
        try {
            const [firstName, ...lastNameParts] = tempName.trim().split(" ");
            const lastName = lastNameParts.join(" ");

            await user.update({
                firstName: firstName,
                lastName: lastName || undefined,
            });

            setStudentName(tempName);
            setIsEditingName(false);
        } catch (err) {
            console.error("Failed to update name:", err);
            // In a real app, you might want to expose an error state here
        } finally {
            setIsSavingName(false);
        }
    };

    const startEditingName = () => {
        setTempName(studentName);
        setIsEditingName(true);
    };

    const cancelEditingName = () => {
        setIsEditingName(false);
        setTempName("");
    };

    const handleClassChange = (value: string) => {
        if (value === "Other") {
            setIsOtherClass(true);
            setClassLevel("Other");
        } else {
            setIsOtherClass(false);
            setClassLevel(value);
            localStorage.setItem("veenoe_last_class", value);
        }
    };

    const handleOtherClassChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setOtherClassValue(e.target.value);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const finalClass = isOtherClass ? otherClassValue : classLevel;
        localStorage.setItem("veenoe_last_class", finalClass);

        await onSubmit({
            studentName,
            topic,
            classLevel: finalClass,
            voiceName
        });
    };

    return {
        state: {
            isMounted,
            isLoaded,
            studentName,
            isEditingName,
            tempName,
            isSavingName,
            topic,
            classLevel,
            isOtherClass,
            otherClassValue,
            voiceName,
        },
        actions: {
            setStudentName,
            setTopic,
            setVoiceName,
            setTempName,
            startEditingName,
            cancelEditingName,
            handleSaveName,
            handleClassChange,
            handleOtherClassChange,
            handleSubmit,
        }
    };
}
