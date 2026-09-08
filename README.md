# Svara — Voice & Device Studio

A bilingual English/Nepali visitor assistant and browser kiosk management studio.
Svara is an independent implementation using synthetic organisations and content.

## Build status

Implementation is starting with **M0: workspace and component foundation**.
Voice, authentication, authoring and device operations are subsequent milestones;
their behavior is specified, not implemented yet.

## Architecture

- `apps/web`: Next.js studio, visitor and simulator layouts.
- `apps/api`: modular NestJS HTTP and Socket.IO application.
- `apps/worker`: background job and reconciliation process.
- `packages`: contracts, database, domain, providers, browser audio, UI and configuration.
- PostgreSQL is durable truth; Redis coordinates jobs, tickets and leases.
- Azure Speech → approved release knowledge → OpenAI Responses → Azure Speech is
  the planned live pipeline. Fixture mode is the default and makes no provider calls.

See [the architecture decisions](docs/DECISIONS.md),
[implementation progress](docs/PROGRESS.md) and
[the supplied specification](docs/01-robot-voice.md).

## Development

The reproducible setup and verification commands will be documented as they are
implemented. See [contributing](CONTRIBUTING.md) for the Git workflow.
