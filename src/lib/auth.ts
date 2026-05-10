import {
  confirmSignUp as cognitoConfirmSignUp,
  fetchUserAttributes,
  getCurrentUser as cognitoGetCurrentUser,
  signIn as cognitoSignIn,
  signInWithRedirect,
  signOut as cognitoSignOut,
  signUp as cognitoSignUp,
} from 'aws-amplify/auth'
import { isCognitoConfigured } from './amplifyConfig'

export type AuthUser = {
  email: string
  /** Display name — from Cognito's `name` attribute or derived from email */
  name: string
}

const missingConfigMessage =
  'Cognito is missing VITE_COGNITO_USER_POOL_ID. Add it to your Amplify environment variables and restart the app.'

function assertCognitoConfigured() {
  if (!isCognitoConfigured) {
    throw new Error(missingConfigMessage)
  }
}

function getReadableAuthError(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message
  return fallback
}

function authUserFromAttributes(username: string, attrs: Record<string, string | undefined>): AuthUser {
  const email = attrs.email ?? username
  return {
    email,
    name: attrs.name ?? email.split('@')[0],
  }
}

// ── Sign in ──────────────────────────────────────────────────────────────────

export async function signIn(email: string, password: string): Promise<AuthUser> {
  if (!email.trim() || !password) throw new Error('Email and password are required.')
  assertCognitoConfigured()

  try {
    const result = await cognitoSignIn({ username: email.trim(), password })
    if (!result.isSignedIn) {
      throw new Error(`Additional sign-in step required: ${result.nextStep.signInStep}`)
    }

    const attrs = await fetchUserAttributes()
    return authUserFromAttributes(email.trim(), attrs)
  } catch (err) {
    throw new Error(getReadableAuthError(err, 'Sign-in failed. Please try again.'), { cause: err })
  }
}

// ── Sign up ──────────────────────────────────────────────────────────────────

export async function signUp(email: string, password: string, name: string): Promise<void> {
  if (!email.trim()) throw new Error('Email is required.')
  if (password.length < 8) throw new Error('Password must be at least 8 characters.')
  if (!name.trim()) throw new Error('Name is required.')
  assertCognitoConfigured()

  try {
    await cognitoSignUp({
      username: email.trim(),
      password,
      options: {
        userAttributes: {
          email: email.trim(),
          name: name.trim(),
        },
      },
    })
  } catch (err) {
    throw new Error(getReadableAuthError(err, 'Sign-up failed. Please try again.'), { cause: err })
  }
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
  if (!code.trim()) throw new Error('Verification code is required.')
  assertCognitoConfigured()

  try {
    await cognitoConfirmSignUp({ username: email.trim(), confirmationCode: code.trim() })
  } catch (err) {
    throw new Error(getReadableAuthError(err, 'Verification failed. Please try again.'), { cause: err })
  }
}

export async function signInWithHostedUi(): Promise<void> {
  assertCognitoConfigured()
  await signInWithRedirect()
}

// ── Sign out ─────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  if (!isCognitoConfigured) return
  await cognitoSignOut()
}

// ── Restore session ──────────────────────────────────────────────────────────

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!isCognitoConfigured) return null

  try {
    const user = await cognitoGetCurrentUser()
    const attrs = await fetchUserAttributes()
    return authUserFromAttributes(user.username, attrs)
  } catch {
    return null
  }
}
