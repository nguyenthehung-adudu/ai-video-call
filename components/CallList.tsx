'use client';

import { Call, CallRecording } from '@stream-io/video-react-sdk';
import Loader from './Loader';
import { useGetCalls } from '@/hooks/useGetCalls';
import MeetingCard, { ParticipantAvatar } from './MeetingCard';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatMeetingDateTime } from '@/lib/utils';
import { memberAvatarUrl, dicebearInitials } from '@/lib/participant-avatar';
import { isEmailInvited } from '@/lib/invite';
import { useUser } from '@clerk/nextjs';
import { getInvitationsByMeetingId } from '@/actions/meeting-invitations.actions';
import { Trash2, AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type RecordingWithCall = {
  call: Call;
  recording: CallRecording;
};

type ClerkUserProfile = {
  userId: string;
  imageUrl: string | null;
  firstName: string | null;
  lastName: string | null;
  emailAddress: string;
};

const CallList = ({ type }: { type: 'ended' | 'upcoming' | 'recordings' }) => {
  const router = useRouter();
  const { user } = useUser();
  const { endedCalls, upcomingCalls, callRecordings, isLoading, forceRefetch } =
    useGetCalls();
  const [recordingsWithCall, setRecordingsWithCall] = useState<RecordingWithCall[]>([]);
  // callId → avatars from Stream members
  const [memberAvatars, setMemberAvatars] = useState<Record<string, ParticipantAvatar[]>>({});
  // callId → avatars from Prisma invitations (invited users)
  const [invitedAvatars, setInvitedAvatars] = useState<Record<string, ParticipantAvatar[]>>({});
  const [isAvatarsLoading, setIsAvatarsLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{
    open: boolean;
    meetingId: string;
    meetingName: string;
  }>({ open: false, meetingId: '', meetingName: '' });

  const getCalls = () => {
    switch (type) {
      case 'ended':
        return endedCalls;
      case 'recordings':
        return recordingsWithCall;
      case 'upcoming':
        return upcomingCalls;
      default:
        return [];
    }
  };

  const getNoCallsMessage = () => {
    switch (type) {
      case 'ended':
        return 'No Previous Calls';
      case 'upcoming':
        return 'No Upcoming Calls';
      case 'recordings':
        return 'No Recordings';
      default:
        return '';
    }
  };

  // ── Delete handlers ────────────────────────────────────────────
  const handleRequestDelete = (meetingId: string, meetingName: string) => {
    setConfirmDelete({ open: true, meetingId, meetingName });
  };

  const handleConfirmDelete = async () => {
    const { meetingId } = confirmDelete;
    if (!meetingId || !user?.id) return;

    try {
      const { deleteMeeting } = await import('@/actions/stream.actions');
      const result = await deleteMeeting(meetingId, user.id);
      if (result.success) {
        // Refresh the list
        await forceRefetch();
      } else {
        console.error('Failed to delete meeting:', result.message);
      }
    } catch (error) {
      console.error('Failed to delete meeting:', error);
    }

    setConfirmDelete({ open: false, meetingId: '', meetingName: '' });
  };

  const handleCancelDelete = () => {
    setConfirmDelete({ open: false, meetingId: '', meetingName: '' });
  };

  // ── Fetch member avatars ───────────────────────────────────────────────
  const targetCalls = useMemo(() => {
    if (type === 'recordings') return [];
    return (type === 'ended' ? endedCalls : upcomingCalls) ?? [];
  }, [type, endedCalls, upcomingCalls]);

  const callIdsKey = useMemo(
    () => targetCalls.map((c) => c.id).join(','),
    [targetCalls],
  );

  // ── Fetch member avatars from Stream + invitations from Prisma ──────────────────
  useEffect(() => {
    if (type === 'recordings' || targetCalls.length === 0) {
      setMemberAvatars({});
      setInvitedAvatars({});
      return;
    }

    let cancelled = false;
    setIsAvatarsLoading(true);

    const load = async () => {
      const memberResult: Record<string, ParticipantAvatar[]> = {};
      const invitedResult: Record<string, ParticipantAvatar[]> = {};

      // Process calls in batches of 3 with delay between batches to avoid rate limiting
      const BATCH_SIZE = 3;
      const BATCH_DELAY_MS = 500;

      for (let batchStart = 0; batchStart < targetCalls.length && !cancelled; batchStart += BATCH_SIZE) {
        const batch = targetCalls.slice(batchStart, batchStart + BATCH_SIZE);

        await Promise.all(
          batch.map(async (call) => {
            if (cancelled) return;

            // 1. Fetch invitations from Prisma first (source of truth for host info + invited users)
            try {
              const invResult = await getInvitationsByMeetingId(call.id);
              if (invResult.success && invResult.invitations.length > 0) {
                // Collect all unique invitee emails for batch Clerk lookup
                const inviteeEmails = invResult.invitations
                  .map((inv) => inv.inviteeEmail)
                  .filter((email): email is string => !!email);

                // Batch fetch Clerk user profiles via API
                let clerkUsersMap: Record<string, ClerkUserProfile> = {};
                if (inviteeEmails.length > 0) {
                  try {
                    const response = await fetch(
                      `/api/clerk-users?emails=${encodeURIComponent(inviteeEmails.join(','))}`
                    );
                    if (response.ok) {
                      const data = await response.json();
                      if (data.success) {
                        clerkUsersMap = data.users;
                      }
                    }
                  } catch (fetchError) {
                    console.error('❌ [Clerk API] Failed to fetch user profiles:', fetchError);
                  }
                }

                const avatars: ParticipantAvatar[] = [];

                // First invitation has host info
                const firstInv = invResult.invitations[0];
                if (firstInv.hostName) {
                  avatars.push({
                    src: memberAvatarUrl(firstInv.hostAvatar || null, firstInv.hostName),
                    alt: firstInv.hostName,
                  });
                }

                // Add invited users with real Clerk avatars or Dicebear initials fallback
                for (const inv of invResult.invitations) {
                  if (inv.inviteeEmail) {
                    const normalizedEmail = inv.inviteeEmail.toLowerCase();
                    const clerkUser = clerkUsersMap[normalizedEmail];

                    let avatarSrc: string;
                    let avatarAlt: string;

                    if (clerkUser) {
                      // Use Clerk imageUrl if available, otherwise generate initials
                      avatarSrc = memberAvatarUrl(
                        clerkUser.imageUrl || null,
                        clerkUser.firstName || clerkUser.lastName || inv.inviteeEmail
                      );
                      avatarAlt = [clerkUser.firstName, clerkUser.lastName]
                        .filter(Boolean)
                        .join(' ') || inv.inviteeEmail;
                    } else {
                      // Fallback to Dicebear initials if user not found in Clerk
                      avatarSrc = dicebearInitials(inv.inviteeEmail);
                      avatarAlt = inv.inviteeEmail;
                    }

                    avatars.push({
                      src: avatarSrc,
                      alt: avatarAlt,
                    });
                  }
                }

                // Deduplicate by alt
                const seen = new Set<string>();
                const unique = avatars.filter((a) => {
                  if (seen.has(a.alt)) return false;
                  seen.add(a.alt);
                  return true;
                });

                invitedResult[call.id] = unique;
              }
            } catch (error) {
              console.error('❌ [Invitations] Failed:', error);
            }

            // 2. Only query Stream members if no invitations found
            if (!invitedResult[call.id] || invitedResult[call.id].length === 0) {
              try {
                const { members } = await call.queryMembers({ limit: 12 });
                if (members.length > 0) {
                  const avatars = members.map((m) => ({
                    src: memberAvatarUrl(m.user?.image, m.user?.name || m.user_id),
                    alt: m.user?.name || m.user_id,
                  }));
                  memberResult[call.id] = avatars;
                }
              } catch (error) {
                console.error('❌ [Avatars] queryMembers failed:', error);
              }
            }
          }),
        );

        // Delay between batches
        if (batchStart + BATCH_SIZE < targetCalls.length) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        }
      }

      if (!cancelled) {
        setMemberAvatars(memberResult);
        setInvitedAvatars(invitedResult);
        setIsAvatarsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      setIsAvatarsLoading(false);
    };
  }, [type, callIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch recordings ──────────────────────────────────────────────────
  useEffect(() => {
    if (type !== 'recordings' || !callRecordings?.length) {
      setRecordingsWithCall([]);
      return;
    }

    let cancelled = false;

    const fetchRecordings = async () => {
      const pairs = await Promise.all(
        callRecordings.map(async (call) => {
          const { recordings } = await call.queryRecordings();
          return recordings.map((recording) => ({ call, recording }));
        }),
      );
      if (!cancelled) setRecordingsWithCall(pairs.flat());
    };

    void fetchRecordings();

    return () => {
      cancelled = true;
    };
  }, [type, callRecordings]);

  if (isLoading) return <Loader />;

  const calls = getCalls();
  const noCallsMessage = getNoCallsMessage();

  const meetingTitle = (call: Call) => {
    const d = call.state.custom?.description;
    return typeof d === 'string' && d.trim() ? d.trim() : `Cuộc họp ${call.id.slice(0, 8)}`;
  };

  const meetingWhen = (call: Call, recording?: CallRecording) => {
    if (recording?.start_time) return formatMeetingDateTime(recording.start_time);
    if (call.state.startsAt) return formatMeetingDateTime(call.state.startsAt);
    if (call.state.endedAt) return formatMeetingDateTime(call.state.endedAt);
    return '—';
  };

  const showInvitedBadge = (call: Call) => {
    const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase().trim();
    if (!email) return false;
    const hostId = call.state.createdBy?.id;
    if (hostId === user?.id) return false;
    const searchStr = call.state.custom?.invitedEmailsStr as string | undefined;
    const invitedArray = call.state.custom?.invitedEmails as string[] | undefined;
    // Check both string format and array format
    const hasInStr = searchStr && searchStr.includes(`|${email}|`);
    const hasInArray = invitedArray && invitedArray.includes(email);
    return isEmailInvited(searchStr, email) || !!hasInArray;
  };

  /**
   * Resolve avatars for a call.
   * Upcoming & Ended: use invitations (from Prisma) first, fallback to Stream members
   */
  const resolveAvatars = (call: Call): ParticipantAvatar[] => {
    if (type !== 'upcoming' && type !== 'ended') return [];

    // Priority 1: invitations from Prisma (has host info + invited users)
    const invited = invitedAvatars[call.id];
    if (invited && invited.length > 0) return invited;

    // Priority 2: Stream members
    const members = memberAvatars[call.id];
    if (members && members.length > 0) return members;

    return [];
  };

  return (
    <>
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      {calls && calls.length > 0 ? (
        type === 'recordings' ? (
          (calls as RecordingWithCall[]).map(({ call, recording }) => (
            <MeetingCard
              key={`${call.id}-${recording.session_id}`}
              icon="/icons/recordings.svg"
              title={meetingTitle(call)}
              subtitle={meetingWhen(call, recording)}
              hideCopyLink
              link={recording.url}
              buttonIcon1="/icons/play.svg"
              buttonText="Play"
              handleClick={() => router.push(recording.url)}
            />
          ))
        ) : (
          (calls as Call[]).map((meeting) => (
            <MeetingCard
              key={meeting.id}
              icon={type === 'ended' ? '/icons/previous.svg' : '/icons/upcoming.svg'}
              title={meetingTitle(meeting)}
              subtitle={meetingWhen(meeting)}
              isPreviousMeeting={type === 'ended'}
              participantAvatars={resolveAvatars(meeting)}
              invitedBadge={type === 'upcoming' ? showInvitedBadge(meeting) : false}
              showDelete={type === 'upcoming' || type === 'ended'}
              onDelete={() => handleRequestDelete(meeting.id, meetingTitle(meeting))}
              link={`${process.env.NEXT_PUBLIC_BASE_URL}/meeting/${meeting.id}`}
              buttonText="Start"
              handleClick={() => router.push(`/meeting/${meeting.id}`)}
              isLoading={isAvatarsLoading}
            />
          ))
        )
      ) : (
        <h1 className="text-2xl font-bold text-white">{noCallsMessage}</h1>
      )}
    </div>

    <AlertDialog open={confirmDelete.open} onOpenChange={(open) => !open && handleCancelDelete()}>
      <AlertDialogContent className="bg-dark-1 border-dark-3 text-white">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="text-red-500" size={20} />
            Xác nhận xóa cuộc họp
          </AlertDialogTitle>
          <AlertDialogDescription className="text-white/60">
            {"Bạn có chắc chắn muốn xóa cuộc họp \""}
            <strong className="text-white">{confirmDelete.meetingName}</strong>
            {"\" không?"}
            <br />
            <span className="text-yellow-500 text-sm">Hành động này không thể hoàn tác.</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex gap-2">
          <AlertDialogCancel className="bg-dark-3 text-white hover:bg-dark-2 border-dark-3">
            Hủy bỏ
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirmDelete}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Xóa cuộc họp
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};

export default CallList;