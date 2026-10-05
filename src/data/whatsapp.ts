/** Demo data mirroring Figma "whatsapp" (16:4365). */

export type DeliveryState = "read" | "delivered" | "failed" | "pending";

export const deliveryLabels: Record<DeliveryState, string> = {
  read: "تمت القراءة",
  delivered: "تم التسليم",
  failed: "فشل الإرسال",
  pending: "في الانتظار",
};

export type Conversation = { id: string; customer: string; state: DeliveryState; ago: string };

export type Message = {
  id: string;
  direction: "in" | "out";
  body: string;
  time: string;
  state?: DeliveryState;
};

export type Thread = {
  id: string;
  customer: string;
  phone: string;
  consent: boolean;
  lastInteraction: string;
  messages: Message[];
  template: { name: string; preview: string };
};

const receipt = [
  "مرحبًا أحمد، استلمنا 3,500 جنيه.",
  "إجمالي المتبقي عليك: 35,000 جنيه.",
  "استحقاق 01 نوفمبر: 3,500 جنيه",
  "(2,000 للعقد CT-1024 + 1,500 للعقد CT-1025).",
  "إيصال الدفع: PAY-0842.",
].join("\n");

export async function listConversations(): Promise<Conversation[]> {
  return [
    { id: "c1", customer: "أحمد محمد", state: "read", ago: "منذ 10 دقائق" },
    { id: "c2", customer: "منى خالد", state: "delivered", ago: "منذ 10 دقائق" },
    { id: "c3", customer: "كريم حسن", state: "failed", ago: "منذ 10 دقائق" },
    { id: "c4", customer: "سارة أحمد", state: "pending", ago: "منذ 10 دقائق" },
  ];
}

export async function getThread(id: string): Promise<Thread> {
  void id; // Demo: every conversation opens the same thread.
  return {
    id: "c1",
    customer: "أحمد محمد علي",
    phone: "01001234567",
    consent: true,
    lastInteraction: "منذ 20 دقيقة",
    messages: [
      { id: "m1", direction: "in", body: "مساء الخير، تم دفع القسط اليوم.", time: "10:42" },
      { id: "m2", direction: "out", body: receipt, time: "10:44", state: "read" },
    ],
    template: { name: "تأكيد استلام دفعة", preview: receipt },
  };
}
