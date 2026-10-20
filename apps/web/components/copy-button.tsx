'use client';

import { useState } from 'react';
import { Button } from './ui';

export function CopyButton({ value, label = 'Copy link' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      onClick={async () => {
        try {
          if (navigator.share) {
            await navigator.share({ url: value });
            return;
          }
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // user cancelled share or clipboard unavailable
        }
      }}
    >
      {copied ? 'Copied' : label}
    </Button>
  );
}
