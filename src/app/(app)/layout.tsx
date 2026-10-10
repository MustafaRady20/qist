import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { requirePageUser } from "@/server/auth/dal";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Shell data only; every page and service re-checks access through the DAL.
  const user = await requirePageUser();
  return (
    <div className="flex min-h-dvh flex-1">
      {/* The shell is chrome: printed pages (account statements) carry only their content. */}
      <div className="contents print:hidden">
        <Sidebar />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="contents print:hidden">
          <Topbar user={user} />
        </div>
        <main className="flex flex-1 flex-col gap-6 p-6 lg:px-8 lg:pt-6 lg:pb-8 print:p-0!">{children}</main>
      </div>
    </div>
  );
}
