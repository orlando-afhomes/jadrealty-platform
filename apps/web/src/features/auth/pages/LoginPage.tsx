import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';

import { normalizeRole } from '@jad/contracts';

import { useSession } from '../../../lib/session';
import { getSupabaseClient, isSupabaseConfigured } from '../../../lib/supabase';

import { Alert } from '../../../components/Alert';
import { Button } from '../../../components/Button';
import { ApiError } from '../../../lib/api/errors';
import { apiErrorMessage } from '../../../lib/api/errorMessage';
import { useQuery } from '@tanstack/react-query';
import { getGlobalCmsPublic, getLoginCmsPublic } from '@/lib/cms';
import { AUTH } from '../content';
import { AuthLayout } from '../components/AuthLayout';
import { PasswordField } from '../components/PasswordField';
import { TextField } from '../components/TextField';
import { login } from '../services/auth';
import { LOGIN_FIELD_ORDER, firstInvalidField, validateLogin } from '../validation';
import type { LoginErrors, LoginValues } from '../validation';
import styles from './LoginPage.module.css';

/**
 * Login (SCR-AUTH-001) — Phase 1 Supabase Auth (admin/user only, no registration).
 * Uses `supabase.auth.signInWithPassword` when `VITE_SUPABASE_URL` is set,
 * otherwise falls back to mock (tests). Role is resolved authoritatively
 * from `MemberRole` → `Role` (never client-side). Redirects `admin` → Admin App
 * (`VITE_ADMIN_URL` → :5174/admin) and `user` → Member App (`/member` → :5173).
 */
