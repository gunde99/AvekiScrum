import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme/global.css'
import { ThemeProvider } from './theme/ThemeContext'
import { ToastProvider } from './components/Toast'
import { authEnabled } from './auth/authConfig'
import { initializeAuth, signIn } from './auth/msal'
import { loadIdentity } from './auth/identity'
import { StartupError } from './components/StartupError'
import App from './App.tsx'

/**
 * Sign in before the first render.
 *
 * Everything the app shows comes from Azure DevOps as the signed-in user, so there is nothing
 * meaningful to draw before we know who that is. On a domain-joined machine this completes without
 * showing anything; only a machine without a usable session ever sees the Entra page.
 */
async function bootstrap() {
  const root = createRoot(document.getElementById('root')!)

  try {
    if (authEnabled) {
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
    // sign-in has a lot of ways to go wrong that are entirely fixable once named.
    console.error('AvekiScrum kunde inte starta', error)
    root.render(
      <StrictMode>
        <StartupError error={error} />
      </StrictMode>,
    )
  }
}

void bootstrap()
