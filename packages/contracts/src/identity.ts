import { z } from 'zod';

export const staffRoleSchema = z.enum(['OWNER', 'ADMINISTRATOR', 'OPERATOR', 'VIEWER']);
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const name = z.string().trim().min(1).max(160);
const password = z.string().min(12).max(128);
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const registerInputSchema = z.strictObject({
  email,
  displayName: name,
  organisationName: name,
  password,
});
export const loginInputSchema = z.strictObject({ email, password: z.string().min(1).max(128) });
export const inviteInputSchema = z.strictObject({ email, role: staffRoleSchema });
export const activateInputSchema = z.strictObject({ token, displayName: name, password });
export const recoverInputSchema = z.strictObject({ token, password });
export const memberUpdateSchema = z.strictObject({ role: staffRoleSchema, enabled: z.boolean() });
export const organisationInputSchema = z.strictObject({
  name,
  timezone: z
    .string()
    .max(64)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }),
});

export const resourceIdSchema = z.uuid();
