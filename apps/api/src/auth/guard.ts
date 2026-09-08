import { Inject, Injectable, SetMetadata } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_BOUNDARY } from './boundary.js';
import type { StaffBoundary } from './boundary.js';

const PUBLIC_STAFF = 'public-staff-endpoint';
export const PublicStaff = () => SetMetadata(PUBLIC_STAFF, true);
const MULTIPART_STAFF = 'multipart-staff-endpoint';
export const MultipartStaff = () => SetMetadata(MULTIPART_STAFF, true);

@Injectable()
export class StaffGuard implements CanActivate {
  constructor(
    @Inject(AUTH_BOUNDARY) private readonly boundary: StaffBoundary,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.boundary.authorize(
      context.switchToHttp().getRequest(),
      context.switchToHttp().getResponse(),
      this.reflector.getAllAndOverride<boolean>(PUBLIC_STAFF, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false,
      this.reflector.get<boolean>(MULTIPART_STAFF, context.getHandler())
        ? 'multipart/form-data'
        : 'application/json',
    );
    return true;
  }
}
