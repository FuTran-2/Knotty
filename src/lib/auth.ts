// ─────────────────────────────────────────────────────────────────────────────
// Auth abstraction layer
//
// REPLACING WITH AWS COGNITO (Amplify v6):
//   1. npm install aws-amplify
//   2. Create src/lib/amplifyConfig.ts and call Amplify.configure({ Auth: { ... } })
//   3. Import it once in main.tsx: import './lib/amplifyConfig'
//   4. Swap each function body below with the commented Cognito equivalent
// ─────────────────────────────────────────────────────────────────────────────

// import {
//   signIn as cognitoSignIn,
//   signUp as cognitoSignUp,
//   confirmSignUp as cognitoConfirmSignUp,
//   signOut as cognitoSignOut,
//   getCurrentUser as cognitoGetCurrentUser,
//   fetchUserAttributes,
// } from 'aws-amplify/auth'

export type AuthUser = {
  email: string
  /** Display name — from Cognito's `name` attribute or derived from email */
  name: string
}

// ── Sign in ──────────────────────────────────────────────────────────────────

/**
 * Cognito replacement:
 *   const { isSignedIn } = await cognitoSignIn({ username: email, password })
 *   if (!isSignedIn) throw new Error('Additional sign-in step required.')
 *   const attrs = await fetchUserAttributes()
 *   return { email: attrs.email ?? email, name: attrs.name ?? email.split('@')[0] }
 */
export async function signIn(email: string, password: string): Promise<AuthUser> {
  if (!email.trim() || !password) throw new Error('Email and password are required.')
  await new Promise((r) => setTimeout(r, 600))
  return { email: email.trim(), name: email.split('@')[0] }
}

// ── Sign up ──────────────────────────────────────────────────────────────────

/**
 * Registers a new user. After this succeeds, call confirmSignUp() with the
 * verification code sent to the user's email.
 *
 * Cognito replacement:
 *   await cognitoSignUp({
 *     username: email,
 *     password,
 *     options: { userAttributes: { email, name } },
 *   })
 */
export async function signUp(email: string, password: string, name: string): Promise<void> {
  if (!email.trim()) throw new Error('Email is required.')
  if (password.length < 8) throw new Error('Password must be at least 8 characters.')
  if (!name.trim()) throw new Error('Name is required.')
  await new Promise((r) => setTimeout(r, 700))
  // Placeholder: registration always succeeds. Replace with Cognito call above.
}

/**
 * Confirms the sign-up with the 6-digit code sent to the user's email.
 * After confirmation, call signIn() to start a session.
 *
 * Cognito replacement:
 *   await cognitoConfirmSignUp({ username: email, confirmationCode: code })
 */
export async function confirmSignUp(email: string, code: string): Promise<void> {
  if (!code.trim()) throw new Error('Verification code is required.')
  await new Promise((r) => setTimeout(r, 500))
  // Placeholder: any non-empty code is accepted. Replace with Cognito call above.
}

// ── Sign out ─────────────────────────────────────────────────────────────────

/**
 * Cognito replacement:
 *   await cognitoSignOut()
 */
export async function signOut(): Promise<void> {
  await new Promise((r) => setTimeout(r, 200))
}

// ── Restore session ──────────────────────────────────────────────────────────

/**
 * Cognito replacement:
 *   try {
 *     const user = await cognitoGetCurrentUser()
 *     const attrs = await fetchUserAttributes()
 *     return { email: attrs.email ?? user.username, name: attrs.name ?? user.username }
 *   } catch { return null }
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  // Placeholder — no persistent session without Cognito.
  return null
}
