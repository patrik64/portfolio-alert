import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { api } from './server/api';

export const handle: Handle = sequence(api);
