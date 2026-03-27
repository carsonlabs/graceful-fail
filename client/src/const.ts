export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Redirect to our server-side GitHub OAuth flow
export const getLoginUrl = () => {
  const redirect = encodeURIComponent(window.location.pathname);
  return `/api/oauth/login?redirect=${redirect}`;
};
