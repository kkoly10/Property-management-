export function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="mt-1.5 text-sm text-destructive">{messages[0]}</p>;
}
