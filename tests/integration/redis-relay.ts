import { once } from 'node:events';
import { connect, createServer, type Socket } from 'node:net';

/** A test-local relay interrupts only its own connections, never the shared Redis service. */
export async function redisRelay(redisUrl: string) {
  const upstream = new URL(redisUrl);
  if (upstream.protocol !== 'redis:')
    throw new Error('Redis relay requires local plaintext Redis.');
  let available = false;
  const sockets = new Set<Socket>();
  const server = createServer((incoming) => {
    if (!available) {
      incoming.destroy();
      return;
    }
    const outgoing = connect({ host: upstream.hostname, port: Number(upstream.port || 6379) });
    for (const socket of [incoming, outgoing]) {
      sockets.add(socket);
      socket.on('error', () => {
        incoming.destroy();
        outgoing.destroy();
      });
      socket.on('close', () => {
        sockets.delete(socket);
        incoming.destroy();
        outgoing.destroy();
      });
    }
    incoming.pipe(outgoing).pipe(incoming);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No Redis relay port.');
  const downstream = new URL(redisUrl);
  downstream.hostname = '127.0.0.1';
  downstream.port = String(address.port);
  return {
    url: downstream.href,
    setAvailable(value: boolean) {
      available = value;
      if (!value) for (const socket of sockets) socket.destroy();
    },
    async close() {
      available = false;
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
