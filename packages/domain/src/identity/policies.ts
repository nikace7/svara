import { IdentityError } from './errors.js';

export type StaffRole = 'OWNER' | 'ADMINISTRATOR' | 'OPERATOR' | 'VIEWER';
export type Permission =
  | 'manage_access'
  | 'author'
  | 'publish'
  | 'operate_devices'
  | 'manage_public_links'
  | 'inspect'
  | 'delete_transcripts';

const policies: Record<Permission, readonly StaffRole[]> = {
  manage_access: ['OWNER'],
  author: ['OWNER', 'ADMINISTRATOR'],
  publish: ['OWNER', 'ADMINISTRATOR'],
  operate_devices: ['OWNER', 'ADMINISTRATOR', 'OPERATOR'],
  manage_public_links: ['OWNER', 'ADMINISTRATOR'],
  inspect: ['OWNER', 'ADMINISTRATOR', 'OPERATOR', 'VIEWER'],
  delete_transcripts: ['OWNER', 'ADMINISTRATOR'],
};

export function can(role: StaffRole, permission: Permission): boolean {
  return policies[permission].includes(role);
}

export function requirePermission(role: StaffRole, permission: Permission): void {
  if (!can(role, permission)) throw new IdentityError('FORBIDDEN');
}
