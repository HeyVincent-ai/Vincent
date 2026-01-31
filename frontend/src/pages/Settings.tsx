import { useState } from 'react';
import { useAuth } from '../auth';
import { updateTelegram, generateTelegramLink } from '../api';

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const [tgUsername, setTgUsername] = useState(user?.telegramUsername || '');
  const [linkingCode, setLinkingCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSaveTelegram = async () => {
    if (!tgUsername.trim()) return;
    setSaving(true);
    setMessage('');
    try {
      await updateTelegram(tgUsername.trim());
      await refreshUser();
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
    } catch {
      setMessage('Failed to generate linking code.');
    }
  };

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="bg-white rounded-lg border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Telegram Notifications</h2>

        {message && <div className="bg-blue-50 text-blue-700 p-3 rounded mb-4 text-sm">{message}</div>}

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
          <p>Status: {user?.telegramLinked ? <span className="text-green-600 font-medium">Connected</span> : <span className="text-yellow-600 font-medium">Not linked</span>}</p>
        </div>

        {user?.telegramUsername && !user.telegramLinked && (
          <div>
            <button
              onClick={handleGenerateLink}
              className="text-sm bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200 border"
            >
              Generate Linking Code
            </button>
            {linkingCode && (
              <div className="mt-3 bg-gray-50 border rounded p-3 text-sm">
                <p className="font-medium mb-1">Send this to the SafeSkills bot on Telegram:</p>
                <code className="bg-white px-2 py-1 rounded border text-sm">/start {linkingCode}</code>
                <p className="text-xs text-gray-500 mt-1">Expires in 10 minutes.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
