import { handleModels } from './handler.ts'

Deno.serve((req) => handleModels(req, Deno.env.toObject()))
