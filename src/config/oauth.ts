// Public OAuth client ids of the app (they are not secrets).
//  GitHub : github.com → Settings → Developer settings → OAuth Apps → New, tick "Enable Device Flow", paste the Client ID here.
//  Google : console.cloud.google.com → Credentials → OAuth client ID → type "TVs and Limited Input devices".
// Until they are filled in, "Continue as guest" works and the two sign-in buttons say they are not set up yet.
export const GITHUB_CLIENT_ID = 'Ov23lifAWG0uP5MdZ3dE';
export const GOOGLE_CLIENT_ID = '918684037685-991kco3pv7aq3p04pq7kklaj7kaaogju.apps.googleusercontent.com';
// The secret is not kept in the code: the build reads it from the GOOGLE_CLIENT_SECRET Actions secret.
export const GOOGLE_CLIENT_SECRET: string = (import.meta as any).env?.VITE_GOOGLE_CLIENT_SECRET || '';
