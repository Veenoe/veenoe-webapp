'use client';

/**
 * Auth Provider that sets up the token getter for API requests.
 * 
 * This component should wrap the app's content (inside ClerkProvider)
 * to ensure the API client always has access to fresh auth tokens.
 * 
 * Design Decision (First Principles):
 * - Token getter pattern instead of mutable global state
 * - Fresh token per request eliminates race conditions
 * - Single source of truth for auth token retrieval
 */

import { useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { setTokenGetter } from '@/lib/api/axios';

interface AuthProviderProps {
    children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
    const { getToken } = useAuth();

    useEffect(() => {
        // Register Clerk's getToken as the token getter
        // This ensures every API request gets a fresh, valid token
        setTokenGetter(getToken);

        // Cleanup on unmount
        return () => {
            setTokenGetter(async () => null);
        };
    }, [getToken]);

    return <>{children}</>;
}
