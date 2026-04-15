"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import Loader from "@/components/Loader";

/* ──────────────────────────── Utility helpers ──────────────────────────── */

function truncateMeetingId(id: string, chars: number = 12): string {
  if (!id || id.length <= chars * 2 + 3) return id;
  return `${id.slice(0, chars)}...${id.slice(-chars)}`;
}

/* ──────────────────────────── Badge Component ──────────────────────────── */

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "info" | "warning";
  icon?: React.ReactNode;
}

function Badge({ children, variant = "default", icon }: BadgeProps) {
  const variants = {
    default: "bg-dark-3 text-sky-1 border-dark-3",
    success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    info: "bg-blue-1/10 text-blue-1 border-blue-1/20",
    warning: "bg-yellow-1/10 text-yellow-1 border-yellow-1/20",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${variants[variant]}`}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </span>
  );
}

/* ──────────────────────────── Info Row Component ──────────────────────────── */

interface InfoRowProps {
  label: string;
  value: string;
  truncate?: boolean;
  monospace?: boolean;
  onClick?: () => void;
  clickable?: boolean;
}

function InfoRow({
  label,
  value,
  truncate = false,
  monospace = false,
  onClick,
  clickable = false,
}: InfoRowProps) {
  const content = (
    <>
      <span className="text-sm font-medium text-sky-1 min-w-[100px]">{label}</span>
      <span
        className={`text-sm font-semibold text-white flex-1 ${
          monospace ? "font-mono tracking-wide" : ""
        } ${clickable ? "cursor-pointer hover:text-blue-400 transition-colors" : ""}`}
      >
        {value}
      </span>
      {clickable && (
        <span className="flex-shrink-0 text-blue-1">
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        </span>
      )}
    </>
  );

  if (onClick) {
    return (
      <div
        className={`flex items-center gap-3 rounded-lg bg-dark-3/50 px-4 py-3 transition-all hover:bg-dark-3 cursor-pointer ${truncate ? "max-w-full" : ""}`}
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onClick()}
      >
        {content}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${truncate ? "max-w-full" : ""}`}>
      {content}
    </div>
  );
}

/* ──────────────────────────── QR Code Component ──────────────────────────── */

interface QRCodeDisplayProps {
  data: string;
  size?: number;
}

