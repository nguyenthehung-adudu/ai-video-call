"use client";

import React, { useState, useCallback, memo, useEffect, useRef } from "react";
import {
  CallControls,
  CallingState,
  CallParticipantsList,
  CallStatsButton,
  PaginatedGridLayout,
  SpeakerLayout,
  useCallStateHooks,
} from "@stream-io/video-react-sdk";

import { Users, LayoutList, MessageSquare, Link2, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter, useSearchParams } from 'next/navigation';

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

import EndCallButton from "./EndCallButton";
import Loader from "./Loader";
import MeetingChat from "./MeetingChat";
type CallLayoutType = "grid" | "speaker-left" | "speaker-right";

// ── Memoized layout switcher ──────────────────────────────────────────────
const CallLayoutSwitcher = memo(({ layout }: { layout: CallLayoutType }) => {
  switch (layout) {
    case "grid":
      return <PaginatedGridLayout />;
    case "speaker-right":
      return <SpeakerLayout participantsBarPosition="left" />;
    default:
      return <SpeakerLayout participantsBarPosition="right" />;
  }
});
CallLayoutSwitcher.displayName = "CallLayoutSwitcher";

// ── Memoized layout dropdown items ───────────────────────────────────────
const LAYOUT_OPTIONS: { label: string; value: CallLayoutType }[] = [
  { label: "Grid", value: "grid" },
  { label: "Speaker-Left", value: "speaker-left" },
  { label: "Speaker-Right", value: "speaker-right" },
];

