import { OrderWorkspace } from "@/components/order-workspace";
import { readiness } from "@/lib/readiness";
export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <OrderWorkspace
      orderId={id}
      voiceReady={readiness().every((c) => c.configured)}
    />
  );
}
