// ─────────────────────────────────────────────────────────────────────────────
// Auth abstraction layer
//
// REPLACING WITH AWS COGNITO (Amplify v6):
//   1. npm install aws-amplify
//   2. Create src/lib/amplifyConfig.ts and call Amplify.configure({ Auth: { ... } })
//   3. Import it once in main.tsx: import './lib/amplifyConfig'
//   4. Swap each function body below with the commented Cognito equivalent
// ─────────────────────────────────────────────────────────────────────────────

// import { signIn as cognitoSignIn, signOut as cognitoSignOut, getCurrentUser as cognitoGetCurrentUser, fetchUserAttributes } from 'aws-amplify/auth'

export type AuthUser = {
  email: string
  /** Display name — from Cognito's `name` attribute or derived from email */
  name: string
}

/**
 * Sign in with email + password.
 *
 * Cognito replacement:
 *   const { isSignedIn } = await cognitoSignIn({ username: email, password })
 *   if (!isSignedIn) throw new Error('Sign-in step required')
 *   const attrs = await fetchUserAttributes()
 *   return { email: attrs.email ?? email, name: attrs.name ?? email.split('@')[0] }
 */
export async function signIn(email: string, password: string): Promise<AuthUser> {
  if (!email.trim() || !password) throw new Error('Email and password are required.')
  // Placeholder — accepts any credentials. Replace with Cognito call above.
  await new Promise((r) => setTimeout(r, 600)) // simulate network
  return { email: email.trim(), name: email.split('@')[0] }
}

/**
 * Sign out the current session.
 *
 * Cognito replacement:
 *   await cognitoSignOut()
 */
export async function signOut(): Promise<void> {
  // Placeholder — replace with cognitoSignOut()
  await new Promise((r) => setTimeout(r, 200))
}

/**
 * Restore session on page load.
 * Returns the logged-in user or null if unauthenticated.
 *
 * Cognito replacement:
 *   try {
 *     const user = await cognitoGetCurrentUser()
 *     const attrs = await fetchUserAttributes()
 *     return { email: attrs.email ?? user.username, name: attrs.name ?? user.username }
 *   } catch { return null }
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  // Placeholder — no persistent session. Replace with Cognito call above.
  return null
}
