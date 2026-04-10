'use client';

import { useToast } from './ui/use-toast';
import { Button } from './ui/button';
import { dicebearInitials } from '@/lib/participant-avatar';

export type ParticipantAvatar = {
  src: string;
  alt: string;
};

interface MeetingCardProps {
  title: string;
  date?: string;
  subtitle?: string;
  icon: string;
  isPreviousMeeting?: boolean;
  buttonIcon1?: string;
  buttonText?: string;
  handleClick: () => void;
  link: string;
  hideCopyLink?: boolean;
  /** Real avatars from Stream call members (prefer Clerk image, Dicebear fallback). */
  participantAvatars?: ParticipantAvatar[];
  /** Show when current user was invited but is not the host. */
  invitedBadge?: boolean;
}

const MeetingCard = ({
  icon,
  title,
  date,
  subtitle,
  isPreviousMeeting,
  buttonIcon1,
  handleClick,
  link,
  buttonText,
  hideCopyLink,
  participantAvatars,
  invitedBadge,
}: MeetingCardProps) => {
  const { toast } = useToast();
  const whenLine = subtitle ?? date ?? '—';

  const hasRealAvatars =
    participantAvatars && participantAvatars.length > 0;

  return (
    <section className="flex min-h-[258px] w-full flex-col justify-between rounded-[14px] bg-dark-1 px-5 py-8 xl:max-w-[568px]">
      <article className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={icon} alt="" width={28} height={28} />
          {invitedBadge ? (
            <span className="rounded-full bg-purple-600/80 px-2 py-0.5 text-xs font-medium text-white">
              You&apos;re invited
            </span>
          ) : null}
        </div>
        <div className="flex justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="text-base font-normal text-sky-1">{whenLine}</p>
          </div>
        </div>
      </article>

      {/* Avatars row */}
      <article className="flex justify-center relative">
        <div className="relative flex min-h-[40px] w-full max-sm:hidden items-center">
          {hasRealAvatars ? (
            participantAvatars!.slice(0, 6).map((a, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${a.src}-${i}`}
                src={a.src}
                alt={a.alt}
                width={40}
                height={40}
                className={`size-10 rounded-full border-2 border-dark-1 object-cover${i > 0 ? ' absolute' : ''}`}
                style={{ top: 0, left: i * 28 }}
              />
            ))
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={dicebearInitials(title)}
              alt=""
              width={40}
              height={40}
              className="size-10 rounded-full border-2 border-dark-3 object-cover"
            />
          )}
        </div>

        {!isPreviousMeeting && (
          <div className="flex flex-wrap gap-2 justify-center">
            <Button onClick={handleClick} className="rounded bg-blue-1 px-6">
              {buttonIcon1 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={buttonIcon1} alt="" width={16} height={16} className="inline mr-1" />
              ) : null}
              &nbsp; {buttonText}
            </Button>
            {!hideCopyLink && (
              <Button
                onClick={() => {
                  void navigator.clipboard.writeText(link);
                  toast({ title: 'Link Copied' });
                }}
                className="bg-dark-4 px-4"
              >
                &nbsp; Copy Link
              </Button>
            )}
          </div>
        )}
      </article>
    </section>
  );
};

export default MeetingCard;
