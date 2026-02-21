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

const stytchStyles = {
  container: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    width: '100%',
  },
  colors: {
    primary: '#8b5cf6',
    secondary: '#a78bfa',
    success: '#22c55e',
    error: '#ef4444',
  },
  fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
  hideHeaderText: true,
  buttons: {
    primary: {
      backgroundColor: '#8b5cf6',
      textColor: '#ffffff',
      borderColor: '#8b5cf6',
      borderRadius: '8px',
    },
  },
  inputs: {
    backgroundColor: '#0d0f14',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '8px',
    textColor: '#f1f1f4',
    placeholderColor: 'rgba(255, 255, 255, 0.25)',
  },
  logo: {
    logoImageUrl: '',
  },
};

export default function Login() {
  return (
    <div className="min-h-screen bg-background dot-grid-bg flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-6">
          <Link to="/" className="inline-block mb-4">
            <img
              src="/vincent-logo.svg"
              alt="Vincent"
              style={{ height: 28, width: 'auto', filter: 'invert(1)', opacity: 0.9 }}
            />
          </Link>
          <p className="text-sm text-muted-foreground">
            Sign in or create an account to launch your agent.
          </p>
        </div>
        <div className="bg-card rounded-xl border border-border p-6">
          <StytchLogin config={loginConfig} styles={stytchStyles} />
        </div>
      </div>
    </div>
  );
}
