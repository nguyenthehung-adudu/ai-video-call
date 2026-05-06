'use client';

import { CallRecording } from '@stream-io/video-react-sdk';
import { useRouter } from 'next/navigation';
import { Play, Download, Share2, Clock } from 'lucide-react';
import { useToast } from './ui/use-toast';

interface RecordingCardProps {
  recording: CallRecording;
  title: string;
  date: string;
}

const formatDuration = (startTime: Date, endTime: Date): string => {
  const diffMs = endTime.getTime() - startTime.getTime();
  const totalSeconds = Math.floor(diffMs / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const RecordingCard = ({ recording, title, date }: RecordingCardProps) => {
  const router = useRouter();
  const { toast } = useToast();
  const duration = formatDuration(
    new Date(recording.start_time),
    new Date(recording.end_time)
  );

  const handlePlay = () => {
    router.push(recording.url);
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(recording.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_recording.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast({ title: 'Đã tải xuống bản ghi' });
    } catch (error) {
      toast({ title: 'Lỗi khi tải xuống', variant: 'destructive' });
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(recording.url);
      toast({ title: 'Đã sao chép liên kết bản ghi' });
    } catch {
      toast({ title: 'Lỗi khi sao chép liên kết', variant: 'destructive' });
    }
  };

  return (
    <section className="group relative flex min-h-[180px] w-full flex-col justify-between rounded-[14px] bg-dark-1 p-6 xl:max-w-[568px]">
      <article className="flex flex-col gap-4">
        {/* Header: Icon and Badge */}
        <div className="flex items-start justify-between gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/recordings.svg" alt="" width={28} height={28} />
        </div>

        {/* Title and Meta */}
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-bold leading-tight">{title}</h1>

          {/* Date */}
          <p className="text-sm font-normal text-sky-1">{date}</p>

          {/* Duration Badge */}
          <div className="mt-1 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm text-gray-200">
              <Clock size={12} />
              {duration}
            </span>
          </div>
        </div>
      </article>

      {/* Action Buttons */}
      <article className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={handlePlay}
          className="flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:scale-105 hover:bg-blue-600 active:scale-100"
        >
          <Play size={16} />
          Phát
        </button>

        <button
          onClick={handleDownload}
          className="flex items-center gap-2 rounded-xl bg-green-500 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:scale-105 hover:bg-green-600 active:scale-100"
        >
          <Download size={16} />
          Tải xuống
        </button>

        <button
          onClick={handleShare}
          className="flex items-center gap-2 rounded-xl bg-purple-500 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:scale-105 hover:bg-purple-600 active:scale-100"
        >
          <Share2 size={16} />
          Chia sẻ
        </button>
      </article>
    </section>
  );
};

export default RecordingCard;