// ── Main component ────────────────────────────────────────────────────────
const MeetingRoom = memo(({ meetingId }: { meetingId: string }) => {
  // Render counter
  const renderCountRef = useRef(0);
  renderCountRef.current++;

  // Track mount/unmount
  useEffect(() => {
    console.log('🟢 [MeetingRoom] Mounted');
    return () => console.log('💀 [MeetingRoom] Unmounted');
  }, []);

  const searchParams = useSearchParams();
  const isPersonalRoom = !!searchParams.get("personal");

  const [layout, setLayout] = useState<CallLayoutType>("speaker-left");
  const [showParticipants, setShowParticipants] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState<{
    show: boolean;
    success: boolean;
    message: string;
  }>({ show: false, success: false, message: '' });

  const { useCallCallingState } = useCallStateHooks();
  const callingState = useCallCallingState();

  // Redirect when call ends (by host or any other reason)
  useEffect(() => {
    if (callingState === CallingState.LEFT || callingState === CallingState.RECONNECTING) {
      console.log('🚪 [MeetingRoom] Call ended/left, redirecting to home');
      window.location.href = '/';
    }
  }, [callingState]);

  // Debug render logging
  console.log('🏠 [MeetingRoom] Render:', {
    renderCount: renderCountRef.current,
    meetingId,
    showChat,
    callingState,
    isPersonalRoom,
  });

  // Debug: Track callingState changes
  const prevCallingStateRef = useRef(callingState);
  if (prevCallingStateRef.current !== callingState) {
    console.log('⚠️ [MeetingRoom] callingState changed:', {
      from: prevCallingStateRef.current,
      to: callingState,
    });
  }
  prevCallingStateRef.current = callingState;

  // Debug: Log conditional return reason
  const showLoader = callingState !== CallingState.JOINED;
  if (showLoader) {
    console.log('⚠️ [MeetingRoom] Showing Loader because:', {
      callingState,
      expected: CallingState.JOINED,
    });
  }

  // Stable callbacks — prevent child re-renders
  const handleToggleParticipants = useCallback(
    () => setShowParticipants((p) => !p),
    [],
  );
  const handleToggleChat = useCallback(() => {
    console.log('💬 [MeetingRoom] Toggle chat');
    setShowChat((p) => !p);
  }, []);
  const handleCloseChat = useCallback(() => {
    console.log('💬 [MeetingRoom] Close chat');
    setShowChat(false);
  }, []);
  const handleSetLayout = useCallback(
    (l: CallLayoutType) => setLayout(l),
    [],
  );
  const handleCopyLink = useCallback(() => {
    const link = window.location.href;
    navigator.clipboard.writeText(link);
    alert("Đã sao chép liên kết phòng!");
  }, []);
  const handleInviteEmail = useCallback(async () => {
    console.log('🔔 [MeetingRoom] handleInviteEmail được gọi!');
    console.log('🔔 [MeetingRoom] inviteEmail:', inviteEmail);
    console.log('🔔 [MeetingRoom] meetingId:', meetingId);
    
    const email = inviteEmail.trim();
    if (!email) {
      console.log('🔔 [MeetingRoom] Lỗi: Email trống');
      setInviteStatus({ show: true, success: false, message: 'Vui lòng nhập email' });
      setTimeout(() => setInviteStatus((s) => ({ ...s, show: false })), 3000);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.log('🔔 [MeetingRoom] Lỗi: Email không hợp lệ');
      setInviteStatus({ show: true, success: false, message: 'Email không hợp lệ' });
      setTimeout(() => setInviteStatus((s) => ({ ...s, show: false })), 3000);
      return;
    }

    console.log('🔔 [MeetingRoom] Đang gọi sendMeetingInvitation...');
    // Call server action to save invitation
    const { sendMeetingInvitation } = await import('@/actions/invite.actions');
    const result = await sendMeetingInvitation(meetingId, email, { type: 'instant' });
    console.log('🔔 [MeetingRoom] Kết quả từ server:', result);

    if (result.success) {
      console.log('🔔 [MeetingRoom] Thành công!');
      setInviteStatus({ show: true, success: true, message: result.message });
      setInviteEmail('');
      setTimeout(() => {
        setInviteStatus((s) => ({ ...s, show: false }));
        setShowInvite(false);
      }, 2000);
    } else {
      console.log('🔔 [MeetingRoom] Thất bại:', result.message);
      setInviteStatus({ show: true, success: false, message: result.message });
      setTimeout(() => setInviteStatus((s) => ({ ...s, show: false })), 3000);
    }
  }, [inviteEmail, meetingId]);

  if (callingState !== CallingState.JOINED) return <Loader />;

  return (
    <div className="relative h-screen w-full text-white">
      {/* ── Video ─────────────────────────────────────────────── */}
      <section className="relative h-full w-full overflow-hidden pt-4">
        <div className="relative flex size-full items-center justify-center">
          <div className="flex size-full max-w-[1000px] items-center">
            <CallLayoutSwitcher layout={layout} />
          </div>

          <div
            className={cn(
              "h-[calc(100vh-86px)] hidden ml-2",
              showParticipants && "block",
            )}
          >
            <CallParticipantsList onClose={handleToggleParticipants} />
          </div>
        </div>

        {/* ── Controls ────────────────────────────────────────── */}
        <div className="fixed bottom-0 left-0 w-full flex justify-center z-30">
          <div className="flex items-center gap-5 flex-wrap">
            <CallControls />

            {/* Layout */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-2xl bg-[#19232d] px-4 py-2">
                  <LayoutList size={20} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-dark-1 text-white">
                {LAYOUT_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => handleSetLayout(opt.value)}
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <CallStatsButton />

            {/* Participants */}
            <button onClick={handleToggleParticipants}>
              <div className="rounded-2xl bg-[#19232d] px-4 py-2">
                <Users size={20} />
              </div>
            </button>

            {/* Chat toggle */}
            <button onClick={handleToggleChat}>
              <div className="rounded-2xl bg-[#19232d] px-4 py-2">
                <MessageSquare size={20} />
              </div>
            </button>

            {/* Copy Link */}
            <button onClick={handleCopyLink} title="Sao chép liên kết phòng">
              <div className="rounded-2xl bg-[#19232d] px-4 py-2">
                <Link2 size={20} />
              </div>
            </button>

            {/* Invite */}
            <button onClick={() => setShowInvite(true)} title="Mời người tham gia">
              <div className="rounded-2xl bg-[#19232d] px-4 py-2">
                <Mail size={20} />
              </div>
            </button>

            {!isPersonalRoom && <EndCallButton />}
          </div>
        </div>
      </section>

      {/* ── Chat overlay ──────────────────────────────────────── */}
      {showChat && (
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={handleCloseChat}
        />
      )}

      {/* ── Chat panel — ALWAYS RENDER (use hidden instead) ───────── */}
      <div
        className={cn(
          "fixed right-0 top-0 h-full w-[380px] z-50 border-l border-dark-3 transition-transform duration-300",
          showChat ? "translate-x-0" : "translate-x-full",
        )}
      >
        <MeetingChat
          meetingId={meetingId}
          onClose={handleCloseChat}
        />
      </div>

      {/* ── Invite Modal ────────────────────────────────────── */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-dark-1 rounded-xl p-6 w-full max-w-md border border-dark-3">
            <h3 className="text-lg font-semibold text-white mb-4">Mời người tham gia</h3>

            <div className="flex gap-2 mb-4">
              <input
                type="email"
                placeholder="Nhập email để mời..."
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInviteEmail()}
                className="flex-1 bg-dark-3 text-white rounded-lg px-4 py-2 placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleInviteEmail}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                <Mail size={16} />
                <span>Gửi</span>
              </button>
            </div>

            <button
              onClick={() => {
                setShowInvite(false);
                setInviteEmail('');
              }}
              className="w-full text-center text-white/60 hover:text-white text-sm py-2"
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* ── Toast Notification ───────────────────────────────────── */}
      {inviteStatus.show && (
        <div
          className={cn(
            "fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-lg shadow-xl flex items-center gap-3 animate-in slide-in-from-top",
            inviteStatus.success
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          )}
        >
          {inviteStatus.success ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          <span className="font-medium">{inviteStatus.message}</span>
        </div>
      )}
    </div>
  );
});

MeetingRoom.displayName = "MeetingRoom";

export default MeetingRoom;