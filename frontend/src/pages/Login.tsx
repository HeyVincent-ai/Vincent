import { StytchLogin } from '@stytch/react';
import { Products } from '@stytch/vanilla-js';
import { Link } from 'react-router-dom';

const loginConfig = {
  products: [Products.emailMagicLinks, Products.oauth],
  emailMagicLinksOptions: {
    loginRedirectURL: `${window.location.origin}/auth/callback`,
    loginExpirationMinutes: 15,
    signupRedirectURL: `${window.location.origin}/auth/callback`,
    signupExpirationMinutes: 15,
  },
  sessionOptions: {
    sessionDurationMinutes: 44640, // 31 days
  },
};

export default function Login() {
  return (
    <div className="min-h-screen bg-background dot-grid-bg flex flex-col items-center justify-center">
      <div className="bg-card p-8 rounded-lg border border-border max-w-md w-full">
        <h1 className="text-2xl font-bold mb-6 text-center text-foreground">Sign in to Vincent</h1>
        <StytchLogin config={loginConfig} />
      </div>
      <Link to="/" className="mt-6 text-sm text-muted-foreground hover:text-foreground transition-colors">
        &larr; Back to home
      </Link>
    </div>
  );
}
