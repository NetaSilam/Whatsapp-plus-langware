import { AppProvider } from "@/components/app-provider";
import { Sidebar } from "@/components/sidebar";

export default function ChatsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <div className="grid h-screen grid-cols-1 md:grid-cols-[minmax(300px,360px)_1fr]">
        <Sidebar />
        <main className="hidden min-w-0 md:block">{children}</main>
      </div>
    </AppProvider>
  );
}
