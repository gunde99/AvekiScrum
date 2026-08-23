import { authEnabled } from "../auth/authConfig";
import { getIdentity } from "../auth/identity";
import { PersonAvatar } from "./PersonAvatar";
import "./UserChip.css";

/**
 * Who the app thinks you are: photo and name, top right.
 *
 * It's the same sign-in behind AvekiScrum and AvekiSupport, so this lives at the start page as
 * well as inside both tools - the identity is the product's, not one view's. And it earns its
 * place: nobody had to type a password to get here, so without it there is no way to tell whose
 * name will end up on the cards you create.
 *
 * Renders nothing when sign-in is off (a PAT-mode Api in local development) - an empty chip would
 * only raise a question the page can't answer.
 */
export function UserChip() {
  const identity = getIdentity();
  if (!authEnabled || !identity?.signedIn) return null;

  return (
    <span className="user-chip" title={identity.email ?? undefined}>
      <PersonAvatar name={identity.displayName} size={26} />
      <span className="user-chip__name">{identity.displayName}</span>
    </span>
  );
}
