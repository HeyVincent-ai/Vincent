import { StytchLogin } from '@stytch/react';
import { Products } from '@stytch/vanilla-js';
import { Link } from 'react-router-dom';

const loginConfig = {
  products: [Products.emailMagicLinks, Products.oauth],
  emailMagicLinksOptions: {
    loginRedirectURL: `${window.location.origin}/auth/callback`,
    loginExpirationMinutes: 10080,
    signupRedirectURL: `${window.location.origin}/auth/callback`,
    signupExpirationMinutes: 10080,
  },
  // oauthOptions: {
  //   providers: [{ type: OAuthProviders.Google }],
  //   loginRedirectURL: `${window.location.origin}/auth/callback`,
  //   signupRedirectURL: `${window.location.origin}/auth/callback`,
  // },
};

export default function Login() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-sm border max-w-md w-full">
        <h1 className="text-2xl font-bold mb-6 text-center">Sign in to Vincent</h1>
        <StytchLogin config={loginConfig} />
      </div>
      <Link to="/" className="mt-6 text-sm text-gray-500 hover:text-gray-700 transition-colors">
        ← Back to home
      </Link>
    </div>
  );
}
