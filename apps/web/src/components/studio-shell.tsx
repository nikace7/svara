'use client';

import Link from 'next/link';
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
import type { ReactNode } from 'react';
import { StatusBadge } from '@svara/ui';

function Navigation() {
  const path = usePathname();
  const items = [
    { label: 'Overview', icon: LayoutDashboard },
    { label: 'Bots', icon: Bot },
    { label: 'Media', icon: Images },
    { label: 'Devices', icon: Monitor },
    { label: 'Events & Deployments', icon: CalendarDays },
    { label: 'Sessions', icon: FileText },
    { label: 'Analytics', icon: ChartNoAxesCombined },
    { label: 'Settings', icon: Settings2 },
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
          <strong>Local workspace</strong>
          <span>Voice & Device Studio</span>
        </div>
      </div>
      <p className="nav-label">WORKSPACE</p>
      <nav aria-label="Main navigation">
        <ul className="nav-list">
          {items.map(({ label, icon: Icon }, index) => (
            <li key={label}>
              {index === 0 ? (
                <Link
                  href="/studio"
                  className="nav-item"
                  aria-label={label}
                  aria-current={path === '/studio' ? 'page' : undefined}
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
  const gallery = usePathname().endsWith('design-system');
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
              <Dialog.Root>
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
                    <Navigation />
                  </Dialog.Popup>
                </Dialog.Portal>
              </Dialog.Root>
            </div>
            <span className="breadcrumb">
              Studio <ChevronRight size={13} aria-hidden="true" />
              <strong>{gallery ? 'Component gallery' : 'Overview'}</strong>
            </span>
          </div>
          <StatusBadge tone="warning">Foundation preview</StatusBadge>
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
