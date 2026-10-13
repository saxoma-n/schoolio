import { handleChat } from './handler.ts'

Deno.serve((req) => handleChat(req, Deno.env.toObject()))
