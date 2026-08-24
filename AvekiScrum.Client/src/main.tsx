import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme/global.css'
import { ThemeProvider } from './theme/ThemeContext'
import { ToastProvider } from './components/Toast'
import { authConfigured, setSignInRequired } from './auth/authConfig'
import { initializeAuth, signIn } from './auth/msal'
import { loadIdentity } from './auth/identity'
import { fetchServerConfig } from './api/serverConfig'
import { StartupError } from './components/StartupError'
import { StartupWaiting } from './components/StartupWaiting'
import App from './App.tsx'

/**
 * Start-up, in the order the answers become available.
 *
 * The server is asked first, and it decides whether anyone signs in. That single fact is what
 * makes the three ways of running this independent of each other: PAT-only, sign-in against a
 * PAT-backed Api, and full delegated Entra differ by one setting on the server, and the client
 * follows. Nothing here has to be switched to match.
 */
async function bootstrap() {
  const root = createRoot(document.getElementById('root')!)

  try {
    // Retries while the Api finishes starting, and says so on screen once the first attempt has
    // missed - which is most mornings, since the client is serving long before the build is done.
    const server = await fetchServerConfig({
      onWaiting: () =>
        root.render(
          <StrictMode>
            <ThemeProvider>
              <StartupWaiting />
            </ThemeProvider>
          </StrictMode>,
        ),
    })
    setSignInRequired(server.signInRequired)

    if (server.signInRequired) {
      if (!authConfigured) {
        throw new Error(
          `Servern kräver inloggning (Auth:Mode = "${server.authMode}") men den här klientbygget ` +
            'saknar VITE_ENTRA_TENANT_ID / VITE_ENTRA_CLIENT_ID / VITE_API_SCOPE. Antingen sätter du ' +
            'dem i AvekiScrum.Client/.env.development, eller så kör du API:t med Auth__Mode=Pat.',
        )
      }
      const account = await initializeAuth()
      if (!account) {
        await signIn()
        return // loginRedirect navigates away; nothing after this runs
      }
    }

    await loadIdentity()

    root.render(
      <StrictMode>
        <ThemeProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </ThemeProvider>
      </StrictMode>,
    )
  } catch (error) {
    // Without this the page just stays blank, which says nothing about what went wrong - and
    // both halves of start-up have plenty of ways to fail that are fixable once named.
    console.error('AvekiScrum kunde inte starta', error)
    root.render(
      <StrictMode>
        <StartupError error={error} />
      </StrictMode>,
    )
  }
}

void bootstrap()
