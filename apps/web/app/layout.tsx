import type { Metadata } from 'next';
import { Public_Sans, Source_Serif_4 } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { EvidenceSheet } from '@/components/evidence/EvidenceSheet';
import { CommandPalette } from '@/components/shell/CommandPalette';
import { DataControls, ImportInput } from '@/components/shell/DataControls';
import { KeyNav } from '@/components/shell/KeyNav';
import { PackageBar } from '@/components/shell/PackageBar';
import { Rail } from '@/components/shell/Rail';
import { ScenarioHydrator } from '@/components/shell/ScenarioHydrator';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';

const sans = Public_Sans({ variable: '--font-public-sans', subsets: ['latin'] });
const serif = Source_Serif_4({ variable: '--font-source-serif', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Procurement Intelligence',
  description: 'Procurement intelligence on World Bank open data: forecasts, tender checks, execution signals and a live knowledge graph, every number cited.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${serif.variable} antialiased`}>
      <body className="min-h-dvh">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          <TooltipProvider>
            <div className="min-h-dvh lg:grid lg:grid-cols-[var(--rail-w)_minmax(0,1fr)]">
              <Rail footer={<DataControls />} />
              <div className="flex min-w-0 flex-col">
                <PackageBar />
                <main id="main" className="w-full max-w-[1280px] flex-1 px-4 pt-6 pb-16 md:px-8">
                  {children}
                </main>
              </div>
            </div>
            <ScenarioHydrator />
            <KeyNav />
            <CommandPalette />
            <EvidenceSheet />
            <ImportInput />
            <Toaster position="bottom-center" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
