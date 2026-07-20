export type ActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
  requestId?: string;
};

export const initialActionState: ActionState = { status: "idle" };
