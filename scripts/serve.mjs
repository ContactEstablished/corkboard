// Starts the Vite dev server programmatically. Unlike the `vite` CLI it does not
// exit when stdin closes, which is what test runners / CI hand to child processes.
import { createServer } from 'vite'

const server = await createServer({ server: { port: 5173, strictPort: true } })
await server.listen()
server.printUrls()
