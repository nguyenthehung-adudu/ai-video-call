'use server';

import { prisma } from '@/lib/prisma';

export async function getInvitationsByMeetingId(meetingId: string) {
  try {
    const invitations = await prisma.invitation.findMany({
      where: {
        meetingId,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return {
      success: true,
      invitations,
    };
  } catch (error) {
    console.error('❌ [getInvitationsByMeetingId] Failed:', error);
    return { success: false, invitations: [], message: 'Failed to fetch invitations' };
  }
}
