'use client';

import { StudioLink as Link } from './draft-navigation';
import { usePathname } from 'next/navigation';
import { Dialog } from '@base-ui/react/dialog';
import {
  AudioLines,
  Bot,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronRight,
  CircleHelp,
  FileText,
  Images,
  LayoutDashboard,
  Menu,
  Monitor,
  Settings2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { StatusBadge } from '@svara/ui';
import { useStaffSession } from './session-provider';

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const { identity } = useStaffSession();
  const items = [
    { label: 'Overview', icon: LayoutDashboard, href: '/studio' },
    { label: 'Bots', icon: Bot, href: '/studio/bots' },
    { label: 'Media', icon: Images },
    { label: 'Devices', icon: Monitor },
    { label: 'Events & Deployments', icon: CalendarDays },
    { label: 'Sessions', icon: FileText },
    { label: 'Analytics', icon: ChartNoAxesCombined },
    { label: 'Settings', icon: Settings2, href: '/studio/settings' },
  ];
  return (
    <>
      <Link href="/studio" className="wordmark" aria-label="Svara overview">
        <AudioLines size={29} strokeWidth={1.8} aria-hidden="true" />
        Svara<span className="wordmark-dot">.</span>
      </Link>
      <div className="workspace-label">
        <span className="workspace-icon">S</span>
        <div>
          <strong>{identity.organisation.name}</strong>
          <span>Voice & Device Studio</span>
        </div>
      </div>
      <p className="nav-label">WORKSPACE</p>
      <nav aria-label="Main navigation">
        <ul className="nav-list">
          {items.map(({ label, icon: Icon, href }) => (
            <li key={label}>
              {href ? (
                <Link
                  href={href}
                  onClick={() => onNavigate?.()}
                  className="nav-item"
                  aria-label={label}
                  aria-current={
                    path === href || (href !== '/studio' && path.startsWith(`${href}/`))
                      ? 'page'
                      : undefined
                  }
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              ) : (
                <span
                  className="nav-item nav-item--planned"
                  aria-disabled="true"
                  title="Available in a later milestone"
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{label}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      </nav>
      <div className="sidebar-bottom">
        <Link
          href="/studio/voice-lab"
          onClick={() => onNavigate?.()}
          className="nav-item"
          aria-label="Voice lab"
          aria-current={path === '/studio/voice-lab' ? 'page' : undefined}
        >
          <AudioLines size={18} aria-hidden="true" />
          <span>Voice lab</span>
        </Link>
        <a href="/api/docs" className="nav-item" aria-label="API reference">
          <CircleHelp size={18} aria-hidden="true" />
          <span>API reference</span>
        </a>
        <div className="sidebar-mode">
          <span className="mode-dot" />
          <div>
            <strong>Fixture mode</strong>
            <span>No external provider calls</span>
          </div>
        </div>
      </div>
    </>
  );
}

export function StudioShell({ children }: { children: ReactNode }) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const pathname = usePathname();
  const gallery = pathname.endsWith('design-system');
  const voiceLab = pathname.endsWith('voice-lab');
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <Navigation />
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="topbar-leading">
            <div className="mobile-nav">
              <Dialog.Root open={navigationOpen} onOpenChange={setNavigationOpen}>
                <Dialog.Trigger
                  className="button button--quiet icon-button"
                  aria-label="Open navigation"
                >
                  <Menu size={20} aria-hidden="true" />
                </Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Backdrop className="dialog-backdrop" />
                  <Dialog.Popup className="mobile-nav-popup">
                    <Dialog.Title className="sr-only">Workspace navigation</Dialog.Title>
                    <Dialog.Close
                      className="button button--quiet dialog-close"
                      aria-label="Close navigation"
                    >
                      <X size={20} aria-hidden="true" />
                    </Dialog.Close>
                    <Navigation onNavigate={() => setNavigationOpen(false)} />
                  </Dialog.Popup>
                </Dialog.Portal>
              </Dialog.Root>
            </div>
            <span className="breadcrumb">
              Studio <ChevronRight size={13} aria-hidden="true" />
              <strong>
                {gallery
                  ? 'Component gallery'
                  : voiceLab
                    ? 'Voice lab'
                    : pathname.startsWith('/studio/bots')
                      ? 'Bots'
                      : pathname.endsWith('settings')
                        ? 'Settings'
                        : 'Overview'}
              </strong>
            </span>
          </div>
          <StatusBadge tone="accent">Demo workspace</StatusBadge>
        </header>
        <main id="main-content" className="workspace" tabIndex={-1}>
          {children}
        </main>
        <footer className="workspace-footer">
          <span>
            Svara <span aria-hidden="true">/</span> Local development
          </span>
          <Link href="/studio/design-system">
            Component gallery <ChevronRight size={13} aria-hidden="true" />
          </Link>
        </footer>
      </div>
    </div>
  );
}
