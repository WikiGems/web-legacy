import { fromRef, getService, runUi } from "../runtime";
import { Auth } from "../services/auth";

export type { Session, SessionState, SessionUser } from "../services/auth";

/** The Better Auth session as an accessor; it follows sign-in, sign-out and tab sync. */
export const useSession = () => fromRef(getService(Auth).session);
export const refreshSession = () => runUi(Auth.use((auth) => auth.refresh));
