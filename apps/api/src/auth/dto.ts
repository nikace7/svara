import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsString,
  IsTimeZone,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

const roles = ['OWNER', 'ADMINISTRATOR', 'OPERATOR', 'VIEWER'] as const;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const email = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class LoginDto {
  @ApiProperty({ format: 'email', maxLength: 254 })
  @Transform(email)
  @IsEmail({ allow_utf8_local_part: false })
  @Length(1, 254)
  email!: string;
  @ApiProperty({ minLength: 1, maxLength: 128, writeOnly: true })
  @IsString()
  @Length(1, 128)
  password!: string;
}
export class RegisterDto extends LoginDto {
  @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
  @Length(12, 128)
  override password = '';
  @ApiProperty({ minLength: 1, maxLength: 160 })
  @Transform(trim)
  @IsString()
  @Length(1, 160)
  displayName!: string;
  @ApiProperty({ minLength: 1, maxLength: 160 })
  @Transform(trim)
  @IsString()
  @Length(1, 160)
  organisationName!: string;
}
export class InviteDto {
  @ApiProperty({ format: 'email', maxLength: 254 })
  @Transform(email)
  @IsEmail({ allow_utf8_local_part: false })
  @Length(1, 254)
  email!: string;
  @ApiProperty({ enum: roles })
  @IsIn(roles)
  role!: (typeof roles)[number];
}
export class RecoverDto {
  @ApiProperty({ pattern: '^[A-Za-z0-9_-]{43}$', writeOnly: true })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  token!: string;
  @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
  @IsString()
  @Length(12, 128)
  password!: string;
}
export class ActivateDto extends RecoverDto {
  @ApiProperty({ minLength: 1, maxLength: 160 })
  @Transform(trim)
  @IsString()
  @Length(1, 160)
  displayName!: string;
}
export class SwitchOrganisationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  organisationId!: string;
}
export class MemberUpdateDto {
  @ApiProperty({ enum: roles })
  @IsIn(roles)
  role!: (typeof roles)[number];
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}
export class OrganisationUpdateDto {
  @ApiProperty({ minLength: 1, maxLength: 160 })
  @Transform(trim)
  @IsString()
  @Length(1, 160)
  name!: string;
  @ApiProperty({ maxLength: 64 })
  @IsString()
  @Length(1, 64)
  @IsTimeZone()
  timezone!: string;
}

export class StaffUserDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'email' }) email!: string;
  @ApiProperty() displayName!: string;
}
export class OrganisationBriefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
}
export class OrganisationDto extends OrganisationBriefDto {
  @ApiProperty() timezone!: string;
}
export class MembershipBriefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: roles }) role!: (typeof roles)[number];
}
export class AvailableMembershipDto extends MembershipBriefDto {
  @ApiProperty({ type: OrganisationBriefDto }) organisation!: OrganisationBriefDto;
}
export class StaffIdentityDto {
  @ApiProperty({ type: StaffUserDto }) user!: StaffUserDto;
  @ApiProperty({ type: MembershipBriefDto }) membership!: MembershipBriefDto;
  @ApiProperty({ type: OrganisationDto }) organisation!: OrganisationDto;
  @ApiProperty({ type: [AvailableMembershipDto] }) memberships!: AvailableMembershipDto[];
}
export class StaffSessionData {
  @ApiProperty({ type: StaffIdentityDto }) identity!: StaffIdentityDto;
  @ApiProperty() csrfToken!: string;
}
export class StaffSessionResponse {
  @ApiProperty({ type: StaffSessionData }) data!: StaffSessionData;
}
export class CsrfData {
  @ApiProperty() csrfToken!: string;
}
export class CsrfResponse {
  @ApiProperty({ type: CsrfData }) data!: CsrfData;
}
export class ResultData {
  @ApiProperty() ok!: boolean;
}
export class ResultResponse {
  @ApiProperty({ type: ResultData }) data!: ResultData;
}
export class StaffMemberDto extends MembershipBriefDto {
  @ApiProperty() enabled!: boolean;
  @ApiProperty({ type: StaffUserDto }) user!: StaffUserDto;
}
export class MembersResponse {
  @ApiProperty({ type: [StaffMemberDto] }) data!: StaffMemberDto[];
}
export class MemberResponse {
  @ApiProperty({ type: StaffMemberDto }) data!: StaffMemberDto;
}
export class OrganisationResponse {
  @ApiProperty({ type: OrganisationDto }) data!: OrganisationDto;
}
export class AccessLinkData {
  @ApiProperty({
    format: 'uri',
    description: 'One-use activation/recovery link, returned once. Token is in the fragment.',
  })
  url!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
}
export class AccessLinkResponse {
  @ApiProperty({ type: AccessLinkData }) data!: AccessLinkData;
}
