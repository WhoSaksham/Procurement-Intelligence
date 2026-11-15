import { Suspense } from 'react';
import { PageHead } from '@/components/page-head';
import { AskView } from '@/views/ask/AskView';

export const metadata = { title: 'Ask the evidence · Procurement Intelligence' };

export default function Page() {
  return (
    <Suspense fallback={<PageHead title="Ask the evidence" lede="Answers come only from indexed records and documents, and every sentence is checked against its source." />}>
      <AskView />
    </Suspense>
  );
}
