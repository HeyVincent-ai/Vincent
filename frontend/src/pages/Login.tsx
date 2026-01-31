import { useState } from 'react';
import { sendMagicLink } from '../api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await sendMagicLink(email);
      setSent(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to send magic link';
      setError(msg);
    }
  };

  if (sent) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-sm border max-w-md w-full text-center">
          <h2 className="text-xl font-semibold mb-2">Check your email</h2>
          <p className="text-gray-600">We sent a magic link to <strong>{email}</strong>. Click the link to sign in.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-sm border max-w-md w-full">
        <h1 className="text-2xl font-bold mb-6 text-center">Sign in to SafeSkills</h1>
        {error && <div className="bg-red-50 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="you@example.com"
          />
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 font-medium"
          >
            Send Magic Link
          </button>
        </form>
      </div>
    </div>
  );
}
