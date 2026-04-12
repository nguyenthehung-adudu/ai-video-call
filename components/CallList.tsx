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

/** Build participant avatar list for a call type. */
async function fetchCallAvatars(call: Call) {
  try {
    const { members } = await call.queryMembers({ limit: 12 });
    if (members.length > 0) {
      return members.map((m) => ({
        src: memberAvatarUrl(m.user?.image, m.user?.name || m.user_id),
        alt: m.user?.name || m.user_id,
      }));
    }
  } catch {
    // silent
  }
  return [];
}

/** Extract creator info from call state. */
function getCreatorInfo(call: Call): ParticipantAvatar | null {
  const creatorId = call.state.createdBy?.id;
  const creatorName = call.state.createdBy?.name;
  const creatorImage = call.state.createdBy?.image;
  if (!creatorId) return null;
  return {
    src: memberAvatarUrl(creatorImage, creatorName || creatorId),
    alt: creatorName || creatorId,
  };
}

/** Build Dicebear avatar using full meeting title. */
function getTitleFallbackAvatar(call: Call): ParticipantAvatar {
  const title = call.state.custom?.description as string | undefined;
  const displayTitle = title?.trim() || `Meeting ${call.id.slice(0, 8)}`;
  // Use full title as seed for Dicebear
  return { src: dicebearInitials(displayTitle), alt: displayTitle };
}

const CallList = ({ type }: { type: 'ended' | 'upcoming' | 'recordings' }) => {
  const router = useRouter();
  const { user } = useUser();
  const { endedCalls, upcomingCalls, callRecordings, isLoading, forceRefetch } =
    useGetCalls();
  const [recordingsWithCall, setRecordingsWithCall] = useState<RecordingWithCall[]>([]);
  // callId → avatars from Stream members
  const [memberAvatars, setMemberAvatars] = useState<Record<string, ParticipantAvatar[]>>({});
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

  useEffect(() => {
    if (type === 'recordings' || targetCalls.length === 0) {
      setMemberAvatars({});
      return;
    }

    let cancelled = false;
    setIsAvatarsLoading(true);

    const load = async () => {
      const result: Record<string, ParticipantAvatar[]> = {};

      await Promise.all(
        targetCalls.map(async (call) => {
          if (cancelled) return;
          const avatars = await fetchCallAvatars(call);
          if (cancelled) return;
          if (avatars.length > 0) {
            result[call.id] = avatars;
          }
        }),
      );

      if (!cancelled) {
        setMemberAvatars(result);
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
   * Ended: members who participated (from queryMembers)
   * Upcoming: creator + Dicebear avatars for each invited email
   */
  const resolveAvatars = (call: Call): ParticipantAvatar[] => {
    const fromMembers = memberAvatars[call.id];

    // Upcoming: show creator + Dicebear avatar for each invited email
    if (type === 'upcoming') {
      if (fromMembers && fromMembers.length > 0) return fromMembers;

      const result: ParticipantAvatar[] = [];

      const creator = getCreatorInfo(call);
      if (creator) result.push(creator);

      // Get invited emails from custom data
      const invitedEmails = call.state.custom?.invitedEmails as string[] | undefined;
      if (invitedEmails && invitedEmails.length > 0) {
        // Show Dicebear avatar for each invited email
        for (const email of invitedEmails) {
          result.push({
            src: dicebearInitials(email),
            alt: email,
          });
        }
      }

      // Only return avatars if we have creator or invitees
      if (result.length > 0) return result;
      // If no invitees, return empty array (no avatars shown)
      return [];
    }

    // Ended: show members who participated
    if (type === 'ended') {
      if (fromMembers && fromMembers.length > 0) return fromMembers;
      // If no members participated, return empty array (no avatars shown)
      return [];
    }

    // Recordings: no avatars needed
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
              showDelete={type === 'upcoming'}
              onDelete={() => handleRequestDelete(meeting.id, meetingTitle(meeting))}
              link={`${process.env.NEXT_PUBLIC_BASE_URL}/meeting/${meeting.id}`}
              buttonText="Start"
              handleClick={() => router.push(`/meeting/${meeting.id}`)}
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