function QRCodeDisplay({ data, size = 120 }: QRCodeDisplayProps) {
  const [qrUrl, setQrUrl] = useState<string>("");

  useEffect(() => {
    const encoded = encodeURIComponent(data);
    setQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}&format=svg`);
  }, [data, size]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="rounded-xl bg-white p-3 shadow-lg">
        {qrUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrUrl}
            alt="QR Code"
            width={size - 24}
            height={size - 24}
            className="rounded-lg"
          />
        ) : (
          <div
            className="animate-pulse bg-gray-200 rounded-lg"
            style={{ width: size - 24, height: size - 24 }}
          />
        )}
      </div>
      <span className="text-xs text-muted-foreground">Quét để tham gia</span>
    </div>
  );
}

/* ──────────────────────────── Feature Card Component ──────────────────────────── */

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  badgeVariant?: BadgeProps["variant"];
}

function FeatureCard({
  icon,
  title,
  description,
  badge,
  badgeVariant = "success",
}: FeatureCardProps) {
  return (
    <div className="group relative rounded-xl border border-dark-3 bg-gradient-to-br from-dark-3/30 to-dark-2/30 p-4 transition-all hover:border-blue-1/30 hover:shadow-lg hover:shadow-blue-1/5">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 rounded-lg bg-blue-1/10 p-2.5 text-blue-1 transition-colors group-hover:bg-blue-1/20">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            {badge && (
              <Badge variant={badgeVariant}>
                {badge}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────── Main Component ──────────────────────────── */

const PersonalRoom = () => {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { toast } = useToast();

  const [isCreating, setIsCreating] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);

  // Safe data handling
  const meetingId = user?.id ?? "";
  const displayName = user?.username ?? user?.firstName ?? "Phòng cá nhân";
  const userAvatar = user?.imageUrl;
  const meetingLink = meetingId
    ? `${process.env.NEXT_PUBLIC_BASE_URL}/meeting/${meetingId}?personal=true`
    : "";
  const shortMeetingId = truncateMeetingId(meetingId, 8);

  // Copy to clipboard helper
  const copyToClipboard = useCallback(
    async (text: string, type: "id" | "link") => {
      try {
        await navigator.clipboard.writeText(text);
        if (type === "id") {
          setCopiedId(true);
          setTimeout(() => setCopiedId(false), 2000);
          toast({
            title: "Đã sao chép Meeting ID!",
            description: "Bạn có thể dán ID này để tham gia phòng.",
            duration: 3000,
          });
        } else {
          setCopiedLink(true);
          setTimeout(() => setCopiedLink(false), 2000);
          toast({
            title: "Đã sao chép liên kết!",
            description: "Gửi liên kết này cho người khác để mời vào phòng.",
            duration: 3000,
          });
        }
      } catch {
        toast({
          title: "Không thể sao chép",
          description: "Vui lòng thử lại hoặc sao chép thủ công.",
          variant: "destructive",
          duration: 3000,
        });
      }
    },
    [toast]
  );

  // Ensure personal room exists on mount
  useEffect(() => {
    if (!user?.id || !isLoaded) return;

    const ensureRoom = async () => {
      setIsCreating(true);
      try {
        const { ensurePersonalRoom } = await import("@/actions/stream.actions");
        const result = await ensurePersonalRoom(user.id);
        if (!result.success) {
          console.error("Failed to create personal room:", result.message);
        }
      } catch (error) {
        console.error("Failed to create personal room:", error);
      } finally {
        setIsCreating(false);
      }
    };

    void ensureRoom();
  }, [user?.id, isLoaded]);

  // Fetch participant count periodically
  useEffect(() => {
    if (!user?.id || !isLoaded) return;

    const fetchParticipants = async () => {
      try {
        const response = await fetch(`/api/participants?meetingId=${user.id}`);
        const data = await response.json();
        if (data.success) {
          setParticipantCount(data.count || 0);
        }
      } catch (error) {
        console.error("Failed to fetch participants:", error);
      }
    };

    // Initial fetch
    void fetchParticipants();

    // Poll every 5 seconds
    const interval = setInterval(() => {
      void fetchParticipants();
    }, 5000);

    return () => clearInterval(interval);
  }, [user?.id, isLoaded]);

  // Start room - go to meeting page
  const startRoom = useCallback(() => {
    if (!user) return;
    router.push(`/meeting/${user.id}?personal=true`);
  }, [router, user]);

  if (!isLoaded || isCreating) {
    return <Loader />;
  }

  return (
    <section className="flex size-full flex-col gap-8 p-4 lg:p-8 text-white">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="relative">
            {userAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={userAvatar}
                alt={displayName}
                className="h-16 w-16 rounded-full border-2 border-blue-1 object-cover shadow-lg shadow-blue-1/20 lg:h-20 lg:w-20"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-blue-1 bg-dark-3 text-xl font-bold text-blue-1 lg:h-20 lg:w-20">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            {/* Online indicator */}
            <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-dark-1 bg-emerald-500 text-[10px] font-bold text-white lg:h-7 lg:w-7">
              {participantCount}
            </div>
          </div>

          {/* Title & Status */}
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold lg:text-3xl">
              Phòng cá nhân
            </h1>
            <div className="flex items-center gap-2 text-sm text-sky-1">
              <span className="inline-flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                Sẵn sàng 24/7
              </span>
            </div>
          </div>
        </div>

        {/* Participant count */}
        <div className="flex items-center gap-3 rounded-xl border border-dark-3 bg-dark-3/30 px-4 py-2 lg:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-dark-3">
              <svg className="h-4 w-4 text-sky-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Đang trong phòng</span>
              <span className="text-sm font-bold text-white">
                <span className="text-blue-1">{participantCount}</span>
                <span className="text-muted-foreground">/50</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Main Info Card */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Meeting Info Card */}
          <div className="rounded-2xl border border-dark-3 bg-gradient-to-br from-dark-1 to-dark-2 p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <svg className="h-5 w-5 text-blue-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Thông tin phòng họp
              </h2>
            </div>

            <div className="flex flex-col gap-4">
              {/* Meeting ID Row */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Meeting ID
                </label>
                <InfoRow
                  label=""
                  value={shortMeetingId || "—"}
                  monospace
                  clickable={!!meetingId}
                  onClick={() => meetingId && copyToClipboard(meetingId, "id")}
                />
              </div>

              {/* Topic Row */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Chủ đề
                </label>
                <InfoRow
                  label=""
                  value={displayName !== "Phòng cá nhân" ? `Phòng của ${displayName}` : displayName}
                />
              </div>
            </div>
          </div>

          {/* Link Card */}
          <div className="rounded-2xl border border-dark-3 bg-gradient-to-br from-dark-1 to-dark-2 p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <svg className="h-5 w-5 text-blue-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                Link phòng họp
              </h2>
              <button
                onClick={() => setShowQR(!showQR)}
                className="flex items-center gap-1.5 rounded-lg bg-dark-3 px-3 py-1.5 text-xs font-medium text-sky-1 transition-all hover:bg-dark-4 hover:text-blue-1"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                QR Code
              </button>
            </div>

            {/* QR Code Section */}
            {showQR && meetingLink && (
              <div className="mb-4 flex justify-center">
                <QRCodeDisplay data={meetingLink} size={150} />
              </div>
            )}

            {/* Link Display */}
            <div className="rounded-xl bg-dark-3/50 px-4 py-3 mb-4">
              <span className="truncate text-sm text-muted-foreground block">
                {meetingLink || "Đang tải..."}
              </span>
            </div>

            {/* Single CTA Button */}
            <Button
              size="lg"
              className="w-full bg-gradient-to-r from-blue-1 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold transition-all shadow-lg shadow-blue-1/30 hover:shadow-blue-1/50 hover:scale-[1.02] active:scale-[0.98]"
              onClick={startRoom}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Vào phòng ngay
            </Button>
          </div>

          {/* Copy Link Section */}
          <div className="rounded-2xl border border-dark-3 bg-gradient-to-br from-dark-1 to-dark-2 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                <span className="text-sm text-muted-foreground">Sao chép link mời</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-dark-3 bg-dark-3/50 hover:bg-dark-3 hover:border-blue-1/50 transition-all"
                onClick={() => copyToClipboard(meetingLink, "link")}
              >
                {copiedLink ? (
                  <>
                    <svg className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-emerald-400 text-xs">Đã sao chép!</span>
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Sao chép
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Right Column - Features */}
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <svg className="h-5 w-5 text-blue-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Tính năng
          </h2>

          <div className="flex flex-col gap-3">
            <FeatureCard
              icon={
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              }
              title="Quyền chủ phòng"
              description="Bạn là người kiểm soát phòng họp với đầy đủ quyền quản lý."
              badge="Host"
              badgeVariant="info"
            />

            <FeatureCard
              icon={
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              title="Không giới hạn thời gian"
              description="Phòng họp luôn sẵn sàng 24/7, không giới hạn thời gian sử dụng."
              badge="Unlimited"
              badgeVariant="success"
            />

            <FeatureCard
              icon={
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              }
              title="Mời tối đa 50 người"
              description="Chia sẻ link để mời bạn bè, đồng nghiệp cùng tham gia phòng họp."
              badge="50 người"
              badgeVariant="warning"
            />

            <FeatureCard
              icon={
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              }
              title="Ghi hình & Lưu trữ"
              description="Tính năng ghi hình buổi họp và lưu trữ trong thư viện cá nhân."
              badge="Premium"
              badgeVariant="info"
            />
          </div>

          {/* Copy ID hint */}
          <div className="mt-2 rounded-xl border border-dashed border-dark-3 bg-dark-3/20 p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 rounded-lg bg-yellow-1/10 p-2">
                <svg className="h-4 w-4 text-yellow-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <span className="font-medium text-white">Mẹo:</span> Click vào Meeting ID để sao chép nhanh. Link phòng có thể chia sẻ với bất kỳ ai để tham gia.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PersonalRoom;