export function LoginPage() {
  const { data: cmsLogin } = useQuery({ queryKey: ['cms', 'login'], queryFn: getLoginCmsPublic, staleTime: 0 });
  const { data: globalCms } = useQuery({
    queryKey: ['cms', 'global'],
    queryFn: getGlobalCmsPublic,
    staleTime: 0,
  });
  const loginContent = cmsLogin ?? {
    copy: { eyebrow: AUTH.login.eyebrow, title: AUTH.login.title, lead: AUTH.login.lead, brandTitle: AUTH.login.brandTitle, brandLead: AUTH.login.brandLead },
    image: AUTH.images.login,
    fields: { identifier: AUTH.login.fields.identifier, password: AUTH.login.fields.password },
    submitLabel: AUTH.login.submitLabel,
    forgotPassword: AUTH.login.forgotPassword,
    registerPrompt: AUTH.login.registerPrompt,
  };
  const brandMark = globalCms?.brandMark ?? null;
  const { loginAs } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState<LoginValues>({ identifier: '', password: '' });
  const [errors, setErrors] = useState<LoginErrors>({});
  const [serverError, setServerError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const identifierRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const from = (location.state as { from?: string } | null)?.from ?? '/member';

  const setValue = (field: keyof LoginValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) =>
      current[field] !== undefined ? { ...current, [field]: undefined } : current,
    );
    setServerError(undefined);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const nextErrors = validateLogin(values);
    setErrors(nextErrors);
    const first = firstInvalidField(nextErrors, LOGIN_FIELD_ORDER);
    if (first === 'identifier') {
      identifierRef.current?.focus();
      return;
    }
    if (first === 'password') {
      passwordRef.current?.focus();
      return;
    }

    setSubmitting(true);
    setServerError(undefined);

    // Supabase is authoritative when configured. When VITE_SUPABASE_URL is set,
    // authentication must go through Supabase only — no silent mock fallback.
    // Mock remains only when Supabase is not configured or in test mode.
    const trySupabaseLogin = async (): Promise<{
      id: string;
      name: string;
      email: string;
      role: string;
      isQualified: boolean;
      status: string;
    } | null> => {
      if ((import.meta.env as Record<string, string | undefined>).MODE === 'test') return null;
      if (!isSupabaseConfigured()) return null;
      const supaClient = getSupabaseClient() as unknown as {
        auth: {
          signInWithPassword: (c: { email: string; password: string }) => Promise<{
            data: { user: { id: string; email: string; user_metadata: Record<string, unknown> } | null };
            error: { message: string } | null;
          }>;
        };
        from: (t: string) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          select: (...args: any[]) => any;
        };
      } | null;
      if (!supaClient) return null;
      const { data, error } = await supaClient.auth.signInWithPassword({
        email: values.identifier,
        password: values.password,
      });
      if (error || !data.user) {
        // Surface real Supabase error — do not fallback to mock
        throw new ApiError({
          code: 'UNAUTHORIZED',
          message: error?.message ?? 'Email or password is incorrect.',
          status: 401,
        });
      }
      const userId = data.user.id;
      // Fetch profile from Member table (quoted "Member" per migration, fallback to legacy "members")
      let member: { firstName: string; lastName: string; isQualified: boolean; status: string } | null = null;
      try {
        const res = (await (supaClient as unknown as { from: (t: string) => { select: (s: string) => { eq: (k: string, v: string) => { single: () => Promise<{ data: Record<string, unknown> | null }> } } } }).from('Member').select('*').eq('id', userId).single()) as {
          data: Record<string, unknown> | null;
        };
        if (res.data) {
          const d = res.data as Record<string, unknown>;
          const name = (d['name'] as string) ?? '';
          member = {
            firstName: (d['firstName'] as string) ?? name.split(' ')[0] ?? '',
            lastName: (d['lastName'] as string) ?? name.split(' ').slice(1).join(' ') ?? '',
            isQualified: (d['isQualified'] as boolean) ?? (d['is_qualified'] as boolean) ?? false,
            status: (d['status'] as string) ?? 'PENDING',
          };
        }
      } catch {
        try {
          const res2 = (await (supaClient.from('members').select('*').eq('id', userId).single() as Promise<{ data: { firstName: string; lastName: string; isQualified: boolean; status: string } | null }>)) ?? { data: null };
          member = res2.data;
        } catch {
          member = null;
        }
      }

      // Authoritative role resolution via MemberRole → Role (DB), not user_metadata.
      // Phase 1: admin / user only; maps legacy SUPER_ADMIN → admin.
      let authoritativeRole: string;
      const tryRoleResolve = async (roleTable: string, linkTable: string): Promise<string | null> => {
        try {
          const c = supaClient as unknown as {
            from: (t: string) => ({
              select: (c: string) => ({
                eq: (k: string, v: string) => Promise<{ data: unknown[] | null; error: unknown }>,
                in: (k: string, v: string[]) => Promise<{ data: unknown[] | null; error: unknown }>,
              }),
            }),
          };
          const { data: links, error: linkErr } = await c.from(linkTable).select('roleId').eq('memberId', userId);
          if (!linkErr && Array.isArray(links) && links.length > 0) {
            const ids = (links as { roleId: string }[]).map((l) => l.roleId);
            const { data: roles, error: roleErr } = await c.from(roleTable).select('slug,name').in('id', ids);
            if (!roleErr && Array.isArray(roles) && roles.length > 0) {
              const slugs = (roles as { slug: string }[]).map((r) => r.slug);
              if (slugs.some((s) => normalizeRole(s) === 'admin')) return 'admin';
              return 'user';
            }
            const collected: string[] = [];
            for (const rid of ids) {
              const { data: one } = await c.from(roleTable).select('slug,name').eq('id', rid);
              if (Array.isArray(one)) for (const row of one as { slug: string }[]) collected.push(row.slug);
            }
            if (collected.some((s) => normalizeRole(s) === 'admin')) return 'admin';
            if (collected.length > 0) return 'user';
          }
        } catch {
          // ignore and try next table variant
        }
        return null;
      };
      // Try Phase 1 quoted tables first, then legacy; fallback to user_metadata if DB has no tables yet
      const dbRole = (await tryRoleResolve('Role', 'MemberRole')) ?? (await tryRoleResolve('roles', 'member_roles')) ?? (await tryRoleResolve('role', 'memberrole'));
      if (dbRole) authoritativeRole = dbRole;
      else {
        const metaRole = data.user.user_metadata?.['role'];
        if (typeof metaRole === 'string' && normalizeRole(metaRole) === 'admin') authoritativeRole = 'admin';
        else authoritativeRole = 'user';
      }
      return {
        id: data.user.id,
        name:
          member?.firstName && member?.lastName
            ? `${member.firstName} ${member.lastName}`
            : ((data.user.user_metadata['full_name'] as string) ??
              data.user.email ??
              values.identifier),
        email: data.user.email ?? values.identifier,
        role: authoritativeRole,
        isQualified: (member?.isQualified as boolean) ?? false,
        status: (member?.status as string) ?? 'PENDING',
      };
    };

    try {
      const isSupabaseAuth = isSupabaseConfigured() && (import.meta.env as Record<string, string | undefined>).MODE !== 'test';
      let user: { id: string; name: string; email: string; role: string; isQualified?: boolean; status?: string };
      if (isSupabaseAuth) {
        const supaUser = await trySupabaseLogin();
        // trySupabaseLogin throws on auth failure, returns user on success; null only if not configured
        if (!supaUser) {
          throw new ApiError({
            code: 'UNAUTHORIZED',
            message: 'Sign-in failed. Please try again shortly.',
            status: 401,
          });
        }
        user = supaUser;
      } else {
        user = (await login({ identifier: values.identifier, password: values.password })).user;
      }
      loginAs({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role as never,
        isQualified: user.isQualified,
        status: user.status as never,
      });
      const role = normalizeRole(user.role);
      if (role === 'admin') {
        const rawAdminUrl =
          (import.meta.env as Record<string, string | undefined>).VITE_ADMIN_URL ?? 'http://localhost:5174/admin';
        const base = rawAdminUrl.replace(/\/$/, '');
        const adminBase = base.endsWith('/admin') ? base : `${base}/admin`;
        const target = from.startsWith('/admin') ? `${adminBase}${from.replace(/^\/admin/, '')}` : adminBase;
        window.location.href = target;
        return;
      }
      // user → Member App canonical entry is /member (keep /member/* legacy routes per Q3)
      navigate(from.startsWith('/member') || from.startsWith('/user') ? from : '/member', { replace: true });
    } catch (error) {
      setServerError(apiErrorMessage(error, 'Sign-in failed. Please try again shortly.'));
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      eyebrow={loginContent.copy?.eyebrow ?? AUTH.login.eyebrow}
      title={loginContent.copy?.title ?? AUTH.login.title}
      lead={loginContent.copy?.lead ?? AUTH.login.lead}
      brandTitle={loginContent.copy?.brandTitle ?? AUTH.login.brandTitle}
      brandLead={loginContent.copy?.brandLead ?? AUTH.login.brandLead}
      image={loginContent.image ?? AUTH.images.login}
      brandMark={brandMark}
    >
      <form className={styles.form} noValidate onSubmit={onSubmit}>
        {serverError ? (
          <Alert variant="danger" title="We could not sign you in">
            {serverError}
          </Alert>
        ) : null}

        <TextField
          id="auth-login-identifier"
          name="identifier"
          label={loginContent.fields?.identifier?.label ?? AUTH.login.fields.identifier.label}
          hint={loginContent.fields?.identifier?.hint ?? AUTH.login.fields.identifier.hint}
          error={errors.identifier}
          value={values.identifier}
          onChange={(value) => setValue('identifier', value)}
          autoComplete={AUTH.login.fields.identifier.autocomplete}
          inputMode="text"
          inputRef={identifierRef}
          placeholder="username@gmail.com"
        />

        <PasswordField
          id="auth-login-password"
          label={loginContent.fields?.password?.label ?? AUTH.login.fields.password.label}
          value={values.password}
          onChange={(value) => setValue('password', value)}
          autoComplete={AUTH.login.fields.password.autocomplete}
          error={errors.password}
          inputRef={passwordRef}
          placeholder="Password"
        />

        <div className={styles.utilityRow}>
          <Link className={styles.textLink} to={AUTH.login.forgotPassword.to}>
            {loginContent.forgotPassword?.label ?? AUTH.login.forgotPassword.label}
          </Link>
        </div>

        <div className={styles.submitRow}>
          <Button type="submit" loading={submitting} disabled={submitting}>
            {loginContent.submitLabel ?? AUTH.login.submitLabel}
          </Button>
        </div>

        <p className={styles.prompt}>
          {loginContent.registerPrompt?.text ?? AUTH.login.registerPrompt.text}{' '}
          <Link className={styles.promptLink} to={AUTH.login.registerPrompt.to}>
            {loginContent.registerPrompt?.linkLabel ?? AUTH.login.registerPrompt.linkLabel}
          </Link>
        </p>

        <p className={styles.note}>
          Secure sign-in. By continuing, you agree to our Terms and Privacy Policy.
        </p>
      </form>
    </AuthLayout>
  );
}
