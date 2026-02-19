import { Response } from 'express';

// Connected SSE clients
const clients = new Set<Response>();

/**
 * Register an SSE client connection.
 */
export function addClient(res: Response) {
  clients.add(res);
  res.on('close', () => {
    clients.delete(res);
  });
}

/**
 * Broadcast an event to all connected SSE clients.
 */
export function broadcast(event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }
}

export function getClientCount(): number {
  return clients.size;
}
