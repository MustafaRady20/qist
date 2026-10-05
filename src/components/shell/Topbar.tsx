import Link from "next/link";
import { ButtonLink, Icon } from "@/components/ui";
import type { SessionUser } from "@/server/auth/session";
import { MobileNav } from "./MobileNav";
import { Brand } from "./Brand";

function Avatar({ initials }: { initials: string }) {
  return (
    <span className="text-label grid size-8 shrink-0 place-items-center rounded-full bg-accentBg text-successText">
      {initials}
    </span>
  );
}

function NotificationsLink() {
  return (
    <Link
      href="/notifications"
      aria-label="الإشعارات"
      className="grid size-11 place-items-center rounded-control text-secondary hover:bg-bg"
    >
      <Icon name="bell" />
    </Link>
  );
}

/** Figma: Topbar (desktop, 80px) and Mobile topbar (menu • brand • bell). */
/** Two-letter initials from the first and last name ("محمود البرعي" → "مب"). */
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "");
}

export function Topbar({ user }: { user: SessionUser }) {
  return (
    <>
      <header className="sticky top-0 z-20 hidden h-20 items-center gap-4 border-b border-border bg-surface px-6 lg:flex">
        <form role="search" action="/search" className="flex h-10 flex-1 items-center gap-3 rounded-control bg-bg px-2">
          <Icon name="search" className="text-secondary" />
          <input
            type="search"
            name="q"
            aria-label="البحث"
            placeholder="ابحث عن عميل، عقد أو دفعة…"
            className="text-body h-full flex-1 bg-transparent text-text outline-none placeholder:text-secondary"
          />
        </form>
        <ButtonLink href="/quick-add" variant="outline" className="w-36">
          + إضافة سريعة
        </ButtonLink>
        <NotificationsLink />
        <span className="text-label text-text">{user.name}</span>
        <Avatar initials={initials(user.name)} />
      </header>

      <header className="flex items-center justify-between px-6 pt-6 lg:hidden">
        <MobileNav />
        <Brand />
        <NotificationsLink />
      </header>
    </>
  );
}
