"use client";

import React, { useState, useCallback, memo, useEffect, useRef, useMemo } from "react";
import {
  CallControls,
  CallingState,
  CallParticipantsList,
  CallStatsButton,
  PaginatedGridLayout,
  SpeakerLayout,
  useCallStateHooks,
  useCall,
} from "@stream-io/video-react-sdk";

import { Users, LayoutList, MessageSquare, Link2, Mail, Languages, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

import EndCallButton from "./EndCallButton";
import Loader from "./Loader";
import MeetingChat from "./MeetingChat";
import SubtitlePanel from "./SubtitlePanel";
import type { TranscriptEntry } from "@/hooks/useWhisperRecorder";
import { useWhisperRecorder } from "@/hooks/useWhisperRecorder";

type CallLayoutType = "grid" | "speaker-left" | "speaker-right";

// ── Memoized layout options (define before component) ───────────────────
const LAYOUT_OPTIONS: { label: string; value: CallLayoutType }[] = [
  { label: "Grid", value: "grid" },
  { label: "Speaker-Left", value: "speaker-left" },
  { label: "Speaker-Right", value: "speaker-right" },
];

// ── Memoized layout switcher ──────────────────────────────────────────────
const CallLayoutSwitcher = memo(({ layout }: { layout: CallLayoutType }) => {
  return (
    <>
      {layout === "grid" && <PaginatedGridLayout />}
      {layout === "speaker-right" && <SpeakerLayout participantsBarPosition="left" />}
      {layout === "speaker-left" && <SpeakerLayout participantsBarPosition="right" />}
    </>
  );
});
CallLayoutSwitcher.displayName = "CallLayoutSwitcher";

// ── Memoized SubtitlePanel ───────────────────────────────────────────────
const MemoizedSubtitlePanel = memo(({ 
  transcripts, 
  onClose 
}: { 
  transcripts: TranscriptEntry[]; 
  onClose: () => void; 
}) => (
  <SubtitlePanel transcripts={transcripts} onClose={onClose} />
));
MemoizedSubtitlePanel.displayName = "MemoizedSubtitlePanel";

// ── Memoized MeetingChat ────────────────────────────────────────────────
const MemoizedMeetingChat = memo(({ 
  meetingId, 
  onClose 
}: { 
  meetingId: string; 
  onClose: () => void; 
}) => (
  <MeetingChat meetingId={meetingId} onClose={onClose} />
));
MemoizedMeetingChat.displayName = "MemoizedMeetingChat";

// ── Main component ────────────────────────────────────────────────────────
const MeetingRoom = ({ meetingId }: { meetingId: string }) => {
  // ── Call state hooks ─────────────────────────────────────────────────
  const { useCallCallingState } = useCallStateHooks();
  const { useLocalParticipant } = useCallStateHooks();
  
  const callingState = useCallCallingState();
  const localParticipant = useLocalParticipant();
  const call = useCall();

  // ── Stable memoized values ─────────────────────────────────────────────
  const currentUserId = useMemo(() => localParticipant?.userId || "", [localParticipant?.userId]);
  const currentUserName = useMemo(() => localParticipant?.name || "You", [localParticipant?.name]);

  // ── UI State ───────────────────────────────────────────────────────────
  const [layout, setLayout] = useState<CallLayoutType>("speaker-left");
  const [showParticipants, setShowParticipants] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState<{
    show: boolean;
    success: boolean;
    message: string;
  }>({ show: false, success: false, message: '' });

  // ── Mic warning toast ────────────────────────────────────────────────
  const [micWarning, setMicWarning] = useState(false);

  // ── AI Whisper Recorder (chỉ khởi tạo khi có call) ───────────────────
  const {
    status: recorderStatus,
    transcripts: allTranscripts,
    startRecording,
    stopRecording,
    isRecording,
    canRecord,
  } = useWhisperRecorder({
    chunkIntervalMs: 2000,      // ~2 seconds per chunk for stable realtime
    maxBufferSeconds: 15,       // Buffer up to 15s
    maxTranscripts: 30,
    onTranscript: useCallback((entry: TranscriptEntry) => {
      console.log("[MeetingRoom] onTranscript callback - New entry:", entry.text, "| Total transcripts:", allTranscripts.length + 1);
    }, []),
    onError: useCallback((error: string) => {
      console.error("❌ [Whisper] Recorder error:", error);
    }, []),
  });

  // ── Auto-show subtitles when first transcript arrives ─────────────────
  useEffect(() => {
    console.log("[MeetingRoom] Transcripts count:", allTranscripts.length, "showSubtitles:", showSubtitles);
    console.log("[MeetingRoom] Transcripts data:", allTranscripts.map(t => ({ text: t.text, userId: t.userId, isFinal: t.isFinal })));
    if (allTranscripts.length > 0 && !showSubtitles) {
      console.log("[MeetingRoom] Auto-showing subtitles panel");
      setShowSubtitles(true);
    }
  }, [allTranscripts.length, showSubtitles, allTranscripts]);

  // ── Stable callbacks (empty deps) ─────────────────────────────────────
  const handleToggleParticipants = useCallback(() => {
    setShowParticipants((p) => !p);
  }, []);

  const handleToggleChat = useCallback(() => {
    setShowChat((p) => !p);
  }, []);

  const handleCloseChat = useCallback(() => {
    setShowChat(false);
  }, []);

  const handleToggleSubtitles = useCallback(() => {
    setShowSubtitles((p) => !p);
  }, []);

  const handleCloseSubtitles = useCallback(() => {
    setShowSubtitles(false);
  }, []);

  const handleSetLayout = useCallback((l: CallLayoutType) => {
    setLayout(l);
  }, []);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
  }, []);

  const handleInviteEmail = useCallback(async () => {
    const email = inviteEmail.trim();
    if (!email) {
      setInviteStatus({ show: true, success: false, message: 'Vui lòng nhập email' });
      setTimeout(() => setInviteStatus((s) => ({ ...s, show: false })), 3000);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInviteStatus({ show: true, success: false, message: 'Email không hợp lệ' });
      setTimeout(() => setInviteStatus((s) => ({ ...s, show: false })), 3000);
      return;
    }

    const { sendMeetingInvitation } = await import('@/actions/invite.actions');
    const result = await sendMeetingInvitation(meetingId, email, { type: 'instant' });

    if (result.success) {
      setInviteStatus({ show: true, success: true, message: result.message });
      setInviteEmail('');
      setTimeout(() => {
        setInviteStatus((s) => ({ ...s, show: false }));
        setShowInvite(false);
      }, 2000);
    } else {
      setInviteStatus({ show: true, success: false, message: result.message });
      setTimeout(() => setInviteStatus((s) => ({ ...s, show: false })), 3000);
    }
  }, [inviteEmail, meetingId]);

  // ── AI button handler ─────────────────────────────────────────────────
  const handleAIToggle = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      if (!canRecord) {
        setMicWarning(true);
        setTimeout(() => setMicWarning(false), 3000);
        return;
      }
      startRecording();
    }
  }, [isRecording, canRecord, startRecording, stopRecording]);

  // ── Redirect when call ends ────────────────────────────────────────────
  useEffect(() => {
    if (callingState === CallingState.LEFT || callingState === CallingState.RECONNECTING) {
      if (recorderStatus === "recording") {
        stopRecording();
      }
      window.location.href = '/';
    }
  }, [callingState, recorderStatus, stopRecording]);

  // ── Early return: show loader if not joined ────────────────────────────
  if (callingState !== CallingState.JOINED) {
    return <Loader />;
  }

  return (
    <div className="relative h-screen w-full text-white">
      {/* ── Video ─────────────────────────────────────────────── */}
      <section
        className="relative h-full w-full overflow-hidden pt-4"
        style={{ paddingLeft: showSubtitles ? '380px' : '0' }}
      >
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
        <div className="fixed bottom-0 left-0 w-full flex justify-center z-[60]">
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

            {/* Subtitles toggle */}
            <button onClick={handleToggleSubtitles} title={showSubtitles ? "Ẩn phụ đề" : "Hiện phụ đề"}>
              <div className={cn(
                "rounded-2xl px-4 py-2",
                showSubtitles ? "bg-blue-600" : "bg-[#19232d] hover:bg-[#2d3e4d]"
              )}>
                <FileText size={20} />
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

            {/* AI Voice Transcription Button */}
            <button
              onClick={handleAIToggle}
              disabled={recorderStatus === "stopping"}
              title={isRecording ? "Dừng lắng nghe" : "Bắt đầu lắng nghe"}
              className={cn(
                "rounded-2xl px-4 py-2 flex items-center gap-2 transition-colors",
                isRecording
                  ? "bg-red-600 hover:bg-red-700 animate-pulse"
                  : recorderStatus === "stopping"
                  ? "bg-yellow-600 cursor-not-allowed"
                  : "bg-[#19232d] hover:bg-[#2d3e4d]"
              )}
            >
              <Languages size={20} />
              <span className="text-sm font-medium">
                {recorderStatus === "stopping" ? "Đang dừng..." : isRecording ? "Stop AI" : "Start AI"}
              </span>
              {isRecording && (
                <span className="text-xs text-red-200 animate-pulse">
                  ● Đang lắng nghe...
                </span>
              )}
            </button>

            <EndCallButton />
          </div>
        </div>
      </section>

      {/* ── Multi-User Subtitle Panel ───────────────────────────────── */}
      {showSubtitles && (
        <MemoizedSubtitlePanel 
          transcripts={allTranscripts} 
          onClose={handleCloseSubtitles} 
        />
      )}

      {/* ── Chat overlay ──────────────────────────────────────── */}
      {showChat && (
        <div
          className="fixed inset-0 bg-black/40 z-[70]"
          onClick={handleCloseChat}
        />
      )}

      {/* ── Chat panel ───────────────────────────────────────── */}
      <div
        className={cn(
          "fixed right-0 top-0 h-full w-[380px] z-[80] border-l border-dark-3 transition-transform duration-300",
          showChat ? "translate-x-0" : "translate-x-full",
        )}
      >
        <MemoizedMeetingChat
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

      {/* ── Mic Warning Toast ─────────────────────────────────────── */}
      {micWarning && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-lg shadow-xl bg-yellow-600 text-white flex items-center gap-3 animate-in slide-in-from-top">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="font-medium">Vui lòng bật micro trước khi bật AI</span>
        </div>
      )}
    </div>
  );
};

export default MeetingRoom;