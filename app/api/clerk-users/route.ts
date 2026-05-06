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
    console.log('🔍 [API /clerk-users] === START ===');
    console.log('🔍 [API /clerk-users] Raw emails from client:', emailsParam);
    console.log('🔍 [API /clerk-users] Raw emails charCodes:', [...emailsParam].map(c => c.charCodeAt(0)));

    const searchEmails = emailsParam
      .split(',')
      .map((e) => e.toLowerCase().trim())
      .filter(Boolean);

    if (searchEmails.length === 0) {
      console.log('🔍 [API /clerk-users] No valid emails after normalization');
      return NextResponse.json({ success: true, users: {} });
    }

    // Debug: Log normalized emails
    console.log('🔍 [API /clerk-users] Normalized emails to search:', searchEmails);
    console.log('🔍 [API /clerk-users] Email count:', searchEmails.length);

    const client = await clerkClient();

    // Fetch ALL users and filter manually to ensure we don't miss any
    // Use getUserList (correct method for @clerk/nextjs/server)
    const allUsersResponse = await client.users.getUserList({
      limit: 100,
    });

    console.log('🔍 [API /clerk-users] Total users fetched from Clerk:', allUsersResponse.data.length);

    const result: Record<string, ClerkUserProfile> = {};

    // Debug: Track matching process
    let matchCount = 0;
    let userCheckedCount = 0;

    for (const user of allUsersResponse.data) {
      userCheckedCount++;
      // Check ALL email addresses for this user (not just primary)
      for (const emailObj of user.emailAddresses) {
        const email = emailObj.emailAddress.toLowerCase();
        const isVerified = emailObj.verification?.status === 'verified';
        
        // Debug: Log each email check
        if (searchEmails.includes(email)) {
          console.log('🔍 [API /clerk-users] ✅ EXACT MATCH - Clerk Email:', email, '| Search for:', searchEmails, '| Match:', searchEmails.includes(email), '| User:', user.id, '| Image:', user.imageUrl, '| Verified:', isVerified);
        }

        // If this email matches one of our search emails and not already matched
        if (searchEmails.includes(email) && !result[email]) {
          matchCount++;
          console.log('🔍 [API /clerk-users] ✅ RECORDED - Email:', email, '| User:', user.id, '| Image:', user.imageUrl, '| Verified:', isVerified, '| Match #:', matchCount);

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

    console.log('🔍 [API /clerk-users] === SUMMARY ===');
    console.log('🔍 [API /clerk-users] Users checked in Clerk:', userCheckedCount);
    console.log('🔍 [API /clerk-users] Matched emails (keys in result):', matchedEmails);
    console.log('🔍 [API /clerk-users] Missing emails:', missingEmails);
    console.log('🔍 [API /clerk-users] Match rate:', `${matchedEmails.length}/${searchEmails.length}`);
    
    if (missingEmails.length > 0) {
      console.log('⚠️ [API /clerk-users] Users not found in Clerk - possible reasons:');
      console.log('   1. User does not exist in Clerk');
      console.log('   2. Email is not verified in Clerk');
      console.log('   3. Email is attached to a different user account');
      console.log('   4. User was recently created and not yet synced');
      console.log('   5. Email case mismatch (should be normalized to lowercase)');
      console.log('   6. Trailing/leading whitespace in email');
      
      // Debug: Check if any search email is a substring of a Clerk email or vice versa
      for (const missingEmail of missingEmails) {
        console.log(`🔍 [API /clerk-users] Debug for missing: "${missingEmail}"`);
        console.log(`   - Length: ${missingEmail.length}`);
        console.log(`   - Char codes: ${[...missingEmail].map(c => c.charCodeAt(0))}`);
      }
    }

    console.log('🔍 [API /clerk-users] === END ===');

    return NextResponse.json({ success: true, users: result });
  } catch (error) {
    console.error('❌ [API /clerk-users] Error:', error);
    return NextResponse.json(
      { success: false, users: {}, error: 'Failed to fetch Clerk users' },
      { status: 500 }
    );
  }
}
