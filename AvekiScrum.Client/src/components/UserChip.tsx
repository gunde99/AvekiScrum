import { signInRequired } from "../auth/authConfig";
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
  // Running against a Pat-mode Api. Nothing is broken, but it decides whose name ends up on the
  // cards, so it is worth a word rather than an empty space where a face usually is.
  const apiIsAnonymous = !signInRequired();

  return (
    <>
      <SandboxBadge />
      {identity?.signedIn && (
        <span className="user-chip" title={identity.email ?? undefined}>
          <PersonAvatar name={identity.displayName} size={26} />
          <span className="user-chip__name">{identity.displayName}</span>
        </span>
      )}
      {apiIsAnonymous && (
        <span
          className="user-chip user-chip--anon"
          title={
            "API:t kör med Auth:Mode = \"Pat\": ingen inloggning, och ändringar i Azure DevOps registreras " +
            "som PAT-ägaren. Kör start-entra.bat i stället för att logga in som dig själv."
          }
        >
          PAT-läge
        </span>
      )}
    </>
  );
}

/**
 * Says out loud when the Api is pointed at the sandbox project.
 *
 * Configuration is read once at startup, so an Api still running from before an appsettings edit
 * happily serves the old project - and the boards look identical either way, because ScrumLab is a
 * copy of the real one. Mistaking one for the other costs either a real card edited by accident or
 * an afternoon wondering why a change didn't show up.
 */
function SandboxBadge() {
  const identity = getIdentity();
  if (!identity?.sandbox) return null;

  return (
    <span className="sandbox-badge" title="Testing:ProjectOverride är satt i appsettings.json. Starta om API:t efter att du ändrat den.">
      Sandlåda: {identity.project}
    </span>
  );
}
