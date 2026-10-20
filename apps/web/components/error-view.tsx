'use client';

import { Button, Card, Page } from './ui';

/** Shared error boundary UI for route segments. */
export function ErrorView({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Page title="Something went wrong">
      <Card className="space-y-3">
        <p className="text-sm">{error.message || 'The request could not be completed.'}</p>
        {error.digest ? <p className="text-xs text-muted">Reference {error.digest}</p> : null}
        <Button type="button" variant="secondary" onClick={() => reset()}>
          Try again
        </Button>
      </Card>
    </Page>
  );
}
