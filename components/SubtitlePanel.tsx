"use client";

import React, { useEffect, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import { FileText, X } from "lucide-react";
import type { TranscriptEntry as BaseTranscriptEntry } from "@/hooks/useWhisperRecorder";

export type TranscriptEntry = BaseTranscriptEntry;

interface SubtitlePanelProps {
  transcripts: TranscriptEntry[];
  onClose?: () => void;
  className?: string;
}

const SubtitlePanel: React.FC<SubtitlePanelProps> = ({ transcripts, onClose, className }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);
  const isInitialMount = useRef(true);

  // Auto-scroll to top when new transcript arrives
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (transcripts.length !== prevLengthRef.current && panelRef.current) {
      prevLengthRef.current = transcripts.length;
      panelRef.current.scrollTop = 0;
    }
  }, [transcripts.length]);

  // Sort transcripts by timestamp (NEWEST first)
  const sortedTranscripts = useMemo(() => {
    return [...transcripts].sort((a, b) => b.timestamp - a.timestamp);
  }, [transcripts]);

  // Group recent transcripts by user for display
  const userGroups = useMemo(() => {
    const map = new Map<string, {
      userId: string;
      name: string;
      entries: TranscriptEntry[];
      lastTimestamp: number;
    }>();

    for (const t of sortedTranscripts) {
      const existing = map.get(t.userId);
      if (existing) {
        existing.entries.push(t);
        existing.lastTimestamp = t.timestamp;
      } else {
        map.set(t.userId, {
          userId: t.userId,
          name: t.name,
          entries: [t],
          lastTimestamp: t.timestamp,
        });
      }
    }

    return Array.from(map.values())
      .sort((a, b) => b.lastTimestamp - a.lastTimestamp);
  }, [sortedTranscripts]);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div
      ref={panelRef}
      className={cn(
        "fixed left-0 top-0 h-full w-[380px] z-50 border-r border-dark-3",
        "flex flex-col bg-dark-1",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-3 bg-dark-2">
        <h2 className="font-semibold text-white flex items-center gap-2">
          <FileText size={18} className="text-blue-400" />
          Phụ đề AI
          {transcripts.length > 0 && (
            <span className="text-xs text-white/50">({transcripts.length})</span>
          )}
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-dark-3 text-white/60 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Transcript entries */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {userGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-white/40 gap-3">
            <FileText size={32} className="opacity-30" />
            <p className="text-sm">Chưa có phụ đề nào</p>
            <p className="text-xs text-white/30">Bật AI để bắt đầu</p>
          </div>
        ) : (
          <div className="space-y-3">
            {userGroups.map((group) => {
              // After sorting DESC, newest is at index 0
              const latestEntry = group.entries[0];
              const previousEntries = group.entries.slice(1); // older ones

              return (
                <div
                  key={group.userId}
                  className="bg-dark-2 rounded-xl p-4 space-y-3 animate-fade-in"
                >
                  {/* User header */}
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <span className="text-sm font-medium text-blue-400">
                        {group.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="font-medium text-white text-sm">
                      {group.name}
                    </span>
                    <span className="text-xs text-white/30 ml-auto">
                      {group.entries.length} lượt
                    </span>
                  </div>

                  {/* Latest transcript - prominent (bilingual) */}
                  {latestEntry && (
                    <div className="pl-10">
                      {/* Vietnamese (primary) */}
                      <p className={cn(
                        "text-white font-medium text-sm leading-relaxed",
                        !latestEntry.isFinal && "opacity-70 italic" // Partial: slightly faded
                      )}>
                        {latestEntry.text}
                        {!latestEntry.isFinal && (
                          <span className="inline-block ml-2 text-xs text-blue-400 font-normal">
                            (đang nhận diện...)
                          </span>
                        )}
                      </p>

                      {/* English translation (secondary, if available) */}
                      {latestEntry.translated_text && (
                        <p className="text-white/60 text-xs italic leading-relaxed mt-1">
                          {latestEntry.translated_text}
                        </p>
                      )}

                      {/* Timestamp */}
                      <span className="text-xs text-white/30 mt-1 block">
                        {formatTime(latestEntry.timestamp)}
                        {!latestEntry.isFinal && " • Đang xử lý"}
                      </span>
                    </div>
                  )}

                  {/* Previous transcripts - compact list (older entries) */}
                  {previousEntries.length > 0 && (
                    <div className="pl-10 space-y-2 border-l-2 border-dark-3 ml-4">
                      {previousEntries.slice(0, 3).map((entry) => (
                        <div key={entry.id} className="text-white/60 text-xs">
                          <span className="text-white/40">{formatTime(entry.timestamp)}</span>
                          <div className="mt-0.5">
                            <span className={cn(!entry.isFinal && "italic opacity-70")}>
                              {entry.text}
                            </span>
                            {!entry.isFinal && (
                              <span className="text-blue-400 text-[10px] ml-1">(partial)</span>
                            )}
                            {entry.translated_text && (
                              <div className="text-white/40 italic mt-0.5">
                                {entry.translated_text}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {previousEntries.length > 3 && (
                        <span className="text-xs text-white/30">
                          +{previousEntries.length - 3} phụ đề trước đó
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

export default SubtitlePanel;
