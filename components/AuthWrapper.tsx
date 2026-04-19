'use client';

import { ReactNode } from "react";
import { SignedIn, SignedOut, SignIn } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import ChatProvider from "@/providers/ChatProvider";
import StreamVideoProvider from "@/providers/StreamVideoProvider";

export default function AuthWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname?.includes('/sign-in') || pathname?.includes('/sign-up');

  return (
    <>
      <SignedIn>
        <ChatProvider>
          <StreamVideoProvider>
            {children}
          </StreamVideoProvider>
        </ChatProvider>
      </SignedIn>

      <SignedOut>
        {isAuthPage ? (
          children
        ) : (
          <div className="flex h-screen w-full items-center justify-center bg-dark-2">
            <SignIn />
          </div>
        )}
      </SignedOut>
    </>
  );
}
