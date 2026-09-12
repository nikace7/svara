'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowRight,
  AudioLines,
  Check,
  Circle,
  Database,
  HardDrive,
  Layers3,
  Monitor,
  RefreshCw,
  Server,
  Workflow,
} from 'lucide-react';
import { Button, StatusBadge } from '@svara/ui';
import type { components } from '@svara/contracts';
import { StudioLink } from './draft-navigation';

type HealthResponse = components['schemas']['HealthResponse'];

async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/v1/health/ready', {
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });
  if (response.status !== 200 && response.status !== 503)
    throw new Error('The API health check is unavailable.');
  return response.json() as Promise<HealthResponse>;
}

export function WorkspaceOverview() {
  const health = useQuery({
    queryKey: ['health', 'ready'],
    queryFn: fetchHealth,
    refetchInterval: 15000,
  });
  const ready = health.data?.data.status === 'ready' && !health.isError;
  const services = [
    {
      key: 'database',
      label: 'PostgreSQL',
      description: 'Durable application data',
      icon: Database,
    },
    { key: 'redis', label: 'Redis', description: 'Coordination & delivery', icon: Layers3 },
    { key: 'media', label: 'Media storage', description: 'Shared local volume', icon: HardDrive },
    {
      key: 'worker',
      label: 'Background worker',
      description: 'Dependency heartbeat',
      icon: Workflow,
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">VOICE & DEVICE STUDIO</p>
          <h1>Workspace overview</h1>
          <p className="page-description">A place for every voice. A clear view of every device.</p>
        </div>
        <a href="#build-sequence" className="button button--secondary">
          Build sequence <ArrowDown size={16} aria-hidden="true" />
        </a>
      </div>
      <div className="preview-notice">
        <AudioLines size={19} aria-hidden="true" />
        <div>
          <strong>Your studio is taking shape.</strong> <span>Staff access is ready</span>
          <p>
            Author bilingual guides, review their knowledge and publish a fixed version. Live voice
            and device pairing are the next parts of the studio.
          </p>
        </div>
        <StudioLink href="/studio/bots" className="button button--secondary">
          Open bots
        </StudioLink>
      </div>
      <div className="overview-grid">
        <section className="panel runtime-panel" aria-labelledby="runtime-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">SYSTEM</p>
              <h2 id="runtime-title">A connected foundation</h2>
            </div>
            <Server size={22} className="muted" aria-hidden="true" />
          </div>
          <div className="runtime-summary" role="status">
            <span className={`health-orb ${ready ? 'health-orb--ready' : ''}`}>
              {ready ? (
                <Check size={23} aria-hidden="true" />
              ) : (
                <Circle size={23} aria-hidden="true" />
              )}
            </span>
            <div>
              <strong>
                {health.isPending
                  ? 'Checking local services'
                  : ready
                    ? 'All services ready'
                    : 'Services need attention'}
              </strong>
              <p>
                {ready
                  ? 'The API can reach every local dependency.'
                  : 'Health comes from the running API, never sample data.'}
              </p>
            </div>
          </div>
          <div className="service-list">
            {services.map(({ key, label, description, icon: Icon }) => {
              const state = health.isError ? undefined : health.data?.data.dependencies?.[key];
              return (
                <div className="service-row" key={key}>
                  <Icon size={19} className="muted" aria-hidden="true" />
                  <div>
                    <strong>{label}</strong>
                    <p>{description}</p>
                  </div>
                  <StatusBadge
                    tone={
                      state === 'ready' ? 'success' : state === 'unavailable' ? 'danger' : 'neutral'
                    }
                  >
                    {state === 'ready'
                      ? 'Ready'
                      : state === 'unavailable'
                        ? 'Unavailable'
                        : 'Unknown'}
                  </StatusBadge>
                </div>
              );
            })}
          </div>
          <div className="panel-footer">
            <span className="small muted">
              {health.isError
                ? 'Could not reach the API. Try again.'
                : 'Checks refresh every 15 seconds'}
            </span>
            <Button
              variant="quiet"
              onClick={() => {
                void health.refetch();
              }}
              pending={health.isFetching}
            >
              <RefreshCw size={14} aria-hidden="true" />
              Check services
            </Button>
          </div>
        </section>
        <section className="sequence-panel" id="build-sequence" aria-labelledby="sequence-title">
          <p className="eyebrow">FROM FOUNDATION TO FIRST CONVERSATION</p>
          <h2 id="sequence-title">Build sequence</h2>
          <p className="muted sequence-intro">
            Small, verified steps towards a complete bilingual studio.
          </p>
          <ol className="build-steps">
            {[
              {
                title: 'Workspace foundation',
                text: 'Shared contracts, local services and accessible components.',
                state: 'Complete',
              },
              {
                title: 'Bilingual voice feasibility',
                text: 'Bilingual fixture lab, PCM audio checks and interruption. Live validation pending.',
                state: 'Fixture ready',
              },
              {
                title: 'Identity & access',
                text: 'Staff accounts, roles and separate organisation workspaces.',
                state: 'Staff flows ready',
              },
              {
                title: 'Authoring & publication',
                text: 'Bilingual knowledge, inspected media, presentations and immutable releases.',
                state: 'Authoring ready',
              },
              {
                title: 'Pair & deploy',
                text: 'Paired browser kiosks, dual displays and acknowledged release updates.',
                state: 'Planned',
              },
            ].map((step, index) => (
              <li key={step.title} className={index === 4 ? 'step-current' : ''}>
                <span className="step-number mono">0{index + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                  <span className="step-state">{step.state}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <section className="panel fleet-panel" aria-labelledby="fleet-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">BROWSER KIOSKS</p>
            <h2 id="fleet-title">Device fleet</h2>
          </div>
          <StatusBadge>Pairing not available yet</StatusBadge>
        </div>
        <div className="fleet-empty">
          <div className="empty-device" aria-hidden="true">
            <Monitor size={60} strokeWidth={1} />
            <span>
              <AudioLines size={19} />
            </span>
          </div>
          <div>
            <h3>No devices paired</h3>
            <p>
              Once your assistant is published, pair a browser kiosk and bring its voice to your
              space.
            </p>
            <p className="small muted">
              Device pairing follows staff access and release publishing.
            </p>
          </div>
          <span className="fleet-direction" aria-hidden="true">
            <ArrowRight size={22} />
          </span>
        </div>
      </section>
      <div className="architecture-note">
        <span className="architecture-mark">
          <AudioLines size={21} aria-hidden="true" />
        </span>
        <p>
          <strong>One pipeline. Two languages.</strong>
          <span>
            English and Nepali share the same release, knowledge and conversation contracts.
          </span>
        </p>
        <span lang="ne" className="nepali-signoff">
          हरेक आवाजको आफ्नै ठाउँ।
        </span>
      </div>
    </>
  );
}
