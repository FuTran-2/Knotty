import { Amplify } from 'aws-amplify'
import type { ResourcesConfig } from 'aws-amplify'

const defaultRedirectUri =
  typeof window === 'undefined' ? 'https://main.d3c520skipl9wg.amplifyapp.com/' : window.location.origin + '/'

export const cognitoConfig = {
  region: import.meta.env.VITE_COGNITO_REGION ?? 'us-east-1',
  userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID ?? '',
  userPoolClientId: import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID ?? '6l6dbetsu8fct04kr5eid7deo4',
  domain: import.meta.env.VITE_COGNITO_DOMAIN ?? 'us-east-1sutvlkyhi.auth.us-east-1.amazoncognito.com',
  redirectSignIn: import.meta.env.VITE_COGNITO_REDIRECT_SIGN_IN ?? defaultRedirectUri,
  redirectSignOut: import.meta.env.VITE_COGNITO_REDIRECT_SIGN_OUT ?? defaultRedirectUri,
}

export const isCognitoConfigured =
  Boolean(cognitoConfig.userPoolId) && Boolean(cognitoConfig.userPoolClientId)

if (isCognitoConfigured) {
  const amplifyConfig: ResourcesConfig = {
    Auth: {
      Cognito: {
        userPoolId: cognitoConfig.userPoolId,
        userPoolClientId: cognitoConfig.userPoolClientId,
        loginWith: {
          email: true,
          oauth: {
            domain: cognitoConfig.domain,
            scopes: ['email', 'openid', 'phone'],
            redirectSignIn: [cognitoConfig.redirectSignIn],
            redirectSignOut: [cognitoConfig.redirectSignOut],
            responseType: 'code',
          },
        },
      },
    },
  }

  Amplify.configure(amplifyConfig)
}
