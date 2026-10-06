"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { setRuleActiveAction } from "./actions";

/** Stops a plan for new contracts, or brings it back. */
export function RuleStatusButton({ ruleKey, active }: { ruleKey: string; active: boolean }) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const toggle = () =>
    startTransition(async () => {
      const result = await setRuleActiveAction(ruleKey, !active);
      setError(result.error);
    });

  return (
    <>
      <Button variant="outline" className="w-24" loading={pending} onClick={toggle}>
        {active ? "إيقاف" : "تفعيل"}
      </Button>
      {error && (
        <span role="alert" className="text-caption text-dangerText">
          {error}
        </span>
      )}
    </>
  );
}
