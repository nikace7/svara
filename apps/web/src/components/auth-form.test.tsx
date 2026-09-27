import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AuthForm } from './auth-form';

describe('AuthForm', () => {
  it.each(['login', 'register', 'activate', 'recover'] as const)(
    'posts the %s form natively so a pre-hydration submit keeps secrets out of the URL',
    (mode) => {
      const form = renderToStaticMarkup(<AuthForm mode={mode} />).match(/<form[^>]*>/)?.[0];
      expect(form).toContain('method="post"');
      expect(form).toContain(`action="/${mode}"`);
    },
  );
});
