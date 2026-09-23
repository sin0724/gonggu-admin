import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import ToastProvider from "@/components/ui/toast";
import GuideProvider from "@/components/guide/guide-provider";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <ToastProvider>
      <GuideProvider>
        <div className="flex h-screen overflow-hidden print:h-auto print:overflow-visible">
          <Sidebar />
          <div className="flex-1 flex flex-col overflow-hidden print:overflow-visible">
            <Header userEmail={user.email} />
            <main className="flex-1 overflow-y-auto p-6 print:overflow-visible print:p-0">
              {children}
            </main>
          </div>
        </div>
      </GuideProvider>
    </ToastProvider>
  );
}
