import { NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';

export type ClerkUserProfile = {
  userId: string;
  imageUrl: string | null;
  firstName: string | null;
  lastName: string | null;
  emailAddress: string;
};

export type GetUsersByEmailsResponse = {
  success: boolean;
  users: Record<string, ClerkUserProfile>;
  error?: string;
};

// GET /api/clerk-users?emails=email1,email2,email3
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const emailsParam = searchParams.get('emails');

    if (!emailsParam) {
      return NextResponse.json(
        { success: false, users: {}, error: 'Missing emails parameter' },
        { status: 400 }
      );
    }

    // Debug: Log raw emails from client
    console.log('🔍 [API /clerk-users] Raw emails from client:', emailsParam);

    const searchEmails = emailsParam
      .split(',')
      .map((e) => e.toLowerCase().trim())
      .filter(Boolean);

    if (searchEmails.length === 0) {
      return NextResponse.json({ success: true, users: {} });
    }

    // Debug: Log normalized emails
    console.log('🔍 [API /clerk-users] Normalized emails:', searchEmails);

    const client = await clerkClient();

    // Fetch ALL users and filter manually to ensure we don't miss any
    // Use getUserList (correct method for @clerk/nextjs/server)
    const allUsersResponse = await client.users.getUserList({
      limit: 100,
    });

    console.log('🔍 [API /clerk-users] Total users fetched from Clerk:', allUsersResponse.data.length);

    const result: Record<string, ClerkUserProfile> = {};

    for (const user of allUsersResponse.data) {
      // Check ALL email addresses for this user (not just primary)
      for (const emailObj of user.emailAddresses) {
        const email = emailObj.emailAddress.toLowerCase();

        // If this email matches one of our search emails and not already matched
        if (searchEmails.includes(email) && !result[email]) {
          console.log('🔍 [API /clerk-users] ✅ MATCHED - Email:', email, '| User:', user.id, '| Image:', user.imageUrl);

          result[email] = {
            userId: user.id,
            imageUrl: user.imageUrl || null,
            firstName: user.firstName || null,
            lastName: user.lastName || null,
            emailAddress: email,
          };
        }
      }
    }

    // Debug: Log which emails were matched
    const matchedEmails = Object.keys(result);
    const missingEmails = searchEmails.filter((e) => !matchedEmails.includes(e));

    console.log('🔍 [API /clerk-users] Matched emails:', matchedEmails);
    console.log('🔍 [API /clerk-users] Missing emails:', missingEmails);
    console.log(`✅ [API /clerk-users] Found ${matchedEmails.length}/${searchEmails.length} users`);

    if (missingEmails.length > 0) {
      console.log('⚠️ [API /clerk-users] Users not found in Clerk - possible reasons:');
      console.log('   1. User does not exist in Clerk');
      console.log('   2. Email is not verified in Clerk');
      console.log('   3. Email is attached to a different user account');
      console.log('   4. User was recently created and not yet synced');
    }

    return NextResponse.json({ success: true, users: result });
  } catch (error) {
    console.error('❌ [API /clerk-users] Error:', error);
    return NextResponse.json(
      { success: false, users: {}, error: 'Failed to fetch Clerk users' },
      { status: 500 }
    );
  }
}
