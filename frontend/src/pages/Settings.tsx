import { useState } from 'react';
import { useAuth } from '../auth';
import { updateTelegram, generateTelegramLink } from '../api';

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const [tgUsername, setTgUsername] = useState(user?.telegramUsername || '');
  const [linkingCode, setLinkingCode] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSaveTelegram = async () => {
    if (!tgUsername.trim()) return;
    setSaving(true);
    setMessage('');
    try {
      await updateTelegram(tgUsername.trim());
      await refreshUser();
      setLinkingCode(null);
      setMessage('Telegram username updated.');
    } catch {
      setMessage('Failed to update Telegram username.');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateLink = async () => {
    try {
      const res = await generateTelegramLink();
      setLinkingCode(res.data.data.linkingCode);
      setBotUsername(res.data.data.botUsername);
    } catch {
      setMessage('Failed to generate linking code.');
    }
  };

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="bg-white rounded-lg border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Telegram Notifications</h2>
        <p className="text-sm text-gray-600 mb-4">
          Connect your Telegram account to receive approval requests when your agents need
          authorization to perform actions.
        </p>

        {message && (
          <div className="bg-blue-50 text-blue-700 p-3 rounded mb-4 text-sm">{message}</div>
        )}

        <label className="block text-sm font-medium text-gray-700 mb-1">Telegram Username</label>
        <div className="flex gap-2 mb-4">
          <input
            value={tgUsername}
            onChange={(e) => setTgUsername(e.target.value)}
            placeholder="@yourusername"
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
          <button
            onClick={handleSaveTelegram}
            disabled={saving}
            className="text-sm bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Save
          </button>
        </div>

        <div className="text-sm text-gray-600 mb-4">
          <p>
            Status:{' '}
            {user?.telegramLinked ? (
              <span className="text-green-600 font-medium">Connected</span>
            ) : (
              <span className="text-yellow-600 font-medium">Not linked</span>
            )}
          </p>
        </div>

        {user?.telegramUsername && !user.telegramLinked && (
          <div>
            <div className="bg-gray-50 border rounded p-4 mb-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">How to connect</h3>
              <ol className="text-sm text-gray-600 list-decimal list-inside space-y-1">
                <li>Click "Generate Linking Code" below</li>
                <li>
                  Open Telegram and search for <strong>{botUsername || 'the Vincent bot'}</strong>
                  {botUsername && (
                    <>
                      {' '}
                      —{' '}
                      <a
                        href={`https://t.me/${botUsername}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        t.me/{botUsername}
                      </a>
                    </>
                  )}
                </li>
                <li>Send the bot the linking command shown below</li>
              </ol>
            </div>

            <button
              onClick={handleGenerateLink}
              className="text-sm bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200 border"
            >
              Generate Linking Code
            </button>
            {linkingCode && (
              <div className="mt-3 bg-gray-50 border rounded p-3 text-sm">
                <p className="font-medium mb-1">Send this message to the bot:</p>
                <code className="bg-white px-2 py-1 rounded border text-sm">
                  /start {linkingCode}
                </code>
                <p className="text-xs text-gray-500 mt-1">Expires in 10 minutes.</p>
              </div>
            )}
          </div>
        )}

        {user?.telegramLinked && (
          <div className="bg-green-50 border border-green-200 rounded p-3 text-sm text-green-800">
            Your Telegram account is connected. You will receive approval requests via Telegram.
          </div>
        )}
      </div>
    </div>
  );
}
