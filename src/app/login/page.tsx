'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      setError('Incorrect password');
      return;
    }
    router.push('/');
  }

  return (
    <main style={{ maxWidth: 320, margin: '4rem auto', fontFamily: 'sans-serif' }}>
      <h1>walletcontrol</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem' }}
        />
        <button type="submit" style={{ width: '100%', padding: '0.5rem' }}>
          Log in
        </button>
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </form>
    </main>
  );
}
