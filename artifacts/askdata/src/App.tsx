import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QuestionStudio } from '@/pages/question-studio';
import { QueryResultsPage } from '@/pages/query-results';
import { ChatbotPage } from '@/pages/chatbot';
import { CsvImportPage } from '@/pages/csv-import';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        {/* Page 1: Question Explorer & Problem Studio */}
        <Route path="/" component={QuestionStudio} />

        {/* Page 2: Query, Code & Interactive Table Results Studio */}
        <Route path="/query" component={QueryResultsPage} />

        {/* Page 3: Real-World SQL & Data AI Chatbot */}
        <Route path="/chat" component={ChatbotPage} />

        {/* Page 4: CSV File Import & Query Generator */}
        <Route path="/import" component={CsvImportPage} />

        {/* 404 Fallback */}
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
