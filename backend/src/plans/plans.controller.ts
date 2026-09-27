import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  CreateTreatmentPlanDto,
  UpdateTreatmentPlanDto,
} from './dto/treatment-plan.dto';
import { PlansService } from './plans.service';

/** Settings → Treatment plans. Open to every signed-in role for now. */
@ApiTags('settings')
@ApiBearerAuth()
@Controller('treatment-plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  findAll() {
    return this.plans.list();
  }

  @Post()
  create(@Body() dto: CreateTreatmentPlanDto, @CurrentUser() user: AuthUser) {
    return this.plans.create(dto, user.name);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTreatmentPlanDto) {
    return this.plans.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    this.plans.remove(id);
  }
}
