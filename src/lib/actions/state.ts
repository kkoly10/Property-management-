export type ActionState = {
  /** "success" is for actions that finish in place rather than redirecting — e.g. "a link is on its way". */
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[]>;
  requestId?: string;
};

export const initialActionState: ActionState = { status: "idle" };
