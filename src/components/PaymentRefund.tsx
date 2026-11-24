import { Alert } from "./ui/feedback";

export function PaymentRefund(props: { reference: string }) {
  return (
    <Alert status="warning" role="alert">
      <div class="space-y-1">
        <p>Your payment arrived after the card was gone. We'll refund you.</p>
        <p class="break-all text-sm">
          If you contact support, include reference {props.reference}.
        </p>
      </div>
    </Alert>
  );
}
