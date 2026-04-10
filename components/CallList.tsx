'use client';

import { Call, CallRecording } from '@stream-io/video-react-sdk';
import Loader from './Loader';
import { useGetCalls } from '@/hooks/useGetCalls';
import MeetingCard, { ParticipantAvatar } from './MeetingCard';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatMeetingDateTime } from '@/lib/utils';
import { memberAvatarUrl } from '@/lib/participant-avatar';
import { isEmailInvited } from '@/lib/invite';
import { useUser } from '@clerk/nextjs';

type RecordingWithCall = {
  call: Call;
  recording: CallRecording;
};

const CallList = ({ type }: { type: 'ended' | 'upcoming' | 'recordings' }) => {
  const router = useRouter();
  const { user } = useUser();
  const { endedCalls, upcomingCalls, callRecordings, isLoading } =
    useGetCalls();
  const [recordingsWithCall, setRecordingsWithCall] = useState<RecordingWithCall[]>([]);
  // callId → real member avatars (fetched from Stream)
  const [memberAvatars, setMemberAvatars] = useState<Record<string, ParticipantAvatar[]>>({});

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

  // Fetch member avatars for Upcoming/Ended calls
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

    const load = async () => {
      const result: Record<string, ParticipantAvatar[]> = {};

      await Promise.all(
        targetCalls.map(async (call) => {
          try {
            const { members } = await call.queryMembers({ limit: 12 });
            if (cancelled) return;
            result[call.id] = members.map((m) => ({
              src: memberAvatarUrl(m.user?.image, m.user?.name || m.user_id),
              alt: m.user?.name || m.user_id,
            }));
          } catch {
            if (!cancelled) result[call.id] = [];
          }
        }),
      );

      if (!cancelled) setMemberAvatars(result);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [type, callIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch recordings
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
    return isEmailInvited(searchStr, email);
  };

  return (
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
              participantAvatars={memberAvatars[meeting.id]}
              invitedBadge={type === 'upcoming' ? showInvitedBadge(meeting) : false}
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
  );
};

export default CallList;
