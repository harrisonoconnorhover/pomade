'use client';
// The Sites dispatcher owns sign-out and requires a top-level navigation.
/* oxlint-disable next/no-html-link-for-pages */
import { useEffect, useState } from 'react';
import { KeyRound, UserRound } from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import type { ConnectionDefinition } from '@/lib/account-connections';
type Account = { id: string; email: string; role: string; status: string };
type Connection = ConnectionDefinition & {
  configured: boolean;
  label?: string;
  updatedAt?: number;
};
type Settings = {
  enabled: boolean;
  account?: Account;
  members?: Account[];
  connections?: Connection[];
};
export default function AccountSettings() {
  const [open, setOpen] = useState(false),
    [data, setData] = useState<Settings>(),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [selected, setSelected] = useState<Connection>();
  const [values, setValues] = useState<Record<string, string>>({}),
    [label, setLabel] = useState(''),
    [email, setEmail] = useState('');
  async function load() {
    const response = await fetch('/api/account', { cache: 'no-store' });
    const result = (await response.json()) as Settings & {
      error?: string;
      message?: string;
    };
    if (!response.ok)
      throw new Error(result.error ?? 'Account settings could not be loaded.');
    setData(result);
  }
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch('/api/account', { cache: 'no-store' })
      .then(async (response) => {
        const result = (await response.json()) as Settings & { error?: string };
        if (!response.ok)
          throw new Error(
            result.error ?? 'Account settings could not be loaded.',
          );
        if (!cancelled) setData(result);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);
  async function action(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/account', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as Settings & {
        error?: string;
        message?: string;
      };
      if (!response.ok)
        throw new Error(result.error ?? 'Account change failed.');
      setMessage(result.message ?? 'Saved.');
      setSelected(undefined);
      setValues({});
      setLabel('');
      setEmail('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Account change failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <UserRound /> Account
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) {
            setOpen(value);
            setValues({});
            setSelected(undefined);
            setError('');
            setMessage('');
          }
        }}
      >
        <DialogContent className="account-dialog">
          <DialogHeader>
            <DialogTitle>Your Pomade account</DialogTitle>
            <DialogDescription>
              {data?.account?.email ??
                'Personal connections and private tables'}
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert" className="account-error">
              {error}
            </p>
          ) : null}
          {message ? (
            <output className="account-notice">{message}</output>
          ) : null}
          {!data ? (
            <p>Loading your account…</p>
          ) : !data.enabled ? (
            <p>
              This installation uses local connection settings. Private member
              accounts are available on the hosted site.
            </p>
          ) : (
            <>
              <p className="account-intro">
                Your tables, research, and saved connections belong to this
                account. Add your own provider keys to start enriching.
              </p>
              {selected ? (
                <form
                  className="account-connection-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action({
                      action: 'save',
                      provider: selected.id,
                      values,
                      label,
                    });
                  }}
                >
                  <h3>
                    {selected.configured ? 'Replace' : 'Connect'}{' '}
                    {selected.name}
                  </h3>
                  <p>{selected.help}</p>
                  {selected.id === 'hubspot' || selected.id === 'salesforce' ? (
                    <p>
                      Changing a CRM connection stops queued work and pauses
                      refreshes. Preview the CRM source again before restarting.
                    </p>
                  ) : null}
                  <label>
                    Connection name
                    <input
                      value={label}
                      maxLength={100}
                      placeholder="My account"
                      onChange={(e) => setLabel(e.target.value)}
                    />
                  </label>
                  {selected.fields.map((field) => (
                    <label key={field.key}>
                      {field.label}
                      <input
                        type={field.public ? 'text' : 'password'}
                        autoComplete="off"
                        required={field.required}
                        value={values[field.key] ?? ''}
                        onChange={(e) =>
                          setValues((current) => ({
                            ...current,
                            [field.key]: e.target.value,
                          }))
                        }
                      />
                    </label>
                  ))}
                  <div className="account-actions">
                    <Button type="submit" disabled={busy}>
                      {busy ? 'Saving…' : 'Save connection'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setSelected(undefined);
                        setValues({});
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="account-connections">
                  {data.connections?.map((c) => (
                    <article key={c.id}>
                      <div className="account-connection-title">
                        <KeyRound size={16} />
                        <strong>{c.name}</strong>
                        <span>
                          {c.configured ? 'Connected' : 'Not connected'}
                        </span>
                      </div>
                      <p>{c.configured ? c.label : c.help}</p>
                      <div className="account-actions">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setSelected(c);
                            setValues({});
                            setLabel(c.label ?? '');
                            setMessage('');
                            setError('');
                          }}
                        >
                          {c.configured ? 'Replace connection' : 'Connect'}
                        </Button>
                        {c.configured &&
                        (c.id === 'hubspot' || c.id === 'salesforce') ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void action({ action: 'test', provider: c.id })
                            }
                          >
                            Test read access
                          </Button>
                        ) : null}
                        {c.configured ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() =>
                              void action({
                                action: 'disconnect',
                                provider: c.id,
                              })
                            }
                          >
                            Disconnect
                          </Button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              )}
              {data.account?.role === 'owner' ? (
                <section className="account-people">
                  <h3>Friends beta</h3>
                  <p>
                    Allow up to three friends. They also need to be added as
                    visitors in this private website’s sharing settings, using
                    the same email. Allowing an account here does not send an
                    email.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action({ action: 'invite', email });
                    }}
                  >
                    <label>
                      Friend’s email
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="friend@example.com"
                      />
                    </label>
                    <Button type="submit" disabled={busy}>
                      Allow account
                    </Button>
                  </form>
                  <ul>
                    {data.members?.map((member) => (
                      <li key={member.id}>
                        <div>
                          <strong>{member.email}</strong>
                          <small>
                            {member.role === 'owner'
                              ? 'Owner'
                              : member.status === 'active'
                                ? 'Active'
                                : member.status === 'disabled'
                                  ? 'Access revoked'
                                  : 'Waiting for first sign-in'}
                          </small>
                        </div>
                        {member.role !== 'owner' &&
                        member.status !== 'disabled' ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() =>
                              void action({
                                action: 'revoke',
                                accountId: member.id,
                              })
                            }
                          >
                            Revoke access
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              <a
                className="account-signout"
                href="/signout-with-chatgpt?return_to=%2F"
                target="_top"
              >
                Sign out
              </a>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
