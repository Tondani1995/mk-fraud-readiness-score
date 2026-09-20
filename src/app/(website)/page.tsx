import HomePage from '@/app/(website)/home/page';

export const revalidate = 3600;

export default function Home() {
  return <HomePage />;
}
