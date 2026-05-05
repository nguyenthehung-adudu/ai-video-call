'use server';

import { StreamClient } from '@stream-io/node-sdk';
import { prisma } from '@/lib/prisma';

const API_KEY = process.env.NEXT_PUBLIC_STREAM_API_KEY!;
const API_SECRET = process.env.STREAM_SECRET_KEY!;

export async function sendMeetingInvitation(
  meetingId: string,
  email: string,
  metadata?: {
    type?: 'scheduled' | 'instant';
    scheduledAt?: Date | null;
    meetingName?: string;
    hostId?: string;
    hostName?: string;
    hostAvatar?: string;
  },
) {
  const type = metadata?.type || 'instant';
  const scheduledAt = metadata?.scheduledAt ?? null;

  console.log('📧 [Invite] Bắt đầu gửi lời mời:', { meetingId, email, type });

  try {
    const normalizedEmail = email.toLowerCase().trim();
    console.log('📧 [Invite] Email đã normalize:', normalizedEmail);

    const client = new StreamClient(API_KEY, API_SECRET);
    console.log('📧 [Invite] Stream client đã tạo');

    // Get call info from Stream to get meeting details and host info
    // Use provided metadata if available, otherwise fetch from Stream
    let meetingName = metadata?.meetingName || 'Cuộc họp';
    let hostName = metadata?.hostName || 'Người tổ chức';
    let hostId = metadata?.hostId || '';

    try {
      console.log('📧 [Invite] Đang lấy call info từ Stream...');
      const response = await client.video.call("default", meetingId).get();
      console.log('📧 [Invite] Call info response:', response);

      // Only use Stream data if metadata wasn't provided
      if (!metadata?.meetingName) {
        meetingName = (response.call.custom?.description as string) || 'Cuộc họp';
      }
      if (!metadata?.hostName) {
        hostName = response.call.created_by?.name || 'Người tổ chức';
      }
      if (!metadata?.hostId) {
        hostId = response.call.created_by?.id || '';
      }
      console.log('📧 [Invite] Meeting name:', meetingName);
      console.log('📧 [Invite] Host name:', hostName);
    } catch (e) {
      console.warn('⚠️ [Invite] Could not get call info from Stream:', e);
    }

    // Check if already invited in DB
    console.log('📧 [Invite] Đang kiểm tra trong DB...');
    const existing = await prisma.invitation.findFirst({
      where: {
        meetingId,
        inviteeEmail: normalizedEmail,
      },
    });
    console.log('📧 [Invite] Existing invitation:', existing);

    if (existing) {
      console.log('📧 [Invite] Email đã được mời trước đó');
      return { success: false, message: 'Email này đã được mời trước đó' };
    }

    // Save invitation to database with full data
    console.log('📧 [Invite] Đang tạo invitation trong DB...');
    console.log('📧 [Invite] Data sẽ tạo:', {
      meetingId,
      meetingName,
      hostName,
      hostId,
      inviteeEmail: normalizedEmail,
      isRead: false
    });
    
    const newInvitation = await prisma.invitation.create({
      data: {
        meetingId,
        meetingName,
        hostId,
        hostName,
        hostAvatar: metadata?.hostAvatar || null,
        inviteeEmail: normalizedEmail,
        isRead: false,
        type,
        scheduledAt,
      },
    });
    console.log('📧 [Invite] Đã tạo invitation:', newInvitation);

    return { success: true, message: 'Đã gửi lời mời thành công!' };
  } catch (error) {
    console.error('❌ [Invite] Failed:', error);
    return { success: false, message: 'Không thể gửi lời mời. Vui lòng thử lại.' };
  }
}

export async function getInvitationsByEmail(email: string) {
  try {
    const normalizedEmail = email.toLowerCase().trim();

    const invitations = await prisma.invitation.findMany({
      where: {
        inviteeEmail: normalizedEmail,
        isRead: false,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return { success: true, invitations };
  } catch (error) {
    console.error('❌ [Get Invitations] Failed:', error);
    return { success: false, invitations: [], message: 'Không thể lấy lời mời' };
  }
}

export async function dismissInvitation(invitationId: string) {
  try {
    await prisma.invitation.update({
      where: { id: invitationId },
      data: { isRead: true },
    });
    return { success: true };
  } catch (error) {
    console.error('❌ [Dismiss Invitation] Failed:', error);
    return { success: false, message: 'Không thể xoá lời mời' };
  }
}
