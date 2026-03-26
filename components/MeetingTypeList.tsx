"use client"
import React, { useState } from 'react'
import HomeCard from './HomeCard'
import { useRouter } from 'next/navigation'
import MeetingModal from './MeetingModal'
import { useUser } from '@clerk/nextjs'
import { useStreamVideoClient } from '@stream-io/video-react-sdk'
import { Call } from '@stream-io/video-react-sdk' 
import { useToast } from '@/components/ui/use-toast'
import { Textarea } from './ui/textarea'
import ReactDatePicker from 'react-datepicker'
import "react-datepicker/dist/react-datepicker.css";
import { registerLocale } from "react-datepicker";
import {vi} from "date-fns/locale/vi";
import { Input } from './ui/input'
registerLocale("vi", vi);
const MeetingTypeList = () => {
  const router = useRouter();

  const [meetingState, setMeetingState] = useState<
    'isScheduleMeeting' | 'isJoiningMeeting' | 'isInstantMeeting' | undefined
  >(undefined);

  const { user } = useUser();
  const client = useStreamVideoClient();

  const [values, setValues] = useState({
    dateTime: new Date(),
    description: '',
    link: '',
  });
  
    const [callDetail, setCallDetail] = useState<Call>();

  const { toast } = useToast();
  const createMeeting = async () => {
    if (!client || !user) return;

    try {
      if (!values.dateTime) {
        toast({ title: "Please select a date and time" });
        return;
      }
      const id = crypto.randomUUID();
      const call = client.call('default', id);

      if (!call) throw new Error('Failed to create meeting');

      const startsAt = values.dateTime.toISOString() || new Date(Date.now()).toISOString();
      const description = values.description || 'Instant Meeting';

      await call.getOrCreate({
        data: {
          starts_at: startsAt,
          custom: {
            description,
          },
        },
      });

      setCallDetail(call);

      if (!values.description) {
        router.push(`/meeting/${call.id}`);
      }

      toast({
        title: "Meeting Created",
      });
    } catch (error) {
      console.log(error);
      toast({
        title: "Error creating meeting",

      });
    }
  };
  const meetingLink = `${process.env.NEXT_PUBLIC_BASE_URL}/meeting/${callDetail?.id}`;

  return (
   <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
  <HomeCard
    img="/icons/add-meeting.svg"
    title="Tạo cuộc họp mới"
    description="Bắt đầu cuộc họp ngay "
    handleClick={() => setMeetingState('isInstantMeeting')}
    className='bg-orange-1'
  />  

  <HomeCard
    img="/icons/join-meeting.svg"
    title="Tham gia cuộc họp"
    description="Tham gia bằng liên kết mời"
    handleClick={() => setMeetingState('isJoiningMeeting')}
    className='bg-blue-1'
  />

  <HomeCard
    img="/icons/schedule.svg"
    title="Lên lịch cuộc họp"
    description="Đặt lịch cho cuộc họp"
    handleClick={() => setMeetingState('isScheduleMeeting')}
    className='bg-purple-1'
  />

  <HomeCard
    img="/icons/recordings.svg"
    title="Xem bản ghi"
    description="Xem lại các cuộc họp "
    handleClick={() => router.push('/recordings')}
    className='bg-yellow-1'
  />


    {!callDetail?(
      <MeetingModal
    isOpen={meetingState === 'isScheduleMeeting'}
    onClose={() => setMeetingState(undefined)}
    title="Bắt đầu cuộc họp ngay"
    handleClick={createMeeting}
      >
        <div className="flex flex-col gap-2.5">
          <label className="text-base text-nomal leading-[22px] text-sky-2">
              thêm mô tả cho cuộc họp 
          </label>
          <Textarea className="border-none bg-dark-3 forcus-visible:ring-0 focus-visible:ring-offset-0"
          onChange={(e)=> {
                setValues({ ...values, description: e.target.value })
          }}>

          </Textarea>
            
        </div>
        <div className="flex w-full flex-col gap-2.5">
          <label className="text-base text-nomal leading-[22px] text-sky-2">
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
  
      ): (
        <MeetingModal
    isOpen={meetingState === 'isScheduleMeeting'}
    onClose={() => setMeetingState(undefined)}
    title="cuộc hop đã được lên "
    
    handleClick={() => {
      navigator.clipboard.writeText(meetingLink);
      toast({ title: "Meeting link copied to clipboard" })
    }}
    image="/icons/schedule.svg"
    buttonIcon="/icons/copy.svg"
    buttonText="Sao chép liên kết"
  />
      )}
  <MeetingModal
    isOpen={meetingState === 'isInstantMeeting'}
    onClose={() => setMeetingState(undefined)}
    title="Bắt đầu cuộc họp ngay"
    className="text-center"
    buttonText="Vào phòng họp"
    handleClick={createMeeting}
  />
  <MeetingModal
        isOpen={meetingState === 'isJoiningMeeting'}
        onClose={() => setMeetingState(undefined)}
        title="Type the link here"
        className="text-center"
        buttonText="Join Meeting"
        handleClick={() => router.push(values.link)}
      >
        <Input
          placeholder="Meeting link"
          onChange={(e) => setValues({ ...values, link: e.target.value })}
          className="border-none bg-dark-3 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </MeetingModal>
</section>
  )
}

export default MeetingTypeList;