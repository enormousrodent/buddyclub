'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Icon, Input } from '../../components/ui';

/** Join a session by its short code (the same code the QR encodes). */
export function JoinCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const clean = code
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (clean.length >= 6) router.push(`/join/${clean}`);
      }}
    >
      <label className="sr-only" htmlFor="join-code">
        Session code
      </label>
      <Input
        id="join-code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Enter a session code"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        inputMode="text"
        maxLength={32}
      />
      <Button type="submit" variant="secondary" disabled={clean.length < 6}>
        <Icon name="qr" size={18} />
        Join
      </Button>
    </form>
  );
}
