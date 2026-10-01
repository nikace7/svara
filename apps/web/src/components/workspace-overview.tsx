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
import type { components, DeviceSummary } from '@svara/contracts';
import { staffResponse } from '../lib/staff-api';
import { StudioLink } from './draft-navigation';
import { useStaffSession } from './session-provider';

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
  const { identity } = useStaffSession();
  // The same query as the Devices page, so both read one cache.
  const devices = useQuery({
    queryKey: ['devices', identity.membership.id],
    queryFn: async ({ signal }) =>
      (
        (await (await staffResponse('/devices?limit=100', { signal })).json()) as {
          data: DeviceSummary[];
        }
      ).data,
    refetchInterval: 10000,
  });
  const paired = devices.data?.filter((device) => device.paired) ?? [];
  const online = paired.filter((device) => device.connection === 'ONLINE').length;
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
          <strong>Your studio is ready.</strong> <span>Staff access is ready</span>
          <p>
            Author bilingual guides, publish a fixed version, pair browser kiosks and let visitors
            ask by voice or text, in English or Nepali.
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
                text: 'Bilingual voice lab, PCM audio checks and interruption. Hardware barge-in untested.',
                state: 'Live evidence partial',
              },
              {
                title: 'Identity & access',
                text: 'Staff accounts, roles and separate organisation workspaces.',
                state: 'Complete',
              },
              {
                title: 'Authoring & publication',
                text: 'Bilingual knowledge, inspected media, presentations and immutable releases.',
                state: 'Complete',
              },
              {
                title: 'Pair & deploy',
                text: 'Paired browser kiosks, dual displays and acknowledged release updates.',
                state: 'Complete',
              },
              {
                title: 'Schedules & conversations',
                text: 'Timed deployments, grounded answers, kiosk slides and public assistant links.',
                state: 'Complete',
              },
              {
                title: 'Operations & evidence',
                text: 'Measured timings, backup and restore, and a fixed bilingual evaluation.',
                state: 'Complete',
              },
            ].map((step, index) => (
              <li key={step.title}>
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
          <StatusBadge tone={online ? 'success' : 'neutral'}>
            {devices.isPending ? 'Checking devices' : `${paired.length} paired · ${online} online`}
          </StatusBadge>
        </div>
        <div className="fleet-empty">
          <div className="empty-device" aria-hidden="true">
            <Monitor size={60} strokeWidth={1} />
            <span>
              <AudioLines size={19} />
            </span>
          </div>
          <div>
            {paired.length ? (
              <>
                <h3>
                  {online} of {paired.length} paired {paired.length === 1 ? 'kiosk' : 'kiosks'}{' '}
                  online
                </h3>
                <p>{paired.map((device) => device.name).join(' · ')}</p>
              </>
            ) : (
              <>
                <h3>No devices paired</h3>
                <p>
                  Once your assistant is published, pair a browser kiosk and bring its voice to your
                  space.
                </p>
              </>
            )}
            <p className="small muted">Presence comes from each kiosk&rsquo;s heartbeat.</p>
          </div>
          <StudioLink href="/studio/devices" className="fleet-direction" aria-label="Open devices">
            <ArrowRight size={22} aria-hidden="true" />
          </StudioLink>
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
