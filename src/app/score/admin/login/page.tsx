import Link from 'next/link';
import { AdminSessionLoginForm } from '@/components/admin/AdminSessionLoginForm';

export const dynamic = 'force-dynamic';

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function safeNextPath(value: unknown) {
  if (typeof value !== 'string') return '/score/admin';
  return value === '/score/admin' || value.startsWith('/score/admin/') ? value : '/score/admin';
}

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : {};
  const nextPath = safeNextPath(params.next);

  return (
    <main className="min-h-[calc(100vh-5rem)] border-t border-mk-line bg-gradient-to-br from-mk-cream via-white to-mk-cream px-6 py-16">
      <div className="mx-auto max-w-md">
        <div className="rounded-[1.6rem] border border-mk-line bg-white p-8 shadow-[0_24px_70px_rgba(0,16,48,0.10)]">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-mk-brassDark">MK Fraud Insights</p>
          <h1 className="mt-4 text-3xl font-semibold text-mk-ink">Admin sign in</h1>
          <p className="mt-3 text-sm leading-6 text-mk-muted">Sign in with your approved MK administrator account to generate or download assessment reports.</p>
          <div className="mt-8">
            <AdminSessionLoginForm nextPath={nextPath} />
          </div>
          <Link href="/score/admin" className="mt-6 inline-block text-sm font-semibold text-mk-muted hover:text-mk-ink">Return to the control room</Link>
        </div>
      </div>
    </main>
  );
}
