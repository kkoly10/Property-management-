export const OPERATOR_SEARCH_LIMIT = 24;
export const OPERATOR_SEARCH_MIN_LENGTH = 2;
export const OPERATOR_SEARCH_MAX_LENGTH = 80;

type SearchParameters = Record<string, string | string[] | undefined>;

export type ParsedOperatorSearch = {
  query: string;
  state: "empty" | "ready" | "invalid";
};

export function parseOperatorSearch(parameters: SearchParameters): ParsedOperatorSearch {
  const raw = parameters.q;
  const query = (Array.isArray(raw) ? raw[0] : raw ?? "").trim();

  if (!query) return { query: "", state: "empty" };
  if (query.length < OPERATOR_SEARCH_MIN_LENGTH || query.length > OPERATOR_SEARCH_MAX_LENGTH) {
    return { query, state: "invalid" };
  }
  return { query, state: "ready" };
}
