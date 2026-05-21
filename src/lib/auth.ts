const AUTH_CALLBACK_KEYS = [
  "access_token",
  "refresh_token",
  "expires_at",
  "expires_in",
  "token_type",
  "type",
  "code",
  "token_hash",
];

type LocationLike = Pick<Location, "hash" | "pathname" | "search"> & {
  href?: string;
};

const toParams = (value: string) => {
  const normalized = value.startsWith("#") || value.startsWith("?") ? value.slice(1) : value;
  return new URLSearchParams(normalized);
};

export const getResetPasswordRedirectUrl = () =>
  new URL("/reset-password", window.location.origin).toString();

export const hasRecoveryIntent = (locationLike: Pick<LocationLike, "search" | "hash"> = window.location) => {
  const searchParams = toParams(locationLike.search);
  const hashParams = toParams(locationLike.hash);

  return (
    searchParams.get("type") === "recovery" ||
    hashParams.get("type") === "recovery" ||
    searchParams.has("code") ||
    hashParams.has("code") ||
    searchParams.has("token_hash") ||
    hashParams.has("token_hash") ||
    hashParams.has("access_token") ||
    hashParams.has("refresh_token")
  );
};

export const stripAuthParamsFromUrl = (locationLike: LocationLike = window.location) => {
  const baseUrl = new URL(locationLike.href ?? window.location.href);
  const searchParams = toParams(locationLike.search);
  const hashParams = toParams(locationLike.hash);

  for (const key of AUTH_CALLBACK_KEYS) {
    searchParams.delete(key);
    hashParams.delete(key);
  }

  const nextSearch = searchParams.toString();
  const nextHash = hashParams.toString();

  return `${locationLike.pathname}${nextSearch ? `?${nextSearch}` : ""}${nextHash ? `#${nextHash}` : ""}`;
};