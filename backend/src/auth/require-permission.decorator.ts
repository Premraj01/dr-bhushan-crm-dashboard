import { SetMetadata } from '@nestjs/common';
import type { Action, Module } from './permissions';

export const PERMISSION_KEY = 'permission';

export interface RequiredPermission {
  module: Module;
  action: string;
}

/**
 * Restricts a route (or every route of a controller) to roles granted this
 * action (see `permissions.ts`). A method-level decorator overrides the class one.
 *
 *   @RequirePermission('patients', 'delete')
 */
export const RequirePermission = <M extends Module>(
  module: M,
  action: Action<M>,
) =>
  SetMetadata(PERMISSION_KEY, { module, action } satisfies RequiredPermission);
