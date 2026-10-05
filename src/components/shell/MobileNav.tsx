"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui";
import { Brand } from "./Brand";
import { SidebarFooter } from "./Sidebar";
import { SidebarNav } from "./SidebarNav";

/** Below 1024 the sidebar becomes a drawer opened from the top bar. */
export function MobileNav() {
  const dialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    dialog.current?.close();
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        aria-label="فتح القائمة"
        onClick={() => dialog.current?.showModal()}
        className="grid size-11 place-items-center rounded-control text-text hover:bg-bg"
      >
        <Icon name="menu" />
      </button>
      <dialog
        ref={dialog}
        aria-label="القائمة الرئيسية"
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
        className="m-0 me-auto h-dvh max-h-dvh w-72 max-w-[85vw] bg-surface p-0 backdrop:bg-navy/40"
      >
        <div className="flex h-full flex-col overflow-y-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <Brand />
            <button
              type="button"
              aria-label="إغلاق القائمة"
              onClick={() => dialog.current?.close()}
              className="grid size-11 place-items-center rounded-control text-secondary hover:bg-bg"
            >
              <Icon name="close" />
            </button>
          </div>
          <p className="text-caption text-secondary">إدارة الأقساط والتحصيل</p>
          <SidebarNav onNavigate={() => dialog.current?.close()} />
          <SidebarFooter />
        </div>
      </dialog>
    </>
  );
}
