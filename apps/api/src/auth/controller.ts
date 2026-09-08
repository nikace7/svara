import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AUTH_BOUNDARY } from './boundary.js';
import type { StaffBoundary } from './boundary.js';
import { PublicStaff, StaffGuard } from './guard.js';
import {
  AccessLinkResponse,
  ActivateDto,
  CsrfResponse,
  InviteDto,
  LoginDto,
  MemberResponse,
  MembersResponse,
  MemberUpdateDto,
  OrganisationResponse,
  OrganisationUpdateDto,
  RecoverDto,
  RegisterDto,
  ResultResponse,
  StaffSessionResponse,
  SwitchOrganisationDto,
} from './dto.js';

@Controller('auth')
@ApiTags('Staff authentication')
@UseGuards(StaffGuard)
export class AuthController {
  constructor(@Inject(AUTH_BOUNDARY) private readonly boundary: StaffBoundary) {}

  @Post('register')
  @ApiBody({ type: RegisterDto })
  @PublicStaff()
  @ApiCreatedResponse({ type: StaffSessionResponse })
  async register(
    @Body() data: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.boundary.credentials(request, response, async () =>
      this.boundary.issue(response, await this.boundary.settings.service.register(data)),
    );
  }

  @Post('login')
  @ApiBody({ type: LoginDto })
  @HttpCode(200)
  @PublicStaff()
  @ApiOkResponse({ type: StaffSessionResponse })
  async login(
    @Body() data: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.boundary.credentials(request, response, async () =>
      this.boundary.issue(
        response,
        await this.boundary.settings.service.login(data, this.boundary.optionalToken(request)),
      ),
    );
  }

  @Get('session')
  @ApiCookieAuth('staff')
  @ApiOkResponse({ type: StaffSessionResponse })
  session(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return {
      data: { identity: this.boundary.identity(response), csrfToken: this.boundary.csrf(request) },
    };
  }

  @Get('csrf')
  @ApiCookieAuth('staff')
  @ApiOkResponse({ type: CsrfResponse })
  csrf(@Req() request: Request) {
    return { data: { csrfToken: this.boundary.csrf(request) } };
  }

  @Post('logout')
  @HttpCode(200)
  @PublicStaff()
  @ApiCookieAuth('staff')
  @ApiOkResponse({ type: ResultResponse })
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const token = this.boundary.optionalToken(request);
    if (token) {
      this.boundary.checkCsrf(request);
      await this.boundary.settings.service.logout(token);
    }
    this.boundary.clear(response);
    return { data: { ok: true } };
  }

  @Post('organisation')
  @ApiBody({ type: SwitchOrganisationDto })
  @HttpCode(200)
  @ApiCookieAuth('staff')
  @ApiOkResponse({ type: StaffSessionResponse })
  async switchOrganisation(
    @Body() data: SwitchOrganisationDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.boundary.issue(
      response,
      await this.boundary.settings.service.switchOrganisation(
        this.boundary.token(request),
        data.organisationId,
      ),
    );
  }

  @Post('activate')
  @ApiBody({ type: ActivateDto })
  @HttpCode(200)
  @PublicStaff()
  @ApiOkResponse({ type: ResultResponse })
  async activate(
    @Body() data: ActivateDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.boundary.credentials(request, response, () =>
      this.boundary.settings.service.activate(data),
    );
    return { data: { ok: true } };
  }

  @Post('recover')
  @ApiBody({ type: RecoverDto })
  @HttpCode(200)
  @PublicStaff()
  @ApiOkResponse({ type: ResultResponse })
  async recover(
    @Body() data: RecoverDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.boundary.credentials(request, response, () =>
      this.boundary.settings.service.recover(data),
    );
    this.boundary.clear(response);
    return { data: { ok: true } };
  }
}

@Controller('members')
@ApiTags('Memberships')
@UseGuards(StaffGuard)
@ApiCookieAuth('staff')
export class MembersController {
  constructor(@Inject(AUTH_BOUNDARY) private readonly boundary: StaffBoundary) {}

  @Get()
  @ApiOkResponse({ type: MembersResponse })
  async list(@Req() request: Request) {
    return { data: await this.boundary.settings.service.listMembers(this.boundary.token(request)) };
  }

  @Post('invitations')
  @ApiBody({ type: InviteDto })
  @ApiCreatedResponse({ type: AccessLinkResponse })
  async invite(@Body() data: InviteDto, @Req() request: Request) {
    return this.boundary.link(
      'activate',
      await this.boundary.settings.service.invite(this.boundary.token(request), data),
    );
  }

  @Patch(':id')
  @ApiBody({ type: MemberUpdateDto })
  @ApiOkResponse({ type: MemberResponse })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: MemberUpdateDto,
    @Req() request: Request,
  ) {
    return {
      data: await this.boundary.settings.service.updateMember(
        this.boundary.token(request),
        id,
        data,
      ),
    };
  }

  @Post(':id/recovery')
  @ApiCreatedResponse({ type: AccessLinkResponse })
  async recover(@Param('id', ParseUUIDPipe) id: string, @Req() request: Request) {
    return this.boundary.link(
      'recover',
      await this.boundary.settings.service.issueRecovery(this.boundary.token(request), id),
    );
  }
}

@Controller('organisation')
@ApiTags('Organisation')
@UseGuards(StaffGuard)
@ApiCookieAuth('staff')
export class OrganisationController {
  constructor(@Inject(AUTH_BOUNDARY) private readonly boundary: StaffBoundary) {}
  @Patch()
  @ApiBody({ type: OrganisationUpdateDto })
  @ApiOkResponse({ type: OrganisationResponse })
  async update(@Body() data: OrganisationUpdateDto, @Req() request: Request) {
    return {
      data: await this.boundary.settings.service.updateOrganisation(
        this.boundary.token(request),
        data,
      ),
    };
  }
}
