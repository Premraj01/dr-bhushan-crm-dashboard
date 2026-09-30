import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from './auth-user';
import { can, type Action, type Module } from './permissions';
import {
  PERMISSION_KEY,
  type RequiredPermission,
} from './require-permission.decorator';

/** Registered globally after JwtAuthGuard; enforces `@RequirePermission()`. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const required = this.reflector.getAllAndOverride<
      RequiredPermission | undefined
    >(PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (!required) return true;
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    return can(user, required.module, required.action as Action<Module>);
  }
}
