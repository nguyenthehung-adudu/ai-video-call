"use client";
import React, { useState } from 'react';
import HomeCard from './HomeCard';
import { useRouter } from 'next/navigation';
import MeetingModal from './MeetingModal';
import { useUser } from '@clerk/nextjs';
import { useStreamVideoClient } from '@stream-io/video-react-sdk';
import { Call } from '@stream-io/video-react-sdk';
import { useToast } from '@/components/ui/use-toast';
import ReactDatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { registerLocale } from 'react-datepicker';
import { vi } from 'date-fns/locale/vi';
import { Input } from './ui/input';
import { buildInvitedEmailsStr, parseEmailList } from '@/lib/invite';
import { memberAvatarUrl } from '@/lib/participant-avatar';
import { useStreamVideoReady } from '@/providers/StreamVideoProvider';

registerLocale('vi', vi);

// 👤 Real avatar helper via queryMembers on the scheduled call
async function fetchScheduledCallAvatars(call: Call) {
  try {
    const { members } = await call.queryMembers({ limit: 12 });
    return members.map((m) => ({
      src: memberAvatarUrl(m.user?.image, m.user?.name || m.user_id),
      alt: m.user?.name || m.user_id,
    }));
  } catch {
    return [];
  }
}

const MeetingTypeList = () => {
  const router = useRouter();

  const [meetingState, setMeetingState] = useState<
    'isScheduleMeeting' | 'isJoiningMeeting' | 'isInstantMeeting' | undefined
  >(undefined);

  const { user } = useUser();
  const { client, isReady } = useStreamVideoReady();

  const [values, setValues] = useState({
    dateTime: new Date(),
    meetingName: '',
    invitedEmails: '',
    link: '',
  });

  const [callDetail, setCallDetail] = useState<Call>();
  const [scheduledAvatars, setScheduledAvatars] = useState<
    { src: string; alt: string }[]
  >([]);

  const { toast } = useToast();

  // ── Scheduled ────────────────────────────────────────────────
  const createScheduledMeeting = async () => {
    if (!isReady || !user) {
      console.log('⛔ Block create scheduled meeting: not ready');
      toast({ title: 'Đang kết nối, vui lòng chờ...' });
      return;
    }

    try {
      if (!values.dateTime) {
        toast({ title: 'Please select a date and time' });
        return;
      }

      const id = crypto.randomUUID();
      const call = client!.call('default', id);
      if (!call) throw new Error('Failed to create meeting');

      const meetingName = values.meetingName.trim() || 'Cuộc họp đã lên lịch';
      const startsAt = values.dateTime.toISOString();

      const invited = parseEmailList(values.invitedEmails);
      const invitedEmailsStr = buildInvitedEmailsStr(invited);

      await call.getOrCreate({
        data: {
          starts_at: startsAt,
          custom: {
            description: meetingName,
            invitedEmails: invited,
            invitedEmailsStr,
          },
        },
      });

      // Also upsert chat channel so invited users can access the channel
      const allIds = [user.id]; // TODO: resolve email → userId for real notifications
      const { ensureMeetingChatChannel } = await import('@/actions/stream.actions');
      await ensureMeetingChatChannel(call.id, allIds);

      // Send invitations to all invited emails
      if (invited.length > 0) {
        const { sendMeetingInvitation } = await import('@/actions/invite.actions');
        for (const inviteeEmail of invited) {
          await sendMeetingInvitation(call.id, inviteeEmail, {
            type: 'scheduled',
            scheduledAt: values.dateTime,
            meetingName,
            hostId: user.id,
            hostName: user.fullName || user.primaryEmailAddress?.emailAddress || 'Người tổ chức',
          });
        }
      }

      setCallDetail(call);

      const avatars = await fetchScheduledCallAvatars(call);
      setScheduledAvatars(avatars);

      const link = `${process.env.NEXT_PUBLIC_BASE_URL}/meeting/${call.id}`;
      console.log('[invite] Scheduled notifications sent to:', invited, 'link:', link);

      if (!values.meetingName.trim()) {
        router.push(`/meeting/${call.id}`);
      }

      toast({ title: 'Meeting Created' });
    } catch (error) {
      console.error(error);
      toast({ title: 'Error creating meeting' });
    }
  };

  // ── Instant ────────────────────────────────────────────────
  const createInstantMeeting = async () => {
    console.log('🚀 [MeetingTypeList] createInstantMeeting called:', {
      isReady,
      hasClient: !!client,
      hasUser: !!user,
      userId: user?.id,
    });

    // FIX: Block if not ready
    if (!isReady || !user) {
      console.log('⛔ [MeetingTypeList] Cannot create meeting: not ready');
      toast({ title: 'Đang kết nối, vui lòng chờ...' });
      return;
    }

    try {
      const id = crypto.randomUUID();
      console.log('📞 [MeetingTypeList] Creating call:', id);

      const call = client!.call('default', id);
      if (!call) {
        console.error('❌ [MeetingTypeList] Failed to create call object');
        throw new Error('Failed to create meeting');
      }

      const meetingName = values.meetingName.trim() || 'Cuộc họp nhanh';

      console.log('📞 [MeetingTypeList] Calling getOrCreate...');
      await call.getOrCreate({
        data: {
          starts_at: new Date().toISOString(),
          custom: {
            description: meetingName,
          },
        },
      });

      console.log('✅ [MeetingTypeList] Meeting created:', call.id);
      router.push(`/meeting/${call.id}`);
      toast({ title: 'Đang vào phòng…' });
      setMeetingState(undefined);
    } catch (error) {
      console.error('❌ [MeetingTypeList] Error:', error);
      toast({ title: 'Error creating meeting' });
    }
  };

  // Client is ready if isReady from provider is true (checks client.user.id)
  const isClientReady = isReady && !!user;

  const meetingLink = `${process.env.NEXT_PUBLIC_BASE_URL}/meeting/${callDetail?.id}`;

  return (
    <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
      <HomeCard
        img="/icons/add-meeting.svg"
        title="Tạo cuộc họp mới"
        description="Bắt đầu cuộc họp ngay"
        handleClick={() => setMeetingState('isInstantMeeting')}
        className="bg-orange-1"
      />
      <HomeCard
        img="/icons/join-meeting.svg"
        title="Tham gia cuộc họp"
        description="Tham gia bằng liên kết mời"
        handleClick={() => setMeetingState('isJoiningMeeting')}
        className="bg-blue-1"
      />
      <HomeCard
        img="/icons/schedule.svg"
        title="Lên lịch cuộc họp"
        description="Đặt lịch cho cuộc họp"
        handleClick={() => setMeetingState('isScheduleMeeting')}
        className="bg-purple-1"
      />
      <HomeCard
        img="/icons/recordings.svg"
        title="Xem bản ghi"
        description="Xem lại các cuộc họp"
        handleClick={() => router.push('/recordings')}
        className="bg-yellow-1"
      />

      {/* ── Schedule modal ── */}
      {!callDetail ? (
        <MeetingModal
          isOpen={meetingState === 'isScheduleMeeting'}
          onClose={() => setMeetingState(undefined)}
          title="Lên lịch cuộc họp"
          handleClick={createScheduledMeeting}
        >
          <div className="flex flex-col gap-2.5">
            <label className="text-base leading-[22px] text-sky-2">
              Tên cuộc họp
            </label>
            <Input
              placeholder="Ví dụ: Họp team, Review sprint…"
              className="border-none bg-dark-3 focus-visible:ring-0 focus-visible:ring-offset-0"
              value={values.meetingName}
              onChange={(e) =>
                setValues({ ...values, meetingName: e.target.value })
              }
            />
          </div>
          <div className="flex flex-col gap-2.5">
            <label className="text-base leading-[22px] text-sky-2">
              Mời qua email (cách nhau bởi dấu phẩy)
            </label>
            <Input
              placeholder="email1@domain.com, email2@domain.com"
              className="border-none bg-dark-3 focus-visible:ring-0 focus-visible:ring-offset-0"
              value={values.invitedEmails}
              onChange={(e) =>
                setValues({ ...values, invitedEmails: e.target.value })
              }
            />
          </div>
          <div className="flex w-full flex-col gap-2.5">
            <label className="text-base leading-[22px] text-sky-2">
              Chọn ngày và giờ
            </label>
            <ReactDatePicker
              selected={values.dateTime}
              onChange={(date: Date | null) =>
                setValues({ ...values, dateTime: date || new Date() })
              }
              locale="vi"
              showTimeSelect
              timeFormat="HH:mm"
              timeIntervals={15}
              timeCaption="Giờ"
              dateFormat="dd/MM/yyyy HH:mm"
              className="w-full rounded bg-dark-3 p-2 focus:outline-none"
            />
          </div>
        </MeetingModal>
      ) : (
        <MeetingModal
          isOpen={meetingState === 'isScheduleMeeting'}
          onClose={() => setMeetingState(undefined)}
          title="Cuộc họp đã được lên lịch"
          handleClick={() => {
            void navigator.clipboard.writeText(meetingLink);
            toast({ title: 'Meeting link copied to clipboard' });
          }}
          image="/icons/schedule.svg"
          buttonIcon="/icons/copy.svg"
          buttonText="Sao chép liên kết"
        />
      )}

      {/* ── Instant modal ── */}
      <MeetingModal
        isOpen={meetingState === 'isInstantMeeting'}
        onClose={() => setMeetingState(undefined)}
        title="Tạo cuộc họp ngay"
        className="text-center"
        buttonText={isClientReady ? "Tạo phòng họp" : "Đang kết nối..."}
        handleClick={createInstantMeeting}
        disabled={!isClientReady}
      >
        <div className="flex flex-col gap-2.5 text-left">
          <label className="text-base leading-[22px] text-sky-2">
            Tên phòng
          </label>
          <Input
            placeholder="Nhập tên cuộc họp"
            className="border-none bg-dark-3 focus-visible:ring-0 focus-visible:ring-offset-0"
            value={values.meetingName}
            onChange={(e) =>
              setValues({ ...values, meetingName: e.target.value })
            }
          />
        </div>
      </MeetingModal>

      {/* ── Join modal ── */}
      <MeetingModal
        isOpen={meetingState === 'isJoiningMeeting'}
        onClose={() => setMeetingState(undefined)}
        title="Tham gia cuộc họp"
        className="text-center"
        buttonText="Join Meeting"
        handleClick={() => router.push(values.link)}
      >
        <Input
          placeholder="Paste meeting link here"
          onChange={(e) => setValues({ ...values, link: e.target.value })}
          className="border-none bg-dark-3 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </MeetingModal>
    </section>
  );
};

export default MeetingTypeList;
