"use client";
import React, { useState, useEffect, useCallback } from 'react';
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
import { useGetCalls } from '@/hooks/useGetCalls';
import {
  useVerifyEmails,
  useDebounce,
} from '@/hooks/useVerifyEmails';
import { VerifyUserResult } from '@/actions/verify-clerk-user';
import { Loader2, Check, X, User, Plus, Trash2 } from 'lucide-react';
import Image from 'next/image';

registerLocale('vi', vi);

const DEBOUNCE_MS = 500;

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

  // Email verification state
  const [emailInput, setEmailInput] = useState('');
  const [addedEmails, setAddedEmails] = useState<string[]>([]);
  const { verifyEmail, getStatus, getUserInfo, clearVerification, removeEmail, verifiedEmails, isChecking } = useVerifyEmails();
  const debouncedEmailInput = useDebounce(emailInput, DEBOUNCE_MS);

  // Debounce email verification
  useEffect(() => {
    if (debouncedEmailInput && debouncedEmailInput.includes('@')) {
      const email = debouncedEmailInput.trim().toLowerCase();
      if (email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) && !addedEmails.includes(email)) {
        verifyEmail(email);
      }
    }
  }, [debouncedEmailInput, verifyEmail, addedEmails]);

  // Clean up verification when modal closes
  useEffect(() => {
    if (meetingState !== 'isScheduleMeeting') {
      clearVerification();
      setAddedEmails([]);
      setEmailInput('');
    }
  }, [meetingState, clearVerification]);

  const handleAddEmail = () => {
    const email = emailInput.trim().toLowerCase();
    if (email && email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) && !addedEmails.includes(email)) {
      setAddedEmails([...addedEmails, email]);
      setEmailInput('');
      verifyEmail(email);
    }
  };

  const handleRemoveEmail = (email: string) => {
    setAddedEmails(addedEmails.filter(e => e !== email));
    removeEmail(email);
  };

  const handleEmailKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddEmail();
    }
  };

  // Get all emails that have been verified as valid
  const getValidEmails = useCallback((): string[] => {
    return addedEmails.filter(email => {
      const status = getStatus(email);
      return status === 'valid';
    });
  }, [addedEmails, getStatus]);

  // Get any invalid emails that user tried to add
  const getInvalidEmails = useCallback((): string[] => {
    return addedEmails.filter(email => {
      const status = getStatus(email);
      return status === 'invalid' || status === 'error';
    });
  }, [addedEmails, getStatus]);

  const [callDetail, setCallDetail] = useState<Call>();
  const [scheduledAvatars, setScheduledAvatars] = useState<
    { src: string; alt: string }[]
  >([]);

  const { toast } = useToast();

  // Lấy forceRefetch để cập nhật danh sách cuộc họp sau khi tạo mới
  const { forceRefetch } = useGetCalls();

  // ── Scheduled ────────────────────────────────────────────────
  const createScheduledMeeting = async () => {
    if (!isReady || !user) {
      console.log('⛔ Block create scheduled meeting: not ready');
      toast({ title: 'Đang kết nối, vui lòng chờ...' });
      return;
    }

    // Validate emails before creating meeting
    const validEmails = getValidEmails();
    const invalidEmails = getInvalidEmails();

    if (addedEmails.length > 0 && invalidEmails.length > 0) {
      toast({
        title: 'Không thể tạo cuộc họp',
        description: `Email không hợp lệ: ${invalidEmails.join(', ')}. Chỉ những user có tài khoản mới có thể được mời.`,
        variant: 'destructive',
      });
      return;
    }

    try {
      if (!values.dateTime) {
        toast({ title: 'Vui lòng chọn ngày và giờ' });
        return;
      }

      const id = crypto.randomUUID();
      const call = client!.call('default', id);
      if (!call) throw new Error('Failed to create meeting');

      const meetingName = values.meetingName.trim() || 'Cuộc họp đã lên lịch';
      const startsAt = values.dateTime.toISOString();

      // Use only verified emails for invitations
      const invited = validEmails.map(e => e.toLowerCase().trim());
      const invitedEmailsStr = buildInvitedEmailsStr(invited);

      // Thêm người tạo vào members để hiển thị trong "Cuộc họp sắp tới"
      // Chỉ thêm host - không thêm invited emails vì họ chưa có tài khoản Stream
      const allMembers = [
        { user_id: user.id },
      ];

      await call.getOrCreate({
        data: {
          starts_at: startsAt,
          members: allMembers,
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
            hostAvatar: user.imageUrl || undefined,
          });
        }
      }

      // Refresh danh sách cuộc họp trước khi chuyển trang
      await forceRefetch();

      setCallDetail(call);

      const avatars = await fetchScheduledCallAvatars(call);
      setScheduledAvatars(avatars);

      const link = `${process.env.NEXT_PUBLIC_BASE_URL}/meeting/${call.id}`;
      console.log('[invite] Scheduled notifications sent to:', invited, 'link:', link);

      if (!values.meetingName.trim()) {
        // Small delay to allow the backend to index the new call
        await new Promise(resolve => setTimeout(resolve, 300));
        router.push(`/meeting/${call.id}`);
      }

      toast({ title: 'Đã tạo cuộc họp' });
    } catch (error) {
      console.error(error);
      toast({ title: 'Lỗi khi tạo cuộc họp' });
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
          members: [{ user_id: user.id }],
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
      toast({ title: 'Lỗi khi tạo cuộc họp' });
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
          buttonText={isChecking ? 'Đang xác minh...' : undefined}
          disabled={isChecking || (addedEmails.length > 0 && getInvalidEmails().length > 0)}
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

          {/* Email invitation section with verification */}
          <div className="flex flex-col gap-2.5">
            <label className="text-base leading-[22px] text-sky-2">
              Mời người tham gia
            </label>

            {/* Email input with add button */}
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="Nhập email và nhấn Enter"
                className="border-none bg-dark-3 focus-visible:ring-0 focus-visible:ring-offset-0"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={handleEmailKeyDown}
              />
              <button
                type="button"
                onClick={handleAddEmail}
                disabled={!emailInput || !emailInput.includes('@')}
                className="flex items-center gap-1 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Thêm
              </button>
            </div>

            {/* Email verification preview */}
            {debouncedEmailInput && debouncedEmailInput.includes('@') && debouncedEmailInput.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) && !addedEmails.includes(debouncedEmailInput.toLowerCase()) && (
              <div className={`flex items-center gap-3 rounded-lg border p-3 ${
                getStatus(debouncedEmailInput.toLowerCase()) === 'valid' ? 'border-green-500 bg-green-500/10' :
                getStatus(debouncedEmailInput.toLowerCase()) === 'invalid' ? 'border-red-500 bg-red-500/10' :
                getStatus(debouncedEmailInput.toLowerCase()) === 'checking' ? 'border-blue-500 bg-blue-500/10' :
                'border-gray-500 bg-dark-3'
              }`}>
                {getStatus(debouncedEmailInput.toLowerCase()) === 'checking' && (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                    <div className="flex flex-col">
                      <span className="text-sm text-gray-300">{debouncedEmailInput}</span>
                      <span className="text-xs text-gray-400">Đang kiểm tra...</span>
                    </div>
                  </>
                )}
                {getStatus(debouncedEmailInput.toLowerCase()) === 'valid' && (
                  <>
                    {getUserInfo(debouncedEmailInput.toLowerCase())?.imageUrl ? (
                      <Image
                        src={getUserInfo(debouncedEmailInput.toLowerCase())!.imageUrl!}
                        alt="Avatar"
                        width={36}
                        height={36}
                        className="rounded-full"
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-600">
                        <User className="h-5 w-5 text-white" />
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-green-500">
                        {getUserInfo(debouncedEmailInput.toLowerCase())?.fullName || 'User'}
                      </span>
                      <span className="text-xs text-gray-400">{debouncedEmailInput}</span>
                    </div>
                    <Check className="ml-auto h-5 w-5 text-green-500" />
                  </>
                )}
                {getStatus(debouncedEmailInput.toLowerCase()) === 'invalid' && (
                  <>
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600">
                      <X className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-red-500">Không tìm thấy</span>
                      <span className="text-xs text-gray-400">Người dùng chưa có tài khoản</span>
                    </div>
                    <X className="ml-auto h-5 w-5 text-red-500" />
                  </>
                )}
              </div>
            )}

            {/* Added emails list */}
            {addedEmails.length > 0 && (
              <div className="mt-2 flex flex-col gap-2">
                <span className="text-sm text-sky-2">
                  Đã mời ({addedEmails.length})
                </span>
                <div className="flex flex-col gap-1">
                  {addedEmails.map((email) => {
                    const status = getStatus(email);
                    const userInfo = getUserInfo(email);
                    return (
                      <div
                        key={email}
                        className={`flex items-center gap-3 rounded-lg border p-2 ${
                          status === 'valid' ? 'border-green-500/50 bg-green-500/5' :
                          status === 'invalid' ? 'border-red-500/50 bg-red-500/5' :
                          status === 'checking' ? 'border-blue-500/50 bg-blue-500/5' :
                          'border-gray-500/50 bg-dark-3'
                        }`}
                      >
                        {status === 'checking' && (
                          <>
                            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                            <span className="text-sm text-gray-300">{email}</span>
                          </>
                        )}
                        {status === 'valid' && (
                          <>
                            {userInfo?.imageUrl ? (
                              <Image
                                src={userInfo.imageUrl}
                                alt={userInfo.fullName || email}
                                width={32}
                                height={32}
                                className="rounded-full"
                              />
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-600">
                                <User className="h-4 w-4 text-white" />
                              </div>
                            )}
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-white">
                                {userInfo?.fullName || 'User'}
                              </span>
                              <span className="text-xs text-gray-400">{email}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveEmail(email)}
                              className="ml-auto rounded p-1 text-gray-400 hover:bg-red-500/20 hover:text-red-400"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        {status === 'invalid' && (
                          <>
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-600">
                              <X className="h-4 w-4 text-white" />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm text-red-400">{email}</span>
                              <span className="text-xs text-red-400/70">Không tìm thấy user</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveEmail(email)}
                              className="ml-auto rounded p-1 text-gray-400 hover:bg-red-500/20 hover:text-red-400"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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
            toast({ title: 'Đã sao chép liên kết cuộc họp' });
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
        buttonText="Tham gia"
        handleClick={() => router.push(values.link)}
      >
        <Input
          placeholder="Dán liên kết cuộc họp vào đây"
          onChange={(e) => setValues({ ...values, link: e.target.value })}
          className="border-none bg-dark-3 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </MeetingModal>
    </section>
  );
};

export default MeetingTypeList;
