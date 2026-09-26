import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';
import { PackagesService } from './packages.service';

/** Treatment packages created for a patient after consultation (doctors and admins). */
@ApiTags('packages')
@ApiBearerAuth()
@Controller()
export class PackagesController {
  constructor(private readonly packages: PackagesService) {}

  @Get('patients/:patientId/packages')
  findForPatient(@Param('patientId') patientId: string) {
    return this.packages.forPatient(patientId);
  }

  @Post('patients/:patientId/packages')
  @Roles('Admin', 'Doctor')
  create(
    @Param('patientId') patientId: string,
    @Body() dto: CreatePackageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.packages.create(patientId, dto, user);
  }

  /** Price a package without saving it. */
  @Post('packages/quote')
  quote(@Body() dto: CreatePackageDto) {
    return this.packages.quote(dto);
  }

  @Patch('packages/:id')
  @Roles('Admin', 'Doctor')
  setStatus(@Param('id') id: string, @Body() dto: UpdatePackageDto) {
    return this.packages.setStatus(id, dto.status);
  }
}
