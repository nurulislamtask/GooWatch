// Public OAuth client ids of the app (they are not secrets).
//  GitHub : github.com → Settings → Developer settings → OAuth Apps → New, tick "Enable Device Flow", paste the Client ID here.
//  Google : console.cloud.google.com → Credentials → OAuth client ID → type "TVs and Limited Input devices".
// Until they are filled in, "Continue as guest" works and the two sign-in buttons say they are not set up yet.
export const GITHUB_CLIENT_ID = '';
export const GOOGLE_CLIENT_ID = '';
export const GOOGLE_CLIENT_SECRET = ''; // for this client type Google treats it as public
