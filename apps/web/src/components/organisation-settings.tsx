'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog } from '@base-ui/react/dialog';
import { Building2, Copy, LogOut, UserPlus, X } from 'lucide-react';
import { Button, FormField, StatusBadge } from '@svara/ui';
import {
  inviteInputSchema,
  memberUpdateSchema,
  organisationInputSchema,
  staffRoleSchema,
} from '@svara/contracts';
import {
  broadcastSessionChange,
  errorMessage,
  navigateWithFreshSession,
  staffData,
} from '../lib/staff-api';
import type { AccessLink, StaffMember } from '../lib/staff-api';
import { useStaffSession } from './session-provider';

const roleLabels = {
  OWNER: 'Owner',
  ADMINISTRATOR: 'Administrator',
  OPERATOR: 'Operator',
  VIEWER: 'Viewer',
};
function RoleOptions() {
  return staffRoleSchema.options.map((role) => (
    <option key={role} value={role}>
      {roleLabels[role]}
    </option>
  ));
}

function LinkResult({ value, dismiss }: { value: AccessLink; dismiss: () => void }) {
  const [copied, setCopied] = useState('');
  return (
    <div className="link-result">
      <strong>One-use access link</strong>
      <p className="small">
        Share this privately with the intended person. It expires{' '}
        {new Date(value.expiresAt).toLocaleString()} and is only shown here once.
      </p>
      <FormField
        label="Access link"
        value={value.url}
        readOnly
        onFocus={(event) => event.currentTarget.select()}
      />
      <div className="link-result-actions">
        <Button
          onClick={() => {
            void navigator.clipboard
              .writeText(value.url)
              .then(() => setCopied('Link copied.'))
              .catch(() => setCopied('Select the link and copy it manually.'));
          }}
        >
          <Copy size={15} aria-hidden="true" />
          Copy link
        </Button>
        <Button variant="quiet" onClick={dismiss}>
          Done
        </Button>
      </div>
      <p role="status" className="small">
        {copied}
      </p>
    </div>
  );
}

