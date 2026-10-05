"use client";

import { useActionState } from "react";
import { Button, Icon, TextField } from "@/components/ui";
import { loginAction, type LoginState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      {state.error && (
        <p role="alert" className="text-body flex items-start gap-2 rounded-control bg-dangerBg p-4 text-dangerText">
          <Icon name="alert" size={20} className="mt-0.5 shrink-0" />
          {state.error}
        </p>
      )}
      <TextField
        label="البريد الإلكتروني"
        name="email"
        kind="email"
        autoComplete="username"
        defaultValue={state.email}
        error={state.fieldErrors?.email}
        required
        autoFocus
      />
      <TextField
        label="كلمة المرور"
        name="password"
        kind="password"
        autoComplete="current-password"
        error={state.fieldErrors?.password}
        required
      />
      <Button type="submit" loading={pending} loadingText="جارٍ الدخول…" className="w-full">
        تسجيل الدخول
      </Button>
    </form>
  );
}
