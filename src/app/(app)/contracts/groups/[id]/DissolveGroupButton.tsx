"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { dissolveGroupAction } from "../../actions";

export function DissolveGroupButton({ id }: { id: string }) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const dissolve = () =>
    startTransition(async () => {
      const result = await dissolveGroupAction(id);
      if (!result.ok) setError(result.error);
    });

  // Two clicks: the first arms the button, the second dissolves.
  return armed ? (
    <>
      <Button variant="danger" loading={pending} loadingText="جارٍ الفك…" onClick={dissolve}>
        تأكيد فك المجموعة
      </Button>
      <Button variant="ghost" disabled={pending} onClick={() => setArmed(false)}>
        تراجع
      </Button>
      {error && (
        <p role="alert" className="text-caption w-full! basis-full text-dangerText">
          {error}
        </p>
      )}
    </>
  ) : (
    <Button variant="outline" onClick={() => setArmed(true)}>
      فك المجموعة
    </Button>
  );
}
