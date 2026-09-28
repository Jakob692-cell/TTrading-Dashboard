import { HttpNoVapeApi } from './HttpNoVapeApi';
import { MockNoVapeApi } from './MockNoVapeApi';
import type { NoVapeApi } from './NoVapeApi';

export type { NoVapeApi } from './NoVapeApi';

const apiUrl = import.meta.env.VITE_API_URL as string | undefined;

/** Single API instance for the app. Set `VITE_API_URL` to talk to a real backend. */
export const api: NoVapeApi = apiUrl ? new HttpNoVapeApi(apiUrl) : new MockNoVapeApi();
