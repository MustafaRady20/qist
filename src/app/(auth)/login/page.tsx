import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Brand } from "@/components/shell/Brand";
import { getCurrentUser } from "@/server/auth/dal";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "تسجيل الدخول · قسط" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-100 flex-col gap-8 rounded-modal border border-border bg-surface p-8 shadow-card">
        <div className="flex flex-col items-start gap-2">
          <Brand />
          <p className="text-caption text-secondary">إدارة الأقساط والتحصيل</p>
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-h2 text-navy">تسجيل الدخول</h1>
          <p className="text-body text-secondary">أدخل بيانات حسابك للمتابعة</p>
        </div>
        <LoginForm next={typeof next === "string" ? next : undefined} />
      </div>
    </main>
  );
}
