import { useState, useEffect, useCallback } from "react";
import { verifyClerkUser, VerifyUserResult } from "@/actions/verify-clerk-user";

export type EmailVerificationStatus =
  | "idle"
  | "checking"
  | "valid"
  | "invalid"
  | "error";

export type VerifiedEmail = {
  email: string;
  status: EmailVerificationStatus;
  result?: VerifyUserResult;
};

const DEBOUNCE_MS = 500;

/**
 * Hook to verify email addresses against Clerk users.
 * Debounces requests to avoid excessive API calls while typing.
 */
export function useVerifyEmails() {
  const [verifiedEmails, setVerifiedEmails] = useState<VerifiedEmail[]>([]);
  const [checkingEmails, setCheckingEmails] = useState<Set<string>>(new Set());

  // Verify a single email with debounce
  const verifyEmail = useCallback(
    async (email: string) => {
      const normalizedEmail = email.trim().toLowerCase();

      if (!normalizedEmail) {
        return;
      }

      // Add to checking set
      setCheckingEmails((prev) => new Set(prev).add(normalizedEmail));

      // Update status to checking
      setVerifiedEmails((prev) => {
        const exists = prev.find((e) => e.email === normalizedEmail);
        if (exists) {
          return prev.map((e) =>
            e.email === normalizedEmail
              ? { ...e, status: "checking" as EmailVerificationStatus }
              : e
          );
        }
        return [
          ...prev,
          { email: normalizedEmail, status: "checking" },
        ];
      });

      try {
        const result = await verifyClerkUser(normalizedEmail);

        const status: EmailVerificationStatus = result.success
          ? "valid"
          : "invalid";

        setVerifiedEmails((prev) =>
          prev.map((e) =>
            e.email === normalizedEmail
              ? { ...e, status, result }
              : e
          )
        );
      } catch (error) {
        console.error("❌ [useVerifyEmails] Verification error:", error);
        setVerifiedEmails((prev) =>
          prev.map((e) =>
            e.email === normalizedEmail
              ? {
                  ...e,
                  status: "error",
                  result: {
                    success: false,
                    error: "Verification failed",
                  },
                }
              : e
          )
        );
      } finally {
        setCheckingEmails((prev) => {
          const next = new Set(prev);
          next.delete(normalizedEmail);
          return next;
        });
      }
    },
    []
  );

  // Get verification status for a specific email
  const getStatus = useCallback(
    (email: string): EmailVerificationStatus => {
      const normalizedEmail = email.trim().toLowerCase();
      const found = verifiedEmails.find((e) => e.email === normalizedEmail);
      return found?.status || "idle";
    },
    [verifiedEmails]
  );

  // Get user info for a specific email
  const getUserInfo = useCallback(
    (email: string): VerifyUserResult | undefined => {
      const normalizedEmail = email.trim().toLowerCase();
      const found = verifiedEmails.find((e) => e.email === normalizedEmail);
      return found?.result;
    },
    [verifiedEmails]
  );

  // Clear verification data
  const clearVerification = useCallback(() => {
    setVerifiedEmails([]);
    setCheckingEmails(new Set());
  }, []);

  // Remove a specific email from verification cache
  const removeEmail = useCallback((email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    setVerifiedEmails((prev) =>
      prev.filter((e) => e.email !== normalizedEmail)
    );
  }, []);

  return {
    verifyEmail,
    getStatus,
    getUserInfo,
    clearVerification,
    removeEmail,
    verifiedEmails,
    checkingEmails,
    isChecking: checkingEmails.size > 0,
  };
}

// Debounce utility hook for email verification
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
