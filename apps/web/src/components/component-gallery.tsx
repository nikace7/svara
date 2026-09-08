'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button, DataTable, FormField, StatusBadge, StudioDialog } from '@svara/ui';

const sampleSchema = z.object({
  name: z.string().trim().min(1, 'Enter a device name.').max(80, 'Use 80 characters or fewer.'),
});
const samples = [
  { id: 'lobby', name: 'Lobby Kiosk', state: 'Applied', revision: 'r03', tone: 'success' as const },
  {
    id: 'registration',
    name: 'Registration Kiosk',
    state: 'Downloading',
    revision: 'r02 → r03',
    tone: 'warning' as const,
  },
  {
    id: 'welcome',
    name: 'Welcome Display',
    state: 'Offline',
    revision: 'r01',
    tone: 'neutral' as const,
  },
];

export function ComponentGallery() {
  const [validated, setValidated] = useState(false);
  const [search, setSearch] = useState('');
  const [descending, setDescending] = useState(false);
  const [page, setPage] = useState(0);
  const form = useForm<z.infer<typeof sampleSchema>>({
    resolver: zodResolver(sampleSchema),
    defaultValues: { name: '' },
  });
  const matches = samples
    .filter((row) => row.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (descending ? -1 : 1) * a.name.localeCompare(b.name));
  const pageCount = Math.max(1, Math.ceil(matches.length / 2));
  return (
    <>
      <Link className="back-link" href="/studio">
        <ArrowLeft size={15} aria-hidden="true" />
        Back to overview
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SVARA / DESIGN FOUNDATION</p>
          <h1>Component gallery</h1>
          <p className="page-description">Quiet surfaces. Clear actions. Room for two languages.</p>
        </div>
        <StatusBadge tone="accent">Local QA preview</StatusBadge>
      </div>
      <div className="gallery-grid">
        <section className="panel gallery-section">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">01 / ACTIONS</p>
              <h2>Buttons & feedback</h2>
            </div>
          </div>
          <div className="gallery-content">
            <div className="button-samples">
              <Button variant="primary">
                <Plus size={16} aria-hidden="true" />
                Primary action
              </Button>
              <Button>Secondary</Button>
              <Button variant="quiet">Quiet action</Button>
              <Button variant="destructive">
                <Trash2 size={16} aria-hidden="true" />
                Destructive
              </Button>
              <Button pending>Saving sample</Button>
            </div>
            <p className="small muted">
              Button variants are visual samples. Saving is a disabled pending-state sample.
            </p>
            <div className="sample-divider" />
            <p className="sample-label">Meaning stays visible in every state</p>
            <div className="badge-samples">
              <StatusBadge tone="success">Applied</StatusBadge>
              <StatusBadge tone="warning">Downloading</StatusBadge>
              <StatusBadge tone="danger">Failed</StatusBadge>
              <StatusBadge>Offline</StatusBadge>
              <StatusBadge tone="accent">Fixture</StatusBadge>
            </div>
          </div>
        </section>
        <section className="panel gallery-section">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">02 / INPUT</p>
              <h2>Labels that stay with you</h2>
            </div>
          </div>
          <form
            className="gallery-content"
            noValidate
            onSubmit={form.handleSubmit(() => setValidated(true))}
            onChange={() => setValidated(false)}
          >
            <FormField
              label="Device name"
              help="Give your kiosk a name people will recognise."
              required
              {...form.register('name')}
              error={form.formState.errors.name?.message}
              placeholder="e.g. Lobby Kiosk"
            />
            <div className="form-actions">
              <Button variant="primary" type="submit">
                Validate sample
              </Button>
              <span role="status" className="validation-status">
                {validated && (
                  <>
                    <Check size={16} aria-hidden="true" />
                    Sample validated
                  </>
                )}
              </span>
            </div>
            <p className="small muted">Validation only. This sample does not create a device.</p>
          </form>
        </section>
        <section className="panel gallery-section gallery-table">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">03 / OPERATIONS</p>
              <h2>Readable at a glance</h2>
            </div>
            <StatusBadge>Sample data</StatusBadge>
          </div>
          <div className="table-toolbar">
            <FormField
              label="Search sample devices"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
              placeholder="Search by name"
            />
          </div>
          <DataTable
            caption="Component sample devices; these are not paired devices"
            rows={matches.slice(page * 2, page * 2 + 2)}
            columns={[
              {
                key: 'name',
                label: (
                  <button className="table-sort" onClick={() => setDescending(!descending)}>
                    Device name
                    <ArrowUpDown size={13} aria-hidden="true" />
                  </button>
                ),
                render: (row) => <strong>{row.name}</strong>,
              },
              {
                key: 'state',
                label: 'Release state',
                render: (row) => <StatusBadge tone={row.tone}>{row.state}</StatusBadge>,
              },
              {
                key: 'revision',
                label: 'Revision',
                render: (row) => <span className="mono">{row.revision}</span>,
              },
            ]}
          />
          <div className="panel-footer">
            <span className="small muted">Component samples only · {matches.length} results</span>
            <div className="pagination">
              <Button
                variant="quiet"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                aria-label="Previous sample page"
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </Button>
              <span className="small">
                {page + 1} / {pageCount}
              </span>
              <Button
                variant="quiet"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage(page + 1)}
                aria-label="Next sample page"
              >
                <ChevronRight size={16} aria-hidden="true" />
              </Button>
            </div>
          </div>
        </section>
        <section className="panel gallery-section">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">04 / LANGUAGE</p>
              <h2>Equally at home</h2>
            </div>
            <span className="mono small muted">EN / NE</span>
          </div>
          <div className="gallery-content language-sample">
            <span className="sample-label">VISITOR COPY · TYPOGRAPHY SAMPLE</span>
            <p className="sample-english">Every question is a welcome beginning.</p>
            <p lang="ne">
              हिमाल क्याम्पस आगन्तुक केन्द्रमा तपाईंलाई स्वागत छ। भर्नासम्बन्धी जानकारीका लागि
              सोध्नुहोस्।
            </p>
            <p className="small muted">
              Synthetic content. Nepali copy awaits native-speaker review.
            </p>
          </div>
        </section>
        <section className="panel gallery-section">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">05 / FOCUS</p>
              <h2>A moment to consider</h2>
            </div>
          </div>
          <div className="gallery-content">
            <p className="muted">
              A labelled dialog keeps the next action clear and returns you to where you started.
            </p>
            <StudioDialog
              triggerLabel="Open sample dialog"
              title="A considered confirmation"
              description="This is a component sample. No workspace data will change."
            >
              <p>
                Keyboard focus stays inside this dialog. Press Escape to close it and return to the
                trigger.
              </p>
            </StudioDialog>
          </div>
        </section>
      </div>
    </>
  );
}
