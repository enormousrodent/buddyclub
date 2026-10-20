'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Alert, Button, Icon } from '../../../../components/ui';
import { joinFromCode } from './actions';

export function JoinButton({ slug, checkedIn }: { slug: string; checkedIn: boolean }) {
  const [state, action, pending] = useActionState(
    async () => joinFromCode(slug),
    {} as Awaited<ReturnType<typeof joinFromCode>>,
  );
  if (state.ok)
    return (
      <div className="space-y-3">
        <Alert tone="success">{state.message}</Alert>
        {state.link ? (
          <Link
            href={state.link}
            className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-[14px] bg-primary text-base font-bold text-primary-ink"
          >
            Show my court
          </Link>
        ) : null}
      </div>
    );
  return (
    <form action={action} className="space-y-3">
      <Button type="submit" size="lg" className="w-full" disabled={pending || checkedIn}>
        <Icon name="check" size={18} />
        {pending ? 'Working…' : checkedIn ? 'Checked in' : "I'm here"}
      </Button>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
    </form>
  );
}
