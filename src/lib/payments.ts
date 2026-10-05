import type { PaymentMethod } from "@/server/db/schema";

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: "نقدي",
  bank_transfer: "تحويل بنكي",
  wallet: "محفظة إلكترونية",
};