function MemberAccess({
  member,
  self,
  onSaved,
  onLink,
}: {
  member: StaffMember;
  self: boolean;
  onSaved: () => Promise<unknown>;
  onLink: (link: AccessLink) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = new FormData(event.currentTarget);
    const parsed = memberUpdateSchema.safeParse({
      role: input.get('role'),
      enabled: input.get('enabled') === 'on',
    });
    if (!parsed.success) {
      setError('Choose a valid role and access state.');
      return;
    }
    setPending(true);
    setError('');
    try {
      await staffData(`/members/${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify(parsed.data),
      });
      if (self && (parsed.data.role !== member.role || parsed.data.enabled !== member.enabled)) {
        broadcastSessionChange();
        navigateWithFreshSession('/login');
        return;
      }
      await onSaved();
      setOpen(false);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }
  async function recover() {
    setPending(true);
    setError('');
    try {
      onLink(
        await staffData<AccessLink>(`/members/${member.id}/recovery`, {
          method: 'POST',
          body: '{}',
        }),
      );
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }
  return (
    <div>
      <div className="member-actions">
        <Dialog.Root
          open={open}
          onOpenChange={(value) => {
            if (!pending) {
              setOpen(value);
              setError('');
            }
          }}
        >
          <Dialog.Trigger className="button button--secondary">
            Manage {member.user.displayName}
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Backdrop className="dialog-backdrop" />
            <Dialog.Popup className="dialog-popup">
              <Dialog.Close
                disabled={pending}
                className="button button--quiet dialog-close"
                aria-label="Close member access"
              >
                <X size={18} aria-hidden="true" />
              </Dialog.Close>
              <Dialog.Title className="dialog-title">Member access</Dialog.Title>
              <Dialog.Description className="muted">
                Change access for {member.user.email}. Role or access changes sign this member out.
                Your organisation must keep at least one enabled owner.
              </Dialog.Description>
              <form onSubmit={(event) => void update(event)} className="staff-form">
                {error && (
                  <p role="alert" className="form-notice form-notice--error">
                    {error}
                  </p>
                )}
                <div className="select-field">
                  <label htmlFor={`role-${member.id}`}>Role</label>
                  <select
                    id={`role-${member.id}`}
                    name="role"
                    className="input"
                    defaultValue={member.role}
                  >
                    <RoleOptions />
                  </select>
                </div>
                <label>
                  <input type="checkbox" name="enabled" defaultChecked={member.enabled} /> Enable
                  workspace access
                </label>
                {self && (
                  <p className="small muted">
                    This is your own membership. Changing your role or access will sign you out.
                  </p>
                )}
                <Button type="submit" variant="primary" pending={pending}>
                  Save member access
                </Button>
              </form>
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
        <Button
          variant="quiet"
          pending={pending}
          disabled={!member.enabled}
          onClick={() => void recover()}
        >
          Create recovery link
        </Button>
      </div>
      {error && !open && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function OrganisationSettings() {
  const { identity } = useStaffSession();
  const owner = identity.membership.role === 'OWNER';
  const [pending, setPending] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [link, setLink] = useState<AccessLink | null>(null);
  const members = useQuery({
    queryKey: ['members', identity.organisation.id],
    queryFn: ({ signal }) => staffData<StaffMember[]>('/members', { signal }),
  });
  async function action(name: string, run: () => Promise<unknown>) {
    if (pending) return;
    setPending(name);
    setNotice('');
    setError('');
    try {
      await run();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending('');
    }
  }
  function saveOrganisation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = organisationInputSchema.safeParse(
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (!parsed.success) {
      setError('Enter an organisation name and a valid IANA timezone, such as Asia/Kathmandu.');
      return;
    }
    void action('organisation', async () => {
      await staffData('/organisation', { method: 'PATCH', body: JSON.stringify(parsed.data) });
      setNotice('Organisation saved.');
    });
  }
  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = inviteInputSchema.safeParse(Object.fromEntries(new FormData(form)));
    if (!parsed.success) {
      setError('Enter a valid email and choose a staff role.');
      return;
    }
    void action('invite', async () => {
      setLink(
        await staffData<AccessLink>('/members/invitations', {
          method: 'POST',
          body: JSON.stringify(parsed.data),
        }),
      );
      form.reset();
      setNotice('Invitation created. Copy the link below.');
    });
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKSPACE & PEOPLE</p>
          <h1>Organisation settings</h1>
          <p className="page-description">A shared space. Clear responsibilities.</p>
        </div>
        <StatusBadge tone="accent">{roleLabels[identity.membership.role]}</StatusBadge>
      </div>
      <section className="panel settings-identity" aria-label="Your session">
        <div>
          <strong>{identity.user.displayName}</strong>
          <p className="muted small">{identity.user.email}</p>
        </div>
        <Button
          pending={pending === 'logout'}
          onClick={() =>
            void action('logout', async () => {
              await staffData('/auth/logout', { method: 'POST', body: '{}' });
              broadcastSessionChange();
              navigateWithFreshSession('/login');
            })
          }
        >
          <LogOut size={16} aria-hidden="true" />
          Sign out
        </Button>
      </section>
      {error && (
        <p role="alert" className="form-notice form-notice--error">
          {error}
        </p>
      )}
      <p role="status" className="small">
        {notice}
      </p>
      <div className="settings-grid">
        <section className="panel settings-section">
          <div className="settings-heading">
            <Building2 size={21} aria-hidden="true" />
            <h2>Your organisation</h2>
          </div>
          <p className="muted small">
            {owner
              ? 'Set the name and local timezone for this workspace.'
              : 'Only owners can update organisation settings.'}
          </p>
          <form onSubmit={saveOrganisation} className="staff-form">
            <FormField
              label="Organisation name"
              name="name"
              defaultValue={identity.organisation.name}
              maxLength={160}
              required
              disabled={!owner}
            />
            <FormField
              label="Timezone"
              name="timezone"
              defaultValue={identity.organisation.timezone}
              maxLength={64}
              help="IANA timezone, for example Asia/Kathmandu."
              required
              disabled={!owner}
            />
            {owner && (
              <Button type="submit" variant="primary" pending={pending === 'organisation'}>
                Save organisation
              </Button>
            )}
          </form>
          {identity.memberships.length > 1 && (
            <form
              className="staff-form"
              onSubmit={(event) => {
                event.preventDefault();
                const organisationId = new FormData(event.currentTarget).get('organisationId');
                void action('switch', async () => {
                  await staffData('/auth/organisation', {
                    method: 'POST',
                    body: JSON.stringify({ organisationId }),
                  });
                  broadcastSessionChange();
                  navigateWithFreshSession('/studio');
                });
              }}
            >
              <div className="select-field">
                <label htmlFor="workspace-select">Active workspace</label>
                <select
                  id="workspace-select"
                  className="input"
                  name="organisationId"
                  defaultValue={identity.organisation.id}
                >
                  {identity.memberships.map((membership) => (
                    <option value={membership.organisation.id} key={membership.id}>
                      {membership.organisation.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" pending={pending === 'switch'}>
                Switch workspace
              </Button>
            </form>
          )}
        </section>
        <section className="panel settings-section">
          <div className="settings-heading">
            <UserPlus size={21} aria-hidden="true" />
            <h2>Invite your team</h2>
          </div>
          <p className="muted small">
            {owner
              ? 'Create an invitation and share the one-use link privately with your teammate.'
              : 'Ask an owner to invite teammates or change staff access.'}
          </p>
          {owner && (
            <form onSubmit={invite} className="staff-form">
              <FormField label="Invite email" name="email" type="email" maxLength={254} required />
              <div className="select-field">
                <label htmlFor="invite-role">Invitation role</label>
                <select id="invite-role" name="role" className="input" defaultValue="VIEWER">
                  <RoleOptions />
                </select>
              </div>
              <Button type="submit" variant="primary" pending={pending === 'invite'}>
                Create invitation
              </Button>
            </form>
          )}
          <p className="small muted">
            Owners manage people and settings. Administrators manage content and devices. Operators
            manage devices. Viewers inspect activity.
          </p>
        </section>
        <section
          className="panel settings-section settings-members"
          aria-labelledby="members-heading"
        >
          <h2 id="members-heading">Team members</h2>
          <p className="muted small">Access is scoped to {identity.organisation.name}.</p>
          {link && <LinkResult key={link.url} value={link} dismiss={() => setLink(null)} />}
          {members.isPending && <p role="status">Loading team members…</p>}
          {members.isError && (
            <div role="alert">
              <p>{errorMessage(members.error)}</p>
              <Button onClick={() => void members.refetch()}>Retry members</Button>
            </div>
          )}
          <div className="member-list">
            {members.data?.map((member) => (
              <div key={member.id} className="member-row">
                <div>
                  <strong>
                    {member.user.displayName}
                    {member.id === identity.membership.id ? ' (you)' : ''}
                  </strong>
                  <p className="muted small">{member.user.email}</p>
                  <p>
                    <StatusBadge tone={member.enabled ? 'neutral' : 'warning'}>
                      {roleLabels[member.role]} · {member.enabled ? 'Enabled' : 'Disabled'}
                    </StatusBadge>
                  </p>
                </div>
                {owner && (
                  <MemberAccess
                    key={`${member.id}:${member.role}:${member.enabled}`}
                    member={member}
                    self={member.id === identity.membership.id}
                    onSaved={() => members.refetch()}
                    onLink={setLink}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
