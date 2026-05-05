"use server";

import { clerkClient } from "@clerk/nextjs/server";

export type VerifyUserResult = {
  success: boolean;
  userId?: string;
  imageUrl?: string | null;
  fullName?: string;
  email?: string;
  error?: string;
};

/**
 * Verify if an email exists in Clerk and return user info.
 * This is used to validate email invitations before creating meetings.
 */
export async function verifyClerkUser(email: string): Promise<VerifyUserResult> {
  try {
    // Normalize email
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      return { success: false, error: "Email is required" };
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return { success: false, error: "Invalid email format" };
    }

    const client = await clerkClient();

    // Fetch users and search manually for the email
    // This is more reliable than using filters
    const allUsersResponse = await client.users.getUserList({
      limit: 100,
    });

    // Search for user with matching email
    for (const user of allUsersResponse.data) {
      for (const emailObj of user.emailAddresses) {
        if (emailObj.emailAddress.toLowerCase() === normalizedEmail) {
          const fullName = [user.firstName, user.lastName]
            .filter(Boolean)
            .join(" ") || undefined;

          return {
            success: true,
            userId: user.id,
            imageUrl: user.imageUrl,
            fullName,
            email: normalizedEmail,
          };
        }
      }
    }

    // User not found in Clerk
    return {
      success: false,
      error: "No user found with this email. The user must have an account to receive invitations.",
    };
  } catch (error) {
    console.error("❌ [verifyClerkUser] Error:", error);
    return {
      success: false,
      error: "Failed to verify user. Please try again.",
    };
  }
}
