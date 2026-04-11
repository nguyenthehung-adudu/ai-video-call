import { ReactNode } from 'react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: "YOOM",
  description: "Video calling App",
  icons: {
    icon: "/icons/logo.svg",
  },
};
const RootLayout = ({ children }: Readonly<{ children: ReactNode }>) => {
  return <main>{children}</main>;
};

export default RootLayout;
