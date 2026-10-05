export type SettingsTab = "finance" | "settlement" | "general" | "whatsapp";

export const settingsTabs: { value: SettingsTab; label: string }[] = [
  { value: "finance", label: "قواعد التمويل" },
  { value: "settlement", label: "التسوية المبكرة" },
  { value: "general", label: "عام" },
  { value: "whatsapp", label: "واتساب" },
];
