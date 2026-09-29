import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import {
  BarChart3,
  Bot,
  Database,
  FileSpreadsheet,
  Menu,
  MessageSquare,
  Search,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import { useHealthCheck } from '@workspace/api-client-react';

export function Navbar({ onToggleSchema }: { onToggleSchema?: () => void }) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const healthQuery = useHealthCheck();

  const navLinks = [
    { href: '/', label: 'Ask & Explore', icon: Search, badge: 'Page 1' },
    { href: '/query', label: 'Query & Code Studio', icon: Terminal, badge: 'Page 2' },
    { href: '/import', label: 'Import CSV', icon: FileSpreadsheet, badge: 'New' },
    { href: '/chat', label: 'AI SQL Chatbot', icon: Bot, badge: 'AI Mentor' },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur-md">
      <div className="mx-auto flex h-[68px] max-w-[1640px] items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <Link href="/" className="group flex items-center gap-3 transition-opacity hover:opacity-90">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-md shadow-primary/20 transition-transform group-hover:scale-105">
              <BarChart3 className="size-5" strokeWidth={2.4} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-[21px] font-bold tracking-tight text-foreground">
                  Patient Tech Mentor
                </span>
                <span className="hidden rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 font-code text-[10px] font-semibold text-primary sm:inline-block">
                  SQL Studio
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">Natural Language → Safe SQL & Live Data</p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive =
                link.href === '/' ? location === '/' : location.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-all ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <Icon className="size-4" />
                  <span>{link.label}</span>
                  {link.badge && !isActive && (
                    <span className="rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-medium text-accent-foreground">
                      {link.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          {/* Health Status */}
          <div className="hidden items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1.5 text-[11px] font-medium text-muted-foreground shadow-sm sm:flex">
            <span
              className={`size-2 rounded-full ${
                healthQuery.isError
                  ? 'bg-destructive ring-2 ring-destructive/20'
                  : 'bg-emerald-500 ring-2 ring-emerald-500/20'
              }`}
            />
            <span>
              {healthQuery.isLoading
                ? 'Connecting to DB...'
                : healthQuery.isError
                ? 'DB Offline'
                : 'Database Connected'}
            </span>
          </div>

          {/* Schema Drawer Toggle (if handler provided) */}
          {onToggleSchema && (
            <button
              type="button"
              onClick={onToggleSchema}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Toggle Database Schema View"
            >
              <Database className="size-3.5 text-primary" />
              <span className="hidden sm:inline">Schema</span>
            </button>
          )}

          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown Menu */}
      {mobileMenuOpen && (
        <div className="border-b border-border bg-card px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-1.5">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive =
                link.href === '/' ? location === '/' : location.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between rounded-lg px-3.5 py-2.5 text-[13px] font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="size-4" />
                    <span>{link.label}</span>
                  </div>
                  {link.badge && (
                    <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] text-accent-foreground">
                      {link.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
