import { AppLayout } from "@/components/app-shell/AppLayout";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppLayout>{children}</AppLayout>;
}
