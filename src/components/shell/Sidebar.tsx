import Link from "next/link";
import { logoutAction } from "@/app/(app)/actions";
import { Brand } from "./Brand";
import { SidebarNav } from "./SidebarNav";

export function SidebarFooter() {
  return (
    <div className="text-caption flex flex-col gap-1 pt-4 text-secondary">
      <p className="flex gap-4">
        <Link href="/help" className="hover:text-text">
          المساعدة
        </Link>
        <span aria-hidden>•</span>
        <Link href="/profile" className="hover:text-text">
          الملف الشخصي
        </Link>
      </p>
      <form action={logoutAction}>
        <button type="submit" className="cursor-pointer hover:text-text">
          تسجيل الخروج
        </button>
      </form>
    </div>
  );
}

/**
 * Desktop sidebar (Figma Pattern/Sidebar): 240px at ≥1440, 216px at 1280,
 * 80px icon rail at 1024. Hidden below 1024, where the drawer takes over.
 */
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh shrink-0 flex-col overflow-y-auto border-e border-border bg-surface px-4 py-6 lg:flex lg:w-(--qist-sidebar-1024) xl:w-(--qist-sidebar-1280) desktop:w-(--qist-sidebar-1440)">
      <div className="flex flex-col gap-1 lg:max-xl:items-center">
        <span className="lg:max-xl:hidden">
          <Brand />
        </span>
        <span className="hidden lg:max-xl:block">
          <Brand compact />
        </span>
        <p className="text-caption text-secondary lg:max-xl:hidden">إدارة الأقساط والتحصيل</p>
      </div>
      <SidebarNav rail />
      <div className="lg:max-xl:hidden">
        <SidebarFooter />
      </div>
    </aside>
  );
}
